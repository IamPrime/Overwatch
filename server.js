require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const {
  FOOD_DETECTOR,
  PURDUE_GENAI_API_KEY,
  PURDUE_GENAI_MODEL,
  PURDUE_GENAI_FALLBACK_MODEL,
  GEMINI_API_KEY,
  GEMINI_MODEL,
  LOCAL_MODEL_ID,
  WOLFRAM_APP_ID,
  WOLFRAM_DAILY_FREE_LOOKUPS,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  NETLIFY_ORIGIN,
  PORT,
} = process.env;

const DAILY_FREE_LOOKUPS = Number(WOLFRAM_DAILY_FREE_LOOKUPS) || 5;

// Service-role client: bypasses RLS, so it must only ever live server-side. Used to
// verify user JWTs from the front end and to read/write the per-user Wolfram tables.
const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

// Verifies the "Authorization: Bearer <supabase-jwt>" header the front end sends on
// every API call (both real logins and anonymous device sessions produce one), and
// attaches the resolved user to req.user. Every route below needs a caller identity -
// either to look up their BYOK Wolfram key/usage, or (for detect-food) simply so an
// anonymous script can't hit the shared Purdue/Gemini keys without ever going through
// the app's own sign-up/anonymous-session flow.
async function requireAuth(req, res, next) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase credentials are not configured on the server.' });
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization header.' });
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }

  req.user = data.user;
  next();
}

// "grubwatch" (default) chains Purdue GenAI Studio -> Gemini's free tier as cloud vision models;
// "local" runs the Food-101 classifier + translator on this machine instead - see README.
const useLocalModel = FOOD_DETECTOR === 'local';
const primaryModel = PURDUE_GENAI_MODEL || 'llama4:latest';
const fallbackModel = PURDUE_GENAI_FALLBACK_MODEL || 'gemma4:26b-a4b';
const geminiModel = GEMINI_MODEL || 'gemini-flash-latest';
const localModelId = LOCAL_MODEL_ID || 'onnx-community/swin-finetuned-food101-ONNX';

const app = express();
// Lets the static front end, when hosted on Netlify (a different origin than this API server),
// call these routes directly instead of through Netlify's redirect proxy (which times out ~27s -
// too short for cold starts on Render's free tier plus the vision-model/Wolfram calls below).
app.use(cors({ origin: NETLIFY_ORIGIN || 'https://grubwatch.netlify.app' }));
app.use(express.json({ limit: '10mb' }));

// Serves the built Vite frontend (frontend/dist) so visiting the Render URL directly still
// works, not just the Netlify deployment - see README's "Deployment" section. Static routes
// for the old hand-written index.html/overwatch.css/overwatch.js are gone now that the
// frontend is a Vite build; run `npm run build` in frontend/ before starting this server.
app.use(express.static(path.join(__dirname, 'frontend', 'dist')));
// Sample food photos, unrelated to the built frontend's own overwatch-images/ (PWA icons) -
// falls through here only when the static frontend above doesn't have a matching file.
app.use('/overwatch-images', express.static(path.join(__dirname, 'overwatch-images')));

function cleanFoodTag(text) {
  return text
    .split('\n')[0]
    .replace(/[*_`"']/g, '')
    .replace(/^(a|an|the)\s+/i, '')
    .replace(/[.,!?]+$/, '')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join(' ');
}

// Shared naming rule for every path that produces a food tag (vision ID or translating a raw
// classifier label) - Wolfram Alpha's Simple API is English-only, so any non-English dish name
// (e.g. from a foreign-language vision reply, or a Food-101 label like "huevos_rancheros") needs
// this same rule applied before it reaches Wolfram.
const FOOD_NAME_RULES =
  'Respond with only its common, generic name in English (e.g. "pizza", "cheeseburger", "caesar salad") ' +
  'in 1-3 words, lowercase, no adjectives, no punctuation, nothing else. Translate non-English dish names ' +
  'to their common English name (e.g. "huevos rancheros" -> "fried eggs") rather than transliterating them.';

const PURDUE_CHAT_URL = 'https://genai.rcac.purdue.edu/api/chat/completions';
// Google's OpenAI-compatibility endpoint - takes the same request/response shape (including
// image_url with a base64 data URI) as Purdue GenAI Studio's API, so it can reuse askVisionModel
// as-is. See https://ai.google.dev/gemini-api/docs/openai
const GEMINI_CHAT_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

// Sends one chat-completion request (content built by the caller) to one OpenAI-compatible
// vision endpoint (Purdue GenAI Studio or Gemini's OpenAI-compatibility layer).
async function askVisionModel(baseUrl, apiKey, model, content) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [{ role: 'user', content }],
      }),
      signal: controller.signal,
    });

    const result = await response.json();
    const replyText = result?.choices?.[0]?.message?.content;

    if (!response.ok || !replyText) {
      throw new Error(`${baseUrl} (${model}) error: ${JSON.stringify(result)}`);
    }

    return cleanFoodTag(replyText);
  } finally {
    clearTimeout(timeout);
  }
}

// Tries each configured vision model in order (Purdue primary -> Purdue fallback -> Gemini free
// tier), moving to the next on failure. Gemini is a last resort here specifically because Purdue
// GenAI Studio has been observed hanging/erroring in production (see README Troubleshooting) -
// Gemini's free tier gives a working cloud fallback without the RAM/disk cost the `local` detector
// has on Render's free tier.
async function detectFoodViaVisionModel(base64) {
  const content = [
    { type: 'text', text: `Identify the food in this image. ${FOOD_NAME_RULES}` },
    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
  ];

  const attempts = [];
  if (PURDUE_GENAI_API_KEY) {
    attempts.push(
      ['Purdue primary', () => askVisionModel(PURDUE_CHAT_URL, PURDUE_GENAI_API_KEY, primaryModel, content)],
      ['Purdue fallback', () => askVisionModel(PURDUE_CHAT_URL, PURDUE_GENAI_API_KEY, fallbackModel, content)],
    );
  }
  if (GEMINI_API_KEY) {
    attempts.push(['Gemini', () => askVisionModel(GEMINI_CHAT_URL, GEMINI_API_KEY, geminiModel, content)]);
  }

  if (!attempts.length) {
    throw new Error('Neither PURDUE_GENAI_API_KEY nor GEMINI_API_KEY is configured on the server.');
  }

  let lastError;
  for (const [label, attempt] of attempts) {
    try {
      return await attempt();
    } catch (err) {
      console.error(`${label} model failed:`, err.message);
      lastError = err;
    }
  }
  throw lastError;
}

// Self-hosted fallback: runs a Food-101 classifier locally, no external API calls.
let classifierPromise;
function getLocalClassifier() {
  if (!classifierPromise) {
    const { pipeline } = require('@huggingface/transformers');
    classifierPromise = pipeline('image-classification', localModelId);
  }
  return classifierPromise;
}

// Small local instruct model used only to clean up/translate the local classifier's raw label
// (see translateFoodNameToEnglish below). Kept separate from the local classifier itself so the
// `local` detector path never calls out to Purdue GenAI Studio for anything, image ID or
// translation - the whole point of `local` is to keep working when Purdue is down.
let translatorPromise;
function getLocalTranslator() {
  if (!translatorPromise) {
    const { pipeline } = require('@huggingface/transformers');
    translatorPromise = pipeline('text-generation', 'onnx-community/Qwen2.5-1.5B-Instruct', { dtype: 'q4' });
  }
  return translatorPromise;
}

// Food-101's labels are a fixed set of English-annotated but not always English-*named* dishes
// (e.g. "huevos_rancheros", "croque_madame") - Wolfram Alpha doesn't recognize those, so run the
// raw label through the same translate-to-English rule used for the vision path above, via the
// small local instruct model rather than Purdue GenAI Studio.
async function translateFoodNameToEnglish(rawName) {
  const generator = await getLocalTranslator();
  const messages = [{ role: 'user', content: `The food is called "${rawName}". ${FOOD_NAME_RULES}` }];
  const output = await generator(messages, { max_new_tokens: 20, do_sample: false });
  const reply = output[0]?.generated_text;
  const replyText = Array.isArray(reply) ? reply[reply.length - 1]?.content : reply;

  return replyText ? cleanFoodTag(replyText) : rawName;
}

async function detectFoodViaLocalModel(base64) {
  const classifier = await getLocalClassifier();
  const image = new Blob([Buffer.from(base64, 'base64')], { type: 'image/jpeg' });
  const results = await classifier(image);
  const topLabel = results?.[0]?.label;

  if (!topLabel) {
    throw new Error('Local model returned no classification.');
  }

  return translateFoodNameToEnglish(topLabel.replace(/_/g, ' '));
}

app.post('/api/detect-food', requireAuth, async (req, res) => {
  const { base64 } = req.body;
  if (!base64) {
    return res.status(400).json({ error: 'Missing "base64" image data.' });
  }

  try {
    const tag = useLocalModel
      ? await detectFoodViaLocalModel(base64)
      : await detectFoodViaVisionModel(base64);

    res.json({ tag });
  } catch (err) {
    console.error('Food detection failed:', err);
    res.status(502).json({ error: 'Could not identify the food in this image.' });
  }
});

// Tries one query string against Wolfram Alpha's Simple API.
// Returns { image } on success, or { image: null, isTimeout } on failure - isTimeout distinguishes
// "Wolfram Alpha ran out of time to compute this" (transient, worth retrying) from a clean
// "didn't understand this input" response (permanent for that query).
// Takes the App ID as a parameter (rather than reading WOLFRAM_APP_ID directly) because the
// caller resolves per-request whether to use the shared capped key or the user's own BYOK key.
async function fetchWolframImage(query, appId) {
  const wolframUrl =
    'https://api.wolframalpha.com/v1/simple?' +
    new URLSearchParams({
      appid: appId,
      i: query,
      background: 'F6F6F6',
      foreground: 'black',
      layout: 'labelbar',
      units: 'imperial',
      width: '800',
      fontsize: '18',
      timeout: '30',
    });

  const wolframResponse = await fetch(wolframUrl);

  if (!wolframResponse.ok) {
    const message = await wolframResponse.text();
    console.error(`Wolfram Alpha error for "${query}":`, wolframResponse.status, message);
    return { image: null, isTimeout: /could not give a response in time/i.test(message) };
  }

  return {
    image: {
      contentType: wolframResponse.headers.get('content-type') || 'image/gif',
      buffer: Buffer.from(await wolframResponse.arrayBuffer()),
    },
    isTimeout: false,
  };
}

// Given a food tag, fetches a nutrition-facts pod image from Wolfram Alpha.
// Queries the bare food name (Wolfram Alpha surfaces nutrition info by default for a plain food
// query) rather than appending "nutrition facts", since that phrasing trips up its parser on some
// dish names (e.g. "sandwich nutrition facts" 501s, but "sandwich" alone works fine).
// Falls back to just the last word of the tag (usually the core noun, e.g. "margherita pizza" -> "pizza")
// in case the full multi-word tag itself isn't recognized as an entity.
//
// Every caller gets DAILY_FREE_LOOKUPS lookups/day against the shared WOLFRAM_APP_ID. A user who
// has saved their own Wolfram App ID (see /api/wolfram-key below) uses that key instead, uncapped,
// and never touches the shared daily counter at all.
app.get('/api/nutrition-image', requireAuth, async (req, res) => {
  const { tag } = req.query;
  if (!tag) {
    return res.status(400).json({ error: 'Missing "tag" query parameter.' });
  }

  const userId = req.user.id;
  let appId;
  let usageInfo = null;

  try {
    const { data: byok, error: byokError } = await supabaseAdmin
      .from('user_wolfram_keys')
      .select('wolfram_app_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (byokError) throw byokError;

    if (byok?.wolfram_app_id) {
      appId = byok.wolfram_app_id;
    } else {
      if (!WOLFRAM_APP_ID) {
        return res.status(500).json({ error: 'Wolfram Alpha credentials are not configured on the server.' });
      }

      // Charge-on-attempt (before calling Wolfram) so the cap can't be raced around the
      // external call itself; a best-effort refund happens below if Wolfram hard-fails.
      const { data: rows, error: rpcError } = await supabaseAdmin.rpc('increment_wolfram_usage', {
        p_user_id: userId,
        p_daily_limit: DAILY_FREE_LOOKUPS,
      });
      if (rpcError) throw rpcError;

      const { new_count: newCount, allowed } = rows[0];
      if (!allowed) {
        return res.status(429).json({
          error: `You've used all ${DAILY_FREE_LOOKUPS} free nutrition lookups for today. Add your own free Wolfram Alpha App ID in Settings to keep going.`,
          used: newCount,
          limit: DAILY_FREE_LOOKUPS,
        });
      }

      appId = WOLFRAM_APP_ID;
      usageInfo = { used: newCount, limit: DAILY_FREE_LOOKUPS };
    }
  } catch (err) {
    console.error('Failed to resolve Wolfram App ID / usage:', err);
    return res.status(500).json({ error: 'Could not verify your Wolfram Alpha usage right now.' });
  }

  try {
    let result = await fetchWolframImage(tag, appId);

    const words = tag.trim().split(/\s+/);
    const simplifiedTag = words[words.length - 1];
    if (!result.image && words.length > 1) {
      const fallbackResult = await fetchWolframImage(simplifiedTag, appId);
      result = { image: fallbackResult.image, isTimeout: result.isTimeout || fallbackResult.isTimeout };
    }

    if (!result.image) {
      if (usageInfo) {
        // Best-effort refund: both attempts hard-failed, so this charged lookup never
        // actually got the user a nutrition image.
        await supabaseAdmin.rpc('decrement_wolfram_usage', { p_user_id: userId });
      }
      if (result.isTimeout) {
        return res.status(504).json({ error: 'Wolfram Alpha is taking too long to respond right now - please try again.' });
      }
      return res.status(502).json({ error: `Wolfram Alpha couldn't find nutrition facts for "${tag}".` });
    }

    if (usageInfo) {
      res.set('X-Wolfram-Usage-Used', String(usageInfo.used));
      res.set('X-Wolfram-Usage-Limit', String(usageInfo.limit));
    }
    res.set('Content-Type', result.image.contentType);
    res.send(result.image.buffer);
  } catch (err) {
    console.error('Wolfram Alpha request failed:', err);
    res.status(502).json({ error: 'Failed to reach Wolfram Alpha.' });
  }
});

// Reports whether the caller has their own Wolfram App ID saved, and (if not) how many of
// today's free shared-key lookups remain.
app.get('/api/wolfram-usage', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const today = new Date().toISOString().slice(0, 10); // UTC date, matches increment_wolfram_usage's (now() at time zone 'utc')::date

  try {
    const [{ data: byok, error: byokError }, { data: usageRow, error: usageError }] = await Promise.all([
      supabaseAdmin.from('user_wolfram_keys').select('wolfram_app_id').eq('user_id', userId).maybeSingle(),
      supabaseAdmin.from('wolfram_usage').select('lookup_count').eq('user_id', userId).eq('usage_date', today).maybeSingle(),
    ]);
    if (byokError) throw byokError;
    if (usageError) throw usageError;

    const hasOwnKey = !!byok?.wolfram_app_id;
    const used = usageRow?.lookup_count || 0;

    res.json({
      hasOwnKey,
      used: hasOwnKey ? null : used,
      limit: hasOwnKey ? null : DAILY_FREE_LOOKUPS,
      remaining: hasOwnKey ? null : Math.max(DAILY_FREE_LOOKUPS - used, 0),
    });
  } catch (err) {
    console.error('Failed to fetch Wolfram usage:', err);
    res.status(500).json({ error: 'Could not fetch your Wolfram Alpha usage right now.' });
  }
});

// Confirms a submitted App ID actually works before persisting it, via Wolfram's lightweight
// validate-query endpoint - using the Simple API here would burn part of the user's own free
// monthly quota just to test a string.
async function validateWolframAppId(appId) {
  try {
    const url = 'https://api.wolframalpha.com/v2/validatequery?' + new URLSearchParams({
      appid: appId,
      input: 'pizza',
      output: 'json',
    });
    const response = await fetch(url);
    if (!response.ok) return false;

    const data = await response.json();
    return data?.queryresult?.success === true && !data?.queryresult?.error;
  } catch (err) {
    console.error('Wolfram App ID validation failed:', err);
    return false;
  }
}

app.post('/api/wolfram-key', requireAuth, async (req, res) => {
  const appId = (req.body?.appId || '').trim();
  if (!appId) {
    return res.status(400).json({ error: 'Missing "appId".' });
  }

  if (!(await validateWolframAppId(appId))) {
    return res.status(400).json({ error: "That Wolfram Alpha App ID doesn't seem to work. Double check it and try again." });
  }

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from('user_wolfram_keys').upsert({
    user_id: req.user.id,
    wolfram_app_id: appId,
    verified_at: now,
    updated_at: now,
  });

  if (error) {
    console.error('Failed to save Wolfram App ID:', error);
    return res.status(500).json({ error: 'Could not save your Wolfram Alpha App ID.' });
  }

  res.json({ ok: true });
});

app.delete('/api/wolfram-key', requireAuth, async (req, res) => {
  const { error } = await supabaseAdmin.from('user_wolfram_keys').delete().eq('user_id', req.user.id);

  if (error) {
    console.error('Failed to remove Wolfram App ID:', error);
    return res.status(500).json({ error: 'Could not remove your Wolfram Alpha App ID.' });
  }

  res.json({ ok: true });
});

const port = PORT || 3000;
app.listen(port, () => {
  console.log(`Overwatch server running at http://localhost:${port}`);
  console.log(`Food detector: ${useLocalModel ? `local (${localModelId})` : `Purdue GenAI Studio (${primaryModel}, fallback ${fallbackModel})${GEMINI_API_KEY ? `, Gemini fallback (${geminiModel})` : ''}`}`);
});
