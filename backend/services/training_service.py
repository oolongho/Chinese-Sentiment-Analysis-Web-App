# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
异步训练服务
功能：
1. 在后台线程运行训练任务
2. 跟踪训练进度
3. 提供训练状态查询
"""

import os
import threading
import asyncio
from datetime import datetime
from typing import Optional, Callable, Dict, Any

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
    'error': None
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


def training_progress_callback(epoch: int, total_epochs: int, metrics: Dict = None, message: str = ''):
    """训练进度回调函数"""
    progress = int((epoch / total_epochs) * 100) if total_epochs > 0 else 0
    update_training_status(
        current_epoch=epoch,
        total_epochs=total_epochs,
        progress=progress,
        metrics=metrics or {},
        message=message
    )


def run_training(data_file: str, params: Dict):
    """在后台运行训练任务"""
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
            error=None
        )
        
        from ..sentiment.model_trainer import train_model_with_callback
        
        def progress_cb(epoch, total_epochs, metrics=None, msg=''):
            training_progress_callback(epoch, total_epochs, metrics, msg)
        
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
            metrics=result.get('metrics', {})
        )
        
    except Exception as e:
        update_training_status(
            status='failed',
            error=str(e),
            message=f'训练失败: {str(e)}',
            end_time=datetime.now().isoformat()
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
    global TRAINING_STATUS
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
            'error': None
        }
