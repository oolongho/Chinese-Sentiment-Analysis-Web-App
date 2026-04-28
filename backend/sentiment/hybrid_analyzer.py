"""
混合情感分析器
"""

from typing import Dict, Optional, Any
from enum import Enum
import time

from sentiment import get_lexicon_analyzer
from sentiment.model_analyzer import ModelAnalyzer


class HybridStrategy(Enum):
    """混合策略枚举"""
    CASCADE = "cascade"  # 级联加速
    WEIGHTED = "weighted"  # 置信度加权
    RULE_BASED = "rule_based"  # 规则修正
    ENHANCED_CASCADE = "enhanced_cascade"  # 增强级联
    ADAPTIVE = "adaptive"  # 自适应路由


class HybridAnalyzer:
    
    def __init__(
        self,
        strategy: HybridStrategy = HybridStrategy.CASCADE,
        config: Optional[Dict] = None
    ):
        self.strategy = strategy
        self.config = config or {}
        
        # 默认配置（基于实验最优配置：lexicon_threshold=0.70, lexicon_score_threshold=3.0，准确率 96.5%）
        self.default_config = {
            'lexicon_threshold': 0.70,  # 词典置信度阈值（论文推荐值）
            'lexicon_score_threshold': 3.0,  # 词典得分阈值（论文推荐值）
            'roberta_weight': 0.7,  # RoBERTa 权重
            'enable_speed_optimization': True,  # 启用速度优化
            'max_fast_path_length': 30,         # 快速路径最大文本长度
            'min_sentiment_words': 1,           # 最少情感词数量
            'dl_confidence_threshold': 0.85,   # DL 置信度阈值
            'fusion_lexicon_weight': 0.40,     # 混合时词典权重
            'fusion_dl_weight': 0.60,          # 混合时 DL 权重
            'low_confidence_mark': True,       # 是否标记低置信度结果
        }
        self.config = {**self.default_config, **self.config}
        
        # 初始化两个分析器（使用单例，确保增强词典开关生效）
        self.lexicon_analyzer = get_lexicon_analyzer()
        self.model_analyzer = ModelAnalyzer()
        
        # 统计信息
        self.stats = {
            'total_predictions': 0,
            'cascade_fast_path': 0,  # 级联快速路径次数 (Layer 1)
            'cascade_slow_path': 0,  # 级联慢速路径次数 (Layer 2 + Layer 3)
            'layer2_direct_return': 0,  # Layer 2 直返次数
            'layer3_fusion': 0,  # Layer 3 混合次数
        }
    
    def predict(self, text: str) -> Dict[str, Any]:
        """
        预测文本情感
        """
        start_time = time.time()
        
        if self.strategy == HybridStrategy.CASCADE:
            result = self._predict_cascade(text)
        elif self.strategy == HybridStrategy.WEIGHTED:
            result = self._predict_weighted(text)
        elif self.strategy == HybridStrategy.RULE_BASED:
            result = self._predict_rule_based(text)
        elif self.strategy == HybridStrategy.ENHANCED_CASCADE:
            result = self._predict_enhanced_cascade(text)
        elif self.strategy == HybridStrategy.ADAPTIVE:
            result = self._predict_adaptive(text)
        else:
            raise ValueError(f"未知的混合策略：{self.strategy}")
        
        # 添加混合模型特有信息
        result['hybrid_strategy'] = self.strategy.value
        result['inference_time_ms'] = (time.time() - start_time) * 1000
        
        # 更新统计
        self.stats['total_predictions'] += 1
        
        return result
    
    def _predict_cascade(self, text: str) -> Dict[str, Any]:
        """
        级联加速
        """
        # 步骤 1：词典方法
        lexicon_result = self.lexicon_analyzer.analyze(text)
        
        # 步骤 2：判断是否使用快速路径
        lexicon_confidence = lexicon_result.get('confidence', 0)
        lexicon_score = abs(lexicon_result.get('score', 0))
        
        if (lexicon_confidence >= self.config['lexicon_threshold'] and
            lexicon_score >= self.config['lexicon_score_threshold']):
            # 快速路径：直接返回词典结果
            self.stats['cascade_fast_path'] += 1
            
            return {
                'sentiment': lexicon_result['sentiment'],
                'confidence': lexicon_result['confidence'],
                'scores': self._convert_lexicon_to_scores(lexicon_result),
                'method': 'lexicon_fast',
                'lexicon_result': lexicon_result,
            }
        
        # 步骤 3：慢速路径：使用深度学习
        self.stats['cascade_slow_path'] += 1
        roberta_result = self.model_analyzer.predict(text)
        
        # 步骤 4：混合结果（以深度学习为主，词典为辅）
        if lexicon_result['sentiment'] != roberta_result['sentiment']:
            # 两者不一致，需要混合
            if lexicon_confidence > 0.9 and lexicon_score > 4:
                # 词典非常确定，采用词典
                final_sentiment = lexicon_result['sentiment']
                final_confidence = lexicon_confidence * 0.9
            else:
                # 否则采用深度学习
                final_sentiment = roberta_result['sentiment']
                final_confidence = roberta_result['confidence'] * 0.95
        else:
            # 两者一致，提高置信度
            final_sentiment = roberta_result['sentiment']
            final_confidence = max(roberta_result['confidence'], lexicon_confidence)
        
        return {
            'sentiment': final_sentiment,
            'confidence': final_confidence,
            'scores': roberta_result.get('scores', {}),
            'method': 'cascade_fusion',
            'lexicon_result': lexicon_result,
            'roberta_result': roberta_result,
        }
    
    def _predict_weighted(self, text: str) -> Dict[str, Any]:
        """
        置信度加权策略
        
        1. 同时运行两种方法
        2. 根据置信度加权混合
        """
        # 同时运行两种方法
        lexicon_result = self.lexicon_analyzer.analyze(text)
        roberta_result = self.model_analyzer.predict(text)
        
        # 计算权重
        lexicon_conf = lexicon_result.get('confidence', 0.5)
        roberta_conf = roberta_result.get('confidence', 0.5)
        
        # 应用配置权重和置信度计算最终权重
        # 配置权重表示对模型的偏好，置信度表示模型对结果的确定性
        lexicon_base = (1 - self.config['roberta_weight'])
        roberta_base = self.config['roberta_weight']
        
        # 结合置信度和配置权重计算最终权重（直接归一化）
        weighted_lexicon = lexicon_conf * lexicon_base
        weighted_roberta = roberta_conf * roberta_base
        total_weighted = weighted_lexicon + weighted_roberta
        
        if total_weighted > 0:
            lexicon_weight = weighted_lexicon / total_weighted
            roberta_weight = weighted_roberta / total_weighted
        else:
            # 如果都为0，使用配置权重
            lexicon_weight = lexicon_base
            roberta_weight = roberta_base
        
        # 混合置信度
        final_confidence = (lexicon_conf * lexicon_weight + roberta_conf * roberta_weight)
        
        # 混合情感（以权重高的为准）
        if roberta_weight > 0.6:
            final_sentiment = roberta_result['sentiment']
            final_scores = roberta_result.get('scores', {})
        elif lexicon_weight > 0.6:
            final_sentiment = lexicon_result['sentiment']
            final_scores = self._convert_lexicon_to_scores(lexicon_result)
        else:
            # 权重接近，投票决定
            if roberta_result['sentiment'] == lexicon_result['sentiment']:
                final_sentiment = roberta_result['sentiment']
            else:
                # 不一致时，以权重高的为准
                final_sentiment = (roberta_result['sentiment'] if roberta_weight > lexicon_weight
                                  else lexicon_result['sentiment'])
            final_scores = roberta_result.get('scores', {})
        
        return {
            'sentiment': final_sentiment,
            'confidence': final_confidence,
            'scores': final_scores,
            'method': 'weighted_fusion',
            'lexicon_result': lexicon_result,
            'roberta_result': roberta_result,
            'weights': {
                'lexicon': round(lexicon_weight, 3),
                'roberta': round(roberta_weight, 3),
            }
        }
    
    def _predict_rule_based(self, text: str) -> Dict[str, Any]:
        """
        规则修正策略
        """
        # 深度学习预测
        roberta_result = self.model_analyzer.predict(text)
        
        # 词典方法检测
        lexicon_result = self.lexicon_analyzer.analyze(text)
        
        # 规则修正
        final_sentiment = roberta_result['sentiment']
        final_confidence = roberta_result['confidence']
        
        # 规则 1：深度学习置信度低 + 词典情感强烈 -> 采用词典
        if (roberta_result['confidence'] < 0.6 and
            lexicon_result['confidence'] > 0.8 and
            abs(lexicon_result['score']) > 3):
            final_sentiment = lexicon_result['sentiment']
            final_confidence = lexicon_result['confidence'] * 0.8
        
        # 规则 2：检测到双重否定 -> 信任词典
        if self._detect_double_negation(text, lexicon_result):
            final_sentiment = lexicon_result['sentiment']
            final_confidence = max(final_confidence, lexicon_result['confidence'] * 0.9)
        
        # 规则 3：领域特定词 -> 信任词典
        if self._detect_domain_specific_words(text, lexicon_result):
            final_confidence = max(final_confidence, lexicon_result['confidence'] * 0.85)
        
        return {
            'sentiment': final_sentiment,
            'confidence': final_confidence,
            'scores': roberta_result.get('scores', {}),
            'method': 'rule_based_correction',
            'lexicon_result': lexicon_result,
            'roberta_result': roberta_result,
            'rules_applied': self._get_applied_rules(text, lexicon_result, roberta_result),
        }
    
    def _predict_enhanced_cascade(self, text: str) -> Dict[str, Any]:
        """增强版级联策略"""
        start_time = time.time()
        
        # Layer 1: 使用增强词典快速预检
        lexicon_result = self.lexicon_analyzer.analyze(text)
        lexicon_confidence = lexicon_result.get('confidence', 0)
        lexicon_score = abs(lexicon_result.get('score', 0))
        text_length = len(text)
        sentiment_word_count = len(lexicon_result.get('sentiment_words', []))
        
        # 三条件 AND 判断快速路径
        is_short_text = text_length <= self.config.get('max_fast_path_length', 30)
        is_high_confidence = lexicon_confidence >= self.config['lexicon_threshold']
        is_strong_sentiment = (
            lexicon_score >= self.config['lexicon_score_threshold'] and 
            sentiment_word_count >= self.config.get('min_sentiment_words', 1)
        )
        
        if is_short_text and is_high_confidence and is_strong_sentiment:
            self.stats['cascade_fast_path'] += 1
            return {
                'sentiment': lexicon_result['sentiment'],
                'confidence': lexicon_confidence,
                'scores': self._convert_lexicon_to_scores(lexicon_result),
                'method': 'enhanced_lexicon_fast',
                'layer': 1,
                'inference_time_ms': (time.time() - start_time) * 1000,
                'lexicon_result': lexicon_result,
            }
        
        # Layer 2: 深度理解 (RoBERTa)
        roberta_result = self.model_analyzer.predict(text)
        roberta_confidence = roberta_result.get('confidence', 0)
        
        if roberta_confidence >= self.config.get('dl_confidence_threshold', 0.85):
            self.stats['cascade_slow_path'] += 1
            self.stats['layer2_direct_return'] += 1  # Layer 2 统计
            return {
                'sentiment': roberta_result['sentiment'],
                'confidence': roberta_confidence,
                'scores': roberta_result.get('scores', {}),
                'method': 'enhanced_roberta_direct',
                'layer': 2,
                'inference_time_ms': (time.time() - start_time) * 1000,
                'roberta_result': roberta_result,
            }
        
        # Layer 3: 低置信度混合
        final_sentiment, final_confidence = self._fuse_low_confidence(
            lexicon_result, roberta_result
        )
        
        self.stats['cascade_slow_path'] += 1
        self.stats['layer3_fusion'] += 1  # Layer 3 统计
        return {
            'sentiment': final_sentiment,
            'confidence': final_confidence,
            'scores': roberta_result.get('scores', {}),
            'method': 'enhanced_fusion',
            'layer': 3,
            'inference_time_ms': (time.time() - start_time) * 1000,
            'low_confidence_warning': self.config.get('low_confidence_mark', False),
            'lexicon_result': lexicon_result,
            'roberta_result': roberta_result,
        }
    
    def _predict_adaptive(self, text: str) -> Dict[str, Any]:
        """自适应路由：根据文本特征自动选择最优子策略"""
        text_length = len(text)
        
        if text_length <= 15:
            result = self._predict_cascade(text)
            result['sub_strategy'] = 'cascade'
        elif text_length <= 50:
            result = self._predict_enhanced_cascade(text)
            result['sub_strategy'] = 'enhanced_cascade'
        else:
            result = self._predict_weighted(text)
            result['sub_strategy'] = 'weighted'
        
        return result
    
    def _fuse_low_confidence(self, lexicon_result, roberta_result):
        """低置信度结果混合"""
        w_lex = self.config.get('fusion_lexicon_weight', 0.40)
        w_dl = self.config.get('fusion_dl_weight', 0.60)
        
        lex_conf = lexicon_result.get('confidence', 0.5)
        dl_conf = roberta_result.get('confidence', 0.5)
        
        fused_confidence = round(w_lex * lex_conf + w_dl * dl_conf, 4)
        
        if dl_conf > lex_conf:
            final_sentiment = roberta_result['sentiment']
        elif lex_conf > dl_conf:
            final_sentiment = lexicon_result['sentiment']
        else:
            if lexicon_result['sentiment'] == roberta_result['sentiment']:
                final_sentiment = lexicon_result['sentiment']
                fused_confidence = max(lex_conf, dl_conf)
            else:
                final_sentiment = roberta_result['sentiment']
                fused_confidence = round(fused_confidence * 0.9, 4)
        
        return final_sentiment, fused_confidence
    
    def _detect_double_negation(self, text: str, lexicon_result: Dict) -> bool:
        """检测双重否定"""
        # 简单实现：检查是否包含常见双重否定模式
        double_negation_patterns = [
            '不是不', '不能不', '不得不', '不会不',
            '没有不', '非不', '未不',
        ]
        
        for pattern in double_negation_patterns:
            if pattern in text:
                return True
        
        return False
    
    def _detect_domain_specific_words(self, text: str, lexicon_result: Dict) -> bool:
        """检测领域特定词"""
        # 简单实现：检查情感词数量
        sentiment_words = lexicon_result.get('sentiment_words', [])
        return len(sentiment_words) >= 3
    
    def _get_applied_rules(self, text: str, lexicon_result: Dict, roberta_result: Dict) -> list:
        """获取应用的规则列表"""
        rules = []
        
        if (roberta_result['confidence'] < 0.6 and
            lexicon_result['confidence'] > 0.8 and
            abs(lexicon_result['score']) > 3):
            rules.append('low_confidence_correction')
        
        if self._detect_double_negation(text, lexicon_result):
            rules.append('double_negation')
        
        if self._detect_domain_specific_words(text, lexicon_result):
            rules.append('domain_specific')
        
        return rules
    
    def _convert_lexicon_to_scores(self, lexicon_result: Dict) -> Dict[str, float]:
        """将词典结果转换为概率分布"""
        sentiment = lexicon_result['sentiment']
        confidence = lexicon_result['confidence']
        
        # 简单转换：将置信度映射到概率
        if sentiment == '正面':
            return {'正面': 0.5 + confidence * 0.49, '中性': 0.5 - confidence * 0.49, '负面': 0.01}
        elif sentiment == '负面':
            return {'正面': 0.01, '中性': 0.5 - confidence * 0.49, '负面': 0.5 + confidence * 0.49}
        else:
            return {'正面': 0.33, '中性': 0.34, '负面': 0.33}
    
    def batch_predict(self, texts: list) -> list:
        """批量预测"""
        return [self.predict(text) for text in texts]
    
    def get_stats(self) -> Dict[str, Any]:
        """获取统计信息"""
        total = self.stats['total_predictions']
        return {
            **self.stats,
            'fast_path_ratio': self.stats['cascade_fast_path'] / total if total > 0 else 0,
            'layer2_ratio': self.stats['layer2_direct_return'] / total if total > 0 else 0,
            'layer3_ratio': self.stats['layer3_fusion'] / total if total > 0 else 0,
        }
    
    def reset_stats(self):
        """重置统计信息"""
        self.stats = {
            'total_predictions': 0,
            'cascade_fast_path': 0,
            'cascade_slow_path': 0,
            'layer2_direct_return': 0,
            'layer3_fusion': 0,
        }


def test_hybrid_analyzer():
    """测试混合分析器"""
    analyzer = HybridAnalyzer(strategy=HybridStrategy.CASCADE)
    
    test_texts = [
        "这个产品质量很好，物流也很快，非常满意！",  # 简单正面
        "东西很差，不好用，后悔买了",  # 简单负面
        "一般般吧，没什么特别的",  # 中性
        "不是不喜欢，只是有点贵",  # 双重否定
    ]
    
    print("\n" + "=" * 60)
    print("混合模型测试")
    print("=" * 60)
    
    for text in test_texts:
        result = analyzer.predict(text)
        print(f"\n文本：{text}")
        print(f"情感：{result['sentiment']} (置信度：{result['confidence']:.2%})")
        print(f"方法：{result['method']}")
        print(f"耗时：{result['inference_time_ms']:.2f}ms")
    
    print("\n" + "=" * 60)
    print("统计信息:")
    print(analyzer.get_stats())


if __name__ == '__main__':
    test_hybrid_analyzer()
