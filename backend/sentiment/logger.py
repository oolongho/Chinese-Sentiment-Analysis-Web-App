# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
情感分析模块日志工具
"""

import logging


def get_logger(name: str = 'sentiment') -> logging.Logger:
    """获取日志记录器"""
    return logging.getLogger(name)
