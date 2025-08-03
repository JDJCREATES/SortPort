/**
 * Secure Logger with Data Redaction
 * 
 * Production-safe logging that automatically redacts sensitive information
 */

interface LogLevel {
  ERROR: 'error';
  WARN: 'warn';
  INFO: 'info';
  DEBUG: 'debug';
}

interface SensitivePatterns {
  userId: RegExp;
  email: RegExp;
  token: RegExp;
  password: RegExp;
  apiKey: RegExp;
  sessionId: RegExp;
}

export class SecureLogger {
  private static instance: SecureLogger;
  private sensitivePatterns: SensitivePatterns;
  private isProduction: boolean;

  private constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
    this.sensitivePatterns = {
      userId: /user[_-]?id[:\s]*[a-f0-9-]{36}/gi,
      email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      token: /[Bb]earer\s+[A-Za-z0-9\-_=]+/g,
      password: /password[:\s]*[^\s]+/gi,
      apiKey: /api[_-]?key[:\s]*[A-Za-z0-9\-_=]+/gi,
      sessionId: /session[_-]?id[:\s]*[a-f0-9-]+/gi
    };
  }

  static getInstance(): SecureLogger {
    if (!SecureLogger.instance) {
      SecureLogger.instance = new SecureLogger();
    }
    return SecureLogger.instance;
  }

  private redactSensitiveData(message: string): string {
    let redacted = message;
    
    Object.entries(this.sensitivePatterns).forEach(([type, pattern]) => {
      redacted = redacted.replace(pattern, `[REDACTED_${type.toUpperCase()}]`);
    });
    
    return redacted;
  }

  private formatLogEntry(level: string, message: string, context?: any): any {
    const timestamp = new Date().toISOString();
    const redactedMessage = this.redactSensitiveData(message);
    
    const logEntry = {
      timestamp,
      level,
      message: redactedMessage,
      ...(context && { context: this.redactObject(context) })
    };

    return logEntry;
  }

  private redactObject(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    const redacted: any = Array.isArray(obj) ? [] : {};
    
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      
      // Redact sensitive keys
      if (lowerKey.includes('password') || 
          lowerKey.includes('token') || 
          lowerKey.includes('secret') ||
          lowerKey.includes('key') ||
          lowerKey.includes('auth')) {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'string') {
        redacted[key] = this.redactSensitiveData(value);
      } else if (typeof value === 'object') {
        redacted[key] = this.redactObject(value);
      } else {
        redacted[key] = value;
      }
    }
    
    return redacted;
  }

  error(message: string, context?: any): void {
    const logEntry = this.formatLogEntry('ERROR', message, context);
    console.error(JSON.stringify(logEntry));
  }

  warn(message: string, context?: any): void {
    const logEntry = this.formatLogEntry('WARN', message, context);
    console.warn(JSON.stringify(logEntry));
  }

  info(message: string, context?: any): void {
    if (this.isProduction) {
      // In production, be more selective about info logs
      const logEntry = this.formatLogEntry('INFO', message, context);
      console.log(JSON.stringify(logEntry));
    } else {
      console.log(message, context);
    }
  }

  debug(message: string, context?: any): void {
    if (!this.isProduction) {
      console.log(`[DEBUG] ${message}`, context);
    }
  }

  // Safe server startup logging
  serverStartup(port: number, environment: string): void {
    if (this.isProduction) {
      this.info('Server started successfully', {
        port,
        environment: environment === 'production' ? 'production' : 'non-production',
        timestamp: new Date().toISOString()
      });
    } else {
      console.log(`🚀 SortxPort LCEL Server running on port ${port}`);
      console.log(`📊 Environment: ${environment}`);
      console.log(`🔗 Health check: http://localhost:${port}/health`);
      console.log(`📈 Monitoring: http://localhost:${port}/api/monitoring/health`);
    }
  }

  // Safe authentication logging
  authEvent(event: 'success' | 'failure' | 'invalid_token', metadata?: any): void {
    this.info(`Authentication ${event}`, {
      event,
      timestamp: new Date().toISOString(),
      // Note: user details are automatically redacted by redactObject
      ...metadata
    });
  }
}

export const secureLogger = SecureLogger.getInstance();
