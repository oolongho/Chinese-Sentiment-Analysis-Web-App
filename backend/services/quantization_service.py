#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
量化服务模块
功能：
1. INT8 动态量化 - 将 FP32 模型量化为 INT8 精度
2. 量化模型加载 - 支持加载 FP32 或 INT8 模型
3. 显存监控 - 实时查询 GPU 显存使用情况
4. 量化状态查询 - 获取当前量化配置和模型信息

技术细节：
- 使用 PyTorch 动态量化（只量化 Linear 层）
- FP32 模型路径：backend/models/roberta_finetuned/
- INT8 模型路径：backend/models/roberta_finetuned_int8/
- 单例模式管理模型实例，避免重复加载
"""

import os
import shutil
import threading
import time
from pathlib import Path
from typing import Dict, Optional, Tuple, Any
from dataclasses import dataclass, field
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


class QuantizationMode(Enum):
    """量化模式枚举"""
    FP32 = "fp32"  # 原始精度
    FP16 = "fp16"  # 半精度（GPU）
    INT8 = "int8"  # INT8 量化（CPU）


@dataclass
class QuantizationStatus:
    """量化状态信息"""
    mode: QuantizationMode = QuantizationMode.FP32
    model_path: str = ""
    model_size_mb: float = 0.0
    quantization_completed: bool = False
    quantization_time: float = 0.0
    last_error: str = ""


@dataclass
class GpuMemoryInfo:
    """GPU 显存信息"""
    total_mb: float = 0.0
    allocated_mb: float = 0.0
    reserved_mb: float = 0.0
    free_mb: float = 0.0
    percent: float = 0.0
    gpu_name: str = ""
    cuda_available: bool = False


@dataclass
class QuantizationResult:
    """量化结果信息"""
    success: bool = False
    original_size_mb: float = 0.0
    quantized_size_mb: float = 0.0
    size_reduction_percent: float = 0.0
    quantization_time: float = 0.0
    message: str = ""
    error: str = ""


class QuantizationService:
    """
    量化服务类
    
    提供模型量化、加载、显存监控等功能
    使用单例模式确保模型实例的唯一性
    """
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls) -> 'QuantizationService':
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self) -> None:
        if self._initialized:
            return
        self._initialized = True
        
        # 模型路径配置
        self.base_dir = Path(__file__).parent.parent
        self.fp32_model_path = self.base_dir / "models" / "roberta_finetuned"
        self.fp16_model_path = self.base_dir / "models" / "roberta_finetuned_fp16"
        self.int8_model_path = self.base_dir / "models" / "roberta_finetuned_int8"
        
        # 模型实例缓存
        self._model: Optional[Any] = None
        self._tokenizer: Optional[Any] = None
        self._current_mode: QuantizationMode = QuantizationMode.FP32
        self._model_lock = threading.Lock()
        
        # 量化状态
        self._status = QuantizationStatus(
            mode=QuantizationMode.FP32,
            model_path=str(self.fp32_model_path)
        )
        
        # CUDA 可用性检查
        self._cuda_available = TORCH_AVAILABLE and torch.cuda.is_available()
    
    def _get_model_size(self, model_path: Path) -> float:
        """
        计算模型目录的总大小（MB）
        
        Args:
            model_path: 模型目录路径
            
        Returns:
            模型大小（MB）
        """
        if not model_path.exists():
            return 0.0
        
        total_size = 0
        for file_path in model_path.rglob("*"):
            if file_path.is_file():
                total_size += file_path.stat().st_size
        
        return total_size / (1024 * 1024)
    
    def _cleanup_gpu_memory(self) -> None:
        """
        清理 GPU 显存
        卸载当前模型并清理缓存
        
        注意：此方法假设调用者已经持有 _model_lock
        """
        if not self._cuda_available:
            return
        
        if self._model is not None:
            del self._model
            self._model = None
        
        torch.cuda.empty_cache()
        time.sleep(0.1)
    
    def quantize_model_int8(self) -> QuantizationResult:
        """
        执行 INT8 动态量化
        
        将 FP32 模型量化为 INT8 精度，只量化 Linear 层
        量化后的模型保存到独立目录，不影响原始 FP32 模型
        
        Returns:
            QuantizationResult: 量化结果，包含成功状态、模型大小变化等信息
            
        Raises:
            RuntimeError: 当 PyTorch 不可用或模型不存在时
        """
        result = QuantizationResult()
        
        # 检查环境
        if not TORCH_AVAILABLE:
            result.error = "PyTorch 未安装，无法执行量化"
            return result
        
        # 检查 FP32 模型是否存在
        if not self.fp32_model_path.exists():
            result.error = f"FP32 模型不存在：{self.fp32_model_path}"
            return result
        
        start_time = time.time()
        
        try:
            # 获取原始模型大小
            result.original_size_mb = self._get_model_size(self.fp32_model_path)
            
            # 清理 GPU 显存
            self._cleanup_gpu_memory()
            
            # 在 CPU 上加载模型进行量化
            device = "cpu"
            
            # 加载 FP32 模型
            print(f"[量化服务] 正在加载 FP32 模型：{self.fp32_model_path}")
            model = AutoModelForSequenceClassification.from_pretrained(
                str(self.fp32_model_path),
                torch_dtype=torch.float32,
                device_map=device
            )
            model.eval()
            
            # 执行 INT8 动态量化（只量化 Linear 层）
            print("[量化服务] 正在执行 INT8 动态量化...")
            quantized_model = torch.quantization.quantize_dynamic(
                model,
                {torch.nn.Linear},  # 只量化 Linear 层
                dtype=torch.qint8
            )
            
            # 保存量化模型
            print(f"[量化服务] 正在保存量化模型到：{self.int8_model_path}")
            
            # 如果目录已存在，先备份
            if self.int8_model_path.exists():
                backup_path = self.int8_model_path.parent / f"roberta_finetuned_int8_backup_{int(time.time())}"
                shutil.move(str(self.int8_model_path), str(backup_path))
                print(f"[量化服务] 已备份旧量化模型到：{backup_path}")
            
            # 创建新目录
            self.int8_model_path.mkdir(parents=True, exist_ok=True)
            
            # 使用 torch.save 保存整个量化模型对象
            torch.save(quantized_model, str(self.int8_model_path / 'quantized_model.pt'))
            
            # 保存配置文件
            model.config.save_pretrained(str(self.int8_model_path))
            
            # 复制 tokenizer 配置
            tokenizer_config_dir = self.fp32_model_path
            if tokenizer_config_dir.exists():
                for config_file in ["tokenizer.json", "tokenizer_config.json", "vocab.txt", "special_tokens_map.json"]:
                    src_file = tokenizer_config_dir / config_file
                    if src_file.exists():
                        shutil.copy2(str(src_file), str(self.int8_model_path / config_file))
            
            # 计算量化后模型大小
            result.quantized_size_mb = self._get_model_size(self.int8_model_path)
            
            # 计算压缩率
            if result.original_size_mb > 0:
                result.size_reduction_percent = round(
                    (1 - result.quantized_size_mb / result.original_size_mb) * 100, 2
                )
            
            result.quantization_time = round(time.time() - start_time, 2)
            result.success = True
            result.message = (
                f"量化成功！模型大小：{result.original_size_mb:.2f}MB -> {result.quantized_size_mb:.2f}MB, "
                f"压缩率：{result.size_reduction_percent}%"
            )
            
            # 更新状态
            with self._model_lock:
                self._status.quantization_completed = True
                self._status.quantization_time = result.quantization_time
                self._status.last_error = ""
            
            print(f"[量化服务] {result.message}")
            
        except Exception as e:
            result.error = f"量化失败：{str(e)}"
            result.message = "量化过程发生错误"
            print(f"[量化服务] 错误：{result.error}")
            
            with self._model_lock:
                self._status.last_error = result.error
            
            # 恢复备份（如果有）
            backup_dirs = list(self.int8_model_path.parent.glob("roberta_finetuned_int8_backup_*"))
            if backup_dirs:
                latest_backup = max(backup_dirs, key=lambda x: x.name)
                if self.int8_model_path.exists():
                    shutil.rmtree(self.int8_model_path)
                shutil.move(str(latest_backup), str(self.int8_model_path))
                print(f"[量化服务] 已恢复备份的量化模型")
        
        return result
    
    def quantize_model_fp16(self) -> QuantizationResult:
        """
        执行 FP16 半精度量化
        
        将 FP32 模型转换为 FP16 精度
        FP16 模型在 GPU 上运行，显存减半，速度更快
        
        Returns:
            QuantizationResult: 量化结果
        """
        result = QuantizationResult()
        
        if not TORCH_AVAILABLE:
            result.error = "PyTorch 未安装，无法执行量化"
            return result
        
        if not self.fp32_model_path.exists():
            result.error = f"FP32 模型不存在：{self.fp32_model_path}"
            return result
        
        if not self._cuda_available:
            result.error = "FP16 量化需要 CUDA GPU 支持"
            return result
        
        start_time = time.time()
        
        try:
            result.original_size_mb = self._get_model_size(self.fp32_model_path)
            
            print(f"[量化服务] 正在执行 FP16 半精度量化...")
            
            # 加载模型并转换为 FP16
            model = AutoModelForSequenceClassification.from_pretrained(
                str(self.fp32_model_path),
                torch_dtype=torch.float16,
                device_map="cuda"
            )
            model.eval()
            
            # 备份旧模型
            if self.fp16_model_path.exists():
                backup_path = self.fp16_model_path.parent / f"roberta_finetuned_fp16_backup_{int(time.time())}"
                shutil.move(str(self.fp16_model_path), str(backup_path))
                print(f"[量化服务] 已备份旧 FP16 模型到：{backup_path}")
            
            # 保存 FP16 模型
            self.fp16_model_path.mkdir(parents=True, exist_ok=True)
            model.save_pretrained(str(self.fp16_model_path))
            
            # 复制 tokenizer
            for config_file in ["tokenizer.json", "tokenizer_config.json", "vocab.txt", "special_tokens_map.json"]:
                src_file = self.fp32_model_path / config_file
                if src_file.exists():
                    shutil.copy2(str(src_file), str(self.fp16_model_path / config_file))
            
            # 清理显存
            del model
            torch.cuda.empty_cache()
            
            result.quantized_size_mb = self._get_model_size(self.fp16_model_path)
            
            if result.original_size_mb > 0:
                result.size_reduction_percent = round(
                    (1 - result.quantized_size_mb / result.original_size_mb) * 100, 2
                )
            
            result.quantization_time = round(time.time() - start_time, 2)
            result.success = True
            result.message = (
                f"FP16 量化成功！模型大小：{result.original_size_mb:.2f}MB -> {result.quantized_size_mb:.2f}MB, "
                f"压缩率：{result.size_reduction_percent}%"
            )
            
            print(f"[量化服务] {result.message}")
            
        except Exception as e:
            result.error = f"FP16 量化失败：{str(e)}"
            result.message = "FP16 量化过程发生错误"
            print(f"[量化服务] 错误：{result.error}")
        
        return result
    
    def load_quantized_model(
        self, 
        mode: QuantizationMode = QuantizationMode.FP32,
        force_reload: bool = False
    ) -> Tuple[Optional[Any], Optional[Any]]:
        """
        加载量化模型
        
        根据指定模式加载 FP32 或 INT8 模型
        使用单例模式缓存已加载的模型，避免重复加载
        
        Args:
            mode: 量化模式（FP32 或 INT8）
            force_reload: 是否强制重新加载（即使模型已缓存）
            
        Returns:
            Tuple[model, tokenizer]: 模型和分词器实例，加载失败时返回 (None, None)
        """
        if not TORCH_AVAILABLE:
            print("[量化服务] PyTorch 未安装，无法加载模型")
            return None, None
        
        with self._model_lock:
            # 检查是否需要重新加载
            if (self._model is not None and 
                self._tokenizer is not None and 
                self._current_mode == mode and 
                not force_reload):
                print(f"[量化服务] 使用已缓存的 {mode.value.upper()} 模型")
                return self._model, self._tokenizer
            
            # 清理旧模型
            if self._model is not None or force_reload:
                self._cleanup_gpu_memory()
            
            # 确定模型路径
            if mode == QuantizationMode.FP32:
                model_path = self.fp32_model_path
            else:
                model_path = self.int8_model_path
            
            # 检查模型是否存在
            if not model_path.exists():
                if mode == QuantizationMode.INT8:
                    print(f"[量化服务] INT8 模型不存在，请先执行量化：{model_path}")
                    print(f"[量化服务] 回退到 FP32 模式")
                    mode = QuantizationMode.FP32
                    model_path = self.fp32_model_path
                
                if not model_path.exists():
                    print(f"[量化服务] 模型不存在：{model_path}")
                    return None, None
            
            try:
                print(f"[量化服务] 正在加载 {mode.value.upper()} 模型：{model_path}")
                load_start = time.time()
                
                device = "cpu"
                
                if mode == QuantizationMode.INT8:
                    model_file = model_path / 'quantized_model.pt'
                    if not model_file.exists():
                        raise FileNotFoundError(f"INT8 模型文件不存在：{model_file}")
                    
                    print(f"[量化服务] 加载 INT8 量化模型...")
                    model = torch.load(str(model_file), map_location=device, weights_only=False)
                    model.eval()
                    
                    print(f"[量化服务] INT8 模型加载完成")
                else:
                    model = AutoModelForSequenceClassification.from_pretrained(
                        str(model_path),
                        torch_dtype=torch.float32,
                        device_map=device
                    )
                    model.eval()
                
                tokenizer = AutoTokenizer.from_pretrained(str(model_path))
                
                load_time = round(time.time() - load_start, 2)
                print(f"[量化服务] 模型加载完成，耗时：{load_time}s")
                
                # 缓存模型实例
                self._model = model
                self._tokenizer = tokenizer
                self._current_mode = mode
                
                # 更新状态
                self._status.mode = mode
                self._status.model_path = str(model_path)
                self._status.model_size_mb = self._get_model_size(model_path)
                
                return model, tokenizer
                
            except Exception as e:
                print(f"[量化服务] 模型加载失败：{str(e)}")
                self._status.last_error = f"模型加载失败：{str(e)}"
                return None, None
    
    def get_gpu_memory_info(self) -> GpuMemoryInfo:
        """
        获取 GPU 显存使用信息
        
        Returns:
            GpuMemoryInfo: GPU 显存详细信息，包括总容量、已分配、已保留等
        """
        info = GpuMemoryInfo(cuda_available=self._cuda_available)
        
        if not self._cuda_available:
            return info
        
        try:
            # 获取 GPU 属性
            props = torch.cuda.get_device_properties(0)
            info.gpu_name = props.name
            info.total_mb = round(props.total_memory / (1024 * 1024), 1)
            
            # 获取显存使用情况
            info.allocated_mb = round(torch.cuda.memory_allocated(0) / (1024 * 1024), 1)
            info.reserved_mb = round(torch.cuda.memory_reserved(0) / (1024 * 1024), 1)
            info.free_mb = round(info.total_mb - info.allocated_mb, 1)
            
            if info.total_mb > 0:
                info.percent = round((info.allocated_mb / info.total_mb) * 100, 1)
            
        except Exception as e:
            print(f"[量化服务] 获取 GPU 显存信息失败：{str(e)}")
        
        return info
    
    def get_quantization_status(self) -> QuantizationStatus:
        """
        获取当前量化状态
        
        Returns:
            QuantizationStatus: 量化状态信息，包括模式、模型路径、大小等
        """
        with self._model_lock:
            status = QuantizationStatus(
                mode=self._current_mode,
                model_path=self._status.model_path,
                model_size_mb=self._get_model_size(
                    Path(self._status.model_path) if self._status.model_path else Path()
                ),
                quantization_completed=self._status.quantization_completed,
                quantization_time=self._status.quantization_time,
                last_error=self._status.last_error
            )
            
            # 检查 INT8 模型是否存在
            if self.int8_model_path.exists():
                status.quantization_completed = True
            else:
                status.quantization_completed = False
            
            return status
    
    def get_model_info(self) -> Dict[str, Any]:
        """
        获取模型详细信息
        
        Returns:
            Dict: 包含 FP32 和 INT8 模型的信息
        """
        fp32_exists = self.fp32_model_path.exists()
        int8_exists = self.int8_model_path.exists()
        
        return {
            "fp32_model": {
                "path": str(self.fp32_model_path),
                "exists": fp32_exists,
                "size_mb": round(self._get_model_size(self.fp32_model_path), 2) if fp32_exists else 0.0
            },
            "int8_model": {
                "path": str(self.int8_model_path),
                "exists": int8_exists,
                "size_mb": round(self._get_model_size(self.int8_model_path), 2) if int8_exists else 0.0
            },
            "current_mode": self._current_mode.value,
            "cuda_available": self._cuda_available,
            "gpu_memory": {
                "total_mb": self.get_gpu_memory_info().total_mb,
                "allocated_mb": self.get_gpu_memory_info().allocated_mb,
                "percent": self.get_gpu_memory_info().percent
            } if self._cuda_available else None
        }
    
    def switch_mode(self, target_mode: QuantizationMode) -> Tuple[bool, str]:
        """
        切换量化模式
        
        Args:
            target_mode: 目标量化模式
            
        Returns:
            Tuple[success, message]: 切换是否成功及消息
        """
        if target_mode == self._current_mode:
            return True, f"已经是 {target_mode.value.upper()} 模式"
        
        # 检查目标模型是否存在
        if target_mode == QuantizationMode.INT8 and not self.int8_model_path.exists():
            return False, "INT8 模型不存在，请先执行量化"
        
        # 加载目标模式的模型
        model, tokenizer = self.load_quantized_model(target_mode, force_reload=True)
        
        if model is None:
            return False, f"无法加载 {target_mode.value.upper()} 模型"
        
        return True, f"已切换到 {target_mode.value.upper()} 模式"
    
    def unload_model(self) -> None:
        """
        卸载当前模型，释放显存
        """
        with self._model_lock:
            self._cleanup_gpu_memory()
            self._model = None
            self._tokenizer = None
            print("[量化服务] 模型已卸载")


# 全局单例
quantization_service = QuantizationService()
