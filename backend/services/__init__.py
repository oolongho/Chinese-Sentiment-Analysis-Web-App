#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
服务模块
"""

from services.external_api import call_text_api, call_audio_api
from services.quantization_service import (
    quantization_service,
    QuantizationService,
    QuantizationMode,
    QuantizationStatus,
    QuantizationResult,
    GpuMemoryInfo
)
from services.unified_model_manager import (
    unified_model_manager,
    UnifiedModelManager,
    PrecisionMode
)

__all__ = [
    'call_text_api',
    'call_audio_api',
    'quantization_service',
    'QuantizationService',
    'QuantizationMode',
    'QuantizationStatus',
    'QuantizationResult',
    'GpuMemoryInfo',
    'unified_model_manager',
    'UnifiedModelManager',
    'PrecisionMode'
]
