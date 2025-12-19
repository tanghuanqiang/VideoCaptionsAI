import type { SubtitleDoc } from '../types/subtitleTypes';

interface MediaInfo {
    duration: number;
    width: number;
    height: number;
    fps: number;
}

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

async function initFFmpeg() {
    if (!ffmpeg) {
        ffmpeg = new FFmpeg();
        try {
            // 使用 CDN 版本
            const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd';
            await ffmpeg.load({
                coreURL: `${baseURL}/ffmpeg-core.js`,
                wasmURL: `${baseURL}/ffmpeg-core.wasm`,
            });
        } catch (error) {
            console.error('FFmpeg 加载失败:', error);
            throw new Error(`FFmpeg 加载失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return ffmpeg;
}

export const probeMedia = async (filePath: string): Promise<MediaInfo> => {
    // 暂时使用简单的媒体信息获取
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.src = filePath;

        video.onloadedmetadata = () => {
            resolve({
                duration: video.duration,
                width: video.videoWidth,
                height: video.videoHeight,
                fps: 30 // 默认帧率
            });
        };

        video.onerror = () => {
            // 如果加载失败，使用默认值
            resolve({
                duration: 0,
                width: 1920,
                height: 1080,
                fps: 30
            });
        };
    });
};

export const asrTranscribeVideo = async (filePath: string | File): Promise<SubtitleDoc> => {
    try {
        // 处理文件输入
        let file: File;
        if (filePath instanceof File) {
            file = filePath;
        } else {
            // 如果是 blob URL，获取文件
            const response = await fetch(filePath);
            const blob = await response.blob();
            file = new File([blob], 'video.mp4', { type: 'video/mp4' });
        }

        // 临时使用：在设置好本地 Whisper.cpp 或其他方案前，先使用在线 API
        const formData = new FormData();
        formData.append('video', file);
        
        // Use configured backend URL or default to the proxy path
        const backendUrl = import.meta.env.VITE_BACKEND_URL || '/api/transcribe';

        try {
            console.log(`Connecting to: ${backendUrl}`);
            const response = await fetch(backendUrl, {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                const result = await response.json() as { language: string, segments: Array<{start: number, end: number, text: string}> };

                return {
                    language: result.language || 'zh',
                    events: result.segments.map((segment, index) => ({
                            id: index.toString(),
                    start: segment.start,
                    end: segment.end,
                    text: segment.text.trim(),
                }))
            };
        } else {
            const errorText = await response.text();
            throw new Error(`Backend response error: ${response.status} ${response.statusText} - ${errorText}`);
        }
    } catch (error) {
        console.error('Subtitle transcription error:', error);
        throw new Error(`Subtitle transcription failed: ${error instanceof Error ? error.message : String(error)}`);
    }
};

export const formatSrt = (doc: SubtitleDoc): string => {
    let srt = '';
    doc.events?.forEach((event, index) => {
        const startTime = formatTimestamp(event.start);
        const endTime = formatTimestamp(event.end);
        
        srt += `${index + 1}\n`;
        srt += `${startTime} --> ${endTime}\n`;
        srt += `${event.text}\n\n`;
    });
    return srt;
};

export const formatAss = (doc: SubtitleDoc): string => {
    const header = `[Script Info]
Title: Converted ASS file
ScriptType: v4.00+
Collisions: Normal
PlayResX: ${doc.resolution?.width || 1920}
PlayResY: ${doc.resolution?.height || 1080}
Timer: 100.0000

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

    const events = doc.events?.map(event => {
        const start = formatAssTime(event.start);
        const end = formatAssTime(event.end);
        const style = event.style || 'Default';
        
        return `Dialogue: 0,${start},${end},${style},,0,0,0,,${event.text}`;
    }).join('\n') || '';

    return `${header}\n${events}`;
};

export const finalHardBurn = async (
    videoPath: string,
    subtitlePath: string,
    targetPath: string
): Promise<void> => {
    try {
        const ff = await initFFmpeg();
        
        // 获取视频和字幕文件
        console.log('正在加载视频和字幕文件...');
        const videoData = await fetchFile(videoPath);
        const subtitleData = await fetchFile(subtitlePath);
        
        // 写入文件到 FFmpeg 虚拟文件系统
        await ff.writeFile('input.mp4', videoData);
        await ff.writeFile('subtitles.ass', subtitleData);
        
        console.log('正在烧录字幕...');
        // 使用 FFmpeg 命令烧录字幕
        await ff.exec([
            '-i', 'input.mp4',           // 输入视频
            '-vf', 'ass=subtitles.ass',  // 使用 ASS 字幕
            '-c:v', 'libx264',           // 使用 H.264 编码
            '-preset', 'medium',         // 编码速度
            '-crf', '23',               // 视频质量，值越小质量越好（范围 0-51）
            '-c:a', 'copy',             // 复制音频流
            'output.mp4'                // 输出文件
        ]);
        
        // 读取输出视频
        const outputData = await ff.readFile('output.mp4');
        
        // 创建下载链接
        const blob = new Blob([outputData as unknown as BlobPart], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = targetPath.split('/').pop() || 'output.mp4';
        
        // 触发下载
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        // 清理临时文件
        await ff.deleteFile('input.mp4');
        await ff.deleteFile('subtitles.ass');
        await ff.deleteFile('output.mp4');
        
        console.log('字幕烧录完成！');
    } catch (error) {
        console.error('字幕烧录失败:', error);
        throw new Error(`字幕烧录失败: ${error instanceof Error ? error.message : String(error)}`);
    }
};

// Helper function to format time for ASS format (H:MM:SS.cc)
const formatAssTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const centisecs = Math.floor((seconds % 1) * 100);
    
    return `${padZero(hours)}:${padZero(minutes)}:${padZero(secs)}.${padZero(centisecs)}`;
};

// Helper function to format timestamps for SRT
const formatTimestamp = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    
    return `${padZero(hours)}:${padZero(minutes)}:${padZero(secs)},${padZero(ms, 3)}`;
};

const padZero = (num: number, width: number = 2): string => {
    return num.toString().padStart(width, '0');
};
