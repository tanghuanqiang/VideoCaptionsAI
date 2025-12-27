"""
任务队列管理器 - 用于视频烧录任务的排队和并发控制
支持持久化、重试、超时控制和 Prometheus 监控
"""
import asyncio
import uuid
import json
import os
import traceback
import inspect
from datetime import datetime
from typing import Dict, Optional, Callable, Any
from enum import Enum

try:
    from prometheus_client import Gauge, Counter, Histogram
    PROMETHEUS_AVAILABLE = True
except ImportError:
    PROMETHEUS_AVAILABLE = False

class TaskStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    RETRYING = "retrying"

class Task:
    def __init__(self, task_id: str, task_type: str, kwargs: Dict[str, Any], 
                 max_retries: int = 3, timeout: int = 3600):
        self.task_id = task_id
        self.task_type = task_type
        self.kwargs = kwargs
        self.status = TaskStatus.QUEUED
        self.progress = 0
        self.result = None
        self.error = None
        self.created_at = datetime.now()
        self.started_at: Optional[datetime] = None
        self.completed_at: Optional[datetime] = None
        self.retries = 0
        self.max_retries = max_retries
        self.timeout = timeout
        
    def to_dict(self):
        return {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "kwargs": self.kwargs,
            "status": self.status,
            "progress": self.progress,
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "retries": self.retries,
            "max_retries": self.max_retries,
            "timeout": self.timeout
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]):
        task = cls(
            task_id=data["task_id"],
            task_type=data["task_type"],
            kwargs=data["kwargs"],
            max_retries=data.get("max_retries", 3),
            timeout=data.get("timeout", 3600)
        )
        task.status = TaskStatus(data["status"])
        task.progress = data.get("progress", 0)
        task.result = data.get("result")
        task.error = data.get("error")
        task.retries = data.get("retries", 0)
        
        if data.get("created_at"):
            task.created_at = datetime.fromisoformat(data["created_at"])
        if data.get("started_at"):
            task.started_at = datetime.fromisoformat(data["started_at"])
        if data.get("completed_at"):
            task.completed_at = datetime.fromisoformat(data["completed_at"])
            
        return task

class TaskQueue:
    def __init__(self, max_concurrent: int = 1, persistence_file: str = "outputs/queue_state.json"):
        """
        初始化任务队列
        
        Args:
            max_concurrent: 最大并发任务数
            persistence_file: 状态持久化文件路径
        """
        self.max_concurrent = max_concurrent
        self.persistence_file = persistence_file
        self.tasks: Dict[str, Task] = {}
        self.queue: asyncio.Queue = asyncio.Queue()
        self.active_tasks: int = 0
        self._worker_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()
        self.handlers: Dict[str, Callable] = {}
        
        # Metrics
        if PROMETHEUS_AVAILABLE:
            self.metric_queue_size = Gauge('task_queue_size', 'Number of tasks in queue')
            self.metric_active_tasks = Gauge('task_active_tasks', 'Number of currently processing tasks')
            self.metric_task_failures = Counter('task_failures_total', 'Total number of failed tasks', ['task_type'])
            self.metric_task_duration = Histogram('task_duration_seconds', 'Task duration in seconds', ['task_type'])
        
    def register_handler(self, task_type: str, handler: Callable):
        """注册任务处理器"""
        self.handlers[task_type] = handler
        print(f"Registered handler for task type: {task_type}")

    async def start(self):
        """启动任务队列处理器"""
        # 恢复状态
        self.load_state()
        
        # 将未完成的任务重新加入队列
        for task_id, task in self.tasks.items():
            if task.status in [TaskStatus.QUEUED, TaskStatus.PROCESSING, TaskStatus.RETRYING]:
                # 如果是 PROCESSING，重置为 QUEUED 或 RETRYING
                if task.status == TaskStatus.PROCESSING:
                    task.status = TaskStatus.QUEUED
                await self.queue.put(task_id)
        
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._worker())
            print(f"TaskQueue worker started with max_concurrent={self.max_concurrent}")
            
    async def stop(self):
        """停止队列并保存状态"""
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        self.save_state()

    def save_state(self):
        """保存队列状态到磁盘"""
        try:
            os.makedirs(os.path.dirname(self.persistence_file), exist_ok=True)
            data = {task_id: task.to_dict() for task_id, task in self.tasks.items()}
            with open(self.persistence_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            # print(f"Queue state saved to {self.persistence_file}")
        except Exception as e:
            print(f"Failed to save queue state: {e}")

    def load_state(self):
        """从磁盘加载队列状态"""
        if not os.path.exists(self.persistence_file):
            return
            
        try:
            with open(self.persistence_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            for task_id, task_data in data.items():
                self.tasks[task_id] = Task.from_dict(task_data)
            
            print(f"Loaded {len(self.tasks)} tasks from {self.persistence_file}")
        except Exception as e:
            print(f"Failed to load queue state: {e}")

    async def _worker(self):
        """后台工作线程"""
        while True:
            try:
                # 更新 Metrics
                if PROMETHEUS_AVAILABLE:
                    self.metric_queue_size.set(self.queue.qsize())
                    self.metric_active_tasks.set(self.active_tasks)

                # 检查并发限制
                if self.active_tasks >= self.max_concurrent:
                    await asyncio.sleep(1)
                    continue
                
                try:
                    task_id = await asyncio.wait_for(self.queue.get(), timeout=5.0)
                except asyncio.TimeoutError:
                    # 定期保存状态
                    self.save_state()
                    continue
                
                task = self.tasks.get(task_id)
                if not task:
                    continue
                
                # 处理任务
                async with self._lock:
                    self.active_tasks += 1
                
                try:
                    await self._process_task(task)
                finally:
                    async with self._lock:
                        self.active_tasks -= 1
                    self.save_state() # 任务完成后保存状态
                        
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Worker error: {e}")
                traceback.print_exc()
                await asyncio.sleep(1)
    
    async def _process_task(self, task: Task):
        """处理单个任务"""
        handler = self.handlers.get(task.task_type)
        if not handler:
            task.status = TaskStatus.FAILED
            task.error = f"No handler for task type: {task.task_type}"
            task.completed_at = datetime.now()
            if PROMETHEUS_AVAILABLE:
                self.metric_task_failures.labels(task_type=task.task_type).inc()
            return

        try:
            task.status = TaskStatus.PROCESSING
            task.started_at = datetime.now()
            print(f"Processing task {task.task_id} ({task.task_type})")
            
            # 准备回调函数
            def update_progress(p):
                task.progress = p
            
            # 检查 handler 是否接受 progress_callback
            call_kwargs = task.kwargs.copy()
            sig = inspect.signature(handler)
            if 'progress_callback' in sig.parameters or any(p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values()):
                call_kwargs['progress_callback'] = update_progress

            # 执行任务（带超时）
            if asyncio.iscoroutinefunction(handler):
                result = await asyncio.wait_for(handler(**call_kwargs), timeout=task.timeout)
            else:
                # 在线程池中运行同步函数以支持超时
                loop = asyncio.get_running_loop()
                result = await asyncio.wait_for(
                    loop.run_in_executor(None, lambda: handler(**call_kwargs)),
                    timeout=task.timeout
                )
            
            task.result = result
            task.status = TaskStatus.COMPLETED
            task.progress = 100
            task.completed_at = datetime.now()
            
            # 记录耗时
            if PROMETHEUS_AVAILABLE:
                duration = (task.completed_at - task.started_at).total_seconds()
                self.metric_task_duration.labels(task_type=task.task_type).observe(duration)
                
            print(f"Task {task.task_id} completed")
            
        except Exception as e:
            print(f"Task {task.task_id} failed: {e}")
            traceback.print_exc()
            
            # 重试逻辑
            if task.retries < task.max_retries:
                task.retries += 1
                task.status = TaskStatus.RETRYING
                task.error = f"Attempt {task.retries} failed: {str(e)}"
                print(f"Retrying task {task.task_id} (Attempt {task.retries}/{task.max_retries})")
                await asyncio.sleep(2 ** task.retries) # 指数退避
                await self.queue.put(task.task_id)
            else:
                task.status = TaskStatus.FAILED
                task.error = str(e)
                task.completed_at = datetime.now()
                if PROMETHEUS_AVAILABLE:
                    self.metric_task_failures.labels(task_type=task.task_type).inc()
    
    async def submit(self, task_type: str, **kwargs) -> str:
        """提交新任务"""
        task_id = str(uuid.uuid4())[:8]
        task = Task(task_id, task_type, kwargs)
        
        self.tasks[task_id] = task
        await self.queue.put(task_id)
        self.save_state()
        
        print(f"Task {task_id} submitted (type: {task_type})")
        return task_id
    
    def get_task(self, task_id: str) -> Optional[Task]:
        return self.tasks.get(task_id)
    
    def get_queue_status(self) -> Dict[str, Any]:
        return {
            "queue_size": self.queue.qsize(),
            "active_tasks": self.active_tasks,
            "total_tasks": len(self.tasks),
            "max_concurrent": self.max_concurrent,
        }
    
    async def cancel_task(self, task_id: str) -> bool:
        task = self.tasks.get(task_id)
        if task and task.status in [TaskStatus.QUEUED, TaskStatus.RETRYING]:
            task.status = TaskStatus.CANCELLED
            task.completed_at = datetime.now()
            self.save_state()
            return True
        return False
    
    def cleanup_old_tasks(self, max_age_hours: int = 24):
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
            self.save_state()
            print(f"Cleaned up {len(to_remove)} old tasks")

# 全局任务队列实例
burn_queue = TaskQueue(max_concurrent=int(os.environ.get("MAX_CONCURRENT_TASKS", "1")))
