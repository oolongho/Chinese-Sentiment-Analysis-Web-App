/**
 * API 请求工具函数
 * 提供统一的错误处理和响应解析
 */

/**
 * 处理 API 响应
 * @param response fetch 响应对象
 * @returns 解析后的数据
 * @throws Error 当响应失败时抛出错误
 */
export async function handleApiResponse<T>(response: Response): Promise<T> {
  // 检查 HTTP 状态码
  if (!response.ok) {
    // 尝试解析错误详情
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    
    try {
      const errorData = await response.json();
      errorMessage = errorData.detail || errorData.message || errorMessage;
    } catch {
      // 无法解析 JSON，使用默认错误消息
    }
    
    throw new Error(errorMessage);
  }

  // 解析 JSON 响应
  const data = await response.json();
  
  // 检查业务逻辑是否成功
  if (data && typeof data === 'object' && 'success' in data && !data.success) {
    throw new Error(data.detail || data.message || '操作失败');
  }
  
  return data;
}

/**
 * 创建带认证的请求头
 * @param token 认证 token
 * @param contentType 内容类型
 * @returns 请求头对象
 */
export function createAuthHeaders(token: string, contentType: string = 'application/json'): HeadersInit {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': contentType,
  };
}

/**
 * 安全的 fetch 包装器
 * @param url 请求 URL
 * @param options fetch 选项
 * @returns Promise<响应数据>
 */
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
