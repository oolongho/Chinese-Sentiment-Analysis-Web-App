#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
ONNX量化服务 - 使用ONNX Runtime进行INT8量化
"""

import os
import time
import threading
from pathlib import Path
from typing import Optional, List, Dict, Any
from dataclasses import dataclass

try:
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer
    import onnx
    import onnxruntime as ort
    from onnxruntime.quantization import quantize_static, QuantFormat, QuantType, CalibrationDataReader
    ONNX_AVAILABLE = True
except ImportError:
    ONNX_AVAILABLE = False
    torch = None
    AutoModelForSequenceClassification = None
    AutoTokenizer = None
    onnx = None
    ort = None
    quantize_static = None
    QuantFormat = None
    QuantType = None
    CalibrationDataReader = None


@dataclass
class QuantizationResult:
    """量化结果"""
    success: bool = False
    message: str = ""
    original_size_mb: float = 0.0
    quantized_size_mb: float = 0.0
    size_reduction_percent: float = 0.0
    quantization_time: float = 0.0
    error: Optional[str] = None


class TextCalibrationDataReader(CalibrationDataReader):
    """文本校准数据读取器"""
    
    def __init__(self, texts: List[str], tokenizer, max_length: int = 128, batch_size: int = 1):
        self.texts = texts
        self.tokenizer = tokenizer
        self.max_length = max_length
        self.batch_size = batch_size
        self.index = 0
        
    def get_next(self) -> Optional[Dict[str, Any]]:
        if self.index >= len(self.texts):
            return None
        
        batch_texts = self.texts[self.index:self.index + self.batch_size]
        self.index += self.batch_size
        
        inputs = self.tokenizer(
            batch_texts,
            padding=True,
            truncation=True,
            max_length=self.max_length,
            return_tensors="np"
        )
        
        return {
            'input_ids': inputs['input_ids'],
            'attention_mask': inputs['attention_mask']
        }
    
    def rewind(self):
        self.index = 0


class ONNXQuantizationService:
    """
    ONNX量化服务
    
    使用ONNX Runtime进行INT8量化，效果优于PyTorch原生量化
    """
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls) -> 'ONNXQuantizationService':
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        
        self.base_dir = Path(__file__).parent.parent
        self.fp32_model_path = self.base_dir / "models" / "roberta_finetuned"
        self.onnx_model_path = self.base_dir / "models" / "roberta_finetuned_onnx"
        self.onnx_int8_model_path = self.base_dir / "models" / "roberta_finetuned_onnx_int8"
    
    def _get_model_size(self, model_path: Path) -> float:
        """计算模型文件大小（MB）"""
        if not model_path.exists():
            return 0.0
        
        if model_path.is_file():
            return model_path.stat().st_size / (1024 * 1024)
        
        total_size = 0
        for file_path in model_path.rglob("*"):
            if file_path.is_file():
                total_size += file_path.stat().st_size
        
        return total_size / (1024 * 1024)
    
    def export_to_onnx(self) -> QuantizationResult:
        """
        将PyTorch模型导出为ONNX格式
        
        Returns:
            QuantizationResult: 导出结果
        """
        result = QuantizationResult()
        
        if not ONNX_AVAILABLE:
            result.error = "ONNX Runtime 未安装"
            return result
        
        if not self.fp32_model_path.exists():
            result.error = f"FP32 模型不存在：{self.fp32_model_path}"
            return result
        
        start_time = time.time()
        
        try:
            print(f"[ONNX量化] 正在导出ONNX模型...")
            
            # 加载模型和tokenizer
            model = AutoModelForSequenceClassification.from_pretrained(
                str(self.fp32_model_path),
                torch_dtype=torch.float32
            )
            tokenizer = AutoTokenizer.from_pretrained(str(self.fp32_model_path))
            model.eval()
            
            # 创建示例输入
            dummy_text = "这是一个测试文本"
            inputs = tokenizer(
                dummy_text,
                padding=True,
                truncation=True,
                max_length=128,
                return_tensors="pt"
            )
            
            # 创建输出目录
            self.onnx_model_path.mkdir(parents=True, exist_ok=True)
            onnx_file = self.onnx_model_path / "model.onnx"
            
            # 导出ONNX模型
            torch.onnx.export(
                model,
                (inputs['input_ids'], inputs['attention_mask']),
                str(onnx_file),
                input_names=['input_ids', 'attention_mask'],
                output_names=['logits'],
                dynamic_axes={
                    'input_ids': {0: 'batch_size', 1: 'sequence_length'},
                    'attention_mask': {0: 'batch_size', 1: 'sequence_length'},
                    'logits': {0: 'batch_size'}
                },
                opset_version=14,
                do_constant_folding=True
            )
            
            # 保存tokenizer配置
            tokenizer.save_pretrained(str(self.onnx_model_path))
            
            # 验证ONNX模型
            onnx_model = onnx.load(str(onnx_file))
            onnx.checker.check_model(onnx_model)
            
            result.original_size_mb = self._get_model_size(self.fp32_model_path)
            result.quantized_size_mb = self._get_model_size(onnx_file)
            result.quantization_time = round(time.time() - start_time, 2)
            result.success = True
            result.message = f"ONNX模型导出成功！大小：{result.quantized_size_mb:.2f}MB"
            
            print(f"[ONNX量化] {result.message}")
            
            # 清理
            del model
            del onnx_model
            
        except Exception as e:
            result.error = f"ONNX导出失败：{str(e)}"
            result.message = "ONNX导出过程发生错误"
            print(f"[ONNX量化] 错误：{result.error}")
            import traceback
            traceback.print_exc()
        
        return result
    
    def quantize_int8(
        self,
        calibration_texts: Optional[List[str]] = None,
        num_calibration_samples: int = 100
    ) -> QuantizationResult:
        """
        使用ONNX Runtime进行INT8静态量化
        
        Args:
            calibration_texts: 校准文本列表
            num_calibration_samples: 校准样本数量
            
        Returns:
            QuantizationResult: 量化结果
        """
        result = QuantizationResult()
        
        if not ONNX_AVAILABLE:
            result.error = "ONNX Runtime 未安装"
            return result
        
        # 先导出ONNX模型
        if not self.onnx_model_path.exists():
            export_result = self.export_to_onnx()
            if not export_result.success:
                result.error = export_result.error
                return result
        
        onnx_file = self.onnx_model_path / "model.onnx"
        if not onnx_file.exists():
            result.error = f"ONNX模型不存在：{onnx_file}"
            return result
        
        start_time = time.time()
        
        try:
            print(f"[ONNX量化] 正在执行INT8量化...")
            
            # 加载tokenizer
            tokenizer = AutoTokenizer.from_pretrained(str(self.onnx_model_path))
            
            # 准备校准数据
            if calibration_texts is None:
                # 使用默认校准数据
                calibration_texts = [
                    "这个产品质量很好，非常满意",
                    "物流很快，包装严实，好评",
                    "东西很差，不好用，后悔买了",
                    "一般般吧，没什么特别的",
                    "服务态度很好，值得推荐",
                    "噪音太大了，根本没法用",
                    "性价比很高，值得购买",
                    "做工精细，很满意",
                ] * 20  # 重复20次
            
            calibration_texts = calibration_texts[:num_calibration_samples]
            print(f"[ONNX量化] 使用 {len(calibration_texts)} 条数据进行校准")
            
            # 创建校准数据读取器
            calibration_reader = TextCalibrationDataReader(
                calibration_texts,
                tokenizer,
                max_length=128,
                batch_size=1
            )
            
            # 创建输出目录
            self.onnx_int8_model_path.mkdir(parents=True, exist_ok=True)
            quantized_onnx_file = self.onnx_int8_model_path / "model_int8.onnx"
            
            # 执行INT8量化
            quantize_static(
                model_input=str(onnx_file),
                model_output=str(quantized_onnx_file),
                calibration_data_reader=calibration_reader,
                quant_format=QuantFormat.QDQ,
                activation_type=QuantType.QUInt8,
                weight_type=QuantType.QInt8,
                per_channel=False,
                reduce_range=False
            )
            
            # 复制tokenizer配置
            tokenizer.save_pretrained(str(self.onnx_int8_model_path))
            
            result.original_size_mb = self._get_model_size(onnx_file)
            result.quantized_size_mb = self._get_model_size(quantized_onnx_file)
            
            if result.original_size_mb > 0:
                result.size_reduction_percent = round(
                    (1 - result.quantized_size_mb / result.original_size_mb) * 100, 2
                )
            
            result.quantization_time = round(time.time() - start_time, 2)
            result.success = True
            result.message = (
                f"INT8量化成功！模型大小：{result.original_size_mb:.2f}MB -> {result.quantized_size_mb:.2f}MB, "
                f"压缩率：{result.size_reduction_percent}%"
            )
            
            print(f"[ONNX量化] {result.message}")
            
        except Exception as e:
            result.error = f"INT8量化失败：{str(e)}"
            result.message = "INT8量化过程发生错误"
            print(f"[ONNX量化] 错误：{result.error}")
            import traceback
            traceback.print_exc()
        
        return result
    
    def load_onnx_model(self, use_quantized: bool = False):
        """
        加载ONNX模型
        
        Args:
            use_quantized: 是否使用量化模型
            
        Returns:
            ONNX Runtime session
        """
        if use_quantized:
            model_path = self.onnx_int8_model_path / "model_int8.onnx"
        else:
            model_path = self.onnx_model_path / "model.onnx"
        
        if not model_path.exists():
            raise FileNotFoundError(f"ONNX模型不存在：{model_path}")
        
        # 创建ONNX Runtime session
        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        
        # 使用CPU执行提供者
        session = ort.InferenceSession(
            str(model_path),
            sess_options,
            providers=['CPUExecutionProvider']
        )
        
        return session
    
    def predict(self, texts: List[str], use_quantized: bool = False, batch_size: int = 32) -> List[int]:
        """
        使用ONNX模型进行预测
        
        Args:
            texts: 文本列表
            use_quantized: 是否使用量化模型
            batch_size: 批次大小
            
        Returns:
            预测标签列表
        """
        # 加载tokenizer
        tokenizer = AutoTokenizer.from_pretrained(
            str(self.onnx_int8_model_path if use_quantized else self.onnx_model_path)
        )
        
        # 加载模型
        session = self.load_onnx_model(use_quantized)
        
        predictions = []
        
        for i in range(0, len(texts), batch_size):
            batch_texts = texts[i:i+batch_size]
            
            # Tokenize
            inputs = tokenizer(
                batch_texts,
                padding=True,
                truncation=True,
                max_length=128,
                return_tensors="np"
            )
            
            # 推理
            outputs = session.run(
                None,
                {
                    'input_ids': inputs['input_ids'],
                    'attention_mask': inputs['attention_mask']
                }
            )
            
            # 获取预测结果
            logits = outputs[0]
            preds = logits.argmax(axis=1).tolist()
            predictions.extend(preds)
        
        return predictions


onnx_quantization_service = ONNXQuantizationService()
