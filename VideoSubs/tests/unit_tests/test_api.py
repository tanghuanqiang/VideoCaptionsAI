"""
API endpoint tests — server must be running.
All imports are lazy to avoid dependency issues in CI.
"""
import os
import pytest


def _server_ready():
    """Check if test server is running."""
    import time
    try:
        import requests
        for _ in range(3):
            try:
                r = requests.get("http://127.0.0.1:8000/", timeout=2)
                if r.status_code == 200:
                    return True
            except Exception:
                time.sleep(1)
    except ImportError:
        pass
    return False


@pytest.mark.skipif(not _server_ready(), reason="Server not running or requests unavailable")
class TestAPI:
    def test_root(self):
        import requests
        r = requests.get("http://127.0.0.1:8000/")
        assert r.status_code == 200

    def test_config_get(self):
        import requests
        r = requests.get("http://127.0.0.1:8000/api/config")
        assert r.status_code == 200
        assert "llm_api_base" in r.json()

    def test_copilot_sse(self):
        import requests
        r = requests.get("http://127.0.0.1:8000/api/copilot/sse?token=bypass", stream=True)
        assert r.status_code == 200
        r.close()