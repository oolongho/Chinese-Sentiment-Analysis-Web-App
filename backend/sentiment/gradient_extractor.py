# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
基于梯度显著性的领域词提取器

从训练数据集中利用 RoBERTa 模型的梯度信息自动提取候选情感词。
优化：使用 jieba 分词对齐，避免单字碎片，合并同词内高梯度字为完整候选词。
"""

import os
import json
import torch
import logging
from typing import Dict, List, Set, Optional, Any, Tuple
from transformers import AutoModelForSequenceClassification, AutoTokenizer
from torch.nn import CrossEntropyLoss
from tqdm import tqdm

logger = logging.getLogger(__name__)

# 内置中文停用词集合
STOPWORDS: Set[str] = {
    '的', '了', '是', '在', '有', '和', '这', '那', '我', '你', '他', '她', '它',
    '们', '个', '很', '都', '也', '就', '但', '还', '到', '把', '被', '让', '给',
    '用', '对', '从', '等', '会', '能', '可以', '要', '不', '没', '什么', '怎么',
    '如何', '为什么', '哪', '哪个', '几', '多', '少', '一个', '一些', '这个', '那个',
    '这样', '那样', '如果', '因为', '所以', '虽然', '但是', '或者', '而且', '以及',
    '等等', '之', '其', '于', '与', '或', '而', '以', '及', '为', '了', '着', '过',
    '呢', '吗', '吧', '啊', '哦', '嗯', '哈', '呵', '嘛', '罢', '罢了', '而已',
    '的话', '来说', '一般', '一定', '可能', '应该', '必须', '需要', '能够', '将',
    '由', '比', '像', '向', '往', '朝', '沿着', '按照', '根据', '通过', '经过',
    '关于', '对于', '至于', '由于', '除了', '除非', '无论', '不管', '尽管', '哪怕',
    '即使', '即便', '假如', '假使', '只有', '是否', '不论',
}

# 特殊标记集合
SPECIAL_TOKENS: Set[str] = {'[CLS]', '[SEP]', '[PAD]', '', '<s>', '</s>', '<unk>', '<pad>'}

# 允许保留的 jieba 词性标签（可能携带情感色彩的词性）
ALLOWED_POS_TAGS: Set[str] = {
    'a',    # 形容词 — 主要目标：好、差、棒、烂
    'ad',   # 副形词
    'an',   # 名形词
    'b',    # 区别词 — 伪、冒牌、野生
    'd',    # 副词 — 超级、极其、太（修饰情感）
    'v',    # 动词 — 推荐、吐槽、踩雷
    'vd',   # 副动词
    'vn',   # 名动词
    'z',    # 状态词 — 不错、牛、给力
    'zg',   # 其他状态词
}

# 默认配置参数
DEFAULT_CONFIG = {
    'min_word_freq': 5,
    'max_candidates': 500,
    'top_k_per_sample': 10,
    'polarity_threshold_pos': 0.7,
    'polarity_threshold_neg': 0.3,
    'min_word_length': 2,
}


class GradientExtractor:
    """基于梯度显著性的领域词提取器"""

    def __init__(
        self,
        model: AutoModelForSequenceClassification,
        tokenizer: AutoTokenizer,
        config: Optional[Dict[str, Any]] = None,
    ):
        self.model = model
        self.tokenizer = tokenizer
        self.config = {**DEFAULT_CONFIG, **(config or {})}
        self.candidate_pool: Dict[str, Dict[str, Any]] = {}
        self.existing_words_set: Set[str] = set()
        self._load_existing_dictionary()

    def _load_existing_dictionary(self) -> None:
        DICT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'data', 'lexicon')

        dict_files = ['positive_words.txt', 'negative_words.txt']
        for filename in dict_files:
            filepath = os.path.join(DICT_DIR, filename)
            if os.path.exists(filepath):
                with open(filepath, 'r', encoding='utf-8') as f:
                    for line in f:
                        word = line.strip()
                        if word and ',' in word:
                            word = word.split(',')[0]
                        if word:
                            self.existing_words_set.add(word)

        for filename in ['enhanced_positive_words.txt', 'enhanced_negative_words.txt']:
            filepath = os.path.join(DICT_DIR, filename)
            if os.path.exists(filepath):
                with open(filepath, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if line and ',' in line:
                            word = line.split(',')[0]
                            if word:
                                self.existing_words_set.add(word)

        logger.info(f"已加载已有词典（含增强词典），共 {len(self.existing_words_set)} 个词")

    def _build_char_to_word_map(self, text: str) -> Tuple[Dict[int, str], Dict[int, str]]:
        """用 jieba.posseg 分词构建 token 位置 → (完整词, 词性) 的映射
        
        返回: (char_to_word, char_to_pos)
            char_to_word: {token_pos_in_text: jieba_word}
            char_to_pos:   {token_pos_in_text: jieba_pos_tag}
        例如 "制冷效果很好" → 
            ({0: '制冷效果', 1: '制冷效果', 2: '制冷效果', 3: '很好'},
             {0: 'n', 1: 'n', 2: 'n', 3: 'a'})
        """
        import jieba.posseg as pseg
        words = pseg.lcut(text)
        char_to_word = {}
        char_to_pos = {}
        
        current_text_pos = 0
        for word, flag in words:
            word_start = text.find(word, current_text_pos)
            if word_start == -1:
                continue
            word_end = word_start + len(word)
            for i in range(word_start, word_end):
                char_to_word[i] = word
                char_to_pos[i] = flag
            current_text_pos = word_end
        
        return char_to_word, char_to_pos

    def prepare(self, dataset) -> int:
        """准备阶段：加载历史候选词 + 拆分数据，返回总批次数"""
        self._load_or_merge_candidates()
        self._texts = [item['text'] for item in dataset]
        self._labels = [item['label'] for item in dataset]

        batch_size = self.config.get('batch_size', 16)
        self._total_batches = (len(self._texts) + batch_size - 1) // batch_size
        self._current_batch = 0
        return self._total_batches

    def process_next_batch(self) -> Optional[int]:
        """处理下一个批次，返回当前批次号（1-indexed），处理完返回 None"""
        if self._current_batch >= self._total_batches:
            return None

        i = self._current_batch
        batch_size = self.config.get('batch_size', 16)
        start_idx = i * batch_size
        end_idx = min(start_idx + batch_size, len(self._texts))
        batch_texts = self._texts[start_idx:end_idx]
        batch_labels = self._labels[start_idx:end_idx]

        input_ids_list, grad_norms_list = self._process_batch(batch_texts, batch_labels)
        self._update_candidate_pool(batch_texts, input_ids_list, grad_norms_list, batch_labels)

        del input_ids_list, grad_norms_list
        torch.cuda.empty_cache() if torch.cuda.is_available() else None

        self._current_batch += 1
        return self._current_batch

    def finalize(self) -> List[Dict[str, Any]]:
        """收尾阶段：聚合排序 + 返回最终候选词列表"""
        result = self._aggregate_and_rank()
        self._texts = []
        self._labels = []
        return result

    def extract_from_dataset(self, dataset, progress_callback=None) -> List[Dict[str, Any]]:
        """批量提取入口（兼容旧接口，一次性跑完）"""
        total = self.prepare(dataset)
        for _ in range(total):
            self.process_next_batch()
        return self.finalize()

    def _process_batch(
        self, texts: List[str], labels: List[int]
    ) -> Tuple[List[torch.Tensor], List[torch.Tensor]]:
        """对单个批次执行前向/反向传播，返回 input_ids 和梯度范数"""
        self.model.eval()
        encoded = self.tokenizer(
            texts,
            padding=True,
            truncation=True,
            max_length=128,
            return_tensors="pt",
        )
        input_ids = encoded['input_ids']
        attention_mask = encoded['attention_mask']

        device = next(self.model.parameters()).device
        input_ids = input_ids.to(device)
        attention_mask = attention_mask.to(device)

        embeddings = self.model.get_input_embeddings()(input_ids)
        embeddings = embeddings.detach().requires_grad_(True)

        outputs = self.model(inputs_embeds=embeddings, attention_mask=attention_mask)
        logits = outputs.logits

        labels_tensor = torch.tensor(labels, dtype=torch.long, device=device)
        loss_fn = CrossEntropyLoss()
        loss = loss_fn(logits, labels_tensor)

        self.model.zero_grad()
        loss.backward()

        grad_norms = embeddings.grad.norm(dim=-1)

        input_ids_cpu = input_ids.cpu()
        grad_norms_cpu = grad_norms.cpu()

        return input_ids_cpu, grad_norms_cpu

    def _update_candidate_pool(
        self,
        texts: List[str],
        input_ids_list: List[torch.Tensor],
        grad_norms_list: List[torch.Tensor],
        labels: List[int],
    ) -> None:
        """更新候选词池：累加重要性、频次、极性统计（jieba 对齐版本）"""
        top_k = self.config['top_k_per_sample']
        min_len = self.config.get('min_word_length', 2)

        for sample_idx, (text, input_ids, grad_norms, label) in enumerate(
            zip(texts, input_ids_list, grad_norms_list, labels)
        ):
            seq_len = input_ids.size(0)
            
            # 构建 jieba 字→词映射（含词性）
            char_to_word_map, char_to_pos_map = self._build_char_to_word_map(text)
            
            # 收集 (aligned_word, importance) 用于按词聚合
            word_importances: Dict[str, float] = {}
            
            token_grads = []
            for pos in range(seq_len):
                token_id = input_ids[pos].item()
                token_str = self.tokenizer.decode([token_id]).strip()

                if token_str in SPECIAL_TOKENS or token_str in STOPWORDS or not token_str:
                    continue
                if token_str in self.existing_words_set:
                    continue

                norm_val = grad_norms[pos].item()
                
                # 查找该 token 在原文中的位置对应的 jieba 词和词性
                aligned_word = char_to_word_map.get(pos)
                aligned_pos = char_to_pos_map.get(pos)
                if not aligned_word:
                    continue
                
                # 检查 jieba 词长度是否满足最小要求
                if len(aligned_word) < min_len:
                    continue
                
                # 检查词性是否在允许列表中（过滤纯名词等无情感色彩的词性）
                if aligned_pos and aligned_pos not in ALLOWED_POS_TAGS:
                    continue
                
                # 累加到该词的重要性（取最大值）
                if aligned_word not in word_importances or norm_val > word_importances[aligned_word]:
                    word_importances[aligned_word] = norm_val
            
            # 取 top-k 个词
            sorted_words = sorted(word_importances.items(), key=lambda x: x[1], reverse=True)[:top_k]
            
            for aligned_word, importance in sorted_words:
                if aligned_word not in self.candidate_pool:
                    self.candidate_pool[aligned_word] = {
                        'word': aligned_word,
                        'importance': 0.0,
                        'frequency': 0,
                        'pos_count': 0,
                        'neg_count': 0,
                        'sample_contexts': [],
                        'extraction_count': 0,
                    }

                entry = self.candidate_pool[aligned_word]
                entry['importance'] += importance
                entry['frequency'] += 1
                if label == 1:
                    entry['pos_count'] += 1
                else:
                    entry['neg_count'] += 1

                context_entry = {'text': text, 'label': label}
                contexts = entry['sample_contexts']
                if len(contexts) < 3:
                    contexts.append(context_entry)
                else:
                    contexts[-1] = context_entry

    def _load_or_merge_candidates(self) -> None:
        """若 candidates.json 已存在则读取作为基础池"""
        DICT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'data', 'lexicon')

        candidates_path = os.path.join(DICT_DIR, 'candidates.json')
        if os.path.exists(candidates_path):
            try:
                with open(candidates_path, 'r', encoding='utf-8') as f:
                    raw_data = json.load(f)

                if isinstance(raw_data, dict) and 'candidates' in raw_data:
                    existing_candidates = raw_data['candidates']
                elif isinstance(raw_data, list):
                    existing_candidates = raw_data
                else:
                    logger.warning(f"candidates.json 格式异常，将新建")
                    return

                if not isinstance(existing_candidates, list):
                    logger.warning(f"candidates 列表类型异常，将新建")
                    return

                for item in existing_candidates:
                    if not isinstance(item, dict) or 'word' not in item:
                        continue
                    word = item['word']
                    status = item.get('status', 'pending_review')
                    if status != 'pending_review':
                        continue
                    if word in self.existing_words_set:
                        continue
                    if word not in self.candidate_pool:
                        self.candidate_pool[word] = {
                            'word': word,
                            'importance': item.get('avg_importance', 0.0) * item.get('frequency', 0),
                            'frequency': item.get('frequency', 0),
                            'pos_count': int(item.get('pos_ratio', 0.5) * item.get('frequency', 0)),
                            'neg_count': int((1 - item.get('pos_ratio', 0.5)) * item.get('frequency', 0)),
                            'sample_contexts': item.get('sample_contexts', []),
                            'extraction_count': item.get('extraction_count', 1),
                        }
                    else:
                        existing = self.candidate_pool[word]
                        existing['importance'] += item.get('avg_importance', 0.0) * item.get('frequency', 0)
                        existing['frequency'] += item.get('frequency', 0)
                        existing['extraction_count'] = existing.get('extraction_count', 0) + item.get('extraction_count', 1)

                        new_contexts = item.get('sample_contexts', [])
                        merged_contexts = existing['sample_contexts'].copy()
                        for ctx in new_contexts:
                            ctx_key = json.dumps(ctx, ensure_ascii=False)
                            if not any(json.dumps(c, ensure_ascii=False) == ctx_key for c in merged_contexts):
                                merged_contexts.append(ctx)
                        existing['sample_contexts'] = merged_contexts[-3:]

                logger.info(f"已合并历史候选词池，共 {len(existing_candidates)} 条记录")
            except (json.JSONDecodeError, IOError) as e:
                logger.warning(f"读取已有 candidates.json 失败，将新建: {e}")

    def _aggregate_and_rank(self) -> List[Dict[str, Any]]:
        """过滤低频词/短词、判定极性、计算综合得分并排序"""
        min_freq = self.config['min_word_freq']
        threshold_pos = self.config['polarity_threshold_pos']
        threshold_neg = self.config['polarity_threshold_neg']
        max_candidates = self.config['max_candidates']
        min_len = self.config.get('min_word_length', 2)

        results = []
        for word, data in self.candidate_pool.items():
            freq = data['frequency']
            
            # 过滤：最小词长
            if len(word) < min_len:
                continue
            # 过滤：最低频次
            if freq < min_freq:
                continue

            total_polar = data['pos_count'] + data['neg_count']
            pos_ratio = data['pos_count'] / total_polar if total_polar > 0 else 0.5

            if pos_ratio >= threshold_pos:
                polarity = 'positive'
            elif pos_ratio <= threshold_neg:
                polarity = 'negative'
            else:
                continue

            avg_importance = data['importance'] / freq if freq > 0 else 0.0
            polarity_strength = abs(pos_ratio - 0.5) * 2

            w1, w2, w3 = 0.4, 0.3, 0.3
            score = (
                w1 * avg_importance +
                w2 * freq +
                w3 * polarity_strength * 100
            )

            extraction_count = data.get('extraction_count', 0) + 1

            results.append({
                'word': word,
                'polarity': polarity,
                'avg_importance': round(avg_importance, 6),
                'frequency': freq,
                'pos_ratio': round(pos_ratio, 4),
                'score': round(score, 4),
                'status': 'pending_review',
                'sample_contexts': data['sample_contexts'],
                'extraction_count': extraction_count,
            })

        results.sort(key=lambda x: (-x['extraction_count'], -x['frequency'], -x['score']))
        return results[:max_candidates]

    def export_candidates(self, output_path: Optional[str] = None) -> str:
        """将排序后的候选词写入 JSON 文件"""
        DICT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'data', 'lexicon')

        if output_path is None:
            output_path = os.path.join(DICT_DIR, 'candidates.json')

        ranked = self._aggregate_and_rank()
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(ranked, f, ensure_ascii=False, indent=2)

        logger.info(f"已导出 {len(ranked)} 个候选词至 {output_path}")
        return output_path
