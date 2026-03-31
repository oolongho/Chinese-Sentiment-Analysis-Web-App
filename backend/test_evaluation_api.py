#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
测试评估 API
"""

import requests
import time

BASE_URL = "http://localhost:8000"

def test_evaluation():
    """测试评估流程"""
    print("=" * 60)
    print("步骤 1: 启动评估")
    print("=" * 60)
    
    response = requests.post(f"{BASE_URL}/api/evaluation/run")
    print(f"状态码：{response.status_code}")
    print(f"响应：{response.json()}")
    print()
    
    if not response.json().get('success'):
        print("启动评估失败！")
        return
    
    print("=" * 60)
    print("步骤 2: 轮询评估状态")
    print("=" * 60)
    
    max_wait = 300  # 最多等待 5 分钟
    start_time = time.time()
    
    while time.time() - start_time < max_wait:
        response = requests.get(f"{BASE_URL}/api/evaluation/status")
        status = response.json()
        
        print(f"运行中: {status.get('running')}, 进度: {status.get('progress')}/{status.get('total')}, 分析器: {status.get('current_analyzer')}")
        
        if not status.get('running'):
            print("\n评估完成！")
            break
        
        time.sleep(2)
    else:
        print("\n等待超时！")
        return
    
    print()
    print("=" * 60)
    print("步骤 3: 获取评估结果")
    print("=" * 60)
    
    response = requests.get(f"{BASE_URL}/api/evaluation/results")
    results = response.json()
    
    print(f"状态码：{response.status_code}")
    print(f"成功：{results.get('success')}")
    
    if results.get('success'):
        print("\n模型结果：")
        if results.get('model'):
            print(f"  准确率：{results['model'].get('accuracy', 0):.4f}")
            print(f"  精确率：{results['model'].get('precision', 0):.4f}")
            print(f"  召回率：{results['model'].get('recall', 0):.4f}")
            print(f"  F1分数：{results['model'].get('f1_score', 0):.4f}")
        
        print("\n词典结果：")
        if results.get('lexicon'):
            print(f"  准确率：{results['lexicon'].get('accuracy', 0):.4f}")
        
        print("\n混合结果：")
        if results.get('hybrid'):
            print(f"  准确率：{results['hybrid'].get('accuracy', 0):.4f}")
            print(f"  快速路径比例：{results['hybrid'].get('fast_path_ratio', 0):.4f}")
    else:
        print(f"错误信息：{results.get('message')}")
    
    print()
    print("=" * 60)
    print("测试完成")
    print("=" * 60)

if __name__ == '__main__':
    try:
        test_evaluation()
    except Exception as e:
        print(f"测试失败：{e}")
        import traceback
        traceback.print_exc()
