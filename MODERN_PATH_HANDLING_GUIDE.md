# Modern Filename & Path Handling Guide

This guide covers the production-ready filename and path handling solution implemented for SnapSort.

## 🚀 Quick Start

### Basic Usage

```typescript
import { PathSanitizer } from '../utils/helpers/pathSanitizer';

// Sanitize a filename
const safeFilename = PathSanitizer.sanitizeFilename('My Photo (2024).jpg');
// Result: "My Photo (2024).jpg" (safe for most systems)

// Sanitize with strict options
const strictFilename = PathSanitizer.sanitizeFilename('My Photo (2024).jpg', {
  replaceSpaces: true,
  maxLength: 50
});
// Result: "My_Photo_(2024).jpg"

// Normalize a path
const normalizedPath = PathSanitizer.normalizePath('/path//to\\\\file.jpg');
// Result: "/path/to/file.jpg"
```

### Advanced Path Validation

```typescript
import { PathSanitizer } from '../utils/helpers/pathSanitizer';

const result = PathSanitizer.validateAndSanitizePath('problematic/path with spaces.jpg');

if (!result.isValid) {
  console.log('Issues found:', result.warnings);
  console.log('Applied fixes:', result.fixes);
}

const safePath = result.sanitized;
```

### Batch Analysis

```typescript
import { PathIssuesReporter } from '../utils/helpers/pathIssuesReporter';

const paths = [
  '/path/with spaces/file.jpg',
  '/very/long/path/that/exceeds/windows/limits...',
  '/path/with/invalid<characters>.jpg'
];

const report = PathIssuesReporter.generateReport(paths);
console.log(report);
```

## 📚 Libraries Used

### 1. **sanitize-filename** 
- **Purpose**: Robust filename sanitization
- **Features**: Removes invalid characters, handles edge cases
- **Production Ready**: ✅ 1M+ weekly downloads

### 2. **normalize-path**
- **Purpose**: Consistent path separators (always forward slashes)
- **Features**: Handles mixed separators, removes trailing slashes
- **Production Ready**: ✅ 20M+ weekly downloads

### 3. **upath**
- **Purpose**: Enhanced path utilities with cross-platform support
- **Features**: Path parsing, joining, normalization with UNC support
- **Production Ready**: ✅ 1M+ weekly downloads

## 🔧 Integration Points

### 1. ML Kit Processing
```typescript
// In MLKitProcessingHelper.ts
const sanitizedPath = PathSanitizer.sanitizeForMLKit(imagePath);
const convertedPath = ImagePathHelper.convertToMLKitPath(sanitizedPath);
```

### 2. Upload Services
```typescript
// In BatchUploadService.ts
const safeFilename = PathSanitizer.generateUploadFilename(originalPath, 'batch');
// Creates: "batch_original_name_1673456789_abc123.jpg"
```

### 3. Bulk Processing Orchestrator
```typescript
// In BulkProcessingOrchestrator.ts
const pathReport = PathIssuesReporter.generateReport(validImages);
if (pathReport.includes('ISSUES')) {
  console.warn('⚠️ Path issues detected:', pathReport);
}
```

## 🎯 Common Path Issues & Solutions

### Issue 1: Spaces in Filenames
**Problem**: "My Photo (2024).jpg" may cause issues in some systems
**Solution**: 
```typescript
PathSanitizer.sanitizeFilename(filename, { replaceSpaces: true })
// Result: "My_Photo_(2024).jpg"
```

### Issue 2: Invalid Characters
**Problem**: "photo<test>.jpg" contains invalid characters
**Solution**: Automatically replaced with underscores
```typescript
PathSanitizer.sanitizeFilename("photo<test>.jpg")
// Result: "photo_test_.jpg"
```

### Issue 3: Path Too Long
**Problem**: Windows MAX_PATH limit (260 characters)
**Solution**: 
```typescript
PathSanitizer.sanitizeFilename(longName, { maxLength: 100 })
```

### Issue 4: Mixed Path Separators
**Problem**: "/path\\to/file.jpg"
**Solution**:
```typescript
PathSanitizer.normalizePath("/path\\to/file.jpg")
// Result: "/path/to/file.jpg"
```

## 🛡️ Production Best Practices

### 1. Always Validate Paths
```typescript
const result = PathSanitizer.validateAndSanitizePath(userPath);
if (!result.isValid) {
  // Handle warnings and apply fixes
  logWarning('Path issues detected', result.warnings);
}
```

### 2. Use Safe Upload Filenames
```typescript
// DON'T: Use user-provided filenames directly
const uploadName = userFile.name; // ❌ Potentially unsafe

// DO: Generate safe upload filenames
const uploadName = PathSanitizer.generateUploadFilename(userFile.path, 'upload');
```

### 3. Analyze Batches for Issues
```typescript
// Before processing large batches
const report = PathIssuesReporter.generateReport(imagePaths);
if (report.includes('CRITICAL') || report.includes('HIGH')) {
  // Alert user or auto-fix issues
  throw new Error('Critical path issues detected');
}
```

### 4. Cache Analysis Results
```typescript
// PathIssuesReporter automatically caches analysis results
// For manual cache management:
PathIssuesReporter.clearCache(); // Clear when needed
```

## 🔍 Debugging Path Issues

### Enable Debug Logging
```typescript
// In development, path validation warnings are automatically logged
if (__DEV__) {
  console.log('Path validation result:', result);
}
```

### Manual Issue Detection
```typescript
const isSafe = PathIssuesReporter.isPathSafe('/questionable/path.jpg');
if (!isSafe) {
  const { fixed, changes } = PathIssuesReporter.autoFixPath('/questionable/path.jpg');
  console.log('Auto-fixed path:', fixed);
  console.log('Changes applied:', changes);
}
```

## 📊 Performance Considerations

### Caching
- Analysis results are automatically cached
- Repeated path validation is fast
- Cache is automatically managed

### Memory Usage
- Lightweight libraries with minimal footprint
- Analysis cache has automatic size limits
- No memory leaks in production

### Speed
- Modern algorithms optimized for performance
- Batch processing is efficient
- O(1) cache lookups for repeated paths

## 🚨 Migration from Legacy Code

### Before (Manual String Manipulation)
```typescript
// ❌ Legacy approach
const filename = uri.split('/').pop() || uri;
const cleaned = filename.replace(/[<>:"|?*]/g, '_');
```

### After (Modern Libraries)
```typescript
// ✅ Modern approach
const filename = PathSanitizer.extractSafeFilename(uri);
const result = PathSanitizer.validateAndSanitizePath(fullPath);
```

## 🔗 Related Files

- `utils/helpers/pathSanitizer.ts` - Main sanitization utilities
- `utils/helpers/pathIssuesReporter.ts` - Path analysis and reporting
- `utils/mlkit/helpers/imagePathHelper.ts` - ML Kit specific path handling
- `utils/upload/BatchUploadService.ts` - Upload filename generation

## 📈 Future Enhancements

- [ ] Add path pattern validation (e.g., regex-based rules)
- [ ] Implement custom sanitization profiles
- [ ] Add internationalization support for filenames
- [ ] Create VS Code extension for path validation
- [ ] Add automated path fixing in CI/CD pipeline

---

**Need Help?** Check the console logs for detailed path analysis reports, or use the `PathIssuesReporter.generateReport()` method for comprehensive diagnostics.
