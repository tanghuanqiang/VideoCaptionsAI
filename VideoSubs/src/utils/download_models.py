#!/usr/bin/env python3
"""
Faster-Whisper 模型下载工具
下载 Faster-Whisper (CTranslate2) 模型到本地 Hugging Face 缓存
"""

import os
import sys
import argparse
from faster_whisper import download_model
from huggingface_hub import scan_cache_dir

# 常见的 Faster-Whisper 模型列表
# 这些模型通常托管在 Hugging Face 的 Systran 组织下
WHISPER_MODELS = [
    "tiny", "tiny.en",
    "base", "base.en",
    "small", "small.en",
    "medium", "medium.en",
    "large-v1",
    "large-v2",
    "large-v3",
    "distil-large-v2",
    "distil-medium.en",
    "distil-small.en"
]

def download_specific_model(model_name: str):
    """
    下载指定的 Faster-Whisper 模型
    """
    try:
        print(f"🔄 开始下载模型: {model_name}")
        # download_model 会返回模型路径，如果已存在则直接返回
        model_path = download_model(model_name)
        print(f"✅ 模型 {model_name} 下载/验证完成")
        print(f"📍 模型路径: {model_path}")
        return True
    except Exception as e:
        print(f"❌ 模型 {model_name} 下载失败: {e}")
        return False

def list_cached_models():
    """
    列出 Hugging Face 缓存中已有的 faster-whisper 模型
    """
    try:
        hf_cache_info = scan_cache_dir()
        cached_repos = []
        for repo in hf_cache_info.repos:
            if "faster-whisper" in repo.repo_id or "whisper" in repo.repo_id:
                cached_repos.append(repo.repo_id)
        return cached_repos
    except Exception as e:
        print(f"⚠️ 无法扫描缓存目录: {e}")
        return []

def main():
    parser = argparse.ArgumentParser(description="Faster-Whisper 模型下载工具")
    parser.add_argument("--model", type=str, help="指定要下载的模型名称 (例如: large-v3)", choices=WHISPER_MODELS)
    parser.add_argument("--all", action="store_true", help="下载所有常用模型")
    parser.add_argument("--list", action="store_true", help="列出可用模型和已缓存模型")
    
    args = parser.parse_args()

    # 如果没有参数，进入交互模式
    if not any(vars(args).values()):
        interactive_mode()
        return

    if args.list:
        show_model_list()
        return

    if args.all:
        print("🚀 开始下载所有常用模型...")
        for model in WHISPER_MODELS:
            download_specific_model(model)
        return

    if args.model:
        download_specific_model(args.model)
        return

def show_model_list():
    print("\n📋 可用模型列表:")
    cached_repos = list_cached_models()
    
    # 简单检查缓存状态 (不完美，因为 repo_id 可能不完全匹配 model_name)
    # Systran/faster-whisper-{model_name} 是标准格式
    
    for i, model in enumerate(WHISPER_MODELS, 1):
        # 检查是否在缓存中 (模糊匹配)
        is_cached = any(model in repo for repo in cached_repos)
        status = "✅ 已缓存" if is_cached else "⏳ 未检测到"
        print(f"  {model:15s} - {status}")
    
    print("\n📦 Hugging Face 缓存中的相关仓库:")
    for repo in cached_repos:
        print(f"  - {repo}")

def interactive_mode():
    print("🚀 Faster-Whisper 模型下载工具")
    print("=" * 50)
    
    show_model_list()
    
    print("\n" + "=" * 50)
    
    while True:
        print("\n请选择操作:")
        print("1. 下载指定模型")
        print("2. 下载所有模型")
        print("3. 退出")
        
        choice = input("请输入选择 (1-3): ").strip()
        
        if choice == "1":
            print("\n可用模型:")
            for i, model in enumerate(WHISPER_MODELS, 1):
                print(f"  {i}. {model}")
            
            try:
                model_idx = input("请输入模型编号 (或输入模型名称): ").strip()
                if model_idx.isdigit():
                    idx = int(model_idx) - 1
                    if 0 <= idx < len(WHISPER_MODELS):
                        download_specific_model(WHISPER_MODELS[idx])
                    else:
                        print("❌ 无效的编号")
                else:
                    if model_idx in WHISPER_MODELS:
                        download_specific_model(model_idx)
                    else:
                        print("❌ 无效的模型名称")
            except Exception as e:
                print(f"❌ 输入错误: {e}")
                
        elif choice == "2":
            print("\n🚀 开始下载所有模型...")
            for model in WHISPER_MODELS:
                download_specific_model(model)
                
        elif choice == "3":
            print("👋 退出程序")
            sys.exit(0)
        else:
            print("❌ 无效选择")

if __name__ == "__main__":
    try:
        # 设置环境变量以避免符号链接警告 (Windows)
        os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
        main()
    except KeyboardInterrupt:
        print("\n\n👋 用户取消操作")
    except Exception as e:
        print(f"\n❌ 程序出错: {e}")
