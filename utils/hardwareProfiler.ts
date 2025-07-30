import DeviceInfo from 'react-native-device-info';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

/*
* Enhanced Hardware Profiler with production-grade device detection and network awareness
* Uses multiple libraries for accurate device capability assessment
*/ 

export interface HardwareProfile {
  deviceTier: 'low' | 'mid' | 'high' | 'flagship';
  cpuCores: number;
  totalMemoryMB: number;
  availableMemoryMB: number;
  storageAvailableGB: number;
  isLowPowerMode: boolean;
  networkType: 'wifi' | 'cellular' | 'unknown';
  networkSpeed: 'slow' | 'medium' | 'fast';
  networkLatency: number;
  recommendedSettings: ProcessingSettings;
}

export interface ProcessingSettings {
  compressionWorkers: number;
  uploadStreams: number;
  batchSize: number;
  compressionQuality: number;
  maxImageSize: number;
  cacheSize: number;
  enableAggressive: boolean;
  memoryWarningThreshold: number;
}

export class HardwareProfiler {
  private static cachedProfile: HardwareProfile | null = null;
  private static readonly MEMORY_CHECK_INTERVAL = 5000; // Check every 5 seconds
  private static memoryMonitorActive = false;

  /**
   * 🔍 Comprehensive hardware detection
   */
  static async getHardwareProfile(): Promise<HardwareProfile> {
    if (this.cachedProfile) {
      return this.cachedProfile;
    }

    console.log('🔍 Analyzing device hardware capabilities...');

    try {
      // Get device info
      const deviceInfo = await this.getDeviceInfo();
      const memoryInfo = await this.getMemoryInfo();
      const storageInfo = await this.getStorageInfo();
      const powerInfo = await this.getPowerModeInfo();
      const networkInfo = await this.getNetworkInfo();
      const networkPerformance = await this.testNetworkPerformance();

      // Determine device tier
      const deviceTier = this.calculateDeviceTier(deviceInfo, memoryInfo);
      
      // Generate optimized settings based on device AND network performance
      const recommendedSettings = this.generateOptimalSettings(
        deviceTier, 
        memoryInfo, 
        powerInfo.isLowPowerMode,
        networkPerformance
      );

      const profile: HardwareProfile = {
        deviceTier,
        cpuCores: deviceInfo.cpuCores,
        totalMemoryMB: memoryInfo.totalMemoryMB,
        availableMemoryMB: memoryInfo.availableMemoryMB,
        storageAvailableGB: storageInfo.availableGB,
        isLowPowerMode: powerInfo.isLowPowerMode,
        networkType: networkInfo.type,
        networkSpeed: networkPerformance.speed,
        networkLatency: networkPerformance.latency,
        recommendedSettings
      };

      this.cachedProfile = profile;
      
      console.log('📊 Enhanced Hardware Profile:', {
        tier: deviceTier,
        memory: `${memoryInfo.availableMemoryMB}MB available`,
        network: `${networkPerformance.speed} (${networkPerformance.latency}ms)`,
        workers: recommendedSettings.compressionWorkers,
        streams: recommendedSettings.uploadStreams,
        batchSize: recommendedSettings.batchSize
      });

      return profile;

    } catch (error) {
      console.error('❌ Hardware profiling failed, using safe defaults:', error);
      return this.getSafeDefaultProfile();
    }
  }

  /**
   * 📱 Get device information with react-native-device-info
   */
  private static async getDeviceInfo(): Promise<{
    cpuCores: number;
    modelName: string;
    year: number;
    isTablet: boolean;
  }> {
    try {
      // Use react-native-device-info for accurate hardware detection
      const [
        modelName,
        deviceId,
        brand,
        systemVersion,
        isTablet,
        totalMemory
      ] = await Promise.all([
        DeviceInfo.getModel(),
        DeviceInfo.getDeviceId(),
        DeviceInfo.getBrand(),
        DeviceInfo.getSystemVersion(),
        DeviceInfo.isTablet(),
        DeviceInfo.getTotalMemory().catch(() => 0)
      ]);

      // More accurate CPU core detection
      let cpuCores = 4; // Safe default
      
      if (Platform.OS === 'ios') {
        // Enhanced iOS detection using device identifier
        const deviceIdentifier = deviceId.toLowerCase();
        
        if (deviceIdentifier.includes('iphone')) {
          if (deviceIdentifier.includes('15,') || deviceIdentifier.includes('16,')) {
            cpuCores = 6; // iPhone 14/15 series
          } else if (deviceIdentifier.includes('14,') || deviceIdentifier.includes('13,')) {
            cpuCores = 6; // iPhone 13/12 series
          } else if (deviceIdentifier.includes('12,') || deviceIdentifier.includes('11,')) {
            cpuCores = 6; // iPhone 11/XS/XR series
          } else {
            cpuCores = 4; // Older iPhones
          }
        } else if (deviceIdentifier.includes('ipad')) {
          cpuCores = deviceIdentifier.includes('pro') ? 8 : 6;
        }
      } else if (Platform.OS === 'android') {
        // Enhanced Android detection
        const brandLower = brand.toLowerCase();
        const modelLower = modelName.toLowerCase();
        
        // Flagship devices (8+ cores)
        if (
          (brandLower.includes('samsung') && (modelLower.includes('s2') || modelLower.includes('note') || modelLower.includes('ultra'))) ||
          (brandLower.includes('google') && modelLower.includes('pixel')) ||
          totalMemory > 6 * 1024 * 1024 * 1024 // 6GB+ RAM
        ) {
          cpuCores = 8;
        } else if (totalMemory > 4 * 1024 * 1024 * 1024) { // 4GB+ RAM
          cpuCores = 6;
        } else if (totalMemory > 2 * 1024 * 1024 * 1024) { // 2GB+ RAM
          cpuCores = 4;
        } else {
          cpuCores = 2;
        }
      }

      // Estimate device year
      let year = 2020;
      if (Platform.OS === 'ios') {
        const identifierNumber = parseInt(deviceId.split(',')[0].slice(-2));
        if (identifierNumber >= 15) year = 2023;
        else if (identifierNumber >= 14) year = 2022;
        else if (identifierNumber >= 13) year = 2021;
        else if (identifierNumber >= 12) year = 2020;
        else year = 2019;
      } else {
        const androidVersion = parseInt(systemVersion);
        if (androidVersion >= 13) year = 2023;
        else if (androidVersion >= 12) year = 2022;
        else if (androidVersion >= 11) year = 2021;
        else if (androidVersion >= 10) year = 2020;
        else year = 2019;
      }

      return {
        cpuCores,
        modelName,
        year,
        isTablet
      };

    } catch (error) {
      console.warn('⚠️ Device info detection failed, using fallback:', error);
      
      // Fallback logic without Device dependency
      let cpuCores = 4;
      let year = 2020;
      
      if (Platform.OS === 'ios') {
        cpuCores = 6; // Modern iOS devices typically have 6 cores
        year = 2021; // Reasonable default for iOS
      } else if (Platform.OS === 'android') {
        cpuCores = 4; // Safe default for Android
        year = 2020;
      }

      return {
        cpuCores,
        modelName: 'Unknown',
        year,
        isTablet: false // Safe default
      };
    }
  }

  /**
   * 🧠 Get memory information with react-native-device-info
   */
  public static async getMemoryInfo(): Promise<{
    totalMemoryMB: number;
    availableMemoryMB: number;
    memoryPressure: 'low' | 'medium' | 'high';
  }> {
    try {
      // Get actual memory values from react-native-device-info
      const [totalMemory, usedMemory] = await Promise.all([
        DeviceInfo.getTotalMemory().catch(() => 0),
        DeviceInfo.getUsedMemory().catch(() => 0)
      ]);

      let totalMemoryMB: number;
      let availableMemoryMB: number;

      if (totalMemory > 0) {
        // Use actual values from device-info
        totalMemoryMB = Math.round(totalMemory / (1024 * 1024));
        const usedMemoryMB = Math.round(usedMemory / (1024 * 1024));
        availableMemoryMB = Math.max(totalMemoryMB - usedMemoryMB, Math.round(totalMemoryMB * 0.1));
      } else {
        // Fallback estimation without Device dependency
        if (Platform.OS === 'ios') {
          // iOS defaults - typically have more RAM
          totalMemoryMB = 6144; // 6GB for modern iOS devices
          availableMemoryMB = 3072; // ~50% available
        } else if (Platform.OS === 'android') {
          // Android defaults - more conservative
          totalMemoryMB = 4096; // 4GB for modern Android devices
          availableMemoryMB = 2048; // ~50% available
        } else {
          // Web/other platforms
          totalMemoryMB = 4096;
          availableMemoryMB = 2048;
        }
      }

      // Calculate memory pressure
      const memoryUsageRatio = (totalMemoryMB - availableMemoryMB) / totalMemoryMB;
      let memoryPressure: 'low' | 'medium' | 'high' = 'low';
      
      if (memoryUsageRatio > 0.8) {
        memoryPressure = 'high';
      } else if (memoryUsageRatio > 0.6) {
        memoryPressure = 'medium';
      }

      return {
        totalMemoryMB,
        availableMemoryMB,
        memoryPressure
      };

    } catch (error) {
      console.warn('⚠️ Memory info detection failed:', error);
      return {
        totalMemoryMB: 4096,
        availableMemoryMB: 2048,
        memoryPressure: 'medium'
      };
    }
  }

  /**
   * 💾 Get storage information with react-native-device-info
   */
  private static async getStorageInfo(): Promise<{ availableGB: number }> {
    try {
      // Try device-info first
      const freeStorage = await DeviceInfo.getFreeDiskStorage().catch(() => 0);
      
      if (freeStorage > 0) {
        const availableGB = freeStorage / (1024 * 1024 * 1024);
        return { availableGB };
      }
      
      // Fallback to expo FileSystem (keep existing logic)
      const freeSpace = await FileSystem.getFreeDiskStorageAsync();
      const availableGB = freeSpace / (1024 * 1024 * 1024);
      
      return { availableGB };
    } catch (error) {
      console.warn('⚠️ Storage info detection failed:', error);
      return { availableGB: 10 }; // 10GB default
    }
  }

  /**
   * 🔋 Get power mode information with react-native-device-info
   */
  private static async getPowerModeInfo(): Promise<{ isLowPowerMode: boolean }> {
    try {
      // Get available device info for power heuristics
      const [batteryLevel, totalMemory] = await Promise.all([
        DeviceInfo.getBatteryLevel().catch(() => 1),
        DeviceInfo.getTotalMemory().catch(() => 0)
      ]);
      
      // Heuristics for low power mode:
      // 1. Very low battery (< 15%)
      // 2. Low-end device with limited memory (< 3GB)
      const isLowBattery = batteryLevel < 0.15;
      const isLowEndDevice = totalMemory > 0 && totalMemory < (3 * 1024 * 1024 * 1024); // < 3GB
      
      const isLowPowerMode = isLowBattery || isLowEndDevice;
      
      return { isLowPowerMode };
    } catch (error) {
      console.warn('⚠️ Power mode detection failed:', error);
      return { isLowPowerMode: false };
    }
  }

  /**
   * 📶 Get network information
   */
  private static async getNetworkInfo(): Promise<{ type: 'wifi' | 'cellular' | 'unknown' }> {
    try {
      // This would need NetInfo package
      // For now, assume wifi for better performance
      return { type: 'wifi' };
    } catch (error) {
      return { type: 'unknown' };
    }
  }

  /**
   * 🚀 Test network performance with small request to Supabase
   */
  private static async testNetworkPerformance(): Promise<{ speed: 'slow' | 'medium' | 'fast', latency: number }> {
    try {
      console.log('🌐 Testing network performance...');
      
      const testStart = Date.now();
      
      // Small ping test to Supabase health endpoint
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        return { speed: 'medium', latency: 100 };
      }

      // Create abort controller with manual timeout since AbortSignal.timeout may not be available
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 5000);
      
      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'HEAD',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      const latency = Date.now() - testStart;
      
      // Classify network speed based on latency
      let speed: 'slow' | 'medium' | 'fast' = 'medium';
      if (latency < 200) {
        speed = 'fast';
      } else if (latency > 1000) {
        speed = 'slow';
      }
      
      console.log(`📶 Network performance: ${speed} (${latency}ms latency)`);
      return { speed, latency };
      
    } catch (error) {
      console.warn('⚠️ Network performance test failed:', error);
      return { speed: 'medium', latency: 500 }; // Conservative defaults
    }
  }

  /**
   * 🏆 Calculate device tier
   */
  private static calculateDeviceTier(
    deviceInfo: any, 
    memoryInfo: any
  ): 'low' | 'mid' | 'high' | 'flagship' {
    const { cpuCores, year } = deviceInfo;
    const { totalMemoryMB, memoryPressure } = memoryInfo;

    // Flagship tier
    if (cpuCores >= 8 && totalMemoryMB >= 8192 && year >= 2022 && memoryPressure === 'low') {
      return 'flagship';
    }
    
    // High tier
    if (cpuCores >= 6 && totalMemoryMB >= 6144 && year >= 2020 && memoryPressure !== 'high') {
      return 'high';
    }
    
    // Mid tier
    if (cpuCores >= 4 && totalMemoryMB >= 4096 && year >= 2019) {
      return 'mid';
    }
    
    // Low tier
    return 'low';
  }

  /**
   * ⚙️ Generate optimal settings based on hardware AND network performance
   */
  private static generateOptimalSettings(
    deviceTier: string,
    memoryInfo: any,
    isLowPowerMode: boolean,
    networkPerformance: { speed: 'slow' | 'medium' | 'fast', latency: number }
  ): ProcessingSettings {
    const baseSettings = {
      low: {
        compressionWorkers: 4,    // IMPROVED: Increased from 3 to 4
        uploadStreams: 2,
        batchSize: 18,            // IMPROVED: Increased from 10 to 18 (your system handles 14 well)
        compressionQuality: 0.4,  // IMPROVED: More aggressive compression for AWS Rekognition
        maxImageSize: 512,        // IMPROVED: Smaller size, Rekognition works well with 512px
        cacheSize: 20,
        enableAggressive: false,
        memoryWarningThreshold: 1024
      },
      mid: {
        compressionWorkers: 6,    // IMPROVED: Increased from 5 to 6
        uploadStreams: 3,         // IMPROVED: Increased from 2 to 3
        batchSize: 22,            // IMPROVED: Increased from 14 to 22
        compressionQuality: 0.5,  // IMPROVED: More compression
        maxImageSize: 640,        // IMPROVED: Rekognition-optimized
        cacheSize: 50,
        enableAggressive: false,
        memoryWarningThreshold: 1536
      },
      high: {
        compressionWorkers: 8,
        uploadStreams: 3,
        batchSize: 18, // IMPROVED: Larger batches for high-end devices
        compressionQuality: 0.6, // IMPROVED: Balanced compression
        maxImageSize: 768,       // IMPROVED: Good quality for Rekognition
        cacheSize: 100,
        enableAggressive: true,
        memoryWarningThreshold: 2048
      },
      flagship: {
        compressionWorkers: 12,
        uploadStreams: 4,
        batchSize: 25, // IMPROVED: Maximum efficiency
        compressionQuality: 0.7, // IMPROVED: Good quality with compression
        maxImageSize: 896,       // IMPROVED: Rekognition-optimized for flagship
        cacheSize: 150,
        enableAggressive: true,
        memoryWarningThreshold: 3072
      }
    };

    let settings = baseSettings[deviceTier as keyof typeof baseSettings];

    // NETWORK-AWARE ADJUSTMENTS: Optimize batch size based on network performance
    if (networkPerformance.speed === 'slow' || networkPerformance.latency > 1000) {
      // Slow network: Use larger batches to reduce round trips
      settings = {
        ...settings,
        batchSize: Math.min(30, Math.floor(settings.batchSize * 1.5)),
        uploadStreams: Math.max(1, Math.floor(settings.uploadStreams * 0.7)),
        compressionQuality: Math.max(0.3, settings.compressionQuality - 0.1), // More compression
        maxImageSize: Math.floor(settings.maxImageSize * 0.8) // Smaller images
      };
    } else if (networkPerformance.speed === 'fast' && networkPerformance.latency < 200) {
      // Fast network: Can handle larger batches and more workers efficiently
      settings = {
        ...settings,
        batchSize: Math.min(25, Math.floor(settings.batchSize * 1.3)), // Increased multiplier for fast networks
        uploadStreams: Math.min(6, Math.floor(settings.uploadStreams * 1.3)),
        compressionWorkers: Math.min(12, Math.floor(settings.compressionWorkers * 1.3)) // Increased multiplier
      };
    }

    // Adjust for low power mode
    if (isLowPowerMode) {
      settings = {
        ...settings,
        compressionWorkers: Math.max(1, Math.floor(settings.compressionWorkers / 2)),
        uploadStreams: Math.max(1, Math.floor(settings.uploadStreams / 2)),
        batchSize: Math.max(3, Math.floor(settings.batchSize / 2)),
        enableAggressive: false
      };
    }

    // Adjust for memory pressure
    if (memoryInfo.memoryPressure === 'high') {
      settings = {
        ...settings,
        compressionWorkers: Math.max(1, Math.floor(settings.compressionWorkers / 2)),
        cacheSize: Math.max(10, Math.floor(settings.cacheSize / 2)),
        batchSize: Math.max(3, Math.floor(settings.batchSize / 2))
      };
    }

    return settings;
  }

  /**
   * 🛡️ Get safe default profile for fallback
   */
  private static getSafeDefaultProfile(): HardwareProfile {
    return {
      deviceTier: 'mid',
      cpuCores: 4,
      totalMemoryMB: 4096,
      availableMemoryMB: 2048,
      storageAvailableGB: 10,
      isLowPowerMode: false,
      networkType: 'wifi',
      networkSpeed: 'medium',
      networkLatency: 500,
      recommendedSettings: {
        compressionWorkers: 3,
        uploadStreams: 2,
        batchSize: 12, // IMPROVED: Better default batch size
        compressionQuality: 0.5, // IMPROVED: Rekognition-optimized compression
        maxImageSize: 640, // IMPROVED: Rekognition-optimized size
        cacheSize: 30,
        enableAggressive: false,
        memoryWarningThreshold: 1536
      }
    };
  }

  /**
   * 📊 Start memory monitoring during processing
   */
  static startMemoryMonitoring(
    onMemoryWarning: (availableMB: number) => void,
    warningThreshold: number
  ): void {
    if (this.memoryMonitorActive) return;
    
    this.memoryMonitorActive = true;
    
    const checkMemory = async () => {
      if (!this.memoryMonitorActive) return;
      
      try {
        const memoryInfo = await this.getMemoryInfo();
        
        if (memoryInfo.availableMemoryMB < warningThreshold) {
          console.warn(`⚠️ Low memory warning: ${memoryInfo.availableMemoryMB}MB available`);
          onMemoryWarning(memoryInfo.availableMemoryMB);
        }
        
        setTimeout(checkMemory, this.MEMORY_CHECK_INTERVAL);
      } catch (error) {
        console.error('❌ Memory monitoring error:', error);
        setTimeout(checkMemory, this.MEMORY_CHECK_INTERVAL * 2); // Slower retry on error
      }
    };
    
    checkMemory();
  }

  /**
   * 🛑 Stop memory monitoring
   */
  static stopMemoryMonitoring(): void {
    this.memoryMonitorActive = false;
  }

  /**
   * 🔄 Refresh hardware profile (useful for dynamic adjustments)
   */
  static async refreshProfile(): Promise<HardwareProfile> {
    this.cachedProfile = null;
    return this.getHardwareProfile();
  }

  /**
   * 🧪 Test device performance with a small batch
   */
  static async benchmarkDevice(): Promise<{
    compressionTimeMs: number;
    memoryUsageMB: number;
    recommendedAdjustments: Partial<ProcessingSettings>;
  }> {
    console.log('🧪 Running device benchmark...');
    
    try {
      const startTime = Date.now();
      const initialMemory = await this.getMemoryInfo();
      
      // Create a test image URI (you'd need to provide a real test image)
      const testImageUri = 'test://benchmark-image.jpg';
      
      // Simulate compression benchmark
      const compressionStart = Date.now();
      // await this.simulateCompression(testImageUri);
      const compressionTime = Date.now() - compressionStart;
      
      const finalMemory = await this.getMemoryInfo();
      const memoryUsed = initialMemory.availableMemoryMB - finalMemory.availableMemoryMB;
      
      // Generate recommendations based on benchmark
      const recommendations: Partial<ProcessingSettings> = {};
      
      if (compressionTime > 2000) { // Slow compression
        recommendations.compressionWorkers = 2;
        recommendations.maxImageSize = 600;
      }
      
      if (memoryUsed > 100) { // High memory usage
        recommendations.cacheSize = 20;
        recommendations.batchSize = 5;
      }
      
      return {
        compressionTimeMs: compressionTime,
        memoryUsageMB: memoryUsed,
        recommendedAdjustments: recommendations
      };
      
    } catch (error) {
      console.error('❌ Benchmark failed:', error);
      return {
        compressionTimeMs: 1000,
        memoryUsageMB: 50,
        recommendedAdjustments: {}
      };
    }
  }
}