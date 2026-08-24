import os

MAX_UPLOAD_SIZE = int(os.environ.get("MAX_UPLOAD_SIZE", 1024 * 1024 * 500)) # 500MB Default
OUTPUTS_DIR = os.environ.get("OUTPUTS_DIR", "outputs")
FONTS_DIR = os.environ.get("FONTS_DIR", os.path.join(OUTPUTS_DIR, "fonts"))
