# -*- mode: python ; coding: utf-8 -*-
"""Minimal PyInstaller spec - auto-discover dependencies"""
import os, sys
from pathlib import Path

_PROJECT_DIR = Path(os.path.abspath(SPECPATH))

datas = []
frontend = _PROJECT_DIR / 'frontend_dist'
if frontend.is_dir():
    datas.append(('frontend_dist', 'frontend_dist'))
else:
    raise FileNotFoundError(f'frontend_dist not found at {frontend}')

for item, dest in [('whisper_assets', 'whisper/assets'), ('icon.ico', '.'), ('.env', '.'), ('.env.example', '.')]:
    p = _PROJECT_DIR / item
    if p.exists():
        datas.append((item, dest))

a = Analysis(
    ['main_exe.py'],
    pathex=[str(_PROJECT_DIR)],
    binaries=[],
    datas=datas,
    hiddenimports=['pystray', 'PIL.Image', 'unittest.mock'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=['runtime_hook.py'],
    excludes=['tkinter', 'PyQt5', 'PyQt6', 'PySide2', 'PySide6', 'wx', 'pytest', 'IPython', 'jupyter', 'scipy', 'pandas', 'matplotlib', 'tensorflow', 'keras'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data)

exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name='VideoCaptionsAI',
    debug=False, strip=False, upx=False,
    console=False, target_arch=None,
    icon='icon.ico' if (_PROJECT_DIR / 'icon.ico').is_file() else None,
)

coll = COLLECT(
    exe, a.binaries, a.zipfiles, a.datas,
    strip=False, upx=False,
    name='VideoCaptionsAI',
)
