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
            // 浣跨敤 CDN 鐗堟湰
            const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd';
            await ffmpeg.load({
                coreURL: `${baseURL}/ffmpeg-core.js`,
                wasmURL: `${baseURL}/ffmpeg-core.wasm`,
            });
        } catch (error) {
            console.error('FFmpeg 鍔犺浇澶辫触:', error);
            throw new Error(`FFmpeg 鍔犺浇澶辫触: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return ffmpeg;
}

export const probeMedia = async (filePath: string): Promise<MediaInfo> => {
    // 鏆傛椂浣跨敤绠€鍗曠殑濯掍綋淇℃伅鑾峰彇
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.src = filePath;

        video.onloadedmetadata = () => {
            resolve({
                duration: video.duration,
                width: video.videoWidth,
                height: video.videoHeight,
                fps: 30 // 榛樿甯х巼
            });
        };

        video.onerror = () => {
            // 濡傛灉鍔犺浇澶辫触锛屼娇鐢ㄩ粯璁ゅ€?
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
        // 澶勭悊鏂囦欢杈撳叆
        let file: File;
        if (filePath instanceof File) {
            file = filePath;
        } else {
            // 濡傛灉鏄?blob URL锛岃幏鍙栨枃浠?
            const response = await fetch(filePath);
            const blob = await response.blob();
            file = new File([blob], 'video.mp4', { type: 'video/mp4' });
        }

        // 涓存椂浣跨敤锛氬湪璁剧疆濂芥湰鍦?Whisper.cpp 鎴栧叾浠栨柟妗堝墠锛屽厛浣跨敤鍦ㄧ嚎 API
        const formData = new FormData();
        formData.append('file', file);
        
        // Use configured backend URL or default to the proxy path
        const backendUrl = import.meta.env.VITE_BACKEND_URL || '/api/asr/';

        try {
            console.log(`Connecting to: ${backendUrl}`);
            const response = await fetch(backendUrl, {
                method: 'POST',
                body: formData,
            });

            if (response.status === 413) {
                throw new Error("鏂囦欢杩囧ぇ锛岃秴杩囨湇鍔″櫒闄愬埗");
            }

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
    } catch (error) {
        console.error('Subtitle transcription error:', error);
        throw new Error(`Subtitle transcription failed: ${error instanceof Error ? error.message : String(error)}`);
    }
};