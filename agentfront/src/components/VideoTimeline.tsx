import React from "react";
import "./VideoTimeline.css";

const thumbnails = [
  // 示例缩略图
  "https://via.placeholder.com/80x45?text=1",
  "https://via.placeholder.com/80x45?text=2",
  "https://via.placeholder.com/80x45?text=3",
];

const VideoTimeline: React.FC = () => {
  return (
    <div className="video-timeline">
      <div className="timeline-bar">
        {thumbnails.map((src, idx) => (
          <img key={idx} src={src} alt={`缩略图${idx + 1}`} className="timeline-thumb" />
        ))}
      </div>
      <input type="range" min={0} max={100} className="timeline-slider" />
    </div>
  );
};

export default VideoTimeline;
