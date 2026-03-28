# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
音频分析路由
支持 FunASR 本地语音识别和外部 API
"""

import os
import time
import uuid
import logging
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional, Dict, List

from sentiment import get_lexicon_analyzer, get_model_analyzer
from config import DATA_DIR
from services import call_audio_api, call_text_api
from services.speech_service import speech_service, FUNASR_AVAILABLE
from services.system_monitor import system_monitor
from routers.logger import get_logger

logger = get_logger('audio_analysis')

router = APIRouter(prefix='/api/audio', tags=['音频分析'])


def reload_lexicon():
    """重新加载词典分析器的词典"""
    from sentiment import reload_lexicon_analyzer
    return reload_lexicon_analyzer()


UPLOAD_DIR = os.path.join(DATA_DIR, 'audio')
os.makedirs(UPLOAD_DIR, exist_ok=True)

MAX_AUDIO_DURATION = 300
SUPPORTED_FORMATS = ['.wav', '.mp3', '.m4a', '.flac', '.ogg']


class SentenceResult(BaseModel):
    text: str
    lexicon_result: Dict
    model_result: Dict


class AudioAnalysisResponse(BaseModel):
    transcription: str
    sentences: List[SentenceResult]
    overall_sentiment: Dict
    confidence: float
    processing_time: float
    audio_duration: float
    gpu_memory: Dict


class ExternalAudioAnalysisResponse(BaseModel):
    success: bool
    transcription: Optional[str] = None
    sentiment: Optional[str] = None
    confidence: Optional[float] = None
    reasoning: Optional[str] = None
    model: Optional[str] = None
    processing_time: float
    error: Optional[str] = None


class ModelStatusResponse(BaseModel):
    available: bool
    loaded: bool
    loading: bool
    load_progress: float
    gpu_memory_mb: float
    idle_seconds: float
    model_name: str
    load_error: Optional[str] = None


def get_audio_duration(filepath: str) -> float:
    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_file(filepath)
        return len(audio) / 1000.0
    except Exception as e:
        logger.warning(f"无法获取音频时长: {e}")
        return 0.0


def calculate_weighted_sentiment(sentences: List[Dict]) -> Dict:
    if not sentences:
        return {'sentiment': '中性', 'confidence': 0.0, 'positive_ratio': 0.0, 'negative_ratio': 0.0, 'neutral_ratio': 1.0}
    
    sentiment_scores = {'正面': 0.0, '负面': 0.0, '中性': 0.0}
    total_weight = 0.0
    
    for sentence in sentences:
        text = sentence.get('text', '')
        weight = len(text)
        
        lexicon_sentiment = sentence.get('lexicon_result', {}).get('sentiment', '中性')
        model_sentiment = sentence.get('model_result', {}).get('sentiment', '中性')
        
        model_confidence = sentence.get('model_result', {}).get('confidence', 0.5)
        
        if model_sentiment == '正面':
            sentiment_scores['正面'] += weight * model_confidence
        elif model_sentiment == '负面':
            sentiment_scores['负面'] += weight * model_confidence
        else:
            sentiment_scores['中性'] += weight * model_confidence
        
        total_weight += weight
    
    if total_weight == 0:
        return {'sentiment': '中性', 'confidence': 0.0, 'positive_ratio': 0.0, 'negative_ratio': 0.0, 'neutral_ratio': 1.0}
    
    positive_ratio = sentiment_scores['正面'] / total_weight
    negative_ratio = sentiment_scores['负面'] / total_weight
    neutral_ratio = sentiment_scores['中性'] / total_weight
    
    max_ratio = max(positive_ratio, negative_ratio, neutral_ratio)
    if max_ratio == positive_ratio:
        overall = '正面'
    elif max_ratio == negative_ratio:
        overall = '负面'
    else:
        overall = '中性'
    
    confidence = max_ratio
    
    return {
        'sentiment': overall,
        'confidence': round(confidence, 4),
        'positive_ratio': round(positive_ratio, 4),
        'negative_ratio': round(negative_ratio, 4),
        'neutral_ratio': round(neutral_ratio, 4)
    }


@router.get('/model-status', response_model=ModelStatusResponse)
async def get_model_status():
    status = speech_service.get_status()
    return ModelStatusResponse(
        available=FUNASR_AVAILABLE,
        loaded=status.loaded,
        loading=status.loading,
        load_progress=speech_service.get_load_progress(),
        gpu_memory_mb=status.gpu_memory_mb,
        idle_seconds=status.idle_seconds,
        model_name=status.model_name,
        load_error=status.load_error
    )


@router.post('/load-model')
async def load_speech_model():
    if not FUNASR_AVAILABLE:
        raise HTTPException(status_code=400, detail='FunASR 库未安装，请运行: pip install funasr modelscope')
    
    status = speech_service.get_status()
    if status.loaded:
        return {'success': True, 'message': '模型已加载'}
    
    if status.loading:
        return {'success': True, 'message': '模型正在加载中...'}
    
    import threading
    def load_in_background():
        try:
            speech_service.load_model()
        except Exception as e:
            logger.error(f"后台加载模型失败: {e}")
    
    thread = threading.Thread(target=load_in_background, daemon=True)
    thread.start()
    
    return {'success': True, 'message': '开始加载模型...'}


@router.post('/unload-model')
async def unload_speech_model():
    speech_service.unload_model()
    return {'success': True, 'message': '模型已卸载'}


@router.post('/upload')
async def upload_audio(file: UploadFile = File(...)):
    if not file.filename:
        logger.warning("音频上传请求: 文件名为空")
        raise HTTPException(status_code=400, detail='文件名不能为空')
    
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in SUPPORTED_FORMATS:
        logger.warning(f"音频上传请求: 不支持的格式 {ext}")
        raise HTTPException(status_code=400, detail=f'不支持的音频格式，支持: {", ".join(SUPPORTED_FORMATS)}')
    
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    
    content = await file.read()
    with open(filepath, 'wb') as f:
        f.write(content)
    
    duration = get_audio_duration(filepath)
    
    logger.info(f"音频上传成功: {filename}, 大小: {len(content)} bytes, 时长: {duration:.1f}s")
    
    return {
        'success': True,
        'filename': filename,
        'size': len(content),
        'duration': round(duration, 1)
    }


@router.post('/analyze', response_model=AudioAnalysisResponse)
async def analyze_audio(file: UploadFile = File(...)):
    start_time = time.time()
    gpu_memory_peak = 0.0
    
    if not file.filename:
        logger.warning("音频分析请求: 文件名为空")
        raise HTTPException(status_code=400, detail='文件名不能为空')
    
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in SUPPORTED_FORMATS:
        logger.warning(f"音频分析请求: 不支持的格式 {ext}")
        raise HTTPException(status_code=400, detail=f'不支持的音频格式，支持: {", ".join(SUPPORTED_FORMATS)}')
    
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    
    content = await file.read()
    with open(filepath, 'wb') as f:
        f.write(content)
    
    audio_duration = get_audio_duration(filepath)
    
    if audio_duration > MAX_AUDIO_DURATION:
        logger.warning(f"音频时长超过限制: {audio_duration:.1f}s > {MAX_AUDIO_DURATION}s")
        raise HTTPException(
            status_code=400, 
            detail=f'音频时长 {audio_duration:.1f} 秒超过限制（最大 {MAX_AUDIO_DURATION} 秒），请裁剪后重试'
        )
    
    logger.info(f"开始音频分析: {filename}, 时长: {audio_duration:.1f}s")
    
    if not FUNASR_AVAILABLE:
        raise HTTPException(status_code=400, detail='FunASR 库未安装，请运行: pip install funasr modelscope')
    
    try:
        transcription_result = speech_service.transcribe(filepath)
        transcription = transcription_result.text
        confidence = transcription_result.confidence
        
        gpu_info = system_monitor.get_gpu_memory_info()
        if gpu_info.allocated_mb > gpu_memory_peak:
            gpu_memory_peak = gpu_info.allocated_mb
        
    except Exception as e:
        logger.error(f"语音识别失败: {e}")
        raise HTTPException(status_code=500, detail=f'语音识别失败: {str(e)}')
    
    sentences = speech_service.split_into_sentences(transcription)
    
    if not sentences:
        sentences = [transcription] if transcription else []
    
    lexicon_analyzer = get_lexicon_analyzer()
    model_analyzer = get_model_analyzer()
    
    sentence_results = []
    for sentence_text in sentences:
        if not sentence_text.strip():
            continue
        
        lexicon_result = lexicon_analyzer.analyze(sentence_text)
        model_result = model_analyzer.predict(sentence_text)
        
        sentence_results.append({
            'text': sentence_text,
            'lexicon_result': {
                'sentiment': lexicon_result['sentiment'],
                'score': lexicon_result['score'],
                'confidence': lexicon_result['confidence'],
                'sentiment_words': lexicon_result.get('sentiment_words', [])
            },
            'model_result': {
                'sentiment': model_result['sentiment'],
                'confidence': model_result['confidence'],
                'scores': model_result['scores']
            }
        })
        
        gpu_info = system_monitor.get_gpu_memory_info()
        if gpu_info.allocated_mb > gpu_memory_peak:
            gpu_memory_peak = gpu_info.allocated_mb
    
    overall_sentiment = calculate_weighted_sentiment(sentence_results)
    
    processing_time = time.time() - start_time
    
    logger.info(f"音频分析完成: {len(sentence_results)} 句, 整体情感: {overall_sentiment['sentiment']}")
    
    try:
        if os.path.exists(filepath):
            os.remove(filepath)
            logger.debug(f"已清理临时文件: {filename}")
    except Exception as e:
        logger.warning(f"清理临时文件失败: {e}")
    
    from services.cache_service import save_audio_analysis_cache
    save_audio_analysis_cache(
        transcription=transcription,
        sentences=sentence_results,
        overall_sentiment=overall_sentiment,
        audio_duration=audio_duration,
        gpu_memory_peak_mb=gpu_memory_peak
    )
    
    return AudioAnalysisResponse(
        transcription=transcription,
        sentences=[SentenceResult(**s) for s in sentence_results],
        overall_sentiment=overall_sentiment,
        confidence=confidence,
        processing_time=round(processing_time, 4),
        audio_duration=round(audio_duration, 1),
        gpu_memory={
            'current_mb': round(gpu_info.allocated_mb, 1),
            'peak_mb': round(gpu_memory_peak, 1)
        }
    )


@router.post('/analyze/external', response_model=ExternalAudioAnalysisResponse)
async def analyze_audio_external(file: UploadFile = File(...)):
    start_time = time.time()
    
    if not file.filename:
        logger.warning("外部API音频分析请求: 文件名为空")
        raise HTTPException(status_code=400, detail='文件名不能为空')
    
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in SUPPORTED_FORMATS:
        logger.warning(f"外部API音频分析请求: 不支持的格式 {ext}")
        raise HTTPException(status_code=400, detail=f'不支持的音频格式，支持: {", ".join(SUPPORTED_FORMATS)}')
    
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    
    content = await file.read()
    with open(filepath, 'wb') as f:
        f.write(content)
    
    logger.info(f"开始外部API音频分析: {filename}")
    
    audio_result = await call_audio_api(filepath)
    
    if not audio_result.get('success'):
        processing_time = time.time() - start_time
        logger.warning(f"外部API音频分析失败: {audio_result.get('error')}")
        return ExternalAudioAnalysisResponse(
            success=False,
            processing_time=round(processing_time, 4),
            error=audio_result.get('error', '语音识别失败')
        )
    
    transcription = audio_result.get('transcription', '')
    audio_model = audio_result.get('model', '')
    
    text_result = await call_text_api(transcription)
    
    processing_time = time.time() - start_time
    
    if not text_result.get('success'):
        logger.warning(f"外部API文本分析失败: {text_result.get('error')}")
        return ExternalAudioAnalysisResponse(
            success=False,
            transcription=transcription,
            processing_time=round(processing_time, 4),
            error=text_result.get('error', '情感分析失败')
        )
    
    logger.info(f"外部API音频分析完成: {text_result.get('sentiment')}")
    
    return ExternalAudioAnalysisResponse(
        success=True,
        transcription=transcription,
        sentiment=text_result.get('sentiment'),
        confidence=text_result.get('confidence'),
        reasoning=text_result.get('reasoning'),
        model=f"{audio_model} + {text_result.get('model', '')}",
        processing_time=round(processing_time, 4)
    )


@router.get('/cached-result')
async def get_cached_analysis_result():
    from services.cache_service import load_audio_analysis_cache
    cached = load_audio_analysis_cache()
    return {
        'success': cached is not None,
        'cached_result': cached
    }


@router.post('/clear-cache')
async def clear_analysis_cache():
    from services.cache_service import clear_audio_analysis_cache
    clear_audio_analysis_cache()
    return {'success': True, 'message': '音频分析缓存已清除'}
