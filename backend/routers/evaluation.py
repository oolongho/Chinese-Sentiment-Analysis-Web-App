# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
模型评估路由
功能：
1. 上传测试数据集进行评估
2. 计算准确率、精确率、召回率、F1分数
3. 将评估结果存储到性能统计系统
"""

import os
import asyncio
import threading
import time
import pandas as pd
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from pydantic import BaseModel
from typing import Dict, List, Optional
from collections import Counter
from io import StringIO

from config import DATA_DIR
from sentiment import LexiconAnalyzer, ModelAnalyzer
from sentiment.hybrid_analyzer import HybridAnalyzer, HybridStrategy
from services import call_text_api
from routers.performance import update_model_metrics
from utils.logger import get_logger
from utils.auth import get_current_user

logger = get_logger('sentiment_analysis')

router = APIRouter(prefix='/api/evaluation', tags=['模型评估'])

lexicon_analyzer = LexiconAnalyzer()
model_analyzer = ModelAnalyzer()
hybrid_analyzer = HybridAnalyzer(strategy=HybridStrategy.CASCADE)

evaluation_status = {
    'running': False,
    'progress': 0,
    'total': 0,
    'current_analyzer': '',
    'results': None,
    'error': None,
    'error_samples': {
        'model': [],
        'lexicon': [],
        'external': [],
        'hybrid': []
    },
    'gpu_memory': {
        'current_mb': 0,
        'peak_mb': 0
    },
    'response_times': {
        'model': [],
        'lexicon': [],
        'external': [],
        'hybrid': []
    },
    'all_predictions': [],
    'precision_mode': 'FP32',  # 当前评估使用的模型精度模式
    'hybrid_stats': None,  # hybrid 模型统计信息
    'hybrid_config': None  # hybrid 模型配置信息
}


class EvaluationResult(BaseModel):
    accuracy: float
    precision: float
    recall: float
    f1_score: float
    total_samples: int
    correct_predictions: int


class HybridEvaluationResult(EvaluationResult):
    fast_path_ratio: float
    lexicon_threshold: float
    lexicon_score_threshold: float


class EvaluationResponse(BaseModel):
    model: Optional[EvaluationResult] = None
    lexicon: Optional[EvaluationResult] = None
    external: Optional[EvaluationResult] = None
    hybrid: Optional[HybridEvaluationResult] = None


def calculate_metrics(y_true: List[str], y_pred: List[str]) -> Dict:
    labels = ['正面', '负面', '中性']
    
    correct = sum(1 for t, p in zip(y_true, y_pred) if t == p)
    total = len(y_true)
    accuracy = correct / total if total > 0 else 0
    
    label_metrics = {}
    for label in labels:
        tp = sum(1 for t, p in zip(y_true, y_pred) if t == label and p == label)
        fp = sum(1 for t, p in zip(y_true, y_pred) if t != label and p == label)
        fn = sum(1 for t, p in zip(y_true, y_pred) if t == label and p != label)
        
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0
        
        label_metrics[label] = {
            'precision': precision,
            'recall': recall,
            'f1': f1,
            'support': sum(1 for t in y_true if t == label)
        }
    
    total_support = sum(label_metrics[l]['support'] for l in labels)
    macro_precision = sum(label_metrics[l]['precision'] for l in labels) / len(labels)
    macro_recall = sum(label_metrics[l]['recall'] for l in labels) / len(labels)
    macro_f1 = sum(label_metrics[l]['f1'] for l in labels) / len(labels)
    
    weighted_precision = sum(label_metrics[l]['precision'] * label_metrics[l]['support'] for l in labels) / total_support if total_support > 0 else 0
    weighted_recall = sum(label_metrics[l]['recall'] * label_metrics[l]['support'] for l in labels) / total_support if total_support > 0 else 0
    weighted_f1 = sum(label_metrics[l]['f1'] * label_metrics[l]['support'] for l in labels) / total_support if total_support > 0 else 0
    
    confusion_matrix = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    label_to_idx = {'正面': 0, '负面': 1, '中性': 2}
    for t, p in zip(y_true, y_pred):
        if t in label_to_idx and p in label_to_idx:
            confusion_matrix[label_to_idx[t]][label_to_idx[p]] += 1
    
    return {
        'accuracy': accuracy,
        'precision': weighted_precision,
        'recall': weighted_recall,
        'f1_score': weighted_f1,
        'macro_precision': macro_precision,
        'macro_recall': macro_recall,
        'macro_f1': macro_f1,
        'total_samples': total,
        'correct_predictions': correct,
        'label_metrics': label_metrics,
        'confusion_matrix': confusion_matrix
    }


def run_evaluation_with_error_handling(test_data: List[Dict], include_external: bool = False):
    """包装函数，用于捕获线程中的异常"""
    logger.info(f"评估线程开始执行，数据量：{len(test_data)}")
    try:
        run_evaluation_sync(test_data, include_external)
        logger.info("评估线程执行完成")
    except Exception as e:
        logger.error(f"评估线程执行失败：{str(e)}", exc_info=True)
        evaluation_status['running'] = False
        evaluation_status['error'] = f'评估执行失败：{str(e)}'


def run_evaluation_sync(test_data: List[Dict], include_external: bool = False):
    global evaluation_status
    
    gpu_memory_peak = 0.0
    
    try:
        logger.info(f"开始执行评估，共 {len(test_data)} 条数据")
        from sentiment import get_model_analyzer
        current_analyzer = get_model_analyzer()
        precision_mode = current_analyzer.get_precision()
        
        lexicon_analyzer.reload()
        
        from services.system_monitor import system_monitor
        from services.cache_service import save_evaluation_cache
        
        texts = [item['文本'] for item in test_data]
        labels = [item['标签'] for item in test_data]
        total = len(texts)
        
        evaluation_status['total'] = total
        evaluation_status['running'] = True
        evaluation_status['error'] = None
        evaluation_status['error_samples'] = {'model': [], 'lexicon': [], 'external': [], 'hybrid': []}
        evaluation_status['gpu_memory'] = {'current_mb': 0, 'peak_mb': 0}
        evaluation_status['response_times'] = {'model': [], 'lexicon': [], 'external': [], 'hybrid': []}
        evaluation_status['all_predictions'] = []
        evaluation_status['precision_mode'] = precision_mode  # 记录当前精度模式
        evaluation_status['hybrid_stats'] = None  # 重置 hybrid 统计信息
        evaluation_status['hybrid_config'] = None  # 重置 hybrid 配置信息
        
        results = {}
        all_predictions = []
        
        evaluation_status['current_analyzer'] = 'model'
        evaluation_status['progress'] = 0
        model_predictions = []
        model_times = []
        for i, text in enumerate(texts):
            start_time = time.time()
            result = model_analyzer.predict(text)
            elapsed_time = (time.time() - start_time) * 1000  # 转换为毫秒
            model_times.append(elapsed_time)
            
            model_predictions.append(result['sentiment'])
            all_predictions.append({
                'text': text,
                'true_label': labels[i],
                'model_pred': result['sentiment'],
                'model_time': elapsed_time
            })
            if labels[i] != result['sentiment']:
                evaluation_status['error_samples']['model'].append({
                    'text': text,
                    'true_label': labels[i],
                    'pred_label': result['sentiment'],
                    'confidence': result.get('confidence', 0)
                })
            evaluation_status['progress'] = i + 1
            
            gpu_info = system_monitor.get_gpu_memory_info()
            current_mb = gpu_info.allocated_mb
            if current_mb > gpu_memory_peak:
                gpu_memory_peak = current_mb
            evaluation_status['gpu_memory'] = {'current_mb': current_mb, 'peak_mb': gpu_memory_peak}
            
        results['model'] = calculate_metrics(labels, model_predictions)
        results['model']['avg_response_time'] = sum(model_times) / len(model_times) if model_times else 0
        evaluation_status['response_times']['model'] = model_times
        
        evaluation_status['current_analyzer'] = 'lexicon'
        evaluation_status['progress'] = 0
        lexicon_predictions = []
        lexicon_times = []
        for i, text in enumerate(texts):
            start_time = time.time()
            result = lexicon_analyzer.analyze(text)
            elapsed_time = (time.time() - start_time) * 1000  # 转换为毫秒
            lexicon_times.append(elapsed_time)
            
            lexicon_predictions.append(result['sentiment'])
            all_predictions[i]['lexicon_pred'] = result['sentiment']
            all_predictions[i]['lexicon_time'] = elapsed_time
            if labels[i] != result['sentiment']:
                evaluation_status['error_samples']['lexicon'].append({
                    'text': text,
                    'true_label': labels[i],
                    'pred_label': result['sentiment'],
                    'score': result.get('score', 0)
                })
            evaluation_status['progress'] = i + 1
        results['lexicon'] = calculate_metrics(labels, lexicon_predictions)
        results['lexicon']['avg_response_time'] = sum(lexicon_times) / len(lexicon_times) if lexicon_times else 0
        evaluation_status['response_times']['lexicon'] = lexicon_times
        
        # Hybrid 模型评估
        evaluation_status['current_analyzer'] = 'hybrid'
        evaluation_status['progress'] = 0
        hybrid_predictions = []
        hybrid_times = []
        hybrid_analyzer.reset_stats()  # 重置统计信息
        
        for i, text in enumerate(texts):
            start_time = time.time()
            result = hybrid_analyzer.predict(text)
            elapsed_time = (time.time() - start_time) * 1000  # 转换为毫秒
            hybrid_times.append(elapsed_time)
            
            hybrid_predictions.append(result['sentiment'])
            all_predictions[i]['hybrid_pred'] = result['sentiment']
            all_predictions[i]['hybrid_time'] = elapsed_time
            all_predictions[i]['hybrid_method'] = result.get('method', '')
            
            if labels[i] != result['sentiment']:
                evaluation_status['error_samples']['hybrid'].append({
                    'text': text,
                    'true_label': labels[i],
                    'pred_label': result['sentiment'],
                    'confidence': result.get('confidence', 0),
                    'method': result.get('method', '')
                })
            evaluation_status['progress'] = i + 1
        
        results['hybrid'] = calculate_metrics(labels, hybrid_predictions)
        results['hybrid']['avg_response_time'] = sum(hybrid_times) / len(hybrid_times) if hybrid_times else 0
        
        # 添加 hybrid 模型特有指标
        hybrid_stats = hybrid_analyzer.get_stats()
        results['hybrid']['fast_path_ratio'] = hybrid_stats['fast_path_ratio']
        results['hybrid']['lexicon_threshold'] = hybrid_analyzer.config.get('lexicon_threshold', 0.75)
        results['hybrid']['lexicon_score_threshold'] = hybrid_analyzer.config.get('lexicon_score_threshold', 2.0)
        
        evaluation_status['response_times']['hybrid'] = hybrid_times
        evaluation_status['hybrid_stats'] = hybrid_stats
        evaluation_status['hybrid_config'] = {
            'strategy': 'cascade',
            'lexicon_threshold': hybrid_analyzer.config.get('lexicon_threshold', 0.75),
            'lexicon_score_threshold': hybrid_analyzer.config.get('lexicon_score_threshold', 2.0)
        }
        
        if include_external:
            evaluation_status['current_analyzer'] = 'external'
            evaluation_status['progress'] = 0
            external_predictions = []
            external_times = []
            
            async def run_external():
                for i, text in enumerate(texts):
                    start_time = time.time()
                    result = await call_text_api(text)
                    elapsed_time = (time.time() - start_time) * 1000  # 转换为毫秒
                    external_times.append(elapsed_time)
                    
                    if result.get('success') and result.get('sentiment'):
                        external_predictions.append(result['sentiment'])
                        all_predictions[i]['external_pred'] = result['sentiment']
                        all_predictions[i]['external_time'] = elapsed_time
                        if labels[i] != result['sentiment']:
                            evaluation_status['error_samples']['external'].append({
                                'text': text,
                                'true_label': labels[i],
                                'pred_label': result['sentiment']
                            })
                    else:
                        external_predictions.append('中性')
                        all_predictions[i]['external_pred'] = '中性'
                        all_predictions[i]['external_time'] = elapsed_time
                    evaluation_status['progress'] = i + 1
            
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(run_external())
            loop.close()
            
            results['external'] = calculate_metrics(labels, external_predictions)
            results['external']['avg_response_time'] = sum(external_times) / len(external_times) if external_times else 0
            evaluation_status['response_times']['external'] = external_times
        
        for analyzer_type in ['model', 'lexicon']:
            if analyzer_type in results:
                update_model_metrics(analyzer_type, {
                    'accuracy': results[analyzer_type]['accuracy'],
                    'precision': results[analyzer_type]['precision'],
                    'recall': results[analyzer_type]['recall'],
                    'f1_score': results[analyzer_type]['f1_score']
                })
        
        evaluation_status['results'] = results
        evaluation_status['all_predictions'] = all_predictions
        evaluation_status['running'] = False
        evaluation_status['progress'] = total
        evaluation_status['gpu_memory'] = {'current_mb': 0, 'peak_mb': gpu_memory_peak}
        
        save_evaluation_cache(
            results=results,
            error_samples=evaluation_status['error_samples'],
            gpu_memory_peak_mb=gpu_memory_peak,
            data_info={'total': total},
            all_predictions=all_predictions,
            response_times=evaluation_status['response_times'],
            precision_mode=precision_mode  # 保存精度模式
        )
        
    except Exception as e:
        logger.error(f"评估执行失败：{str(e)}", exc_info=True)
        evaluation_status['running'] = False
        evaluation_status['error'] = str(e)


@router.post('/upload')
async def upload_test_data(
    file: UploadFile = File(...),
    _: bool = Depends(get_current_user)
):
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail='请上传 Excel 文件 (.xlsx 或 .xls)')
    
    try:
        content = await file.read()
        df = pd.read_excel(content)
        
        if '文本' not in df.columns:
            raise HTTPException(status_code=400, detail='数据文件必须包含"文本"列')
        if '标签' not in df.columns:
            raise HTTPException(status_code=400, detail='数据文件必须包含"标签"列')
        
        df = df.dropna(subset=['文本', '标签'])
        df['标签'] = df['标签'].apply(lambda x: str(x).strip())
        
        valid_labels = ['正面', '负面', '中性']
        df = df[df['标签'].isin(valid_labels)]
        
        test_data = df[['文本', '标签']].to_dict('records')
        
        save_path = os.path.join(DATA_DIR, 'evaluation_data.xlsx')
        df.to_excel(save_path, index=False)
        
        return {
            'success': True,
            'message': f'成功上传 {len(test_data)} 条测试数据',
            'total': len(test_data),
            'label_distribution': dict(Counter(df['标签'].tolist()))
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'处理文件失败: {str(e)}')


@router.post('/run')
async def run_evaluation(
    include_external: bool = False,
    _: bool = Depends(get_current_user)
):
    global evaluation_status
    
    if evaluation_status['running']:
        return {'success': False, 'message': '评估正在进行中，请稍候'}
    
    test_file = os.path.join(DATA_DIR, 'evaluation_data.xlsx')
    if not os.path.exists(test_file):
        return {'success': False, 'message': '请先上传测试数据'}
    
    try:
        df = pd.read_excel(test_file)
        test_data = df[['文本', '标签']].to_dict('records')
        
        if len(test_data) == 0:
            return {'success': False, 'message': '测试数据为空'}
        
        thread = threading.Thread(
            target=run_evaluation_with_error_handling,
            args=(test_data, include_external),
            daemon=True
        )
        thread.start()
        logger.info(f"评估线程已启动，线程 ID: {thread.ident}")
        
        return {
            'success': True,
            'message': f'开始评估 {len(test_data)} 条数据',
            'total': len(test_data)
        }
        
    except Exception as e:
        return {'success': False, 'message': f'启动评估失败: {str(e)}'}


@router.get('/status')
async def get_evaluation_status():
    """获取评估状态"""
    return {
        'running': evaluation_status['running'],
        'progress': evaluation_status['progress'],
        'total': evaluation_status['total'],
        'current_analyzer': evaluation_status['current_analyzer'],
        'error': evaluation_status['error'],
        'gpu_memory': evaluation_status.get('gpu_memory', {'current_mb': 0, 'peak_mb': 0}),
        'precision_mode': evaluation_status.get('precision_mode', 'FP32')  # 新增精度模式字段
    }


@router.get('/results')
async def get_evaluation_results():
    """获取评估结果"""
    if evaluation_status['results'] is None:
        return {'success': False, 'message': '暂无评估结果'}
    
    results = evaluation_status['results']
    precision_mode = evaluation_status.get('precision_mode', 'FP32')
    
    return {
        'success': True,
        'precision_mode': precision_mode,  # 新增精度模式字段
        'model': {
            'accuracy': results['model']['accuracy'],
            'precision': results['model']['precision'],
            'recall': results['model']['recall'],
            'f1_score': results['model']['f1_score'],
            'total_samples': results['model']['total_samples'],
            'correct_predictions': results['model']['correct_predictions'],
            'avg_response_time': results['model'].get('avg_response_time', 0),
            'confusion_matrix': results['model'].get('confusion_matrix', [[0,0,0],[0,0,0],[0,0,0]])
        } if 'model' in results else None,
        'lexicon': {
            'accuracy': results['lexicon']['accuracy'],
            'precision': results['lexicon']['precision'],
            'recall': results['lexicon']['recall'],
            'f1_score': results['lexicon']['f1_score'],
            'total_samples': results['lexicon']['total_samples'],
            'correct_predictions': results['lexicon']['correct_predictions'],
            'avg_response_time': results['lexicon'].get('avg_response_time', 0),
            'confusion_matrix': results['lexicon'].get('confusion_matrix', [[0,0,0],[0,0,0],[0,0,0]])
        } if 'lexicon' in results else None,
        'hybrid': {
            'accuracy': results['hybrid']['accuracy'],
            'precision': results['hybrid']['precision'],
            'recall': results['hybrid']['recall'],
            'f1_score': results['hybrid']['f1_score'],
            'total_samples': results['hybrid']['total_samples'],
            'correct_predictions': results['hybrid']['correct_predictions'],
            'avg_response_time': results['hybrid'].get('avg_response_time', 0),
            'confusion_matrix': results['hybrid'].get('confusion_matrix', [[0,0,0],[0,0,0],[0,0,0]]),
            'fast_path_ratio': results['hybrid'].get('fast_path_ratio', 0),
            'lexicon_threshold': results['hybrid'].get('lexicon_threshold', 0.75),
            'lexicon_score_threshold': results['hybrid'].get('lexicon_score_threshold', 2.0)
        } if 'hybrid' in results else None,
        'external': {
            'accuracy': results['external']['accuracy'],
            'precision': results['external']['precision'],
            'recall': results['external']['recall'],
            'f1_score': results['external']['f1_score'],
            'total_samples': results['external']['total_samples'],
            'correct_predictions': results['external']['correct_predictions'],
            'avg_response_time': results['external'].get('avg_response_time', 0),
            'confusion_matrix': results['external'].get('confusion_matrix', [[0,0,0],[0,0,0],[0,0,0]])
        } if 'external' in results else None
    }


@router.get('/error-samples')
async def get_error_samples(analyzer: str = 'model', limit: int = 20):
    """获取错误分类样本"""
    if analyzer not in ['model', 'lexicon', 'external', 'hybrid']:
        return {'success': False, 'message': '无效的分析器类型'}
    
    samples = evaluation_status['error_samples'].get(analyzer, [])
    return {
        'success': True,
        'analyzer': analyzer,
        'total_errors': len(samples),
        'samples': samples[:limit]
    }


@router.post('/reset')
async def reset_evaluation(_: bool = Depends(get_current_user)):
    global evaluation_status
    evaluation_status = {
        'running': False,
        'progress': 0,
        'total': 0,
        'current_analyzer': '',
        'results': None,
        'error': None,
        'error_samples': {
            'model': [],
            'lexicon': [],
            'external': [],
            'hybrid': []
        },
        'gpu_memory': {
            'current_mb': 0,
            'peak_mb': 0
        },
        'response_times': {
            'model': [],
            'lexicon': [],
            'external': [],
            'hybrid': []
        },
        'all_predictions': [],
        'precision_mode': 'FP32',
        'hybrid_stats': None,
        'hybrid_config': None
    }
    return {'success': True, 'message': '评估状态已重置'}


@router.get('/cached-result')
async def get_cached_evaluation_result():
    """获取缓存的评估结果"""
    from services.cache_service import load_evaluation_cache
    cached = load_evaluation_cache()
    return {
        'success': cached is not None,
        'cached_result': cached
    }


@router.post('/clear-cache')
async def clear_evaluation_cache():
    """清除评估缓存"""
    from services.cache_service import clear_evaluation_cache
    clear_evaluation_cache()
    return {'success': True, 'message': '评估缓存已清除'}


@router.get('/export')
async def export_evaluation_results(format: str = 'csv'):
    """
    导出评估结果
    format: csv - 导出CSV格式的详细结果
    """
    if evaluation_status['results'] is None:
        raise HTTPException(status_code=400, detail='暂无评估结果可导出')
    
    try:
        results = evaluation_status['results']
        all_predictions = evaluation_status.get('all_predictions', [])
        
        # 创建指标对比表
        metrics_data = []
        analyzer_names = {
            'model': '深度学习模型',
            'lexicon': '情感词典',
            'hybrid': '混合模型',
            'external': '外部 API'
        }
        
        for key, name in analyzer_names.items():
            if key in results:
                metrics_data.append({
                    '分析器': name,
                    '准确率': f"{results[key]['accuracy'] * 100:.2f}%",
                    '精确率': f"{results[key]['precision'] * 100:.2f}%",
                    '召回率': f"{results[key]['recall'] * 100:.2f}%",
                    'F1 分数': f"{results[key]['f1_score'] * 100:.2f}%",
                    '平均响应时间 (ms)': f"{results[key].get('avg_response_time', 0):.2f}",
                    '样本数': results[key]['total_samples']
                })
        
        metrics_df = pd.DataFrame(metrics_data)
        
        # 创建详细预测结果表
        if all_predictions:
            detail_data = []
            for pred in all_predictions:
                row = {
                    '文本': pred['text'],
                    '真实标签': pred['true_label'],
                    '深度学习模型预测': pred.get('model_pred', ''),
                    '深度学习模型响应时间 (ms)': f"{pred.get('model_time', 0):.2f}",
                    '情感词典预测': pred.get('lexicon_pred', ''),
                    '情感词典响应时间 (ms)': f"{pred.get('lexicon_time', 0):.2f}",
                    '混合模型预测': pred.get('hybrid_pred', ''),
                    '混合模型响应时间 (ms)': f"{pred.get('hybrid_time', 0):.2f}",
                    '混合模型方法': pred.get('hybrid_method', '')
                }
                if 'external_pred' in pred:
                    row['外部 API 预测'] = pred['external_pred']
                    row['外部 API 响应时间 (ms)'] = f"{pred.get('external_time', 0):.2f}"
                detail_data.append(row)
            
            detail_df = pd.DataFrame(detail_data)
        
        # 生成CSV
        output = StringIO()
        
        # 写入指标对比表
        output.write('# 三通道对比实验结果\n')
        metrics_df.to_csv(output, index=False, encoding='utf-8-sig')
        
        if all_predictions:
            output.write('\n# 详细预测结果\n')
            detail_df.to_csv(output, index=False, encoding='utf-8-sig')
        
        output.seek(0)
        content = output.getvalue()
        output.close()
        
        return {
            'success': True,
            'content': content,
            'filename': f'三通道对比实验结果_{pd.Timestamp.now().strftime("%Y%m%d_%H%M%S")}.csv'
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'导出失败: {str(e)}')


@router.post('/charts')
async def generate_evaluation_charts():
    """
    生成评估对比图表
    返回图表的base64编码
    """
    if evaluation_status['results'] is None:
        raise HTTPException(status_code=400, detail='暂无评估结果可生成图表')
    
    try:
        import matplotlib.pyplot as plt
        import numpy as np
        import base64
        from io import BytesIO
        
        # 设置中文字体
        plt.rcParams['font.sans-serif'] = ['SimHei', 'DejaVu Sans']
        plt.rcParams['axes.unicode_minus'] = False
        
        results = evaluation_status['results']
        
        # 准备数据
        analyzers = []
        accuracy = []
        precision = []
        recall = []
        f1_score = []
        response_time = []
        
        analyzer_names = {
            'model': '深度学习模型',
            'lexicon': '情感词典',
            'hybrid': '混合模型',
            'external': '外部 API'
        }
        
        for key in ['model', 'lexicon', 'hybrid', 'external']:
            if key in results:
                analyzers.append(analyzer_names[key])
                accuracy.append(results[key]['accuracy'] * 100)
                precision.append(results[key]['precision'] * 100)
                recall.append(results[key]['recall'] * 100)
                f1_score.append(results[key]['f1_score'] * 100)
                response_time.append(results[key].get('avg_response_time', 0))
        
        # 创建图表
        fig = plt.figure(figsize=(16, 10))
        
        # 1. 指标对比柱状图
        ax1 = plt.subplot(2, 2, 1)
        x = np.arange(len(analyzers))
        width = 0.2
        
        ax1.bar(x - 1.5*width, accuracy, width, label='准确率', color='#3b82f6')
        ax1.bar(x - 0.5*width, precision, width, label='精确率', color='#10b981')
        ax1.bar(x + 0.5*width, recall, width, label='召回率', color='#f59e0b')
        ax1.bar(x + 1.5*width, f1_score, width, label='F1分数', color='#8b5cf6')
        
        ax1.set_ylabel('百分比 (%)')
        ax1.set_title('(a) 三通道性能指标对比')
        ax1.set_xticks(x)
        ax1.set_xticklabels(analyzers)
        ax1.legend()
        ax1.grid(axis='y', alpha=0.3)
        ax1.set_ylim(0, 100)
        
        # 2. 响应时间对比（对数刻度）
        ax2 = plt.subplot(2, 2, 2)
        colors = ['#3b82f6', '#8b5cf6', '#10b981']
        bars = ax2.bar(analyzers, response_time, color=colors[:len(analyzers)])
        ax2.set_ylabel('平均响应时间 (ms)')
        ax2.set_title('(b) 响应时间对比')
        ax2.set_yscale('log')
        ax2.grid(axis='y', alpha=0.3)
        
        # 在柱子上添加数值
        for bar, time in zip(bars, response_time):
            height = bar.get_height()
            ax2.text(bar.get_x() + bar.get_width()/2., height,
                     f'{time:.1f}ms', ha='center', va='bottom', fontsize=9)
        
        # 3. 雷达图
        ax3 = plt.subplot(2, 2, 3, projection='polar')
        categories = ['准确率', '精确率', '召回率', 'F1分数']
        N = len(categories)
        
        angles = [n / float(N) * 2 * np.pi for n in range(N)]
        angles += angles[:1]
        
        colors_radar = ['#3b82f6', '#8b5cf6', '#10b981']
        for i, (analyzer, color) in enumerate(zip(analyzers, colors_radar)):
            values = [accuracy[i], precision[i], recall[i], f1_score[i]]
            values += values[:1]
            ax3.plot(angles, values, 'o-', linewidth=2, label=analyzer, color=color)
            ax3.fill(angles, values, alpha=0.15, color=color)
        
        ax3.set_xticks(angles[:-1])
        ax3.set_xticklabels(categories)
        ax3.set_ylim(0, 100)
        ax3.set_title('(c) 多维度性能雷达图', pad=20)
        ax3.legend(loc='upper right', bbox_to_anchor=(1.3, 1.0))
        ax3.grid(True)
        
        # 4. 准确率与响应时间散点图
        ax4 = plt.subplot(2, 2, 4)
        scatter_colors = ['#3b82f6', '#8b5cf6', '#10b981']
        for i, (analyzer, color) in enumerate(zip(analyzers, scatter_colors)):
            ax4.scatter(response_time[i], accuracy[i], s=200, c=color, label=analyzer, alpha=0.7)
            ax4.annotate(analyzer, (response_time[i], accuracy[i]), 
                        xytext=(5, 5), textcoords='offset points', fontsize=9)
        
        ax4.set_xlabel('平均响应时间 (ms)')
        ax4.set_ylabel('准确率 (%)')
        ax4.set_title('(d) 准确率-响应时间权衡')
        ax4.set_xscale('log')
        ax4.grid(True, alpha=0.3)
        ax4.legend()
        
        plt.suptitle('三通道情感分析对比实验结果', fontsize=16, fontweight='bold')
        plt.tight_layout()
        
        # 保存为PNG
        buffer = BytesIO()
        plt.savefig(buffer, format='png', dpi=300, bbox_inches='tight', facecolor='white')
        buffer.seek(0)
        png_base64 = base64.b64encode(buffer.read()).decode('utf-8')
        buffer.close()
        plt.close()
        
        return {
            'success': True,
            'png_base64': png_base64
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'生成图表失败：{str(e)}')


@router.post('/hybrid/config')
async def configure_hybrid_analyzer(config: dict):
    """
    配置混合分析器参数
    """
    try:
        lexicon_threshold = config.get('lexicon_threshold', 0.75)
        lexicon_score_threshold = config.get('lexicon_score_threshold', 2.0)
        
        # 更新 hybrid_analyzer 的配置
        hybrid_analyzer.config['lexicon_threshold'] = lexicon_threshold
        hybrid_analyzer.config['lexicon_score_threshold'] = lexicon_score_threshold
        
        return {
            'success': True,
            'message': '混合分析器配置已更新',
            'config': {
                'lexicon_threshold': lexicon_threshold,
                'lexicon_score_threshold': lexicon_score_threshold
            }
        }
    except Exception as e:
        return {'success': False, 'message': f'配置失败：{str(e)}'}


@router.get('/hybrid/config')
async def get_hybrid_config():
    """获取混合分析器当前配置"""
    return {
        'success': True,
        'config': {
            'lexicon_threshold': hybrid_analyzer.config.get('lexicon_threshold', 0.75),
            'lexicon_score_threshold': hybrid_analyzer.config.get('lexicon_score_threshold', 2.0)
        }
    }


@router.get('/hybrid/stats')
async def get_hybrid_stats():
    """获取混合分析器统计信息"""
    try:
        stats = hybrid_analyzer.get_stats()
        return {
            'success': True,
            'stats': stats
        }
    except Exception as e:
        return {'success': False, 'message': f'获取统计失败：{str(e)}'}
