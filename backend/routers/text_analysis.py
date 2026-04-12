# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
文本分析路由
"""

import time
import asyncio
import threading
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, List, Optional

MAX_TEXT_LENGTH = 5000
MAX_BATCH_SIZE = 100

from sentiment import get_lexicon_analyzer, get_model_analyzer, reload_lexicon_analyzer
from sentiment.hybrid_analyzer import HybridAnalyzer, HybridStrategy
from services import call_text_api
from services.system_monitor import system_monitor
from routers.performance import record_analysis
from routers.logger import get_logger

logger = get_logger('text_analysis')

router = APIRouter(prefix='/api/text', tags=['文本分析'])

# 混合分析器单例
_hybrid_analyzer_instance: Optional[HybridAnalyzer] = None
_strategy_lock = threading.Lock()


def get_hybrid_analyzer(strategy: HybridStrategy = HybridStrategy.CASCADE) -> HybridAnalyzer:
    """
    获取混合分析器实例（根据策略创建或更新）
    
    Args:
        strategy: 混合策略
        
    Returns:
        HybridAnalyzer 实例
    """
    global _hybrid_analyzer_instance
    
    # 使用锁保护策略更新
    with _strategy_lock:
        if _hybrid_analyzer_instance is None:
            logger.info(f"初始化混合分析器，策略：{strategy.value}")
            _hybrid_analyzer_instance = HybridAnalyzer(strategy=strategy)
        elif _hybrid_analyzer_instance.strategy != strategy:
            logger.info(f"更新混合分析器策略：{_hybrid_analyzer_instance.strategy.value} -> {strategy.value}")
            _hybrid_analyzer_instance.strategy = strategy
    
    return _hybrid_analyzer_instance


def reload_lexicon():
    """重新加载词典分析器的词典"""
    return reload_lexicon_analyzer()


class TextRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=MAX_TEXT_LENGTH)


class BatchTextRequest(BaseModel):
    texts: List[str] = Field(..., min_length=1, max_length=MAX_BATCH_SIZE)


class AnalysisResult(BaseModel):
    sentiment: str
    score: float
    confidence: float
    processing_time: float
    sentiment_words: Optional[list] = None
    scores: Optional[Dict[str, float]] = None
    cpu_peak: float = 0.0
    cpu_avg: float = 0.0
    gpu_peak: Optional[float] = None
    gpu_avg: Optional[float] = None


class TextAnalysisResponse(BaseModel):
    lexicon_result: AnalysisResult
    model_result: AnalysisResult


class BatchAnalysisResponse(BaseModel):
    results: List[TextAnalysisResponse]


class ExternalAnalysisResult(BaseModel):
    success: bool
    sentiment: Optional[str] = None
    confidence: Optional[float] = None
    reasoning: Optional[str] = None
    model: Optional[str] = None
    processing_time: float
    error: Optional[str] = None


class BatchExternalAnalysisResponse(BaseModel):
    results: List[ExternalAnalysisResult]


class HybridAnalysisRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=MAX_TEXT_LENGTH)
    strategy: str = Field(default="cascade", description="混合策略：cascade, weighted, rule_based, enhanced_cascade, adaptive")
    config: Optional[Dict] = Field(default=None, description="可选配置参数")


class HybridStats(BaseModel):
    total_predictions: int = 0
    cascade_fast_path: int = 0
    cascade_slow_path: int = 0
    fast_path_ratio: float = 0.0


class HybridAnalysisResult(BaseModel):
    sentiment: str
    confidence: float
    scores: Dict[str, float]
    method: str  # lexicon_fast 或 cascade_fusion
    inference_time_ms: float
    hybrid_stats: Optional[HybridStats] = None
    hybrid_strategy: Optional[str] = None
    lexicon_result: Optional[Dict] = None
    roberta_result: Optional[Dict] = None


def _analyze_lexicon_sync(text: str) -> dict:
    lexicon_analyzer = get_lexicon_analyzer()
    return lexicon_analyzer.analyze(text)


def _analyze_model_sync(text: str) -> dict:
    model_analyzer = get_model_analyzer()
    return model_analyzer.predict(text)


@router.post('/analyze', response_model=TextAnalysisResponse)
async def analyze_text(request: TextRequest):
    text = request.text.strip()
    if not text:
        logger.warning("文本分析请求: 文本为空")
        raise HTTPException(status_code=400, detail='文本不能为空')

    logger.info(f"开始文本分析: {text[:50]}...")
    
    lexicon_result, lexicon_profiling, lexicon_time = system_monitor.profile_analysis(
        _analyze_lexicon_sync, text
    )

    model_result, model_profiling, model_time = system_monitor.profile_analysis(
        _analyze_model_sync, text
    )
    
    record_analysis(
        'text', lexicon_result['sentiment'], lexicon_time, 'lexicon',
        lexicon_profiling.cpu_peak, lexicon_profiling.cpu_avg,
        lexicon_profiling.gpu_peak, lexicon_profiling.gpu_avg
    )
    
    record_analysis(
        'text', model_result['sentiment'], model_time, 'model',
        model_profiling.cpu_peak, model_profiling.cpu_avg,
        model_profiling.gpu_peak, model_profiling.gpu_avg
    )
    
    logger.info(f"文本分析完成: 词典={lexicon_result['sentiment']}, 模型={model_result['sentiment']}")
    
    return TextAnalysisResponse(
        lexicon_result=AnalysisResult(
            sentiment=lexicon_result['sentiment'],
            score=lexicon_result['score'],
            confidence=lexicon_result['confidence'],
            processing_time=round(lexicon_time, 4),
            sentiment_words=lexicon_result.get('sentiment_words', []),
            cpu_peak=lexicon_profiling.cpu_peak,
            cpu_avg=lexicon_profiling.cpu_avg,
            gpu_peak=lexicon_profiling.gpu_peak,
            gpu_avg=lexicon_profiling.gpu_avg
        ),
        model_result=AnalysisResult(
            sentiment=model_result['sentiment'],
            score=model_result['scores'][model_result['sentiment']],
            confidence=model_result['confidence'],
            processing_time=round(model_time, 4),
            scores=model_result.get('scores'),
            cpu_peak=model_profiling.cpu_peak,
            cpu_avg=model_profiling.cpu_avg,
            gpu_peak=model_profiling.gpu_peak,
            gpu_avg=model_profiling.gpu_avg
        )
    )


@router.post('/analyze/external', response_model=ExternalAnalysisResult)
async def analyze_text_external(request: TextRequest):
    text = request.text.strip()
    if not text:
        logger.warning("外部API文本分析请求: 文本为空")
        raise HTTPException(status_code=400, detail='文本不能为空')

    logger.info(f"开始外部API文本分析: {text[:50]}...")
    
    start_time = time.time()
    
    result = await call_text_api(text)
    
    processing_time = time.time() - start_time
    
    if result.get('success') and result.get('sentiment'):
        record_analysis('text', result['sentiment'], processing_time, 'external')
        logger.info(f"外部API分析完成: {result['sentiment']}")
    else:
        logger.warning(f"外部API分析失败: {result.get('error')}")
    
    return ExternalAnalysisResult(
        success=result.get('success', False),
        sentiment=result.get('sentiment'),
        confidence=result.get('confidence'),
        reasoning=result.get('reasoning'),
        model=result.get('model'),
        processing_time=round(processing_time, 4),
        error=result.get('error')
    )


@router.post('/analyze/lexicon')
async def analyze_lexicon(request: TextRequest):
    text = request.text.strip()
    if not text:
        logger.warning("词典分析请求: 文本为空")
        raise HTTPException(status_code=400, detail='文本不能为空')

    logger.info(f"开始词典分析: {text[:50]}...")

    result, profiling, processing_time = system_monitor.profile_analysis(
        _analyze_lexicon_sync, text
    )
    
    record_analysis(
        'text', result['sentiment'], processing_time, 'lexicon',
        profiling.cpu_peak, profiling.cpu_avg,
        profiling.gpu_peak, profiling.gpu_avg
    )
    
    result['processing_time'] = round(processing_time, 4)
    return result


@router.post('/analyze/model')
async def analyze_model(request: TextRequest):
    text = request.text.strip()
    if not text:
        logger.warning("模型分析请求：文本为空")
        raise HTTPException(status_code=400, detail='文本不能为空')

    logger.info(f"开始模型分析：{text[:50]}...")

    result, profiling, processing_time = system_monitor.profile_analysis(
        _analyze_model_sync, text
    )
    
    record_analysis(
        'text', result['sentiment'], processing_time, 'model',
        profiling.cpu_peak, profiling.cpu_avg,
        profiling.gpu_peak, profiling.gpu_avg
    )
    
    result['processing_time'] = round(processing_time, 4)
    return result


def _analyze_hybrid_sync(text: str, strategy: HybridStrategy, config: Optional[Dict] = None) -> dict:
    """同步执行混合分析"""
    hybrid_analyzer = get_hybrid_analyzer(strategy=strategy)
    
    # 如果提供了配置，更新分析器的配置
    if config:
        if 'lexicon_threshold' in config:
            hybrid_analyzer.config['lexicon_threshold'] = config['lexicon_threshold']
        if 'lexicon_score_threshold' in config:
            hybrid_analyzer.config['lexicon_score_threshold'] = config['lexicon_score_threshold']
        if 'roberta_weight' in config:
            hybrid_analyzer.config['roberta_weight'] = config['roberta_weight']
    
    return hybrid_analyzer.predict(text)


@router.post('/analyze/hybrid', response_model=HybridAnalysisResult)
async def analyze_hybrid(request: HybridAnalysisRequest):
    """
    混合情感分析 API
    
    结合深度学习与词典方法，提供：
    1. 级联加速：简单案例用词典（快速），复杂案例用深度学习（准确）
    2. 置信度加权：根据两种方法的置信度动态混合结果
    3. 规则修正：用词典规则修正深度学习的明显错误
    """
    text = request.text.strip()
    if not text:
        logger.warning("混合分析请求：文本为空")
        raise HTTPException(status_code=400, detail='文本不能为空')
    
    # 解析策略
    try:
        strategy = HybridStrategy(request.strategy.lower())
    except ValueError:
        logger.warning(f"无效的混合策略：{request.strategy}，使用默认 cascade")
        strategy = HybridStrategy.CASCADE
    
    logger.info(f"开始混合分析：{text[:50]}... (策略：{strategy.value})")
    
    # 执行分析并监控性能
    result, profiling, processing_time = system_monitor.profile_analysis(
        _analyze_hybrid_sync, text, strategy, request.config
    )
    
    # 记录性能统计
    record_analysis(
        'text', result['sentiment'], processing_time, 'hybrid',
        profiling.cpu_peak, profiling.cpu_avg,
        profiling.gpu_peak, profiling.gpu_avg
    )
    
    # 获取混合分析器统计信息
    hybrid_analyzer = get_hybrid_analyzer(strategy=strategy)
    stats = hybrid_analyzer.get_stats()
    
    logger.info(f"混合分析完成：{result['sentiment']} (方法：{result['method']}, 耗时：{result['inference_time_ms']:.2f}ms)")
    
    return HybridAnalysisResult(
        sentiment=result['sentiment'],
        confidence=result['confidence'],
        scores=result.get('scores', {}),
        method=result['method'],
        inference_time_ms=round(result['inference_time_ms'], 4),
        hybrid_stats=HybridStats(
            total_predictions=stats['total_predictions'],
            cascade_fast_path=stats['cascade_fast_path'],
            cascade_slow_path=stats['cascade_slow_path'],
            fast_path_ratio=round(stats['fast_path_ratio'], 4)
        ),
        hybrid_strategy=result.get('hybrid_strategy'),
        lexicon_result=result.get('lexicon_result'),
        roberta_result=result.get('roberta_result')
    )


@router.post('/analyze/batch', response_model=BatchAnalysisResponse)
async def analyze_batch(request: BatchTextRequest):
    if not request.texts:
        logger.warning("批量文本分析请求: 文本列表为空")
        raise HTTPException(status_code=400, detail='文本列表不能为空')

    logger.info(f"开始批量文本分析: {len(request.texts)} 条")
    
    from services.cache_service import save_text_analysis_cache
    from services.system_monitor import system_monitor
    
    results = []
    gpu_memory_peak = 0.0
    
    for text in request.texts:
        text = text.strip()
        if not text:
            continue

        lexicon_result, lexicon_profiling, lexicon_time = system_monitor.profile_analysis(
            _analyze_lexicon_sync, text
        )

        model_result, model_profiling, model_time = system_monitor.profile_analysis(
            _analyze_model_sync, text
        )
        
        gpu_info = system_monitor.get_gpu_memory_info()
        if gpu_info.allocated_mb > gpu_memory_peak:
            gpu_memory_peak = gpu_info.allocated_mb
        
        record_analysis(
            'text', lexicon_result['sentiment'], lexicon_time, 'lexicon',
            lexicon_profiling.cpu_peak, lexicon_profiling.cpu_avg,
            lexicon_profiling.gpu_peak, lexicon_profiling.gpu_avg
        )
        
        record_analysis(
            'text', model_result['sentiment'], model_time, 'model',
            model_profiling.cpu_peak, model_profiling.cpu_avg,
            model_profiling.gpu_peak, model_profiling.gpu_avg
        )
        
        results.append(TextAnalysisResponse(
            lexicon_result=AnalysisResult(
                sentiment=lexicon_result['sentiment'],
                score=lexicon_result['score'],
                confidence=lexicon_result['confidence'],
                processing_time=round(lexicon_time, 4),
                sentiment_words=lexicon_result.get('sentiment_words', []),
                cpu_peak=lexicon_profiling.cpu_peak,
                cpu_avg=lexicon_profiling.cpu_avg,
                gpu_peak=lexicon_profiling.gpu_peak,
                gpu_avg=lexicon_profiling.gpu_avg
            ),
            model_result=AnalysisResult(
                sentiment=model_result['sentiment'],
                score=model_result['scores'][model_result['sentiment']],
                confidence=model_result['confidence'],
                processing_time=round(model_time, 4),
                scores=model_result.get('scores'),
                cpu_peak=model_profiling.cpu_peak,
                cpu_avg=model_profiling.cpu_avg,
                gpu_peak=model_profiling.gpu_peak,
                gpu_avg=model_profiling.gpu_avg
            )
        ))
    
    input_text = '\n'.join([t.strip() for t in request.texts if t.strip()])
    cache_results = []
    for i, r in enumerate(results):
        cache_results.append({
            'text': [t.strip() for t in request.texts if t.strip()][i] if i < len([t.strip() for t in request.texts if t.strip()]) else '',
            'model_result': r.model_result.model_dump(),
            'lexicon_result': r.lexicon_result.model_dump()
        })
    save_text_analysis_cache(input_text, cache_results, gpu_memory_peak)
    
    logger.info(f"批量文本分析完成: {len(results)} 条")
    return BatchAnalysisResponse(results=results)


@router.post('/analyze/external/batch', response_model=BatchExternalAnalysisResponse)
async def analyze_batch_external(request: BatchTextRequest):
    if not request.texts:
        logger.warning("批量外部API分析请求: 文本列表为空")
        raise HTTPException(status_code=400, detail='文本列表不能为空')

    logger.info(f"开始批量外部API分析: {len(request.texts)} 条")

    results = []
    for text in request.texts:
        text = text.strip()
        if not text:
            continue

        start_time = time.time()

        result = await call_text_api(text)
        
        processing_time = time.time() - start_time
        
        if result.get('success') and result.get('sentiment'):
            record_analysis('text', result['sentiment'], processing_time, 'external')
        
        results.append(ExternalAnalysisResult(
            success=result.get('success', False),
            sentiment=result.get('sentiment'),
            confidence=result.get('confidence'),
            reasoning=result.get('reasoning'),
            model=result.get('model'),
            processing_time=round(processing_time, 4),
            error=result.get('error')
        ))
    
    logger.info(f"批量外部API分析完成: {len(results)} 条")
    return BatchExternalAnalysisResponse(results=results)


class ExportRequest(BaseModel):
    results: List[Dict]
    format: str = 'xlsx'


class PerformanceExportRequest(BaseModel):
    results: List[Dict]
    format: str = 'xlsx'


@router.post('/export-results')
async def export_results(request: ExportRequest):
    import io
    from fastapi.responses import StreamingResponse
    import pandas as pd
    
    logger.info(f"导出分析结果: {len(request.results)} 条")
    
    if not request.results:
        logger.warning("导出请求: 没有可导出的结果")
        raise HTTPException(status_code=400, detail='没有可导出的结果')
    
    rows = []
    for r in request.results:
        row = {
            '文本': r.get('text', ''),
            '模型预测情感': r.get('model_sentiment', ''),
            '模型置信度': r.get('model_confidence', 0),
            '词典预测情感': r.get('lexicon_sentiment', ''),
            '词典置信度': r.get('lexicon_confidence', 0),
        }
        if r.get('external_sentiment'):
            row['外部API情感'] = r.get('external_sentiment')
            row['外部API置信度'] = r.get('external_confidence', 0)
        rows.append(row)
    
    df = pd.DataFrame(rows)
    
    if request.format == 'csv':
        output = io.StringIO()
        df.to_csv(output, index=False, encoding='utf-8-sig')
        output.seek(0)
        logger.info("导出CSV格式成功")
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode('utf-8-sig')),
            media_type='text/csv',
            headers={'Content-Disposition': 'attachment; filename=analysis_results.csv'}
        )
    else:
        output = io.BytesIO()
        df.to_excel(output, index=False, engine='openpyxl')
        output.seek(0)
        logger.info("导出Excel格式成功")
        return StreamingResponse(
            output,
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={'Content-Disposition': 'attachment; filename=analysis_results.xlsx'}
        )


@router.post('/export-performance')
async def export_performance(request: PerformanceExportRequest):
    import io
    from fastapi.responses import StreamingResponse
    import pandas as pd
    
    logger.info(f"导出性能数据: {len(request.results)} 条")
    
    if not request.results:
        logger.warning("导出请求: 没有可导出的性能数据")
        raise HTTPException(status_code=400, detail='没有可导出的性能数据')
    
    rows = []
    for r in request.results:
        row = {
            '文本': r.get('text', ''),
            '模型分析时间(ms)': r.get('model_time', 0),
            '模型CPU峰值(%)': r.get('model_cpu_peak', 0),
            '模型GPU峰值(%)': r.get('model_gpu_peak', 0),
            '词典分析时间(ms)': r.get('lexicon_time', 0),
            '词典CPU峰值(%)': r.get('lexicon_cpu_peak', 0),
            '词典GPU峰值(%)': r.get('lexicon_gpu_peak', 0),
        }
        if r.get('external_time'):
            row['外部API时间(ms)'] = r.get('external_time', 0)
        rows.append(row)
    
    df = pd.DataFrame(rows)
    
    if request.format == 'csv':
        output = io.StringIO()
        df.to_csv(output, index=False, encoding='utf-8-sig')
        output.seek(0)
        logger.info("导出性能CSV格式成功")
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode('utf-8-sig')),
            media_type='text/csv',
            headers={'Content-Disposition': 'attachment; filename=performance_data.csv'}
        )
    else:
        output = io.BytesIO()
        df.to_excel(output, index=False, engine='openpyxl')
        output.seek(0)
        logger.info("导出性能Excel格式成功")
        return StreamingResponse(
            output,
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={'Content-Disposition': 'attachment; filename=performance_data.xlsx'}
        )


@router.get('/cached-result')
async def get_cached_analysis_result():
    """获取缓存的文本分析结果"""
    from services.cache_service import load_text_analysis_cache
    cached = load_text_analysis_cache()
    return {
        'success': cached is not None,
        'cached_result': cached
    }


@router.post('/clear-cache')
async def clear_analysis_cache():
    """清除文本分析缓存"""
    from services.cache_service import clear_text_analysis_cache
    clear_text_analysis_cache()
    return {'success': True, 'message': '文本分析缓存已清除'}
