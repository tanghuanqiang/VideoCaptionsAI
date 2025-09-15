from pydantic import BaseModel
import string
from typing import Optional, List, Dict

class SubtitleEvent(BaseModel):
    id: str
    start: float
    end: float
    text: str
    speaker: Optional[str] = None
    words: Optional[List[Dict[str, object]]] = None
    style: Optional[str] = None

class AssStyle(BaseModel):
    Name: str
    Fontname: str
    Fontsize: float
    PrimaryColour: str
    SecondaryColour: Optional[str] = None
    OutlineColour: Optional[str] = None
    BackColour: Optional[str] = None
    Bold: Optional[bool] = None
    Italic: Optional[bool] = None
    Underline: Optional[bool] = None
    StrikeOut: Optional[bool] = None
    ScaleX: Optional[float] = None
    ScaleY: Optional[float] = None
    Spacing: Optional[float] = None
    Angle: Optional[float] = None
    BorderStyle: Optional[int] = None  # 1:描边 3:盒
    Outline: Optional[float] = None
    Shadow: Optional[float] = None
    Alignment: Optional[int] = None    # 1..9 (Numpad)
    MarginL: Optional[int] = None
    MarginR: Optional[int] = None
    MarginV: Optional[int] = None
    Encoding: Optional[int] = None      # 0:ANSI, 1:Default 等

class SubtitleDoc(BaseModel):
    language: Optional[str] = None
    resolution: Optional[Dict[str, int]] = None
    fps: Optional[float] = None
    events: Optional[List[SubtitleEvent]] = None