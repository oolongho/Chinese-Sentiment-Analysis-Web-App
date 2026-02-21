# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
情感词典分析器
功能：
1. 加载情感词典（正面词、负面词）
2. 加载程度副词词典
3. 加载否定词词典
4. 实现情感分析算法
"""

import os
import re
import jieba
from typing import Dict, List, Tuple

DICT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'data')

class LexiconAnalyzer:
    """基于情感词典的情感分析器"""
    
    def __init__(self):
        self.positive_words: Dict[str, int] = {}
        self.negative_words: Dict[str, int] = {}
        self.degree_words: Dict[str, float] = {}
        self.negation_words: List[str] = []
        self.stop_words: List[str] = []
        
        self._load_dictionaries()
    
    def _load_dictionaries(self):
        """加载所有词典"""
        self._load_sentiment_words()
        self._load_degree_words()
        self._load_negation_words()
        self._load_stop_words()
        self._add_custom_words()
    
    def _load_sentiment_words(self):
        """加载情感词典"""
        pos_file = os.path.join(DICT_DIR, 'positive_words.txt')
        neg_file = os.path.join(DICT_DIR, 'negative_words.txt')
        
        if os.path.exists(pos_file):
            with open(pos_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if ',' in line:
                        word, score = line.rsplit(',', 1)
                        self.positive_words[word] = int(float(score))
            print(f"加载正面词典: {len(self.positive_words)} 个词")
        
        if os.path.exists(neg_file):
            with open(neg_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if ',' in line:
                        word, score = line.rsplit(',', 1)
                        self.negative_words[word] = int(float(score))
            print(f"加载负面词典: {len(self.negative_words)} 个词")
    
    def _load_degree_words(self):
        """加载程度副词词典"""
        self.degree_words = {
            '极其': 2.0, '最为': 2.0, '最': 2.0,
            '非常': 1.8, '十分': 1.8, '特别': 1.8, '格外': 1.8,
            '很': 1.5, '挺': 1.5, '相当': 1.5, '比较': 1.3,
            '有点': 0.8, '稍微': 0.8, '略微': 0.8, '有些': 0.8,
            '超级': 2.0, '超': 1.8, '太': 1.8, '真': 1.5,
            '实在': 1.5, '确实': 1.5, '真的': 1.5,
        }
        print(f"加载程度副词词典: {len(self.degree_words)} 个词")
    
    def _load_negation_words(self):
        """加载否定词词典"""
        self.negation_words = [
            '不', '没', '无', '非', '莫', '勿', '未', '别',
            '没有', '不是', '不会', '不能', '不要', '不好',
            '没什么', '不算', '不再', '不曾', '不怎',
        ]
        print(f"加载否定词词典: {len(self.negation_words)} 个词")
    
    def _load_stop_words(self):
        """加载停用词词典"""
        self.stop_words = [
            '的', '了', '是', '在', '我', '有', '和', '就',
            '不', '人', '都', '一', '一个', '上', '也', '很',
            '到', '说', '要', '去', '你', '会', '着', '没有',
            '看', '好', '自己', '这', '那', '里', '来', '他',
            '她', '它', '们', '这个', '那个', '什么', '怎么',
        ]
    
    def _add_custom_words(self):
        """添加自定义词到jieba词典"""
        custom_words = list(self.positive_words.keys()) + list(self.negative_words.keys())
        for word in custom_words:
            jieba.add_word(word)
    
    def segment(self, text: str) -> List[str]:
        """分词"""
        words = jieba.lcut(text)
        return [w for w in words if w.strip() and w not in self.stop_words]
    
    def analyze(self, text: str) -> Dict:
        """
        分析文本情感
        
        Args:
            text: 输入文本
            
        Returns:
            分析结果字典
        """
        words = self.segment(text)
        
        total_score = 0
        word_scores = []
        
        i = 0
        while i < len(words):
            word = words[i]
            score = 0
            modifier = 1.0
            
            if i > 0:
                prev_word = words[i - 1]
                if prev_word in self.negation_words:
                    modifier *= -1
                elif prev_word in self.degree_words:
                    modifier *= self.degree_words[prev_word]
            
            if i > 1:
                prev_prev_word = words[i - 2]
                if prev_prev_word in self.negation_words:
                    modifier *= -1
            
            if word in self.positive_words:
                score = self.positive_words[word] * modifier
            elif word in self.negative_words:
                score = self.negative_words[word] * modifier
            
            if score != 0:
                total_score += score
                word_scores.append({
                    'word': word,
                    'base_score': self.positive_words.get(word, self.negative_words.get(word, 0)),
                    'modifier': modifier,
                    'final_score': score
                })
            
            i += 1
        
        sentiment = self._classify_sentiment(total_score)
        confidence = self._calculate_confidence(total_score, word_scores)
        
        return {
            'sentiment': sentiment,
            'score': total_score,
            'confidence': confidence,
            'word_count': len(words),
            'sentiment_words': word_scores,
            'positive_count': len([w for w in word_scores if w['final_score'] > 0]),
            'negative_count': len([w for w in word_scores if w['final_score'] < 0]),
        }
    
    def _classify_sentiment(self, score: float) -> str:
        """根据得分分类情感"""
        if score > 1:
            return '正面'
        elif score < -1:
            return '负面'
        else:
            return '中性'
    
    def reload(self):
        """重新加载所有词典"""
        self.positive_words.clear()
        self.negative_words.clear()
        self.degree_words.clear()
        self.negation_words.clear()
        self.stop_words.clear()
        self._load_dictionaries()
        print("词典已重新加载")
    
    def _calculate_confidence(self, score: float, word_scores: List[Dict]) -> float:
        """计算置信度"""
        if not word_scores:
            return 0.5
        
        abs_scores = [abs(w['final_score']) for w in word_scores]
        avg_score = sum(abs_scores) / len(abs_scores)
        
        confidence = min(0.5 + avg_score * 0.1, 0.99)
        
        return round(confidence, 4)


def test_analyzer():
    """测试情感分析器"""
    analyzer = LexiconAnalyzer()
    
    test_texts = [
        "这个产品质量很好，物流也很快，非常满意！",
        "东西很差，不好用，后悔买了",
        "一般般吧，没什么特别的",
        "服务态度非常好，送货也很及时，值得推荐",
        "噪音太大了，根本没法用，想退货",
    ]
    
    print("\n" + "=" * 60)
    print("情感分析测试")
    print("=" * 60)
    
    for text in test_texts:
        result = analyzer.analyze(text)
        print(f"\n文本: {text}")
        print(f"情感: {result['sentiment']} (得分: {result['score']}, 置信度: {result['confidence']:.2%})")
        print(f"情感词: {result['sentiment_words']}")


if __name__ == '__main__':
    test_analyzer()
