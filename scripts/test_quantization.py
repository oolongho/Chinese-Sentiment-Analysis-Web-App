#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
INT8量化测试脚本
测试不同量化策略的效果
"""

import sys
import time
import torch
import pandas as pd
from pathlib import Path
from transformers import AutoModelForSequenceClassification, AutoTokenizer
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score

# 添加项目路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(project_root / "backend"))

from services.quantization_service_v2 import quantization_service_v2


def load_test_data():
    """加载测试数据"""
    data_path = project_root / "data" / "test_data_1000.xlsx"
    if not data_path.exists():
        print(f"测试数据不存在：{data_path}")
        return None, None
    
    df = pd.read_excel(data_path)
    texts = df['文本'].tolist()
    labels = df['标签'].tolist()
    
    return texts, labels


def evaluate_model(model, tokenizer, texts, labels, device="cpu", batch_size=32):
    """评估模型性能"""
    model.eval()
    predictions = []
    
    # 标签映射（根据模型配置：0=负面, 1=中性, 2=正面）
    label_map = {"负面": 0, "中性": 1, "正面": 2}
    reverse_label_map = {0: "负面", 1: "中性", 2: "正面"}
    
    # 转换标签为数字
    if isinstance(labels[0], str):
        numeric_labels = [label_map.get(label, 2) for label in labels]
    else:
        numeric_labels = labels
    
    print(f"正在评估模型（设备：{device}）...")
    
    with torch.no_grad():
        for i in range(0, len(texts), batch_size):
            batch_texts = texts[i:i+batch_size]
            
            # Tokenize
            inputs = tokenizer(
                batch_texts,
                padding=True,
                truncation=True,
                max_length=128,
                return_tensors="pt"
            )
            
            # Move to device
            if device == "cuda":
                inputs = {k: v.cuda() for k, v in inputs.items()}
            
            # Inference
            outputs = model(**inputs)
            preds = torch.argmax(outputs.logits, dim=-1)
            predictions.extend(preds.cpu().numpy().tolist())
    
    # Calculate metrics
    accuracy = accuracy_score(numeric_labels, predictions)
    precision = precision_score(numeric_labels, predictions, average='weighted')
    recall = recall_score(numeric_labels, predictions, average='weighted')
    f1 = f1_score(numeric_labels, predictions, average='weighted')
    
    return {
        'accuracy': accuracy,
        'precision': precision,
        'recall': recall,
        'f1': f1
    }


def measure_inference_time(model, tokenizer, texts, device="cpu", num_runs=100):
    """测量推理时间"""
    model.eval()
    
    # Warm up
    sample_text = texts[0]
    inputs = tokenizer(sample_text, return_tensors="pt", padding=True, truncation=True, max_length=128)
    if device == "cuda":
        inputs = {k: v.cuda() for k, v in inputs.items()}
    
    with torch.no_grad():
        for _ in range(10):
            _ = model(**inputs)
    
    # Measure
    times = []
    with torch.no_grad():
        for i in range(num_runs):
            text = texts[i % len(texts)]
            inputs = tokenizer(text, return_tensors="pt", padding=True, truncation=True, max_length=128)
            if device == "cuda":
                inputs = {k: v.cuda() for k, v in inputs.items()}
            
            start_time = time.time()
            _ = model(**inputs)
            end_time = time.time()
            
            times.append((end_time - start_time) * 1000)  # Convert to ms
    
    avg_time = sum(times) / len(times)
    min_time = min(times)
    max_time = max(times)
    
    return {
        'avg_ms': avg_time,
        'min_ms': min_time,
        'max_ms': max_time
    }


def test_quantization_strategies():
    """测试不同量化策略"""
    print("=" * 80)
    print("INT8量化策略测试")
    print("=" * 80)
    
    # 加载测试数据
    texts, labels = load_test_data()
    if texts is None:
        print("无法加载测试数据")
        return
    
    print(f"加载测试数据：{len(texts)} 条")
    
    # 测试配置
    results = []
    
    # 1. FP32基准测试
    print("\n" + "=" * 80)
    print("测试 FP32 模型（GPU）")
    print("=" * 80)
    
    fp32_model_path = project_root / "backend" / "models" / "roberta_finetuned"
    if fp32_model_path.exists():
        tokenizer = AutoTokenizer.from_pretrained(str(fp32_model_path))
        model = AutoModelForSequenceClassification.from_pretrained(
            str(fp32_model_path),
            torch_dtype=torch.float32
        ).cuda()
        
        # 评估
        metrics = evaluate_model(model, tokenizer, texts, labels, device="cuda")
        time_metrics = measure_inference_time(model, tokenizer, texts, device="cuda")
        
        results.append({
            '配置': 'FP32 (GPU)',
            '准确率': f"{metrics['accuracy']:.4f}",
            '精确率': f"{metrics['precision']:.4f}",
            '召回率': f"{metrics['recall']:.4f}",
            'F1值': f"{metrics['f1']:.4f}",
            '平均推理时间(ms)': f"{time_metrics['avg_ms']:.2f}",
            '最小时间(ms)': f"{time_metrics['min_ms']:.2f}",
            '最大时间(ms)': f"{time_metrics['max_ms']:.2f}"
        })
        
        del model
        torch.cuda.empty_cache()
    else:
        print(f"FP32模型不存在：{fp32_model_path}")
    
    # 2. FP16测试
    print("\n" + "=" * 80)
    print("测试 FP16 模型（GPU）")
    print("=" * 80)
    
    fp16_model_path = project_root / "backend" / "models" / "roberta_finetuned_fp16"
    if fp16_model_path.exists():
        tokenizer = AutoTokenizer.from_pretrained(str(fp16_model_path))
        model = AutoModelForSequenceClassification.from_pretrained(
            str(fp16_model_path),
            torch_dtype=torch.float16
        ).cuda()
        
        # 评估
        metrics = evaluate_model(model, tokenizer, texts, labels, device="cuda")
        time_metrics = measure_inference_time(model, tokenizer, texts, device="cuda")
        
        results.append({
            '配置': 'FP16 (GPU)',
            '准确率': f"{metrics['accuracy']:.4f}",
            '精确率': f"{metrics['precision']:.4f}",
            '召回率': f"{metrics['recall']:.4f}",
            'F1值': f"{metrics['f1']:.4f}",
            '平均推理时间(ms)': f"{time_metrics['avg_ms']:.2f}",
            '最小时间(ms)': f"{time_metrics['min_ms']:.2f}",
            '最大时间(ms)': f"{time_metrics['max_ms']:.2f}"
        })
        
        del model
        torch.cuda.empty_cache()
    else:
        print(f"FP16模型不存在：{fp16_model_path}")
    
    # 3. INT8动态量化测试（改进版）
    print("\n" + "=" * 80)
    print("测试 INT8 动态量化（改进版，CPU）")
    print("=" * 80)
    
    # 执行量化
    result = quantization_service_v2.quantize_int8_dynamic()
    if result.success:
        print(f"量化成功：{result.message}")
        
        # 加载量化模型
        int8_model_path = quantization_service_v2.int8_dynamic_model_path
        tokenizer = AutoTokenizer.from_pretrained(str(int8_model_path))
        # 修复 PyTorch 2.6 的 weights_only 问题
        model = torch.load(str(int8_model_path / 'quantized_model.pt'), weights_only=False)
        model.eval()
        
        # 评估
        metrics = evaluate_model(model, tokenizer, texts, labels, device="cpu")
        time_metrics = measure_inference_time(model, tokenizer, texts, device="cpu")
        
        results.append({
            '配置': 'INT8 动态量化 (CPU)',
            '准确率': f"{metrics['accuracy']:.4f}",
            '精确率': f"{metrics['precision']:.4f}",
            '召回率': f"{metrics['recall']:.4f}",
            'F1值': f"{metrics['f1']:.4f}",
            '平均推理时间(ms)': f"{time_metrics['avg_ms']:.2f}",
            '最小时间(ms)': f"{time_metrics['min_ms']:.2f}",
            '最大时间(ms)': f"{time_metrics['max_ms']:.2f}"
        })
        
        del model
    else:
        print(f"量化失败：{result.error}")
    
    # 4. INT8静态量化测试
    print("\n" + "=" * 80)
    print("测试 INT8 静态量化（CPU）")
    print("=" * 80)
    
    # 使用测试数据作为校准数据
    calibration_texts = texts[:100]
    
    # 执行量化
    result = quantization_service_v2.quantize_int8_static(
        calibration_data=calibration_texts,
        num_calibration_samples=100
    )
    
    if result.success:
        print(f"量化成功：{result.message}")
        
        # 加载量化模型
        int8_model_path = quantization_service_v2.int8_static_model_path
        tokenizer = AutoTokenizer.from_pretrained(str(int8_model_path))
        # 修复 PyTorch 2.6 的 weights_only 问题
        model = torch.load(str(int8_model_path / 'quantized_model.pt'), weights_only=False)
        model.eval()
        
        # 评估
        metrics = evaluate_model(model, tokenizer, texts, labels, device="cpu")
        time_metrics = measure_inference_time(model, tokenizer, texts, device="cpu")
        
        results.append({
            '配置': 'INT8 静态量化 (CPU)',
            '准确率': f"{metrics['accuracy']:.4f}",
            '精确率': f"{metrics['precision']:.4f}",
            '召回率': f"{metrics['recall']:.4f}",
            'F1值': f"{metrics['f1']:.4f}",
            '平均推理时间(ms)': f"{time_metrics['avg_ms']:.2f}",
            '最小时间(ms)': f"{time_metrics['min_ms']:.2f}",
            '最大时间(ms)': f"{time_metrics['max_ms']:.2f}"
        })
        
        del model
    else:
        print(f"量化失败：{result.error}")
    
    # 打印结果
    print("\n" + "=" * 80)
    print("量化策略对比结果")
    print("=" * 80)
    
    df_results = pd.DataFrame(results)
    print(df_results.to_string(index=False))
    
    # 保存结果
    output_path = project_root / "data" / f"quantization_comparison_{int(time.time())}.txt"
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write("=" * 80 + "\n")
        f.write("INT8量化策略对比结果\n")
        f.write("=" * 80 + "\n\n")
        f.write(df_results.to_string(index=False))
        f.write("\n\n")
        f.write(f"测试时间：{time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"测试数据：{len(texts)} 条\n")
    
    print(f"\n结果已保存到：{output_path}")


if __name__ == "__main__":
    test_quantization_strategies()
