/**
 * 设备检测工具 - 用于判断是否应该使用后端烧录
 */

export interface DeviceCapabilities {
  isMobile: boolean;
  isLowMemory: boolean;
  isLowEndDevice: boolean;
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

/**
 * 检测设备能力
 */
export function detectDeviceCapabilities(): DeviceCapabilities {
  const isMobile = /mobile|android|ios|iphone|ipad|ipod/i.test(navigator.userAgent);
  
  // 检测设备内存（部分浏览器支持）
  const deviceMemory = (navigator as any).deviceMemory; // GB
  const isLowMemory = deviceMemory ? deviceMemory < 4 : false;
  
  // 检测CPU核心数
  const hardwareConcurrency = navigator.hardwareConcurrency || 4;
  const isLowEndDevice = hardwareConcurrency < 4;
  
  return {
    isMobile,
    isLowMemory,
    isLowEndDevice,
    deviceMemory,
    hardwareConcurrency,
  };
}

/**
 * 判断是否应该使用后端烧录
 * 
 * @param videoFile - 视频文件
 * @param forceBackend - 强制使用后端
 * @returns true表示使用后端，false表示使用前端
 */
export function shouldUseBackendBurn(
  videoFile: File,
  forceBackend: boolean = false
): boolean {
  // 用户强制选择
  if (forceBackend) {
    return true;
  }
  
  const capabilities = detectDeviceCapabilities();
  const videoSizeMB = videoFile.size / (1024 * 1024);
  
  // 决策逻辑：
  // 1. 移动设备 → 后端
  if (capabilities.isMobile) {
    console.log('[设备检测] 移动设备，使用后端烧录');
    return true;
  }
  
  // 2. 低内存设备 (< 4GB) → 后端
  if (capabilities.isLowMemory) {
    console.log('[设备检测] 低内存设备，使用后端烧录');
    return true;
  }
  
  // 3. 视频文件过大 (> 500MB) → 后端
  if (videoSizeMB > 500) {
    console.log(`[设备检测] 视频过大 (${videoSizeMB.toFixed(1)}MB)，使用后端烧录`);
    return true;
  }
  
  // 4. 低端设备 (< 4核) + 中大型视频 (> 200MB) → 后端
  if (capabilities.isLowEndDevice && videoSizeMB > 200) {
    console.log(`[设备检测] 低端设备 + 中大型视频 (${videoSizeMB.toFixed(1)}MB)，使用后端烧录`);
    return true;
  }
  
  // 默认使用前端
  console.log('[设备检测] 设备性能良好，使用前端烧录');
  return false;
}

/**
 * 获取推荐烧录模式的说明文本
 */
export function getRecommendedModeText(videoFile: File): string {
  const useBackend = shouldUseBackendBurn(videoFile, false);
  const videoSizeMB = videoFile.size / (1024 * 1024);
  const capabilities = detectDeviceCapabilities();
  
  if (useBackend) {
    const reasons: string[] = [];
    if (capabilities.isMobile) reasons.push('移动设备');
    if (capabilities.isLowMemory) reasons.push('内存较低');
    if (videoSizeMB > 500) reasons.push('视频文件过大');
    if (capabilities.isLowEndDevice && videoSizeMB > 200) reasons.push('设备性能较低');
    
    return `推荐使用服务器处理（${reasons.join('、')}）`;
  } else {
    return `推荐使用本地处理（无需上传，保护隐私）`;
  }
}
