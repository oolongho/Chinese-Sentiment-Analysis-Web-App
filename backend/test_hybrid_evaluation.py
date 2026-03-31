#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
快速测试混合评估功能
"""

import requests
import time

BASE_URL = "http://localhost:8000"

def test_hybrid_config():
    """测试混合配置 API"""
    print("=" * 60)
    print("测试 1: 获取混合配置")
    print("=" * 60)
    
    response = requests.get(f"{BASE_URL}/api/evaluation/hybrid/config")
    print(f"状态码：{response.status_code}")
    print(f"响应：{response.json()}")
    print()
    
    print("=" * 60)
    print("测试 2: 更新混合配置")
    print("=" * 60)
    
    config = {
        'lexicon_threshold': 0.8,
        'lexicon_score_threshold': 2.5
    }
    response = requests.post(
        f"{BASE_URL}/api/evaluation/hybrid/config",
        json=config
    )
    print(f"状态码：{response.status_code}")
    print(f"响应：{response.json()}")
    print()

def test_hybrid_stats():
    """测试混合统计 API"""
    print("=" * 60)
    print("测试 3: 获取混合统计")
    print("=" * 60)
    
    response = requests.get(f"{BASE_URL}/api/evaluation/hybrid/stats")
    print(f"状态码：{response.status_code}")
    print(f"响应：{response.json()}")
    print()

def test_hybrid_analysis():
    """测试混合分析 API"""
    print("=" * 60)
    print("测试 4: 测试混合分析")
    print("=" * 60)
    
    test_texts = [
        "这个产品很好用，我非常喜欢",
        "太差了，完全不推荐",
        "一般般，没什么特别的"
    ]
    
    for text in test_texts:
        response = requests.post(
            f"{BASE_URL}/api/text/analyze/hybrid",
            json={'text': text}
        )
        result = response.json()
        print(f"文本：{text}")
        print(f"情感：{result.get('sentiment')}")
        print(f"置信度：{result.get('confidence', 0):.4f}")
        print(f"方法：{result.get('method')}")
        print(f"推理耗时：{result.get('inference_time_ms', 0):.2f}ms")
        print()

if __name__ == '__main__':
    try:
        test_hybrid_config()
        time.sleep(0.5)
        
        test_hybrid_stats()
        time.sleep(0.5)
        
        test_hybrid_analysis()
        
        print("=" * 60)
        print("所有测试完成！")
        print("=" * 60)
    except Exception as e:
        print(f"测试失败：{e}")
