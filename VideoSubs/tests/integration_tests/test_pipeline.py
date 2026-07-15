"""
Integration test for VideoCaptionsAI pipeline.
Requires a test video file and running server.
"""
import os
import sys
import json
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

TEST_VIDEO = os.environ.get("TEST_VIDEO_PATH", "")


@pytest.mark.skipif(not TEST_VIDEO or not os.path.exists(TEST_VIDEO),
                    reason="No test video provided (set TEST_VIDEO_PATH env var)")
class TestPipeline:
    def test_probe_media(self):
        from src.tools.subtitle_tools import probe_media
        result = probe_media.invoke({"media_path": TEST_VIDEO})
        assert "duration" in result
        assert result.get("width") is not None
        assert result.get("height") is not None

    def test_format_time_functions(self):
        from src.tools.subtitle_tools import format_time
        assert format_time(0, ass=False) == "00:00:00,000"
        assert format_time(0, ass=True) == "0:00:00.00"

    def test_ass_export(self):
        from src.tools.subtitle_tools import format_ass
        from src.agent.Subs import SubtitleDoc, SubtitleEvent
        doc = SubtitleDoc(
            language="en",
            events=[
                SubtitleEvent(id="1", start=0, end=5, text="Hello", style="Default"),
                SubtitleEvent(id="2", start=5, end=10, text="World", style="Default"),
            ]
        )
        path = format_ass.invoke({
            "media_height": 1080,
            "media_width": 1920,
            "subtitle_doc": doc.dict(),
        })
        assert os.path.exists(path)
        content = open(path, 'r', encoding='utf-8').read()
        assert "Hello" in content
        assert "World" in content
        os.remove(path)

    def test_srt_export(self):
        from src.tools.subtitle_tools import format_srt
        doc = {
            "events": [
                {"start": 0, "end": 5, "text": "Test"},
            ]
        }
        path = format_srt.invoke({"subtitle_doc": doc})
        assert os.path.exists(path)
        content = open(path, 'r', encoding='utf-8').read()
        assert "Test" in content
        os.remove(path)