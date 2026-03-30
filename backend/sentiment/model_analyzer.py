#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
深度学习模型推理接口
功能：
1. 使用统一模型管理器进行推理
2. 支持全局精度模式切换
3. 提供模型信息查询接口
"""

import os
from typing import Dict, List, Optional, Literal

from services.unified_model_manager import (
    unified_model_manager,
    PrecisionMode
)

ID_TO_LABEL = {0: '负面', 1: '中性', 2: '正面'}
LABEL_MAP = {'负面': 0, '中性': 1, '正面': 2}


class ModelAnalyzer:
    """基于深度学习的情感分析器
    
    使用统一模型管理器，支持全局精度模式切换
    """
    
    def __init__(self, precision: Literal["FP32", "INT8"] = "FP32"):
        """初始化模型分析器
        
        Args:
            precision: 模型精度模式，"FP32" 或 "INT8"，默认 "FP32"
        """
        self.precision = precision
    
    def is_loaded(self) -> bool:
        """检查模型是否已加载"""
        model, tokenizer = unified_model_manager.get_current_model()
        return model is not None and tokenizer is not None
    
    def get_precision(self) -> Literal["FP32", "INT8"]:
        """获取当前模型的精度模式
        
        Returns:
            当前精度模式："FP32" 或 "INT8"
        """
        current_mode = unified_model_manager.get_current_mode()
        return current_mode.value.upper()
    
    def get_model_size(self) -> Optional[float]:
        """获取模型大小（MB）
        
        Returns:
            模型大小（MB）
        """
        status = unified_model_manager.get_status()
        return status.get('current_model_size_mb', 0.0)
    
    def reload(self, precision: Literal["FP32", "INT8"] = None):
        """重新加载模型，支持切换精度模式
        
        Args:
            precision: 新的精度模式，如果为 None 则保持当前精度
        """
        if precision is not None:
            target_mode = PrecisionMode.FP32 if precision == "FP32" else PrecisionMode.INT8
            unified_model_manager.switch_mode(target_mode)
    
    def predict(self, text: str) -> Dict:
        """
        预测单条文本的情感
        
        Args:
            text: 输入文本
            
        Returns:
            预测结果字典
        """
        result = unified_model_manager.predict(text)
        
        if 'error' in result and result.get('error'):
            return {
                'sentiment': '中性',
                'confidence': 0.5,
                'scores': {'正面': 0.33, '中性': 0.34, '负面': 0.33},
                'error': result['error']
            }
        
        return result
    
    def predict_batch(self, texts: List[str]) -> List[Dict]:
        """
        批量预测文本情感
        
        Args:
            texts: 文本列表
            
        Returns:
            预测结果列表
        """
        return [self.predict(text) for text in texts]


_analyzer_instance: Optional[ModelAnalyzer] = None


def get_analyzer(precision: Literal["FP32", "INT8"] = "FP32") -> ModelAnalyzer:
    """获取模型分析器单例
    
    Args:
        precision: 模型精度模式，默认使用全局当前模式
        
    Returns:
        ModelAnalyzer 实例
    """
    global _analyzer_instance
    
    if _analyzer_instance is None:
        _analyzer_instance = ModelAnalyzer(precision=precision)
    
    return _analyzer_instance


def test_model():
    """测试模型"""
    analyzer = ModelAnalyzer()
    
    test_texts = [
        "这个产品质量很好，物流也很快，非常满意！",
        "东西很差，不好用，后悔买了",
        "一般般吧，没什么特别的",
        "服务态度非常好，送货也很及时，值得推荐",
        "噪音太大了，根本没法用，想退货",
    ]
    
    print("\n" + "=" * 60)
    print("模型推理测试")
    print("=" * 60)
    
    for text in test_texts:
        result = analyzer.predict(text)
        print(f"\n文本: {text}")
        print(f"情感: {result['sentiment']} (置信度: {result['confidence']:.2%})")
        print(f"得分: {result['scores']}")


if __name__ == '__main__':
    test_model()
