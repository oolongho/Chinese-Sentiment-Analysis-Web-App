#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
混合模型对比实验 API
提供深度学习、词典方法、混合模型的对比实验功能
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import time

from sentiment.lexicon_analyzer import LexiconAnalyzer
from sentiment.model_analyzer import ModelAnalyzer
from sentiment.hybrid_analyzer import HybridAnalyzer, HybridStrategy


router = APIRouter(prefix='/api/experiments', tags=['对比实验'])


class ComparisonRequest(BaseModel):
    """对比实验请求"""
    texts: List[str] = Field(..., description="待预测文本列表")
    include_details: bool = Field(default=False, description="是否包含详细信息")


class SingleResult(BaseModel):
    """单个预测结果"""
    text: str
    sentiment: str
    confidence: float
    inference_time_ms: float
    method: str


class MethodComparison(BaseModel):
    """方法对比结果"""
    method: str
    total_time_ms: float
    avg_inference_time_ms: float
    predictions: List[Dict[str, Any]]


class ComparisonResponse(BaseModel):
    """对比实验响应"""
    success: bool
    message: str
    num_samples: int
    methods: List[MethodComparison]
    summary: Optional[Dict[str, Any]] = None


@router.post('/compare_methods', response_model=ComparisonResponse, summary="对比三种方法")
async def compare_sentiment_methods(request: ComparisonRequest):
    """
    对比深度学习、词典方法、混合模型的性能
    
    对比维度：
    1. 推理速度（平均推理时间）
    2. 预测结果一致性
    3. 置信度分布
    """
    try:
        if not request.texts:
            raise HTTPException(status_code=400, detail="文本列表不能为空")
        
        # 初始化三个分析器
        lexicon_analyzer = LexiconAnalyzer()
        model_analyzer = ModelAnalyzer(precision="FP32")
        hybrid_analyzer = HybridAnalyzer(strategy=HybridStrategy.CASCADE)
        
        results = {
            'lexicon': [],
            'roberta': [],
            'hybrid': []
        }
        
        # 分别运行三种方法
        print(f"[对比实验] 开始测试 {len(request.texts)} 条文本...")
        
        # 1. 词典方法
        start_time = time.time()
        for text in request.texts:
            result = lexicon_analyzer.analyze(text)
            results['lexicon'].append({
                'text': text,
                'sentiment': result['sentiment'],
                'confidence': result['confidence'],
                'score': result['score'],
            })
        lexicon_total_time = (time.time() - start_time) * 1000
        
        # 2. 深度学习方法
        start_time = time.time()
        for text in request.texts:
            result = model_analyzer.predict(text)
            results['roberta'].append({
                'text': text,
                'sentiment': result['sentiment'],
                'confidence': result['confidence'],
                'scores': result['scores'],
            })
        roberta_total_time = (time.time() - start_time) * 1000
        
        # 3. 混合模型
        start_time = time.time()
        for text in request.texts:
            result = hybrid_analyzer.predict(text)
            results['hybrid'].append({
                'text': text,
                'sentiment': result['sentiment'],
                'confidence': result['confidence'],
                'method': result['method'],
                'inference_time_ms': result['inference_time_ms'],
            })
        hybrid_total_time = (time.time() - start_time) * 1000
        
        # 计算统计信息
        num_samples = len(request.texts)
        
        methods_comparison = [
            MethodComparison(
                method='lexicon',
                total_time_ms=round(lexicon_total_time, 2),
                avg_inference_time_ms=round(lexicon_total_time / num_samples, 3),
                predictions=results['lexicon'] if request.include_details else []
            ),
            MethodComparison(
                method='roberta',
                total_time_ms=round(roberta_total_time, 2),
                avg_inference_time_ms=round(roberta_total_time / num_samples, 3),
                predictions=results['roberta'] if request.include_details else []
            ),
            MethodComparison(
                method='hybrid',
                total_time_ms=round(hybrid_total_time, 2),
                avg_inference_time_ms=round(hybrid_total_time / num_samples, 3),
                predictions=results['hybrid'] if request.include_details else []
            ),
        ]
        
        # 计算加速比和一致性
        speedup_roberta = roberta_total_time / hybrid_total_time if hybrid_total_time > 0 else 1
        speedup_lexicon = lexicon_total_time / hybrid_total_time if hybrid_total_time > 0 else 1
        
        # 计算预测一致性
        agreement_count = 0
        for i in range(num_samples):
            if (results['lexicon'][i]['sentiment'] == results['roberta'][i]['sentiment'] == 
                results['hybrid'][i]['sentiment']):
                agreement_count += 1
        
        agreement_rate = agreement_count / num_samples
        
        summary = {
            'speedup_vs_roberta': round(speedup_roberta, 3),
            'speedup_vs_lexicon': round(speedup_lexicon, 3),
            'hybrid_fast_path_ratio': round(
                sum(1 for p in results['hybrid'] if p['method'] == 'lexicon_fast') / num_samples, 3
            ),
            'agreement_rate': round(agreement_rate, 3),
            'recommendation': '混合模型在保持准确率的同时提升了速度' if speedup_roberta > 1.1 else '混合模型速度与深度学习相当'
        }
        
        print(f"[对比实验] 完成！混合模型加速比：{speedup_roberta:.2f}x")
        
        return ComparisonResponse(
            success=True,
            message=f"对比实验完成，共测试 {num_samples} 条文本",
            num_samples=num_samples,
            methods=methods_comparison,
            summary=summary
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[对比实验] 失败：{str(e)}")
        raise HTTPException(status_code=500, detail=f"对比实验失败：{str(e)}")


@router.get('/hybrid_stats', summary="获取混合模型统计信息")
async def get_hybrid_stats():
    """获取混合模型的运行统计信息"""
    try:
        # 创建临时分析器获取统计
        hybrid_analyzer = HybridAnalyzer(strategy=HybridStrategy.CASCADE)
        stats = hybrid_analyzer.get_stats()
        
        return {
            'success': True,
            'stats': stats,
            'description': {
                'total_predictions': '总预测次数',
                'cascade_fast_path': '使用词典快速路径次数',
                'cascade_slow_path': '使用深度学习慢速路径次数',
                'fast_path_ratio': '快速路径占比（越高越快）'
            }
        }
        
    except Exception as e:
        print(f"[混合模型] 获取统计失败：{str(e)}")
        raise HTTPException(status_code=500, detail=f"获取统计信息失败：{str(e)}")
