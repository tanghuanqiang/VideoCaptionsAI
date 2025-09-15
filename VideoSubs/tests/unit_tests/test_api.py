# test_api.py
import requests

VIDEO_PATH = r"F:\LangGraph\VideoSubs\test.mp4"
API_URL = "http://127.0.0.1:8000"

def test_probe():
    with open(VIDEO_PATH, "rb") as f:
        files = {"file": f}
        r = requests.post(f"{API_URL}/probe/", files=files)
    print("Probe response:", r.json())

def test_extract():
    with open(VIDEO_PATH, "rb") as f:
        files = {"file": f}
        r = requests.post(f"{API_URL}/extract/", files=files)
    print("Extract response:", r.json())

def test_asr():
    with open(VIDEO_PATH, "rb") as f:
        files = {"file": f}
        data = {"lang": "en"}
        r = requests.post(f"{API_URL}/asr/", files=files, data=data)
    print("ASR response:", r.json())

if __name__ == "__main__":
    test_probe()
    test_extract()
    test_asr()
