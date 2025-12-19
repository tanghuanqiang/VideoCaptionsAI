"""
任务队列管理器 - 用于视频烧录任务的排队和并发控制
"""
import asyncio
import uuid
from datetime import datetime
from typing import Dict, Optional, Callable, Any
from enum import Enum
import traceback


class TaskStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Task:
    def __init__(self, task_id: str, task_func: Callable, **kwargs):
        self.task_id = task_id
        self.task_func = task_func
        self.kwargs = kwargs
        self.status = TaskStatus.QUEUED
        self.progress = 0
        self.result = None
        self.error = None
        self.created_at = datetime.now()
        self.started_at: Optional[datetime] = None
        self.completed_at: Optional[datetime] = None
        
    def to_dict(self):
        return {
            "task_id": self.task_id,
            "status": self.status,
            "progress": self.progress,
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


class TaskQueue:
    def __init__(self, max_concurrent: int = 1):
        """
        初始化任务队列
        
        Args:
            max_concurrent: 最大并发任务数，默认为1（避免2G2核服务器过载）
        """
        self.max_concurrent = max_concurrent
        self.tasks: Dict[str, Task] = {}
        self.queue: asyncio.Queue = asyncio.Queue()
        self.active_tasks: int = 0
        self._worker_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()
        
    async def start(self):
        """启动任务队列处理器"""
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._worker())
            print(f"TaskQueue worker started with max_concurrent={self.max_concurrent}")
    
    async def _worker(self):
        """后台工作线程，处理队列中的任务"""
        while True:
            try:
                # 检查是否可以处理新任务
                if self.active_tasks >= self.max_concurrent:
                    await asyncio.sleep(1)
                    continue
                
                # 从队列获取任务（非阻塞）
                try:
                    task_id = await asyncio.wait_for(self.queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue
                
                task = self.tasks.get(task_id)
                if task is None:
                    continue
                
                # 处理任务
                async with self._lock:
                    self.active_tasks += 1
                
                try:
                    await self._process_task(task)
                finally:
                    async with self._lock:
                        self.active_tasks -= 1
                        
            except Exception as e:
                print(f"Worker error: {e}")
                traceback.print_exc()
                await asyncio.sleep(1)
    
    async def _process_task(self, task: Task):
        """处理单个任务"""
        try:
            task.status = TaskStatus.PROCESSING
            task.started_at = datetime.now()
            print(f"Processing task {task.task_id}")
            
            # 执行任务函数
            if asyncio.iscoroutinefunction(task.task_func):
                result = await task.task_func(**task.kwargs)
            else:
                result = task.task_func(**task.kwargs)
            
            task.result = result
            task.status = TaskStatus.COMPLETED
            task.progress = 100
            task.completed_at = datetime.now()
            print(f"Task {task.task_id} completed")
            
        except Exception as e:
            task.status = TaskStatus.FAILED
            task.error = str(e)
            task.completed_at = datetime.now()
            print(f"Task {task.task_id} failed: {e}")
            traceback.print_exc()
    
    async def submit(self, task_func: Callable, **kwargs) -> str:
        """
        提交新任务到队列
        
        Args:
            task_func: 要执行的任务函数
            **kwargs: 传递给任务函数的参数
            
        Returns:
            task_id: 任务ID
        """
        task_id = str(uuid.uuid4())[:8]
        task = Task(task_id, task_func, **kwargs)
        
        self.tasks[task_id] = task
        await self.queue.put(task_id)
        
        print(f"Task {task_id} submitted to queue (queue size: {self.queue.qsize()})")
        return task_id
    
    def get_task(self, task_id: str) -> Optional[Task]:
        """获取任务状态"""
        return self.tasks.get(task_id)
    
    def get_queue_status(self) -> Dict[str, Any]:
        """获取队列状态"""
        return {
            "queue_size": self.queue.qsize(),
            "active_tasks": self.active_tasks,
            "total_tasks": len(self.tasks),
            "max_concurrent": self.max_concurrent,
        }
    
    async def cancel_task(self, task_id: str) -> bool:
        """取消任务（仅对排队中的任务有效）"""
        task = self.tasks.get(task_id)
        if task and task.status == TaskStatus.QUEUED:
            task.status = TaskStatus.CANCELLED
            task.completed_at = datetime.now()
            return True
        return False
    
    def cleanup_old_tasks(self, max_age_hours: int = 24):
        """清理旧任务（释放内存）"""
        now = datetime.now()
        to_remove = []
        
        for task_id, task in self.tasks.items():
            if task.completed_at:
                age = (now - task.completed_at).total_seconds() / 3600
                if age > max_age_hours:
                    to_remove.append(task_id)
        
        for task_id in to_remove:
            del self.tasks[task_id]
        
        if to_remove:
            print(f"Cleaned up {len(to_remove)} old tasks")


# 全局任务队列实例
burn_queue = TaskQueue(max_concurrent=1)
