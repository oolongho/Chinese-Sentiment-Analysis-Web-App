/**
 * 训练模块类型定义
 * 包含词典管理、模型训练、外部API配置等相关类型
 */

// 词典相关类型
export interface DictionaryWord {
  word: string;
  score: number;
}

export interface DictionaryStats {
  positive_count: number;
  negative_count: number;
  degree_count: number;
  negation_count: number;
}

export type DictionaryType = 'positive' | 'negative' | 'degree' | 'negation';

export interface DictionaryConfig {
  name: string;
  color: string;
  bgClass: string;
  scoreRange: string;
  hasScore: boolean;
}

export const DICTIONARY_CONFIG: Record<DictionaryType, DictionaryConfig> = {
  positive: { 
    name: '正面词典', 
    color: 'green', 
    bgClass: 'from-green-500 to-emerald-400', 
    scoreRange: '1-3', 
    hasScore: true 
  },
  negative: { 
    name: '负面词典', 
    color: 'red', 
    bgClass: 'from-red-500 to-rose-400', 
    scoreRange: '-3 到 -1', 
    hasScore: true 
  },
  degree: { 
    name: '程度副词', 
    color: 'blue', 
    bgClass: 'from-blue-500 to-cyan-400', 
    scoreRange: '0.1-3.0', 
    hasScore: true 
  },
  negation: { 
    name: '否定词', 
    color: 'purple', 
    bgClass: 'from-purple-500 to-pink-400', 
    scoreRange: '', 
    hasScore: false 
  }
};

// 训练相关类型
export interface TrainingParams {
  epochs: number;
  batch_size: number;
  learning_rate: number;
  max_length: number;
  warmup_ratio: number;
  weight_decay: number;
}

export interface TrainingStatus {
  status: string;
  progress: number;
  current_epoch: number;
  total_epochs: number;
  metrics: Record<string, number>;
  message: string;
  error?: string;
  gpu_memory?: {
    current_mb: number;
    peak_mb: number;
  };
}

export interface TrainingHistory {
  epochs: number[];
  train_loss: (number | null)[];
  eval_loss: (number | null)[];
  accuracy: (number | null)[];
  f1: (number | null)[];
  learning_rate: (number | null)[];
}

export interface CachedTrainingResult {
  status: string;
  completed_at: string;
  metrics: Record<string, number>;
  history: TrainingHistory;
  gpu_memory_peak_mb: number;
  params: TrainingParams;
  error?: string;
}

export interface UploadedData {
  uploaded: boolean;
  count: number;
  filepath?: string;
  columns?: string[];
  is_default?: boolean;
}

// 外部API配置类型
export interface ExternalApiConfig {
  text_enabled: boolean;
  text_api_key: string;
  text_base_url: string;
  text_model: string;
  audio_enabled: boolean;
  audio_api_key: string;
  audio_base_url: string;
  audio_model: string;
}

// Tab 类型
export type TrainingTabType = 'training' | 'dictionary' | 'external' | 'evaluation' | 'ablation';
