# subtitle_tools.py
import os
import subprocess
import json
import shutil
import codecs
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, UploadFile, Form, File
from fastapi.responses import JSONResponse, FileResponse
from langchain_core.tools import tool
from src.agent.Subs import AssStyle, SubtitleDoc, SubtitleEvent
from src.utils.model_loader import get_whisper_model

out_dir = "outputs"
# whisper_model = whisper.load_model("large-v3") <-- Removed
# ----------------
# 核心工具函数
# ----------------
@tool
def probe_media(media_path: str) -> Dict[str, Any]:
    """
    使用 ffprobe 获取媒体文件的时长、编码等信息。
    参数:
        media_path: 媒体文件路径
    返回:
        媒体信息字典
    """
    # 将工作目录设置为媒体文件所在目录（如果没有目录则使用当前工作目录）
    work_dir = os.path.dirname(media_path) or os.getcwd()
    original_cwd = os.getcwd()
    if work_dir and os.path.isdir(work_dir):
        os.chdir(work_dir)
    filename = os.path.basename(media_path)
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration:stream=index,codec_name,codec_type,width,height",
        "-of", "json", filename
    ]
    # 强制使用 utf-8 解码并在遇到非法字符时替换，避免 Windows 默认 gbk 导致的 UnicodeDecodeError
    result = subprocess.run(cmd, capture_output=True, text=True, check=True, encoding="utf-8", errors="replace")
    info = json.loads(result.stdout)
    # 解析分辨率
    width = None
    height = None
    for stream in info.get("streams", []):
        if stream.get("codec_type") == "video":
            width = stream.get("width")
            height = stream.get("height")
            break
    out = {
        "duration": float(info.get("format", {}).get("duration", 0)),
        "width": width,
        "height": height,
        "streams": info.get("streams", []),
        "format": info.get("format", {})
    }
    # 恢复原始工作目录（如果之前切换过）
    try:
        if os.getcwd() != original_cwd:
            os.chdir(original_cwd)
    except Exception:
        pass
    return out




@tool
def asr_transcribe_video(media_path: str, lang: str = None, model_size: str = None) -> SubtitleDoc:
    """
    使用 Whisper 语音识别模型直接转写视频，输出分段字幕。
    参数:
        media_path: 视频文件路径
        lang: 识别语言（可选）
        model_size: 模型大小 (tiny/base/small/medium)
    返回:
        SubtitleDoc 对象
    """
    model = get_whisper_model(model_size)
    print(f"Starting transcription for {media_path} with model {model_size or 'default'}...")
    result = model.transcribe(media_path, language=lang)
    detected_lang = result.get('language', 'unknown')
    print(f"Transcription finished. Detected language: {detected_lang}")
    
    events = []
    for i, seg in enumerate(result['segments']):
        events.append(SubtitleEvent(
            id=str(i+1),
            start=seg['start'],
            end=seg['end'],
            text=seg['text'],
            style="Default"
        ))
    
    return SubtitleDoc(language=detected_lang, events=events)



@tool
def format_srt(subtitle_doc: Dict[str, Any], ) -> str:
    """
    将字幕结构体格式化为 SRT 文件。
    参数:
        subtitle_doc: 字幕结构体
    返回:
        SRT 文件路径
    """
    srt_path = os.path.join(out_dir, "out.srt")
    with open(srt_path, "w", encoding="utf-8") as f:
        for i, ev in enumerate(subtitle_doc["events"], 1):
            f.write(f"{i}\n")
            f.write(f"{format_time(ev['start'])} --> {format_time(ev['end'])}\n")
            f.write(f"{ev['text']}\n\n")
    return srt_path


@tool
def format_ass(media_height: int, media_width: int, subtitle_doc: Dict[str, Any], styles: Optional[List[AssStyle]] = None) -> str:
    """
    将字幕结构体格式化为 ASS 文件。
    参数:
        subtitle_doc: 字幕结构体
        styles: ASS 样式列表（可选）
    返回:
        ASS 文件路径
    """
    ass_path = os.path.join(out_dir, "out.ass")
    with codecs.open(ass_path, "w", encoding="utf-8") as f:
        f.write(f"[Script Info]\nScriptType: v4.00+\nPlayResX: {media_width}\nPlayResY: {media_height}\n\n")
        f.write("[V4+ Styles]\n")
        f.write("Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
                "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n")
        if styles:
            for style in styles:
                f.write(f"Style: {style.Name},{style.Fontname},{style.Fontsize},{style.PrimaryColour},{style.SecondaryColour or '&H000000FF'},"
                        f"{style.OutlineColour or '&H00000000'},{style.BackColour or '&H64000000'},{-1 if style.Bold else 0},{1 if style.Italic else 0},"
                        f"{1 if style.Underline else 0},{1 if style.StrikeOut else 0},{style.ScaleX or 100},{style.ScaleY or 100},"
                        f"{style.Spacing or 0},{style.Angle or 0},{style.BorderStyle or 1},{style.Outline or 1},{style.Shadow or 0},"
                        f"{style.Alignment or 2},{style.MarginL or 10},{style.MarginR or 10},{style.MarginV or 10},{style.Encoding or 1}\n")
        else:
            f.write("Style: Default,Arial,64,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1\n\n")
        f.write("[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
        for ev in subtitle_doc.get("events", []):
            # ev is expected to be a dict-like object
            text = (ev.get("text") if isinstance(ev, dict) else getattr(ev, "text", "")).replace('\n', ' ').replace('\r', ' ').replace('\ufeff', '')
            style_name = ev.get("style", "Default") if isinstance(ev, dict) else getattr(ev, "style", "Default")
            f.write(f"Dialogue: 0,{format_time(ev['start'], ass=True)},{format_time(ev['end'], ass=True)},{style_name},,0,0,0,,{text}\n")
    return ass_path


@tool
def preview_mux(media_path: str, ass_path: str) -> str:
    """
    生成带字幕预览视频，ASS 文件复制到视频目录，ffmpeg 合成预览。
    参数:
        media_path: 视频文件路径
        ass_path: ASS 字幕文件路径
    返回:
        预览视频文件路径
    """
    work_dir = os.path.dirname(media_path) or os.getcwd()
    video_abs = os.path.abspath(media_path)
    ass_abs = os.path.abspath(ass_path)
    out_filename = "preview.mp4"
    out_path = os.path.join(work_dir, out_filename)

    if not os.path.exists(ass_abs):
        raise FileNotFoundError(f"ASS file not found for ffmpeg: {ass_abs}")

    # FFmpeg filter path escaping for Windows
    # 1. Replace \ with /
    # 2. Escape : as \:
    ass_path_escaped = ass_abs.replace('\\', '/').replace(':', '\\:')

    cmd = [
        "ffmpeg", "-y", "-i", video_abs,
        "-vf", f"ass='{ass_path_escaped}'",
        "-crf", "28", "-preset", "veryfast", out_path
    ]
    log_path = os.path.join(work_dir, "preview_ffmpeg.log")
    try:
        proc = subprocess.run(cmd, check=True, capture_output=True, text=True)
        with open(log_path, "w", encoding="utf-8") as lf:
            lf.write(proc.stdout or "")
            lf.write('\n-----stderr-----\n')
            lf.write(proc.stderr or "")
        return out_path
    except subprocess.CalledProcessError as e:
        with open(log_path, "w", encoding="utf-8") as lf:
            lf.write(e.stdout or "")
            lf.write('\n-----stderr-----\n')
            lf.write(e.stderr or str(e))
        raise


@tool
def final_hard_burn(media_height: int, media_width: int, media_path: str, ass_path: str, task_dir: str) -> str:
    """
    生成硬字幕视频，ASS 文件复制到视频目录，ffmpeg 合成输出。
    参数:
        media_path: 视频文件路径
        ass_path: ASS 字幕文件路径
    返回:
        硬字幕视频文件路径
    """
    media_abs = os.path.abspath(media_path)
    ass_abs = os.path.abspath(ass_path)
    out_filename = "output.mp4"
    out_path = os.path.join(task_dir, out_filename)
    os.makedirs(task_dir, exist_ok=True)

    if not os.path.exists(ass_abs):
        raise FileNotFoundError(f"ASS file not found for ffmpeg: {ass_abs}")

    # FFmpeg filter path escaping for Windows
    ass_path_escaped = ass_abs.replace('\\', '/').replace(':', '\\:')

    cmd = [
        "ffmpeg", "-y", "-i", media_abs,
        "-vf", f"ass='{ass_path_escaped}'",
        "-c:v", "libx264", "-crf", "23", "-preset", "fast", out_path
    ]
    log_path = os.path.join(task_dir, "ffmpeg.log")
    try:
        proc = subprocess.run(cmd, check=True, capture_output=True, text=True)
        with open(log_path, "w", encoding="utf-8") as lf:
            lf.write(proc.stdout or "")
            lf.write('\n-----stderr-----\n')
            lf.write(proc.stderr or "")
        return out_path
    except subprocess.CalledProcessError as e:
        with open(log_path, "w", encoding="utf-8") as lf:
            lf.write(e.stdout or "")
            lf.write('\n-----stderr-----\n')
            lf.write(e.stderr or str(e))
        raise

@tool
def task_db(meta: Dict[str, Any]) -> str:
    """
    记录任务信息到 tasks.json，并返回任务 ID。
    参数:
        meta: 任务元信息字典
    返回:
        任务 ID（字符串）
    """
    db_path = os.path.join("outputs", "tasks.json")
    if os.path.exists(db_path):
        with open(db_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = []
    data.append(meta)
    with open(db_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return str(len(data) - 1)


@tool
def final_soft_mux(media_path: str, sub_path: str) -> str:
    """
    将字幕以软字幕形式封装到视频容器中（默认 MKV）。
    参数:
        media_path: 视频文件路径
        sub_path: 字幕文件路径（SRT/ASS/VTT）
    返回:
        输出视频路径（带软字幕，可开关）
    """
    out_path = os.path.join("outputs", "output.mkv")
    cmd = [
        "ffmpeg", "-y", "-i", media_path, "-i", sub_path,
        "-c", "copy", "-c:s", "srt", out_path
    ]
    subprocess.run(cmd, check=True)
    return out_path


@tool
def auto_subtitle_pipeline(media_path: str, lang: str = None) -> Dict[str, str]:
    """
    自动完成字幕生成流程（提取音频 → ASR → 生成 SRT/ASS）。
    参数:
        media_path: 视频文件路径
        lang: 识别语言（可选）
    返回:
        {"srt": srt_path, "ass": ass_path, "language": lang}
    """
    subs = asr_transcribe_video.invoke({"media_path": media_path, "lang": lang})
    # subs = process_subs(subs, rules={"max_len": 40})
    srt_path = format_srt(subs)
    ass_path = format_ass(subs)
    return {"srt": srt_path, "ass": ass_path, "language": subs.get("language")}



# ----------------
# Helpers
# ----------------
def format_time(t: float, ass: bool = False) -> str:
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = int(t % 60)
    cs = int((t - int(t)) * 100)
    if ass:
        return f"{h:d}:{m:02d}:{s:02d}.{cs:02d}"
    else:
        ms = int((t - int(t)) * 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

