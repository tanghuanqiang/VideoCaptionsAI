// FFmpeg Service for browser-based video processing
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

class FFmpegService {
    private ffmpeg: FFmpeg | null = null;
    private loading: boolean = false;
    private loaded: boolean = false;

    async init(): Promise<FFmpeg> {
        if (this.loaded && this.ffmpeg) {
            return this.ffmpeg;
        }

        if (this.loading) {
            // Wait for loading to complete
            await new Promise(resolve => {
                const checkInterval = setInterval(() => {
                    if (this.loaded) {
                        clearInterval(checkInterval);
                        resolve(true);
                    }
                }, 100);
            });
            return this.ffmpeg!;
        }

        this.loading = true;

        try {
            this.ffmpeg = new FFmpeg();

            // Setup event listeners
            this.ffmpeg.on('log', ({ message }) => {
                console.log('[FFmpeg]', message);
            });

            // Load FFmpeg core preferring local assets, with CDN fallbacks
            let loaded = false;
            const localBase = `${import.meta.env.BASE_URL || '/'}ffmpeg-core`;
            const sources = [
                { label: `本地 ${localBase}`, baseURL: localBase },
                { label: 'unpkg-core-umd', baseURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd' },
                { label: 'jsdelivr-core-umd', baseURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd' },
                { label: 'unpkg-core-esm', baseURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm' },
                { label: 'jsdelivr-core-esm', baseURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm' },
            ];

            for (const src of sources) {
                try {
                    console.log(`尝试从 ${src.label} 加载 FFmpeg...`);
                    // Always convert to Blob URLs to avoid Vite importing from /public directly
                    const coreURL = await toBlobURL(`${src.baseURL}/ffmpeg-core.js`, 'text/javascript');
                    const wasmURL = await toBlobURL(`${src.baseURL}/ffmpeg-core.wasm`, 'application/wasm');
                    await this.ffmpeg.load({ 
                        coreURL, 
                        wasmURL,
                        // @ts-ignore
                        env: { FONTCONFIG_FILE: '/fonts.conf' }
                    });
                    loaded = true;
                    console.log(`FFmpeg 从 ${src.label} 加载成功`);
                    break;
                } catch (err) {
                    console.warn(`从 ${src.label} 加载失败:`, err);
                }
            }

            if (!loaded) {
                throw new Error('本地与CDN均加载失败');
            }

            this.loaded = true;
            console.log('FFmpeg loaded successfully');
            return this.ffmpeg;
        } catch (error) {
            this.loading = false;
            console.error('Failed to load FFmpeg:', error);
            throw new Error(`FFmpeg加载失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async extractAudio(videoFile: File, options?: {
        sampleRate?: number;  // 采样率，默认16000
        bitrate?: string;     // 比特率，默认'64k'
        channels?: number;    // 声道数，默认1（单声道）
    }): Promise<Blob> {
        const ffmpeg = await this.init();

        const {
            sampleRate = 16000,
            bitrate = '64k',
            channels = 1
        } = options || {};

        try {
            const inputName = 'input_video';
            const outputName = 'output_audio.mp3';

            // Write video file to FFmpeg virtual FS
            console.log('Writing video to FFmpeg FS...');
            await ffmpeg.writeFile(inputName, await fetchFile(videoFile));

            // Extract audio with compression
            console.log(`Extracting audio (${sampleRate}Hz, ${bitrate}, ${channels}ch)...`);
            await ffmpeg.exec([
                '-i', inputName,
                '-vn',  // No video
                '-acodec', 'libmp3lame',  // MP3 codec
                '-ar', String(sampleRate),  // Sample rate
                '-ac', String(channels),    // Audio channels
                '-b:a', bitrate,            // Audio bitrate
                outputName
            ]);

            // Read output file
            const data = await ffmpeg.readFile(outputName);

            // Cleanup
            await ffmpeg.deleteFile(inputName);
            await ffmpeg.deleteFile(outputName);

            // Handle both Uint8Array and string types
            const blobData = data instanceof Uint8Array ? data.buffer as ArrayBuffer : new TextEncoder().encode(data).buffer;
            return new Blob([blobData], { type: 'audio/mp3' });
        } catch (error) {
            console.error('Audio extraction failed:', error);
            throw new Error(`音频提取失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async loadFonts() {
        if (!this.ffmpeg) return;
        
        try {
            // Create fonts directory
            try {
                await this.ffmpeg.createDir('/fonts');
            } catch (e) {
                // Directory might already exist
            }
            
            // Load font file
            const fontUrl = `${import.meta.env.BASE_URL || '/'}fonts/NotoSansSC-Regular.woff`;
            console.log(`Loading font from ${fontUrl}...`);
            const fontData = await fetchFile(fontUrl);
            await this.ffmpeg.writeFile('/fonts/NotoSansSC-Regular.woff', fontData);
            
            // Create fonts.conf
            const fontConfig = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>/fonts</dir>
  <cachedir>/tmp/fontconfig</cachedir>
  <config></config>
  <match target="pattern">
    <test qual="any" name="family"><string>Arial</string></test>
    <edit name="family" mode="assign" binding="same"><string>Noto Sans SC</string></edit>
  </match>
  <match target="pattern">
    <test qual="any" name="family"><string>sans-serif</string></test>
    <edit name="family" mode="assign" binding="same"><string>Noto Sans SC</string></edit>
  </match>
  <match target="pattern">
    <test qual="any" name="family"><string>Microsoft YaHei</string></test>
    <edit name="family" mode="assign" binding="same"><string>Noto Sans SC</string></edit>
  </match>
  <match target="pattern">
    <test qual="any" name="family"><string>SimHei</string></test>
    <edit name="family" mode="assign" binding="same"><string>Noto Sans SC</string></edit>
  </match>
  <match target="pattern">
    <test qual="any" name="family"><string>Heiti SC</string></test>
    <edit name="family" mode="assign" binding="same"><string>Noto Sans SC</string></edit>
  </match>
  <match target="pattern">
    <test qual="any" name="family"><string>Default</string></test>
    <edit name="family" mode="assign" binding="same"><string>Noto Sans SC</string></edit>
  </match>
  <!-- Fallback for any font -->
  <match target="pattern">
    <edit name="family" mode="append" binding="strong"><string>Noto Sans SC</string></edit>
  </match>
</fontconfig>`;
            await this.ffmpeg.writeFile('/fonts.conf', fontConfig);
            
            // Try to write to default locations as fallback
            try {
                await this.ffmpeg.createDir('/etc');
                await this.ffmpeg.createDir('/etc/fonts');
                await this.ffmpeg.writeFile('/etc/fonts/fonts.conf', fontConfig);
            } catch (e) {
                // Ignore if directories exist or fail
            }

            // Verify files
            console.log('Verifying font files...');
            const fontsDir = await this.ffmpeg.listDir('/fonts');
            console.log('Files in /fonts:', fontsDir);
            try {
                const etcFontsDir = await this.ffmpeg.listDir('/etc/fonts');
                console.log('Files in /etc/fonts:', etcFontsDir);
            } catch (e) {}

            console.log('Fonts loaded and configured.');
        } catch (error) {
            console.error('Failed to load fonts:', error);
            // Don't throw, try to proceed
        }
    }

    async burnSubtitles(
        videoFile: File,
        assContent: string,
        onProgress?: (progress: number) => void
    ): Promise<Blob> {
        const ffmpeg = await this.init();
        await this.loadFonts();

        try {
            const inputName = 'input.mp4';
            const assName = 'subtitles.ass';
            const outputName = 'output.mp4';

            // Setup progress listener
            if (onProgress) {
                ffmpeg.on('progress', ({ progress }) => {
                    onProgress(Math.round(progress * 100));
                });
            }

            // Write files to FFmpeg virtual FS
            console.log('Writing files to FFmpeg FS...');
            await ffmpeg.writeFile(inputName, await fetchFile(videoFile));
            // write ass content as Uint8Array
            const enc = new TextEncoder();
            await ffmpeg.writeFile(assName, enc.encode(assContent));

            // Burn subtitles
            console.log('Burning subtitles into video...');
            const args = [
                '-i', inputName,
                '-vf', `ass=${assName}:fontsdir=/fonts`,
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-crf', '23',
                '-c:a', 'copy',
                outputName
            ];
            console.log('FFmpeg command:', args.join(' '));
            await ffmpeg.exec(args);

            // Read output file
            console.log('Reading output...');
            const data = await ffmpeg.readFile(outputName);

            // Cleanup
            await ffmpeg.deleteFile(inputName);
            await ffmpeg.deleteFile(assName);
            await ffmpeg.deleteFile(outputName);

            // Handle both Uint8Array and string types
            const blobData = data instanceof Uint8Array ? data.buffer as ArrayBuffer : new TextEncoder().encode(String(data)).buffer;
            return new Blob([blobData], { type: 'video/mp4' });
        } catch (error) {
            console.error('Subtitle burning failed:', error);
            throw new Error(`字幕烧录失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    terminate() {
        if (this.ffmpeg && this.loaded) {
            this.ffmpeg.terminate();
            this.ffmpeg = null;
            this.loaded = false;
        }
    }
}

// Export singleton instance
export const ffmpegService = new FFmpegService();
