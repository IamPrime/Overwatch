require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const {
  FOOD_DETECTOR,
  PURDUE_GENAI_API_KEY,
  PURDUE_GENAI_MODEL,
  PURDUE_GENAI_FALLBACK_MODEL,
  LOCAL_MODEL_ID,
  WOLFRAM_APP_ID,
  NETLIFY_ORIGIN,
  PORT,
} = process.env;

const useLocalModel = FOOD_DETECTOR === 'local';
const primaryModel = PURDUE_GENAI_MODEL || 'llama4:latest';
const fallbackModel = PURDUE_GENAI_FALLBACK_MODEL || 'gemma4:26b-a4b';
const localModelId = LOCAL_MODEL_ID || 'onnx-community/swin-finetuned-food101-ONNX';

const app = express();
// Lets the static front end, when hosted on Netlify (a different origin than this API server),
// call these routes directly instead of through Netlify's redirect proxy (which times out ~27s -
// too short for cold starts on Render's free tier plus the vision-model/Wolfram calls below).
app.use(cors({ origin: NETLIFY_ORIGIN || 'https://grubwatch.netlify.app' }));
app.use(express.json({ limit: '10mb' }));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/overwatch.css', (req, res) => res.sendFile(path.join(__dirname, 'overwatch.css')));
app.get('/overwatch.js', (req, res) => res.sendFile(path.join(__dirname, 'overwatch.js')));
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

// Asks one Purdue GenAI Studio vision model what food is in the photo.
async function askPurdueGenAI(model, base64) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch('https://genai.rcac.purdue.edu/api/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PURDUE_GENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: "Identify the food in this image. Respond with only its common, generic name (e.g. \"pizza\", \"cheeseburger\", \"caesar salad\") in 1-3 words, lowercase, no adjectives, no punctuation, nothing else." },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content;

    if (!response.ok || !content) {
      throw new Error(`Purdue GenAI Studio (${model}) error: ${JSON.stringify(result)}`);
    }

    return cleanFoodTag(content);
  } finally {
    clearTimeout(timeout);
  }
}

// Tries the primary vision model, falls back to a second model if the first fails.
async function detectFoodViaPurdueGenAI(base64) {
  if (!PURDUE_GENAI_API_KEY) {
    throw new Error('PURDUE_GENAI_API_KEY is not configured on the server.');
  }

  try {
    return await askPurdueGenAI(primaryModel, base64);
  } catch (err) {
    console.error(`Primary model (${primaryModel}) failed, trying fallback (${fallbackModel}):`, err.message);
    return await askPurdueGenAI(fallbackModel, base64);
  }
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

async function detectFoodViaLocalModel(base64) {
  const classifier = await getLocalClassifier();
  const image = new Blob([Buffer.from(base64, 'base64')], { type: 'image/jpeg' });
  const results = await classifier(image);
  const topLabel = results?.[0]?.label;

  if (!topLabel) {
    throw new Error('Local model returned no classification.');
  }

  return topLabel.replace(/_/g, ' ');
}

app.post('/api/detect-food', async (req, res) => {
  const { base64 } = req.body;
  if (!base64) {
    return res.status(400).json({ error: 'Missing "base64" image data.' });
  }

  try {
    const tag = useLocalModel
      ? await detectFoodViaLocalModel(base64)
      : await detectFoodViaPurdueGenAI(base64);

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
async function fetchWolframImage(query) {
  const wolframUrl =
    'https://api.wolframalpha.com/v1/simple?' +
    new URLSearchParams({
      appid: WOLFRAM_APP_ID,
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
app.get('/api/nutrition-image', async (req, res) => {
  const { tag } = req.query;
  if (!tag) {
    return res.status(400).json({ error: 'Missing "tag" query parameter.' });
  }
  if (!WOLFRAM_APP_ID) {
    return res.status(500).json({ error: 'Wolfram Alpha credentials are not configured on the server.' });
  }

  try {
    let result = await fetchWolframImage(tag);

    const words = tag.trim().split(/\s+/);
    const simplifiedTag = words[words.length - 1];
    if (!result.image && words.length > 1) {
      const fallbackResult = await fetchWolframImage(simplifiedTag);
      result = { image: fallbackResult.image, isTimeout: result.isTimeout || fallbackResult.isTimeout };
    }

    if (!result.image) {
      if (result.isTimeout) {
        return res.status(504).json({ error: 'Wolfram Alpha is taking too long to respond right now - please try again.' });
      }
      return res.status(502).json({ error: `Wolfram Alpha couldn't find nutrition facts for "${tag}".` });
    }

    res.set('Content-Type', result.image.contentType);
    res.send(result.image.buffer);
  } catch (err) {
    console.error('Wolfram Alpha request failed:', err);
    res.status(502).json({ error: 'Failed to reach Wolfram Alpha.' });
  }
});

const port = PORT || 3000;
app.listen(port, () => {
  console.log(`Overwatch server running at http://localhost:${port}`);
  console.log(`Food detector: ${useLocalModel ? `local (${localModelId})` : `Purdue GenAI Studio (${primaryModel}, fallback ${fallbackModel})`}`);
});
