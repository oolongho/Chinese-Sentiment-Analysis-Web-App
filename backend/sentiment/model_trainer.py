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
    EarlyStoppingCallback
)
from typing import Dict, List, Tuple

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'data')
MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'models')

LABEL_MAP = {'负面': 0, '中性': 1, '正面': 2}
ID_TO_LABEL = {0: '负面', 1: '中性', 2: '正面'}


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


def load_data() -> Tuple[pd.DataFrame, pd.DataFrame]:
    """加载训练数据和测试数据"""
    train_file = os.path.join(DATA_DIR, 'labeled_data.xlsx')
    test_file = os.path.join(DATA_DIR, 'test_data.xlsx')
    
    train_df = pd.read_excel(train_file)
    test_df = pd.read_excel(test_file)
    
    print(f"加载训练数据: {len(train_df)} 条")
    print(f"加载测试数据: {len(test_df)} 条")
    
    return train_df, test_df


def prepare_datasets(train_df: pd.DataFrame, tokenizer, val_split: float = 0.1):
    """准备训练和验证数据集"""
    train_df = train_df.dropna(subset=['人工校验标签'])
    
    texts = train_df['评价'].tolist()
    labels = [LABEL_MAP[label] for label in train_df['人工校验标签'].tolist()]
    
    train_texts, val_texts, train_labels, val_labels = train_test_split(
        texts, labels, test_size=val_split, random_state=42, stratify=labels
    )
    
    print(f"\n数据划分:")
    print(f"  训练集: {len(train_texts)} 条")
    print(f"  验证集: {len(val_texts)} 条")
    print(f"  标签分布: {dict(zip(*np.unique(train_labels, return_counts=True)))}")
    
    train_dataset = SentimentDataset(train_texts, train_labels, tokenizer)
    val_dataset = SentimentDataset(val_texts, val_labels, tokenizer)
    
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


def train_model(
    model_name: str = 'hfl/chinese-roberta-wwm-ext',
    output_dir: str = None,
    num_epochs: int = 3,
    batch_size: int = 16,
    learning_rate: float = 2e-5,
    max_length: int = 128
):
    """训练模型"""
    
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
    
    print(f"\n加载预训练模型: {model_name}")
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSequenceClassification.from_pretrained(
        model_name,
        num_labels=3,
        id2label=ID_TO_LABEL,
        label2id=LABEL_MAP,
        use_safetensors=True
    )
    
    train_df, test_df = load_data()
    train_dataset, val_dataset = prepare_datasets(train_df, tokenizer)
    
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
        callbacks=[EarlyStoppingCallback(early_stopping_patience=2)]
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
    
    return trainer, tokenizer


def evaluate_model(trainer, test_df: pd.DataFrame, tokenizer):
    """评估模型"""
    print("\n" + "=" * 60)
    print("模型评估")
    print("=" * 60)
    
    test_texts = test_df['首次评价'].tolist()
    
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
