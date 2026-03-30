/**
 * 量化实验相关类型定义
 * @fileoverview 定义量化实验功能所需的 TypeScript 类型
 */

// ==================== 基础类型 ====================

/** 量化精度模式 */
export type PrecisionMode = 'FP32' | 'INT8';

// ==================== 接口定义 ====================

/** GPU 显存信息 */
export interface GpuMemoryInfo {
  total_mb: number;
  allocated_mb: number;
  reserved_mb: number;
  free_mb: number;
  percent: number;
  gpu_name: string;
  cuda_available: boolean;
}

/** 量化状态信息 */
export interface QuantizationStatus {
  mode: PrecisionMode;
  model_path: string;
  model_size_mb: number;
  quantization_completed: boolean;
  quantization_time: number;
  last_error: string;
}

/** 量化结果 */
export interface QuantizationResult {
  success: boolean;
  original_size_mb: number;
  quantized_size_mb: number;
  size_reduction_percent: number;
  quantization_time: number;
  message: string;
  error?: string;
}

/** 模型精度对比结果 */
export interface ModelComparison {
  available: boolean;
  fp32: {
    accuracy: number;
    inference_time_ms: number;
    memory_usage_mb: number;
    model_size_mb: number;
  };
  int8: {
    accuracy: number;
    inference_time_ms: number;
    memory_usage_mb: number;
    model_size_mb: number;
  };
  improvement: {
    size_reduction_percent: number;
    inference_speedup_percent: number;
    memory_reduction_percent: number;
    accuracy_change_percent: number;
  };
}

/** 量化 API 响应类型 */
export interface QuantizationStatusResponse {
  mode: PrecisionMode;
  model_path: string;
  model_size_mb: number;
  quantization_completed: boolean;
  quantization_time: number;
  last_error: string;
}

export interface QuantizationResponse {
  success: boolean;
  message: string;
  original_size_mb: number;
  quantized_size_mb: number;
  size_reduction_percent: number;
  quantization_time: number;
}

export interface SwitchModeResponse {
  success: boolean;
  message: string;
  current_mode: PrecisionMode;
}

export interface CompareResponse {
  available: boolean;
  fp32: ModelComparison['fp32'];
  int8: ModelComparison['int8'];
  improvement: ModelComparison['improvement'];
}
