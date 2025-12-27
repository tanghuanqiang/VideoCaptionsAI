import os
import shutil
import asyncio
from datetime import datetime, timedelta
from src.config import OUTPUTS_DIR
from src.utils.task_queue import burn_queue

def cleanup_old_files(max_age_hours: int = 24):
    """清理旧文件和文件夹"""
    print("Running cleanup_old_files...")
    now = datetime.now()
    cutoff = now - timedelta(hours=max_age_hours)
    
    if not os.path.exists(OUTPUTS_DIR):
        return

    for item in os.listdir(OUTPUTS_DIR):
        item_path = os.path.join(OUTPUTS_DIR, item)
        
        # Skip queue_state.json
        if item == "queue_state.json":
            continue
            
        try:
            if os.path.isfile(item_path):
                mtime = datetime.fromtimestamp(os.path.getmtime(item_path))
                if mtime < cutoff:
                    os.remove(item_path)
                    print(f"Deleted old file: {item_path}")
            
            elif os.path.isdir(item_path):
                if item == "asr_cache":
                    # Clean inside asr_cache
                    for cache_file in os.listdir(item_path):
                        cache_path = os.path.join(item_path, cache_file)
                        if os.path.isfile(cache_path):
                            mtime = datetime.fromtimestamp(os.path.getmtime(cache_path))
                            if mtime < cutoff:
                                os.remove(cache_path)
                                print(f"Deleted old cache file: {cache_path}")
                else:
                    # Task directory: check mtime of the directory itself
                    mtime = datetime.fromtimestamp(os.path.getmtime(item_path))
                    if mtime < cutoff:
                        shutil.rmtree(item_path)
                        print(f"Deleted old task directory: {item_path}")
        except Exception as e:
            print(f"Error cleaning {item_path}: {e}")
    
    # Also cleanup old tasks in queue
    burn_queue.cleanup_old_tasks(max_age_hours)

async def periodic_cleanup(interval_hours: int = 1):
    """定期清理任务"""
    while True:
        await asyncio.sleep(interval_hours * 3600)
        try:
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, cleanup_old_files)
        except Exception as e:
            print(f"Error in periodic_cleanup: {e}")
