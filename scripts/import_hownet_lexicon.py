#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
知网情感词典导入脚本

功能：
1. 从GitHub下载知网情感词典（正面词、负面词）
2. 筛选电商领域相关词汇
3. 根据程度词标注情感强度
4. 合并到现有词典文件，去重并更新权重

使用方式：
    python scripts/import_hownet_lexicon.py [--source hownet_url] [--output data/]
"""

import argparse
import os
import re
import sys
from pathlib import Path
from typing import Dict, List, Set, Tuple
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

# 添加项目根目录到路径
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


# ============================================================================
# 配置常量
# ============================================================================

# 知网情感词典URL（使用goto456/feeling_dictionary仓库）
DEFAULT_POSITIVE_URL = "https://raw.githubusercontent.com/goto456/feeling_dictionary/master/%E6%B4%8B%E6%BA%A2%E8%AF%8D%E8%A1%A8.txt"
DEFAULT_NEGATIVE_URL = "https://raw.githubusercontent.com/goto456/feeling_dictionary/master/%E8%B4%AC%E4%B9%89%E8%AF%8D%E8%A1%A8.txt"

# 默认输出目录
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "data"

# 电商领域关键词（用于筛选相关词汇）
E_COMMERCE_KEYWORDS = {
    # 产品质量相关
    "质量", "品质", "做工", "材质", "用料", "精细", "粗糙", "优质", "劣质",
    "好", "坏", "棒", "差", "佳", "次", "上乘", "下乘", "一流", "二流",
    "精致", "精美", "精良", "精美", "粗糙", "简陋", "结实", "牢固", "脆弱",
    "耐用", "结实", "厚实", "轻薄", "厚", "薄", "重", "轻",

    # 服务态度相关
    "服务", "态度", "热情", "冷漠", "耐心", "急躁", "周到", "敷衍", "细心",
    "认真", "马虎", "负责", "推诿", "贴心", "用心", "专业", "业余", "敬业",
    "礼貌", "客气", "友好", "亲切", "和蔼", "生硬", "傲慢", "谦逊",

    # 物流配送相关
    "物流", "快递", "配送", "发货", "收货", "送货", "运输", "包装",
    "快", "慢", "及时", "延迟", "准时", "迟到", "迅速", "缓慢", "飞快",
    "完好", "破损", "损坏", "完整", "齐全", "缺失", "丢失",

    # 价格相关
    "价格", "价钱", "价位", "性价比", "便宜", "贵", "划算", "不值", "实惠",
    "公道", "合理", "昂贵", "廉价", "优惠", "折扣", "促销", "物美价廉",
    "物超所值", "物有所值", "物美价廉", "物美价廉",

    # 使用体验相关
    "体验", "感觉", "感受", "舒服", "舒适", "难受", "方便", "麻烦", "便捷",
    "简单", "复杂", "易用", "难用", "顺手", "别扭", "满意", "失望",
    "惊喜", "意外", "惊喜", "称心", "顺心", "顺意", "如意",

    # 外观相关
    "外观", "样子", "造型", "颜色", "款式", "设计", "美观", "漂亮", "好看",
    "难看", "丑", "时尚", "老气", "新颖", "过时", "大气", "小巧", "精致",

    # 功能相关
    "功能", "性能", "效果", "效果", "作用", "用途", "实用", "好用", "管用",
    "有效", "无效", "强大", "弱", "强劲", "稳定", "不稳定", "流畅", "卡顿",

    # 整体评价
    "推荐", "不推荐", "值得", "不值", "满意", "不满意", "喜欢", "讨厌",
    "爱", "恨", "赞", "踩", "好评", "差评", "中评", "回购", "回头客",
}

# 程度词及其权重（用于判断情感强度）
DEGREE_WORDS = {
    # 强烈程度词（权重2.0，对应情感强度3分）
    "极其": 2.0, "最为": 2.0, "最": 2.0, "超级": 2.0, "极致": 2.0,
    "极端": 2.0, "极度": 2.0, "绝对": 2.0, "全然": 2.0, "百分之百": 2.0,
    "百分百": 2.0, "彻彻底底": 2.0, "无比": 2.0, "万分": 2.0,

    # 非常程度词（权重1.8，对应情感强度2-3分）
    "非常": 1.8, "十分": 1.8, "特别": 1.8, "格外": 1.8, "超": 1.8,
    "太": 1.8, "完全": 1.8, "十足": 1.8, "过于": 1.8, "尤其": 1.8,
    "分外": 1.8, "甚为": 1.8,

    # 很程度词（权重1.5，对应情感强度2分）
    "很": 1.5, "挺": 1.5, "相当": 1.5, "真": 1.5, "实在": 1.5,
    "确实": 1.5, "真的": 1.5, "颇为": 1.5, "多么": 1.5, "好生": 1.5,
    "好不": 1.5, "那么": 1.5, "如此": 1.5, "这般": 1.5,
    "更加": 1.5, "更为": 1.5, "越发": 1.5, "愈发": 1.5, "愈益": 1.5,
    "越来越": 1.5,

    # 比较程度词（权重1.3，对应情感强度1-2分）
    "比较": 1.3, "稍": 1.3, "稍许": 1.3, "多少": 1.3,

    # 轻微程度词（权重0.8，对应情感强度1分）
    "有点": 0.8, "稍微": 0.8, "略微": 0.8, "稍稍": 0.8, "些许": 0.8,
    "一点": 0.8, "一点儿": 0.8, "有些": 0.8,
}


# ============================================================================
# 工具函数
# ============================================================================

def download_file(url: str, timeout: int = 30) -> List[str]:
    """
    从URL下载文件内容

    Args:
        url: 文件URL
        timeout: 超时时间（秒）

    Returns:
        文件行列表
    """
    print(f"正在下载: {url}")

    try:
        request = Request(url)
        request.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')

        with urlopen(request, timeout=timeout) as response:
            content = response.read().decode('utf-8')
            lines = [line.strip() for line in content.split('\n') if line.strip()]
            print(f"下载成功，共 {len(lines)} 行")
            return lines

    except HTTPError as e:
        print(f"HTTP错误: {e.code} - {e.reason}")
        return []
    except URLError as e:
        print(f"URL错误: {e.reason}")
        return []
    except Exception as e:
        print(f"下载失败: {e}")
        return []


def load_existing_lexicon(file_path: Path) -> Dict[str, int]:
    """
    加载现有词典文件

    Args:
        file_path: 词典文件路径

    Returns:
        词汇到权重的映射字典
    """
    lexicon = {}

    if not file_path.exists():
        print(f"词典文件不存在: {file_path}")
        return lexicon

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue

                # 解析格式：词语,权重 或 行号→词语,权重
                if '→' in line:
                    # 处理带行号的格式
                    parts = line.split('→', 1)
                    if len(parts) == 2:
                        content = parts[1]
                else:
                    content = line

                if ',' in content:
                    word, weight = content.rsplit(',', 1)
                    word = word.strip()
                    try:
                        weight = int(weight.strip())
                        lexicon[word] = weight
                    except ValueError:
                        continue

        print(f"加载词典: {file_path.name}，共 {len(lexicon)} 个词汇")

    except Exception as e:
        print(f"加载词典失败: {e}")

    return lexicon


def save_lexicon(file_path: Path, lexicon: Dict[str, int]) -> None:
    """
    保存词典到文件

    Args:
        file_path: 词典文件路径
        lexicon: 词汇到权重的映射字典
    """
    try:
        # 按权重排序，权重高的在前
        sorted_words = sorted(lexicon.items(), key=lambda x: (-abs(x[1]), x[0]))

        with open(file_path, 'w', encoding='utf-8') as f:
            for idx, (word, weight) in enumerate(sorted_words, 1):
                f.write(f"{idx}→{word},{weight}\n")

        print(f"保存词典: {file_path.name}，共 {len(lexicon)} 个词汇")

    except Exception as e:
        print(f"保存词典失败: {e}")


def is_e_commerce_related(word: str) -> bool:
    """
    判断词汇是否与电商领域相关

    Args:
        word: 待判断的词汇

    Returns:
        是否与电商相关
    """
    # 检查词汇是否包含电商关键词
    for keyword in E_COMMERCE_KEYWORDS:
        if keyword in word or word in keyword:
            return True

    # 检查词汇是否与电商关键词相似
    # 使用简单的字符重叠判断
    word_chars = set(word)
    for keyword in E_COMMERCE_KEYWORDS:
        keyword_chars = set(keyword)
        # 如果字符重叠度超过50%，认为相关
        overlap = len(word_chars & keyword_chars)
        if overlap > 0 and overlap / max(len(word_chars), 1) > 0.5:
            return True

    return False


def calculate_sentiment_intensity(word: str, base_intensity: int = 2) -> int:
    """
    计算词汇的情感强度

    Args:
        word: 情感词汇
        base_intensity: 基础强度（默认2分）

    Returns:
        情感强度（1-3分）
    """
    # 检查是否包含强烈程度词
    for degree_word, weight in DEGREE_WORDS.items():
        if weight >= 2.0 and degree_word in word:
            return 3  # 强烈情感

    # 检查是否包含轻微程度词
    for degree_word, weight in DEGREE_WORDS.items():
        if weight <= 0.8 and degree_word in word:
            return 1  # 轻微情感

    # 检查词汇本身的强度
    # 包含"非常"、"超级"、"极其"等词的词汇
    strong_patterns = ["非常", "超级", "极其", "特别", "十分", "太", "最", "超"]
    for pattern in strong_patterns:
        if pattern in word:
            return 3

    # 包含"有点"、"稍微"等词的词汇
    weak_patterns = ["有点", "稍微", "略微", "稍稍", "有些"]
    for pattern in weak_patterns:
        if pattern in word:
            return 1

    return base_intensity


def parse_hownet_words(lines: List[str], is_positive: bool) -> Dict[str, int]:
    """
    解析知网情感词典内容

    Args:
        lines: 词典文件行列表
        is_positive: 是否为正面词汇

    Returns:
        词汇到权重的映射字典
    """
    words = {}

    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'):
            continue

        # 知网词典格式：每行一个词汇
        # 可能包含注释，需要清理
        word = line.split('#')[0].strip()
        word = word.split('\t')[0].strip()

        if not word or len(word) < 2:
            continue

        # 筛选电商相关词汇
        if not is_e_commerce_related(word):
            continue

        # 计算情感强度
        intensity = calculate_sentiment_intensity(word)

        # 根据正负面设置权重符号
        weight = intensity if is_positive else -intensity

        # 如果词汇已存在，保留权重较高的
        if word in words:
            if abs(weight) > abs(words[word]):
                words[word] = weight
        else:
            words[word] = weight

    return words


def merge_lexicons(
    existing: Dict[str, int],
    new: Dict[str, int]
) -> Tuple[Dict[str, int], int, int]:
    """
    合并两个词典

    Args:
        existing: 现有词典
        new: 新词典

    Returns:
        (合并后的词典, 新增词汇数, 更新词汇数)
    """
    merged = existing.copy()
    added_count = 0
    updated_count = 0

    for word, weight in new.items():
        if word not in merged:
            # 新词汇
            merged[word] = weight
            added_count += 1
        else:
            # 已存在词汇，如果新权重绝对值更大则更新
            if abs(weight) > abs(merged[word]):
                merged[word] = weight
                updated_count += 1

    return merged, added_count, updated_count


# ============================================================================
# 主函数
# ============================================================================

def import_hownet_lexicon(
    positive_url: str = DEFAULT_POSITIVE_URL,
    negative_url: str = DEFAULT_NEGATIVE_URL,
    output_dir: Path = DEFAULT_OUTPUT_DIR,
    skip_download: bool = False
) -> None:
    """
    导入知网情感词典

    Args:
        positive_url: 正面词汇URL
        negative_url: 负面词汇URL
        output_dir: 输出目录
        skip_download: 是否跳过下载（使用本地测试数据）
    """
    print("=" * 60)
    print("知网情感词典导入工具")
    print("=" * 60)

    # 确保输出目录存在
    output_dir.mkdir(parents=True, exist_ok=True)

    # 加载现有词典
    print("\n[1/5] 加载现有词典...")
    positive_file = output_dir / "positive_words.txt"
    negative_file = output_dir / "negative_words.txt"

    existing_positive = load_existing_lexicon(positive_file)
    existing_negative = load_existing_lexicon(negative_file)

    print(f"现有正面词汇: {len(existing_positive)} 个")
    print(f"现有负面词汇: {len(existing_negative)} 个")

    # 下载知网词典
    print("\n[2/5] 下载知网情感词典...")
    if skip_download:
        print("跳过下载，使用测试数据...")
        positive_lines = ["好", "优秀", "满意", "推荐", "优质", "非常好", "超级棒"]
        negative_lines = ["差", "糟糕", "失望", "不满", "劣质", "非常差", "超级烂"]
    else:
        positive_lines = download_file(positive_url)
        negative_lines = download_file(negative_url)

    if not positive_lines and not negative_lines:
        print("下载失败，请检查网络连接或使用 --skip-download 参数")
        return

    # 解析知网词典
    print("\n[3/5] 解析并筛选电商相关词汇...")
    new_positive = parse_hownet_words(positive_lines, is_positive=True)
    new_negative = parse_hownet_words(negative_lines, is_positive=False)

    print(f"筛选后正面词汇: {len(new_positive)} 个")
    print(f"筛选后负面词汇: {len(new_negative)} 个")

    # 显示部分筛选结果
    if new_positive:
        print("\n示例正面词汇（前10个）:")
        for word, weight in list(new_positive.items())[:10]:
            print(f"  {word}: {weight}")

    if new_negative:
        print("\n示例负面词汇（前10个）:")
        for word, weight in list(new_negative.items())[:10]:
            print(f"  {word}: {weight}")

    # 合并词典
    print("\n[4/5] 合并词典...")
    merged_positive, pos_added, pos_updated = merge_lexicons(
        existing_positive, new_positive
    )
    merged_negative, neg_added, neg_updated = merge_lexicons(
        existing_negative, new_negative
    )

    # 保存词典
    print("\n[5/5] 保存词典...")
    save_lexicon(positive_file, merged_positive)
    save_lexicon(negative_file, merged_negative)

    # 打印统计信息
    print("\n" + "=" * 60)
    print("导入完成统计")
    print("=" * 60)
    print(f"\n正面词汇:")
    print(f"  合并前: {len(existing_positive)} 个")
    print(f"  合并后: {len(merged_positive)} 个")
    print(f"  新增: {pos_added} 个")
    print(f"  更新: {pos_updated} 个")

    print(f"\n负面词汇:")
    print(f"  合并前: {len(existing_negative)} 个")
    print(f"  合并后: {len(merged_negative)} 个")
    print(f"  新增: {neg_added} 个")
    print(f"  更新: {neg_updated} 个")

    print(f"\n总计:")
    print(f"  新增词汇: {pos_added + neg_added} 个")
    print(f"  更新词汇: {pos_updated + neg_updated} 个")
    print(f"  最终词汇总数: {len(merged_positive) + len(merged_negative)} 个")

    print("\n" + "=" * 60)


def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description="导入知网情感词典到电商评论情感分析系统",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
    # 使用默认URL下载
    python scripts/import_hownet_lexicon.py

    # 指定自定义URL
    python scripts/import_hownet_lexicon.py --positive-url https://example.com/positive.txt

    # 指定输出目录
    python scripts/import_hownet_lexicon.py --output ./custom_data/

    # 跳过下载（用于测试）
    python scripts/import_hownet_lexicon.py --skip-download
        """
    )

    parser.add_argument(
        '--positive-url',
        type=str,
        default=DEFAULT_POSITIVE_URL,
        help=f'正面词汇词典URL (默认: {DEFAULT_POSITIVE_URL})'
    )

    parser.add_argument(
        '--negative-url',
        type=str,
        default=DEFAULT_NEGATIVE_URL,
        help=f'负面词汇词典URL (默认: {DEFAULT_NEGATIVE_URL})'
    )

    parser.add_argument(
        '--output',
        type=str,
        default=str(DEFAULT_OUTPUT_DIR),
        help=f'输出目录 (默认: {DEFAULT_OUTPUT_DIR})'
    )

    parser.add_argument(
        '--skip-download',
        action='store_true',
        help='跳过下载，使用测试数据'
    )

    args = parser.parse_args()

    # 执行导入
    import_hownet_lexicon(
        positive_url=args.positive_url,
        negative_url=args.negative_url,
        output_dir=Path(args.output),
        skip_download=args.skip_download
    )


if __name__ == "__main__":
    main()
