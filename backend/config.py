# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
配置文件
"""

import os
import json
import hashlib
from typing import Optional, Dict, List

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, '..', 'data')
MODEL_DIR = os.path.join(BASE_DIR, 'models')

LOG_FILE = os.path.join(DATA_DIR, 'logs', 'app.log')


def _get_required_env(key: str) -> str:
    """获取必需的环境变量，未配置时抛出错误"""
    value = os.getenv(key)
    if not value:
        raise RuntimeError(
            f"环境变量 {key} 未配置。请设置环境变量或创建 .env 文件。"
        )
    return value


def _get_optional_env(key: str, default: str) -> str:
    """获取可选的环境变量"""
    return os.getenv(key, default)


def _hash_password(password: str) -> str:
    """使用 SHA-256 哈希密码"""
    return hashlib.sha256(password.encode('utf-8')).hexdigest()


def _load_admin_password_hash() -> str:
    """
    加载管理员密码哈希值
    
    支持两种配置方式:
    1. ADMIN_PASSWORD_HASH: 直接配置哈希值（推荐）
    2. ADMIN_PASSWORD: 配置明文密码（自动转换为哈希）
    """
    password_hash = os.getenv('ADMIN_PASSWORD_HASH')
    if password_hash:
        return password_hash
    
    password = os.getenv('ADMIN_PASSWORD')
    if password:
        return _hash_password(password)
    
    raise RuntimeError(
        "管理员密码未配置。请设置环境变量 ADMIN_PASSWORD_HASH 或 ADMIN_PASSWORD。\n"
        "示例: ADMIN_PASSWORD_HASH=$(echo -n 'your_password' | sha256sum | cut -d' ' -f1)"
    )


ADMIN_PASSWORD_HASH = _load_admin_password_hash()

SECRET_KEY = _get_required_env('SECRET_KEY')

DATABASE_URL = _get_optional_env('DATABASE_URL', 'sqlite:///' + os.path.join(DATA_DIR, 'app.db'))

TRAINING_PARAMS = {
    'epochs': 3,
    'batch_size': 16,
    'learning_rate': 2e-5,
    'max_length': 128,
    'warmup_ratio': 0.1,
    'weight_decay': 0.01,
}

MODEL_NAME = 'hfl/chinese-roberta-wwm-ext'


def _get_cors_origins() -> List[str]:
    """
    获取 CORS 允许的来源列表
    
    从环境变量 CORS_ORIGINS 读取，多个域名用逗号分隔
    生产环境禁止使用 '*'
    """
    origins_str = os.getenv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:5173')
    origins = [origin.strip() for origin in origins_str.split(',') if origin.strip()]
    
    if '*' in origins:
        import warnings
        warnings.warn(
            "CORS 配置允许所有来源 ('*')，这在生产环境中是不安全的。"
            "请设置 CORS_ORIGINS 环境变量为具体的域名列表。",
            UserWarning
        )
    
    return origins


CORS_ORIGINS = _get_cors_origins()

EXTERNAL_API_CONFIG_FILE = os.path.join(DATA_DIR, 'external_api_config.json')


def load_external_api_config() -> Dict:
    """加载外部API配置"""
    if os.path.exists(EXTERNAL_API_CONFIG_FILE):
        try:
            with open(EXTERNAL_API_CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except json.JSONDecodeError as e:
            from .utils.logger import get_logger
            logger = get_logger('config')
            logger.warning(f"外部API配置文件解析失败: {e}")
        except IOError as e:
            from .utils.logger import get_logger
            logger = get_logger('config')
            logger.warning(f"外部API配置文件读取失败: {e}")
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


def validate_security_config():
    """验证安全配置"""
    from .utils.logger import get_logger
    logger = get_logger('config')
    
    issues = []
    
    if SECRET_KEY == 'your-secret-key-change-in-production':
        issues.append("SECRET_KEY 使用了默认值，请修改为安全的随机字符串")
    
    if '*' in CORS_ORIGINS:
        issues.append("CORS 配置允许所有来源，生产环境请配置具体域名")
    
    if issues:
        for issue in issues:
            logger.warning(f"安全警告: {issue}")
    
    return issues
