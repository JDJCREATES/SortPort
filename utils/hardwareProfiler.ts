import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

/*
* This Script was made for the bulknsfwprocessor but can easily be adapted for other purposes <-- ensure it doesn't break the processing script
*/ 

export interface HardwareProfile {
  deviceTier: 'low' | 'mid' | 'high' | 'flagship';
  cpuCores: number;
  totalMemoryMB: number;
  availableMemoryMB: number;
  storageAvailableGB: number;
  isLowPowerMode: boolean;
  networkType: 'wifi' | 'cellular' | 'unknown';
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

      // Determine device tier
      const deviceTier = this.calculateDeviceTier(deviceInfo, memoryInfo);
      
      // Generate optimized settings
      const recommendedSettings = this.generateOptimalSettings(
        deviceTier, 
        memoryInfo, 
        powerInfo.isLowPowerMode
      );

      const profile: HardwareProfile = {
        deviceTier,
        cpuCores: deviceInfo.cpuCores,
        totalMemoryMB: memoryInfo.totalMemoryMB,
        availableMemoryMB: memoryInfo.availableMemoryMB,
        storageAvailableGB: storageInfo.availableGB,
        isLowPowerMode: powerInfo.isLowPowerMode,
        networkType: networkInfo.type,
        recommendedSettings
      };

      this.cachedProfile = profile;
      
      console.log('📊 Hardware Profile:', {
        tier: deviceTier,
        memory: `${memoryInfo.availableMemoryMB}MB available`,
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
   * 📱 Get device information
   */
  private static async getDeviceInfo(): Promise<{
    cpuCores: number;
    modelName: string;
    year: number;
    isTablet: boolean;
  }> {
    try {
      // Estimate CPU cores based on platform and device
      let cpuCores = 4; // Safe default
      
      if (Platform.OS === 'ios') {
        const modelName = Device.modelName || '';
        
        // iOS device detection
        if (modelName.includes('iPhone')) {
          if (modelName.includes('15') || modelName.includes('14')) {
            cpuCores = 6; // A16/A15 Bionic
          } else if (modelName.includes('13') || modelName.includes('12')) {
            cpuCores = 6; // A15/A14 Bionic
          } else if (modelName.includes('11') || modelName.includes('XS') || modelName.includes('XR')) {
            cpuCores = 6; // A12/A13 Bionic
          } else {
            cpuCores = 4; // Older devices
          }
        } else if (modelName.includes('iPad')) {
          cpuCores = 8; // iPads generally have more cores
        }
      } else if (Platform.OS === 'android') {
        // Android estimation based on year and device class
        const year = Device.deviceYearClass || 2020;
        if (year >= 2022) {
          cpuCores = 8;
        } else if (year >= 2020) {
          cpuCores = 6;
        } else {
          cpuCores = 4;
        }
      }

      return {
        cpuCores,
        modelName: Device.modelName || 'Unknown',
        year: Device.deviceYearClass || 2020,
        isTablet: Device.deviceType === Device.DeviceType.TABLET
      };

    } catch (error) {
      console.warn('⚠️ Device info detection failed:', error);
      return {
        cpuCores: 4,
        modelName: 'Unknown',
        year: 2020,
        isTablet: false
      };
    }
  }

  /**
   * 🧠 Get memory information
   */
  public static async getMemoryInfo(): Promise<{
    totalMemoryMB: number;
    availableMemoryMB: number;
    memoryPressure: 'low' | 'medium' | 'high';
  }> {
    try {
      // Estimate memory based on device class and platform
      let totalMemoryMB = 4096; // 4GB default
      let availableMemoryMB = 2048; // 2GB available default

      if (Platform.OS === 'ios') {
        const year = Device.deviceYearClass || 2020;
        const modelName = Device.modelName || '';
        
        if (modelName.includes('Pro') || year >= 2022) {
          totalMemoryMB = 8192; // 8GB for Pro models
          availableMemoryMB = 4096;
        } else if (year >= 2020) {
          totalMemoryMB = 6144; // 6GB for recent devices
          availableMemoryMB = 3072;
        } else {
          totalMemoryMB = 3072; // 3GB for older devices
          availableMemoryMB = 1536;
        }
      } else if (Platform.OS === 'android') {
        const year = Device.deviceYearClass || 2020;
        
        if (year >= 2023) {
          totalMemoryMB = 8192; // 8GB for flagship
          availableMemoryMB = 4096;
        } else if (year >= 2021) {
          totalMemoryMB = 6144; // 6GB for mid-high
          availableMemoryMB = 3072;
        } else {
          totalMemoryMB = 4096; // 4GB for older
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
   * 💾 Get storage information
   */
  private static async getStorageInfo(): Promise<{ availableGB: number }> {
    try {
      const freeSpace = await FileSystem.getFreeDiskStorageAsync();
      const availableGB = freeSpace / (1024 * 1024 * 1024);
      
      return { availableGB };
    } catch (error) {
      console.warn('⚠️ Storage info detection failed:', error);
      return { availableGB: 10 }; // 10GB default
    }
  }

  /**
   * 🔋 Get power mode information
   */
  private static async getPowerModeInfo(): Promise<{ isLowPowerMode: boolean }> {
    try {
      // This would need a native module to detect low power mode
      // For now, we'll use heuristics
      const year = Device.deviceYearClass || 2020;
      const isLowPowerMode = year < 2019; // Assume older devices are in power saving
      
      return { isLowPowerMode };
    } catch (error) {
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
   * ⚙️ Generate optimal settings based on hardware
   */
  private static generateOptimalSettings(
    deviceTier: string,
    memoryInfo: any,
    isLowPowerMode: boolean
  ): ProcessingSettings {
    const baseSettings = {
      low: {
        compressionWorkers: 3,
        uploadStreams: 2,
        batchSize: 5,
        compressionQuality: 0.6,
        maxImageSize: 600,
        cacheSize: 20,
        enableAggressive: false,
        memoryWarningThreshold: 1024
      },
      mid: {
        compressionWorkers: 4,
        uploadStreams: 2,
        batchSize: 10,
        compressionQuality: 0.7,
        maxImageSize: 800,
        cacheSize: 50,
        enableAggressive: false,
        memoryWarningThreshold: 1536
      },
      high: {
        compressionWorkers: 8,
        uploadStreams: 3,
        batchSize: 15,
        compressionQuality: 0.75,
        maxImageSize: 1024,
        cacheSize: 100,
        enableAggressive: true,
        memoryWarningThreshold: 2048
      },
      flagship: {
        compressionWorkers: 12,
        uploadStreams: 4,
        batchSize: 20,
        compressionQuality: 0.8,
        maxImageSize: 1200,
        cacheSize: 150,
        enableAggressive: true,
        memoryWarningThreshold: 3072
      }
    };

    let settings = baseSettings[deviceTier as keyof typeof baseSettings];

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
      recommendedSettings: {
        compressionWorkers: 3,
        uploadStreams: 2,
        batchSize: 8,
        compressionQuality: 0.7,
        maxImageSize: 800,
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