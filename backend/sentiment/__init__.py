# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
情感分析模块
"""

from .lexicon_analyzer import LexiconAnalyzer
from .model_analyzer import ModelAnalyzer, get_analyzer

_lexicon_instance = None

def get_lexicon_analyzer() -> LexiconAnalyzer:
    """获取词典分析器单例"""
    global _lexicon_instance
    if _lexicon_instance is None:
        _lexicon_instance = LexiconAnalyzer()
    return _lexicon_instance

__all__ = ['LexiconAnalyzer', 'ModelAnalyzer', 'get_analyzer', 'get_lexicon_analyzer']
