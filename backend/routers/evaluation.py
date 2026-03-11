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
import pandas as pd
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Dict, List, Optional
from collections import Counter

from config import DATA_DIR
from sentiment import LexiconAnalyzer, ModelAnalyzer
from services import call_text_api
from routers.performance import update_model_metrics

router = APIRouter(prefix='/api/evaluation', tags=['模型评估'])

lexicon_analyzer = LexiconAnalyzer()
model_analyzer = ModelAnalyzer()

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
        'external': []
    }
}


class EvaluationResult(BaseModel):
    accuracy: float
    precision: float
    recall: float
    f1_score: float
    total_samples: int
    correct_predictions: int


class EvaluationResponse(BaseModel):
    model: Optional[EvaluationResult] = None
    lexicon: Optional[EvaluationResult] = None
    external: Optional[EvaluationResult] = None


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


def run_evaluation_sync(test_data: List[Dict], include_external: bool = False):
    global evaluation_status
    
    try:
        texts = [item['文本'] for item in test_data]
        labels = [item['标签'] for item in test_data]
        total = len(texts)
        
        evaluation_status['total'] = total
        evaluation_status['running'] = True
        evaluation_status['error'] = None
        evaluation_status['error_samples'] = {'model': [], 'lexicon': [], 'external': []}
        
        results = {}
        
        evaluation_status['current_analyzer'] = 'model'
        evaluation_status['progress'] = 0
        model_predictions = []
        for i, text in enumerate(texts):
            result = model_analyzer.predict(text)
            model_predictions.append(result['sentiment'])
            if labels[i] != result['sentiment']:
                evaluation_status['error_samples']['model'].append({
                    'text': text,
                    'true_label': labels[i],
                    'pred_label': result['sentiment'],
                    'confidence': result.get('confidence', 0)
                })
            evaluation_status['progress'] = i + 1
        results['model'] = calculate_metrics(labels, model_predictions)
        
        evaluation_status['current_analyzer'] = 'lexicon'
        evaluation_status['progress'] = 0
        lexicon_predictions = []
        for i, text in enumerate(texts):
            result = lexicon_analyzer.analyze(text)
            lexicon_predictions.append(result['sentiment'])
            if labels[i] != result['sentiment']:
                evaluation_status['error_samples']['lexicon'].append({
                    'text': text,
                    'true_label': labels[i],
                    'pred_label': result['sentiment'],
                    'score': result.get('score', 0)
                })
            evaluation_status['progress'] = i + 1
        results['lexicon'] = calculate_metrics(labels, lexicon_predictions)
        
        if include_external:
            evaluation_status['current_analyzer'] = 'external'
            evaluation_status['progress'] = 0
            external_predictions = []
            
            async def run_external():
                for i, text in enumerate(texts):
                    result = await call_text_api(text)
                    if result.get('success') and result.get('sentiment'):
                        external_predictions.append(result['sentiment'])
                        if labels[i] != result['sentiment']:
                            evaluation_status['error_samples']['external'].append({
                                'text': text,
                                'true_label': labels[i],
                                'pred_label': result['sentiment']
                            })
                    else:
                        external_predictions.append('中性')
                    evaluation_status['progress'] = i + 1
            
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(run_external())
            loop.close()
            
            results['external'] = calculate_metrics(labels, external_predictions)
        
        for analyzer_type in ['model', 'lexicon']:
            if analyzer_type in results:
                update_model_metrics(analyzer_type, {
                    'accuracy': results[analyzer_type]['accuracy'],
                    'precision': results[analyzer_type]['precision'],
                    'recall': results[analyzer_type]['recall'],
                    'f1_score': results[analyzer_type]['f1_score']
                })
        
        evaluation_status['results'] = results
        evaluation_status['running'] = False
        evaluation_status['progress'] = total
        
    except Exception as e:
        evaluation_status['running'] = False
        evaluation_status['error'] = str(e)


@router.post('/upload')
async def upload_test_data(file: UploadFile = File(...)):
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
async def run_evaluation(include_external: bool = False):
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
            target=run_evaluation_sync,
            args=(test_data, include_external),
            daemon=True
        )
        thread.start()
        
        return {
            'success': True,
            'message': f'开始评估 {len(test_data)} 条数据',
            'total': len(test_data)
        }
        
    except Exception as e:
        return {'success': False, 'message': f'启动评估失败: {str(e)}'}


@router.get('/status')
async def get_evaluation_status():
    return {
        'running': evaluation_status['running'],
        'progress': evaluation_status['progress'],
        'total': evaluation_status['total'],
        'current_analyzer': evaluation_status['current_analyzer'],
        'error': evaluation_status['error']
    }


@router.get('/results')
async def get_evaluation_results():
    if evaluation_status['results'] is None:
        return {'success': False, 'message': '暂无评估结果'}
    
    results = evaluation_status['results']
    
    return {
        'success': True,
        'model': {
            'accuracy': results['model']['accuracy'],
            'precision': results['model']['precision'],
            'recall': results['model']['recall'],
            'f1_score': results['model']['f1_score'],
            'total_samples': results['model']['total_samples'],
            'correct_predictions': results['model']['correct_predictions'],
            'confusion_matrix': results['model'].get('confusion_matrix', [[0,0,0],[0,0,0],[0,0,0]])
        } if 'model' in results else None,
        'lexicon': {
            'accuracy': results['lexicon']['accuracy'],
            'precision': results['lexicon']['precision'],
            'recall': results['lexicon']['recall'],
            'f1_score': results['lexicon']['f1_score'],
            'total_samples': results['lexicon']['total_samples'],
            'correct_predictions': results['lexicon']['correct_predictions'],
            'confusion_matrix': results['lexicon'].get('confusion_matrix', [[0,0,0],[0,0,0],[0,0,0]])
        } if 'lexicon' in results else None,
        'external': {
            'accuracy': results['external']['accuracy'],
            'precision': results['external']['precision'],
            'recall': results['external']['recall'],
            'f1_score': results['external']['f1_score'],
            'total_samples': results['external']['total_samples'],
            'correct_predictions': results['external']['correct_predictions'],
            'confusion_matrix': results['external'].get('confusion_matrix', [[0,0,0],[0,0,0],[0,0,0]])
        } if 'external' in results else None
    }


@router.get('/error-samples')
async def get_error_samples(analyzer: str = 'model', limit: int = 20):
    """获取错误分类样本"""
    if analyzer not in ['model', 'lexicon', 'external']:
        return {'success': False, 'message': '无效的分析器类型'}
    
    samples = evaluation_status['error_samples'].get(analyzer, [])
    return {
        'success': True,
        'analyzer': analyzer,
        'total_errors': len(samples),
        'samples': samples[:limit]
    }


@router.post('/reset')
async def reset_evaluation():
    global evaluation_status
    evaluation_status = {
        'running': False,
        'progress': 0,
        'total': 0,
        'current_analyzer': '',
        'results': None,
        'error': None
    }
    return {'success': True, 'message': '评估状态已重置'}
