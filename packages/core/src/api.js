async function api(path, options = {}) {
  const response = await fetch(`/v1${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (response.status === 204) return null;
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || '请求失败。');
  return payload;
}

export { api };
