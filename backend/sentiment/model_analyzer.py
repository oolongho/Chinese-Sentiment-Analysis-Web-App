# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
深度学习模型推理接口
功能：
1. 加载微调后的模型
2. 实现情感预测接口
"""

import os
import torch
from typing import Dict, List, Optional
from transformers import AutoTokenizer, AutoModelForSequenceClassification

MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'models', 'roberta_finetuned')
DEFAULT_MODEL_NAME = 'hfl/chinese-roberta-wwm-ext'

ID_TO_LABEL = {0: '负面', 1: '中性', 2: '正面'}
LABEL_MAP = {'负面': 0, '中性': 1, '正面': 2}


class ModelAnalyzer:
    """基于深度学习的情感分析器"""
    
    def __init__(self, model_path: str = None):
        self.model = None
        self.tokenizer = None
        self.device = None
        self._load_model(model_path)
    
    def _load_model(self, model_path: str = None):
        """加载模型"""
        if model_path is None:
            model_path = MODEL_DIR
        
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        
        if os.path.exists(model_path) and os.listdir(model_path):
            print(f"加载本地微调模型: {model_path}")
            print(f"使用设备: {self.device}")
            
            self.tokenizer = AutoTokenizer.from_pretrained(model_path)
            self.model = AutoModelForSequenceClassification.from_pretrained(model_path)
        else:
            print(f"本地模型不存在，加载预训练模型: {DEFAULT_MODEL_NAME}")
            print(f"使用设备: {self.device}")
            print("提示: 请运行 model_trainer.py 训练模型以获得更好的效果")
            
            self.tokenizer = AutoTokenizer.from_pretrained(DEFAULT_MODEL_NAME)
            self.model = AutoModelForSequenceClassification.from_pretrained(
                DEFAULT_MODEL_NAME,
                num_labels=3,
                id2label=ID_TO_LABEL,
                label2id=LABEL_MAP
            )
        
        self.model.to(self.device)
        self.model.eval()
        print("模型加载完成")
    
    def is_loaded(self) -> bool:
        """检查模型是否已加载"""
        return self.model is not None and self.tokenizer is not None
    
    def predict(self, text: str) -> Dict:
        """
        预测单条文本的情感
        
        Args:
            text: 输入文本
            
        Returns:
            预测结果字典
        """
        if not self.is_loaded():
            return {
                'sentiment': '中性',
                'confidence': 0.5,
                'scores': {'正面': 0.33, '中性': 0.34, '负面': 0.33},
                'error': '模型未加载'
            }
        
        encoding = self.tokenizer(
            text,
            add_special_tokens=True,
            max_length=128,
            padding='max_length',
            truncation=True,
            return_tensors='pt'
        )
        
        input_ids = encoding['input_ids'].to(self.device)
        attention_mask = encoding['attention_mask'].to(self.device)
        
        with torch.no_grad():
            outputs = self.model(input_ids=input_ids, attention_mask=attention_mask)
            probs = torch.softmax(outputs.logits, dim=-1)
            pred = torch.argmax(probs, dim=-1)
        
        pred_label = ID_TO_LABEL[pred.item()]
        confidence = probs[0][pred.item()].item()
        
        scores = {
            '正面': probs[0][2].item(),
            '中性': probs[0][1].item(),
            '负面': probs[0][0].item()
        }
        
        return {
            'sentiment': pred_label,
            'confidence': round(confidence, 4),
            'scores': {k: round(v, 4) for k, v in scores.items()}
        }
    
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


def get_analyzer() -> ModelAnalyzer:
    """获取模型分析器单例"""
    global _analyzer_instance
    if _analyzer_instance is None:
        _analyzer_instance = ModelAnalyzer()
    return _analyzer_instance


def test_model():
    """测试模型"""
    analyzer = ModelAnalyzer()
    
    if not analyzer.is_loaded():
        print("模型未加载，无法测试")
        return
    
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
