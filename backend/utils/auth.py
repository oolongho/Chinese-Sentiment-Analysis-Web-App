# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
认证工具
"""

import hashlib
import time
from typing import Optional, Dict
import jwt
from ..config import ADMIN_PASSWORD, SECRET_KEY


def verify_password(password: str) -> bool:
    """验证管理员密码"""
    return password == ADMIN_PASSWORD


def create_token(expire_hours: int = 24) -> str:
    """创建认证token"""
    payload = {
        'admin': True,
        'exp': int(time.time()) + expire_hours * 3600,
        'iat': int(time.time())
    }
    return jwt.encode(payload, SECRET_KEY, algorithm='HS256')


def verify_token(token: str) -> Dict:
    """验证token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
        return {'valid': True, 'payload': payload}
    except jwt.ExpiredSignatureError:
        return {'valid': False, 'error': 'Token已过期'}
    except jwt.InvalidTokenError:
        return {'valid': False, 'error': '无效的Token'}
