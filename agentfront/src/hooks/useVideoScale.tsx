import { useEffect, useState } from "react";

export function useVideoScale(videoRef: React.RefObject<HTMLVideoElement>) {
  const [scale, setScale] = useState({ scaleX: 1, scaleY: 1 });

  useEffect(() => {
    function updateScale() {
      if (!videoRef.current) return;

      const video = videoRef.current;
      const container = video.parentElement;
      if (!container) return;

      const videoRatio = video.videoWidth / video.videoHeight;
      const containerRatio = container.clientWidth / container.clientHeight;

      let scaleX = 1, scaleY = 1;

      if (videoRatio > containerRatio) {
        // 视频更宽，受限于宽度
        const expectedHeight = container.clientWidth / videoRatio;
        scaleY = expectedHeight / container.clientHeight;
      } else {
        // 视频更高，受限于高度
        const expectedWidth = container.clientHeight * videoRatio;
        scaleX = expectedWidth / container.clientWidth;
      }

      setScale({ scaleX, scaleY });
    }

    // 初始 & 窗口变化时更新
    updateScale();
    window.addEventListener("resize", updateScale);
    videoRef.current?.addEventListener("loadedmetadata", updateScale);

    return () => {
      window.removeEventListener("resize", updateScale);
      videoRef.current?.removeEventListener("loadedmetadata", updateScale);
    };
  }, [videoRef]);

  return scale;
}
export default useVideoScale;