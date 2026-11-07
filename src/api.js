export async function api(path, { method = 'GET', body, token } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const error = new Error('Could not reach the server. Check your connection and try again.');
    error.status = 0;
    throw error;
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error = new Error(data?.error || `Server request failed with status ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return data;
}