"""
Unit tests for VideoCaptionsAI subtitle tools.
Run with: pytest tests/unit_tests/ -v
"""
import os
import sys
import json
import tempfile
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from src.tools.subtitle_tools import (
    probe_media,
    format_time,
    _hex_to_ass_color,
)


class TestFormatTime:
    def test_format_time_srt(self):
        assert format_time(65.5, ass=False) == "00:01:05,500"
        assert format_time(0, ass=False) == "00:00:00,000"
        assert format_time(3661.123, ass=False) == "01:01:01,123"

    def test_format_time_ass(self):
        assert format_time(65.5, ass=True) == "0:01:05.50"
        assert format_time(3661.12, ass=True) == "1:01:01.11"


class TestHexToAssColor:
    def test_basic_conversion(self):
        result = _hex_to_ass_color("#FFFFFF", 255)
        assert "&H" in result
        assert result.endswith("FFFFFF")

    def test_with_alpha(self):
        result = _hex_to_ass_color("#FF0000", 128)
        assert result[2:4] != "00"  # Alpha should be non-zero


class TestProbeMedia:
    def test_probe_nonexistent_file(self):
        """probe_media should raise on nonexistent file"""
        with pytest.raises(Exception):
            probe_media.invoke({"media_path": "/nonexistent/video.mp4"})


class TestAppImport:
    def test_app_imports(self):
        """Verify all core modules import correctly"""
        from src.app import app
        assert app is not None
        assert app.title == "VideoCaptionsAI"

    def test_config_manager(self):
        from src.config_manager import get_config, DEFAULT_CONFIG
        config = get_config()
        assert "llm_api_base" in config
        assert "llm_api_key" in config

    def test_model_loader_import(self):
        from src.utils.model_loader import ModelSize
        assert "base" in ModelSize.__args__
        assert "large-v3" in ModelSize.__args__


class TestSecurity:
    def test_no_hardcoded_keys_in_source(self):
        """Verify no API keys are hardcoded in source files"""
        src_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'src')
        for root, _, files in os.walk(src_dir):
            for f in files:
                if f.endswith('.py'):
                    path = os.path.join(root, f)
                    content = open(path, 'r', encoding='utf-8').read()
                    assert 'sk-781e1cdaa96c444a9096b394f7d87c18' not in content, \
                        f"Leaked key found in {path}"
                    assert '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' not in content, \
                        f"Leaked Tavily key found in {path}"

    def test_env_example_has_no_real_keys(self):
        """Verify .env.example has no real keys"""
        example_path = os.path.join(os.path.dirname(__file__), '..', '..', '.env.example')
        if os.path.exists(example_path):
            content = open(example_path, 'r', encoding='utf-8').read()
            assert 'sk-781e1cda' not in content, "Real key in .env.example!"
