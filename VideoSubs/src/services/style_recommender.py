"""
Video resolution-aware subtitle style recommender.
Generates optimal ASS style parameters based on video dimensions and aspect ratio.
"""

from src.agent.Subs import AssStyle


def generate_recommended_style(width: int, height: int) -> AssStyle:
    if not width or width <= 0:
        width = 1920
    if not height or height <= 0:
        height = 1080

    aspect_ratio = width / height

    font_size = 80
    margin_v = 50
    margin_side = 30
    outline = 2.5

    if aspect_ratio >= 1.2:
        scale = height / 1080.0
        font_size = int(75 * scale)
        margin_v = int(60 * scale)
        margin_side = int(50 * scale)
        outline = 3.0 * scale
    elif aspect_ratio <= 0.8:
        scale = width / 1080.0
        font_size = int(95 * scale)
        margin_v = int(350 * scale)
        margin_side = int(60 * scale)
        outline = 3.5 * scale
    else:
        scale = width / 1080.0
        font_size = int(70 * scale)
        margin_v = int(80 * scale)
        margin_side = int(40 * scale)
        outline = 3.0 * scale

    font_size = max(24, font_size)
    margin_v = max(10, margin_v)
    outline = max(1.0, outline)

    return AssStyle(
        id="Recommended",
        Name="Recommended",
        FontName="Arial",
        FontSize=font_size,
        PrimaryColour="#FFFFFF",
        SecondaryColour="#000000",
        OutlineColour="#000000",
        BackColour="#000000",
        Bold=False,
        Italic=False,
        Underline=False,
        StrikeOut=False,
        ScaleX=100,
        ScaleY=100,
        Spacing=0,
        Angle=0,
        BorderStyle=0,
        Outline=outline,
        Shadow=0,
        Alignment=2,
        MarginL=10,
        MarginR=10,
        MarginV=margin_v,
        Encoding=1,
        PrimaryAlpha=255,
        SecondaryAlpha=0,
        OutlineAlpha=0,
        BackAlpha=0,
    )
