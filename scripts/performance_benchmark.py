# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
性能基准测试脚本
功能：
1. 单条文本分析延迟测试
2. 批量分析吞吐量测试
3. 并发处理能力测试
4. 生成性能测试报告
"""

import asyncio
import time
import json
import os
import sys
from datetime import datetime
from typing import List, Dict
import statistics

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.sentiment import LexiconAnalyzer, ModelAnalyzer
from backend.services import call_text_api


class PerformanceBenchmark:
    def __init__(self):
        self.lexicon_analyzer = LexiconAnalyzer()
        self.model_analyzer = ModelAnalyzer()
        self.results = {
            'test_time': '',
            'single_text_latency': {},
            'batch_throughput': {},
            'concurrent_test': {}
        }
    
    def generate_test_texts(self, count: int = 100) -> List[str]:
        """生成测试文本"""
        base_texts = [
            "这个产品质量很好，物流也很快，非常满意！",
            "太差了，完全不值这个价格，后悔购买。",
            "一般般吧，没什么特别的，凑合用。",
            "客服态度很好，问题解决得很及时。",
            "包装破损了，但产品本身没问题。",
            "性价比很高，推荐购买。",
            "跟描述不符，感觉被骗了。",
            "第二次购买了，一如既往的好。",
            "物流太慢了，等了好久才到。",
            "外观很漂亮，但功能一般。"
        ]
        return base_texts * (count // 10 + 1)
    
    def test_single_text_latency(self, texts: List[str], iterations: int = 100) -> Dict:
        """测试单条文本分析延迟"""
        print("\n=== 单条文本分析延迟测试 ===")
        
        results = {'lexicon': [], 'model': []}
        
        # 词典法测试
        print("测试情感词典法...")
        for i in range(iterations):
            text = texts[i % len(texts)]
            start = time.perf_counter()
            self.lexicon_analyzer.analyze(text)
            elapsed = (time.perf_counter() - start) * 1000
            results['lexicon'].append(elapsed)
        
        # 深度学习模型测试
        print("测试深度学习模型...")
        for i in range(iterations):
            text = texts[i % len(texts)]
            start = time.perf_counter()
            self.model_analyzer.predict(text)
            elapsed = (time.perf_counter() - start) * 1000
            results['model'].append(elapsed)
        
        summary = {}
        for method, latencies in results.items():
            summary[method] = {
                'avg_ms': round(statistics.mean(latencies), 2),
                'min_ms': round(min(latencies), 2),
                'max_ms': round(max(latencies), 2),
                'p50_ms': round(statistics.median(latencies), 2),
                'p95_ms': round(sorted(latencies)[int(len(latencies) * 0.95)], 2),
                'p99_ms': round(sorted(latencies)[int(len(latencies) * 0.99)], 2)
            }
            print(f"  {method}: 平均 {summary[method]['avg_ms']}ms, "
                  f"P50 {summary[method]['p50_ms']}ms, "
                  f"P95 {summary[method]['p95_ms']}ms")
        
        return summary
    
    def test_batch_throughput(self, texts: List[str], batch_sizes: List[int] = [10, 50, 100]) -> Dict:
        """测试批量分析吞吐量"""
        print("\n=== 批量分析吞吐量测试 ===")
        
        results = {}
        
        for batch_size in batch_sizes:
            print(f"\n测试批量大小: {batch_size}")
            batch_texts = texts[:batch_size]
            
            # 词典法
            start = time.perf_counter()
            for text in batch_texts:
                self.lexicon_analyzer.analyze(text)
            lexicon_time = time.perf_counter() - start
            lexicon_throughput = batch_size / lexicon_time
            
            # 深度学习模型
            start = time.perf_counter()
            for text in batch_texts:
                self.model_analyzer.predict(text)
            model_time = time.perf_counter() - start
            model_throughput = batch_size / model_time
            
            results[batch_size] = {
                'lexicon': {
                    'total_time_s': round(lexicon_time, 3),
                    'throughput_per_s': round(lexicon_throughput, 2)
                },
                'model': {
                    'total_time_s': round(model_time, 3),
                    'throughput_per_s': round(model_throughput, 2)
                }
            }
            
            print(f"  词典法: {lexicon_throughput:.2f} 条/秒")
            print(f"  深度学习: {model_throughput:.2f} 条/秒")
        
        return results
    
    async def test_concurrent_requests(self, texts: List[str], concurrency_levels: List[int] = [1, 5, 10]) -> Dict:
        """测试并发处理能力"""
        print("\n=== 并发处理能力测试 ===")
        
        results = {}
        
        async def analyze_text(text: str, method: str) -> float:
            start = time.perf_counter()
            if method == 'lexicon':
                self.lexicon_analyzer.analyze(text)
            else:
                self.model_analyzer.predict(text)
            return (time.perf_counter() - start) * 1000
        
        for level in concurrency_levels:
            print(f"\n测试并发级别: {level}")
            test_texts = texts[:level]
            
            # 词典法并发
            start = time.perf_counter()
            tasks = [analyze_text(text, 'lexicon') for text in test_texts]
            await asyncio.gather(*tasks)
            lexicon_time = (time.perf_counter() - start) * 1000
            
            # 深度学习并发
            start = time.perf_counter()
            tasks = [analyze_text(text, 'model') for text in test_texts]
            await asyncio.gather(*tasks)
            model_time = (time.perf_counter() - start) * 1000
            
            results[level] = {
                'lexicon': {
                    'total_time_ms': round(lexicon_time, 2),
                    'avg_time_ms': round(lexicon_time / level, 2)
                },
                'model': {
                    'total_time_ms': round(model_time, 2),
                    'avg_time_ms': round(model_time / level, 2)
                }
            }
            
            print(f"  词典法: 总耗时 {lexicon_time:.2f}ms, 平均 {lexicon_time/level:.2f}ms/条")
            print(f"  深度学习: 总耗时 {model_time:.2f}ms, 平均 {model_time/level:.2f}ms/条")
        
        return results
    
    def generate_report(self) -> str:
        """生成测试报告"""
        report = []
        report.append("=" * 60)
        report.append("中文情感分析系统性能基准测试报告")
        report.append("=" * 60)
        report.append(f"测试时间: {self.results['test_time']}")
        report.append("")
        
        # 单条文本延迟
        report.append("一、单条文本分析延迟")
        report.append("-" * 40)
        for method, stats in self.results['single_text_latency'].items():
            method_name = "情感词典" if method == 'lexicon' else "深度学习"
            report.append(f"\n{method_name}:")
            report.append(f"  平均延迟: {stats['avg_ms']}ms")
            report.append(f"  最小延迟: {stats['min_ms']}ms")
            report.append(f"  最大延迟: {stats['max_ms']}ms")
            report.append(f"  P50: {stats['p50_ms']}ms")
            report.append(f"  P95: {stats['p95_ms']}ms")
            report.append(f"  P99: {stats['p99_ms']}ms")
        
        # 批量吞吐量
        report.append("\n\n二、批量分析吞吐量")
        report.append("-" * 40)
        for batch_size, stats in self.results['batch_throughput'].items():
            report.append(f"\n批量大小 {batch_size}:")
            report.append(f"  情感词典: {stats['lexicon']['throughput_per_s']} 条/秒")
            report.append(f"  深度学习: {stats['model']['throughput_per_s']} 条/秒")
        
        # 并发测试
        report.append("\n\n三、并发处理能力")
        report.append("-" * 40)
        for level, stats in self.results['concurrent_test'].items():
            report.append(f"\n并发级别 {level}:")
            report.append(f"  情感词典: 总耗时 {stats['lexicon']['total_time_ms']}ms")
            report.append(f"  深度学习: 总耗时 {stats['model']['total_time_ms']}ms")
        
        report.append("\n" + "=" * 60)
        report.append("测试完成")
        report.append("=" * 60)
        
        return "\n".join(report)
    
    def run_all_tests(self):
        """运行所有测试"""
        print("开始性能基准测试...")
        self.results['test_time'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        texts = self.generate_test_texts(100)
        
        # 单条文本延迟测试
        self.results['single_text_latency'] = self.test_single_text_latency(texts)
        
        # 批量吞吐量测试
        self.results['batch_throughput'] = self.test_batch_throughput(texts)
        
        # 并发测试
        loop = asyncio.get_event_loop()
        self.results['concurrent_test'] = loop.run_until_complete(
            self.test_concurrent_requests(texts)
        )
        
        # 生成报告
        report = self.generate_report()
        print("\n" + report)
        
        # 保存报告
        report_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            'data', 'performance_report.txt'
        )
        with open(report_path, 'w', encoding='utf-8') as f:
            f.write(report)
        
        # 保存JSON结果
        json_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            'data', 'performance_report.json'
        )
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(self.results, f, ensure_ascii=False, indent=2)
        
        print(f"\n报告已保存到: {report_path}")
        print(f"JSON结果已保存到: {json_path}")


if __name__ == '__main__':
    benchmark = PerformanceBenchmark()
    benchmark.run_all_tests()
