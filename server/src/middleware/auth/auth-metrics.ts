/**
 * Authentication Metrics and Monitoring
 * 
 * Tracks authentication events, performance, and security metrics
 */

import { EventEmitter } from 'events';

export interface AuthMetrics {
  totalLogins: number;
  failedLogins: number;
  activeSessions: number;
  tokenValidations: number;
  cacheHits: number;
  cacheMisses: number;
  suspiciousActivity: number;
  averageResponseTime: number;
}

export interface AuthEvent {
  type: 'login' | 'logout' | 'validation' | 'error' | 'suspicious';
  userId?: string;
  ip?: string;
  userAgent?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class AuthMetricsCollector extends EventEmitter {
  private metrics: AuthMetrics = {
    totalLogins: 0,
    failedLogins: 0,
    activeSessions: 0,
    tokenValidations: 0,
    cacheHits: 0,
    cacheMisses: 0,
    suspiciousActivity: 0,
    averageResponseTime: 0
  };

  private responseTimes: number[] = [];
  private events: AuthEvent[] = [];
  private maxEventHistory = 1000;

  recordLogin(userId: string, ip?: string, userAgent?: string): void {
    this.metrics.totalLogins++;
    this.recordEvent({
      type: 'login',
      userId,
      ip,
      userAgent,
      timestamp: new Date()
    });
    this.emit('login', { userId, ip, userAgent });
  }

  recordFailedLogin(ip?: string, userAgent?: string): void {
    this.metrics.failedLogins++;
    this.recordEvent({
      type: 'error',
      ip,
      userAgent,
      timestamp: new Date(),
      metadata: { reason: 'failed_login' }
    });
    this.emit('failed_login', { ip, userAgent });
  }

  recordTokenValidation(hit: boolean, responseTime: number): void {
    this.metrics.tokenValidations++;
    
    if (hit) {
      this.metrics.cacheHits++;
    } else {
      this.metrics.cacheMisses++;
    }

    this.recordResponseTime(responseTime);
  }

  recordSuspiciousActivity(userId?: string, ip?: string, reason?: string): void {
    this.metrics.suspiciousActivity++;
    this.recordEvent({
      type: 'suspicious',
      userId,
      ip,
      timestamp: new Date(),
      metadata: { reason }
    });
    this.emit('suspicious_activity', { userId, ip, reason });
  }

  private recordResponseTime(time: number): void {
    this.responseTimes.push(time);
    
    // Keep only last 100 measurements for average
    if (this.responseTimes.length > 100) {
      this.responseTimes.shift();
    }
    
    this.metrics.averageResponseTime = 
      this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
  }

  private recordEvent(event: AuthEvent): void {
    this.events.push(event);
    
    // Maintain event history limit
    if (this.events.length > this.maxEventHistory) {
      this.events.shift();
    }
  }

  getMetrics(): AuthMetrics {
    return { ...this.metrics };
  }

  getRecentEvents(limit: number = 50): AuthEvent[] {
    return this.events.slice(-limit);
  }

  getEventsByType(type: AuthEvent['type'], limit: number = 50): AuthEvent[] {
    return this.events
      .filter(event => event.type === type)
      .slice(-limit);
  }

  getCacheHitRate(): number {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    return total > 0 ? this.metrics.cacheHits / total : 0;
  }

  getFailureRate(): number {
    const total = this.metrics.totalLogins + this.metrics.failedLogins;
    return total > 0 ? this.metrics.failedLogins / total : 0;
  }

  resetMetrics(): void {
    this.metrics = {
      totalLogins: 0,
      failedLogins: 0,
      activeSessions: 0,
      tokenValidations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      suspiciousActivity: 0,
      averageResponseTime: 0
    };
    this.responseTimes = [];
    this.events = [];
  }

  // Export metrics for monitoring systems
  exportPrometheusMetrics(): string {
    const metrics = this.getMetrics();
    return `
# HELP auth_total_logins Total number of successful logins
# TYPE auth_total_logins counter
auth_total_logins ${metrics.totalLogins}

# HELP auth_failed_logins Total number of failed login attempts
# TYPE auth_failed_logins counter
auth_failed_logins ${metrics.failedLogins}

# HELP auth_active_sessions Number of currently active sessions
# TYPE auth_active_sessions gauge
auth_active_sessions ${metrics.activeSessions}

# HELP auth_token_validations Total number of token validations
# TYPE auth_token_validations counter
auth_token_validations ${metrics.tokenValidations}

# HELP auth_cache_hits Total number of cache hits
# TYPE auth_cache_hits counter
auth_cache_hits ${metrics.cacheHits}

# HELP auth_cache_misses Total number of cache misses
# TYPE auth_cache_misses counter
auth_cache_misses ${metrics.cacheMisses}

# HELP auth_suspicious_activity Total number of suspicious activities detected
# TYPE auth_suspicious_activity counter
auth_suspicious_activity ${metrics.suspiciousActivity}

# HELP auth_average_response_time Average response time for auth operations in milliseconds
# TYPE auth_average_response_time gauge
auth_average_response_time ${metrics.averageResponseTime}

# HELP auth_cache_hit_rate Cache hit rate as a percentage
# TYPE auth_cache_hit_rate gauge
auth_cache_hit_rate ${this.getCacheHitRate()}

# HELP auth_failure_rate Authentication failure rate as a percentage
# TYPE auth_failure_rate gauge
auth_failure_rate ${this.getFailureRate()}
    `.trim();
  }
}

// Singleton instance
export const authMetrics = new AuthMetricsCollector();
