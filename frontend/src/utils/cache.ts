/**
 * 本地存储缓存工具
 * 提供带过期时间的缓存机制
 */

interface CacheData<T> {
  data: T;
  timestamp: number;
}

/**
 * 缓存配置
 */
interface CacheConfig {
  key: string;
  expiryMs: number; // 过期时间（毫秒）
}

/**
 * 创建带过期时间的缓存 Hook
 * @param config 缓存配置
 * @returns 缓存读写方法
 */
export function createCache<T>(config: CacheConfig) {
  const { key, expiryMs } = config;

  /**
   * 获取缓存数据
   * @returns 如果缓存有效则返回数据，否则返回 null
   */
  const getCache = (): T | null => {
    try {
      const cached = localStorage.getItem(key);
      if (!cached) {
        return null;
      }

      const { data, timestamp }: CacheData<T> = JSON.parse(cached);
      const now = Date.now();

      // 检查是否过期
      if (now - timestamp >= expiryMs) {
        // 缓存已过期，删除
        localStorage.removeItem(key);
        return null;
      }

      return data;
    } catch (error) {
      console.error(`读取缓存失败 [${key}]:`, error);
      return null;
    }
  };

  /**
   * 设置缓存
   * @param data 要缓存的数据
   */
  const setCache = (data: T): void => {
    try {
      const cacheData: CacheData<T> = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(key, JSON.stringify(cacheData));
    } catch (error) {
      console.error(`写入缓存失败 [${key}]:`, error);
    }
  };

  /**
   * 清除缓存
   */
  const clearCache = (): void => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`清除缓存失败 [${key}]:`, error);
    }
  };

  /**
   * 检查缓存是否有效
   * @returns 缓存是否有效
   */
  const isValid = (): boolean => {
    return getCache() !== null;
  };

  return {
    getCache,
    setCache,
    clearCache,
    isValid,
  };
}

/**
 * 词典统计缓存配置
 */
export const DICTIONARY_STATS_CACHE = {
  key: 'dictionary_stats_cache',
  expiryMs: 5 * 60 * 1000, // 5 分钟
};

/**
 * 词典统计缓存实例
 */
export const dictionaryStatsCache = createCache<Record<string, number>>(DICTIONARY_STATS_CACHE);
