# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
缓存服务
"""

import os
import json
import logging
from datetime import datetime
from typing import Dict, Optional, Any, List, Literal
from dataclasses import dataclass, asdict
import threading

from config import DATA_DIR

logger = logging.getLogger('cache_service')

CACHE_DIR = os.path.join(DATA_DIR, 'cache')
TRAINING_CACHE_FILE = os.path.join(CACHE_DIR, 'training_cache.json')
EVALUATION_CACHE_FILE = os.path.join(CACHE_DIR, 'evaluation_cache.json')
TEXT_ANALYSIS_CACHE_FILE = os.path.join(CACHE_DIR, 'text_analysis_cache.json')
AUDIO_ANALYSIS_CACHE_FILE = os.path.join(CACHE_DIR, 'audio_analysis_cache.json')

_cache_lock = threading.Lock()


def _ensure_cache_dir():
    os.makedirs(CACHE_DIR, exist_ok=True)


def _load_cache(filepath: str) -> Dict:
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            logger.warning(f"加载缓存失败 {filepath}: {e}")
    return {}


def _save_cache(filepath: str, data: Dict):
    _ensure_cache_dir()
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2, default=str)
    except IOError as e:
        logger.error(f"保存缓存失败 {filepath}: {e}")


def save_training_cache(
    status: str,
    metrics: Optional[Dict] = None,
    history: Optional[Dict] = None,
    gpu_memory_peak_mb: Optional[float] = None,
    params: Optional[Dict] = None,
    error: Optional[str] = None
):
    with _cache_lock:
        cache_data = {
            "last_training": {
                "status": status,
                "completed_at": datetime.now().isoformat(),
                "metrics": metrics or {},
                "history": history or {},
                "gpu_memory_peak_mb": gpu_memory_peak_mb,
                "params": params or {},
                "error": error
            }
        }
        _save_cache(TRAINING_CACHE_FILE, cache_data)
        logger.info(f"训练缓存已保存: status={status}")


def load_training_cache() -> Optional[Dict]:
    with _cache_lock:
        cache = _load_cache(TRAINING_CACHE_FILE)
        return cache.get('last_training')


def clear_training_cache():
    with _cache_lock:
        if os.path.exists(TRAINING_CACHE_FILE):
            os.remove(TRAINING_CACHE_FILE)
            logger.info("训练缓存已清除")


def save_evaluation_cache(
    results: Dict,
    error_samples: Optional[Dict] = None,
    gpu_memory_peak_mb: Optional[float] = None,
    data_info: Optional[Dict] = None,
    all_predictions: Optional[List] = None,
    response_times: Optional[Dict] = None,
    precision_mode: Optional[Literal["FP32", "INT8"]] = None,
    hybrid_stats: Optional[Dict] = None,
    hybrid_config: Optional[Dict] = None
):
    """保存评估结果到缓存
    
    Args:
        results: 评估结果字典
        error_samples: 错误样本字典
        gpu_memory_peak_mb: GPU 显存峰值（MB）
        data_info: 数据信息字典
        all_predictions: 所有预测结果列表
        response_times: 响应时间字典
        precision_mode: 模型精度模式，"FP32" 或 "INT8"，默认 None（向后兼容）
        hybrid_stats: 混合模型统计信息，默认 None
        hybrid_config: 混合模型配置参数，默认 None
    """
    with _cache_lock:
        cache_data = {
            "last_evaluation": {
                "completed_at": datetime.now().isoformat(),
                "results": results,
                "error_samples": error_samples or {},
                "gpu_memory_peak_mb": gpu_memory_peak_mb,
                "data_info": data_info or {},
                "all_predictions": all_predictions or [],
                "response_times": response_times or {},
                "precision_mode": precision_mode,
                "hybrid_stats": hybrid_stats or {},
                "hybrid_config": hybrid_config or {}
            }
        }
        _save_cache(EVALUATION_CACHE_FILE, cache_data)
        logger.info(f"评估缓存已保存 (precision_mode={precision_mode}, hybrid_stats={hybrid_stats})")


def load_evaluation_cache() -> Optional[Dict]:
    """加载评估结果缓存
    
    Returns:
        评估结果字典，包含 precision_mode 字段（如果缓存中有）
        向后兼容：旧的缓存没有 precision_mode 字段也会正常返回
    """
    with _cache_lock:
        cache = _load_cache(EVALUATION_CACHE_FILE)
        result = cache.get('last_evaluation')
        # 向后兼容：如果缓存中没有 precision_mode 字段，默认为 None
        if result is not None and 'precision_mode' not in result:
            result['precision_mode'] = None
        return result


def clear_evaluation_cache():
    with _cache_lock:
        if os.path.exists(EVALUATION_CACHE_FILE):
            os.remove(EVALUATION_CACHE_FILE)
            logger.info("评估缓存已清除")


def save_text_analysis_cache(
    input_text: str,
    results: list,
    gpu_memory_peak_mb: Optional[float] = None
):
    with _cache_lock:
        cache_data = {
            "last_analysis": {
                "completed_at": datetime.now().isoformat(),
                "input_text": input_text,
                "results": results,
                "total_count": len(results),
                "gpu_memory_peak_mb": gpu_memory_peak_mb
            }
        }
        _save_cache(TEXT_ANALYSIS_CACHE_FILE, cache_data)
        logger.info(f"文本分析缓存已保存: {len(results)} 条结果")


def load_text_analysis_cache() -> Optional[Dict]:
    with _cache_lock:
        cache = _load_cache(TEXT_ANALYSIS_CACHE_FILE)
        return cache.get('last_analysis')


def clear_text_analysis_cache():
    with _cache_lock:
        if os.path.exists(TEXT_ANALYSIS_CACHE_FILE):
            os.remove(TEXT_ANALYSIS_CACHE_FILE)
            logger.info("文本分析缓存已清除")


def save_audio_analysis_cache(
    transcription: str,
    sentences: list,
    overall_sentiment: Dict,
    audio_duration: float,
    gpu_memory_peak_mb: Optional[float] = None
):
    with _cache_lock:
        cache_data = {
            "last_analysis": {
                "completed_at": datetime.now().isoformat(),
                "transcription": transcription,
                "sentences": sentences,
                "overall_sentiment": overall_sentiment,
                "audio_duration": audio_duration,
                "sentence_count": len(sentences),
                "gpu_memory_peak_mb": gpu_memory_peak_mb
            }
        }
        _save_cache(AUDIO_ANALYSIS_CACHE_FILE, cache_data)
        logger.info(f"音频分析缓存已保存: {len(sentences)} 句")


def load_audio_analysis_cache() -> Optional[Dict]:
    with _cache_lock:
        cache = _load_cache(AUDIO_ANALYSIS_CACHE_FILE)
        return cache.get('last_analysis')


def clear_audio_analysis_cache():
    with _cache_lock:
        if os.path.exists(AUDIO_ANALYSIS_CACHE_FILE):
            os.remove(AUDIO_ANALYSIS_CACHE_FILE)
            logger.info("音频分析缓存已清除")


def get_all_cache_status() -> Dict:
    return {
        "training_cache_exists": os.path.exists(TRAINING_CACHE_FILE),
        "evaluation_cache_exists": os.path.exists(EVALUATION_CACHE_FILE),
        "text_analysis_cache_exists": os.path.exists(TEXT_ANALYSIS_CACHE_FILE),
        "audio_analysis_cache_exists": os.path.exists(AUDIO_ANALYSIS_CACHE_FILE),
        "training_cache": load_training_cache(),
        "evaluation_cache": load_evaluation_cache(),
        "text_analysis_cache": load_text_analysis_cache(),
        "audio_analysis_cache": load_audio_analysis_cache()
    }


def clear_all_cache():
    clear_training_cache()
    clear_evaluation_cache()
    clear_text_analysis_cache()
    clear_audio_analysis_cache()
    logger.info("所有缓存已清除")
