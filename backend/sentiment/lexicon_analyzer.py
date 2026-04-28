# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
情感词典分析器

"""

import os
import re
import jieba
from typing import Dict, List, Tuple, Set
from functools import lru_cache
from sentiment.logger import get_logger

DICT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'data', 'lexicon')

# 获取日志记录器
logger = get_logger('lexicon_analyzer')


class LexiconAnalyzer:
    """基于情感词典的情感分析器"""
    
    def __init__(self, config: Dict = None):
        """
        初始化情感分析器
        
        Args:
            config: 配置字典，用于控制各优化模块的启用/禁用
                - enable_negation: 是否启用否定词处理 (默认True)
                - enable_degree: 是否启用程度副词加权 (默认True)
                - enable_pattern: 是否启用特殊搭配模式 (默认True)
                - enable_dynamic_threshold: 是否启用动态阈值 (默认True)
        """
        # 配置参数
        self.config = config or {
            'enable_negation': True,
            'enable_degree': True,
            'enable_pattern': True,
            'enable_dynamic_threshold': True,
            'enable_enhanced': False,  # 是否启用增强词典
        }
        
        self.positive_words: Dict[str, int] = {}
        self.negative_words: Dict[str, int] = {}
        self.degree_words: Dict[str, float] = {}
        self.negation_words: List[str] = []
        self.stop_words: Set[str] = set()  # 改为集合，提高查找效率
        self.enhanced_word_count = 0  # 增强词典词数

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
            logger.info(f"加载正面词典: {len(self.positive_words)} 个词")

        if os.path.exists(neg_file):
            with open(neg_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if ',' in line:
                        word, score = line.rsplit(',', 1)
                        self.negative_words[word] = int(float(score))
            logger.info(f"加载负面词典: {len(self.negative_words)} 个词")

        # 加载增强词典（可选）
        if self.config.get('enable_enhanced', False):
            enhanced_pos_file = os.path.join(DICT_DIR, 'enhanced_positive_words.txt')
            enhanced_neg_file = os.path.join(DICT_DIR, 'enhanced_negative_words.txt')

            enhanced_pos_count = 0
            enhanced_neg_count = 0

            if os.path.exists(enhanced_pos_file):
                with open(enhanced_pos_file, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if ',' in line:
                            word, score = line.rsplit(',', 1)
                            if word not in self.positive_words:  # 避免重复覆盖原词分数
                                self.positive_words[word] = int(float(score))
                                enhanced_pos_count += 1

            if os.path.exists(enhanced_neg_file):
                with open(enhanced_neg_file, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if ',' in line:
                            word, score = line.rsplit(',', 1)
                            if word not in self.negative_words:
                                self.negative_words[word] = int(float(score))
                                enhanced_neg_count += 1

            logger.info(f"加载增强词典: +{enhanced_pos_count} 正面词, +{enhanced_neg_count} 负面词")
            self.enhanced_word_count = enhanced_pos_count + enhanced_neg_count
        else:
            self.enhanced_word_count = 0
    
    def _load_degree_words(self):
        """
        加载程度副词词典
        优先从文件加载，文件不存在时使用默认词典
        """
        degree_file = os.path.join(DICT_DIR, 'degree_words.txt')
        
        # 尝试从文件加载
        if os.path.exists(degree_file):
            try:
                with open(degree_file, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if ',' in line:
                            word, weight = line.rsplit(',', 1)
                            try:
                                self.degree_words[word] = float(weight)
                            except ValueError:
                                logger.warning(f"程度副词权重格式错误: {line}")
                                continue
                logger.info(f"从文件加载程度副词词典: {len(self.degree_words)} 个词")
                return
            except Exception as e:
                logger.error(f"加载程度副词文件失败: {e}，使用默认词典")
        
        # 降级：使用默认硬编码词典
        self.degree_words = {
            '极其': 2.0, '最为': 2.0, '最': 2.0,
            '非常': 1.8, '十分': 1.8, '特别': 1.8, '格外': 1.8,
            '很': 1.5, '挺': 1.5, '相当': 1.5, '比较': 1.3,
            '有点': 0.8, '稍微': 0.8, '略微': 0.8, '有些': 0.8,
            '超级': 2.0, '超': 1.8, '太': 1.8, '真': 1.5,
            '实在': 1.5, '确实': 1.5, '真的': 1.5,
        }
        logger.info(f"使用默认程度副词词典: {len(self.degree_words)} 个词")
    
    def _load_negation_words(self):
        """
        加载否定词词典
        从文件加载，文件不存在时使用默认词典
        """
        negation_file = os.path.join(DICT_DIR, 'negation_words.txt')

        if os.path.exists(negation_file):
            try:
                with open(negation_file, 'r', encoding='utf-8') as f:
                    for line in f:
                        word = line.strip()
                        if word and word not in self.negation_words:
                            self.negation_words.append(word)
                logger.info(f"从文件加载否定词词典: {len(self.negation_words)} 个词")
                return
            except Exception as e:
                logger.error(f"加载否定词文件失败: {e}，使用默认词典")

        self.negation_words = [
            '不', '没', '无', '非', '莫', '勿', '未', '别', '甭',
            '没有', '不是', '不会', '不能', '不要', '不好',
            '没什么', '不算', '不再', '不曾', '不怎',
        ]
        logger.info(f"使用默认否定词词典: {len(self.negation_words)} 个词")
    
    def _load_stop_words(self):
        """加载停用词词典"""
        # 注意：否定词、程度副词、情感词不能放在停用词中，否则会影响情感分析
        self.stop_words = {
            '的', '了', '是', '在', '我', '有', '和', '就',
            '人', '都', '一', '一个', '上', '也',
            '到', '说', '要', '去', '你', '会', '着',
            '看', '自己', '这', '那', '里', '来', '他',
            '她', '它', '们', '这个', '那个', '什么',
        }
    
    def _add_custom_words(self):
        """添加自定义词到jieba词典"""
        custom_words = list(self.positive_words.keys()) + list(self.negative_words.keys())
        for word in custom_words:
            jieba.add_word(word)
    
    def segment(self, text: str) -> List[str]:
        """
        分词并过滤停用词
        
        Args:
            text: 输入文本
            
        Returns:
            分词后的词列表（已过滤停用词）
        """
        words = jieba.lcut(text)
        # 使用集合查找，O(1) 时间复杂度
        return [w for w in words if w.strip() and w not in self.stop_words]
    
    def analyze(self, text: str) -> Dict:
        """
        分析文本情感（带缓存）
        
        Args:
            text: 输入文本
            
        Returns:
            分析结果字典
        """
        # 使用缓存机制
        return self._analyze_cached(text)
    
    def _count_negations_in_window(self, words: List[str], current_idx: int) -> int:
        """
        统计当前词前3个词中的否定词数量
        支持双重否定处理（偶数个否定词相互抵消）

        Args:
            words: 分词后的词列表
            current_idx: 当前词的索引

        Returns:
            否定词数量
        """
        # 如果禁用否定词处理，直接返回0
        if not self.config.get('enable_negation', True):
            return 0
        
        negation_count = 0

        for offset in [1, 2, 3]:
            idx = current_idx - offset
            if idx < 0:
                continue

            prev_word = words[idx]

            if prev_word in self.negation_words:
                negation_count += 1
                continue

            for neg_word in self.negation_words:
                if len(neg_word) == 1 and neg_word in prev_word:
                    if prev_word not in ['不错', '不是', '没什么']:
                        if prev_word.endswith(neg_word):
                            negation_count += 1
                            break

        return negation_count

    def _check_degree_in_window(self, words: List[str], current_idx: int) -> float:
        """
        检查当前词的前3个词中是否包含程度副词

        Args:
            words: 分词后的词列表
            current_idx: 当前词的索引

        Returns:
            程度权重，默认1.0
        """
        # 如果禁用程度副词处理，直接返回1.0（无加权）
        if not self.config.get('enable_degree', True):
            return 1.0
        
        for offset in [1, 2, 3]:
            idx = current_idx - offset
            if idx < 0:
                continue

            prev_word = words[idx]

            if prev_word in self.degree_words:
                return self.degree_words[prev_word]

        return 1.0
    
    def _check_special_patterns(self, words: List[str], current_idx: int, word: str) -> float:
        """
        检查特殊搭配模式
        处理如"不后悔"、"没有惊喜"、"没发现问题"等特殊表达
        
        Args:
            words: 分词后的词列表
            current_idx: 当前词的索引
            word: 当前词
            
        Returns:
            修正后的修饰符，如果没有特殊模式则返回None
        """
        # 如果禁用特殊搭配模式处理，直接返回None
        if not self.config.get('enable_pattern', True):
            return None
        
        # 检查后面的词（处理"太+情感词+了"结构）
        if current_idx < len(words) - 1:
            next_word = words[current_idx + 1]
            # 处理"太+情感词+了"结构
            if next_word == '了':
                # 检查前面是否有程度副词"太"
                if current_idx > 0:
                    prev_word = words[current_idx - 1]
                    if prev_word == '太':
                        # "太棒了"、"太好了"等 - 强烈正面
                        if word in self.positive_words:
                            return 2.5
                        # "太烂了"、"太差了"等 - 强烈负面
                        elif word in self.negative_words:
                            return 2.5
        
        # 检查前面的词
        if current_idx > 0:
            prev_word = words[current_idx - 1]
            
            # 处理"太" + 情感词（没有"了"结尾的情况）
            if prev_word == '太':
                if word in self.positive_words:
                    return 2.0  # 强烈正面
                elif word in self.negative_words:
                    return 2.0  # 强烈负面
            
            # 处理"没有/没什么/不太" + 正面词 -> 负面或中性
            if word in self.positive_words and prev_word in ['没有', '没', '没什么', '不太', '不怎么']:
                # 如果是"没有惊喜"、"没什么特别"等，应该降低正面程度或转为负面
                if word in ['惊喜', '特别', '出色', '优秀', '满意']:
                    return -0.5  # 转为轻微负面
            
            # 处理"没/没有" + "发现" + "问题" -> 应该为中性/正面，不是负面
            if word == '问题' and prev_word in ['发现', '找到']:
                if current_idx > 1 and words[current_idx - 2] in ['没', '没有', '未发现']:
                    return 0.0  # 中性化，不计算得分
            
            # 处理"不" + 负面词，但这个词实际上在表达负面意思
            # 例如"用起来很不方便" -> "不方便"应该更负面
            if word in self.negative_words and prev_word == '不':
                # 检查是否是"很/非常/特别" + "不" + 负面词的结构
                if current_idx > 1 and words[current_idx - 2] in ['很', '非常', '特别', '十分']:
                    return 1.5  # 加强负面程度
            
            # 处理"不怕/不担心" + 负面词 -> 应该为正面
            if word in self.negative_words and prev_word in ['不怕', '不担心', '无惧']:
                return 0.5  # 轻微正面（负面被否定）
            
            # 处理"特别/非常" + 正面词 -> 应该是加强正面，不是否定
            # 修复"特别快"被错误处理的问题
            if word in self.positive_words and prev_word in ['特别', '非常', '十分']:
                # 检查再前面是否有否定词
                if current_idx > 1 and words[current_idx - 2] in ['没有', '没', '没什么', '不太']:
                    return -0.5  # 只有前面有否定时才转为负面
                else:
                    return 1.8  # 加强正面程度
        
        # 检查"没有特别惊喜"这种模式
        if current_idx >= 2:
            prev_word = words[current_idx - 1]
            prev_prev_word = words[current_idx - 2]
            
            if word in ['惊喜', '出色', '优秀', '快', '好']:
                if prev_word in ['特别', '很', '非常'] and prev_prev_word in ['没有', '没', '没什么']:
                    return -0.3  # 轻微负面
            
            # 处理"冬天/夏天" + "不怕" + "冷/热" -> 正面
            if word in ['冷', '热'] and prev_word in ['不怕', '不担心']:
                return 0.5  # 轻微正面
        
        return None
    
    @lru_cache(maxsize=1000)
    def _analyze_cached(self, text: str) -> Dict:
        """
        带缓存的情感分析核心方法

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

            # 先检查特殊搭配模式
            special_modifier = self._check_special_patterns(words, i, word)
            if special_modifier is not None:
                modifier = special_modifier
            else:
                # 正常处理否定词
                negation_count = self._count_negations_in_window(words, i)
                if negation_count % 2 == 1:
                    modifier *= -1

                # 处理程度副词
                degree_modifier = self._check_degree_in_window(words, i)
                if degree_modifier != 1.0:
                    modifier *= degree_modifier

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

        sentiment = self._classify_sentiment(total_score, len(words), word_scores)
        confidence = self._calculate_confidence(total_score, word_scores, len(words))

        return {
            'sentiment': sentiment,
            'score': total_score,
            'confidence': confidence,
            'word_count': len(words),
            'sentiment_words': word_scores,
            'positive_count': len([w for w in word_scores if w['final_score'] > 0]),
            'negative_count': len([w for w in word_scores if w['final_score'] < 0]),
        }
    
    def _classify_sentiment(self, score: float, word_count: int, word_scores: List[Dict] = None) -> str:
        """
        根据得分和文本长度动态分类情感
        
        优化策略：
        1. 根据文本长度设置不同阈值
        2. 考虑情感词数量和强度
        3. 对于弱情感信号倾向于中性

        Args:
            score: 情感得分
            word_count: 文本词数
            word_scores: 情感词得分列表（可选）

        Returns:
            情感分类（正面/负面/中性）
        """
        # 如果禁用动态阈值，使用固定阈值
        if not self.config.get('enable_dynamic_threshold', True):
            threshold = 1.0
            if abs(score) <= threshold * 0.5:
                return '中性'
            elif score > threshold:
                return '正面'
            elif score < -threshold:
                return '负面'
            else:
                return '中性'
        
        # 计算情感词数量
        sentiment_word_count = len(word_scores) if word_scores else 0
        
        # 根据文本长度和情感词数量动态调整阈值
        if word_count < 10:
            base_threshold = 0.5
        elif word_count < 20:
            base_threshold = 1.0
        else:
            base_threshold = 1.5
        
        # 如果情感词很少，提高阈值（倾向于中性）
        if sentiment_word_count == 0:
            threshold = base_threshold * 2
        elif sentiment_word_count == 1:
            threshold = base_threshold * 1.5
        elif sentiment_word_count <= 2:
            threshold = base_threshold * 1.2
        else:
            threshold = base_threshold
        
        # 对于绝对值较小的分数，倾向于中性
        if abs(score) <= threshold * 0.5:
            return '中性'
        elif score > threshold:
            return '正面'
        elif score < -threshold:
            return '负面'
        else:
            return '中性'
    
    def _calculate_sentiment_ratio(self, word_scores: List[Dict], total_words: int) -> float:
        """
        计算情感词占比
        
        Args:
            word_scores: 情感词得分列表
            total_words: 总词数
            
        Returns:
            情感词占比（0-1之间）
        """
        if total_words == 0:
            return 0.0
        return len(word_scores) / total_words
    
    def _calculate_consistency(self, word_scores: List[Dict]) -> float:
        """
        计算情感一致性
        正面词和负面词的比例一致性，值越接近1表示一致性越高
        
        Args:
            word_scores: 情感词得分列表
            
        Returns:
            情感一致性（0-1之间）
        """
        if not word_scores:
            return 0.5
        
        positive_count = len([w for w in word_scores if w['final_score'] > 0])
        negative_count = len([w for w in word_scores if w['final_score'] < 0])
        total = positive_count + negative_count
        
        if total == 0:
            return 0.5
        
        # 计算一致性：如果只有正面或只有负面，一致性为1；如果正负各半，一致性为0
        ratio = abs(positive_count - negative_count) / total
        return ratio
    
    def _calculate_confidence(self, score: float, word_scores: List[Dict], total_words: int) -> float:
        """
        计算置信度（综合多因素）
        
        综合考虑：
        1. 情感词占比（权重0.3）
        2. 情感一致性（权重0.3）
        3. 平均情感强度（权重0.4）
        
        Args:
            score: 总情感得分
            word_scores: 情感词得分列表
            total_words: 总词数
            
        Returns:
            置信度（0.3-0.99之间）
        """
        if not word_scores:
            return 0.3
        
        # 1. 计算情感词占比
        sentiment_ratio = self._calculate_sentiment_ratio(word_scores, total_words)
        
        # 2. 计算情感一致性
        consistency = self._calculate_consistency(word_scores)
        
        # 3. 计算平均情感强度
        abs_scores = [abs(w['final_score']) for w in word_scores]
        avg_score = sum(abs_scores) / len(abs_scores)
        intensity = min(avg_score * 0.2, 1.0)
        
        # 综合计算置信度
        confidence = 0.3 * sentiment_ratio + 0.3 * consistency + 0.4 * intensity
        
        # 映射到 0.3-0.99 范围
        confidence = 0.3 + confidence * 0.69
        
        return round(min(confidence, 0.99), 4)
    
    def reload(self):
        """重新加载所有词典并清除缓存"""
        # 清除缓存
        self._analyze_cached.cache_clear()
        logger.info("已清除分析缓存")
        
        # 清空词典
        self.positive_words.clear()
        self.negative_words.clear()
        self.degree_words.clear()
        self.negation_words.clear()
        self.stop_words.clear()
        self.enhanced_word_count = 0
        
        # 重新加载
        self._load_dictionaries()
        logger.info("词典已重新加载")
    
    def get_cache_info(self) -> Dict:
        """
        获取缓存信息

        Returns:
            缓存统计信息
        """
        info = self._analyze_cached.cache_info()
        return {
            'hits': info.hits,
            'misses': info.misses,
            'maxsize': info.maxsize,
            'currsize': info.currsize,
        }

    def is_enhanced_enabled(self) -> bool:
        """查询增强词典是否启用"""
        return self.config.get('enable_enhanced', False)

    def get_enhanced_count(self) -> int:
        """获取增强词典词数"""
        return self.enhanced_word_count


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
    
    # 测试缓存
    print("\n" + "=" * 60)
    print("缓存信息:")
    print(analyzer.get_cache_info())


if __name__ == '__main__':
    test_analyzer()
