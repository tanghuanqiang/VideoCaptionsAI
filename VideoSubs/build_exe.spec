# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for VideoCaptionsAI
Build via: build.py (or: pyinstaller build_exe.spec)
"""
import os
import sys
from pathlib import Path

_PROJECT_DIR = Path(os.path.abspath(SPECPATH))

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
datas = []

# Frontend dist (required)
frontend = _PROJECT_DIR / 'frontend_dist'
if frontend.is_dir():
    datas.append(('frontend_dist', 'frontend_dist'))
else:
    raise FileNotFoundError(f'Frontend dist not found at {frontend}')

# Whisper assets (optional - created by CI build step)
whisper_assets = _PROJECT_DIR / 'whisper_assets'
if whisper_assets.is_dir():
    datas.append(('whisper_assets', 'whisper/assets'))
else:
    print(f'WARNING: whisper_assets not found at {whisper_assets}, skipping')

# Icon (optional)
icon = _PROJECT_DIR / 'icon.ico'
if icon.is_file():
    datas.append(('icon.ico', '.'))
else:
    print(f'WARNING: icon.ico not found at {icon}')

# .env (optional)
for _env in ['.env', '.env.example']:
    if (_PROJECT_DIR / _env).is_file():
        datas.append((_env, '.'))
        break

# Wrap Analysis in try/except for better error reporting
import traceback as _tb_pyi
try:
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
        'passlib.handlers.bcrypt', 'jenum', 'jose', 'cryptography',
        'torch', 'whisper', 'tiktoken_ext.openai_public',
        'numpy.random', 'numpy.core.multiarray',
        'langchain_core', 'langchain_openai',
        'langgraph.prebuilt', 'langgraph.checkpoint.memory',
        'langgraph.store.memory',
        'langchain_community', 'langchain_text_splitters',
        'langchain_tavily', 'tavily',
        'pydantic.deprecated', 'multipart', 'prometheus_client',
        'dotenv', 'PIL.Image', 'tqdm', 'regex._regex',
        'pystray',
        'unittest.mock', 'ctypes', 'logging.handlers',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=['runtime_hook.py'],
    excludes=[
        'tkinter', 'PyQt5', 'PyQt6', 'PySide2', 'PySide6', 'wx',
        'pytest', 'mypy', 'ruff', 'isort', 'black', 'flake8',
        'IPython', 'jupyter', 'notebook', 'ipykernel',
        'scipy', 'pandas', 'sympy', 'statsmodels',
        'matplotlib', 'seaborn', 'plotly', 'bokeh',
        'tornado', 'twisted',
        'nose', 'coverage',
        'tensorflow', 'keras', 'onnx', 'onnxruntime',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    noarchive=False,
)
except Exception as _pyi_err:
    import sys as _sys_pyi
    _tb_pyi.print_exc()
    print(f"FATAL PyInstaller Analysis error: {_pyi_err}", file=_sys_pyi.stderr)
    _sys_pyi.exit(1)

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
    icon='icon.ico' if icon.is_file() else None,
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