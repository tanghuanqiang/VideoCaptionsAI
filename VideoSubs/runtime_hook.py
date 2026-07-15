# PyInstaller runtime hook: Fix numba/llvmlite DLL search path
import os
import sys

# Prevent numba from trying to use conda's Library/bin path
os.environ['NUMBA_CACHE_DIR'] = os.path.join(sys._MEIPASS, 'numba_cache')
os.environ['LLVMLITE_CACHE_DIR'] = os.path.join(sys._MEIPASS, 'llvmlite_cache')

# ---- MUST patch add_dll_directory BEFORE importing llvmlite ----
_original_add_dll = os.add_dll_directory

def _safe_add_dll(path):
    if os.path.exists(path):
        try:
            return _original_add_dll(path)
        except Exception:
            pass
    # Try alternative path in MEIPASS
    alt = os.path.join(sys._MEIPASS, os.path.basename(path))
    if os.path.exists(alt):
        try:
            return _original_add_dll(alt)
        except Exception:
            pass
    # Return a dummy context manager that does nothing
    from contextlib import contextmanager
    @contextmanager
    def _noop():
        yield
    return _noop()

os.add_dll_directory = _safe_add_dll

# Now safe to import llvmlite
try:
    import llvmlite.binding.ffi as _llvm_ffi
except Exception as e:
    print(f"Warning: llvmlite import failed: {e}", file=sys.stderr)

# Fix whisper assets path for PyInstaller frozen builds
if getattr(sys, 'frozen', False):
    _whisper_assets = os.path.join(sys._MEIPASS, 'whisper', 'assets')
    if os.path.isdir(_whisper_assets):
        os.environ['WHISPER_ASSETS_DIR'] = _whisper_assets