# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
文本分析路由
"""

import time
import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Optional

from ..sentiment import LexiconAnalyzer, ModelAnalyzer
from ..services import call_text_api
from ..services.system_monitor import system_monitor
from ..routers.performance import record_analysis

router = APIRouter(prefix='/api/text', tags=['文本分析'])

lexicon_analyzer = LexiconAnalyzer()
model_analyzer = ModelAnalyzer()


def reload_lexicon():
    """重新加载词典分析器的词典"""
    lexicon_analyzer.reload()
    return True


class TextRequest(BaseModel):
    text: str


class BatchTextRequest(BaseModel):
    texts: List[str]


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


def _analyze_lexicon_sync(text: str) -> dict:
    return lexicon_analyzer.analyze(text)


def _analyze_model_sync(text: str) -> dict:
    return model_analyzer.predict(text)


@router.post('/analyze', response_model=TextAnalysisResponse)
async def analyze_text(request: TextRequest):
    if not request.text or len(request.text.strip()) == 0:
        raise HTTPException(status_code=400, detail='文本不能为空')
    
    lexicon_result, lexicon_profiling, lexicon_time = system_monitor.profile_analysis(
        _analyze_lexicon_sync, request.text
    )
    
    model_result, model_profiling, model_time = system_monitor.profile_analysis(
        _analyze_model_sync, request.text
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
    if not request.text or len(request.text.strip()) == 0:
        raise HTTPException(status_code=400, detail='文本不能为空')
    
    start_time = time.time()
    
    result = await call_text_api(request.text)
    
    processing_time = time.time() - start_time
    
    if result.get('success') and result.get('sentiment'):
        record_analysis('text', result['sentiment'], processing_time, 'external')
    
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
    if not request.text:
        raise HTTPException(status_code=400, detail='文本不能为空')
    
    result, profiling, processing_time = system_monitor.profile_analysis(
        _analyze_lexicon_sync, request.text
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
    if not request.text:
        raise HTTPException(status_code=400, detail='文本不能为空')
    
    result, profiling, processing_time = system_monitor.profile_analysis(
        _analyze_model_sync, request.text
    )
    
    record_analysis(
        'text', result['sentiment'], processing_time, 'model',
        profiling.cpu_peak, profiling.cpu_avg,
        profiling.gpu_peak, profiling.gpu_avg
    )
    
    result['processing_time'] = round(processing_time, 4)
    return result


@router.post('/analyze/batch', response_model=BatchAnalysisResponse)
async def analyze_batch(request: BatchTextRequest):
    if not request.texts or len(request.texts) == 0:
        raise HTTPException(status_code=400, detail='文本列表不能为空')
    
    results = []
    for text in request.texts:
        if not text or len(text.strip()) == 0:
            continue
        
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
    
    return BatchAnalysisResponse(results=results)


@router.post('/analyze/external/batch', response_model=BatchExternalAnalysisResponse)
async def analyze_batch_external(request: BatchTextRequest):
    if not request.texts or len(request.texts) == 0:
        raise HTTPException(status_code=400, detail='文本列表不能为空')
    
    results = []
    for text in request.texts:
        if not text or len(text.strip()) == 0:
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
    
    if not request.results:
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
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode('utf-8-sig')),
            media_type='text/csv',
            headers={'Content-Disposition': 'attachment; filename=analysis_results.csv'}
        )
    else:
        output = io.BytesIO()
        df.to_excel(output, index=False, engine='openpyxl')
        output.seek(0)
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
    
    if not request.results:
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
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode('utf-8-sig')),
            media_type='text/csv',
            headers={'Content-Disposition': 'attachment; filename=performance_data.csv'}
        )
    else:
        output = io.BytesIO()
        df.to_excel(output, index=False, engine='openpyxl')
        output.seek(0)
        return StreamingResponse(
            output,
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={'Content-Disposition': 'attachment; filename=performance_data.xlsx'}
        )
