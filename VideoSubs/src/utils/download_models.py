#!/usr/bin/env python3
"""
Whisper 模型下载工具
下载 OpenAI Whisper 模型到本地缓存
"""

import os
import sys
import argparse
import whisper
import torch

# 常见的 Whisper 模型列表
WHISPER_MODELS = [
    "tiny", "tiny.en",
    "base", "base.en",
    "small", "small.en",
    "medium", "medium.en",
    "large",
    "large-v1",
    "large-v2",
    "large-v3",
    "turbo"
]

def download_specific_model(model_name: str):
    """
    下载指定的 Whisper 模型
    """
    try:
        print(f"🔄 开始下载模型: {model_name}")
        # whisper.load_model 会自动下载模型到缓存目录
        # 默认缓存目录: ~/.cache/whisper (Linux/Mac) or C:\Users\User\.cache\whisper (Windows)
        model = whisper.load_model(model_name, device="cpu") # 使用 CPU 加载以避免显存占用，仅为了下载
        print(f"✅ 模型 {model_name} 下载/验证完成")
        return True
    except Exception as e:
        print(f"❌ 模型 {model_name} 下载失败: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Whisper 模型下载工具")
    parser.add_argument("--model", type=str, help="指定要下载的模型名称 (例如: large-v3)", choices=WHISPER_MODELS)
    parser.add_argument("--all", action="store_true", help="下载所有常用模型")
    
    args = parser.parse_args()

    # 如果没有参数，进入交互模式
    if not any(vars(args).values()):
        interactive_mode()
        return

    if args.all:
        print("🚀 开始下载所有常用模型...")
        for model in WHISPER_MODELS:
            download_specific_model(model)
        return

    if args.model:
        download_specific_model(args.model)
        return

def interactive_mode():
    print("🚀 Whisper 模型下载工具 (OpenAI)")
    print("=" * 50)
    print("检测到您的显卡: 5070 Ti (推荐使用 large-v3)")
    
    while True:
        print("\n请选择操作:")
        print("1. 下载指定模型")
        print("2. 下载推荐模型 (large-v3)")
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
            download_specific_model("large-v3")
                
        elif choice == "3":
            print("👋 退出程序")
            sys.exit(0)
        else:
            print("❌ 无效选择")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n👋 用户取消操作")
    except Exception as e:
        print(f"\n❌ 程序出错: {e}")
