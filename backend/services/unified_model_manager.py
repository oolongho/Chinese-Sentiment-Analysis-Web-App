#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
统一模型管理器
功能：
1. 统一管理 FP32、FP16 和 INT8 模型实例
2. 提供全局精度切换功能
3. 支持对比实验时同时加载多种模型
4. 提供模型状态查询接口

设计原则：
- 单例模式，全局唯一实例
- 懒加载，按需加载模型
- 线程安全
- FP32/FP16 在 GPU 运行，INT8 在 CPU 运行
"""

import os
import threading
import time
from pathlib import Path
from typing import Dict, Optional, Tuple, Any, Literal
from dataclasses import dataclass
from enum import Enum

try:
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    torch = None
    AutoModelForSequenceClassification = None
    AutoTokenizer = None


class PrecisionMode(Enum):
    """精度模式枚举"""
    FP32 = "fp32"
    FP16 = "fp16"
    INT8 = "int8"


@dataclass
class ModelStatus:
    """模型状态信息"""
    current_mode: PrecisionMode = PrecisionMode.FP32
    fp32_loaded: bool = False
    fp16_loaded: bool = False
    int8_loaded: bool = False
    fp16_available: bool = False
    int8_available: bool = False
    fp32_size_mb: float = 0.0
    fp16_size_mb: float = 0.0
    int8_size_mb: float = 0.0
    current_model_size_mb: float = 0.0
    last_error: str = ""


ID_TO_LABEL = {0: '负面', 1: '中性', 2: '正面'}
LABEL_MAP = {'负面': 0, '中性': 1, '正面': 2}


class UnifiedModelManager:
    """
    统一模型管理器
    
    全局单例，管理 FP32、FP16 和 INT8 模型实例
    - FP32/FP16: 在 GPU 上运行
    - INT8: 在 CPU 上运行（PyTorch 动态量化限制）
    """
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls) -> 'UnifiedModelManager':
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
        self.fp16_model_path = self.base_dir / "models" / "roberta_finetuned_fp16"
        self.int8_model_path = self.base_dir / "models" / "roberta_finetuned_int8"
        
        self._fp32_model: Optional[Any] = None
        self._fp32_tokenizer: Optional[Any] = None
        self._fp16_model: Optional[Any] = None
        self._fp16_tokenizer: Optional[Any] = None
        self._int8_model: Optional[Any] = None
        self._int8_tokenizer: Optional[Any] = None
        
        self._current_mode: PrecisionMode = PrecisionMode.FP32
        self._model_lock = threading.RLock()
        
        self._status = ModelStatus()
        
        self._cuda_available = TORCH_AVAILABLE and torch.cuda.is_available()
        self._device = "cuda" if self._cuda_available else "cpu"
        
        self._check_quantized_models()
    
    def _check_quantized_models(self) -> None:
        """检查量化模型是否可用"""
        self._status.fp16_available = self.fp16_model_path.exists()
        self._status.int8_available = (self.int8_model_path / 'quantized_model.pt').exists()
    
    def _get_model_size(self, model_path: Path) -> float:
        """计算模型目录大小（MB）"""
        if not model_path.exists():
            return 0.0
        
        total_size = 0
        for file_path in model_path.rglob("*"):
            if file_path.is_file():
                total_size += file_path.stat().st_size
        
        return total_size / (1024 * 1024)
    
    def _load_fp32_model(self) -> Tuple[Optional[Any], Optional[Any]]:
        """加载 FP32 模型（GPU）"""
        if not TORCH_AVAILABLE:
            print("[模型管理器] PyTorch 未安装")
            return None, None
        
        if not self.fp32_model_path.exists():
            print(f"[模型管理器] FP32 模型不存在：{self.fp32_model_path}")
            return None, None
        
        try:
            print(f"[模型管理器] 加载 FP32 模型...")
            start_time = time.time()
            
            model = AutoModelForSequenceClassification.from_pretrained(
                str(self.fp32_model_path),
                torch_dtype=torch.float32,
                device_map=self._device
            )
            model.eval()
            
            tokenizer = AutoTokenizer.from_pretrained(str(self.fp32_model_path))
            
            load_time = time.time() - start_time
            print(f"[模型管理器] FP32 模型加载完成，设备: {self._device}，耗时：{load_time:.2f}s")
            
            return model, tokenizer
            
        except Exception as e:
            print(f"[模型管理器] FP32 模型加载失败：{str(e)}")
            self._status.last_error = f"FP32 模型加载失败：{str(e)}"
            return None, None
    
    def _load_fp16_model(self) -> Tuple[Optional[Any], Optional[Any]]:
        """加载 FP16 模型（GPU）"""
        if not TORCH_AVAILABLE:
            print("[模型管理器] PyTorch 未安装")
            return None, None
        
        if not self.fp16_model_path.exists():
            print(f"[模型管理器] FP16 模型不存在：{self.fp16_model_path}")
            return None, None
        
        if not self._cuda_available:
            print("[模型管理器] FP16 模型需要 CUDA 支持")
            return None, None
        
        try:
            print(f"[模型管理器] 加载 FP16 模型...")
            start_time = time.time()
            
            model = AutoModelForSequenceClassification.from_pretrained(
                str(self.fp16_model_path),
                torch_dtype=torch.float16,
                device_map="cuda"
            )
            model.eval()
            
            tokenizer = AutoTokenizer.from_pretrained(str(self.fp16_model_path))
            
            load_time = time.time() - start_time
            print(f"[模型管理器] FP16 模型加载完成，设备: cuda，耗时：{load_time:.2f}s")
            
            return model, tokenizer
            
        except Exception as e:
            print(f"[模型管理器] FP16 模型加载失败：{str(e)}")
            self._status.last_error = f"FP16 模型加载失败：{str(e)}"
            return None, None
    
    def _load_int8_model(self) -> Tuple[Optional[Any], Optional[Any]]:
        """加载 INT8 量化模型（CPU）
        
        注意：PyTorch 动态量化只支持 CPU
        """
        if not TORCH_AVAILABLE:
            print("[模型管理器] PyTorch 未安装")
            return None, None
        
        model_file = self.int8_model_path / 'quantized_model.pt'
        if not model_file.exists():
            print(f"[模型管理器] INT8 模型不存在：{model_file}")
            return None, None
        
        try:
            print(f"[模型管理器] 加载 INT8 模型...")
            start_time = time.time()
            
            # INT8 动态量化模型只能在 CPU 上运行
            int8_device = "cpu"
            print(f"[模型管理器] INT8 模型使用设备: {int8_device}")
            
            model = torch.load(str(model_file), map_location=int8_device, weights_only=False)
            model.eval()
            
            tokenizer = AutoTokenizer.from_pretrained(str(self.int8_model_path))
            
            load_time = time.time() - start_time
            print(f"[模型管理器] INT8 模型加载完成，设备: cpu，耗时：{load_time:.2f}s")
            
            return model, tokenizer
            
        except Exception as e:
            print(f"[模型管理器] INT8 模型加载失败：{str(e)}")
            import traceback
            traceback.print_exc()
            self._status.last_error = f"INT8 模型加载失败：{str(e)}"
            return None, None
    
    def get_model(self, mode: Optional[PrecisionMode] = None) -> Tuple[Optional[Any], Optional[Any]]:
        """获取模型实例"""
        with self._model_lock:
            target_mode = mode if mode is not None else self._current_mode
            
            if target_mode == PrecisionMode.FP32:
                if self._fp32_model is None or self._fp32_tokenizer is None:
                    self._fp32_model, self._fp32_tokenizer = self._load_fp32_model()
                    if self._fp32_model is not None:
                        self._status.fp32_loaded = True
                        self._status.fp32_size_mb = self._get_model_size(self.fp32_model_path)
                return self._fp32_model, self._fp32_tokenizer
            
            elif target_mode == PrecisionMode.FP16:
                if self._fp16_model is None or self._fp16_tokenizer is None:
                    self._fp16_model, self._fp16_tokenizer = self._load_fp16_model()
                    if self._fp16_model is not None:
                        self._status.fp16_loaded = True
                        self._status.fp16_size_mb = self._get_model_size(self.fp16_model_path)
                return self._fp16_model, self._fp16_tokenizer
            
            else:  # INT8
                if self._int8_model is None or self._int8_tokenizer is None:
                    self._int8_model, self._int8_tokenizer = self._load_int8_model()
                    if self._int8_model is not None:
                        self._status.int8_loaded = True
                        self._status.int8_size_mb = self._get_model_size(self.int8_model_path)
                return self._int8_model, self._int8_tokenizer
    
    def get_current_model(self) -> Tuple[Optional[Any], Optional[Any]]:
        """获取当前精度模式的模型"""
        return self.get_model(self._current_mode)
    
    def switch_mode(self, target_mode: PrecisionMode) -> Tuple[bool, str]:
        """切换全局精度模式"""
        with self._model_lock:
            if target_mode == self._current_mode:
                return True, f"已经是 {target_mode.value.upper()} 模式"
            
            if target_mode == PrecisionMode.FP16:
                if not self._status.fp16_available:
                    return False, "FP16 模型不存在，请先执行 FP16 量化"
            
            if target_mode == PrecisionMode.INT8:
                if not self._status.int8_available:
                    return False, "INT8 模型不存在，请先执行 INT8 量化"
            
            self._current_mode = target_mode
            print(f"[模型管理器] 全局精度已切换到 {target_mode.value.upper()}")
            
            return True, f"已切换到 {target_mode.value.upper()} 模式"
    
    def get_current_mode(self) -> PrecisionMode:
        """获取当前精度模式"""
        return self._current_mode
    
    def get_status(self) -> Dict[str, Any]:
        """获取模型状态"""
        with self._model_lock:
            self._check_quantized_models()
            
            return {
                "current_mode": self._current_mode.value,
                "fp32_loaded": self._fp32_model is not None,
                "fp16_loaded": self._fp16_model is not None,
                "int8_loaded": self._int8_model is not None,
                "fp16_available": self._status.fp16_available,
                "int8_available": self._status.int8_available,
                "fp32_size_mb": round(self._get_model_size(self.fp32_model_path), 2),
                "fp16_size_mb": round(self._get_model_size(self.fp16_model_path), 2),
                "int8_size_mb": round(self._get_model_size(self.int8_model_path), 2),
                "current_model_size_mb": round(
                    self._get_model_size(
                        self.fp32_model_path if self._current_mode == PrecisionMode.FP32
                        else self.fp16_model_path if self._current_mode == PrecisionMode.FP16
                        else self.int8_model_path
                    ), 2
                ),
                "cuda_available": self._cuda_available,
                "device": self._device,
                "last_error": self._status.last_error
            }
    
    def _get_device_for_mode(self, mode: PrecisionMode) -> str:
        """获取指定模式应该使用的设备"""
        if mode == PrecisionMode.INT8:
            return "cpu"
        elif mode == PrecisionMode.FP16:
            return "cuda" if self._cuda_available else "cpu"
        else:
            return self._device
    
    def predict(self, text: str, mode: Optional[PrecisionMode] = None) -> Dict:
        """使用指定模式进行预测"""
        model, tokenizer = self.get_model(mode)
        target_mode = mode if mode is not None else self._current_mode
        device = self._get_device_for_mode(target_mode)
        
        if model is None or tokenizer is None:
            return {
                'sentiment': '中性',
                'confidence': 0.5,
                'scores': {'正面': 0.33, '中性': 0.34, '负面': 0.33},
                'error': '模型未加载'
            }
        
        try:
            encoding = tokenizer(
                text,
                add_special_tokens=True,
                max_length=128,
                padding='max_length',
                truncation=True,
                return_tensors='pt'
            )
            
            input_ids = encoding['input_ids']
            attention_mask = encoding['attention_mask']
            
            if device == "cuda":
                input_ids = input_ids.to(device)
                attention_mask = attention_mask.to(device)
            
            with torch.no_grad():
                outputs = model(input_ids=input_ids, attention_mask=attention_mask)
                probs = torch.softmax(outputs.logits, dim=-1)
                pred = torch.argmax(probs, dim=-1)
            
            pred_label = ID_TO_LABEL[pred.item()]
            confidence = probs[0][pred.item()].item()
            
            scores = {
                '正面': probs[0][2].item(),
                '中性': probs[0][1].item(),
                '负面': probs[0][0].item()
            }
            
            return {
                'sentiment': pred_label,
                'confidence': round(confidence, 4),
                'scores': {k: round(v, 4) for k, v in scores.items()}
            }
            
        except Exception as e:
            return {
                'sentiment': '中性',
                'confidence': 0.5,
                'scores': {'正面': 0.33, '中性': 0.34, '负面': 0.33},
                'error': str(e)
            }
    
    def evaluate_on_testset(
        self, 
        test_data: list, 
        mode: PrecisionMode
    ) -> Dict[str, Any]:
        """在测试集上评估模型"""
        model, tokenizer = self.get_model(mode)
        device = self._get_device_for_mode(mode)
        
        if model is None or tokenizer is None:
            return {
                'accuracy': 0,
                'error': '模型未加载'
            }
        
        correct = 0
        total = len(test_data)
        inference_times = []
        
        for item in test_data:
            text = item['文本']
            true_label = item['标签']
            
            start_time = time.time()
            
            try:
                encoding = tokenizer(
                    text,
                    add_special_tokens=True,
                    max_length=128,
                    padding='max_length',
                    truncation=True,
                    return_tensors='pt'
                )
                
                input_ids = encoding['input_ids']
                attention_mask = encoding['attention_mask']
                
                if device == "cuda":
                    input_ids = input_ids.to(device)
                    attention_mask = attention_mask.to(device)
                
                with torch.no_grad():
                    outputs = model(input_ids=input_ids, attention_mask=attention_mask)
                    probs = torch.softmax(outputs.logits, dim=-1)
                    pred = torch.argmax(probs, dim=-1)
                
                pred_label = ID_TO_LABEL[pred.item()]
                
            except Exception as e:
                pred_label = '中性'
            
            inference_time = (time.time() - start_time) * 1000
            inference_times.append(inference_time)
            
            if pred_label == true_label:
                correct += 1
        
        accuracy = correct / total if total > 0 else 0
        avg_inference_time = sum(inference_times) / len(inference_times) if inference_times else 0
        
        return {
            'accuracy': accuracy,
            'correct': correct,
            'total': total,
            'avg_inference_time_ms': avg_inference_time,
            'mode': mode.value,
            'device': device
        }
    
    def unload_all(self):
        """卸载所有模型，释放内存"""
        with self._model_lock:
            if self._fp32_model is not None:
                del self._fp32_model
                self._fp32_model = None
                self._fp32_tokenizer = None
                self._status.fp32_loaded = False
            
            if self._fp16_model is not None:
                del self._fp16_model
                self._fp16_model = None
                self._fp16_tokenizer = None
                self._status.fp16_loaded = False
            
            if self._int8_model is not None:
                del self._int8_model
                self._int8_model = None
                self._int8_tokenizer = None
                self._status.int8_loaded = False
            
            if self._cuda_available and torch is not None:
                torch.cuda.empty_cache()
            
            print("[模型管理器] 所有模型已卸载")


unified_model_manager = UnifiedModelManager()
