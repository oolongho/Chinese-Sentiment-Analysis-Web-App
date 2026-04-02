# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
候选情感词人工审核 API
功能：
1. 获取待审核候选词列表（分页+过滤+排序）
2. 批量审核通过（更新状态+写入增强词典+热加载）
3. 批量拒绝（更新状态+记录原因）
4. 词典统计信息（原始词典/增强词典/审核进度）
"""

import os
import json
from datetime import datetime
from typing import List, Optional, Any, Dict
from fastapi import APIRouter, Query, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import pandas as pd
import tempfile
import json as json_module

router = APIRouter(prefix="/api/dictionary", tags=["词典审核"])

# 词典文件路径
LEXICON_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'data', 'lexicon')
CANDIDATES_FILE = os.path.join(LEXICON_DIR, 'candidates.json')
ENHANCED_POSITIVE_FILE = os.path.join(LEXICON_DIR, 'enhanced_positive_words.txt')
ENHANCED_NEGATIVE_FILE = os.path.join(LEXICON_DIR, 'enhanced_negative_words.txt')
ORIGINAL_POSITIVE_FILE = os.path.join(LEXICON_DIR, 'positive_words.txt')
ORIGINAL_NEGATIVE_FILE = os.path.join(LEXICON_DIR, 'negative_words.txt')

# 数据集信息缓存（模块级变量 + JSON 文件持久化）
_dataset_info = {
    'filepath': None,
    'sample_count': 0,
    'label_distribution': {},
    'uploaded_at': None
}
_DATASET_INFO_FILE = os.path.join(LEXICON_DIR, 'dataset_info.json')
_ENHANCED_STATUS_FILE = os.path.join(LEXICON_DIR, 'enhanced_status.json')
DATA_DIR = os.path.dirname(LEXICON_DIR)  # data/ 目录


class ApproveRequest(BaseModel):
    """批量审核通过请求"""
    words: List[str]


class RejectRequest(BaseModel):
    """批量拒绝请求"""
    words: List[str]
    reason: Optional[str] = None


class ToggleEnhancedRequest(BaseModel):
    """切换增强词典开关请求"""
    enabled: bool


def _load_candidates() -> dict:
    """加载候选词数据，文件不存在时返回空字典"""
    if not os.path.exists(CANDIDATES_FILE):
        return {"candidates": []}

    try:
        with open(CANDIDATES_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {"candidates": data if isinstance(data, list) else []}
    except (json.JSONDecodeError, IOError) as e:
        from utils.logger import get_logger
        logger = get_logger('dictionary_review')
        logger.error(f"读取 candidates.json 失败: {e}")
        return {"candidates": []}


def _save_candidates(data: dict):
    """保存候选词数据到文件"""
    os.makedirs(os.path.dirname(CANDIDATES_FILE), exist_ok=True)
    with open(CANDIDATES_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _append_to_enhanced_lexicon(word: str, score: float, polarity: str):
    """将审核通过的词追加到增强词典文件"""
    if polarity == "positive":
        target_file = ENHANCED_POSITIVE_FILE
    else:
        target_file = ENHANCED_NEGATIVE_FILE

    os.makedirs(os.path.dirname(target_file), exist_ok=True)

    # 检查是否已存在该词，避免重复添加
    existing_words = set()
    if os.path.exists(target_file):
        with open(target_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if ',' in line:
                    existing_word = line.split(',')[0]
                    existing_words.add(existing_word)

    if word not in existing_words:
        with open(target_file, 'a', encoding='utf-8') as f:
            f.write(f"{word},{score}\n")


def _reload_lexicon():
    """调用 lexicon_analyzer 的 reload 方法热加载词典"""
    try:
        from sentiment import get_lexicon_analyzer
        analyzer = get_lexicon_analyzer()
        if analyzer is not None:
            analyzer.reload()
            from utils.logger import get_logger
            logger = get_logger('dictionary_review')
            logger.info("词典已热加载更新")
    except Exception as e:
        from utils.logger import get_logger
        logger = get_logger('dictionary_review')
        logger.warning(f"无法调用 lexicon_analyzer.reload() 方法: {e}，请手动重启服务以加载新词典")


def _count_lines_in_file(filepath: str) -> int:
    """统计文件行数（非空行）"""
    if not os.path.exists(filepath):
        return 0

    count = 0
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                count += 1
    return count


@router.get("/candidates")
async def get_candidates(
    status: str = Query("pending_review", description="候选词状态：pending_review/approved/rejected"),
    polarity: Optional[str] = Query(None, description="情感极性过滤：positive/negative"),
    limit: int = Query(20, ge=1, le=100, description="每页条数"),
    offset: int = Query(0, ge=0, description="偏移量"),
    sort_by: str = Query("extraction_count", description="排序字段：extraction_count/frequency/score")
):
    """
    获取待审核候选词列表（分页+多选展示+高频优先排序）

    - 默认按 extraction_count（提取次数）降序排列，高频词排在前面
    - 支持按 status 和 polarity 过滤
    - 返回分页结果和统计信息
    """
    data = _load_candidates()
    candidates = data.get("candidates", [])

    # 按 status 过滤
    filtered = [c for c in candidates if c.get("status") == status]

    # 按 polarity 过滤（可选）
    if polarity:
        filtered = [c for c in filtered if c.get("polarity") == polarity]

    # 排序（默认降序）
    reverse_order = True
    valid_sort_fields = ["extraction_count", "frequency", "score"]
    if sort_by in valid_sort_fields:
        filtered.sort(key=lambda x: x.get(sort_by, 0), reverse=reverse_order)
    else:
        # 默认按 extraction_count 降序
        filtered.sort(key=lambda x: x.get("extraction_count", 0), reverse=True)

    # 分页
    total = len(filtered)
    items = filtered[offset:offset + limit]

    # 计算统计信息
    all_candidates = data.get("candidates", [])
    total_pending = len([c for c in all_candidates if c.get("status") == "pending_review"])
    total_approved = len([c for c in all_candidates if c.get("status") == "approved"])
    total_rejected = len([c for c in all_candidates if c.get("status") == "rejected"])

    # 计算完成率
    totalReviewed = total_approved + total_rejected
    completion_rate = round(totalReviewed / len(all_candidates), 2) if all_candidates else 0.0

    # 统计总提取次数（不同候选词的 extraction_count 求和）
    total_extractions = sum(c.get("extraction_count", 0) for c in all_candidates)

    return {
        "total": total,
        "items": items,
        "statistics": {
            "total_pending": total_pending,
            "total_approved": total_approved,
            "total_rejected": total_rejected,
            "completion_rate": completion_rate,
            "total_extractions": total_extractions
        }
    }


@router.post("/approve")
async def approve_words(request: ApproveRequest):
    """
    批量审核通过候选词

    - 更新 candidates.json 中对应 word 的状态为 approved
    - 按 polarity 分别追加到 enhanced_*.txt 文件
    - 调用 lexicon_analyzer.reload() 热加载更新后的词典
    """
    data = _load_candidates()
    candidates = data.get("candidates", [])
    words_to_approve = request.words

    approved_words = []
    approved_count = 0

    for candidate in candidates:
        if candidate.get("word") in words_to_approve and candidate.get("status") == "pending_review":
            candidate["status"] = "approved"
            word = candidate["word"]
            polarity = candidate.get("polarity", "positive")
            score = 1 if polarity == "positive" else -1

            _append_to_enhanced_lexicon(word, score, polarity)

            approved_words.append({
                "word": word,
                "polarity": polarity,
                "score": score
            })
            approved_count += 1

    # 保存更新后的数据
    _save_candidates(data)

    # 热加载词典
    _reload_lexicon()

    return {
        "success": True,
        "approved_count": approved_count,
        "words": approved_words,
        "message": f"已通过 {approved_count} 个词，词典已更新"
    }


@router.post("/reject")
async def reject_words(request: RejectRequest):
    """
    批量拒绝候选词

    - 更新 candidates.json 中对应 word 的状态为 rejected
    - 可选记录拒绝原因
    """
    data = _load_candidates()
    candidates = data.get("candidates", [])
    words_to_reject = request.words
    rejection_reason = request.reason

    rejected_count = 0

    for candidate in candidates:
        if candidate.get("word") in words_to_reject and candidate.get("status") in ["pending_review", "approved"]:
            # 更新状态为 rejected
            candidate["status"] = "rejected"

            # 记录拒绝原因（如果提供）
            if rejection_reason:
                candidate["rejection_reason"] = rejection_reason

            rejected_count += 1

    # 保存更新后的数据
    _save_candidates(data)

    return {
        "success": True,
        "rejected_count": rejected_count,
        "message": f"已拒绝 {rejected_count} 个词"
    }


@router.get("/stats")
async def get_dictionary_stats():
    """
    获取词典统计信息

    - 原始词典统计（positive_words.txt + negative_words.txt）
    - 增强词典统计（enhanced_*.txt，包含新增词数量）
    - 审核进度统计（从 candidates.json）
    """
    # 统计原始词典
    original_positive_count = _count_lines_in_file(ORIGINAL_POSITIVE_FILE)
    original_negative_count = _count_lines_in_file(ORIGINAL_NEGATIVE_FILE)
    original_total = original_positive_count + original_negative_count

    # 统计增强词典
    enhanced_positive_count = _count_lines_in_file(ENHANCED_POSITIVE_FILE)
    enhanced_negative_count = _count_lines_in_file(ENHANCED_NEGATIVE_FILE)
    enhanced_total = enhanced_positive_count + enhanced_negative_count

    # 计算新增词数量（增强词典比原始词典多出的部分）
    newly_added = max(0, enhanced_total - original_total)

    # 从 candidates.json 统计审核进度
    data = _load_candidates()
    all_candidates = data.get("candidates", [])

    total_candidates = len(all_candidates)
    pending_review = len([c for c in all_candidates if c.get("status") == "pending_review"])
    approved = len([c for c in all_candidates if c.get("status") == "approved"])
    rejected = len([c for c in all_candidates if c.get("status") == "rejected"])

    # 计算完成率
    reviewed = approved + rejected
    completion_rate = round(reviewed / total_candidates, 2) if total_candidates else 0.0

    # 统计总提取次数
    total_extractions = sum(c.get("extraction_count", 0) for c in all_candidates)

    return {
        "original_dictionary": {
            "total_words": original_total,
            "positive": original_positive_count,
            "negative": original_negative_count
        },
        "enhanced_dictionary": {
            "total_words": enhanced_total,
            "positive": enhanced_positive_count,
            "negative": enhanced_negative_count,
            "newly_added": newly_added
        },
        "review_progress": {
            "total_candidates": total_candidates,
            "pending_review": pending_review,
            "approved": approved,
            "rejected": rejected,
            "completion_rate": completion_rate,
            "total_extractions": total_extractions
        }
    }


# ==================== 新增端点 ====================

def _persist_dataset_info():
    """将数据集信息持久化到 JSON 文件"""
    os.makedirs(os.path.dirname(_DATASET_INFO_FILE), exist_ok=True)
    with open(_DATASET_INFO_FILE, 'w', encoding='utf-8') as f:
        json.dump(_dataset_info, f, ensure_ascii=False, indent=2)


def _load_dataset_info():
    """从 JSON 文件加载数据集信息到模块级变量"""
    global _dataset_info
    if os.path.exists(_DATASET_INFO_FILE):
        try:
            with open(_DATASET_INFO_FILE, 'r', encoding='utf-8') as f:
                loaded = json.load(f)
                _dataset_info.update(loaded)
        except (json.JSONDecodeError, IOError):
            pass


@router.post("/upload-dataset")
async def upload_extraction_dataset(file: UploadFile = File(...)):
    """
    上传用于梯度提取的数据集（Excel格式）

    文件要求：
    - 格式：.xlsx 或 .xls
    - 必须包含"文本"和"标签"两列
    - 标签值为 "正面"/"负面"/"中性"

    返回：
    - 文件保存路径
    - 样本数量
    - 标签分布统计
    """
    from utils.logger import get_logger
    logger = get_logger('dictionary_review')

    # 1. 验证文件扩展名
    filename = file.filename or ''
    if not filename.lower().endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="文件格式不支持，请上传 .xlsx 或 .xls 格式的 Excel 文件")

    # 2. 保存到 data/ 目录下
    os.makedirs(DATA_DIR, exist_ok=True)
    save_path = os.path.join(DATA_DIR, 'extraction_dataset.xlsx')

    try:
        # 读取上传的文件内容并保存
        content = await file.read()
        with open(save_path, 'wb') as f:
            f.write(content)

        # 3. 用 pandas 读取 Excel 并验证列
        df = pd.read_excel(save_path)

        required_columns = ['文本', '标签']
        missing_cols = [col for col in required_columns if col not in df.columns]
        if missing_cols:
            # 清理无效文件
            if os.path.exists(save_path):
                os.remove(save_path)
            raise HTTPException(
                status_code=400,
                detail=f"Excel 文件缺少必需列: {missing_cols}，请确保包含「文本」和「标签」两列"
            )

        # 4. 统计样本数和标签分布
        sample_count = len(df)
        label_distribution = df['标签'].value_counts().to_dict()
        # 确保三个标签都存在
        for label in ['正面', '负面', '中性']:
            if label not in label_distribution:
                label_distribution[label] = 0

        # 5. 更新模块级变量并持久化
        global _dataset_info
        _dataset_info = {
            'filepath': save_path,
            'sample_count': sample_count,
            'label_distribution': label_distribution,
            'uploaded_at': datetime.now().isoformat()
        }
        _persist_dataset_info()

        logger.info(f"数据集上传成功: {save_path}, 样本数: {sample_count}")

        return {
            "success": True,
            "filepath": save_path,
            "sample_count": sample_count,
            "label_distribution": label_distribution
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"上传数据集失败: {e}")
        # 清理可能已创建的不完整文件
        if os.path.exists(save_path):
            os.remove(save_path)
        raise HTTPException(status_code=500, detail=f"处理数据集时出错: {str(e)}")


@router.post("/toggle-enhanced")
async def toggle_enhanced_dictionary(request: ToggleEnhancedRequest):
    """全局切换增强词典开关
    
    当启用时：
    - 所有使用词典的分析（分析页/消融实验页面/词典管理）都会    当禁用时：
    - 只使用原版 positive_words.txt / negative_words.txt
    """
    from utils.logger import get_logger
    logger = get_logger('dictionary_review')

    enabled = request.enabled

    try:
        from sentiment import get_lexicon_analyzer
        analyzer_instance = get_lexicon_analyzer()

        original_count = _count_lines_in_file(ORIGINAL_POSITIVE_FILE) + _count_lines_in_file(ORIGINAL_NEGATIVE_FILE)
        enhanced_count = _count_lines_in_file(ENHANCED_POSITIVE_FILE) + _count_lines_in_file(ENHANCED_NEGATIVE_FILE)

        # 1. 先持久化状态（确保文件写入成功）
        status_data = {
            'enhanced_enabled': enabled,
            'updated_at': datetime.now().isoformat(),
            'original_count': original_count,
            'enhanced_count': enhanced_count,
            'total_count': (original_count + enhanced_count) if enabled else original_count
        }
        os.makedirs(os.path.dirname(_ENHANCED_STATUS_FILE), exist_ok=True)
        with open(_ENHANCED_STATUS_FILE, 'w', encoding='utf-8') as f:
            json.dump(status_data, f, ensure_ascii=False, indent=2)

        # 2. 再尝试 reload（失败不影响状态持久化）
        if analyzer_instance is not None:
            analyzer_instance.config['enable_enhanced'] = enabled
            try:
                analyzer_instance.reload()
                logger.info(f"增强词典已{'启用' if enabled else '禁用'}，词典已重新加载")
            except Exception as reload_err:
                logger.warning(f"词典 reload 异常（状态已持久化）: {reload_err}")

        # 3. 返回值强制使用请求的 enabled
        return {
            "success": True,
            "enhanced_enabled": enabled,
            "original_count": original_count,
            "enhanced_count": enhanced_count,
            "total_count": status_data['total_count']
        }

    except Exception as e:
        logger.error(f"切换增强词典状态失败: {e}")
        raise HTTPException(status_code=500, detail=f"切换增强词典状态失败: {str(e)}")


@router.get("/dataset-info")
async def get_dataset_info():
    """获取当前已上传的梯度提取数据集信息"""
    # 优先从模块级变量返回，如果为空则尝试从文件加载
    if _dataset_info.get('filepath') is None:
        _load_dataset_info()

    if _dataset_info.get('filepath') is None:
        return {
            "success": True,
            "uploaded": False,
            "message": "暂未上传数据集"
        }

    return {
        "success": True,
        "uploaded": True,
        "filepath": _dataset_info['filepath'],
        "sample_count": _dataset_info['sample_count'],
        "label_distribution": _dataset_info['label_distribution'],
        "uploaded_at": _dataset_info['uploaded_at']
    }


@router.get("/enhanced-status")
async def get_enhanced_status():
    """获取增强词典当前状态（是否启用、词数等）"""
    original_count = _count_lines_in_file(ORIGINAL_POSITIVE_FILE) + _count_lines_in_file(ORIGINAL_NEGATIVE_FILE)
    enhanced_count = _count_lines_in_file(ENHANCED_POSITIVE_FILE) + _count_lines_in_file(ENHANCED_NEGATIVE_FILE)

    # 从持久化文件读取开关状态
    enhanced_enabled = False  # 默认禁用
    if os.path.exists(_ENHANCED_STATUS_FILE):
        try:
            with open(_ENHANCED_STATUS_FILE, 'r', encoding='utf-8') as f:
                status_data = json.load(f)
                enhanced_enabled = status_data.get('enhanced_enabled', False)
        except (json.JSONDecodeError, IOError):
            pass

    total_count = (original_count + enhanced_count) if enhanced_enabled else original_count

    return {
        "success": True,
        "enhanced_enabled": enhanced_enabled,
        "original_count": original_count,
        "enhanced_count": enhanced_count,
        "total_count": total_count
    }


class ExtractionConfigRequest(BaseModel):
    """梯度提取配置请求体"""
    model_type: str = "FP32"
    min_word_freq: int = 5
    max_candidates: int = 500
    top_k_per_sample: int = 10
    polarity_threshold_pos: float = 0.7
    polarity_threshold_neg: float = 0.3


@router.post("/gradient-extract")
async def perform_gradient_extraction(config: ExtractionConfigRequest):
    """
    执行梯度×嵌入法情感词提取（SSE 流式进度推送）
    
    流程：
    1. 加载已上传的数据集（extraction_dataset.xlsx）
    2. 获取当前 RoBERTa 模型和分词器
    3. 创建 GradientExtractor 并执行提取（逐 batch 推送进度）
    4. 结果增量合并至 candidates.json
    5. 返回最终统计结果
    """
    from utils.logger import get_logger
    logger = get_logger('dictionary_review')

    def event_generator():
        try:
            dataset_filepath = _dataset_info.get('filepath')
            if not dataset_filepath or not os.path.exists(dataset_filepath):
                yield f"data: {json.dumps({'type': 'error', 'detail': '请先上传训练数据集'}, ensure_ascii=False)}\n\n"
                return

            df = pd.read_excel(dataset_filepath)
            
            required_cols = {'文本', '标签'}
            if not required_cols.issubset(df.columns):
                yield f"data: {json.dumps({'type': 'error', 'detail': f'数据集缺少必要列，需要: {required_cols}'}, ensure_ascii=False)}\n\n"
                return

            label_map = {'正面': 1, '负面': 0, '中性': 2}
            dataset = []
            for _, row in df.iterrows():
                text = str(row['文本']).strip()
                label_str = str(row['标签']).strip()
                if label_str in label_map:
                    dataset.append({
                        'text': text,
                        'label': label_map[label_str]
                    })

            if len(dataset) == 0:
                yield f"data: {json.dumps({'type': 'error', 'detail': '数据集为空或标签格式不正确'}, ensure_ascii=False)}\n\n"
                return

            logger.info(f"开始梯度提取，数据集: {len(dataset)} 条样本")

            yield f"data: {json.dumps({'type': 'progress', 'progress': 0, 'message': f'模型就绪，共 {len(dataset)} 条样本...'}, ensure_ascii=False)}\n\n"

            from services.unified_model_manager import unified_model_manager
            model, tokenizer = unified_model_manager.get_current_model()
            if model is None or tokenizer is None:
                yield f"data: {json.dumps({'type': 'error', 'detail': '模型未加载，请先在模型训练页面初始化模型'}, ensure_ascii=False)}\n\n"
                return

            from sentiment.gradient_extractor import GradientExtractor

            extractor_config = {
                'min_word_freq': config.min_word_freq,
                'max_candidates': config.max_candidates,
                'top_k_per_sample': config.top_k_per_sample,
                'polarity_threshold_pos': config.polarity_threshold_pos,
                'polarity_threshold_neg': config.polarity_threshold_neg,
            }

            extractor = GradientExtractor(model, tokenizer, extractor_config)

            total_batches = extractor.prepare(dataset)
            yield f"data: {json.dumps({'type': 'progress', 'progress': 0, 'message': f'模型就绪，共 {len(dataset)} 条样本，{total_batches} 个批次...'}, ensure_ascii=False)}\n\n"

            heartbeat_every = 50
            while True:
                current = extractor.process_next_batch()
                if current is None:
                    break
                if current % heartbeat_every == 0:
                    yield f": heartbeat\n\n"
                pct = int(current / total_batches * 100)
                yield f"data: {json.dumps({'type': 'progress', 'progress': pct, 'message': f'梯度提取中... {current}/{total_batches} 批次 ({pct}%)'}, ensure_ascii=False)}\n\n"

            ranked_candidates = extractor.finalize()
            
            extractor.export_candidates()

            positive_count = sum(1 for c in ranked_candidates if c.get('polarity') == 'positive')
            negative_count = sum(1 for c in ranked_candidates if c.get('polarity') == 'negative')

            result = {
                "success": True,
                "total_candidates": len(ranked_candidates),
                "new_candidates": len(ranked_candidates),
                "positive_count": positive_count,
                "negative_count": negative_count,
                "message": f"成功提取 {len(ranked_candidates)} 个候选词（正面 {positive_count}，负面 {negative_count}）"
            }

            logger.info(f"梯度提取完成: {result}")
            yield f"data: {json.dumps({'type': 'complete', **result}, ensure_ascii=False)}\n\n"

        except Exception as e:
            logger.error(f"梯度提取失败: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'detail': f'梯度提取失败: {str(e)}'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )
