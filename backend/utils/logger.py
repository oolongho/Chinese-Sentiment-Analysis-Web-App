# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
日志模块
"""

import logging
import sys
from pathlib import Path
from typing import Optional


def setup_logger(
    name: str = 'sentiment_analysis',
    log_file: Optional[str] = None,
    level: int = logging.INFO,
    format_string: Optional[str] = None
) -> logging.Logger:
    """
    配置并返回日志记录器
    
    Args:
        name: 日志记录器名称
        log_file: 日志文件路径（可选）
        level: 日志级别
        format_string: 自定义日志格式（可选）
    
    Returns:
        配置好的日志记录器
    """
    if format_string is None:
        format_string = '[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s'
    
    formatter = logging.Formatter(format_string, datefmt='%Y-%m-%d %H:%M:%S')
    
    logger = logging.getLogger(name)
    logger.setLevel(level)
    
    if logger.handlers:
        logger.handlers.clear()
    
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    if log_file:
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        
        file_handler = logging.FileHandler(log_file, encoding='utf-8')
        file_handler.setLevel(level)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    
    return logger


def get_logger(name: Optional[str] = None) -> logging.Logger:
    """
    获取日志记录器实例
    
    Args:
        name: 日志记录器名称，默认为调用模块名
    
    Returns:
        日志记录器实例
    """
    if name is None:
        import inspect
        frame = inspect.currentframe()
        if frame and frame.f_back:
            name = frame.f_back.f_globals.get('__name__')
    
    return logging.getLogger(name or 'sentiment_analysis')
