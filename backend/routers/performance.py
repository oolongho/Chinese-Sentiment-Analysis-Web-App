# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
性能统计路由
功能：
1. 记录分析统计数据（区分不同分析类型）
2. 存储 CPU/GPU 峰值数据
3. 提供性能指标统计
"""

import os
import json
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Optional

from ..config import DATA_DIR
from ..services.system_monitor import system_monitor

router = APIRouter(prefix='/api/performance', tags=['性能统计'])

STATS_FILE = os.path.join(DATA_DIR, 'stats.json')


class TextAnalysisStats(BaseModel):
    count: int = 0
    total_time: float = 0.0
    avg_time: float = 0.0
    cpu_peak: float = 0.0
    cpu_avg: float = 0.0
    gpu_peak: Optional[float] = None
    gpu_avg: Optional[float] = None


class SentimentCounts(BaseModel):
    positive: int = 0
    negative: int = 0
    neutral: int = 0


class ModelMetrics(BaseModel):
    accuracy: float = 0.0
    precision: float = 0.0
    recall: float = 0.0
    f1_score: float = 0.0


class Statistics(BaseModel):
    total_analyses: int = 0
    text_analyses: Dict[str, TextAnalysisStats] = {}
    sentiment_counts: SentimentCounts = SentimentCounts()
    model_metrics: Dict[str, ModelMetrics] = {}


class CpuGpuDataPoint(BaseModel):
    timestamp: float
    cpu_percent: float
    gpu_percent: Optional[float] = None


def load_stats() -> Dict:
    if os.path.exists(STATS_FILE):
        try:
            with open(STATS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if 'text_analyses' not in data:
                data['text_analyses'] = {
                    'model': _default_analyzer_stats(),
                    'lexicon': _default_analyzer_stats(),
                    'external': _default_analyzer_stats()
                }
            if 'sentiment_counts' not in data:
                old_positive = data.pop('positive_count', 0)
                old_negative = data.pop('negative_count', 0)
                old_neutral = data.pop('neutral_count', 0)
                data['sentiment_counts'] = {
                    'positive': old_positive,
                    'negative': old_negative,
                    'neutral': old_neutral
                }
            if 'model_metrics' not in data:
                data['model_metrics'] = {
                    'model': _default_metrics(),
                    'lexicon': _default_metrics(),
                    'external': _default_metrics()
                }
            for analyzer in ['model', 'lexicon', 'external']:
                if analyzer in data['text_analyses']:
                    stats = data['text_analyses'][analyzer]
                    if 'cpu_peak' not in stats:
                        stats['cpu_peak'] = 0.0
                    if 'cpu_avg' not in stats:
                        stats['cpu_avg'] = 0.0
                    if 'gpu_peak' not in stats:
                        stats['gpu_peak'] = None
                    if 'gpu_avg' not in stats:
                        stats['gpu_avg'] = None
            return data
        except Exception:
            pass
    
    return _default_stats()


def _default_analyzer_stats() -> Dict:
    return {
        'count': 0,
        'total_time': 0.0,
        'avg_time': 0.0,
        'cpu_peak': 0.0,
        'cpu_avg': 0.0,
        'gpu_peak': None,
        'gpu_avg': None
    }


def _default_metrics() -> Dict:
    return {
        'accuracy': 0.0,
        'precision': 0.0,
        'recall': 0.0,
        'f1_score': 0.0
    }


def _default_stats() -> Dict:
    return {
        'total_analyses': 0,
        'text_analyses': {
            'model': _default_analyzer_stats(),
            'lexicon': _default_analyzer_stats(),
            'external': _default_analyzer_stats()
        },
        'sentiment_counts': {
            'positive': 0,
            'negative': 0,
            'neutral': 0
        },
        'model_metrics': {
            'model': _default_metrics(),
            'lexicon': _default_metrics(),
            'external': _default_metrics()
        }
    }


def save_stats(stats: Dict):
    os.makedirs(os.path.dirname(STATS_FILE), exist_ok=True)
    with open(STATS_FILE, 'w', encoding='utf-8') as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)


def record_analysis(
    analysis_type: str,
    sentiment: str,
    processing_time: float,
    analyzer_type: str = 'model',
    cpu_peak: float = 0.0,
    cpu_avg: float = 0.0,
    gpu_peak: Optional[float] = None,
    gpu_avg: Optional[float] = None
):
    stats = load_stats()
    
    stats['total_analyses'] += 1
    
    if analyzer_type in stats['text_analyses']:
        analyzer_stats = stats['text_analyses'][analyzer_type]
        analyzer_stats['count'] += 1
        analyzer_stats['total_time'] += processing_time
        analyzer_stats['avg_time'] = analyzer_stats['total_time'] / analyzer_stats['count']
        
        if cpu_peak > analyzer_stats.get('cpu_peak', 0):
            analyzer_stats['cpu_peak'] = cpu_peak
        if cpu_avg > 0:
            old_avg = analyzer_stats.get('cpu_avg', 0)
            count = analyzer_stats['count']
            analyzer_stats['cpu_avg'] = (old_avg * (count - 1) + cpu_avg) / count
        
        if gpu_peak is not None:
            current_gpu_peak = analyzer_stats.get('gpu_peak')
            if current_gpu_peak is None or gpu_peak > current_gpu_peak:
                analyzer_stats['gpu_peak'] = gpu_peak
        if gpu_avg is not None:
            old_gpu_avg = analyzer_stats.get('gpu_avg')
            count = analyzer_stats['count']
            if old_gpu_avg is None:
                analyzer_stats['gpu_avg'] = gpu_avg
            else:
                analyzer_stats['gpu_avg'] = (old_gpu_avg * (count - 1) + gpu_avg) / count
    
    sentiment_key = 'positive' if sentiment == '正面' else ('negative' if sentiment == '负面' else 'neutral')
    stats['sentiment_counts'][sentiment_key] = stats['sentiment_counts'].get(sentiment_key, 0) + 1
    
    save_stats(stats)
    
    system_monitor.record_snapshot()
    
    return True


def update_model_metrics(analyzer_type: str, metrics: Dict):
    stats = load_stats()
    
    if analyzer_type not in stats['model_metrics']:
        stats['model_metrics'][analyzer_type] = _default_metrics()
    
    stats['model_metrics'][analyzer_type].update(metrics)
    save_stats(stats)


@router.get('/stats')
async def get_statistics():
    stats = load_stats()
    current_usage = system_monitor.get_current_usage()
    
    return {
        'total_analyses': stats.get('total_analyses', 0),
        'text_analyses': stats.get('text_analyses', {}),
        'sentiment_counts': stats.get('sentiment_counts', {}),
        'model_metrics': stats.get('model_metrics', {}),
        'current_usage': current_usage
    }


@router.get('/cpu-gpu-history')
async def get_cpu_gpu_history(limit: int = 50):
    history = system_monitor.get_history(limit)
    return history


@router.get('/current-usage')
async def get_current_usage():
    return system_monitor.get_current_usage()


@router.get('/metrics')
async def get_model_metrics():
    stats = load_stats()
    return stats.get('model_metrics', {})


@router.post('/record')
async def record_analysis_endpoint(
    analysis_type: str,
    sentiment: str,
    processing_time: float,
    analyzer_type: str = 'model',
    cpu_peak: float = 0.0,
    cpu_avg: float = 0.0,
    gpu_peak: Optional[float] = None,
    gpu_avg: Optional[float] = None
):
    success = record_analysis(
        analysis_type, sentiment, processing_time, analyzer_type,
        cpu_peak, cpu_avg, gpu_peak, gpu_avg
    )
    return {'success': success}


@router.post('/metrics/update')
async def update_metrics_endpoint(analyzer_type: str, metrics: Dict):
    update_model_metrics(analyzer_type, metrics)
    return {'success': True}


@router.post('/reset')
async def reset_statistics():
    default_stats = _default_stats()
    save_stats(default_stats)
    system_monitor.clear_history()
    return {'success': True, 'message': '统计数据已重置'}
