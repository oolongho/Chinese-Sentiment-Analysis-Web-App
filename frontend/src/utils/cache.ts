/**
 * 本地存储缓存工具
 * 提供带过期时间的缓存机制
 */

interface CacheData<T> {
  data: T;
  timestamp: number;
}

interface CacheConfig {
  key: string;
  expiryMs: number;
}

export function createCache<T>(config: CacheConfig) {
  const { key, expiryMs } = config;

  const getCache = (): T | null => {
    try {
      const cached = localStorage.getItem(key);
      if (!cached) {
        return null;
      }

      const { data, timestamp }: CacheData<T> = JSON.parse(cached);
      const now = Date.now();

      if (now - timestamp >= expiryMs) {
        localStorage.removeItem(key);
        return null;
      }

      return data;
    } catch (error) {
      console.error(`读取缓存失败 [${key}]:`, error);
      return null;
    }
  };

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

  const clearCache = (): void => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`清除缓存失败 [${key}]:`, error);
    }
  };

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

export const DICTIONARY_STATS_CACHE = {
  key: 'dictionary_stats_cache',
  expiryMs: 5 * 60 * 1000,
};

interface DictionaryStats {
  positive_count: number;
  negative_count: number;
  degree_count: number;
  negation_count: number;
}

export const dictionaryStatsCache = createCache<DictionaryStats>(DICTIONARY_STATS_CACHE);
