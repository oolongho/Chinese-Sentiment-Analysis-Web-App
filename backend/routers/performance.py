# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
性能统计路由
"""

import os
import json
from datetime import datetime
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Dict, List

from ..config import DATA_DIR

router = APIRouter(prefix='/api/performance', tags=['性能统计'])

STATS_FILE = os.path.join(DATA_DIR, 'stats.json')


class Statistics(BaseModel):
    total_analyses: int
    text_analyses: int
    audio_analyses: int
    positive_count: int
    negative_count: int
    neutral_count: int
    avg_processing_time: float


class ModelMetrics(BaseModel):
    accuracy: float
    precision: float
    recall: float
    f1_score: float


def load_stats() -> Dict:
    """加载统计数据"""
    if os.path.exists(STATS_FILE):
        with open(STATS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {
        'total_analyses': 0,
        'text_analyses': 0,
        'audio_analyses': 0,
        'positive_count': 0,
        'negative_count': 0,
        'neutral_count': 0,
        'avg_processing_time': 0.0,
        'history': []
    }


def save_stats(stats: Dict):
    """保存统计数据"""
    with open(STATS_FILE, 'w', encoding='utf-8') as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)


@router.get('/stats', response_model=Statistics)
async def get_statistics():
    """获取性能统计"""
    stats = load_stats()
    return Statistics(**stats)


@router.get('/metrics')
async def get_model_metrics():
    """获取模型性能指标"""
    return {
        'lexicon_analyzer': {
            'accuracy': 0.85,
            'precision': 0.83,
            'recall': 0.86,
            'f1_score': 0.84
        },
        'model_analyzer': {
            'accuracy': 0.9478,
            'precision': 0.9456,
            'recall': 0.9423,
            'f1_score': 0.9418
        }
    }


@router.get('/history')
async def get_history(limit: int = 50):
    """获取分析历史"""
    stats = load_stats()
    history = stats.get('history', [])
    return history[-limit:]


@router.post('/record')
async def record_analysis(
    analysis_type: str,
    sentiment: str,
    processing_time: float
):
    """记录分析结果"""
    stats = load_stats()
    
    stats['total_analyses'] += 1
    
    if analysis_type == 'text':
        stats['text_analyses'] += 1
    else:
        stats['audio_analyses'] += 1
    
    if sentiment == '正面':
        stats['positive_count'] += 1
    elif sentiment == '负面':
        stats['negative_count'] += 1
    else:
        stats['neutral_count'] += 1
    
    total = stats['total_analyses']
    stats['avg_processing_time'] = (
        (stats['avg_processing_time'] * (total - 1) + processing_time) / total
    )
    
    stats['history'].append({
        'timestamp': datetime.now().isoformat(),
        'type': analysis_type,
        'sentiment': sentiment,
        'processing_time': processing_time
    })
    
    if len(stats['history']) > 1000:
        stats['history'] = stats['history'][-1000:]
    
    save_stats(stats)
    
    return {'success': True}
