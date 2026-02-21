# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
管理平台路由
"""

import os
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Header
from pydantic import BaseModel

from ..config import (
    DATA_DIR, TRAINING_PARAMS, 
    ADMIN_PASSWORD, SECRET_KEY,
    load_external_api_config, save_external_api_config
)
from ..utils import verify_password, create_token, verify_token, save_upload_file, validate_excel_file
from .text_analysis import reload_lexicon as reload_text_lexicon
from .audio_analysis import reload_lexicon as reload_audio_lexicon
from ..services.training_service import (
    start_training, get_training_status, cancel_training, reset_training_status
)

router = APIRouter(prefix='/api/training', tags=['管理平台'])

DICTIONARY_DIR = DATA_DIR
UPLOADED_DATA_FILE = None


class LoginRequest(BaseModel):
    password: str


class TrainingParams(BaseModel):
    epochs: Optional[int] = None
    batch_size: Optional[int] = None
    learning_rate: Optional[float] = None
    max_length: Optional[int] = None


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
    
    return {
        'success': True,
        'filename': original_name,
        'count': count,
        'filepath': filepath
    }


@router.get('/uploaded-data')
async def get_uploaded_data(authorization: Optional[str] = Header(None)):
    """获取已上传的数据文件信息"""
    check_auth(authorization)
    
    if UPLOADED_DATA_FILE and os.path.exists(UPLOADED_DATA_FILE):
        import pandas as pd
        df = pd.read_excel(UPLOADED_DATA_FILE)
        return {
            'uploaded': True,
            'filepath': UPLOADED_DATA_FILE,
            'count': len(df),
            'columns': df.columns.tolist()
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
            'is_default': True
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
async def get_dictionary_stats(authorization: Optional[str] = Header(None)):
    """获取词典统计"""
    check_auth(authorization)
    
    stats = {}
    for dict_type in ['positive', 'negative', 'degree', 'negation']:
        filepath = get_dictionary_filepath(dict_type)
        words = read_dictionary(filepath, dict_type)
        stats[f'{dict_type}_count'] = len(words)
    
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
    
    text_configured = bool(config.get('text_api_key') and config.get('text_base_url') and config.get('text_model'))
    audio_configured = bool(config.get('audio_api_key') and config.get('audio_base_url') and config.get('audio_model'))
    
    return {
        'text_configured': text_configured,
        'audio_configured': audio_configured,
        'text_model': config.get('text_model', ''),
        'audio_model': config.get('audio_model', '')
    }
