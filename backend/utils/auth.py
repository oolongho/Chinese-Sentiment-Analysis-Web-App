# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
认证工具
"""

import hashlib
import time
from typing import Dict, Optional
import jwt
from fastapi import Header, HTTPException

from config import ADMIN_PASSWORD_HASH, SECRET_KEY
from utils.logger import get_logger

logger = get_logger('auth')


def _hash_password(password: str) -> str:
    """使用 SHA-256 哈希密码"""
    return hashlib.sha256(password.encode('utf-8')).hexdigest()


def verify_password(password: str) -> bool:
    """
    验证管理员密码
    
    Args:
        password: 用户输入的密码（明文）
    
    Returns:
        密码是否正确
    """
    if not password:
        logger.warning("密码验证失败: 密码为空")
        return False
    
    
    password_hash = _hash_password(password)
    result = password_hash == ADMIN_PASSWORD_HASH
    
    if result:
        logger.info("管理员登录成功")
    else:
        logger.warning("管理员登录失败: 密码错误")
    
    return result


def create_token(expire_hours: int = 24) -> str:
    """
    创建认证token
    
    Args:
        expire_hours: token过期时间（小时）
    
    Returns:
        JWT token字符串
    """
    payload = {
        'admin': True,
        'exp': int(time.time()) + expire_hours * 3600,
        'iat': int(time.time())
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm='HS256')
    logger.debug(f"创建新token，有效期 {expire_hours} 小时")
    return token


def verify_token(token: str) -> Dict:
    """
    验证token
    
    Args:
        token: JWT token字符串
    
    Returns:
        验证结果字典，包含 valid、payload 或 error 字段
    """
    if not token:
        logger.warning("Token验证失败: token为空")
        return {'valid': False, 'error': 'Token为空'}
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
        logger.debug("Token验证成功")
        return {'valid': True, 'payload': payload}
    except jwt.ExpiredSignatureError:
        logger.warning("Token验证失败: Token已过期")
        return {'valid': False, 'error': 'Token已过期'}
    except jwt.InvalidTokenError as e:
        logger.warning(f"Token验证失败: 无效的Token - {e}")
        return {'valid': False, 'error': '无效的Token'}


def get_current_user(authorization: Optional[str] = Header(None)) -> bool:
    """
    FastAPI 依赖项：验证用户认证
    
    Args:
        authorization: 请求头中的 Authorization 字段
    
    Returns:
        认证成功返回 True
    
    Raises:
        HTTPException: 认证失败时抛出 401 错误
    """
    if not authorization:
        raise HTTPException(status_code=401, detail='未提供认证信息')
    
    token = authorization.replace('Bearer ', '') if authorization.startswith('Bearer ') else authorization
    result = verify_token(token)
    
    if not result['valid']:
        raise HTTPException(status_code=401, detail=result['error'])
    
    return True
