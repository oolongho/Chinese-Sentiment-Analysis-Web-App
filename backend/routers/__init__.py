# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
路由模块
"""

from .text_analysis import router as text_analysis_router
from .audio_analysis import router as audio_analysis_router
from .performance import router as performance_router
from .training import router as training_router

__all__ = [
    'text_analysis_router',
    'audio_analysis_router',
    'performance_router',
    'training_router'
]
