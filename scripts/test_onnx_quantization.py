#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
ONNX INT8量化测试脚本
对比PyTorch原生量化和ONNX量化的效果
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

from services.onnx_quantization_service import onnx_quantization_service


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


def evaluate_pytorch_model(model, tokenizer, texts, labels, device="cuda", batch_size=32):
    """评估PyTorch模型性能"""
    model.eval()
    predictions = []
    
    # 标签映射（根据模型配置：0=负面, 1=中性, 2=正面）
    label_map = {"负面": 0, "中性": 1, "正面": 2}
    numeric_labels = [label_map.get(label, 1) for label in labels]
    
    print(f"正在评估PyTorch模型（设备：{device}）...")
    
    with torch.no_grad():
        for i in range(0, len(texts), batch_size):
            batch_texts = texts[i:i+batch_size]
            
            inputs = tokenizer(
                batch_texts,
                padding=True,
                truncation=True,
                max_length=128,
                return_tensors="pt"
            )
            
            if device == "cuda":
                inputs = {k: v.cuda() for k, v in inputs.items()}
            
            outputs = model(**inputs)
            preds = torch.argmax(outputs.logits, dim=-1)
            predictions.extend(preds.cpu().numpy().tolist())
    
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


def measure_pytorch_inference_time(model, tokenizer, texts, device="cuda", num_runs=100):
    """测量PyTorch模型推理时间"""
    model.eval()
    
    sample_text = texts[0]
    inputs = tokenizer(sample_text, return_tensors="pt", padding=True, truncation=True, max_length=128)
    if device == "cuda":
        inputs = {k: v.cuda() for k, v in inputs.items()}
    
    with torch.no_grad():
        for _ in range(10):
            _ = model(**inputs)
    
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
            
            times.append((end_time - start_time) * 1000)
    
    return {
        'avg_ms': sum(times) / len(times),
        'min_ms': min(times),
        'max_ms': max(times)
    }


def evaluate_onnx_model(session, tokenizer, texts, labels, batch_size=32):
    """评估ONNX模型性能"""
    predictions = []
    
    # 标签映射（根据模型配置：0=负面, 1=中性, 2=正面）
    label_map = {"负面": 0, "中性": 1, "正面": 2}
    numeric_labels = [label_map.get(label, 1) for label in labels]
    
    print("正在评估ONNX模型（设备：CPU）...")
    
    for i in range(0, len(texts), batch_size):
        batch_texts = texts[i:i+batch_size]
        
        inputs = tokenizer(
            batch_texts,
            padding=True,
            truncation=True,
            max_length=128,
            return_tensors="np"
        )
        
        outputs = session.run(
            None,
            {
                'input_ids': inputs['input_ids'],
                'attention_mask': inputs['attention_mask']
            }
        )
        
        logits = outputs[0]
        preds = logits.argmax(axis=1).tolist()
        predictions.extend(preds)
    
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


def measure_onnx_inference_time(session, tokenizer, texts, num_runs=100):
    """测量ONNX模型推理时间"""
    sample_text = texts[0]
    inputs = tokenizer(sample_text, return_tensors="np", padding=True, truncation=True, max_length=128)
    
    # Warm up
    for _ in range(10):
        _ = session.run(None, {'input_ids': inputs['input_ids'], 'attention_mask': inputs['attention_mask']})
    
    # Measure
    times = []
    for i in range(num_runs):
        text = texts[i % len(texts)]
        inputs = tokenizer(text, return_tensors="np", padding=True, truncation=True, max_length=128)
        
        start_time = time.time()
        _ = session.run(None, {'input_ids': inputs['input_ids'], 'attention_mask': inputs['attention_mask']})
        end_time = time.time()
        
        times.append((end_time - start_time) * 1000)
    
    return {
        'avg_ms': sum(times) / len(times),
        'min_ms': min(times),
        'max_ms': max(times)
    }


def test_onnx_quantization():
    """测试ONNX量化效果"""
    print("=" * 80)
    print("ONNX INT8量化测试")
    print("=" * 80)
    
    # 加载测试数据
    texts, labels = load_test_data()
    if texts is None:
        print("无法加载测试数据")
        return
    
    print(f"加载测试数据：{len(texts)} 条")
    
    results = []
    
    # 1. PyTorch FP32基准测试
    print("\n" + "=" * 80)
    print("测试 PyTorch FP32 模型（GPU）")
    print("=" * 80)
    
    fp32_model_path = project_root / "backend" / "models" / "roberta_finetuned"
    if fp32_model_path.exists():
        tokenizer = AutoTokenizer.from_pretrained(str(fp32_model_path))
        model = AutoModelForSequenceClassification.from_pretrained(
            str(fp32_model_path),
            torch_dtype=torch.float32
        ).cuda()
        
        metrics = evaluate_pytorch_model(model, tokenizer, texts, labels, device="cuda")
        time_metrics = measure_pytorch_inference_time(model, tokenizer, texts, device="cuda")
        
        results.append({
            '配置': 'PyTorch FP32 (GPU)',
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
    
    # 2. PyTorch FP16测试
    print("\n" + "=" * 80)
    print("测试 PyTorch FP16 模型（GPU）")
    print("=" * 80)
    
    fp16_model_path = project_root / "backend" / "models" / "roberta_finetuned_fp16"
    if fp16_model_path.exists():
        tokenizer = AutoTokenizer.from_pretrained(str(fp16_model_path))
        model = AutoModelForSequenceClassification.from_pretrained(
            str(fp16_model_path),
            torch_dtype=torch.float16
        ).cuda()
        
        metrics = evaluate_pytorch_model(model, tokenizer, texts, labels, device="cuda")
        time_metrics = measure_pytorch_inference_time(model, tokenizer, texts, device="cuda")
        
        results.append({
            '配置': 'PyTorch FP16 (GPU)',
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
    
    # 3. ONNX INT8量化测试
    print("\n" + "=" * 80)
    print("测试 ONNX INT8 模型（CPU）")
    print("=" * 80)
    
    # 使用测试数据作为校准数据
    calibration_texts = texts[:100]
    
    # 执行量化
    quant_result = onnx_quantization_service.quantize_int8(
        calibration_texts=calibration_texts,
        num_calibration_samples=100
    )
    
    if quant_result.success:
        print(f"量化成功：{quant_result.message}")
        
        # 加载量化模型
        session = onnx_quantization_service.load_onnx_model(use_quantized=True)
        tokenizer = AutoTokenizer.from_pretrained(str(onnx_quantization_service.onnx_int8_model_path))
        
        # 评估
        metrics = evaluate_onnx_model(session, tokenizer, texts, labels)
        time_metrics = measure_onnx_inference_time(session, tokenizer, texts)
        
        results.append({
            '配置': 'ONNX INT8 (CPU)',
            '准确率': f"{metrics['accuracy']:.4f}",
            '精确率': f"{metrics['precision']:.4f}",
            '召回率': f"{metrics['recall']:.4f}",
            'F1值': f"{metrics['f1']:.4f}",
            '平均推理时间(ms)': f"{time_metrics['avg_ms']:.2f}",
            '最小时间(ms)': f"{time_metrics['min_ms']:.2f}",
            '最大时间(ms)': f"{time_metrics['max_ms']:.2f}"
        })
    else:
        print(f"量化失败：{quant_result.error}")
    
    # 打印结果
    print("\n" + "=" * 80)
    print("量化策略对比结果")
    print("=" * 80)
    
    df_results = pd.DataFrame(results)
    print(df_results.to_string(index=False))
    
    # 保存结果
    output_path = project_root / "data" / f"onnx_quantization_comparison_{int(time.time())}.txt"
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write("=" * 80 + "\n")
        f.write("ONNX INT8量化对比结果\n")
        f.write("=" * 80 + "\n\n")
        f.write(df_results.to_string(index=False))
        f.write("\n\n")
        f.write(f"测试时间：{time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"测试数据：{len(texts)} 条\n")
    
    print(f"\n结果已保存到：{output_path}")


if __name__ == "__main__":
    test_onnx_quantization()
