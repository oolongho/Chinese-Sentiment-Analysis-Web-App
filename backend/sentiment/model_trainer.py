# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
深度学习模型训练脚本
功能：
1. 加载标注数据
2. 准备训练数据集
3. 微调 chinese-roberta-wwm-ext 模型
4. 评估和保存模型
"""

import os
os.environ['HF_ENDPOINT'] = 'https://hf-mirror.com'

import torch
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, classification_report
from torch.utils.data import Dataset, DataLoader
from transformers import (
    AutoTokenizer, 
    AutoModelForSequenceClassification,
    TrainingArguments,
    Trainer,
    EarlyStoppingCallback,
    TrainerCallback
)
from typing import Dict, List, Tuple, Callable, Optional

try:
    from accelerate import Accelerator
    Accelerator._reset_state()
except ImportError:
    pass
except Exception as e:
    import logging
    logging.getLogger(__name__).warning(f"Failed to reset Accelerator state: {e}")

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'data')
MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'models')

LABEL_MAP = {'负面': 0, '中性': 1, '正面': 2}
ID_TO_LABEL = {0: '负面', 1: '中性', 2: '正面'}


class ProgressCallback:
    """训练进度回调处理器"""
    
    def __init__(self, callback: Callable = None, total_epochs: int = 3):
        self.callback = callback
        self.total_epochs = total_epochs
        self.current_epoch = 0
    
    def on_epoch_end(self, epoch: int, metrics: Dict = None):
        self.current_epoch = epoch
        if self.callback:
            self.callback(epoch, self.total_epochs, metrics, f'完成第 {epoch}/{self.total_epochs} 轮训练')


class SentimentDataset(Dataset):
    """情感分析数据集"""
    
    def __init__(self, texts: List[str], labels: List[int], tokenizer, max_length: int = 128):
        self.texts = texts
        self.labels = labels
        self.tokenizer = tokenizer
        self.max_length = max_length
    
    def __len__(self):
        return len(self.texts)
    
    def __getitem__(self, idx):
        text = str(self.texts[idx])
        label = self.labels[idx]
        
        encoding = self.tokenizer(
            text,
            add_special_tokens=True,
            max_length=self.max_length,
            padding='max_length',
            truncation=True,
            return_tensors='pt'
        )
        
        return {
            'input_ids': encoding['input_ids'].flatten(),
            'attention_mask': encoding['attention_mask'].flatten(),
            'labels': torch.tensor(label, dtype=torch.long)
        }


def load_data(data_file: str = None) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """加载训练数据和测试数据"""
    if data_file and os.path.exists(data_file):
        train_file = data_file
    else:
        train_file = os.path.join(DATA_DIR, 'labeled_data.xlsx')
    test_file = os.path.join(DATA_DIR, 'test_data.xlsx')
    
    train_df = pd.read_excel(train_file)
    test_df = pd.read_excel(test_file) if os.path.exists(test_file) else pd.DataFrame()
    
    print(f"加载训练数据: {len(train_df)} 条")
    if len(test_df) > 0:
        print(f"加载测试数据: {len(test_df)} 条")
    
    return train_df, test_df


def prepare_datasets(train_df: pd.DataFrame, tokenizer, val_split: float = 0.1, max_length: int = 128):
    """准备训练和验证数据集"""
    train_df = train_df.dropna(subset=['标签'])
    
    texts = train_df['文本'].tolist()
    labels = [LABEL_MAP[label] for label in train_df['标签'].tolist()]
    
    train_texts, val_texts, train_labels, val_labels = train_test_split(
        texts, labels, test_size=val_split, random_state=42, stratify=labels
    )
    
    print(f"\n数据划分:")
    print(f"  训练集: {len(train_texts)} 条")
    print(f"  验证集: {len(val_texts)} 条")
    print(f"  标签分布: {dict(zip(*np.unique(train_labels, return_counts=True)))}")
    
    train_dataset = SentimentDataset(train_texts, train_labels, tokenizer, max_length)
    val_dataset = SentimentDataset(val_texts, val_labels, tokenizer, max_length)
    
    return train_dataset, val_dataset


def compute_metrics(pred):
    """计算评估指标"""
    labels = pred.label_ids
    preds = pred.predictions.argmax(-1)
    
    precision, recall, f1, _ = precision_recall_fscore_support(labels, preds, average='weighted')
    acc = accuracy_score(labels, preds)
    
    return {
        'accuracy': acc,
        'f1': f1,
        'precision': precision,
        'recall': recall
    }


def _get_model_path(model_name: str = 'hfl/chinese-roberta-wwm-ext') -> str:
    """
    获取模型路径，优先使用本地模型
    
    检查顺序：
    1. 本地预训练模型目录 (models/pretrained/)
    2. 本地已下载的 HuggingFace 缓存
    3. 在线下载 (使用镜像源)
    """
    # 1. 检查本地预训练模型目录
    local_pretrained = os.path.join(MODEL_DIR, 'pretrained', 'roberta')
    if os.path.exists(local_pretrained) and os.path.exists(os.path.join(local_pretrained, 'config.json')):
        print(f"找到本地预训练模型: {local_pretrained}")
        return local_pretrained
    
    # 2. 检查 HuggingFace 本地缓存
    # 兼容新旧版本的 transformers
    cache_dir = None
    try:
        # 尝试新版本方式
        from transformers.utils import HF_HOME
        cache_dir = os.path.join(HF_HOME, 'hub') if HF_HOME else None
    except ImportError:
        pass
    
    if cache_dir is None:
        try:
            # 尝试旧版本方式
            from transformers.utils import TRANSFORMERS_CACHE
            cache_dir = TRANSFORMERS_CACHE
        except ImportError:
            # 使用默认缓存路径
            cache_dir = os.path.expanduser('~/.cache/huggingface/hub')
    
    model_cache_name = model_name.replace('/', '--')
    cache_path = os.path.join(cache_dir, f'models--{model_cache_name}')
    
    if os.path.exists(cache_path):
        # 查找快照目录中的实际模型文件
        for root, dirs, files in os.walk(cache_path):
            if 'config.json' in files:
                print(f"找到 HuggingFace 缓存模型: {root}")
                return root
    
    # 3. 使用在线模型（通过镜像源下载）
    print(f"本地模型不存在，将使用在线模型: {model_name}")
    return model_name


def _train_model_core(
    model_name: str = 'hfl/chinese-roberta-wwm-ext',
    output_dir: str = None,
    num_epochs: int = 3,
    batch_size: int = 16,
    learning_rate: float = 2e-5,
    max_length: int = 128,
    data_file: str = None,
    progress_callback: Callable = None
) -> Tuple[Trainer, AutoTokenizer, Dict]:
    """核心训练函数，封装所有训练逻辑"""
    
    try:
        from accelerate import Accelerator, PartialState
        PartialState._reset_state()
        Accelerator._reset_state()
    except ImportError:
        pass
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Failed to reset Accelerator state: {e}")
    
    print("=" * 60)
    print("开始训练深度学习模型")
    print("=" * 60)
    
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"\n使用设备: {device}")
    if device == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")
        print(f"显存: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")
    
    if output_dir is None:
        output_dir = os.path.join(MODEL_DIR, 'roberta_finetuned')
    os.makedirs(output_dir, exist_ok=True)
    
    # 获取模型路径（优先本地）
    model_path = _get_model_path(model_name)
    print(f"\n加载预训练模型: {model_path}")
    
    try:
        tokenizer = AutoTokenizer.from_pretrained(model_path)
        model = AutoModelForSequenceClassification.from_pretrained(
            model_path,
            num_labels=3,
            id2label=ID_TO_LABEL,
            label2id=LABEL_MAP,
            use_safetensors=False
        )
    except Exception as e:
        print(f"加载本地模型失败: {e}")
        print(f"尝试从 HuggingFace 下载: {model_name}")
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModelForSequenceClassification.from_pretrained(
            model_name,
            num_labels=3,
            id2label=ID_TO_LABEL,
            label2id=LABEL_MAP,
            use_safetensors=False
        )
    
    train_df, test_df = load_data(data_file)
    train_dataset, val_dataset = prepare_datasets(train_df, tokenizer, max_length=max_length)
    
    callbacks = [EarlyStoppingCallback(early_stopping_patience=2)]
    
    if progress_callback:
        progress_handler = ProgressCallback(progress_callback, num_epochs)
        
        class EpochEndCallback(TrainerCallback):
            def __init__(self, handler, total_epochs):
                self.handler = handler
                self.total_epochs = total_epochs
            
            def on_evaluate(self, args, state, control, metrics, **kwargs):
                epoch = int(state.epoch) if state.epoch else 0
                self.handler.on_epoch_end(epoch, metrics)
        
        callbacks.append(EpochEndCallback(progress_handler, num_epochs))
        progress_callback(0, num_epochs, {}, '正在初始化训练...')
    
    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=num_epochs,
        per_device_train_batch_size=batch_size,
        per_device_eval_batch_size=batch_size,
        learning_rate=learning_rate,
        weight_decay=0.01,
        eval_strategy='epoch',
        save_strategy='epoch',
        load_best_model_at_end=True,
        metric_for_best_model='f1',
        greater_is_better=True,
        warmup_ratio=0.1,
        logging_dir=os.path.join(output_dir, 'logs'),
        logging_steps=50,
        save_total_limit=2,
        fp16=device == "cuda",
        gradient_accumulation_steps=2,
        report_to='none',
    )
    
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        compute_metrics=compute_metrics,
        callbacks=callbacks
    )
    
    print("\n开始训练...")
    train_result = trainer.train()
    
    print("\n保存模型...")
    trainer.save_model(output_dir)
    tokenizer.save_pretrained(output_dir)
    
    print(f"\n模型已保存至: {output_dir}")
    
    metrics = train_result.metrics
    trainer.log_metrics("train", metrics)
    trainer.save_metrics("train", metrics)
    
    if progress_callback:
        progress_callback(num_epochs, num_epochs, metrics, '训练完成')
    
    return trainer, tokenizer, metrics


def train_model(
    model_name: str = 'hfl/chinese-roberta-wwm-ext',
    output_dir: str = None,
    num_epochs: int = 3,
    batch_size: int = 16,
    learning_rate: float = 2e-5,
    max_length: int = 128
):
    """训练模型（简化接口）"""
    trainer, tokenizer, metrics = _train_model_core(
        model_name=model_name,
        output_dir=output_dir,
        num_epochs=num_epochs,
        batch_size=batch_size,
        learning_rate=learning_rate,
        max_length=max_length
    )
    return trainer, tokenizer


def train_model_with_callback(
    data_file: str = None,
    model_name: str = 'hfl/chinese-roberta-wwm-ext',
    output_dir: str = None,
    num_epochs: int = 3,
    batch_size: int = 16,
    learning_rate: float = 2e-5,
    max_length: int = 128,
    progress_callback: Callable = None
) -> Dict:
    """带进度回调的训练模型函数，供外部调用"""
    trainer, tokenizer, metrics = _train_model_core(
        model_name=model_name,
        output_dir=output_dir,
        num_epochs=num_epochs,
        batch_size=batch_size,
        learning_rate=learning_rate,
        max_length=max_length,
        data_file=data_file,
        progress_callback=progress_callback
    )
    
    return {
        'success': True,
        'model_path': output_dir or os.path.join(MODEL_DIR, 'roberta_finetuned'),
        'metrics': metrics
    }


def evaluate_model(trainer, test_df: pd.DataFrame, tokenizer):
    """评估模型"""
    print("\n" + "=" * 60)
    print("模型评估")
    print("=" * 60)
    
    if '文本' not in test_df.columns:
        print("未找到文本列")
        return []
    
    test_texts = test_df['文本'].tolist()
    
    test_dataset = SentimentDataset(
        test_texts, 
        [1] * len(test_texts),
        tokenizer
    )
    
    predictions = trainer.predict(test_dataset)
    preds = predictions.predictions.argmax(-1)
    
    pred_labels = [ID_TO_LABEL[p] for p in preds]
    
    print(f"\n预测结果分布:")
    from collections import Counter
    print(Counter(pred_labels))
    
    return pred_labels


def main():
    trainer, tokenizer = train_model(
        model_name='hfl/chinese-roberta-wwm-ext',
        num_epochs=3,
        batch_size=16,
        learning_rate=2e-5,
        max_length=128
    )
    
    test_df, _ = load_data()
    evaluate_model(trainer, test_df, tokenizer)
    
    print("\n" + "=" * 60)
    print("训练完成！")
    print("=" * 60)


if __name__ == '__main__':
    main()
