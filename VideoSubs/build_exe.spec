# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for VideoCaptionsAI
Build via: build.py (or: pyinstaller build_exe.spec)
"""
import os
from pathlib import Path

_PROJECT_DIR = Path(os.path.dirname(os.path.abspath(SPECPATH)))

a = Analysis(
    ['main_exe.py'],
    pathex=[str(_PROJECT_DIR)],
    binaries=[
        (r'D:\anaconda\Library\bin', '.'),
    ],
    datas=[
        ('frontend_dist', 'frontend_dist'),
        ('.env', '.'),
        ('whisper_assets', 'whisper/assets'),
        ('icon.ico', '.'),
    ],
    hiddenimports=[
        # Uvicorn / Starlette
        'uvicorn.logging', 'uvicorn.loops', 'uvicorn.loops.auto',
        'uvicorn.protocols.http.auto', 'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan.on',
        'starlette.middleware.cors', 'anyio._backends._asyncio',

        # Database
        'sqlalchemy.ext.declarative', 'sqlalchemy.dialects.sqlite',

        # Auth
        'passlib.handlers.bcrypt', 'python_jose', 'cryptography',

        # ML
        'torch', 'torchaudio', 'whisper', 'openai_whisper',
        'tiktoken_ext.openai_public', 'numpy.random',

        # LangChain / LangGraph
        'langchain_core', 'langchain_openai', 'langgraph.prebuilt',
        'langgraph.checkpoint.sqlite', 'langgraph.checkpoint.memory',
        'langgraph.store.memory', 'langgraph_runtime_inmem',
        'langchain_community', 'langchain_text_splitters', 'langchain_tavily',

        # Utilities
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
        # GUI toolkits
        'tkinter', 'PyQt5', 'PyQt6', 'PySide2', 'PySide6', 'wx',
        # Dev tools
        'pytest', 'mypy', 'ruff', 'isort', 'black', 'flake8',
        'IPython', 'jupyter', 'notebook', 'ipykernel',
        # Unused science
        'scipy', 'pandas', 'sympy', 'statsmodels',
        # Unused viz
        'matplotlib', 'seaborn', 'plotly', 'bokeh',
        # Unused web
        'tornado', 'twisted', 
        # Testing
        'nose', 'coverage',
        # Unused ML
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


