#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
模型显存占用分析脚本
检测当前模型在训练和推理时的显存占用
"""
import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(PROJECT_ROOT, 'backend'))

import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

MODEL_DIR = os.path.join(PROJECT_ROOT, 'backend', 'models', 'roberta_finetuned')

def get_gpu_memory():
    """获取GPU显存使用情况"""
    if torch.cuda.is_available():
        allocated = torch.cuda.memory_allocated(0)
        reserved = torch.cuda.memory_reserved(0)
        return {
            'allocated': allocated,
            'reserved': reserved
        }
    return {'allocated': 0, 'reserved': 0}

def format_size(size_bytes):
    """格式化字节大小"""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024**2:
        return f"{size_bytes / 1024:.2f} KB"
    elif size_bytes < 1024**3:
        return f"{size_bytes / 1024**2:.2f} MB"
    else:
        return f"{size_bytes / 1024**3:.2f} GB"

def count_parameters(model):
    """计算模型参数数量"""
    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    return total_params, trainable_params

print("=" * 80)
print("模型显存占用分析")
print("=" * 80)

# 检查CUDA是否可用
if not torch.cuda.is_available():
    print("\n❌ CUDA不可用，无法检测GPU显存")
    sys.exit(1)

print(f"\n🖥️ GPU信息:")
print(f"   设备名称: {torch.cuda.get_device_name(0)}")
print(f"   显存总量: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")

# 初始显存
torch.cuda.empty_cache()
mem_initial = get_gpu_memory()
print(f"\n📊 初始状态:")
print(f"   已分配: {format_size(mem_initial['allocated'])}")
print(f"   已预留: {format_size(mem_initial['reserved'])}")

# 检查模型是否存在
if not os.path.exists(MODEL_DIR):
    print(f"\n❌ 模型路径不存在: {MODEL_DIR}")
    sys.exit(1)

print(f"\n📁 加载模型: {MODEL_DIR}")

# 加载tokenizer
print("\n1️⃣ 加载Tokenizer...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
mem_after_tokenizer = get_gpu_memory()
print(f"   已分配: {format_size(mem_after_tokenizer['allocated'])}")
tokenizer_memory = mem_after_tokenizer['allocated'] - mem_initial['allocated']
print(f"   Tokenizer显存增量: {format_size(tokenizer_memory)}")

# 加载模型到CPU
print("\n2️⃣ 加载模型到CPU...")
model_cpu = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)

# 计算参数
total_params, trainable_params = count_parameters(model_cpu)
print(f"   总参数量: {total_params:,}")
print(f"   可训练参数: {trainable_params:,}")

# 估算模型大小
model_size_fp32 = total_params * 4  # FP32 = 4 bytes
model_size_fp16 = total_params * 2  # FP16 = 2 bytes
model_size_int8 = total_params * 1  # INT8 = 1 byte
model_size_int4 = total_params * 0.5  # INT4 = 0.5 byte

print(f"\n   📦 模型大小估算:")
print(f"   FP32 (全精度): {format_size(model_size_fp32)}")
print(f"   FP16 (半精度): {format_size(model_size_fp16)}")
print(f"   INT8 (8位量化): {format_size(model_size_int8)}")
print(f"   INT4 (4位量化): {format_size(model_size_int4)}")

# 加载模型到GPU
print("\n3️⃣ 加载模型到GPU...")
model_gpu = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)
model_gpu.to('cuda')
model_gpu.eval()

mem_after_model = get_gpu_memory()
print(f"   已分配: {format_size(mem_after_model['allocated'])}")
print(f"   已预留: {format_size(mem_after_model['reserved'])}")
model_gpu_memory = mem_after_model['allocated'] - mem_after_tokenizer['allocated']
print(f"   模型显存占用: {format_size(model_gpu_memory)}")

# 推理测试
print("\n4️⃣ 推理测试...")
test_text = "这个产品质量很好，物流也很快，非常满意！"

encoding = tokenizer(
    test_text,
    add_special_tokens=True,
    max_length=128,
    padding='max_length',
    truncation=True,
    return_tensors='pt'
)

input_ids = encoding['input_ids'].to('cuda')
attention_mask = encoding['attention_mask'].to('cuda')

mem_after_input = get_gpu_memory()
input_memory = mem_after_input['allocated'] - mem_after_model['allocated']
print(f"   输入数据显存: {format_size(input_memory)}")

with torch.no_grad():
    outputs = model_gpu(input_ids=input_ids, attention_mask=attention_mask)
    probs = torch.softmax(outputs.logits, dim=-1)

mem_after_infer = get_gpu_memory()
inference_overhead = mem_after_infer['allocated'] - mem_after_model['allocated']
print(f"   推理额外显存: {format_size(inference_overhead)}")

# 训练显存估算
print("\n5️⃣ 训练显存估算 (batch_size=16):")
batch_size = 16
seq_length = 128

# 训练时需要存储：模型参数 + 梯度 + 优化器状态 + 激活值
# Adam优化器状态约为参数大小的2倍
# 激活值约为 batch_size * seq_length * hidden_size * num_layers
training_memory = model_size_fp32 * 4  # 参数 + 梯度 + 优化器状态(2x) ≈ 4x
print(f"   参数+梯度+优化器: {format_size(training_memory)}")
print(f"   激活值(估算): ~{format_size(batch_size * seq_length * 768 * 12)}")
print(f"   训练总显存(估算): ~{format_size(training_memory + batch_size * seq_length * 768 * 12)}")

# 清理
del model_cpu
del model_gpu
torch.cuda.empty_cache()

print("\n" + "=" * 80)
print("📊 显存占用总结")
print("=" * 80)
print(f"""
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 状态                    │ 显存占用          │ 说明                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 模型加载 (FP32)         │ {format_size(model_gpu_memory):>12}      │ 模型参数存储在GPU显存中        │
│ 推理额外开销            │ {format_size(inference_overhead):>12}      │ 输入数据+中间激活值            │
│ 推理总显存              │ {format_size(model_gpu_memory + inference_overhead):>12}      │ 推理时总显存占用              │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 训练显存 (估算)         │ ~{format_size(training_memory):>11}      │ 参数+梯度+优化器状态          │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 量化后大小 (FP16)       │ {format_size(model_size_fp16):>12}      │ 减少50%显存                   │
│ 量化后大小 (INT8)       │ {format_size(model_size_int8):>12}      │ 减少75%显存                   │
│ 量化后大小 (INT4)       │ {format_size(model_size_int4):>12}      │ 减少87.5%显存                 │
└─────────────────────────────────────────────────────────────────────────────────┘
""")
