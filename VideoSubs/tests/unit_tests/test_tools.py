import os
from src.tools.subtitle_tools import (
    asr_transcribe_video,
    probe_media,
    process_subs, format_srt, format_ass,
    preview_mux, final_hard_burn, save_assets, task_db
)

VIDEO_PATH = r"F:\LangGraph\VideoSubs\test.mp4"

def test_pipeline():
    report = []
    report.append("\n==============================\n 视频字幕工具测试报告 \n==============================")

    report.append("\n[Step1] 媒体信息探测 (probe_media)")
    info = probe_media.invoke({"media_path": VIDEO_PATH})
    report.append(f"媒体流信息: {info}")


    report.append("\n[Step3] 语音识别 (ASR)")
    subs = asr_transcribe_video.invoke({"media_path": VIDEO_PATH})
    first_event = subs["events"][:1]
    report.append(f"首条字幕事件: {first_event}")

    report.append("\n[Step4] 字幕断句处理 (process_subs)")
    subs2 = process_subs.invoke({"subtitle_doc": subs, "rules": {"max_len": 20}})
    processed_events = subs2["events"][:2]
    report.append(f"处理后前两条事件: {processed_events}")

    report.append("\n[Step5] 导出 SRT 字幕 (format_srt)")
    srt_path = format_srt.invoke({"subtitle_doc": subs2})
    report.append(f"SRT 文件路径: {srt_path}")

    report.append("\n[Step6] 导出 ASS 字幕 (format_ass)")
    ass_path = format_ass.invoke({"subtitle_doc": subs2})
    report.append(f"ASS 文件路径: {ass_path}")

    # report.append("\n[Step7] 导出 VTT 字幕 (format_vtt)")
    # vtt_path = format_vtt.invoke({"subtitle_doc": subs2})
    # report.append(f"VTT 文件路径: {vtt_path}")

    report.append("\n[Step8] 生成预览视频 (preview_mux)")
    preview = preview_mux.invoke({"media_path": VIDEO_PATH, "ass_path": ass_path})
    report.append(f"预览视频路径: {preview}")

    report.append("\n[Step9] 生成硬字幕视频 (final_hard_burn)")
    output = final_hard_burn.invoke({"media_path": VIDEO_PATH, "ass_path": ass_path})
    report.append(f"硬字幕视频路径: {output}")

    report.append("\n[Step10] 保存资源 (save_assets)")
    assets = save_assets.invoke({"paths": [srt_path, ass_path, vtt_path], "meta": {"source": VIDEO_PATH}})
    report.append(f"资源清单: {assets}")

    report.append("\n[Step11] 任务记录 (task_db)")
    task = task_db.invoke({"meta": {"video": VIDEO_PATH, "status": "done"}})
    report.append(f"任务ID: {task}")

    report.append("\n==============================\n 测试全部完成 \n==============================\n")
    print("\n".join(report))

if __name__ == "__main__":
    test_pipeline()
