/**
 * Path Issues Reporter
 * Analyzes and reports common filename/path issues in production
 */

import { PathSanitizer } from './pathSanitizer';

export interface PathIssueReport {
  severity: 'low' | 'medium' | 'high' | 'critical';
  issue: string;
  description: string;
  suggestion: string;
  affectedPaths: string[];
}

export class PathIssuesReporter {
  private static issues: PathIssueReport[] = [];
  private static analysisCache = new Map<string, PathIssueReport[]>();

  /**
   * 🔍 Analyze a batch of paths for common issues
   */
  static analyzePaths(paths: string[]): PathIssueReport[] {
    const reports: PathIssueReport[] = [];
    const pathsByIssue = new Map<string, string[]>();

    for (const path of paths) {
      // Check cache first
      const cacheKey = this.generateCacheKey(path);
      if (this.analysisCache.has(cacheKey)) {
        const cachedReports = this.analysisCache.get(cacheKey)!;
        reports.push(...cachedReports);
        continue;
      }

      const pathReports = this.analyzeIndividualPath(path);
      reports.push(...pathReports);
      this.analysisCache.set(cacheKey, pathReports);

      // Group similar issues
      for (const report of pathReports) {
        const key = `${report.severity}:${report.issue}`;
        if (!pathsByIssue.has(key)) {
          pathsByIssue.set(key, []);
        }
        pathsByIssue.get(key)!.push(path);
      }
    }

    // Consolidate similar issues
    return this.consolidateReports(reports, pathsByIssue);
  }

  /**
   * 🎯 Analyze individual path for issues
   */
  private static analyzeIndividualPath(path: string): PathIssueReport[] {
    const issues: PathIssueReport[] = [];

    // Check for spaces in path
    if (path.includes(' ')) {
      issues.push({
        severity: 'medium',
        issue: 'spaces_in_path',
        description: 'Path contains spaces which may cause issues with some file systems or URL encoding',
        suggestion: 'Consider using underscores (_) or hyphens (-) instead of spaces',
        affectedPaths: [path]
      });
    }

    // Check for special characters
    const specialChars = path.match(/[<>:"|?*]/g);
    if (specialChars) {
      issues.push({
        severity: 'high',
        issue: 'invalid_characters',
        description: `Path contains invalid characters: ${specialChars.join(', ')}`,
        suggestion: 'Remove or replace invalid characters with safe alternatives',
        affectedPaths: [path]
      });
    }

    // Check path length (Windows MAX_PATH)
    if (path.length > 260) {
      issues.push({
        severity: 'high',
        issue: 'path_too_long',
        description: `Path exceeds Windows MAX_PATH limit (${path.length}/260 characters)`,
        suggestion: 'Shorten directory names or move files to a shorter path',
        affectedPaths: [path]
      });
    }

    // Check for Unicode issues
    if (!/^[\x00-\x7F]*$/.test(path)) {
      const hasUnicodeSpaces = /[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/.test(path);
      if (hasUnicodeSpaces) {
        issues.push({
          severity: 'medium',
          issue: 'unicode_spaces',
          description: 'Path contains Unicode space characters that may not display correctly',
          suggestion: 'Replace Unicode spaces with regular ASCII spaces',
          affectedPaths: [path]
        });
      }
    }

    // Check for repeated separators
    if (path.includes('//') || path.includes('\\\\')) {
      issues.push({
        severity: 'low',
        issue: 'repeated_separators',
        description: 'Path contains repeated directory separators',
        suggestion: 'Normalize path to use single separators',
        affectedPaths: [path]
      });
    }

    // Check for case sensitivity issues
    const hasMixedCase = /[a-z]/.test(path) && /[A-Z]/.test(path);
    if (hasMixedCase) {
      issues.push({
        severity: 'low',
        issue: 'mixed_case',
        description: 'Path uses mixed case which may cause issues on case-sensitive systems',
        suggestion: 'Consider using consistent lowercase naming',
        affectedPaths: [path]
      });
    }

    return issues;
  }

  /**
   * 📊 Consolidate similar reports
   */
  private static consolidateReports(
    reports: PathIssueReport[], 
    pathsByIssue: Map<string, string[]>
  ): PathIssueReport[] {
    const consolidated: PathIssueReport[] = [];
    const processedIssues = new Set<string>();

    for (const report of reports) {
      const key = `${report.severity}:${report.issue}`;
      
      if (processedIssues.has(key)) {
        continue;
      }

      const affectedPaths = pathsByIssue.get(key) || [report.affectedPaths[0]];
      
      consolidated.push({
        ...report,
        affectedPaths,
        description: affectedPaths.length > 1 
          ? `${report.description} (affects ${affectedPaths.length} paths)`
          : report.description
      });

      processedIssues.add(key);
    }

    return consolidated.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  /**
   * 🎨 Generate user-friendly report
   */
  static generateReport(paths: string[]): string {
    const reports = this.analyzePaths(paths);
    
    if (reports.length === 0) {
      return '✅ No path issues detected. All paths appear to be safe for production use.';
    }

    let output = `🔍 Path Analysis Report (${paths.length} paths analyzed)\n\n`;

    const severityGroups = {
      critical: reports.filter(r => r.severity === 'critical'),
      high: reports.filter(r => r.severity === 'high'),
      medium: reports.filter(r => r.severity === 'medium'),
      low: reports.filter(r => r.severity === 'low')
    };

    for (const [severity, issues] of Object.entries(severityGroups)) {
      if (issues.length === 0) continue;

      const icon = {
        critical: '🚨',
        high: '⚠️',
        medium: '⚡',
        low: '💡'
      }[severity];

      output += `${icon} ${severity.toUpperCase()} ISSUES (${issues.length})\n`;
      
      for (const issue of issues) {
        output += `\n  • ${issue.description}\n`;
        output += `    💡 ${issue.suggestion}\n`;
        
        if (issue.affectedPaths.length <= 3) {
          output += `    📁 Affected: ${issue.affectedPaths.join(', ')}\n`;
        } else {
          output += `    📁 Affected: ${issue.affectedPaths.slice(0, 2).join(', ')} and ${issue.affectedPaths.length - 2} others\n`;
        }
      }
      output += '\n';
    }

    // Add recommendations
    output += '🎯 RECOMMENDATIONS:\n\n';
    
    if (severityGroups.critical.length > 0 || severityGroups.high.length > 0) {
      output += '1. 🚨 Address critical and high-severity issues immediately\n';
      output += '2. 🔧 Use PathSanitizer.sanitizeFilename() for all user-generated filenames\n';
      output += '3. 🛡️ Implement path validation in upload workflows\n';
    }
    
    if (severityGroups.medium.length > 0) {
      output += '4. ⚡ Consider fixing medium-severity issues for better compatibility\n';
    }
    
    if (severityGroups.low.length > 0) {
      output += '5. 💡 Low-severity issues can be addressed as part of routine maintenance\n';
    }

    return output;
  }

  /**
   * 🎯 Quick path safety check
   */
  static isPathSafe(path: string): boolean {
    const reports = this.analyzeIndividualPath(path);
    return !reports.some(r => r.severity === 'critical' || r.severity === 'high');
  }

  /**
   * 🧹 Auto-fix common path issues
   */
  static autoFixPath(path: string): { fixed: string; changes: string[] } {
    const changes: string[] = [];
    let fixed = path;

    // Fix repeated separators
    const originalLength = fixed.length;
    fixed = fixed.replace(/\/+/g, '/').replace(/\\+/g, '/');
    if (fixed.length !== originalLength) {
      changes.push('Normalized directory separators');
    }

    // Use PathSanitizer for comprehensive fixing
    const result = PathSanitizer.validateAndSanitizePath(fixed, {
      replaceSpaces: false, // Keep spaces unless specifically requested
      maxLength: 255
    });

    if (result.fixes.length > 0) {
      changes.push(...result.fixes);
      fixed = result.sanitized;
    }

    return { fixed, changes };
  }

  /**
   * 🔑 Generate cache key for path analysis
   */
  private static generateCacheKey(path: string): string {
    // Create a hash-like key based on path characteristics
    const characteristics = [
      path.length.toString(),
      (path.match(/\s/g) || []).length.toString(),
      (path.match(/[<>:"|?*]/g) || []).length.toString(),
      path.includes('//') ? '1' : '0',
      /[^\x00-\x7F]/.test(path) ? '1' : '0'
    ].join(':');
    
    return `${characteristics}:${path.length}`;
  }

  /**
   * 📊 Get analysis statistics
   */
  static getAnalysisStats(): {
    totalAnalyzed: number;
    cacheHits: number;
    issueBreakdown: Record<string, number>;
  } {
    const issueBreakdown: Record<string, number> = {};
    
    for (const reports of this.analysisCache.values()) {
      for (const report of reports) {
        issueBreakdown[report.issue] = (issueBreakdown[report.issue] || 0) + 1;
      }
    }

    return {
      totalAnalyzed: this.analysisCache.size,
      cacheHits: this.analysisCache.size,
      issueBreakdown
    };
  }

  /**
   * 🧹 Clear analysis cache
   */
  static clearCache(): void {
    this.analysisCache.clear();
  }
}
