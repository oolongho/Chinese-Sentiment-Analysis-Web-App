# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
系统监控服务
功能：
1. 轻量级 CPU/GPU 使用率监控
2. 分析期间峰值采样
3. 环形缓冲区存储历史数据
4. 线程安全的数据访问
"""

import time
import threading
import psutil
from collections import deque
from typing import Dict, List, Optional
from dataclasses import dataclass, field

try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False

try:
    from pynvml import nvmlInit, nvmlShutdown, nvmlDeviceGetHandleByIndex, nvmlDeviceGetUtilizationRates
    PYNVML_AVAILABLE = True
except ImportError:
    PYNVML_AVAILABLE = False


@dataclass
class ProfilingResult:
    cpu_peak: float = 0.0
    cpu_avg: float = 0.0
    gpu_peak: Optional[float] = None
    gpu_avg: Optional[float] = None
    sample_count: int = 0
    duration_ms: float = 0.0


class SystemMonitor:
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls, max_history: int = 100):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self, max_history: int = 100):
        if self._initialized:
            return
        self._initialized = True
        self._history_lock = threading.Lock()
        self._history: deque = deque(maxlen=max_history)
        self._gpu_available = TORCH_AVAILABLE and torch.cuda.is_available()
        self._pynvml_initialized = False
        
        # 尝试初始化pynvml
        if PYNVML_AVAILABLE and self._gpu_available:
            try:
                nvmlInit()
                self._pynvml_initialized = True
                self._nvml_handle = nvmlDeviceGetHandleByIndex(0)
            except Exception:
                self._pynvml_initialized = False
        
        self._profiling_lock = threading.Lock()
        self._profiling_active = False
        self._profiling_thread: Optional[threading.Thread] = None
        self._profiling_samples: List[Dict] = []
        self._profiling_start_time: float = 0.0
    
    def _get_current_usage(self) -> Dict:
        cpu_percent = psutil.cpu_percent(interval=0.0)
        gpu_percent = None
        
        # 优先使用pynvml读取GPU使用率
        if self._pynvml_initialized:
            try:
                util = nvmlDeviceGetUtilizationRates(self._nvml_handle)
                gpu_percent = util.gpu
            except Exception:
                gpu_percent = None
        # 回退到torch.cuda.utilization()
        elif self._gpu_available:
            try:
                gpu_percent = torch.cuda.utilization()
            except Exception:
                gpu_percent = None
        
        return {
            'timestamp': time.time(),
            'cpu_percent': round(cpu_percent, 1),
            'gpu_percent': round(gpu_percent, 1) if gpu_percent is not None else None
        }
    
    def record_snapshot(self) -> Dict:
        snapshot = self._get_current_usage()
        
        with self._history_lock:
            self._history.append(snapshot)
        
        return snapshot
    
    def get_history(self, limit: int = 50) -> List[Dict]:
        with self._history_lock:
            history = list(self._history)
        
        if limit and len(history) > limit:
            history = history[-limit:]
        
        return history
    
    def get_current_usage(self) -> Dict:
        snapshot = self._get_current_usage()
        return {
            'cpu_percent': snapshot['cpu_percent'],
            'gpu_percent': snapshot['gpu_percent'],
            'gpu_available': self._gpu_available
        }
    
    def clear_history(self):
        with self._history_lock:
            self._history.clear()
    
    def start_profiling(self) -> bool:
        with self._profiling_lock:
            if self._profiling_active:
                return False
            
            self._profiling_active = True
            self._profiling_samples = []
            self._profiling_start_time = time.time()
            
            self._profiling_thread = threading.Thread(target=self._profiling_worker, daemon=True)
            self._profiling_thread.start()
            
            return True
    
    def _profiling_worker(self):
        while True:
            with self._profiling_lock:
                if not self._profiling_active:
                    break
            
            sample = self._get_current_usage()
            
            with self._profiling_lock:
                if self._profiling_active:
                    self._profiling_samples.append(sample)
            
            time.sleep(0.02)
    
    def stop_profiling(self) -> ProfilingResult:
        with self._profiling_lock:
            self._profiling_active = False
            samples = self._profiling_samples.copy()
            start_time = self._profiling_start_time
        
        if self._profiling_thread:
            self._profiling_thread.join(timeout=0.5)
            self._profiling_thread = None
        
        if not samples:
            return ProfilingResult()
        
        cpu_values = [s['cpu_percent'] for s in samples if s['cpu_percent'] is not None]
        gpu_values = [s['gpu_percent'] for s in samples if s['gpu_percent'] is not None]
        
        result = ProfilingResult(
            cpu_peak=max(cpu_values) if cpu_values else 0.0,
            cpu_avg=sum(cpu_values) / len(cpu_values) if cpu_values else 0.0,
            gpu_peak=max(gpu_values) if gpu_values else None,
            gpu_avg=sum(gpu_values) / len(gpu_values) if gpu_values else None,
            sample_count=len(samples),
            duration_ms=(time.time() - start_time) * 1000
        )
        
        return result
    
    def profile_analysis(self, analysis_func, *args, **kwargs) -> tuple:
        self.start_profiling()
        start_time = time.time()
        
        try:
            result = analysis_func(*args, **kwargs)
        finally:
            profiling_result = self.stop_profiling()
        
        total_time = time.time() - start_time
        
        return result, profiling_result, total_time


system_monitor = SystemMonitor()
