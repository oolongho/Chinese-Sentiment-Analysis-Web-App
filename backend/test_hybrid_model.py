#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
混合模型功能验证脚本
验证内容：
1. API 端点是否可访问
2. 混合分析功能是否正常
3. 快速路径比例统计
4. 性能对比
"""

import sys
import os
import time
import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

API_BASE_URL = 'http://localhost:8000'
HYBRID_ENDPOINT = f'{API_BASE_URL}/api/text/analyze/hybrid'
BATCH_ENDPOINT = f'{API_BASE_URL}/api/text/analyze/batch'

# 测试文本
TEST_TEXTS = [
    "这个产品质量很好，物流也很快，非常满意！",  # 简单正面
    "太差了，完全不值这个价格，后悔购买。",  # 简单负面
    "一般般吧，没什么特别的，凑合用。",  # 中性
    "不是不喜欢，只是有点贵",  # 双重否定
    "外观很漂亮，但功能一般。",  # 转折
    "性价比很高，推荐购买。",  # 简单正面
    "客服态度很好，问题解决得很及时。",  # 正面评价
    "物流太慢了，等了好久才到。",  # 负面评价
    "第二次购买了，一如既往的好。",  # 正面复购
    "跟描述不符，感觉被骗了。",  # 负面感受
]


def test_hybrid_api():
    """测试混合分析 API 功能"""
    print("\n" + "=" * 60)
    print("测试 1: 混合分析 API 功能")
    print("=" * 60)
    
    test_results = []
    
    for i, text in enumerate(TEST_TEXTS, 1):
        try:
            response = requests.post(HYBRID_ENDPOINT, json={
                'text': text,
                'strategy': 'cascade'
            })
            
            if response.status_code == 200:
                result = response.json()
                test_results.append({
                    'text': text,
                    'success': True,
                    'method': result.get('method', 'unknown'),
                    'inference_time_ms': result.get('inference_time_ms', 0),
                    'sentiment': result.get('sentiment'),
                    'confidence': result.get('confidence', 0),
                })
                
                method_badge = "[FAST] 词典快速" if result.get('method') == 'lexicon_fast' else "[FUSION] 混合推理"
                print(f"\n[{i}] {method_badge}")
                print(f"    文本：{text[:50]}...")
                print(f"    情感：{result.get('sentiment')} (置信度：{result.get('confidence', 0):.2%})")
                print(f"    耗时：{result.get('inference_time_ms', 0):.2f}ms")
            else:
                test_results.append({
                    'text': text,
                    'success': False,
                    'error': f'HTTP {response.status_code}'
                })
                print(f"\n[{i}] [FAIL] 失败：HTTP {response.status_code}")
                
        except Exception as e:
            test_results.append({
                'text': text,
                'success': False,
                'error': str(e)
            })
            print(f"\n[{i}] [ERROR] 异常：{e}")
    
    # 统计结果
    success_count = sum(1 for r in test_results if r['success'])
    fast_path_count = sum(1 for r in test_results if r['success'] and r['method'] == 'lexicon_fast')
    
    print("\n" + "-" * 60)
    print(f"总计：{success_count}/{len(test_results)} 成功")
    print(f"快速路径：{fast_path_count}/{success_count} ({fast_path_count/success_count*100:.1f}%)")
    
    return test_results


def test_frontend_types():
    """测试前端类型定义"""
    print("\n" + "=" * 60)
    print("测试 2: 前端类型定义")
    print("=" * 60)
    
    # 检查 api.ts 文件是否存在
    api_config_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        'frontend', 'src', 'config', 'api.ts'
    )
    
    if os.path.exists(api_config_path):
        with open(api_config_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        checks = {
            'HybridStrategy': 'HybridStrategy' in content,
            'HybridAnalysisRequest': 'HybridAnalysisRequest' in content,
            'HybridAnalysisResponse': 'HybridAnalysisResponse' in content,
            'HybridStats': 'HybridStats' in content,
        }
        
        for name, passed in checks.items():
            status = "[OK]" if passed else "[FAIL]"
            print(f"{status} {name}: {'通过' if passed else '缺失'}")
        
        return all(checks.values())
    else:
        print("✗ api.ts 文件不存在")
        return False


def test_text_analysis_page():
    """测试文本分析页面"""
    print("\n" + "=" * 60)
    print("测试 3: 文本分析页面组件")
    print("=" * 60)
    
    page_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        'frontend', 'src', 'pages', 'TextAnalysisPage.tsx'
    )
    
    if os.path.exists(page_path):
        with open(page_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        checks = {
            'useHybridMode 状态': 'useHybridMode' in content,
            'localStorage 持久化': 'localStorage' in content and 'useHybridMode' in content,
            'Toggle 开关': 'Toggle' in content or '开关' in content,
            '混合 API 调用': '/analyze/hybrid' in content,
            '方法标签显示': '词典快速' in content or '混合推理' in content,
            '推理耗时显示': 'inference_time' in content or 'ms' in content,
        }
        
        for name, passed in checks.items():
            status = "[OK]" if passed else "[FAIL]"
            print(f"{status} {name}: {'通过' if passed else '缺失'}")
        
        return all(checks.values())
    else:
        print("[FAIL] TextAnalysisPage.tsx 文件不存在")
        return False


def performance_comparison():
    """性能对比测试"""
    print("\n" + "=" * 60)
    print("测试 4: 性能对比（混合 vs 批处理）")
    print("=" * 60)
    
    # 混合模式测试
    hybrid_times = []
    for text in TEST_TEXTS[:5]:  # 使用前 5 条文本
        start = time.time()
        try:
            response = requests.post(HYBRID_ENDPOINT, json={'text': text})
            if response.ok:
                result = response.json()
                hybrid_times.append(result.get('inference_time_ms', 0))
        except:
            pass
    
    # 批处理模式测试
    batch_times = []
    try:
        start = time.time()
        response = requests.post(BATCH_ENDPOINT, json={'texts': TEST_TEXTS[:5]})
        if response.ok:
            result = response.json()
            for item in result.get('results', []):
                model_time = item.get('model_result', {}).get('processing_time', 0) * 1000
                batch_times.append(model_time)
    except:
        pass
    
    if hybrid_times and batch_times:
        avg_hybrid = sum(hybrid_times) / len(hybrid_times)
        avg_batch = sum(batch_times) / len(batch_times)
        improvement = ((avg_batch - avg_hybrid) / avg_batch * 100) if avg_batch > 0 else 0
        
        print(f"\n混合模式平均耗时：{avg_hybrid:.2f}ms")
        print(f"批处理模式平均耗时：{avg_batch:.2f}ms")
        print(f"性能提升：{improvement:.1f}%")
        
        return improvement > 0
    else:
        print("无法获取性能数据")
        return False


def main():
    """运行所有测试"""
    print("\n" + "=" * 60)
    print("混合模型功能验证")
    print("=" * 60)
    
    results = {
        'API 功能': False,
        '前端类型': False,
        '页面组件': False,
        '性能提升': False,
    }
    
    # 测试 1: API 功能
    try:
        test_results = test_hybrid_api()
        results['API 功能'] = any(r['success'] for r in test_results)
    except Exception as e:
        print(f"\nAPI 测试失败：{e}")
        print("请确保后端服务正在运行：python backend/main.py")
    
    # 测试 2: 前端类型
    try:
        results['前端类型'] = test_frontend_types()
    except Exception as e:
        print(f"\n前端类型测试失败：{e}")
    
    # 测试 3: 页面组件
    try:
        results['页面组件'] = test_text_analysis_page()
    except Exception as e:
        print(f"\n页面组件测试失败：{e}")
    
    # 测试 4: 性能对比
    try:
        results['性能提升'] = performance_comparison()
    except Exception as e:
        print(f"\n性能测试失败：{e}")
    
    # 总结
    print("\n" + "=" * 60)
    print("验证总结")
    print("=" * 60)
    
    for test_name, passed in results.items():
        status = "[OK]" if passed else "[FAIL]"
        print(f"{status} {test_name}: {'通过' if passed else '失败'}")
    
    passed_count = sum(results.values())
    total_count = len(results)
    
    print("\n" + "-" * 60)
    print(f"总计：{passed_count}/{total_count} 通过")
    print("=" * 60)
    
    if passed_count == total_count:
        print("\n[SUCCESS] 所有测试通过！混合模型功能已就绪。")
        return 0
    else:
        print("\n[WARNING] 部分测试失败，请检查相关功能。")
        return 1


if __name__ == '__main__':
    sys.exit(main())
