# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
路由
"""

from routers.text_analysis import router as text_analysis_router
from routers.audio_analysis import router as audio_analysis_router
from routers.performance import router as performance_router
from routers.training import router as training_router
from routers.evaluation import router as evaluation_router
from routers.quantization import router as quantization_router
from routers.hybrid_experiment import router as hybrid_experiment_router
from routers.dictionary_review import router as dictionary_review_router

__all__ = [
    'text_analysis_router',
    'audio_analysis_router',
    'performance_router',
    'training_router',
    'evaluation_router',
    'quantization_router',
    'hybrid_experiment_router',
    'dictionary_review_router'
]
