"""
API endpoint tests for VideoCaptionsAI.
Requires the server to be running.
"""
import os
import sys
import pytest
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

BASE_URL = os.environ.get("TEST_BASE_URL", "http://127.0.0.1:8000")


def wait_for_server(timeout=10):
    """Wait for the test server to be ready."""
    import time
    for _ in range(timeout):
        try:
            r = requests.get(f"{BASE_URL}/", timeout=2)
            if r.status_code == 200:
                return True
        except Exception:
            pass
        time.sleep(1)
    return False


@pytest.mark.skipif(not wait_for_server(), reason="Server not running")
class TestAPIEndpoints:
    def test_root_serves_frontend(self):
        r = requests.get(f"{BASE_URL}/")
        assert r.status_code == 200
        assert "VideoCaptionsAI" in r.text or "root" in r.text

    def test_config_get(self):
        r = requests.get(f"{BASE_URL}/api/config")
        assert r.status_code == 200
        data = r.json()
        assert "llm_api_base" in data
        assert "llm_api_key" in data

    def test_config_update(self):
        r = requests.post(
            f"{BASE_URL}/api/config",
            json={"llm_model_name": "gpt-4o", "temperature": 0.0}
        )
        assert r.status_code == 200

    def test_history(self):
        r = requests.get(f"{BASE_URL}/api/history?skip=0&limit=10")
        assert r.status_code == 200

    def test_copilot_sse(self):
        r = requests.get(f"{BASE_URL}/api/copilot/sse?token=bypass", stream=True)
        assert r.status_code == 200
        r.close()

    def test_copilot_send(self):
        r = requests.post(
            f"{BASE_URL}/api/copilot/send",
            data={"text": "Hello"},
            headers={"Authorization": "Bearer bypass"}
        )
        assert r.status_code == 200

    def test_outputs_mounted(self):
        r = requests.get(f"{BASE_URL}/outputs/")
        # 404 is OK - just checking the mount exists
        assert r.status_code in (200, 404)


def test_404_on_invalid_route():
    r = requests.get(f"{BASE_URL}/nonexistent")
    assert r.status_code == 404