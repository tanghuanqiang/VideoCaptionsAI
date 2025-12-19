import asyncio
from typing import Dict

class ConnectionManager:
    def __init__(self):
        # Map user_id to their message queue
        self.active_connections: Dict[str, asyncio.Queue] = {}

    async def connect(self, user_id: str):
        queue = asyncio.Queue()
        self.active_connections[user_id] = queue
        return queue

    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]

    async def send_personal_message(self, message: str, user_id: str):
        if user_id in self.active_connections:
            await self.active_connections[user_id].put(message)

manager = ConnectionManager()
