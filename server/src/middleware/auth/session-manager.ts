import { Request } from 'express';
import redis from 'redis';

export interface SessionData {
  userId: string;
  sessionId: string;
  createdAt: Date;
  lastActivity: Date;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

export interface SessionOptions {
  maxSessions?: number;
  sessionTimeout?: number;
  trackActivity?: boolean;
  requireUniqueDevice?: boolean;
}

export class SessionManager {
  private redisClient: any;
  private sessionEnabled: boolean;
  private options: Required<SessionOptions>;

  constructor(options: SessionOptions = {}) {
    this.sessionEnabled = process.env.REDIS_URL ? true : false;
    this.options = {
      maxSessions: options.maxSessions || 5,
      sessionTimeout: options.sessionTimeout || 3600, // 1 hour
      trackActivity: options.trackActivity ?? true,
      requireUniqueDevice: options.requireUniqueDevice ?? false
    };

    if (this.sessionEnabled) {
      this.initializeRedis();
    }
  }

  private initializeRedis(): void {
    try {
      this.redisClient = redis.createClient({
        url: process.env.REDIS_URL
      });
      
      this.redisClient.on('error', (err: Error) => {
        console.error('Session Redis Client Error:', err);
        this.sessionEnabled = false;
      });
      
      this.redisClient.connect();
    } catch (error) {
      console.error('Failed to initialize Session Redis:', error);
      this.sessionEnabled = false;
    }
  }

  async createSession(userId: string, req: Request): Promise<string | null> {
    if (!this.sessionEnabled) return null;

    try {
      const sessionId = this.generateSessionId();
      const sessionData: SessionData = {
        userId,
        sessionId,
        createdAt: new Date(),
        lastActivity: new Date(),
        ipAddress: this.getClientIP(req),
        userAgent: req.get('User-Agent'),
        metadata: {}
      };

      // Check if user has too many active sessions
      const activeSessions = await this.getActiveSessionsCount(userId);
      if (activeSessions >= this.options.maxSessions) {
        // Remove oldest session
        await this.removeOldestSession(userId);
      }

      // Store session
      const sessionKey = `session:${sessionId}`;
      const userSessionsKey = `user_sessions:${userId}`;

      await Promise.all([
        this.redisClient.setEx(sessionKey, this.options.sessionTimeout, JSON.stringify(sessionData)),
        this.redisClient.sAdd(userSessionsKey, sessionId),
        this.redisClient.expire(userSessionsKey, this.options.sessionTimeout)
      ]);

      return sessionId;
    } catch (error) {
      console.error('Session creation error:', error);
      return null;
    }
  }

  async validateSession(sessionId: string): Promise<SessionData | null> {
    if (!this.sessionEnabled || !sessionId) return null;

    try {
      const sessionKey = `session:${sessionId}`;
      const sessionDataStr = await this.redisClient.get(sessionKey);

      if (!sessionDataStr) return null;

      const sessionData: SessionData = JSON.parse(sessionDataStr);
      
      // Update last activity if tracking is enabled
      if (this.options.trackActivity) {
        sessionData.lastActivity = new Date();
        await this.redisClient.setEx(sessionKey, this.options.sessionTimeout, JSON.stringify(sessionData));
      }

      return sessionData;
    } catch (error) {
      console.error('Session validation error:', error);
      return null;
    }
  }

  async updateSessionActivity(sessionId: string, metadata?: Record<string, any>): Promise<boolean> {
    if (!this.sessionEnabled) return false;

    try {
      const sessionData = await this.validateSession(sessionId);
      if (!sessionData) return false;

      sessionData.lastActivity = new Date();
      if (metadata) {
        sessionData.metadata = { ...sessionData.metadata, ...metadata };
      }

      const sessionKey = `session:${sessionId}`;
      await this.redisClient.setEx(sessionKey, this.options.sessionTimeout, JSON.stringify(sessionData));
      
      return true;
    } catch (error) {
      console.error('Session activity update error:', error);
      return false;
    }
  }

  async destroySession(sessionId: string): Promise<boolean> {
    if (!this.sessionEnabled) return false;

    try {
      const sessionData = await this.validateSession(sessionId);
      if (!sessionData) return false;

      const sessionKey = `session:${sessionId}`;
      const userSessionsKey = `user_sessions:${sessionData.userId}`;

      await Promise.all([
        this.redisClient.del(sessionKey),
        this.redisClient.sRem(userSessionsKey, sessionId)
      ]);

      return true;
    } catch (error) {
      console.error('Session destruction error:', error);
      return false;
    }
  }

  async destroyAllUserSessions(userId: string): Promise<boolean> {
    if (!this.sessionEnabled) return false;

    try {
      const userSessionsKey = `user_sessions:${userId}`;
      const sessionIds = await this.redisClient.sMembers(userSessionsKey);

      if (sessionIds.length === 0) return true;

      const sessionKeys = sessionIds.map((id: string) => `session:${id}`);
      
      await Promise.all([
        this.redisClient.del(...sessionKeys),
        this.redisClient.del(userSessionsKey)
      ]);

      return true;
    } catch (error) {
      console.error('User sessions destruction error:', error);
      return false;
    }
  }

  async getActiveSessionsCount(userId: string): Promise<number> {
    if (!this.sessionEnabled) return 0;

    try {
      const userSessionsKey = `user_sessions:${userId}`;
      return await this.redisClient.sCard(userSessionsKey);
    } catch (error) {
      console.error('Active sessions count error:', error);
      return 0;
    }
  }

  async getUserActiveSessions(userId: string): Promise<SessionData[]> {
    if (!this.sessionEnabled) return [];

    try {
      const userSessionsKey = `user_sessions:${userId}`;
      const sessionIds = await this.redisClient.sMembers(userSessionsKey);

      const sessions: SessionData[] = [];
      for (const sessionId of sessionIds) {
        const sessionData = await this.validateSession(sessionId);
        if (sessionData) {
          sessions.push(sessionData);
        }
      }

      return sessions.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
    } catch (error) {
      console.error('Get active sessions error:', error);
      return [];
    }
  }

  private async removeOldestSession(userId: string): Promise<void> {
    try {
      const sessions = await this.getUserActiveSessions(userId);
      if (sessions.length === 0) return;

      // Remove the oldest session (last in sorted array)
      const oldestSession = sessions[sessions.length - 1];
      await this.destroySession(oldestSession.sessionId);
    } catch (error) {
      console.error('Remove oldest session error:', error);
    }
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getClientIP(req: Request): string | undefined {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
           req.connection.remoteAddress ||
           req.socket.remoteAddress ||
           undefined;
  }

  async cleanup(): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
      } catch (error) {
        console.error('Session Redis cleanup error:', error);
      }
    }
  }

  // Health check method
  async healthCheck(): Promise<{ healthy: boolean; activeSessions: number }> {
    if (!this.sessionEnabled) {
      return { healthy: false, activeSessions: 0 };
    }

    try {
      await this.redisClient.ping();
      
      // Count total active sessions
      const sessionKeys = await this.redisClient.keys('session:*');
      
      return { 
        healthy: true, 
        activeSessions: sessionKeys.length 
      };
    } catch (error) {
      console.error('Session health check error:', error);
      return { healthy: false, activeSessions: 0 };
    }
  }
}

// Singleton instance
export const sessionManager = new SessionManager();
