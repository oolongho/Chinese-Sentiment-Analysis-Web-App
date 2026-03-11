# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
文件工具
"""

import os
import re
import uuid
import pandas as pd
from typing import Tuple, Optional, Set
from fastapi import UploadFile, HTTPException
from config import DATA_DIR
from utils.logger import get_logger

logger = get_logger('file_utils')

ALLOWED_EXTENSIONS: Set[str] = {'.xlsx', '.xls', '.csv'}
MAX_FILE_SIZE = 10 * 1024 * 1024
ALLOWED_AUDIO_EXTENSIONS: Set[str] = {'.wav', '.mp3', '.m4a', '.flac', '.ogg'}
MAX_AUDIO_FILE_SIZE = 50 * 1024 * 1024

AUDIO_MIME_TYPES: Set[str] = {
    'audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3',
    'audio/mp4', 'audio/x-m4a', 'audio/flac', 'audio/ogg'
}


def _sanitize_filename(filename: str) -> str:
    """
    清理文件名中的特殊字符
    
    Args:
        filename: 原始文件名
    
    Returns:
        清理后的安全文件名
    """
    filename = os.path.basename(filename)
    filename = re.sub(r'[^\w\u4e00-\u9fff\.\-]', '_', filename)
    filename = re.sub(r'\.{2,}', '.', filename)
    return filename


async def save_upload_file(
    file: UploadFile, 
    subfolder: str = 'uploads',
    max_size: int = MAX_FILE_SIZE
) -> Tuple[str, str]:
    """
    保存上传的文件
    
    Args:
        file: 上传的文件对象
        subfolder: 保存的子目录
        max_size: 最大文件大小（字节）
    
    Returns:
        (文件路径, 原始文件名)
    
    Raises:
        HTTPException: 文件大小超限或保存失败
    """
    upload_dir = os.path.join(DATA_DIR, subfolder)
    os.makedirs(upload_dir, exist_ok=True)
    
    content = await file.read()
    
    if len(content) > max_size:
        logger.warning(f"文件大小超限: {len(content)} > {max_size}")
        raise HTTPException(
            status_code=413, 
            detail=f'文件大小超过限制 ({max_size // 1024 // 1024}MB)'
        )
    
    safe_filename = _sanitize_filename(file.filename or 'unknown')
    ext = os.path.splitext(safe_filename)[1]
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(upload_dir, filename)
    
    try:
        with open(filepath, 'wb') as f:
            f.write(content)
        logger.info(f"文件保存成功: {filename}, 大小: {len(content)} bytes")
    except IOError as e:
        logger.error(f"文件保存失败: {e}")
        raise HTTPException(status_code=500, detail='文件保存失败')
    
    return filepath, file.filename or 'unknown'


def validate_excel_file(filepath: str) -> Tuple[bool, Optional[str], Optional[int]]:
    """
    验证Excel文件
    
    Args:
        filepath: 文件路径
    
    Returns:
        (是否有效, 错误信息, 数据行数)
    """
    logger.info(f"验证Excel文件: {filepath}")
    
    try:
        ext = os.path.splitext(filepath)[1].lower()
        
        if ext not in ALLOWED_EXTENSIONS:
            logger.warning(f"不支持的文件格式: {ext}")
            return False, f"不支持的文件格式: {ext}", None
        
        if ext == '.csv':
            df = pd.read_csv(filepath)
        else:
            df = pd.read_excel(filepath)
        
        required_columns = ['文本']
        for col in required_columns:
            if col not in df.columns:
                logger.warning(f"缺少必需列: {col}")
                return False, f"缺少必需列: {col}", None
        
        df = df.dropna(subset=['文本'])
        df = df[df['文本'].str.len() >= 5]
        
        row_count = len(df)
        logger.info(f"Excel文件验证通过: {row_count} 行数据")
        
        return True, None, row_count
        
    except pd.errors.EmptyDataError:
        logger.warning("Excel文件为空")
        return False, "文件为空", None
    except pd.errors.ParserError as e:
        logger.warning(f"Excel文件解析失败: {e}")
        return False, f"文件解析失败: {str(e)}", None
    except Exception as e:
        logger.error(f"Excel文件验证异常: {e}")
        return False, str(e), None


def load_data_file(filepath: str) -> pd.DataFrame:
    """加载数据文件"""
    ext = os.path.splitext(filepath)[1].lower()
    
    if ext == '.csv':
        return pd.read_csv(filepath)
    else:
        return pd.read_excel(filepath)


async def validate_audio_file(
    file: UploadFile,
    check_content: bool = False
) -> Tuple[bool, Optional[str]]:
    """
    验证音频文件
    
    Args:
        file: 上传的文件对象
        check_content: 是否检查文件内容（MIME类型）
    
    Returns:
        (是否有效, 错误信息)
    """
    if not file.filename:
        logger.warning("音频文件验证: 文件名为空")
        return False, "文件名不能为空"
    
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        logger.warning(f"不支持的音频格式: {ext}")
        return False, f"不支持的音频格式: {ext}"
    
    content = await file.read()
    await file.seek(0)
    
    if len(content) > MAX_AUDIO_FILE_SIZE:
        logger.warning(f"音频文件大小超限: {len(content)} > {MAX_AUDIO_FILE_SIZE}")
        return False, f"文件大小超过限制 ({MAX_AUDIO_FILE_SIZE // 1024 // 1024}MB)"
    
    if check_content and file.content_type:
        if file.content_type not in AUDIO_MIME_TYPES:
            logger.warning(f"音频文件MIME类型不匹配: {file.content_type}")
            return False, f"文件类型不匹配: {file.content_type}"
    
    logger.info(f"音频文件验证通过: {file.filename}")
    return True, None
