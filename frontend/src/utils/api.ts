export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  headers?: HeadersInit;
  requireAuth?: boolean;
  showErrorMessage?: boolean;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  detail?: string;
  error?: string;
}

class ApiClient {
  private getToken(): string | null {
    return localStorage.getItem('training_token');
  }

  private getAuthHeaders(contentType: string = 'application/json'): HeadersInit | undefined {
    const token = this.getToken();
    if (!token) return undefined;
    return {
      'Content-Type': contentType,
      'Authorization': `Bearer ${token}`,
    };
  }

  private async checkResponseErrors(response: Response, showErrorMessage: boolean, errorPrefix: string = '请求失败'): Promise<string | null> {
    if (response.status === 401) {
      localStorage.removeItem('training_token');
      if (showErrorMessage) {
        alert('登录已过期，请重新登录');
      }
      if (window.location.pathname !== '/training') {
        window.location.href = '/training';
      }
      return '登录已过期，请重新登录';
    }

    if (!response.ok) {
      let detail = `${errorPrefix}: ${response.status}`;
      try {
        const errorData = await response.json();
        if (Array.isArray(errorData.detail)) {
          detail = errorData.detail
            .map((err: any) => `${err.loc?.join('.') || ''}: ${err.msg}`)
            .join('; ');
        } else {
          detail = errorData.detail || errorData.message || detail;
        }
      } catch {}
      if (showErrorMessage) {
        alert(detail);
      }
      return detail;
    }

    return null;
  }

  private async handleResponse<T>(response: Response, showErrorMessage: boolean): Promise<ApiResponse<T>> {
    const error = await this.checkResponseErrors(response, showErrorMessage);
    if (error) {
      return { success: false, detail: error };
    }

    try {
      const data = await response.json();
      return { success: true, data };
    } catch {
      return { success: true, data: null as any };
    }
  }

  async request<T = any>(endpoint: string, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
    const {
      method = 'GET',
      body,
      headers = {},
      requireAuth = true,
      showErrorMessage = true,
    } = options;

    const authHeaders = requireAuth ? this.getAuthHeaders() : undefined;

    try {
      const response = await fetch(endpoint, {
        method,
        headers: { ...authHeaders, ...headers },
        body: body ? JSON.stringify(body) : undefined,
      });

      return await this.handleResponse<T>(response, showErrorMessage);
    } catch (error) {
      console.error('API请求失败:', error);
      const errorMessage = '网络错误，请检查网络连接';
      if (showErrorMessage) {
        alert(errorMessage);
      }
      return { success: false, detail: errorMessage };
    }
  }

  async get<T = any>(endpoint: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  async post<T = any>(endpoint: string, body?: any, options?: Omit<ApiRequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body });
  }

  async put<T = any>(endpoint: string, body?: any, options?: Omit<ApiRequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body });
  }

  async delete<T = any>(endpoint: string, options?: Omit<ApiRequestOptions, 'method'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  async uploadFile<T = any>(
    endpoint: string,
    file: File,
    options?: Omit<ApiRequestOptions, 'method' | 'body' | 'headers'>
  ): Promise<ApiResponse<T>> {
    const { requireAuth = true, showErrorMessage = true } = options || {};

    const token = requireAuth ? this.getToken() : null;
    const headers: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {};

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: formData,
      });

      return await this.handleResponse<T>(response, showErrorMessage);
    } catch (error) {
      console.error('文件上传失败:', error);
      const errorMessage = '上传失败，请检查网络连接';
      if (showErrorMessage) {
        alert(errorMessage);
      }
      return { success: false, detail: errorMessage };
    }
  }

  async uploadFormData<T = any>(
    endpoint: string,
    formData: FormData,
    options?: Omit<ApiRequestOptions, 'method' | 'body' | 'headers'>
  ): Promise<ApiResponse<T>> {
    const { requireAuth = true, showErrorMessage = true } = options || {};

    const token = requireAuth ? this.getToken() : null;
    const headers: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {};

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: formData,
      });

      return await this.handleResponse<T>(response, showErrorMessage);
    } catch (error) {
      console.error('表单上传失败:', error);
      const errorMessage = '上传失败，请检查网络连接';
      if (showErrorMessage) {
        alert(errorMessage);
      }
      return { success: false, detail: errorMessage };
    }
  }

  async download(
    endpoint: string,
    body?: any,
    filename: string = 'download',
    options?: Omit<ApiRequestOptions, 'method' | 'body' | 'headers'>
  ): Promise<boolean> {
    const { requireAuth = true, showErrorMessage = true } = options || {};

    const token = requireAuth ? this.getToken() : null;
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const error = await this.checkResponseErrors(response, showErrorMessage, '下载失败');
      if (error) {
        return false;
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);
      return true;
    } catch (error) {
      console.error('下载失败:', error);
      if (showErrorMessage) {
        alert('下载失败，请检查网络连接');
      }
      return false;
    }
  }
}

export const apiClient = new ApiClient();

export async function handleApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.detail || errorData.message || errorMessage;
    } catch {}
    throw new Error(errorMessage);
  }

  const data = await response.json();

  if (data && typeof data === 'object' && 'success' in data && !data.success) {
    throw new Error(data.detail || data.message || '操作失败');
  }

  return data;
}

export function createAuthHeaders(token: string, contentType: string = 'application/json'): HeadersInit {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': contentType,
  };
}

export async function safeFetch<T>(
  url: string,
  options?: RequestInit
): Promise<{ data: T | null; error: string | null }> {
  try {
    const response = await fetch(url, options);
    const data = await handleApiResponse<T>(response);
    return { data, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    return { data: null, error: errorMessage };
  }
}
