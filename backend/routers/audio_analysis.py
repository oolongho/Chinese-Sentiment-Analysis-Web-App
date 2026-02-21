# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
音频分析路由
"""

import os
import time
import uuid
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional, Dict

from ..sentiment import LexiconAnalyzer, ModelAnalyzer
from ..config import DATA_DIR
from ..services import call_audio_api, call_text_api

router = APIRouter(prefix='/api/audio', tags=['音频分析'])

lexicon_analyzer = LexiconAnalyzer()
model_analyzer = ModelAnalyzer()

UPLOAD_DIR = os.path.join(DATA_DIR, 'audio')
os.makedirs(UPLOAD_DIR, exist_ok=True)


def reload_lexicon():
    """重新加载词典分析器的词典"""
    lexicon_analyzer.reload()
    return True


class AudioAnalysisResponse(BaseModel):
    transcription: str
    lexicon_result: Dict
    model_result: Dict
    processing_time: float


class ExternalAudioAnalysisResponse(BaseModel):
    success: bool
    transcription: Optional[str] = None
    sentiment: Optional[str] = None
    confidence: Optional[float] = None
    reasoning: Optional[str] = None
    model: Optional[str] = None
    processing_time: float
    error: Optional[str] = None


@router.post('/upload')
async def upload_audio(file: UploadFile = File(...)):
    """上传音频文件"""
    if not file.filename:
        raise HTTPException(status_code=400, detail='文件名不能为空')
    
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ['.wav', '.mp3', '.m4a', '.flac', '.ogg']:
        raise HTTPException(status_code=400, detail='不支持的音频格式')
    
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    
    content = await file.read()
    with open(filepath, 'wb') as f:
        f.write(content)
    
    return {
        'success': True,
        'filename': filename,
        'size': len(content)
    }


@router.post('/analyze', response_model=AudioAnalysisResponse)
async def analyze_audio(file: UploadFile = File(...)):
    """
    分析音频情感（本地）
    
    流程：音频转文字 -> 文字情感分析
    """
    start_time = time.time()
    
    if not file.filename:
        raise HTTPException(status_code=400, detail='文件名不能为空')
    
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ['.wav', '.mp3', '.m4a', '.flac', '.ogg']:
        raise HTTPException(status_code=400, detail='不支持的音频格式')
    
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    
    content = await file.read()
    with open(filepath, 'wb') as f:
        f.write(content)
    
    transcription = transcribe_audio(filepath)
    
    lexicon_start = time.time()
    lexicon_result = lexicon_analyzer.analyze(transcription)
    lexicon_time = time.time() - lexicon_start
    
    model_start = time.time()
    model_result = model_analyzer.predict(transcription)
    model_time = time.time() - model_start
    
    processing_time = time.time() - start_time
    
    return AudioAnalysisResponse(
        transcription=transcription,
        lexicon_result={
            'sentiment': lexicon_result['sentiment'],
            'score': lexicon_result['score'],
            'confidence': lexicon_result['confidence'],
            'sentiment_words': lexicon_result.get('sentiment_words', []),
            'processing_time': round(lexicon_time, 4)
        },
        model_result={
            'sentiment': model_result['sentiment'],
            'confidence': model_result['confidence'],
            'scores': model_result['scores'],
            'processing_time': round(model_time, 4)
        },
        processing_time=round(processing_time, 4)
    )


@router.post('/analyze/external', response_model=ExternalAudioAnalysisResponse)
async def analyze_audio_external(file: UploadFile = File(...)):
    """
    使用外部API分析音频情感
    
    需要在管理平台配置外部API
    流程：外部API语音转文字 -> 外部API情感分析
    """
    start_time = time.time()
    
    if not file.filename:
        raise HTTPException(status_code=400, detail='文件名不能为空')
    
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ['.wav', '.mp3', '.m4a', '.flac', '.ogg']:
        raise HTTPException(status_code=400, detail='不支持的音频格式')
    
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    
    content = await file.read()
    with open(filepath, 'wb') as f:
        f.write(content)
    
    audio_result = await call_audio_api(filepath)
    
    if not audio_result.get('success'):
        processing_time = time.time() - start_time
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
        return ExternalAudioAnalysisResponse(
            success=False,
            transcription=transcription,
            processing_time=round(processing_time, 4),
            error=text_result.get('error', '情感分析失败')
        )
    
    return ExternalAudioAnalysisResponse(
        success=True,
        transcription=transcription,
        sentiment=text_result.get('sentiment'),
        confidence=text_result.get('confidence'),
        reasoning=text_result.get('reasoning'),
        model=f"{audio_model} + {text_result.get('model', '')}",
        processing_time=round(processing_time, 4)
    )


def transcribe_audio(filepath: str) -> str:
    """
    音频转文字（本地模拟）
    
    TODO: 集成FunASR或阿里云语音识别API
    目前返回模拟结果
    """
    return "这是音频转文字的模拟结果，我还没部署好语音模型，显存不够了QAQ"
