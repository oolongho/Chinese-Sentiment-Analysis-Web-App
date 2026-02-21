# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
配置文件
"""

import os
import json
from typing import Optional, Dict

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, '..', 'data')
MODEL_DIR = os.path.join(BASE_DIR, 'models')

ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', '123456Aa.')

SECRET_KEY = os.getenv('SECRET_KEY', 'your-secret-key-change-in-production')

DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///' + os.path.join(DATA_DIR, 'app.db'))

TRAINING_PARAMS = {
    'epochs': 3,
    'batch_size': 16,
    'learning_rate': 2e-5,
    'max_length': 128,
    'warmup_ratio': 0.1,
    'weight_decay': 0.01,
}

MODEL_NAME = 'hfl/chinese-roberta-wwm-ext'

CORS_ORIGINS = ['*']

EXTERNAL_API_CONFIG_FILE = os.path.join(DATA_DIR, 'external_api_config.json')

def load_external_api_config() -> Dict:
    """加载外部API配置"""
    if os.path.exists(EXTERNAL_API_CONFIG_FILE):
        try:
            with open(EXTERNAL_API_CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            pass
    return {
        'text_api_key': '',
        'text_base_url': '',
        'text_model': '',
        'audio_api_key': '',
        'audio_base_url': '',
        'audio_model': '',
    }

def save_external_api_config(config: Dict):
    """保存外部API配置"""
    with open(EXTERNAL_API_CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
