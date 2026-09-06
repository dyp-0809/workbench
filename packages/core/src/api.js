const API_REQUEST_START_EVENT = 'personal-workbench:api-request-start';
const API_REQUEST_END_EVENT = 'personal-workbench:api-request-end';
const API_REQUEST_ERROR_EVENT = 'personal-workbench:api-request-error';
let nextRequestId = 0;

function dispatchApiEvent(type, detail) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(type, { detail }));
}
function toApiError(error) {
  if (error instanceof TypeError && /fetch/i.test(error.message)) return new Error('无法连接本地服务，请确认服务正在运行。');
  return error instanceof Error ? error : new Error('请求失败。');
}

function reportApiError(error, requestId = String(++nextRequestId)) {
  const apiError = toApiError(error);
  apiError.isApiError = true;
  dispatchApiEvent(API_REQUEST_ERROR_EVENT, { requestId, message: apiError.message });
  return apiError;
}

async function api(path, options = {}) {
  const requestId = String(++nextRequestId);
  dispatchApiEvent(API_REQUEST_START_EVENT, { requestId });
  try {
    const response = await fetch(`/v1${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
    if (response.status === 204) return null;
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.error || `请求失败（HTTP ${response.status}）。`);
      error.payload = payload;
      error.status = response.status;
      throw error;
    }
    return payload;
  } catch (error) {
    throw reportApiError(error, requestId);
  } finally {
    dispatchApiEvent(API_REQUEST_END_EVENT, { requestId });
  }
}

export { api, reportApiError, API_REQUEST_START_EVENT, API_REQUEST_END_EVENT, API_REQUEST_ERROR_EVENT };

