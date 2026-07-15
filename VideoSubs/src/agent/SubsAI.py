import os
import torch
from typing import Annotated, TypedDict
from langchain_tavily import TavilySearch
from langchain_openai import ChatOpenAI
from langgraph.graph.message import add_messages
from langgraph.graph import StateGraph, START, END
from langchain_core.tools import tool
from langgraph.types import Command, interrupt
from langchain_core.messages import AIMessage, SystemMessage, HumanMessage
from langgraph.prebuilt import ToolNode, tools_condition
from src.tools.subtitle_tools import (
    probe_media,
    asr_transcribe_video,
    format_srt,
    format_ass,
    final_hard_burn,
)
from src.config_manager import get_config

torch.set_num_threads(int(os.environ.get("TORCH_THREADS", "2")))

Model = {"llm": None}
searchTool = None
llm_with_tools = None
tools = []
graph = None

_base_tools = [
    probe_media,
    asr_transcribe_video,
    format_srt,
    format_ass,
    final_hard_burn,
]

@tool
def human_assistance(query: str) -> str:
    """Request assistance from a human."""
    human_response = interrupt({"query": query})
    return human_response["data"]

def _create_dummy_search():
    from langchain_core.tools import tool as lc_tool
    @lc_tool
    def dummy_search(query: str) -> str:
        """Search the web (disabled - set Tavily API key in Copilot settings)."""
        return "Web search is not available. Please configure Tavily API key in Copilot settings."
    return dummy_search

def reload_agent():
    """Reload the LLM, tools, and graph from current config."""
    global Model, searchTool, llm_with_tools, tools, graph

    config = get_config()
    api_key = config.get("llm_api_key", "").strip()
    api_base = config.get("llm_api_base", "https://api.openai.com/v1").strip()
    model_name = config.get("llm_model_name", "gpt-4o").strip()
    temperature = float(config.get("temperature", 0.0))
    tavily_key = config.get("tavily_api_key", "").strip()

    print(f"[Copilot] Reloading: model={model_name}, base={api_base}, has_key={bool(api_key)}, has_tavily={bool(tavily_key)}")

    if api_key:
        try:
            Model["llm"] = ChatOpenAI(
                openai_api_base=api_base,
                openai_api_key=api_key,
                model_name=model_name,
                temperature=temperature,
            )
            print(f"[Copilot] LLM initialized: {model_name}")
        except Exception as e:
            print(f"[Copilot] LLM init failed: {e}")
            Model["llm"] = None
    else:
        print("[Copilot] No API key - LLM disabled")
        Model["llm"] = None

    if tavily_key:
        try:
            searchTool = TavilySearch(api_key=tavily_key, max_results=5)
            print("[Copilot] Tavily search initialized")
        except Exception as e:
            print(f"[Copilot] Tavily init failed: {e}")
            searchTool = _create_dummy_search()
    else:
        searchTool = _create_dummy_search()

    tools = _base_tools + [searchTool, human_assistance]
    llm_with_tools = Model["llm"].bind_tools(tools) if Model["llm"] else None

    # Build graph
    class State(TypedDict):
        messages: Annotated[list, add_messages]

    graph_builder = StateGraph(State)

    def chatbot(state: State):
        if llm_with_tools is None:
            return {
                "messages": [
                    AIMessage(content="Copilot is not configured. Please click the gear icon in the Copilot panel and enter your OpenAI-compatible API key and base URL, then try again.")
                ]
            }
        try:
            message = llm_with_tools.invoke(state["messages"])
            return {"messages": [message]}
        except Exception as e:
            return {"messages": [AIMessage(content=f"LLM Error: {str(e)}")]}

    graph_builder.add_node("chatbot", chatbot)
    
    if llm_with_tools is not None:
        tool_node = ToolNode(tools=tools)
        graph_builder.add_node("tools", tool_node)
        graph_builder.add_conditional_edges("chatbot", tools_condition)
        graph_builder.add_edge("tools", "chatbot")

    graph_builder.add_edge(START, "chatbot")
    graph_builder.add_edge("chatbot", END)

    try:
        graph = graph_builder.compile()
        print("[Copilot] Agent graph compiled successfully")
    except Exception as e:
        print(f"[Copilot] Graph compile failed: {e}")
        graph = None

    return graph

reload_agent()