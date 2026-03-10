# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
路由模块日志工具
"""

import logging


def get_logger(name: str) -> logging.Logger:
    """获取日志记录器"""
    return logging.getLogger(name)
