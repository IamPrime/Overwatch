import { afterEach, describe, expect, test, vi } from 'vitest';
import * as api from './api';
import { expectFriendly } from '../test/rawErrors';

// Every API function, called the way the app calls it.
const CALLS = {
  detectFood: () => api.detectFood('aGVsbG8=', 't'),
  detectFoodFromText: () => api.detectFoodFromText('two eggs', 't'),
  transcribeAudio: () => api.transcribeAudio(new Float32Array(16000), 't'),
  fetchNutritionImage: () => api.fetchNutritionImage('2 eggs', 'sig', 't'),
  getWolframUsage: () => api.getWolframUsage('t'),
  saveWolframKey: () => api.saveWolframKey('ABC-123', 't'),
  deleteWolframKey: () => api.deleteWolframKey('t'),
};

async function errorFrom(call) {
  try {
    await call();
  } catch (err) {
    return err;
  }
  throw new Error('expected the call to fail');
}

afterEach(() => vi.unstubAllGlobals());

describe.each(Object.entries(CALLS))('%s', (_name, call) => {
  // Each browser words its own network error differently.
  test.each(['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed'])(
    'server unreachable (%s)',
    async (browserMessage) => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError(browserMessage)));
      expectFriendly((await errorFrom(call)).message);
    },
  );

  test('an HTML error page instead of JSON (e.g. a proxy or host outage)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html><body><h1>502 Bad Gateway</h1></body></html>', { status: 502 })),
    );
    expectFriendly((await errorFrom(call)).message);
  });

  test("the server's own message is shown when it sends one", async () => {
    const serverMessage = 'That doesn’t sound like food or drink - Angalia can only look up nutrition for things you eat or drink.';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: serverMessage }, { status: 422 })));
    expect((await errorFrom(call)).message).toBe(serverMessage);
  });
});
