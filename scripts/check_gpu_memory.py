#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
检查模型显存占用情况
"""
import os
import sys
import torch
import gc

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ['HF_ENDPOINT'] = 'https://hf-mirror.com'

def get_gpu_memory():
    """获取GPU显存使用情况"""
    if torch.cuda.is_available():
        allocated = torch.cuda.memory_allocated() / 1024**3
        reserved = torch.cuda.memory_reserved() / 1024**3
        total = torch.cuda.get_device_properties(0).total_memory / 1024**3
        return {
            'allocated': allocated,
            'reserved': reserved,
            'total': total,
            'free': total - reserved
        }
    return None

def format_size(size_gb):
    """格式化大小显示"""
    if size_gb >= 1:
        return f"{size_gb:.2f} GB"
    else:
        return f"{size_gb * 1024:.2f} MB"

print("=" * 80)
print("GPU 显存分析工具")
print("=" * 80)

# 检查CUDA是否可用
if not torch.cuda.is_available():
    print("\n❌ CUDA 不可用，无法检测显存")
    sys.exit(0)

print(f"\n✅ GPU 信息:")
print(f"   设备名称: {torch.cuda.get_device_name(0)}")
print(f"   总显存: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.2f} GB")
print(f"   CUDA 版本: {torch.version.cuda}")
print(f"   PyTorch 版本: {torch.__version__}")

# 清空缓存
torch.cuda.empty_cache()
gc.collect()

print("\n" + "=" * 80)
print("1. 基础显存占用（空载）")
print("=" * 80)

mem_before = get_gpu_memory()
print(f"   已分配: {format_size(mem_before['allocated'])}")
print(f"   已预留: {format_size(mem_before['reserved'])}")
print(f"   空闲: {format_size(mem_before['free'])}")

print("\n" + "=" * 80)
print("2. 加载模型后的显存占用")
print("=" * 80)

from transformers import AutoTokenizer, AutoModelForSequenceClassification

MODEL_DIR = os.path.join(PROJECT_ROOT, 'backend', 'models', 'roberta_finetuned')

if not os.path.exists(MODEL_DIR):
    print(f"\n❌ 模型路径不存在: {MODEL_DIR}")
    print("   请先训练模型")
else:
    print(f"\n📁 加载模型: {MODEL_DIR}")
    
    # 加载tokenizer
    tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
    mem_after_tokenizer = get_gpu_memory()
    print(f"\n   加载 Tokenizer 后:")
    print(f"   已分配: {format_size(mem_after_tokenizer['allocated'])}")
    print(f"   已预留: {format_size(mem_after_tokenizer['reserved'])}")
    
    # 加载模型到CPU
    print(f"\n   加载模型到 CPU...")
    model_cpu = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)
    
    # 计算模型参数数量和大小
    param_count = sum(p.numel() for p in model_cpu.parameters())
    param_size_mb = sum(p.numel() * p.element_size() for p in model_cpu.parameters()) / 1024**2
    
    print(f"\n   模型参数统计:")
    print(f"   参数数量: {param_count:,} ({param_count/1e6:.2f}M)")
    print(f"   参数大小: {param_size_mb:.2f} MB")
    
    # 加载模型到GPU
    print(f"\n   加载模型到 GPU...")
    model_gpu = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)
    model_gpu.to('cuda')
    model_gpu.eval()
    
    mem_after_model = get_gpu_memory()
    
    print(f"\n   加载模型到 GPU 后:")
    print(f"   已分配: {format_size(mem_after_model['allocated'])}")
    print(f"   已预留: {format_size(mem_after_model['reserved'])}")
    print(f"   空闲: {format_size(mem_after_model['free'])}")
    
    # 计算显存增量
    model_vram = mem_after_model['allocated'] - mem_before['allocated']
    print(f"\n   模型占用显存: {format_size(model_vram)}")

    print("\n" + "=" * 80)
    print("3. 推理时的显存占用")
    print("=" * 80)
    
    # 测试推理
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
    print(f"\n   输入数据加载后:")
    print(f"   已分配: {format_size(mem_after_input['allocated'])}")
    
    with torch.no_grad():
        outputs = model_gpu(input_ids=input_ids, attention_mask=attention_mask)
        probs = torch.softmax(outputs.logits, dim=-1)
    
    mem_after_infer = get_gpu_memory()
    print(f"\n   推理完成后:")
    print(f"   已分配: {format_size(mem_after_infer['allocated'])}")
    print(f"   已预留: {format_size(mem_after_infer['reserved'])}")
    
    inference_overhead = mem_after_infer['allocated'] - mem_after_model['allocated']
    print(f"\n   推理额外显存: {format_size(inference_overhead)}")

    print("\n" + "=" * 80)
    print("4. 训练时的显存占用估算")
    print("=" * 80)
    
    # 估算训练显存
    batch_size = 16
    seq_length = 128
    
    # 训练时需要存储：
    # 1. 模型参数
    # 2. 梯度（约等于参数大小）
    # 3. 优化器状态（Adam约2倍参数大小）
    # 4. 激活值（前向传播中间结果）
    
    model_size = param_size_mb
    gradients_size = model_size  # 梯度
    optimizer_size = model_size * 2  # Adam优化器状态
    activations_size = batch_size * seq_length * 768 * 12 * 4 / 1024**2  # 粗略估算激活值
    
    total_training_size = model_size + gradients_size + optimizer_size + activations_size
    
    print(f"\n   训练显存估算 (batch_size={batch_size}):")
    print(f"   模型参数: {model_size:.2f} MB")
    print(f"   梯度: {gradients_size:.2f} MB")
    print(f"   优化器状态 (Adam): {optimizer_size:.2f} MB")
    print(f"   激活值 (估算): {activations_size:.2f} MB")
    print(f"   ─────────────────────────")
    print(f"   总计: {total_training_size:.2f} MB ({total_training_size/1024:.2f} GB)")
    
    # 清理
    del model_cpu, model_gpu
    torch.cuda.empty_cache()
    gc.collect()

print("\n" + "=" * 80)
print("5. 量化压缩潜力分析")
print("=" * 80)

if 'param_size_mb' in dir():
    print(f"\n   当前精度: FP32 (32位)")
    print(f"   当前模型大小: {param_size_mb:.2f} MB")
    print(f"\n   量化后大小预估:")
    print(f"   FP16 (16位): {param_size_mb/2:.2f} MB (减少 50%)")
    print(f"   INT8 (8位):  {param_size_mb/4:.2f} MB (减少 75%)")
    print(f"   INT4 (4位):  {param_size_mb/8:.2f} MB (减少 87.5%)")

print("\n" + "=" * 80)
print("总结")
print("=" * 80)
print("""
量化压缩的优势：
1. 减少显存占用 - 可以在更小的GPU上运行
2. 加速推理 - INT8/INT4运算更快
3. 降低功耗 - 适合边缘设备部署

注意事项：
1. 量化可能导致精度损失
2. 需要校准数据集进行量化
3. 部分操作可能不支持量化
""")
