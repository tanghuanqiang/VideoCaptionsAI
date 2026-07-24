import os
import sys

_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from src.tools.subtitle_tools import normalize_word_timestamps


def test_normalize_word_timestamps_discards_invalid_and_marks_source():
    result = normalize_word_timestamps([
        {"word": "你", "start": 0.0, "end": 0.2},
        {"word": "在", "start": "0.2", "end": "0.4"},
        {"word": "", "start": 0.4, "end": 0.5},
        {"word": "坏", "start": "not-a-time", "end": 0.5},
    ])
    assert result == [
        {"word": "你", "start": 0.0, "end": 0.2, "timingSource": "asr-word"},
        {"word": "在", "start": 0.2, "end": 0.4, "timingSource": "asr-word"},
    ]


def test_normalize_word_timestamps_returns_none_when_empty():
    assert normalize_word_timestamps(None) is None
