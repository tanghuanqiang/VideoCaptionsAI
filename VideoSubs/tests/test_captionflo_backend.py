import asyncio

from src.routers.export import export_subtitle
from src.services.caption_payload import require_ass_text, unwrap_export_payload


ASS = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Noto Sans SC,64,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,你好
"""


def _read_response(response) -> bytes:
    async def read():
        body = b""
        async for chunk in response.body_iterator:
            body += chunk
        return body

    return asyncio.run(read())


def test_flat_ass_export_returns_exact_frontend_document():
    response = asyncio.run(
        export_subtitle(
            {
                "ass": ASS,
                "format": "ass",
                "projectName": "test",
                "videoName": "video.mp4",
                "resolution": {"width": 1920, "height": 1080},
            }
        )
    )

    assert response.media_type == "text/x-ass"
    assert _read_response(response).decode("utf-8") == ASS


def test_generated_frontend_wrapper_is_supported_for_srt():
    response = asyncio.run(
        export_subtitle({"format": "srt", "payload": {"ass": ASS}})
    )

    content = _read_response(response).decode("utf-8")
    assert "00:00:00,000 --> 00:00:01,000" in content
    assert "你好" in content


def test_ass_payload_validation():
    assert unwrap_export_payload({"format": "ass", "payload": {"ass": ASS}})["ass"] == ASS
    assert require_ass_text({"ass": ASS}) == ASS
