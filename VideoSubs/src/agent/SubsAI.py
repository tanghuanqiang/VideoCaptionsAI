import os
from dotenv import load_dotenv
from typing import Annotated, TypedDict
from langchain_tavily import TavilySearch
import torch
import whisper
from src.tools.subtitle_tools import (
    probe_media,
    asr_transcribe_video,
    format_srt,
    format_ass,
    final_hard_burn,
)
from langchain_openai import ChatOpenAI
from langgraph.graph.message import add_messages
from langgraph.graph import StateGraph, START, END
from langchain_core.tools import tool
from langgraph.types import Command, interrupt
from langgraph.prebuilt import ToolNode, tools_condition


load_dotenv()

torch.set_num_threads(4)

# Read keys and model settings from environment (use .env file in project root)
TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY")
LLM_API_KEY = os.environ.get("LLM_API_KEY")
LLM_MODEL_NAME = os.environ.get("LLM_MODEL_NAME", "qwen-turbo")

if not TAVILY_API_KEY:
    # keep behavior permissive but warn the user at runtime
    print("Warning: TAVILY_API_KEY not set. Tavily search may fail.")
if not LLM_API_KEY:
    print("Warning: LLM_API_KEY not set. LLM calls may fail or require other auth methods.")

Model = {
    "llm": ChatOpenAI(
        openai_api_base=os.environ.get("LLM_OPENAI_BASE", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
        openai_api_key=LLM_API_KEY,
        model_name=LLM_MODEL_NAME,
        temperature=float(os.environ.get("LLM_TEMPERATURE", "0")),
    ),
    "whisper": whisper.load_model(os.environ.get("WHISPER_MODEL", "large-v3"))
}


searchTool = TavilySearch(api_key=TAVILY_API_KEY, max_results=5)

@tool
def human_assistance(query: str) -> str:
    """Request assistance from a human."""
    human_response = interrupt({"query": query})
    return human_response["data"]
tools = [
    probe_media,
    asr_transcribe_video,
    format_srt,
    format_ass,
    searchTool,
    human_assistance,
    # final_soft_mux,
    final_hard_burn
]
llm_with_tools = Model["llm"].bind_tools(tools)


class State(TypedDict):
    messages: Annotated[list, add_messages]
    files: list  # 可以是文件路径、字节流、Base64等

graph_builder = StateGraph(State)

def chatbot(state: State):
    message = llm_with_tools.invoke(state["messages"])
    if message.tool_calls:
        return {"messages": [message]}
    else:
        return {"messages": [message], "done": True}

graph_builder.add_node("chatbot", chatbot)
tool_node = ToolNode(tools=tools)
graph_builder.add_node("tools", tool_node)

graph_builder.add_conditional_edges(
    "chatbot",
    tools_condition,
)
graph_builder.add_edge(START, "chatbot")
graph_builder.add_edge("tools", "chatbot")
graph_builder.add_edge("chatbot", END)
# graph = graph_builder.compile(checkpointer=memory)

graph = graph_builder.compile()

# ====== 流式调用示例 ======
if __name__ == "__main__":
    import asyncio
    async def main():
        state = {"messages": ["你好呀"]}
        async for ai_message in graph.astream(state):
            print("AI消息:", ai_message)
    asyncio.run(main())
