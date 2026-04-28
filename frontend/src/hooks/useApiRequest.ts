import { useState, useCallback } from 'react';
import { apiClient, ApiRequestOptions, ApiResponse } from '../utils/api';

interface UseApiRequestResult<T> {
  loading: boolean;
  error: string | null;
  execute: (endpoint: string, options?: ApiRequestOptions) => Promise<ApiResponse<T>>;
  reset: () => void;
}

export function useApiRequest<T = any>(): UseApiRequestResult<T> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (
    endpoint: string,
    options?: ApiRequestOptions
  ): Promise<ApiResponse<T>> => {
    setLoading(true);
    setError(null);

    try {
      const result = await apiClient.request<T>(endpoint, {
        ...options,
        showErrorMessage: false,
      });

      if (!result.success) {
        setError(result.detail || '请求失败');
      }

      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
  }, []);

  return { loading, error, execute, reset };
}

interface UseFileUploadResult<T> {
  loading: boolean;
  error: string | null;
  upload: (endpoint: string, file: File, options?: Omit<ApiRequestOptions, 'method' | 'body' | 'headers'>) => Promise<ApiResponse<T>>;
  reset: () => void;
}

export function useFileUpload<T = any>(): UseFileUploadResult<T> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (
    endpoint: string,
    file: File,
    options?: Omit<ApiRequestOptions, 'method' | 'body' | 'headers'>
  ): Promise<ApiResponse<T>> => {
    setLoading(true);
    setError(null);

    try {
      const result = await apiClient.uploadFile<T>(endpoint, file, {
        ...options,
        showErrorMessage: false,
      });

      if (!result.success) {
        setError(result.detail || '上传失败');
      }

      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
  }, []);

  return { loading, error, upload, reset };
}
