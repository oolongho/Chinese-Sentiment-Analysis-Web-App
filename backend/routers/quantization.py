#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
量化 API 路由
提供模型量化相关的 RESTful API 接口：
1. POST /api/quantization/quantize/fp16 - 执行 FP16 量化
2. POST /api/quantization/quantize/int8 - 执行 INT8 量化
3. GET /api/quantization/status - 查询量化状态
4. POST /api/quantization/switch - 切换全局精度模式
5. GET /api/quantization/mode - 获取当前全局精度模式
6. POST /api/quantization/compare - 运行对比实验
"""

import time
import threading
import uuid
from pathlib import Path
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, asdict
from enum import Enum

import pandas as pd
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel, Field

from services.quantization_service import (
    quantization_service,
    QuantizationMode,
    QuantizationResult,
)
from services.unified_model_manager import (
    unified_model_manager,
    PrecisionMode
)


# ==================== 数据模型 ====================


class QuantizationModeEnum(str, Enum):
    """量化模式枚举"""
    FP32 = "fp32"
    FP16 = "fp16"
    INT8 = "int8"


class ComparisonType(str, Enum):
    """对比类型枚举"""
    FP32_VS_FP16 = "fp32_vs_fp16"
    FP32_VS_INT8 = "fp32_vs_int8"
    FP16_VS_INT8 = "fp16_vs_int8"


class QuantizeResponse(BaseModel):
    """量化响应模型"""
    success: bool = Field(..., description="量化是否成功")
    message: str = Field(..., description="结果消息")
    original_size_mb: float = Field(..., description="原始模型大小 (MB)")
    quantized_size_mb: float = Field(..., description="量化后模型大小 (MB)")
    size_reduction_percent: float = Field(..., description="压缩率百分比")
    quantization_time: float = Field(..., description="量化耗时 (秒)")
    error: Optional[str] = Field(None, description="错误信息")


class GlobalModeResponse(BaseModel):
    """全局精度模式响应模型"""
    current_mode: str = Field(..., description="当前全局精度模式")
    fp16_available: bool = Field(..., description="FP16 模型是否可用")
    int8_available: bool = Field(..., description="INT8 模型是否可用")
    fp32_size_mb: float = Field(..., description="FP32 模型大小 (MB)")
    fp16_size_mb: float = Field(..., description="FP16 模型大小 (MB)")
    int8_size_mb: float = Field(..., description="INT8 模型大小 (MB)")
    current_model_size_mb: float = Field(..., description="当前模型大小 (MB)")


class SwitchModeRequest(BaseModel):
    """切换精度模式请求模型"""
    mode: QuantizationModeEnum = Field(..., description="目标精度模式")


class SwitchModeResponse(BaseModel):
    """切换精度模式响应模型"""
    success: bool = Field(..., description="切换是否成功")
    message: str = Field(..., description="结果消息")
    current_mode: str = Field(..., description="当前模式")


class ComparisonRequest(BaseModel):
    """对比实验请求模型"""
    comparison_type: ComparisonType = Field(
        default=ComparisonType.FP32_VS_FP16,
        description="对比类型"
    )


class ComparisonResult(BaseModel):
    """单个模型对比结果"""
    mode: str
    accuracy: float
    correct: int
    total: int
    avg_inference_time_ms: float
    model_size_mb: float
    device: str


class Improvement(BaseModel):
    """性能提升"""
    size_reduction_percent: float
    speed_improvement_percent: float
    accuracy_loss_percent: float


class ComparisonResponse(BaseModel):
    """对比结果响应模型"""
    success: bool
    message: str
    comparison_type: str
    results: List[ComparisonResult]
    improvement: Optional[Improvement] = None
    experiment_time: float


class TestsetInfo(BaseModel):
    """测试集信息"""
    id: str
    filename: str
    sample_count: int
    upload_time: str
    label_distribution: Dict[str, int]


class UploadTestsetResponse(BaseModel):
    """上传测试集响应模型"""
    success: bool
    message: str
    testset_id: str
    info: TestsetInfo


# ==================== 全局变量 ====================

_comparison_cache: Dict[str, Any] = {}
_comparison_cache_lock = threading.Lock()

_uploaded_testsets: Dict[str, Dict[str, Any]] = {}
_testsets_lock = threading.Lock()
TESTSETS_DIR = Path(__file__).parent.parent / "data" / "uploaded_testsets"
TESTSETS_DIR.mkdir(parents=True, exist_ok=True)


# ==================== 工具函数 ====================


def _get_latest_testset() -> Optional[Dict[str, Any]]:
    """获取最新的测试集"""
    with _testsets_lock:
        if not _uploaded_testsets:
            return None
        latest = max(_uploaded_testsets.values(), key=lambda x: x.get('upload_time', ''))
        return latest


def _load_testset_data(testset_id: str) -> List[Dict[str, Any]]:
    """加载测试集数据"""
    with _testsets_lock:
        if testset_id not in _uploaded_testsets:
            raise ValueError(f"测试集不存在：{testset_id}")
        info = _uploaded_testsets[testset_id]
        file_path = Path(info['file_path'])
    
    if not file_path.exists():
        raise ValueError(f"测试集文件不存在：{file_path}")
    
    df = pd.read_csv(file_path, encoding='utf-8-sig')
    return df[['文本', '标签']].to_dict('records')


def _get_modes_for_comparison(comparison_type: ComparisonType) -> tuple:
    """根据对比类型获取两种精度模式"""
    mode_map = {
        ComparisonType.FP32_VS_FP16: (PrecisionMode.FP32, PrecisionMode.FP16),
        ComparisonType.FP32_VS_INT8: (PrecisionMode.FP32, PrecisionMode.INT8),
        ComparisonType.FP16_VS_INT8: (PrecisionMode.FP16, PrecisionMode.INT8),
    }
    return mode_map[comparison_type]


# ==================== API 路由 ====================


router = APIRouter(prefix='/api/quantization', tags=['模型量化'])


@router.post('/quantize/fp16', response_model=QuantizeResponse, summary="执行 FP16 量化")
async def quantize_model_fp16():
    """
    执行 FP16 半精度量化
    
    将 FP32 模型转换为 FP16 精度。
    FP16 模型在 GPU 上运行，显存减半，速度更快。
    """
    try:
        print("[量化 API] 开始执行 FP16 量化...")
        
        result: QuantizationResult = quantization_service.quantize_model_fp16()
        
        if not result.success:
            raise HTTPException(
                status_code=500,
                detail=result.error or "FP16 量化失败"
            )
        
        print(f"[量化 API] FP16 量化完成：{result.message}")
        
        return QuantizeResponse(
            success=result.success,
            message=result.message,
            original_size_mb=round(result.original_size_mb, 2),
            quantized_size_mb=round(result.quantized_size_mb, 2),
            size_reduction_percent=result.size_reduction_percent,
            quantization_time=result.quantization_time,
            error=None
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[量化 API] FP16 量化失败：{str(e)}")
        raise HTTPException(status_code=500, detail=f"FP16 量化过程发生错误：{str(e)}")


@router.post('/quantize/int8', response_model=QuantizeResponse, summary="执行 INT8 量化")
async def quantize_model_int8():
    """
    执行 INT8 动态量化
    
    将 FP32 模型量化为 INT8 精度。
    INT8 模型在 CPU 上运行，压缩率最高。
    """
    try:
        print("[量化 API] 开始执行 INT8 量化...")
        
        result: QuantizationResult = quantization_service.quantize_model_int8()
        
        if not result.success:
            raise HTTPException(
                status_code=500,
                detail=result.error or "INT8 量化失败"
            )
        
        print(f"[量化 API] INT8 量化完成：{result.message}")
        
        return QuantizeResponse(
            success=result.success,
            message=result.message,
            original_size_mb=round(result.original_size_mb, 2),
            quantized_size_mb=round(result.quantized_size_mb, 2),
            size_reduction_percent=result.size_reduction_percent,
            quantization_time=result.quantization_time,
            error=None
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[量化 API] INT8 量化失败：{str(e)}")
        raise HTTPException(status_code=500, detail=f"INT8 量化过程发生错误：{str(e)}")


@router.get('/mode', response_model=GlobalModeResponse, summary="获取全局精度模式")
async def get_global_mode():
    """获取当前全局精度模式和模型信息"""
    try:
        status = unified_model_manager.get_status()
        
        return GlobalModeResponse(
            current_mode=status['current_mode'],
            fp16_available=status['fp16_available'],
            int8_available=status['int8_available'],
            fp32_size_mb=status['fp32_size_mb'],
            fp16_size_mb=status['fp16_size_mb'],
            int8_size_mb=status['int8_size_mb'],
            current_model_size_mb=status['current_model_size_mb']
        )
        
    except Exception as e:
        print(f"[量化 API] 获取全局模式失败：{str(e)}")
        raise HTTPException(status_code=500, detail=f"获取全局模式失败：{str(e)}")


@router.post('/switch', response_model=SwitchModeResponse, summary="切换全局精度模式")
async def switch_global_mode(request: SwitchModeRequest):
    """
    切换全局精度模式
    
    切换后，所有使用模型的页面都将使用新的精度模式。
    """
    try:
        print(f"[量化 API] 切换全局精度模式到：{request.mode.value.upper()}")
        
        target_mode = PrecisionMode(request.mode.value)
        
        success, message = unified_model_manager.switch_mode(target_mode)
        
        if not success:
            raise HTTPException(status_code=400, detail=message)
        
        print(f"[量化 API] 切换成功：{message}")
        
        return SwitchModeResponse(
            success=success,
            message=message,
            current_mode=target_mode.value
        )
        
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"无效的精度模式：{request.mode.value}")
    except Exception as e:
        print(f"[量化 API] 切换模式失败：{str(e)}")
        raise HTTPException(status_code=500, detail=f"切换精度模式失败：{str(e)}")


@router.get('/status', summary="查询量化状态")
async def get_quantization_status():
    """查询当前量化状态和模型信息"""
    try:
        status = unified_model_manager.get_status()
        
        return {
            "mode": status['current_mode'],
            "model_path": str(unified_model_manager.fp32_model_path if status['current_mode'] == 'fp32' 
                             else unified_model_manager.fp16_model_path if status['current_mode'] == 'fp16'
                             else unified_model_manager.int8_model_path),
            "model_size_mb": status['current_model_size_mb'],
            "fp16_available": status['fp16_available'],
            "int8_available": status['int8_available'],
            "fp32_size_mb": status['fp32_size_mb'],
            "fp16_size_mb": status['fp16_size_mb'],
            "int8_size_mb": status['int8_size_mb'],
            "last_error": status['last_error']
        }
        
    except Exception as e:
        print(f"[量化 API] 获取状态失败：{str(e)}")
        raise HTTPException(status_code=500, detail=f"获取量化状态失败：{str(e)}")


# ==================== 测试集管理 API ====================


@router.post('/testset/upload', response_model=UploadTestsetResponse, summary="上传测试集")
async def upload_testset(file: UploadFile = File(...)):
    """上传测试集文件"""
    try:
        print(f"[量化 API] 开始上传测试集：{file.filename}")
        
        allowed_extensions = {'.xlsx', '.xls'}
        file_ext = Path(file.filename).suffix.lower()
        
        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"不支持的文件格式：{file_ext}。只支持 Excel 文件"
            )
        
        testset_id = str(uuid.uuid4())[:8]
        file_path = TESTSETS_DIR / f"{testset_id}{file_ext}"
        
        content = await file.read()
        with open(file_path, 'wb') as f:
            f.write(content)
        
        print(f"[量化 API] 文件已保存：{file_path}")
        
        try:
            df = pd.read_excel(file_path)
        except Exception as e:
            file_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=400,
                detail=f"无法读取文件：{str(e)}"
            )
        
        required_columns = {'文本', '标签'}
        actual_columns = set(df.columns)
        
        if not required_columns.issubset(actual_columns):
            file_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=400,
                detail=f"文件必须包含\"文本\"和\"标签\"两列。当前列：{list(actual_columns)}"
            )
        
        valid_labels = {'正面', '负面', '中性'}
        actual_labels = set(df['标签'].dropna().unique())
        
        if not actual_labels.issubset(valid_labels):
            invalid_labels = actual_labels - valid_labels
            file_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=400,
                detail=f"标签值必须是：正面、负面、中性。发现无效标签：{list(invalid_labels)}"
            )
        
        df = df.dropna(subset=['文本', '标签'])
        label_distribution = df['标签'].value_counts().to_dict()
        
        processed_path = TESTSETS_DIR / f"{testset_id}_processed.csv"
        df.to_csv(processed_path, index=False, encoding='utf-8-sig')
        
        testset_info = {
            'id': testset_id,
            'filename': file.filename,
            'sample_count': len(df),
            'upload_time': time.strftime('%Y-%m-%d %H:%M:%S'),
            'label_distribution': label_distribution,
            'file_path': str(processed_path),
            'original_filename': file.filename
        }
        
        with _testsets_lock:
            _uploaded_testsets[testset_id] = testset_info
        
        print(f"[量化 API] 测试集上传成功：{testset_id}, 样本数：{len(df)}")
        
        return UploadTestsetResponse(
            success=True,
            message="测试集上传成功",
            testset_id=testset_id,
            info=TestsetInfo(**testset_info)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[量化 API] 测试集上传失败：{str(e)}")
        raise HTTPException(status_code=500, detail=f"测试集上传失败：{str(e)}")


@router.get('/testset/list', summary="获取已上传的测试集列表")
def list_testsets():
    """获取所有已上传的测试集列表"""
    with _testsets_lock:
        testsets = []
        for testset_id, info in _uploaded_testsets.items():
            testsets.append({
                'id': info['id'],
                'filename': info['filename'],
                'sample_count': info['sample_count'],
                'upload_time': info['upload_time'],
                'label_distribution': info['label_distribution']
            })
    
    testsets.sort(key=lambda x: x['upload_time'], reverse=True)
    
    return {
        'success': True,
        'testsets': testsets,
        'total': len(testsets)
    }


# ==================== 对比实验 API ====================


@router.post('/compare', response_model=ComparisonResponse, summary="运行对比实验")
async def run_comparison_experiment(request: ComparisonRequest = ComparisonRequest()):
    """
    运行对比实验
    
    根据选择的对比类型，评估两种精度模式的性能。
    """
    try:
        print(f"[量化 API] 开始运行对比实验，类型：{request.comparison_type.value}")
        start_time = time.time()
        
        status = unified_model_manager.get_status()
        mode1, mode2 = _get_modes_for_comparison(request.comparison_type)
        
        # 检查模型可用性
        if mode1 == PrecisionMode.FP16 and not status['fp16_available']:
            raise HTTPException(
                status_code=400,
                detail="FP16 模型不存在，请先执行 FP16 量化"
            )
        if mode2 == PrecisionMode.FP16 and not status['fp16_available']:
            raise HTTPException(
                status_code=400,
                detail="FP16 模型不存在，请先执行 FP16 量化"
            )
        if mode1 == PrecisionMode.INT8 and not status['int8_available']:
            raise HTTPException(
                status_code=400,
                detail="INT8 模型不存在，请先执行 INT8 量化"
            )
        if mode2 == PrecisionMode.INT8 and not status['int8_available']:
            raise HTTPException(
                status_code=400,
                detail="INT8 模型不存在，请先执行 INT8 量化"
            )
        
        latest_testset = _get_latest_testset()
        if not latest_testset:
            raise HTTPException(
                status_code=400,
                detail="请先上传测试数据集"
            )
        
        test_data = _load_testset_data(latest_testset['id'])
        if not test_data:
            raise HTTPException(
                status_code=400,
                detail="测试数据为空"
            )
        
        print(f"[量化 API] 使用测试集：{latest_testset['filename']}, 样本数：{len(test_data)}")
        
        results = []
        
        # 评估第一个模型
        print(f"[量化 API] 评估 {mode1.value.upper()} 模型...")
        result1 = unified_model_manager.evaluate_on_testset(test_data, mode1)
        results.append(ComparisonResult(
            mode=mode1.value.upper(),
            accuracy=result1['accuracy'],
            correct=result1['correct'],
            total=result1['total'],
            avg_inference_time_ms=round(result1['avg_inference_time_ms'], 3),
            model_size_mb=round(status[f'{mode1.value}_size_mb'], 2),
            device=result1.get('device', 'unknown')
        ))
        
        # 评估第二个模型
        print(f"[量化 API] 评估 {mode2.value.upper()} 模型...")
        result2 = unified_model_manager.evaluate_on_testset(test_data, mode2)
        results.append(ComparisonResult(
            mode=mode2.value.upper(),
            accuracy=result2['accuracy'],
            correct=result2['correct'],
            total=result2['total'],
            avg_inference_time_ms=round(result2['avg_inference_time_ms'], 3),
            model_size_mb=round(status[f'{mode2.value}_size_mb'], 2),
            device=result2.get('device', 'unknown')
        ))
        
        # 计算性能提升
        improvement = None
        if len(results) == 2:
            r1, r2 = results[0], results[1]
            
            size_reduction = 0
            if r1.model_size_mb > 0:
                size_reduction = round((1 - r2.model_size_mb / r1.model_size_mb) * 100, 1)
            
            speed_improvement = 0
            if r2.avg_inference_time_ms > 0:
                speed_improvement = round(((r1.avg_inference_time_ms / r2.avg_inference_time_ms) - 1) * 100, 1)
            
            accuracy_loss = round((r1.accuracy - r2.accuracy) * 100, 2)
            
            improvement = Improvement(
                size_reduction_percent=size_reduction,
                speed_improvement_percent=speed_improvement,
                accuracy_loss_percent=accuracy_loss
            )
        
        experiment_time = time.time() - start_time
        
        print(f"[量化 API] 对比实验完成，耗时：{experiment_time:.2f}s")
        
        return ComparisonResponse(
            success=True,
            message=f"对比实验完成，共评估 {len(test_data)} 条数据",
            comparison_type=request.comparison_type.value,
            results=results,
            improvement=improvement,
            experiment_time=round(experiment_time, 2)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[量化 API] 对比实验失败：{str(e)}")
        raise HTTPException(status_code=500, detail=f"对比实验失败：{str(e)}")
