#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
快速测试混合模型 API
"""

import requests
import json

API_BASE = 'http://localhost:8000'

def test_hybrid_api():
    """测试混合分析 API"""
    print("=" * 60)
    print("测试混合分析 API")
    print("=" * 60)
    
    test_texts = [
        "这个产品质量很好，物流也很快，非常满意！",
        "太差了，完全不值这个价格，后悔购买。",
        "一般般吧，没什么特别的，凑合用。",
    ]
    
    for i, text in enumerate(test_texts, 1):
        try:
            response = requests.post(
                f'{API_BASE}/api/text/analyze/hybrid',
                json={'text': text, 'strategy': 'cascade'}
            )
            
            if response.status_code == 200:
                result = response.json()
                method = result.get('method', 'unknown')
                method_cn = "词典快速" if method == 'lexicon_fast' else "混合融合"
                print(f"\n[{i}] {method_cn}")
                print(f"    文本：{text[:40]}...")
                print(f"    情感：{result.get('sentiment')} (置信度：{result.get('confidence', 0):.2%})")
                print(f"    耗时：{result.get('inference_time_ms', 0):.2f}ms")
            else:
                print(f"\n[{i}] 失败：HTTP {response.status_code}")
                
        except Exception as e:
            print(f"\n[{i}] 错误：{e}")
    
    print("\n" + "=" * 60)
    print("测试完成！")
    print("=" * 60)

if __name__ == '__main__':
    test_hybrid_api()
