export const API_BASE_URL = 'http://localhost:8000';

export const API_ENDPOINTS = {
  text: `${API_BASE_URL}/api/text`,
  audio: `${API_BASE_URL}/api/audio`,
  training: `${API_BASE_URL}/api/training`,
  performance: `${API_BASE_URL}/api/performance`,
  evaluation: `${API_BASE_URL}/api/evaluation`,
  dictionary: `${API_BASE_URL}/api/dictionary`,
  api: `${API_BASE_URL}/api`,
};

export const EVALUATION_ENDPOINTS = {
  upload: `${API_BASE_URL}/api/evaluation/upload`,
  run: `${API_BASE_URL}/api/evaluation/run`,
  status: `${API_BASE_URL}/api/evaluation/status`,
  results: `${API_BASE_URL}/api/evaluation/results`,
};

// ==================== 混合分析类型定义 ====================

/**
 * 混合分析策略类型
 * - cascade: 级联加速（简单案例用词典，复杂案例用深度学习）
 * - weighted: 置信度加权（根据两种方法的置信度动态混合结果）
 * - rule_based: 规则修正（用词典规则修正深度学习的明显错误）
 */
export type HybridStrategy = 'cascade' | 'weighted' | 'rule_based';

/**
 * 混合分析请求接口
 */
export interface HybridAnalysisRequest {
  /** 待分析的文本内容 */
  text: string;
  /** 混合策略，默认为 'cascade' */
  strategy?: HybridStrategy;
  /** 可选配置参数 */
  config?: Record<string, any>;
}

/**
 * 混合分析统计信息
 */
export interface HybridStats {
  /** 总预测次数 */
  total_predictions: number;
  /** 级联快速路径次数（使用词典方法） */
  cascade_fast_path: number;
  /** 级联慢速路径次数（使用深度学习方法） */
  cascade_slow_path: number;
  /** 快速路径占比（越高越快） */
  fast_path_ratio: number;
}

/**
 * 混合分析响应接口
 */
export interface HybridAnalysisResponse {
  /** 情感标签：positive, negative, neutral */
  sentiment: string;
  /** 置信度（0-1 之间） */
  confidence: number;
  /** 各情感类别的得分 */
  scores: Record<string, number>;
  /** 使用的分析方法：lexicon_fast 或 cascade_fusion */
  method: string;
  /** 推理耗时（毫秒） */
  inference_time_ms: number;
  /** 混合分析统计信息 */
  hybrid_stats?: HybridStats;
  /** 混合策略类型 */
  hybrid_strategy?: string;
  /** 词典分析结果（可选） */
  lexicon_result?: Record<string, any>;
  /** RoBERTa 模型分析结果（可选） */
  roberta_result?: Record<string, any>;
}

/**
 * 混合分析 API 端点
 */
export const HYBRID_ENDPOINTS = {
  analyze: `${API_BASE_URL}/api/text/analyze/hybrid`,
};
