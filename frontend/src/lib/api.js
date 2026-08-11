const API_BASE = import.meta.env.VITE_API_BASE || '';

async function readErrorMessage(response, fallback) {
  try {
    const body = await response.json();
    return body?.error || fallback;
  } catch {
    return fallback;
  }
}

export async function detectFood(base64, token) {
  const response = await fetch(`${API_BASE}/api/detect-food`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ base64 }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Something went wrong analyzing your photo.'));
  }

  return response.json(); // { tag }
}

// Fetches the nutrition-facts image as a blob (rather than pointing an <img> straight at
// the API URL) because /api/nutrition-image requires an Authorization header, and browsers
// can't attach custom headers to a plain <img src>. Also surfaces the shared-key usage
// counters from response headers so the caller can update its indicator without a second
// round trip.
export async function fetchNutritionImage(tag, token) {
  const response = await fetch(`${API_BASE}/api/nutrition-image?tag=${encodeURIComponent(tag)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const used = response.headers.get('X-Wolfram-Usage-Used');
  const limit = response.headers.get('X-Wolfram-Usage-Limit');
  const usage = used !== null ? { used: Number(used), limit: Number(limit) } : null;

  if (!response.ok) {
    const error = new Error(await readErrorMessage(response, "Could not find nutrition facts for this food."));
    error.status = response.status;
    error.usage = usage;
    throw error;
  }

  const blob = await response.blob();
  return { blobUrl: URL.createObjectURL(blob), usage };
}

export async function getWolframUsage(token) {
  const response = await fetch(`${API_BASE}/api/wolfram-usage`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Could not fetch your Overwatch usage.'));
  }
  return response.json(); // { hasOwnKey, used, limit, remaining }
}

export async function saveWolframKey(appId, token) {
  const response = await fetch(`${API_BASE}/api/wolfram-key`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ appId }),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not save your Wolfram Alpha App ID."));
  }
  return response.json();
}

export async function deleteWolframKey(token) {
  const response = await fetch(`${API_BASE}/api/wolfram-key`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not remove your Wolfram Alpha App ID."));
  }
  return response.json();
}
