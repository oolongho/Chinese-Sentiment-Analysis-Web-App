# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
情感分析模块
"""

from typing import Optional
from sentiment.lexicon_analyzer import LexiconAnalyzer
from sentiment.model_analyzer import ModelAnalyzer, get_analyzer as _get_model_analyzer
from sentiment.logger import get_logger

logger = get_logger('sentiment')

_lexicon_analyzer_instance: Optional[LexiconAnalyzer] = None


def get_lexicon_analyzer() -> LexiconAnalyzer:
    """
    获取词典分析器单例实例
    
    Returns:
        LexiconAnalyzer 实例
    """
    global _lexicon_analyzer_instance
    if _lexicon_analyzer_instance is None:
        logger.info("初始化词典分析器单例")
        _lexicon_analyzer_instance = LexiconAnalyzer()
    return _lexicon_analyzer_instance


def get_model_analyzer() -> ModelAnalyzer:
    """
    获取深度学习模型分析器单例实例
    
    Returns:
        ModelAnalyzer 实例
    """
    return _get_model_analyzer()


def reload_lexicon_analyzer() -> bool:
    """
    重新加载词典分析器
    
    Returns:
        是否成功
    """
    global _lexicon_analyzer_instance
    if _lexicon_analyzer_instance is not None:
        logger.info("重新加载词典分析器")
        _lexicon_analyzer_instance.reload()
        return True
    return False


__all__ = [
    'LexiconAnalyzer',
    'ModelAnalyzer',
    'get_lexicon_analyzer',
    'get_model_analyzer',
    'reload_lexicon_analyzer'
]
