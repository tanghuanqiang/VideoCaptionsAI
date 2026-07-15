"""
VideoCaptionsAI - One-Click Build Script
Usage: python build.py

This script:
1. Builds the React frontend (pnpm build)
2. Copies frontend output to frontend_dist/
3. Runs PyInstaller to create the exe
4. Cleans up temporary files
"""
import os
import sys
import shutil
import subprocess
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent  # VideoCaptionsAI/
BACKEND_DIR = Path(__file__).resolve().parent           # VideoSubs/
FRONTEND_DIR = PROJECT_ROOT / "agentfront"
FRONTEND_DIST = FRONTEND_DIR / "dist"
FRONTEND_OUT = BACKEND_DIR / "frontend_dist"
DIST_OUT = BACKEND_DIR / "dist"
BUILD_OUT = BACKEND_DIR / "build"


def run(cmd, cwd=None, shell=True):
    """Run a command and print output in real-time."""
    print(f"\n  > {cmd}")
    result = subprocess.run(cmd, cwd=cwd, shell=shell)
    if result.returncode != 0:
        print(f"  ERROR: Command failed with code {result.returncode}")
        sys.exit(result.returncode)
    return result


def copy_whisper_assets():
    """Copy whisper model assets for bundling."""
    import site
    print("\n[1/6] Copying whisper assets...")
    # Find whisper package in site-packages
    for sp in site.getsitepackages():
        whisper_assets = Path(sp) / "whisper" / "assets"
        if whisper_assets.exists():
            dst = BACKEND_DIR / "whisper_assets"
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(str(whisper_assets), str(dst))
            for f in dst.iterdir():
                print(f"  Copied: {f.name} ({f.stat().st_size:,} bytes)")
            return
    print("  WARNING: whisper assets not found!")


def clean():
    """Remove old build artifacts."""
    print("\n[1/6] Cleaning old builds...")
    for d in [FRONTEND_DIST, FRONTEND_OUT, DIST_OUT, BUILD_OUT]:
        if d.exists():
            shutil.rmtree(d, ignore_errors=True)
            print(f"  Removed: {d}")
    
    # Also clean __pycache__ in src
    for pycache in BACKEND_DIR.rglob("__pycache__"):
        shutil.rmtree(pycache, ignore_errors=True)
    print("  Cleaned __pycache__")


def build_frontend():
    """Build the React frontend."""
    print("\n[2/6] Building frontend...")
    
    # Ensure node_modules exist
    if not (FRONTEND_DIR / "node_modules").exists():
        print("  Installing dependencies...")
        run("pnpm install", cwd=str(FRONTEND_DIR))
    
    # Set environment
    env = os.environ.copy()
    env["CI"] = "true"
    
    run("pnpm build", cwd=str(FRONTEND_DIR))


def copy_frontend():
    """Copy frontend build output."""
    print("\n[3/6] Copying frontend to backend...")
    
    if FRONTEND_OUT.exists():
        shutil.rmtree(FRONTEND_OUT)
    
    shutil.copytree(str(FRONTEND_DIST), str(FRONTEND_OUT))
    
    # Verify
    index_html = FRONTEND_OUT / "index.html"
    if not index_html.exists():
        print("  ERROR: index.html not found in frontend_dist!")
        sys.exit(1)
    
    # Print the JS file being referenced
    content = index_html.read_text(encoding="utf-8")
    import re
    js_match = re.search(r'src="(/assets/[^"]+\.js)"', content)
    if js_match:
        js_file = FRONTEND_OUT / js_match.group(1).lstrip("/")
        if js_file.exists():
            print(f"  Frontend ready: {js_match.group(1)} ({js_file.stat().st_size:,} bytes)")
        else:
            print(f"  WARNING: JS file {js_match.group(1)} not found!")
    print("  Done.")


def build_exe():
    """Run PyInstaller."""
    print("\n[4/6] Building Windows executable...")
    print("  This may take 2-5 minutes...")
    
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    
    run(
        f'pyinstaller build_exe.spec --noconfirm',
        cwd=str(BACKEND_DIR),
    )


def verify():
    print("\n[6/6] Verifying build...")
    """Verify the build output."""
    print("\n[5/6] Verifying build...")
    
    exe_path = DIST_OUT / "VideoCaptionsAI" / "VideoCaptionsAI.exe"
    internal = DIST_OUT / "VideoCaptionsAI" / "_internal"
    frontend_in_bundle = internal / "frontend_dist" / "index.html"
    whisper_assets = internal / "whisper" / "assets" / "mel_filters.npz"
    
    errors = []
    
    if not exe_path.exists():
        errors.append("VideoCaptionsAI.exe not found")
    else:
        size_mb = exe_path.stat().st_size / (1024 * 1024)
        print(f"  exe: {size_mb:.0f} MB")
    
    if not frontend_in_bundle.exists():
        errors.append("Frontend not bundled")
    else:
        print("  frontend: bundled")
    
    if not whisper_assets.exists():
        errors.append("Whisper assets not bundled")
    else:
        print("  whisper assets: bundled")
    
    # Calculate total size
    total_size = sum(
        f.stat().st_size
        for f in internal.rglob("*")
        if f.is_file()
    )
    print(f"  total bundle: {total_size / (1024**3):.1f} GB")
    
    if errors:
        print("\n  ERRORS:")
        for e in errors:
            print(f"    - {e}")
        sys.exit(1)
    
    print(f"\n  BUILD SUCCESS!")
    print(f"  Output: {DIST_OUT / 'VideoCaptionsAI' / 'VideoCaptionsAI.exe'}")


if __name__ == "__main__":
    print("=" * 55)
    print("  VideoCaptionsAI - Build Script")
    print("=" * 55)
    
    os.chdir(str(BACKEND_DIR))
    
    clean()
    copy_whisper_assets()
    build_frontend()
    copy_frontend()
    build_exe()
    verify()
    
    print("\nDone! Run dist\\VideoCaptionsAI\\VideoCaptionsAI.exe to start.")
