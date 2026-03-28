# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
FunASR 语音识别服务
功能：
1. 按需加载 Paraformer-medium 模型
2. 支持标点恢复
3. 闲置自动卸载（10分钟）
4. GPU 显存监控
"""

import os
import logging
import threading
import time
from datetime import datetime
from typing import Dict, Optional, List, Tuple
from dataclasses import dataclass
import tempfile

logger = logging.getLogger('speech_service')

FUNASR_AVAILABLE = False
FunASRAutoModel = None
try:
    from funasr import AutoModel as FunASRAutoModel
    FUNASR_AVAILABLE = True
    logger.info("FunASR 库已加载")
except ImportError:
    logger.warning("FunASR 库未安装，语音识别功能不可用。请运行: pip install funasr modelscope")


@dataclass
class TranscriptionResult:
    text: str
    confidence: float
    segments: List[Dict]
    processing_time: float


@dataclass
class ModelStatus:
    loaded: bool
    loading: bool
    gpu_memory_mb: float
    idle_seconds: float
    model_name: str


class FunASRService:
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self._initialized = True
        self._model = None
        self._punc_model = None
        self._loading = False
        self._load_progress = 0.0
        self._last_used_time = None
        self._gpu_memory_mb = 0.0
        self._model_lock = threading.Lock()
        self._state_lock = threading.Lock()
        self._unload_thread = None
        self._stop_unload_checker = False
        self._model_in_use = False
        
        self._model_name = "paraformer-zh"
        self._punc_model_name = "ct-punc-c"
        self._idle_timeout = 600
        
        self._start_idle_checker()
    
    def _start_idle_checker(self):
        def check_idle():
            while not self._stop_unload_checker:
                time.sleep(60)
                with self._model_lock:
                    if self._model is not None and self._last_used_time is not None:
                        idle_seconds = (datetime.now() - self._last_used_time).total_seconds()
                        if idle_seconds > self._idle_timeout:
                            logger.info(f"模型闲置超过 {self._idle_timeout} 秒，自动卸载")
                            self._unload_model_internal()
        
        self._unload_thread = threading.Thread(target=check_idle, daemon=True)
        self._unload_thread.start()
    
    def is_available(self) -> bool:
        return FUNASR_AVAILABLE
    
    def get_status(self) -> ModelStatus:
        with self._model_lock:
            idle_seconds = 0.0
            if self._model is not None and self._last_used_time is not None:
                idle_seconds = (datetime.now() - self._last_used_time).total_seconds()
            
            return ModelStatus(
                loaded=self._model is not None,
                loading=self._loading,
                gpu_memory_mb=self._gpu_memory_mb,
                idle_seconds=idle_seconds,
                model_name=self._model_name if self._model else ""
            )
    
    def get_load_progress(self) -> float:
        return self._load_progress
    
    def load_model(self) -> bool:
        if not FUNASR_AVAILABLE:
            logger.error("FunASR 库未安装")
            return False
        
        with self._model_lock:
            if self._model is not None:
                self._last_used_time = datetime.now()
                return True
            
            if self._loading:
                return False
            
            self._loading = True
            self._load_progress = 0.0
        
        try:
            logger.info("开始加载 FunASR Paraformer 模型...")
            self._load_progress = 0.1
            
            model_dir = os.path.join(os.path.dirname(__file__), '..', 'models', 'funasr')
            os.makedirs(model_dir, exist_ok=True)
            
            self._load_progress = 0.2
            logger.info("加载语音识别模型...")
            
            model = FunASRAutoModel(
                model=self._model_name,
                model_revision="v2.0.4",
                hub="ms"
            )
            
            self._load_progress = 0.6
            logger.info("加载标点恢复模型...")
            
            punc_model = FunASRAutoModel(
                model=self._punc_model_name,
                model_revision="v2.0.4",
                hub="ms"
            )
            
            with self._model_lock:
                self._model = model
                self._punc_model = punc_model
            
            self._load_progress = 0.9
            
            self._update_gpu_memory()
            self._last_used_time = datetime.now()
            self._load_progress = 1.0
            
            logger.info(f"FunASR 模型加载完成，显存占用: {self._gpu_memory_mb:.1f} MB")
            return True
            
        except Exception as e:
            logger.error(f"加载 FunASR 模型失败: {e}")
            with self._model_lock:
                self._model = None
                self._punc_model = None
            self._load_progress = 0.0
            return False
        finally:
            with self._model_lock:
                self._loading = False
    
    def _update_gpu_memory(self):
        try:
            import torch
            if torch.cuda.is_available():
                self._gpu_memory_mb = torch.cuda.memory_allocated() / (1024 * 1024)
        except Exception:
            self._gpu_memory_mb = 0.0
    
    def _unload_model_internal(self):
        if self._model is not None:
            try:
                del self._model
                self._model = None
            except Exception:
                pass
        
        if self._punc_model is not None:
            try:
                del self._punc_model
                self._punc_model = None
            except Exception:
                pass
        
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass
        
        self._gpu_memory_mb = 0.0
        self._last_used_time = None
        logger.info("FunASR 模型已卸载，显存已释放")
    
    def unload_model(self):
        with self._model_lock:
            self._unload_model_internal()
    
    def transcribe(self, audio_path: str) -> TranscriptionResult:
        if not FUNASR_AVAILABLE:
            raise RuntimeError("FunASR 库未安装")
        
        if self._model is None:
            if not self.load_model():
                raise RuntimeError("模型加载失败")
        
        start_time = time.time()
        
        with self._model_lock:
            self._last_used_time = datetime.now()
        
        try:
            logger.info(f"开始识别音频: {audio_path}")
            
            result = self._model.generate(
                input=audio_path,
                batch_size_s=300,
                hotword=''
            )
            
            if not result or len(result) == 0:
                return TranscriptionResult(
                    text="",
                    confidence=0.0,
                    segments=[],
                    processing_time=time.time() - start_time
                )
            
            raw_text = result[0].get('text', '')
            
            punc_result = self._punc_model.generate(input=raw_text)
            text = punc_result[0].get('text', raw_text) if punc_result else raw_text
            
            confidence = 0.85
            
            segments = []
            if 'timestamp' in result[0]:
                for ts in result[0]['timestamp']:
                    segments.append({
                        'start': ts[0] / 1000.0,
                        'end': ts[1] / 1000.0,
                        'text': ts[2] if len(ts) > 2 else ''
                    })
            
            processing_time = time.time() - start_time
            self._update_gpu_memory()
            
            logger.info(f"音频识别完成: {text[:50]}... 耗时: {processing_time:.2f}s")
            
            return TranscriptionResult(
                text=text,
                confidence=confidence,
                segments=segments,
                processing_time=processing_time
            )
            
        except Exception as e:
            logger.error(f"音频识别失败: {e}")
            raise
    
    def split_into_sentences(self, text: str) -> List[str]:
        if not text:
            return []
        
        import re
        sentences = re.split(r'[。！？；\n]+', text)
        sentences = [s.strip() for s in sentences if s.strip()]
        
        return sentences


speech_service = FunASRService()
