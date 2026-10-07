import { FriendlyError, NETWORK_MESSAGE } from './errors';

const API_BASE = import.meta.env.VITE_API_BASE || '';

// Every error thrown from this file is a FriendlyError, so callers can show its message as-is (see
// lib/errors.js). fetch() itself rejects with the browser's own wording when the server can't be
// reached at all - "Failed to fetch" (Chrome/Edge), "NetworkError when attempting to fetch
// resource." (Firefox), "Load failed" (Safari) - which is replaced here.
async function request(url, options) {
  try {
    return await fetch(url, options);
  } catch {
    throw new FriendlyError(NETWORK_MESSAGE);
  }
}

// A 200 that isn't the expected body - e.g. a host serving its HTML page for an /api path when
// VITE_API_BASE points at the wrong place - would otherwise surface as "Unexpected token '<'".
async function readBody(response, read) {
  try {
    return await read(response);
  } catch {
    throw new FriendlyError('Angalia sent back something unexpected - please try again.');
  }
}

async function readErrorMessage(response, fallback) {
  try {
    const body = await response.json();
    return body?.error || fallback;
  } catch {
    return fallback;
  }
}

export async function detectFood(base64, token) {
  const response = await request(`${API_BASE}/api/detect-food`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ base64 }),
  });

  if (!response.ok) {
    throw new FriendlyError(await readErrorMessage(response, 'Something went wrong analyzing your photo.'));
  }

  return readBody(response, (r) => r.json()); // { tag, tagToken }
}

export async function detectFoodFromText(text, token) {
  const response = await request(`${API_BASE}/api/detect-food-text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new FriendlyError(await readErrorMessage(response, 'Something went wrong understanding your description.'));
  }

  return readBody(response, (r) => r.json()); // { tag, tagToken }
}

// samples: 16kHz mono Float32Array (see lib/audio.js). The server detects the spoken language.
export async function transcribeAudio(samples, token) {
  const response = await request(`${API_BASE}/api/transcribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      Authorization: `Bearer ${token}`,
    },
    body: samples,
  });

  if (!response.ok) {
    throw new FriendlyError(await readErrorMessage(response, "Couldn't transcribe that recording - try again, or type instead."));
  }

  return readBody(response, (r) => r.json()); // { text, language }
}

// Fetches the nutrition-facts image as a blob (rather than pointing an <img> straight at
// the API URL) because /api/nutrition-image requires an Authorization header, and browsers
// can't attach custom headers to a plain <img src>. Also surfaces the shared-key usage
// counters from response headers so the caller can update its indicator without a second
// round trip.
// tagToken: the signature a detect route returned with this tag - the server won't look up anything else.
export async function fetchNutritionImage(tag, tagToken, token) {
  const query = new URLSearchParams({ tag, tagToken });
  const response = await request(`${API_BASE}/api/nutrition-image?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const used = response.headers.get('X-Wolfram-Usage-Used');
  const limit = response.headers.get('X-Wolfram-Usage-Limit');
  const usage = used !== null ? { used: Number(used), limit: Number(limit) } : null;

  if (!response.ok) {
    const error = new FriendlyError(await readErrorMessage(response, "Could not find nutrition facts for this food."));
    error.status = response.status;
    error.usage = usage;
    throw error;
  }

  const blob = await readBody(response, (r) => r.blob());
  return { blobUrl: URL.createObjectURL(blob), usage };
}

export async function getWolframUsage(token) {
  const response = await request(`${API_BASE}/api/wolfram-usage`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new FriendlyError(await readErrorMessage(response, 'Could not fetch your Angalia usage.'));
  }
  return readBody(response, (r) => r.json()); // { hasOwnKey, used, limit, remaining }
}

export async function saveWolframKey(appId, token) {
  const response = await request(`${API_BASE}/api/wolfram-key`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ appId }),
  });
  if (!response.ok) {
    throw new FriendlyError(await readErrorMessage(response, "Could not save your Wolfram Alpha App ID."));
  }
  return readBody(response, (r) => r.json());
}

export async function deleteWolframKey(token) {
  const response = await request(`${API_BASE}/api/wolfram-key`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new FriendlyError(await readErrorMessage(response, "Could not remove your Wolfram Alpha App ID."));
  }
  return readBody(response, (r) => r.json());
}
