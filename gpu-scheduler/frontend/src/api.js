// Gọi API backend — docs/10-design/api.md
export class ApiError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api(method, url, body) {
  let res;
  try {
    res = await fetch(`/api${url}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
  }
  if (res.status === 204) return null;
  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const e = data && data.error ? data.error : { code: 'HTTP_' + res.status, message: 'Lỗi máy chủ' };
    throw new ApiError(res.status, e.code, e.message, e.details || {});
  }
  return data;
}

export const get = (url) => api('GET', url);
export const post = (url, body) => api('POST', url, body);
export const put = (url, body) => api('PUT', url, body);
export const del = (url) => api('DELETE', url);
