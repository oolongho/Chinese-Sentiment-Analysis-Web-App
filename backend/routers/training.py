# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
管理平台路由
"""

import os
import json
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Header, Form
from pydantic import BaseModel

from config import (
    DATA_DIR, DICTIONARY_DIR, TRAINING_PARAMS, 
    ADMIN_PASSWORD_HASH, SECRET_KEY,
    load_external_api_config, save_external_api_config
)
from utils import verify_password, create_token, verify_token, save_upload_file, validate_excel_file
from routers.text_analysis import reload_lexicon as reload_text_lexicon
from routers.audio_analysis import reload_lexicon as reload_audio_lexicon
from services.training_service import (
    start_training, get_training_status, cancel_training, reset_training_status,
    get_training_history
)

router = APIRouter(prefix='/api/training', tags=['管理平台'])

UPLOADED_DATA_FILE = None


class LoginRequest(BaseModel):
    password: str


class TrainingParams(BaseModel):
    epochs: Optional[int] = None
    batch_size: Optional[int] = None
    learning_rate: Optional[float] = None
    max_length: Optional[int] = None
    warmup_ratio: Optional[float] = None
    weight_decay: Optional[float] = None
    label_smoothing_factor: Optional[float] = None
    lr_scheduler_type: Optional[str] = None


class DictionaryWord(BaseModel):
    type: str
    word: str
    score: float = 1.0


class RemoveWordRequest(BaseModel):
    type: str
    word: str


class ExternalApiConfig(BaseModel):
    text_api_key: Optional[str] = None
    text_base_url: Optional[str] = None
    text_model: Optional[str] = None
    audio_api_key: Optional[str] = None
    audio_base_url: Optional[str] = None
    audio_model: Optional[str] = None


def check_auth(authorization: Optional[str] = Header(None)) -> bool:
    """检查认证"""
    if not authorization:
        raise HTTPException(status_code=401, detail='未提供认证信息')
    
    token = authorization.replace('Bearer ', '') if authorization.startswith('Bearer ') else authorization
    result = verify_token(token)
    
    if not result['valid']:
        raise HTTPException(status_code=401, detail=result['error'])
    
    return True


def get_dictionary_filepath(dict_type: str) -> str:
    """获取词典文件路径"""
    files = {
        'positive': 'positive_words.txt',
        'negative': 'negative_words.txt',
        'degree': 'degree_words.txt',
        'negation': 'negation_words.txt'
    }
    if dict_type not in files:
        raise HTTPException(status_code=400, detail='无效的词典类型')
    return os.path.join(DICTIONARY_DIR, files[dict_type])


def read_dictionary(filepath: str, dict_type: str) -> list:
    """读取词典文件"""
    if not os.path.exists(filepath):
        return []
    
    words = []
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            
            if dict_type == 'negation':
                words.append({'word': line, 'score': 1})
            elif ',' in line:
                parts = line.rsplit(',', 1)
                word = parts[0]
                try:
                    score = float(parts[1])
                except ValueError:
                    score = 1.0
                words.append({'word': word, 'score': score})
    
    return words


@router.post('/login')
async def login(request: LoginRequest):
    """管理员登录"""
    if not verify_password(request.password):
        raise HTTPException(status_code=401, detail='密码错误')
    
    token = create_token()
    return {'success': True, 'token': token}


@router.get('/verify')
async def verify(authorization: Optional[str] = Header(None)):
    """验证token"""
    check_auth(authorization)
    return {'valid': True}


@router.post('/upload-data')
async def upload_training_data(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None)
):
    """上传训练数据"""
    check_auth(authorization)
    
    global UPLOADED_DATA_FILE
    
    filepath, original_name = await save_upload_file(file, 'training')
    
    valid, error, count = validate_excel_file(filepath)
    
    if not valid:
        os.remove(filepath)
        raise HTTPException(status_code=400, detail=error)
    
    UPLOADED_DATA_FILE = filepath
    
    # 读取标签分布
    import pandas as pd
    df = pd.read_excel(filepath)
    label_distribution = {}
    if '标签' in df.columns:
        label_distribution = df['标签'].value_counts().to_dict()
        # 确保三个标签都存在
        for label in ['正面', '负面', '中性']:
            if label not in label_distribution:
                label_distribution[label] = 0
    
    return {
        'success': True,
        'filename': original_name,
        'count': count,
        'filepath': filepath,
        'label_distribution': label_distribution
    }


@router.get('/uploaded-data')
async def get_uploaded_data(authorization: Optional[str] = Header(None)):
    """获取已上传的数据文件信息"""
    check_auth(authorization)
    
    def get_label_dist(df):
        if '标签' in df.columns:
            return df['标签'].value_counts().to_dict()
        return {}
    
    if UPLOADED_DATA_FILE and os.path.exists(UPLOADED_DATA_FILE):
        import pandas as pd
        df = pd.read_excel(UPLOADED_DATA_FILE)
        return {
            'uploaded': True,
            'filepath': UPLOADED_DATA_FILE,
            'count': len(df),
            'columns': df.columns.tolist(),
            'label_distribution': get_label_dist(df)
        }
    
    default_file = os.path.join(DATA_DIR, 'labeled_data.xlsx')
    if os.path.exists(default_file):
        import pandas as pd
        df = pd.read_excel(default_file)
        return {
            'uploaded': True,
            'filepath': default_file,
            'count': len(df),
            'columns': df.columns.tolist(),
            'is_default': True,
            'label_distribution': get_label_dist(df)
        }
    
    return {'uploaded': False, 'count': 0}


@router.get('/params')
async def get_training_params(authorization: Optional[str] = Header(None)):
    """获取训练参数"""
    check_auth(authorization)
    return TRAINING_PARAMS


@router.post('/params')
async def update_training_params(
    params: TrainingParams,
    authorization: Optional[str] = Header(None)
):
    """更新训练参数"""
    check_auth(authorization)
    
    global TRAINING_PARAMS
    
    if params.epochs is not None:
        TRAINING_PARAMS['epochs'] = params.epochs
    if params.batch_size is not None:
        TRAINING_PARAMS['batch_size'] = params.batch_size
    if params.learning_rate is not None:
        TRAINING_PARAMS['learning_rate'] = params.learning_rate
    if params.max_length is not None:
        TRAINING_PARAMS['max_length'] = params.max_length
    if params.warmup_ratio is not None:
        TRAINING_PARAMS['warmup_ratio'] = params.warmup_ratio
    if params.weight_decay is not None:
        TRAINING_PARAMS['weight_decay'] = params.weight_decay
    if params.label_smoothing_factor is not None:
        TRAINING_PARAMS['label_smoothing_factor'] = params.label_smoothing_factor
    if params.lr_scheduler_type is not None:
        TRAINING_PARAMS['lr_scheduler_type'] = params.lr_scheduler_type
    
    return {'success': True, 'params': TRAINING_PARAMS}


@router.post('/start')
async def start_model_training(authorization: Optional[str] = Header(None)):
    """开始模型训练"""
    check_auth(authorization)
    
    data_file = UPLOADED_DATA_FILE
    if not data_file or not os.path.exists(data_file):
        default_file = os.path.join(DATA_DIR, 'labeled_data.xlsx')
        if os.path.exists(default_file):
            data_file = default_file
        else:
            raise HTTPException(status_code=400, detail='请先上传训练数据')
    
    success = start_training(data_file, TRAINING_PARAMS)
    
    if not success:
        raise HTTPException(status_code=400, detail='已有训练任务在进行中')
    
    return {
        'success': True,
        'message': '训练任务已启动',
        'data_file': data_file
    }


@router.get('/status')
async def get_status(authorization: Optional[str] = Header(None)):
    """获取训练状态"""
    check_auth(authorization)
    return get_training_status()


@router.get('/history')
async def get_history(authorization: Optional[str] = Header(None)):
    """获取训练历史数据"""
    check_auth(authorization)
    return get_training_history()


@router.post('/cancel')
async def cancel_training_task(authorization: Optional[str] = Header(None)):
    """取消训练任务"""
    check_auth(authorization)
    
    success = cancel_training()
    
    if not success:
        raise HTTPException(status_code=400, detail='没有正在进行的训练任务')
    
    return {'success': True, 'message': '训练已取消'}


@router.post('/reset')
async def reset_status(authorization: Optional[str] = Header(None)):
    """重置训练状态"""
    check_auth(authorization)
    reset_training_status()
    return {'success': True, 'message': '训练状态已重置'}


@router.get('/cached-result')
async def get_cached_training_result(authorization: Optional[str] = Header(None)):
    """获取缓存的训练结果"""
    check_auth(authorization)
    from services.cache_service import load_training_cache
    cached = load_training_cache()
    return {
        'success': cached is not None,
        'cached_result': cached
    }


@router.post('/clear-cache')
async def clear_training_cache(authorization: Optional[str] = Header(None)):
    """清除训练缓存"""
    check_auth(authorization)
    from services.cache_service import clear_training_cache
    clear_training_cache()
    return {'success': True, 'message': '训练缓存已清除'}


@router.get('/dictionary')
async def get_dictionary(
    type: str = 'positive',
    authorization: Optional[str] = Header(None)
):
    """获取情感词典"""
    check_auth(authorization)
    
    filepath = get_dictionary_filepath(type)
    words = read_dictionary(filepath, type)
    
    return {'type': type, 'words': words}


@router.post('/dictionary/add')
async def add_dictionary_word(
    request: DictionaryWord,
    authorization: Optional[str] = Header(None)
):
    """添加词汇"""
    check_auth(authorization)
    
    filepath = get_dictionary_filepath(request.type)
    
    if request.type == 'negation':
        with open(filepath, 'a', encoding='utf-8') as f:
            f.write(f"{request.word}\n")
    else:
        with open(filepath, 'a', encoding='utf-8') as f:
            f.write(f"{request.word},{request.score}\n")
    
    return {'success': True, 'word': request.word, 'score': request.score}


@router.post('/dictionary/remove')
async def remove_dictionary_word(
    request: RemoveWordRequest,
    authorization: Optional[str] = Header(None)
):
    """删除词汇"""
    check_auth(authorization)
    
    filepath = get_dictionary_filepath(request.type)
    
    if not os.path.exists(filepath):
        return {'success': False, 'error': '词典文件不存在'}
    
    lines = []
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            stripped = line.strip()
            if not stripped:
                continue
            
            if request.type == 'negation':
                if stripped != request.word:
                    lines.append(line)
            elif ',' in stripped:
                word = stripped.rsplit(',', 1)[0]
                if word != request.word:
                    lines.append(line)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    
    return {'success': True, 'removed': request.word}


@router.get('/dictionary/stats')
async def get_dictionary_stats():
    """获取词典统计（公开接口，无需认证）"""
    stats = {}
    for dict_type in ['positive', 'negative', 'degree', 'negation']:
        filepath = get_dictionary_filepath(dict_type)
        words = read_dictionary(filepath, dict_type)
        stats[f'{dict_type}_count'] = len(words)

    # 新增：增强词典统计
    enhanced_pos_file = os.path.join(DICTIONARY_DIR, 'enhanced_positive_words.txt')
    enhanced_neg_file = os.path.join(DICTIONARY_DIR, 'enhanced_negative_words.txt')

    enhanced_positive_count = 0
    enhanced_negative_count = 0
    if os.path.exists(enhanced_pos_file):
        with open(enhanced_pos_file, 'r', encoding='utf-8') as f:
            enhanced_positive_count = sum(1 for line in f if line.strip())
    if os.path.exists(enhanced_neg_file):
        with open(enhanced_neg_file, 'r', encoding='utf-8') as f:
            enhanced_negative_count = sum(1 for line in f if line.strip())

    # 读取增强开关状态
    enhanced_enabled = False
    _enhanced_status_file = os.path.join(DICTIONARY_DIR, 'enhanced_status.json')
    if os.path.exists(_enhanced_status_file):
        try:
            with open(_enhanced_status_file, 'r', encoding='utf-8') as f:
                status_data = json.load(f)
                enhanced_enabled = status_data.get('enhanced_enabled', False)
        except:
            pass

    stats['enhanced_positive_count'] = enhanced_positive_count
    stats['enhanced_negative_count'] = enhanced_negative_count
    stats['enhanced_enabled'] = enhanced_enabled

    return stats


@router.post('/dictionary/reload')
async def reload_dictionary(authorization: Optional[str] = Header(None)):
    """重新加载词典到内存"""
    check_auth(authorization)
    
    try:
        reload_text_lexicon()
        reload_audio_lexicon()
        return {'success': True, 'message': '词典已同步到内存'}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'词典同步失败: {str(e)}')


@router.get('/external-api')
async def get_external_api_config(authorization: Optional[str] = Header(None)):
    """获取外部API配置"""
    check_auth(authorization)
    
    config = load_external_api_config()
    
    if config.get('text_api_key'):
        config['text_api_key'] = config['text_api_key'][:8] + '***' if len(config['text_api_key']) > 8 else '***'
    if config.get('audio_api_key'):
        config['audio_api_key'] = config['audio_api_key'][:8] + '***' if len(config['audio_api_key']) > 8 else '***'
    
    return config


@router.post('/external-api')
async def update_external_api_config(
    config: ExternalApiConfig,
    authorization: Optional[str] = Header(None)
):
    """更新外部API配置"""
    check_auth(authorization)
    
    current_config = load_external_api_config()
    
    if config.text_api_key is not None and not config.text_api_key.startswith('***'):
        current_config['text_api_key'] = config.text_api_key
    if config.text_base_url is not None:
        current_config['text_base_url'] = config.text_base_url
    if config.text_model is not None:
        current_config['text_model'] = config.text_model
    
    if config.audio_api_key is not None and not config.audio_api_key.startswith('***'):
        current_config['audio_api_key'] = config.audio_api_key
    if config.audio_base_url is not None:
        current_config['audio_base_url'] = config.audio_base_url
    if config.audio_model is not None:
        current_config['audio_model'] = config.audio_model
    
    save_external_api_config(current_config)
    
    return {'success': True, 'message': '外部API配置已更新'}


@router.get('/external-api/check')
async def check_external_api_config(authorization: Optional[str] = Header(None)):
    """检查外部API配置状态"""
    check_auth(authorization)

    config = load_external_api_config()

    text_enabled = config.get('text_enabled', False)
    audio_enabled = config.get('audio_enabled', False)

    text_configured = bool(
        text_enabled and
        config.get('text_api_key') and
        config.get('text_base_url') and
        config.get('text_model')
    )
    audio_configured = bool(
        audio_enabled and
        config.get('audio_api_key') and
        config.get('audio_base_url') and
        config.get('audio_model')
    )

    return {
        'text_configured': text_configured,
        'audio_configured': audio_configured,
        'text_enabled': text_enabled,
        'audio_enabled': audio_enabled,
        'text_model': config.get('text_model', ''),
        'audio_model': config.get('audio_model', '')
    }


@router.post('/ablation-test')
async def ablation_test(
    file: UploadFile = File(...),
    enable_negation: bool = Form(True),
    enable_degree: bool = Form(True),
    enable_pattern: bool = Form(True),
    enable_dynamic_threshold: bool = Form(True),
    enable_enhanced: bool = Form(False),
    authorization: Optional[str] = Header(None)
):
    """
    词典法消融实验测试接口
    上传测试数据，指定配置，返回准确率等指标
    """
    check_auth(authorization)
    
    # 1. 验证文件类型
    allowed_extensions = {'.xlsx', '.xls'}
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型: {file_ext}。请上传 .xlsx 或 .xls 文件"
        )
    
    # 2. 验证文件大小（10MB = 10 * 1024 * 1024 bytes）
    max_file_size = 10 * 1024 * 1024
    contents = await file.read()
    if len(contents) > max_file_size:
        raise HTTPException(
            status_code=400,
            detail=f"文件大小超过限制（最大10MB）"
        )
    
    try:
        import pandas as pd
        import io
        from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
        from sentiment.lexicon_analyzer import LexiconAnalyzer
        
        # 读取上传的Excel文件
        df = pd.read_excel(io.BytesIO(contents))
        
        if '文本' not in df.columns or '标签' not in df.columns:
            raise HTTPException(
                status_code=400,
                detail="文件必须包含'文本'和'标签'两列"
            )
        
        # 3. 验证标签值是否合法
        valid_labels = {'正面', '负面', '中性'}
        invalid_labels = set(df['标签'].unique()) - valid_labels
        if invalid_labels:
            raise HTTPException(
                status_code=400,
                detail=f"标签列包含非法值: {invalid_labels}。只允许: 正面/负面/中性"
            )
        
        texts = df['文本'].tolist()
        labels = df['标签'].tolist()
        
        # 创建指定配置的分析器
        config_dict = {
            'enable_negation': enable_negation,
            'enable_degree': enable_degree,
            'enable_pattern': enable_pattern,
            'enable_dynamic_threshold': enable_dynamic_threshold,
            'enable_enhanced': enable_enhanced
        }
        analyzer = LexiconAnalyzer(config=config_dict)
        
        # 预测
        predictions = []
        for text in texts:
            result = analyzer.analyze(text)
            predictions.append(result['sentiment'])
        
        # 计算指标
        acc = accuracy_score(labels, predictions)
        prec = precision_score(labels, predictions, average='weighted', zero_division=0)
        rec = recall_score(labels, predictions, average='weighted', zero_division=0)
        f1 = f1_score(labels, predictions, average='weighted', zero_division=0)
        
        return {
            'config': config_dict,
            'sample_count': len(texts),
            'accuracy': round(acc * 100, 2),
            'precision': round(prec * 100, 2),
            'recall': round(rec * 100, 2),
            'f1_score': round(f1 * 100, 2)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'消融实验测试失败: {str(e)}')


class AblationChartRequest(BaseModel):
    """消融实验图表请求"""
    results: list


@router.post('/export-ablation-charts')
async def export_ablation_charts(
    request: AblationChartRequest,
    authorization: Optional[str] = Header(None)
):
    """
    导出消融实验图表
    接收前端传递的实验结果数据，生成PNG图表并返回base64编码
    """
    check_auth(authorization)
    
    try:
        import os
        import base64
        import io
        import pandas as pd
        import matplotlib.pyplot as plt
        import numpy as np
        
        plt.rcParams['font.sans-serif'] = ['SimHei', 'DejaVu Sans']
        plt.rcParams['axes.unicode_minus'] = False
        
        df_data = []
        for r in request.results:
            df_data.append({
                '配置': r.get('config', r.get('key', '')),
                '描述': r.get('description', ''),
                '样本数': r.get('sample_count', 0),
                '准确率': r.get('accuracy', 0),
                '精确率': r.get('precision', 0),
                '召回率': r.get('recall', 0),
                'F1值': r.get('f1_score', 0),
                '相对提升': r.get('improvement', '-')
            })
        
        df = pd.DataFrame(df_data)
        
        fig, axes = plt.subplots(1, 2, figsize=(14, 5))
        fig.suptitle('词典法消融实验结果分析', fontsize=16, fontweight='bold')
        
        ax1 = axes[0]
        colors = ['#e5e7eb', '#93c5fd', '#60a5fa', '#3b82f6', '#8b5cf6']
        bars = ax1.bar(df['配置'], df['准确率'], color=colors, edgecolor='white', linewidth=1.5)
        ax1.set_ylabel('准确率 (%)', fontsize=11)
        ax1.set_title('(a) 各配置准确率对比', fontsize=12, fontweight='bold')
        ax1.set_ylim(0, 100)
        ax1.grid(axis='y', alpha=0.3, linestyle='--')
        
        for bar, acc in zip(bars, df['准确率']):
            height = bar.get_height()
            ax1.text(bar.get_x() + bar.get_width()/2., height + 1.5,
                     f'{acc}%', ha='center', va='bottom', fontsize=10, fontweight='bold')
        
        ax2 = axes[1]
        improvements = []
        for imp in df['相对提升']:
            if imp == '-':
                improvements.append(0)
            else:
                improvements.append(float(str(imp).replace('%', '').replace('+', '')))
        
        ax2.plot(df['配置'], improvements, marker='o', markersize=10, linewidth=2.5, 
                 color='#8b5cf6', markerfacecolor='#a78bfa', markeredgecolor='#8b5cf6', markeredgewidth=2)
        ax2.fill_between(range(len(df)), improvements, alpha=0.3, color='#8b5cf6')
        ax2.set_ylabel('相对提升 (%)', fontsize=11)
        ax2.set_title('(b) 各模块贡献度分析', fontsize=12, fontweight='bold')
        ax2.grid(True, alpha=0.3, linestyle='--')
        ax2.set_xticks(range(len(df)))
        ax2.set_xticklabels(df['配置'])
        
        for i, (x, y) in enumerate(zip(range(len(df)), improvements)):
            if y > 0:
                ax2.annotate(f'+{y:.2f}%', (x, y), textcoords="offset points", 
                             xytext=(0, 10), ha='center', fontsize=9, fontweight='bold', color='#7c3aed')
        
        plt.tight_layout()
        
        png_buffer = io.BytesIO()
        plt.savefig(png_buffer, format='png', dpi=300, bbox_inches='tight', facecolor='white')
        png_buffer.seek(0)
        png_base64 = base64.b64encode(png_buffer.read()).decode('utf-8')
        
        pdf_buffer = io.BytesIO()
        plt.savefig(pdf_buffer, format='pdf', bbox_inches='tight', facecolor='white')
        pdf_buffer.seek(0)
        pdf_base64 = base64.b64encode(pdf_buffer.read()).decode('utf-8')
        
        plt.close()
        
        return {
            'success': True,
            'message': '图表生成成功',
            'png_base64': png_base64,
            'pdf_base64': pdf_base64
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'导出图表失败: {str(e)}')


@router.get('/export-training-data')
async def export_training_data(authorization: Optional[str] = Header(None)):
    """
    导出训练数据用于论文
    包含：训练历史数据(CSV)、训练配置信息(CSV)、训练曲线图表(PNG)
    """
    check_auth(authorization)
    
    try:
        import base64
        import io
        import pandas as pd
        import matplotlib.pyplot as plt
        import matplotlib
        matplotlib.use('Agg')
        import numpy as np
        from datetime import datetime
        
        plt.rcParams['font.sans-serif'] = ['SimHei', 'DejaVu Sans']
        plt.rcParams['axes.unicode_minus'] = False
        
        from services.cache_service import load_training_cache
        from services.training_service import get_training_history, get_training_status
        
        cached = load_training_cache()
        history = get_training_history()
        status = get_training_status()
        
        if not history or not history.get('epochs'):
            if cached and cached.get('history'):
                history = cached['history']
            else:
                raise HTTPException(status_code=400, detail='暂无训练数据可导出，请先完成模型训练')
        
        epochs = history.get('epochs', [])
        train_loss = history.get('train_loss', [])
        eval_loss = history.get('eval_loss', [])
        accuracy = history.get('accuracy', [])
        f1 = history.get('f1', [])
        learning_rate = history.get('learning_rate', [])
        
        training_data = []
        for i, epoch in enumerate(epochs):
            row = {
                'Epoch': epoch,
                '训练损失': train_loss[i] if i < len(train_loss) else None,
                '验证损失': eval_loss[i] if i < len(eval_loss) else None,
                '准确率': accuracy[i] if i < len(accuracy) else None,
                'F1分数': f1[i] if i < len(f1) else None,
                '学习率': learning_rate[i] if i < len(learning_rate) else None
            }
            training_data.append(row)
        
        training_df = pd.DataFrame(training_data)
        
        config_data = []
        
        params = cached.get('params', {}) if cached else {}
        config_data.append({'项目': '训练轮数 (Epochs)', '值': params.get('epochs', TRAINING_PARAMS.get('epochs', '-'))})
        config_data.append({'项目': '批次大小 (Batch Size)', '值': params.get('batch_size', TRAINING_PARAMS.get('batch_size', '-'))})
        config_data.append({'项目': '学习率 (Learning Rate)', '值': params.get('learning_rate', TRAINING_PARAMS.get('learning_rate', '-'))})
        config_data.append({'项目': '最大序列长度 (Max Length)', '值': params.get('max_length', TRAINING_PARAMS.get('max_length', '-'))})
        
        if cached:
            config_data.append({'项目': '训练状态', '值': cached.get('status', '-')})
            config_data.append({'项目': '完成时间', '值': cached.get('completed_at', '-')})
            if cached.get('gpu_memory_peak_mb'):
                config_data.append({'项目': 'GPU显存峰值 (MB)', '值': f"{cached['gpu_memory_peak_mb']:.2f}"})
            
            metrics = cached.get('metrics', {})
            if metrics:
                config_data.append({'项目': '--- 最终评估指标 ---', '值': ''})
                if metrics.get('eval_accuracy'):
                    config_data.append({'项目': '最终准确率', '值': f"{metrics['eval_accuracy']*100:.2f}%"})
                if metrics.get('eval_f1'):
                    config_data.append({'项目': '最终F1分数', '值': f"{metrics['eval_f1']*100:.2f}%"})
                if metrics.get('eval_loss'):
                    config_data.append({'项目': '最终验证损失', '值': f"{metrics['eval_loss']:.4f}"})
        
        config_df = pd.DataFrame(config_data)
        
        fig, axes = plt.subplots(1, 2, figsize=(14, 5))
        fig.suptitle('模型训练过程分析', fontsize=16, fontweight='bold')
        
        ax1 = axes[0]
        if train_loss and any(train_loss):
            ax1.plot(epochs, train_loss, 'b-o', label='训练损失', linewidth=2, markersize=6)
        if eval_loss and any(eval_loss):
            ax1.plot(epochs, eval_loss, 'r-s', label='验证损失', linewidth=2, markersize=6)
        ax1.set_xlabel('Epoch', fontsize=11)
        ax1.set_ylabel('Loss', fontsize=11)
        ax1.set_title('(a) 损失曲线', fontsize=12, fontweight='bold')
        ax1.legend()
        ax1.grid(True, alpha=0.3, linestyle='--')
        
        ax2 = axes[1]
        if accuracy and any(accuracy):
            acc_percent = [acc * 100 if acc and acc <= 1 else acc for acc in accuracy]
            ax2.plot(epochs, acc_percent, 'g-o', label='准确率', linewidth=2, markersize=6)
        if f1 and any(f1):
            f1_percent = [f * 100 if f and f <= 1 else f for f in f1]
            ax2.plot(epochs, f1_percent, 'm-s', label='F1分数', linewidth=2, markersize=6)
        ax2.set_xlabel('Epoch', fontsize=11)
        ax2.set_ylabel('百分比 (%)', fontsize=11)
        ax2.set_title('(b) 性能指标曲线', fontsize=12, fontweight='bold')
        ax2.legend()
        ax2.grid(True, alpha=0.3, linestyle='--')
        ax2.set_ylim(0, 100)
        
        plt.tight_layout()
        
        png_buffer = io.BytesIO()
        plt.savefig(png_buffer, format='png', dpi=300, bbox_inches='tight', facecolor='white')
        png_buffer.seek(0)
        png_base64 = base64.b64encode(png_buffer.read()).decode('utf-8')
        plt.close()
        
        csv_output = io.StringIO()
        csv_output.write('# 模型训练配置信息\n')
        config_df.to_csv(csv_output, index=False, encoding='utf-8-sig')
        csv_output.write('\n# 训练历史数据\n')
        training_df.to_csv(csv_output, index=False, encoding='utf-8-sig')
        csv_content = csv_output.getvalue()
        csv_output.close()
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        return {
            'success': True,
            'message': '训练数据导出成功',
            'csv_content': csv_content,
            'csv_filename': f'训练数据_{timestamp}.csv',
            'png_base64': png_base64,
            'png_filename': f'训练曲线_{timestamp}.png'
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'导出训练数据失败: {str(e)}')
