#!/usr/bin/env python3
"""
Whisper 模型下载脚本
下载所有可用的 OpenAI Whisper 模型到本地缓存
"""

import whisper
import os
import sys
from pathlib import Path

# 所有可用的 Whisper 模型
WHISPER_MODELS = [
    "tiny.en",
    "tiny", 
    "base.en",
    "base",
    "small.en", 
    "small",
    "medium.en",
    "medium",
    "large-v1",
    "large-v2", 
    "large-v3",
    "large"
]

def download_model(model_name: str):
    """
    下载指定的 Whisper 模型
    """
    try:
        print(f"🔄 开始下载模型: {model_name}")
        
        # 使用 whisper.load_model() 会自动下载模型到缓存目录
        model = whisper.load_model(model_name)
        
        print(f"✅ 模型 {model_name} 下载完成")
        
        # 释放内存
        del model
        
        return True
        
    except Exception as e:
        print(f"❌ 模型 {model_name} 下载失败: {e}")
        return False

def get_cache_dir():
    """
    获取 Whisper 模型缓存目录
    """
    cache_dir = os.path.expanduser("~/.cache/whisper")
    return Path(cache_dir)

def list_cached_models():
    """
    列出已缓存的模型
    """
    cache_dir = get_cache_dir()
    if not cache_dir.exists():
        return []
    
    cached_models = []
    for file in cache_dir.glob("*.pt"):
        model_name = file.stem
        cached_models.append(model_name)
    
    return cached_models

def main():
    print("🚀 Whisper 模型批量下载工具")
    print("=" * 50)
    
    # 显示缓存目录
    cache_dir = get_cache_dir()
    print(f"📁 模型缓存目录: {cache_dir}")
    
    # 列出已缓存的模型
    cached_models = list_cached_models()
    if cached_models:
        print(f"📦 已缓存的模型: {', '.join(cached_models)}")
    else:
        print("📦 暂无已缓存的模型")
    
    print("\n🎯 可用模型列表:")
    for i, model in enumerate(WHISPER_MODELS, 1):
        status = "✅ 已缓存" if model in cached_models else "⏳ 待下载"
        print(f"  {i:2d}. {model:12s} - {status}")
    
    print("\n" + "=" * 50)
    
    # 询问用户选择
    while True:
        choice = input("\n请选择操作:\n1. 下载所有模型\n2. 下载指定模型\n3. 下载AMD 7900XTX推荐模型 (medium, large-v2, large-v3)\n4. 退出\n请输入选择 (1-4): ").strip()
        
        if choice == "1":
            # 下载所有模型
            print("\n🎯 开始下载所有模型...")
            success_count = 0
            for model in WHISPER_MODELS:
                if download_model(model):
                    success_count += 1
            print(f"\n📊 下载完成! 成功: {success_count}/{len(WHISPER_MODELS)}")
            break
            
        elif choice == "2":
            # 下载指定模型
            print("\n可用模型:")
            for i, model in enumerate(WHISPER_MODELS, 1):
                print(f"  {i}. {model}")
            
            try:
                model_choice = int(input("请输入模型编号: ").strip()) - 1
                if 0 <= model_choice < len(WHISPER_MODELS):
                    model_name = WHISPER_MODELS[model_choice]
                    download_model(model_name)
                else:
                    print("❌ 无效的模型编号")
            except ValueError:
                print("❌ 请输入有效的数字")
            break
            
        elif choice == "3":
            # 下载推荐模型 - 针对AMD 7900XTX优化
            amd_optimized_models = ["medium", "large-v2", "large-v3"]
            print(f"\n🎯 开始下载AMD 7900XTX推荐模型: {', '.join(amd_optimized_models)}")
            print("   - medium: 平衡速度，适合快速处理")
            print("   - large-v2: 平衡模式，兼顾质量和速度") 
            print("   - large-v3: 最高质量，充分利用显卡性能")
            success_count = 0
            for model in amd_optimized_models:
                if download_model(model):
                    success_count += 1
            print(f"\n📊 下载完成! 成功: {success_count}/{len(amd_optimized_models)}")
            break
            
        elif choice == "4":
            print("👋 退出程序")
            sys.exit(0)
            
        else:
            print("❌ 无效选择，请重新输入")
    
    # 最终统计
    print("\n" + "=" * 50)
    cached_models_final = list_cached_models()
    print(f"📦 最终缓存的模型数量: {len(cached_models_final)}")
    if cached_models_final:
        print(f"📦 已缓存的模型: {', '.join(sorted(cached_models_final))}")
    
    print(f"💾 总缓存大小: {get_cache_size()}")
    print("\n✅ 模型下载任务完成!")

def get_cache_size():
    """
    计算缓存目录大小
    """
    cache_dir = get_cache_dir()
    if not cache_dir.exists():
        return "0 MB"
    
    total_size = 0
    for file in cache_dir.rglob("*"):
        if file.is_file():
            total_size += file.stat().st_size
    
    # 转换为 MB
    size_mb = total_size / (1024 * 1024)
    if size_mb < 1024:
        return f"{size_mb:.1f} MB"
    else:
        return f"{size_mb/1024:.1f} GB"

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n👋 用户取消操作，程序退出")
    except Exception as e:
        print(f"\n❌ 程序执行出错: {e}")
        sys.exit(1)
