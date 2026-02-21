# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
文件工具
"""

import os
import uuid
import pandas as pd
from typing import Tuple, Optional
from fastapi import UploadFile
from ..config import DATA_DIR


ALLOWED_EXTENSIONS = {'.xlsx', '.xls', '.csv'}
MAX_FILE_SIZE = 10 * 1024 * 1024


async def save_upload_file(file: UploadFile, subfolder: str = 'uploads') -> Tuple[str, str]:
    """
    保存上传的文件
    
    Returns:
        (文件路径, 文件名)
    """
    upload_dir = os.path.join(DATA_DIR, subfolder)
    os.makedirs(upload_dir, exist_ok=True)
    
    ext = os.path.splitext(file.filename)[1]
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(upload_dir, filename)
    
    content = await file.read()
    with open(filepath, 'wb') as f:
        f.write(content)
    
    return filepath, file.filename


def validate_excel_file(filepath: str) -> Tuple[bool, Optional[str], Optional[int]]:
    """
    验证Excel文件
    
    Returns:
        (是否有效, 错误信息, 数据行数)
    """
    try:
        ext = os.path.splitext(filepath)[1].lower()
        
        if ext == '.csv':
            df = pd.read_csv(filepath)
        else:
            df = pd.read_excel(filepath)
        
        required_columns = ['评价']
        for col in required_columns:
            if col not in df.columns:
                return False, f"缺少必需列: {col}", None
        
        df = df.dropna(subset=['评价'])
        df = df[df['评价'].str.len() >= 5]
        
        return True, None, len(df)
        
    except Exception as e:
        return False, str(e), None


def load_data_file(filepath: str) -> pd.DataFrame:
    """加载数据文件"""
    ext = os.path.splitext(filepath)[1].lower()
    
    if ext == '.csv':
        return pd.read_csv(filepath)
    else:
        return pd.read_excel(filepath)
