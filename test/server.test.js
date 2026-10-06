// API server tests. Run with `npm test` (Node's built-in test runner - no extra dependencies).
//
// These env vars are set before server.js is required, and dotenv never overrides variables that
// already exist - so the real keys in .env are never used here, and no request leaves the machine:
// Supabase is replaced with fakes, and every outside service (models, Wolfram) goes through
// `outside` below.
process.env.FOOD_DETECTOR = 'grubwatch';
process.env.PURDUE_GENAI_API_KEY = '';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.WOLFRAM_APP_ID = 'test-shared-app-id';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { app, cleanFoodTag, supabaseAdmin, signTag, MAX_TAG_WORDS } = require('../server');

// ---- Shared harness: one test server, fake Supabase, fake outside services ----

const realFetch = globalThis.fetch;
const realSupabase = { getUser: supabaseAdmin.auth.getUser, from: supabaseAdmin.from, rpc: supabaseAdmin.rpc };
let server;
let baseUrl;

// How outside services (models, Wolfram) answer in the current test: (url, options) => Response.
// Reset before each test to "unreachable", so a test only reaches a service it set up itself.
let outside;
let outsideCalls; // every outside request: { url, body }
let rpcCalls; // names of Supabase functions called, in order

const unreachable = async () => {
  throw new TypeError('fetch failed');
};
const modelReplies = (content) => async () =>
  Response.json({ choices: [{ message: { content } }] });
const wolframReplies = (kind) => async () => {
  if (kind === 'not-understood') return new Response('Wolfram|Alpha did not understand your input', { status: 501 });
  return new Response(new Uint8Array([71, 73, 70]), { status: 200, headers: { 'Content-Type': 'image/gif' } });
};

// Supabase fakes, reset before each test. The bearer token stands in for the user: token "alice" is
// user "user-alice". No personal Wolfram key, and free lookups are allowed.
function fakeSupabase({ personalKey = null } = {}) {
  supabaseAdmin.auth.getUser = async (token) => ({ data: { user: { id: `user-${token}` } }, error: null });
  supabaseAdmin.from = () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: personalKey && { wolfram_app_id: personalKey }, error: null }) }) }),
  });
  supabaseAdmin.rpc = async (name) => {
    rpcCalls.push(name);
    if (name === 'increment_wolfram_usage') return { data: [{ new_count: 1, allowed: true }], error: null };
    return { data: null, error: null };
  };
}

before(async () => {
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith(baseUrl)) return realFetch(url, options);
    let body = options?.body;
    try {
      body = JSON.parse(body);
    } catch {
      // not JSON - keep as is
    }
    outsideCalls.push({ url: String(url), body });
    return outside(String(url), options);
  };
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(() => {
  globalThis.fetch = realFetch;
  Object.assign(supabaseAdmin, { from: realSupabase.from, rpc: realSupabase.rpc });
  supabaseAdmin.auth.getUser = realSupabase.getUser;
  server.close();
});

beforeEach(() => {
  outside = unreachable;
  outsideCalls = [];
  rpcCalls = [];
  fakeSupabase();
});

// Request helpers. `user` is the bearer token; null sends no Authorization header.
function call(path, { method = 'GET', body, contentType, user = 'alice' } = {}) {
  const headers = {};
  if (contentType) headers['Content-Type'] = contentType;
  if (user) headers.Authorization = `Bearer ${user}`;
  return fetch(`${baseUrl}${path}`, { method, headers, body });
}
const postJson = (path, data, options) =>
  call(path, { method: 'POST', body: JSON.stringify(data), contentType: 'application/json', ...options });
const describeFood = (text, options) => postJson('/api/detect-food-text', { text }, options);
const sendAudio = (body, options) =>
  call('/api/transcribe', { method: 'POST', body, contentType: 'application/octet-stream', ...options });
const lookUp = (query, options) => call(`/api/nutrition-image?${new URLSearchParams(query)}`, options);
const lookUpSigned = (tag, user = 'alice') => lookUp({ tag, tagToken: signTag(`user-${user}`, tag) }, { user });

const wolframQueries = () =>
  outsideCalls.filter((c) => c.url.includes('wolframalpha.com')).map((c) => new URL(c.url).searchParams.get('i'));

// ---- Tests ----

describe('cleanFoodTag', () => {
  test('turns comma lists into "and" lists, since Wolfram 501s on comma-separated amounts', () => {
    assert.equal(
      cleanFoodTag('2 fried eggs, 1 tortilla, salsa, and black beans'),
      '2 fried eggs and 1 tortilla and salsa and black beans',
    );
  });

  test('strips quotes, a leading article and trailing punctuation from a model reply', () => {
    assert.equal(cleanFoodTag('"A cheeseburger."\nIt looks tasty!'), 'cheeseburger');
  });

  test('caps length without leaving a dangling connector', () => {
    const items = Array.from({ length: 10 }, (_, i) => `${i + 1} cups item${i}`);
    const tag = cleanFoodTag(items.join(' and '));

    assert.ok(tag.split(' ').length <= MAX_TAG_WORDS);
    assert.doesNotMatch(tag, /\s(and|of|with)$/);
  });
});

describe('POST /api/detect-food-text', () => {
  test('sends the description to the model and returns a cleaned, signed, Wolfram-ready tag', async () => {
    outside = modelReplies('2 eggs, 2 slices toast and 1 tbsp butter.');

    const response = await describeFood('had two eggs and some buttered toast');

    assert.equal(response.status, 200);
    const tag = '2 eggs and 2 slices toast and 1 tbsp butter';
    assert.deepEqual(await response.json(), { tag, tagToken: signTag('user-alice', tag) });
    assert.equal(outsideCalls.length, 1);
    assert.match(outsideCalls[0].url, /generativelanguage\.googleapis\.com/);
    assert.match(outsideCalls[0].body.messages[0].content[0].text, /had two eggs and some buttered toast/);
  });

  test('rejects empty and over-long descriptions without calling the model', async () => {
    assert.equal((await describeFood('   ')).status, 400);
    assert.equal((await describeFood('x'.repeat(301))).status, 400);
    assert.equal(outsideCalls.length, 0);
  });

  test('returns 502 when every model fails', async () => {
    outside = async () => Response.json({ error: { code: 503 } }, { status: 503 });
    assert.equal((await describeFood('a cheeseburger')).status, 502);
  });

  test('requires a session token', async () => {
    assert.equal((await describeFood('a cheeseburger', { user: null })).status, 401);
  });
});

// Only the checks that run before Whisper is loaded - the model itself is too big to load in a
// unit test.
describe('POST /api/transcribe', () => {
  test('rejects empty audio and audio that is not whole Float32 samples', async () => {
    assert.equal((await sendAudio(new Uint8Array(0))).status, 400);
    assert.equal((await sendAudio(new Uint8Array(5))).status, 400);
  });

  test('rejects recordings longer than the 20 second limit', async () => {
    const response = await sendAudio(new Float32Array(16000 * 21));

    assert.equal(response.status, 413);
    assert.match((await response.json()).error, /20 seconds/);
  });

  test('requires a session token', async () => {
    assert.equal((await sendAudio(new Float32Array(16000), { user: null })).status, 401);
  });
});

// Wolfram's Simple API answers anything, so non-food must never get a lookup.
describe('food and drink only', () => {
  for (const reply of ['not food', 'Not food.', '"NOT FOOD"', 'This is not food.']) {
    test(`a model reply of ${JSON.stringify(reply)} is refused with 422 and no tag`, async () => {
      outside = modelReplies(reply);

      const response = await describeFood('hydrogen peroxide');
      const body = await response.json();

      assert.equal(response.status, 422);
      assert.equal(body.notFood, true);
      assert.equal(body.tag, undefined);
      assert.equal(body.tagToken, undefined);
    });
  }

  test('the nutrition lookup refuses text that a detect route did not sign', async () => {
    const unsigned = await lookUp({ tag: 'hydrogen peroxide' });
    const forged = await lookUp({ tag: 'hydrogen peroxide', tagToken: signTag('user-alice', '2 eggs') });

    assert.equal(unsigned.status, 403);
    assert.equal(forged.status, 403);
    assert.deepEqual(wolframQueries(), []);
  });

  test("one user's signature does not work for another user", async () => {
    const response = await lookUp({ tag: '2 eggs', tagToken: signTag('user-alice', '2 eggs') }, { user: 'bob' });

    assert.equal(response.status, 403);
    assert.deepEqual(wolframQueries(), []);
  });

  test('a correctly signed tag is looked up', async () => {
    outside = wolframReplies('ok');
    const response = await lookUpSigned('2 eggs');

    assert.equal(response.status, 200);
    assert.deepEqual(wolframQueries(), ['2 eggs']);
  });

  test('when Wolfram does not understand an approved tag, it is not retried as a shorter query', async () => {
    // "chloroquine tablet" used to be retried as just "tablet", which Wolfram answered (about
    // tablet computers) - looking up text the model never approved.
    outside = wolframReplies('not-understood');

    const response = await lookUpSigned('chloroquine tablet');

    assert.equal(response.status, 422);
    assert.match((await response.json()).error, /doesn't appear to be a food or drink/);
    assert.deepEqual(wolframQueries(), ['chloroquine tablet']);
  });
});

// Free lookups on the shared key are counted before Wolfram is called, so every way the lookup can
// fail must give the lookup back - including Wolfram being unreachable, which used to skip it.
describe('free-lookup refunds', () => {
  test('a successful lookup is counted and not refunded', async () => {
    outside = wolframReplies('ok');

    assert.equal((await lookUpSigned('2 eggs')).status, 200);
    assert.deepEqual(rpcCalls, ['increment_wolfram_usage']);
  });

  test('a lookup Wolfram does not understand is refunded once', async () => {
    outside = wolframReplies('not-understood');

    assert.equal((await lookUpSigned('2 eggs')).status, 422);
    assert.deepEqual(rpcCalls, ['increment_wolfram_usage', 'decrement_wolfram_usage']);
  });

  test('a lookup where Wolfram cannot be reached is refunded once', async () => {
    assert.equal((await lookUpSigned('2 eggs')).status, 502);
    assert.deepEqual(rpcCalls, ['increment_wolfram_usage', 'decrement_wolfram_usage']);
  });

  test('a failed refund still returns the original error to the user', async () => {
    supabaseAdmin.rpc = async (name) =>
      name === 'increment_wolfram_usage'
        ? { data: [{ new_count: 1, allowed: true }], error: null }
        : { data: null, error: new Error('database unavailable') };

    const response = await lookUpSigned('2 eggs');

    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /Failed to reach/);
  });

  test("a user's own key is never counted or refunded", async () => {
    fakeSupabase({ personalKey: 'personal-app-id' });

    assert.equal((await lookUpSigned('2 eggs')).status, 502);
    assert.deepEqual(rpcCalls, []);
  });
});

// Every error a user (or anyone calling the API) can trigger must come back as JSON with a
// plain-language message - never Express's default HTML page, a stack trace, an exception name,
// or details of an outside service. frontend/src/test/rawErrors.js applies the same rule in the app.
describe('user-facing error messages', () => {
  // What a raw technical message looks like. A friendly message contains none of these.
  const RAW_PATTERNS = [
    /<\/?[a-z][^>]*>/i, // HTML
    /\bat \S+ \(|\bat \S+:\d+:\d+|\.js:\d+/, // stack trace lines
    /\b(Type|Syntax|Range|Reference)Error\b|\bError:/, // exception names
    /ECONN\w+|ETIMEDOUT|ENOTFOUND|Failed to fetch|fetch failed/i, // network internals
    /Unexpected token|JSON\.parse|in JSON at position/i, // parser internals
    /\[object Object\]|\bundefined\b|\bnull\b/,
    /https?:\/\//, // outside URLs
    /generativelanguage|googleapis|rcac\.purdue|supabase|postgres|wolframalpha\.com/i, // outside services
    /test-gemini-key|test-service-role-key|test-shared-app-id/, // secrets
  ];

  async function assertFriendlyError(response, expectedStatus) {
    const text = await response.text();
    if (expectedStatus) assert.equal(response.status, expectedStatus, `body: ${text.slice(0, 200)}`);
    assert.match(response.headers.get('content-type') || '', /application\/json/, `not JSON: ${text.slice(0, 200)}`);

    const body = JSON.parse(text);
    assert.equal(typeof body.error, 'string', `no error message: ${text}`);
    assert.ok(body.error.length > 10, `message too terse to help: ${JSON.stringify(body.error)}`);
    for (const pattern of RAW_PATTERNS) {
      assert.doesNotMatch(body.error, pattern, `raw detail in user-facing message: ${JSON.stringify(body.error)}`);
    }
    assert.doesNotMatch(text, /\bat \S+:\d+:\d+/, 'stack trace somewhere in the response');
  }

  describe('malformed requests', () => {
    test('broken JSON', async () => {
      const response = await call('/api/detect-food-text', {
        method: 'POST',
        body: '{"text": "eggs',
        contentType: 'application/json',
      });
      await assertFriendlyError(response, 400);
    });

    test('a photo over the size limit', async () => {
      await assertFriendlyError(await postJson('/api/detect-food', { base64: 'a'.repeat(11 * 1024 * 1024) }), 413);
    });

    test('a voice clip over the length limit', async () => {
      await assertFriendlyError(await sendAudio(new Float32Array(16000 * 21)), 413);
    });

    test('a description sent as plain text instead of JSON', async () => {
      const response = await call('/api/detect-food-text', { method: 'POST', body: 'eggs', contentType: 'text/plain' });
      await assertFriendlyError(response, 400);
    });

    test('an unknown API route', async () => {
      await assertFriendlyError(await call('/api/does-not-exist'), 404);
    });
  });

  describe('sign-in checks', () => {
    test('no session token', async () => {
      await assertFriendlyError(await call('/api/wolfram-usage', { user: null }), 401);
    });

    test('Supabase unreachable while checking the session', async () => {
      supabaseAdmin.auth.getUser = async () => {
        throw new TypeError('fetch failed: connect ECONNREFUSED 127.0.0.1:54321');
      };
      const response = await call('/api/wolfram-usage');
      await assertFriendlyError(response);
      assert.ok(response.status >= 500);
    });
  });

  describe('outside services failing', () => {
    test('every model failing, with technical details in their replies', async () => {
      outside = async () =>
        new Response('<html><body>502 Bad Gateway at https://generativelanguage.googleapis.com</body></html>', {
          status: 502,
        });
      await assertFriendlyError(await describeFood('two eggs'), 502);
    });

    test('a model that is unreachable', async () => {
      await assertFriendlyError(await postJson('/api/detect-food', { base64: 'aGVsbG8=' }), 502);
    });

    test('Supabase failing while counting a free lookup', async () => {
      supabaseAdmin.rpc = async () => ({ data: null, error: { message: 'permission denied for function increment_wolfram_usage' } });
      await assertFriendlyError(await lookUpSigned('2 eggs'), 500);
    });

    test('Supabase failing while saving a personal Wolfram key', async () => {
      // The key's test query to Wolfram succeeds, so the failure is in saving it.
      outside = async () => Response.json({ queryresult: { success: true } });
      supabaseAdmin.from = () => ({ upsert: async () => ({ error: { message: 'duplicate key value violates unique constraint' } }) });
      await assertFriendlyError(await postJson('/api/wolfram-key', { appId: 'ABC-123' }), 500);
    });
  });
});
