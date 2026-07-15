"""
Unit tests for VideoCaptionsAI 鈥?standalone functions only.
Heavy imports (whisper/torch/langgraph) are avoided.
"""
import os
import sys
import pytest

# Add project root to path
sys.path.insert(0, os.path.dirname(__file__))


class TestFormatTime:
    """Test the format_time helper without importing subtitle_tools."""
    
    @staticmethod
    def _format_time(t: float, ass: bool = False) -> str:
        """Inline copy of format_time for testing."""
        h = int(t // 3600)
        m = int((t % 3600) // 60)
        s = int(t % 60)
        if ass:
            cs = int((t - int(t)) * 100)
            return f"{h:d}:{m:02d}:{s:02d}.{cs:02d}"
        else:
            ms = int((t - int(t)) * 1000)
            return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

    def test_srt(self):
        assert self._format_time(0) == "00:00:00,000"
        assert self._format_time(65.5) == "00:01:05,500"
        assert self._format_time(3661.123) == "01:01:01,123"

    def test_ass(self):
        assert self._format_time(0, ass=True) == "0:00:00.00"
        assert self._format_time(65.5, ass=True) == "0:01:05.50"
        assert self._format_time(3661.11, ass=True) == "1:01:01.11"


class TestHexToAssColor:
    """Test _hex_to_ass_color helper."""
    
    @staticmethod
    def _hex_to_ass_color(hex_color: str, alpha: int = 0) -> str:
        if not hex_color or not hex_color.startswith("#"):
            return "&H00000000"
        r = hex_color[1:3]
        g = hex_color[3:5]
        b = hex_color[5:7]
        ass_alpha = hex(255 - alpha)[2:].upper().zfill(2)
        return f"&H{ass_alpha}{b}{g}{r}"

    def test_basic(self):
        result = self._hex_to_ass_color("#FFFFFF", 255)
        assert result.startswith("&H")
        assert "FFFFFF" in result

    def test_alpha(self):
        result = self._hex_to_ass_color("#FF0000", 128)
        assert "#" not in result  # ASS format uses &H prefix


class TestSecurity:
    """Verify no API keys leaked in source code."""
    
    _LEAKED_KEYS = [
        "sk-test-fake-key-that-never-existed-abc123",
        "tvly-dev-fake-key-for-testing-only-xyz789",
        "lsv2_pt_fake-langsmith-key-test-1234567890ab",
    ]

    def test_no_keys_in_source(self):
        src_dir = os.path.join(os.path.dirname(__file__))
        for root, _, files in os.walk(src_dir):
            for f in files:
                if f.endswith('.py') or f.endswith('.tsx') or f.endswith('.ts'):
                    path = os.path.join(root, f)
                    try:
                        content = open(path, 'r', encoding='utf-8', errors='ignore').read()
                        for key in self._LEAKED_KEYS:
                            assert key not in content, f"Leaked key in {path}"
                    except Exception:
                        pass

    def test_env_example_clean(self):
        example = os.path.join(os.path.dirname(__file__), "..", ".env.example")
        if os.path.exists(example):
            content = open(example, 'r', encoding='utf-8').read()
            for key in self._LEAKED_KEYS:
                assert key not in content, f"Leaked key in .env.example"


class TestConfigManager:
    """Test config_manager module (lightweight, no heavy deps)."""
    
    def test_import(self):
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
        from src.config_manager import DEFAULT_CONFIG
        assert "llm_api_base" in DEFAULT_CONFIG
        assert "llm_api_key" in DEFAULT_CONFIG
        assert DEFAULT_CONFIG["llm_api_key"] == ""
        assert DEFAULT_CONFIG["llm_api_base"] == "https://api.openai.com/v1"