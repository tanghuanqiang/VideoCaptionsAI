import requests

API_URL = "http://127.0.0.1:8000/pipeline/"  # 你的 FastAPI 运行地址
VIDEO_FILE = "F:\\LangGraph\\VideoSubs\\testc.mp4"  # 替换成你本地的视频文件

def test_pipeline():
    with open(VIDEO_FILE, "rb") as f:
        files = {"file": (VIDEO_FILE, f, "video/mp4")}
        data = {
            "lang": "zh",      # 语言（en/zh/...）
            "max_len": 20      # 每句最大长度
        }
        resp = requests.post(API_URL, files=files, data=data)

    if resp.status_code == 200:
        result = resp.json()
        print("✅ Pipeline 成功运行！\n")
        print("🎬 媒体信息:", result["media_info"])
        print("🎧 音频路径:", result["audio_path"])
        print("📝 字幕样例:", result["subs_sample"])
        print("📄 SRT 文件:", result["srt_path"])
        print("📄 ASS 文件:", result["ass_path"])
        print("👀 预览视频:", result["preview_video"])
        print("🔥 硬字幕视频:", result["final_video"])
    else:
        print("❌ 失败:", resp.status_code, resp.text)


if __name__ == "__main__":
    test_pipeline()
