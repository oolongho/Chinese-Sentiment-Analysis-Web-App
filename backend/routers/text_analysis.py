# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
文本分析路由
"""

import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Optional

from ..sentiment import LexiconAnalyzer, ModelAnalyzer
from ..services import call_text_api

router = APIRouter(prefix='/api/text', tags=['文本分析'])

lexicon_analyzer = LexiconAnalyzer()
model_analyzer = ModelAnalyzer()


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


@router.post('/analyze', response_model=TextAnalysisResponse)
async def analyze_text(request: TextRequest):
    """
    分析文本情感
    
    返回词典分析和模型分析两种结果
    """
    if not request.text or len(request.text.strip()) == 0:
        raise HTTPException(status_code=400, detail='文本不能为空')
    
    start_time = time.time()
    lexicon_result = lexicon_analyzer.analyze(request.text)
    lexicon_time = time.time() - start_time
    
    start_time = time.time()
    model_result = model_analyzer.predict(request.text)
    model_time = time.time() - start_time
    
    return TextAnalysisResponse(
        lexicon_result=AnalysisResult(
            sentiment=lexicon_result['sentiment'],
            score=lexicon_result['score'],
            confidence=lexicon_result['confidence'],
            processing_time=round(lexicon_time, 4),
            sentiment_words=lexicon_result.get('sentiment_words', [])
        ),
        model_result=AnalysisResult(
            sentiment=model_result['sentiment'],
            score=model_result['scores'][model_result['sentiment']],
            confidence=model_result['confidence'],
            processing_time=round(model_time, 4),
            scores=model_result.get('scores')
        )
    )


@router.post('/analyze/external', response_model=ExternalAnalysisResult)
async def analyze_text_external(request: TextRequest):
    """
    使用外部API分析文本情感
    
    需要在管理平台配置外部API
    """
    if not request.text or len(request.text.strip()) == 0:
        raise HTTPException(status_code=400, detail='文本不能为空')
    
    start_time = time.time()
    result = await call_text_api(request.text)
    processing_time = time.time() - start_time
    
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
    """仅使用词典分析"""
    if not request.text:
        raise HTTPException(status_code=400, detail='文本不能为空')
    
    start_time = time.time()
    result = lexicon_analyzer.analyze(request.text)
    processing_time = time.time() - start_time
    
    result['processing_time'] = round(processing_time, 4)
    return result


@router.post('/analyze/model')
async def analyze_model(request: TextRequest):
    """仅使用模型分析"""
    if not request.text:
        raise HTTPException(status_code=400, detail='文本不能为空')
    
    start_time = time.time()
    result = model_analyzer.predict(request.text)
    processing_time = time.time() - start_time
    
    result['processing_time'] = round(processing_time, 4)
    return result


@router.post('/analyze/batch', response_model=BatchAnalysisResponse)
async def analyze_batch(request: BatchTextRequest):
    """
    批量分析多行文本情感
    
    每行文本作为一个独立素材进行分析
    """
    if not request.texts or len(request.texts) == 0:
        raise HTTPException(status_code=400, detail='文本列表不能为空')
    
    results = []
    for text in request.texts:
        if not text or len(text.strip()) == 0:
            continue
        
        start_time = time.time()
        lexicon_result = lexicon_analyzer.analyze(text)
        lexicon_time = time.time() - start_time
        
        start_time = time.time()
        model_result = model_analyzer.predict(text)
        model_time = time.time() - start_time
        
        results.append(TextAnalysisResponse(
            lexicon_result=AnalysisResult(
                sentiment=lexicon_result['sentiment'],
                score=lexicon_result['score'],
                confidence=lexicon_result['confidence'],
                processing_time=round(lexicon_time, 4),
                sentiment_words=lexicon_result.get('sentiment_words', [])
            ),
            model_result=AnalysisResult(
                sentiment=model_result['sentiment'],
                score=model_result['scores'][model_result['sentiment']],
                confidence=model_result['confidence'],
                processing_time=round(model_time, 4),
                scores=model_result.get('scores')
            )
        ))
    
    return BatchAnalysisResponse(results=results)


@router.post('/analyze/external/batch', response_model=BatchExternalAnalysisResponse)
async def analyze_batch_external(request: BatchTextRequest):
    """
    批量使用外部API分析文本情感
    
    需要在管理平台配置外部API
    """
    if not request.texts or len(request.texts) == 0:
        raise HTTPException(status_code=400, detail='文本列表不能为空')
    
    results = []
    for text in request.texts:
        if not text or len(text.strip()) == 0:
            continue
        
        start_time = time.time()
        result = await call_text_api(text)
        processing_time = time.time() - start_time
        
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
