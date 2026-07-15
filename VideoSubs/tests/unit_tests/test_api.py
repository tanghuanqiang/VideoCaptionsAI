"""
API endpoint tests — server must be running.
Skipped in CI (no server available).
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("TEST_BASE_URL", "http://127.0.0.1:8000")


def server_ready():
    import time
    for _ in range(3):
        try:
            r = requests.get(f"{BASE_URL}/", timeout=2)
            return r.status_code == 200
        except Exception:
            time.sleep(1)
    return False


@pytest.mark.skipif(not server_ready(), reason="Server not running")
class TestAPI:
    def test_root(self):
        r = requests.get(f"{BASE_URL}/")
        assert r.status_code == 200

    def test_config_get(self):
        r = requests.get(f"{BASE_URL}/api/config")
        assert r.status_code == 200
        data = r.json()
        assert "llm_api_base" in data

    def test_copilot_sse(self):
        r = requests.get(f"{BASE_URL}/api/copilot/sse?token=bypass", stream=True)
        assert r.status_code == 200
        r.close()