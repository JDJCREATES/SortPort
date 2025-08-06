/**
 * Centralized logging configuration for the bulk processing system
 * Controls verbosity levels to prevent console spam
 */

export enum LogLevel {
  SILENT = 0,    // No logs
  ERROR = 1,     // Errors only
  WARN = 2,      // Errors + warnings
  INFO = 3,      // Errors + warnings + important info
  DEBUG = 4,     // All logs including detailed progress
  VERBOSE = 5    // All logs including per-file details
}

class LoggingConfig {
  private static instance: LoggingConfig;
  
  // Default to INFO level - shows important progress but not per-file details
  public level: LogLevel = LogLevel.INFO;
  
  // Production should be less verbose
  public isProduction = process.env.NODE_ENV === 'production';
  
  private constructor() {
    // Set more conservative defaults in production
    if (this.isProduction) {
      this.level = LogLevel.WARN;
    }
  }
  
  public static getInstance(): LoggingConfig {
    if (!LoggingConfig.instance) {
      LoggingConfig.instance = new LoggingConfig();
    }
    return LoggingConfig.instance;
  }
  
  public setLevel(level: LogLevel): void {
    this.level = level;
  }
  
  public shouldLog(level: LogLevel): boolean {
    return this.level >= level;
  }
  
  // Convenience methods for different log types
  public canLogError(): boolean {
    return this.shouldLog(LogLevel.ERROR);
  }
  
  public canLogWarn(): boolean {
    return this.shouldLog(LogLevel.WARN);
  }
  
  public canLogInfo(): boolean {
    return this.shouldLog(LogLevel.INFO);
  }
  
  public canLogDebug(): boolean {
    return this.shouldLog(LogLevel.DEBUG);
  }
  
  public canLogVerbose(): boolean {
    return this.shouldLog(LogLevel.VERBOSE);
  }
}

// Export singleton instance
export const loggingConfig = LoggingConfig.getInstance();

// Convenience logging functions
export const logError = (message: string, ...args: any[]) => {
  if (loggingConfig.canLogError()) {
    console.log(message, ...args);
  }
};

export const logWarn = (message: string, ...args: any[]) => {
  if (loggingConfig.canLogWarn()) {
    console.log(message, ...args);
  }
};

export const logInfo = (message: string, ...args: any[]) => {
  if (loggingConfig.canLogInfo()) {
    console.log(message, ...args);
  }
};

export const logDebug = (message: string, ...args: any[]) => {
  if (loggingConfig.canLogDebug()) {
    console.log(message, ...args);
  }
};

export const logVerbose = (message: string, ...args: any[]) => {
  if (loggingConfig.canLogVerbose()) {
    console.log(message, ...args);
  }
};

// Quick access to set common log levels
export const setQuietMode = () => loggingConfig.setLevel(LogLevel.WARN);
export const setNormalMode = () => loggingConfig.setLevel(LogLevel.INFO);
export const setVerboseMode = () => loggingConfig.setLevel(LogLevel.VERBOSE);
export const setSilentMode = () => loggingConfig.setLevel(LogLevel.SILENT);
