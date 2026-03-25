# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
异步训练服务
功能：
1. 在后台线程运行训练任务
2. 跟踪训练进度
3. 提供训练状态查询
4. 记录训练历史数据（Loss、准确率曲线）
"""

import os
import threading
import asyncio
import json
from datetime import datetime
from typing import Optional, Callable, Dict, Any, List

TRAINING_STATUS = {
    'status': 'idle',
    'progress': 0,
    'current_epoch': 0,
    'total_epochs': 0,
    'metrics': {},
    'message': '',
    'start_time': None,
    'end_time': None,
    'data_file': None,
    'error': None,
    'gpu_memory': {
        'current_mb': 0,
        'peak_mb': 0
    }
}

TRAINING_HISTORY = {
    'epochs': [],
    'train_loss': [],
    'eval_loss': [],
    'accuracy': [],
    'f1': [],
    'learning_rate': []
}

_training_lock = threading.Lock()
_training_thread: Optional[threading.Thread] = None


def update_training_status(**kwargs):
    """更新训练状态"""
    global TRAINING_STATUS
    with _training_lock:
        TRAINING_STATUS.update(kwargs)


def get_training_status() -> Dict[str, Any]:
    """获取训练状态"""
    with _training_lock:
        return TRAINING_STATUS.copy()


def run_training(data_file: str, params: Dict):
    """在后台运行训练任务"""
    gpu_memory_peak = 0.0
    
    try:
        update_training_status(
            status='training',
            progress=0,
            current_epoch=0,
            total_epochs=params.get('epochs', 3),
            metrics={},
            message='正在加载模型...',
            start_time=datetime.now().isoformat(),
            data_file=data_file,
            error=None,
            gpu_memory={'current_mb': 0, 'peak_mb': 0}
        )
        
        from services.system_monitor import system_monitor
        from services.cache_service import save_training_cache
        
        def progress_cb(epoch, total_epochs, metrics=None, msg=''):
            nonlocal gpu_memory_peak
            gpu_info = system_monitor.get_gpu_memory_info()
            current_mb = gpu_info.allocated_mb
            if current_mb > gpu_memory_peak:
                gpu_memory_peak = current_mb
            training_progress_callback(epoch, total_epochs, metrics, msg, current_mb, gpu_memory_peak)
        
        from sentiment.model_trainer import train_model_with_callback
        
        result = train_model_with_callback(
            data_file=data_file,
            num_epochs=params.get('epochs', 3),
            batch_size=params.get('batch_size', 16),
            learning_rate=params.get('learning_rate', 2e-5),
            max_length=params.get('max_length', 128),
            progress_callback=progress_cb
        )
        
        update_training_status(
            status='completed',
            progress=100,
            message='训练完成！模型已保存',
            end_time=datetime.now().isoformat(),
            metrics=result.get('metrics', {}),
            gpu_memory={'current_mb': 0, 'peak_mb': gpu_memory_peak}
        )
        
        save_training_cache(
            status='completed',
            metrics=result.get('metrics', {}),
            history=get_training_history(),
            gpu_memory_peak_mb=gpu_memory_peak,
            params=params
        )
        
    except Exception as e:
        update_training_status(
            status='failed',
            error=str(e),
            message=f'训练失败: {str(e)}',
            end_time=datetime.now().isoformat()
        )
        save_training_cache(
            status='failed',
            error=str(e),
            params=params
        )


def start_training(data_file: str, params: Dict) -> bool:
    """启动训练任务"""
    global _training_thread
    
    with _training_lock:
        if TRAINING_STATUS['status'] == 'training':
            return False
        
        _training_thread = threading.Thread(
            target=run_training,
            args=(data_file, params),
            daemon=True
        )
        _training_thread.start()
        
    return True


def cancel_training() -> bool:
    """取消训练任务（标记为取消，实际需要训练脚本支持）"""
    with _training_lock:
        if TRAINING_STATUS['status'] != 'training':
            return False
        TRAINING_STATUS['status'] = 'cancelled'
        TRAINING_STATUS['message'] = '训练已取消'
        TRAINING_STATUS['end_time'] = datetime.now().isoformat()
    
    return True


def reset_training_status():
    """重置训练状态"""
    global TRAINING_STATUS, TRAINING_HISTORY
    with _training_lock:
        TRAINING_STATUS = {
            'status': 'idle',
            'progress': 0,
            'current_epoch': 0,
            'total_epochs': 0,
            'metrics': {},
            'message': '',
            'start_time': None,
            'end_time': None,
            'data_file': None,
            'error': None,
            'gpu_memory': {
                'current_mb': 0,
                'peak_mb': 0
            }
        }
        TRAINING_HISTORY = {
            'epochs': [],
            'train_loss': [],
            'eval_loss': [],
            'accuracy': [],
            'f1': [],
            'learning_rate': []
        }


def add_training_history(epoch: int, train_loss: float = None, eval_loss: float = None, 
                         accuracy: float = None, f1: float = None, learning_rate: float = None):
    """添加训练历史记录"""
    global TRAINING_HISTORY
    with _training_lock:
        TRAINING_HISTORY['epochs'].append(epoch)
        TRAINING_HISTORY['train_loss'].append(train_loss)
        TRAINING_HISTORY['eval_loss'].append(eval_loss)
        TRAINING_HISTORY['accuracy'].append(accuracy)
        TRAINING_HISTORY['f1'].append(f1)
        TRAINING_HISTORY['learning_rate'].append(learning_rate)


def get_training_history() -> Dict[str, List]:
    """获取训练历史"""
    with _training_lock:
        return TRAINING_HISTORY.copy()


def training_progress_callback(epoch: int, total_epochs: int, metrics: Dict = None, message: str = '', 
                               gpu_current_mb: float = 0, gpu_peak_mb: float = 0):
    """训练进度回调函数"""
    progress = int((epoch / total_epochs) * 100) if total_epochs > 0 else 0
    
    if metrics:
        add_training_history(
            epoch=epoch,
            train_loss=metrics.get('train_loss'),
            eval_loss=metrics.get('eval_loss'),
            accuracy=metrics.get('eval_accuracy'),
            f1=metrics.get('eval_f1'),
            learning_rate=metrics.get('learning_rate')
        )
    
    update_training_status(
        current_epoch=epoch,
        total_epochs=total_epochs,
        progress=progress,
        metrics=metrics or {},
        message=message,
        gpu_memory={'current_mb': gpu_current_mb, 'peak_mb': gpu_peak_mb}
    )
