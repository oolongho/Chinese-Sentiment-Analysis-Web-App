#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
文件验证工具
提供文件大小验证和临时文件清理功能
"""

import os
import uuid
import pandas as pd
from typing import Tuple, Optional
from fastapi import HTTPException, UploadFile


DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), '..', 'data')
UPLOAD_DIR = os.path.join(DATA_DIR, 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)


async def save_upload_file(file: UploadFile, file_type: str = 'general') -> Tuple[str, str]:
    """
    异步保存上传的文件
    
    Args:
        file: 上传的文件对象
        file_type: 文件类型（用于创建子目录）
    
    Returns:
        (filepath, original_filename) 文件路径和原始文件名
    """
    type_dir = os.path.join(UPLOAD_DIR, file_type)
    os.makedirs(type_dir, exist_ok=True)
    
    ext = os.path.splitext(file.filename)[1] if file.filename else ''
    unique_name = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(type_dir, unique_name)
    
    content = await file.read()
    with open(filepath, 'wb') as f:
        f.write(content)
    
    return filepath, file.filename or unique_name


def validate_excel_file(filepath: str) -> Tuple[bool, Optional[str], int]:
    """
    验证 Excel 文件格式
    
    Args:
        filepath: 文件路径
    
    Returns:
        (is_valid, error_message, row_count)
    """
    try:
        df = pd.read_excel(filepath)
        
        required_columns = ['文本', '标签']
        missing_columns = [col for col in required_columns if col not in df.columns]
        
        if missing_columns:
            return False, f"缺少必需列：{', '.join(missing_columns)}", 0
        
        df = df.dropna(subset=required_columns)
        
        valid_labels = {'正面', '负面', '中性'}
        invalid_labels = set(df['标签'].unique()) - valid_labels
        if invalid_labels:
            return False, f"包含无效标签：{', '.join(invalid_labels)}", 0
        
        return True, None, len(df)
        
    except Exception as e:
        return False, f"文件解析失败：{str(e)}", 0


def validate_audio_file(filepath: str) -> Tuple[bool, Optional[str]]:
    """
    验证音频文件
    
    Args:
        filepath: 文件路径
    
    Returns:
        (is_valid, error_message)
    """
    if not os.path.exists(filepath):
        return False, "文件不存在"
    
    valid_extensions = {'.mp3', '.wav', '.m4a', '.flac', '.ogg'}
    ext = os.path.splitext(filepath)[1].lower()
    
    if ext not in valid_extensions:
        return False, f"不支持的音频格式：{ext}"
    
    return True, None


def load_data_file(filepath: str) -> Tuple[bool, Optional[str], Optional[list]]:
    """
    加载数据文件
    
    Args:
        filepath: 文件路径
    
    Returns:
        (is_valid, error_message, data)
    """
    try:
        ext = os.path.splitext(filepath)[1].lower()
        
        if ext in {'.xlsx', '.xls'}:
            df = pd.read_excel(filepath)
        elif ext == '.csv':
            df = pd.read_csv(filepath, encoding='utf-8-sig')
        else:
            return False, f"不支持的文件格式：{ext}", None
        
        if '文本' not in df.columns:
            return False, "缺少'文本'列", None
        
        data = df[['文本', '标签']].to_dict('records') if '标签' in df.columns else df[['文本']].to_dict('records')
        return True, None, data
        
    except Exception as e:
        return False, f"文件加载失败：{str(e)}", None


def validate_file_size(
    content: bytes, 
    max_size: int, 
    file_type: str = "文件"
) -> None:
    """
    验证文件大小
    
    Args:
        content: 文件内容（字节）
        max_size: 最大允许大小（字节）
        file_type: 文件类型描述（用于错误信息）
    
    Raises:
        HTTPException: 文件过大时抛出 413 错误
    """
    file_size = len(content)
    if file_size > max_size:
        max_size_mb = max_size / (1024 * 1024)
        actual_size_mb = file_size / (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f'{file_type}过大：{actual_size_mb:.2f} MB，最大允许 {max_size_mb:.0f} MB'
        )


def safe_save_file(
    filepath: str, 
    content: bytes, 
    cleanup_on_error: bool = True
) -> None:
    """
    安全保存文件，支持错误时自动清理
    
    Args:
        filepath: 目标文件路径
        content: 文件内容（字节）
        cleanup_on_error: 出错时是否删除文件
    
    Raises:
        IOError: 文件写入失败
    """
    try:
        with open(filepath, 'wb') as f:
            f.write(content)
    except Exception as e:
        if cleanup_on_error and os.path.exists(filepath):
            try:
                os.remove(filepath)
            except:
                pass
        raise e


def cleanup_file(filepath: str) -> bool:
    """
    清理文件（如果存在）
    
    Args:
        filepath: 文件路径
    
    Returns:
        是否成功删除
    """
    try:
        if os.path.exists(filepath):
            os.remove(filepath)
            return True
    except Exception:
        pass
    return False
