# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for VideoCaptionsAI
Build via: build.py (or: pyinstaller build_exe.spec)
"""
import os
import sys
from pathlib import Path

_PROJECT_DIR = Path(os.path.dirname(os.path.abspath(SPECPATH)))

# Dynamically find FFmpeg/DLL binaries path
_BINARY_PATHS = []
for _candidate in [
    os.path.expandvars(r'%CONDA_PREFIX%%Library\bin'),
    os.path.join(sys.prefix, 'Library', 'bin'),
    os.path.join(sys.base_prefix, 'Library', 'bin'),
    os.path.join(sys.prefix, 'Scripts'),
    r'D:\anaconda\Library\bin',
]:
    if os.path.isdir(_candidate):
        _BINARY_PATHS.append((_candidate, '.'))
        break

# Also search for bin dirs containing ffmpeg/ffprobe DLLs
for _root in ['C:\\ffmpeg', 'C:\\Program Files\\ffmpeg', os.path.expanduser('~\\ffmpeg')]:
    _bin = os.path.join(_root, 'bin')
    if os.path.isdir(_bin) and _bin not in [p[0] for p in _BINARY_PATHS]:
        _BINARY_PATHS.append((_bin, '.'))

# Build data list conditionally
datas = [
    ('frontend_dist', 'frontend_dist'),
    ('whisper_assets', 'whisper/assets'),
    ('icon.ico', '.'),
]
# .env is optional (gitignored) - use .env.example as fallback
for _env in ['.env', '.env.example']:
    if os.path.isfile(_PROJECT_DIR / _env):
        datas.append((_env, '.'))
        break

a = Analysis(
    ['main_exe.py'],
    pathex=[str(_PROJECT_DIR)],
    binaries=_BINARY_PATHS,
    datas=datas,
    hiddenimports=[
        'uvicorn.logging', 'uvicorn.loops', 'uvicorn.loops.auto',
        'uvicorn.protocols.http.auto', 'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan.on',
        'starlette.middleware.cors', 'anyio._backends._asyncio',
        'sqlalchemy.ext.declarative', 'sqlalchemy.dialects.sqlite',
        'passlib.handlers.bcrypt', 'python_jose', 'cryptography',
        'torch', 'torchaudio', 'whisper', 'openai_whisper',
        'tiktoken_ext.openai_public', 'numpy.random',
        'langchain_core', 'langchain_openai', 'langgraph.prebuilt',
        'langgraph.checkpoint.sqlite', 'langgraph.checkpoint.memory',
        'langgraph.store.memory', 'langgraph_runtime_inmem',
        'langchain_community', 'langchain_text_splitters', 'langchain_tavily',
        'pydantic.deprecated', 'python_multipart', 'prometheus_client',
        'tavily', 'ffmpeg_python', 'imageio_ffmpeg',
        'python_dotenv', 'PIL.Image', 'tqdm', 'regex._regex',
        'pystray', 'PIL.Image',
        'unittest.mock', 'ctypes', 'logging.handlers',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=['runtime_hook.py'],
    excludes=[
        'tkinter', 'PyQt5', 'PyQt6', 'PySide2', 'PySide6', 'wx',
        'pytest', 'mypy', 'ruff', 'isort', 'black', 'flake8',
        'IPython', 'jupyter', 'notebook', 'ipykernel',
        'scipy', 'pandas', 'symxy', 'statsmodels',
        'matplotlib', 'seaborn', 'plotly', 'bokeh',
        'tornado', 'twisted',
        'nose', 'coverage',
        'tensorflow', 'keras', 'onnx', 'onnxruntime',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='VideoCaptionsAI',
    debug=False,
    strip=False,
    upx=False,
    console=False,
    target_arch=None,
    icon='icon.ico',
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    name='VideoCaptionsAI',
)
