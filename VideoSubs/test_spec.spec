# -*- mode: python ; coding: utf-8 -*-
"""Minimal PyInstaller test"""
a = Analysis(['main_exe.py'], pathex=['.'], binaries=[], datas=[], hiddenimports=[], hookspath=[], hooksconfig={}, runtime_hooks=[], excludes=['tkinter','PyQt5','PyQt6'], win_no_prefer_redirects=False, win_private_assemblies=False, noarchive=False)
pyz = PYZ(a.pure, a.zipped_data)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='TestExe', debug=False, strip=False, upx=False, console=False, target_arch=None)
coll = COLLECT(exe, a.binaries, a.zipfiles, a.datas, strip=False, upx=False, name='TestExe')
