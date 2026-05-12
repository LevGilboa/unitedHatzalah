require('dotenv').config({ path: '../.env' }); // Load from root .env (local dev)
require('dotenv').config(); // Also load from .env in current dir (production)
const express = require('express');
const path = require('path');
const { log } = require('console');
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

// Firebase is optional — only loaded if serviceAccount.json exists
let admin = null;
let db = null;
try {
  admin = require('firebase-admin');
  const serviceAccount = require('./serviceAccount.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://united-db8c8.firebaseio.com",
  });
  db = admin.firestore();
  console.log('[Server] Firebase initialized successfully');
} catch (e) {
  console.log('[Server] Firebase not available (optional) — AI proxy will still work');
}

const app = express();

// Middleware to handle CORS manually
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // Allow any origin for dev
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Middleware to parse JSON request bodies (increased limit to 50mb for large files)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Health check endpoint (used by Render.com to verify service is alive)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Define a route for the root URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/calls', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firebase not configured' });
  try {
    const newCall = { skill: 'CPR', location: 'Jerusalem' };
    const docRef = await db.collection('calls').add(newCall);
    res.status(201).send(`User added with ID: ${docRef.id}`);
  } catch (error) {
    res.status(500).send('Error adding user: ' + error.message);
  }
});

app.post('/calls', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firebase not configured' });
  log(req.body);
  try {
    const { skill, location } = req.body;
    const newCall = { skill, location };
    const docRef = await db.collection('calls').add(newCall);
    res.status(201).send(`User added with ID: ${docRef.id}`);
  } catch (error) {
    res.status(500).send('Error adding user: ' + error.message);
  }
});

// ── Rate Limiting ────────────────────────────────────────────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 100;
const MAX_REQUEST_CHARS = 50000;

function checkRateLimit(ip) {
  const now = Date.now();
  const key = ip || 'unknown';
  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(key, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= MAX_REQUESTS_PER_WINDOW;
}

// ── AI Chat Proxy (AWS Bedrock — Amazon Nova Lite) ───────────────────────────
app.post('/api/ai-chat', async (req, res) => {
  try {
    // Rate limiting
    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({ error: 'Too many requests. Please wait.' });
    }

    const { question, systemPrompt, history = [] } = req.body;

    if (!question || !systemPrompt) {
      return res.status(400).json({ error: 'Missing required fields: question, systemPrompt' });
    }

    // Request size guard
    const totalChars = (question?.length || 0) + (systemPrompt?.length || 0) +
      history.reduce((sum, h) => sum + (h.content?.length || 0), 0);
    if (totalChars > MAX_REQUEST_CHARS) {
      return res.status(413).json({ error: `Request too large (${totalChars} chars). Max: ${MAX_REQUEST_CHARS}` });
    }

    // Build the full message array
    const messages = [
      ...history.slice(-8),   // Keep last 8 turns to limit token usage
      { role: 'user', content: question },
    ];

    console.log(`[Bedrock Proxy] Processing request: ${question.slice(0, 50)}...`);

    const bedrockApiKey = process.env.BEDROCK_API_KEY;
    const awsKeyId = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
    const awsSessionToken = process.env.AWS_SESSION_TOKEN;
    const awsRegion = process.env.AWS_REGION || "us-east-1";
    const bedrockModel = process.env.BEDROCK_MODEL || "amazon.nova-lite-v1:0";

    let answer = null;

    // ─── Method 1: Bedrock Bearer Token (OpenAI-compatible API) ──────────
    if (bedrockApiKey) {
      try {
        // Extract region from token to avoid "Credential should be scoped to a valid region"
        let tokenRegion = awsRegion;
        if (bedrockApiKey.startsWith('bedrock-api-key-')) {
          const decoded = Buffer.from(bedrockApiKey.replace('bedrock-api-key-', ''), 'base64').toString();
          const regionMatch = decoded.match(/%2F\d{8}%2F([^%]+)%2Fbedrock/);
          if (regionMatch && regionMatch[1]) {
            tokenRegion = regionMatch[1];
          }
        }

        const baseUrl = process.env.BEDROCK_BASE_URL || `https://bedrock-mantle.${tokenRegion}.api.aws/v1`;
        console.log(`[Bedrock Proxy] Using Bearer Token API at ${baseUrl} (Region: ${tokenRegion})`);

        const r = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${bedrockApiKey}`
          },
          body: JSON.stringify({
            model: bedrockModel,
            messages: [
              { role: 'system', content: systemPrompt },
              ...messages
            ],
            max_tokens: 4096,
            temperature: 0.7
          })
        });

        if (r.ok) {
          const data = await r.json();
          answer = data.choices?.[0]?.message?.content || null;
          if (answer) console.log(`[Bedrock Proxy] ✅ Bearer Token success (${answer.length} chars)`);
        } else {
          const errText = await r.text();
          console.error(`[Bedrock Proxy] Bearer Token error: ${r.status}`, errText.substring(0, 300));
        }
      } catch (e) {
        console.error('[Bedrock Proxy] Bearer Token error:', e.message);
      }
    }

    // ─── Method 2: AWS SDK (permanent IAM credentials) ───────────────────
    if (!answer && awsKeyId && awsSecretKey) {
      try {
        console.log(`[Bedrock Proxy] Using AWS SDK: ${bedrockModel} in ${awsRegion}`);

        const credentials = {
          accessKeyId: awsKeyId,
          secretAccessKey: awsSecretKey,
        };
        if (awsSessionToken) credentials.sessionToken = awsSessionToken;

        const client = new BedrockRuntimeClient({
          region: awsRegion,
          credentials
        });

        // Detect model type for correct payload format
        const isNovaModel = bedrockModel.startsWith('amazon.nova');
        const isClaudeModel = bedrockModel.startsWith('anthropic.');

        let payload;
        if (isNovaModel) {
          payload = {
            messages: messages.map(m => ({
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: [{ text: m.content }]
            })),
            system: [{ text: systemPrompt }],
            inferenceConfig: {
              max_new_tokens: 4096,
              temperature: 0.7,
              top_p: 0.9
            }
          };
        } else if (isClaudeModel) {
          payload = {
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 4096,
            system: systemPrompt,
            messages: messages.filter(m => m.role !== 'system')
          };
        } else {
          payload = {
            messages: [
              { role: 'system', content: systemPrompt },
              ...messages
            ],
            max_tokens: 4096,
            temperature: 0.7
          };
        }

        const command = new InvokeModelCommand({
          modelId: bedrockModel,
          contentType: "application/json",
          accept: "application/json",
          body: JSON.stringify(payload)
        });

        const response = await client.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));

        if (isNovaModel) {
          answer = responseBody.output?.message?.content?.[0]?.text || null;
        } else if (isClaudeModel) {
          answer = responseBody.content?.[0]?.text || null;
        } else {
          answer = responseBody.choices?.[0]?.message?.content ||
                   responseBody.content?.[0]?.text || null;
        }

        if (answer) {
          console.log(`[Bedrock Proxy] ✅ AWS SDK success (${answer.length} chars)`);
        } else {
          console.error('[Bedrock Proxy] Empty SDK response:', JSON.stringify(responseBody).substring(0, 500));
        }
      } catch (bedrockErr) {
        console.error('[Bedrock Proxy] AWS SDK error:', bedrockErr.message);
      }
    }

    // ─── Method 3: Gemini fallback ───────────────────────────────────────
    if (!answer) {
      const geminiKey = process.env.GEMINI_API_KEY || process.env.EXPO_PUBLIC_GEMINI_API_KEY;
      if (geminiKey) {
        try {
          console.log('[Bedrock Proxy] ⚠️ Falling back to Gemini...');
          const geminiContents = messages
            .filter(m => m.role !== 'system')
            .map((m, i) => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: i === 0 ? `${systemPrompt}\n\n${m.content}` : m.content }],
            }));

          const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: geminiContents,
                generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
              }),
            }
          );
          if (r.ok) {
            const data = await r.json();
            answer = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
            if (answer) console.log(`[Bedrock Proxy] ✅ Gemini fallback success (${answer.length} chars)`);
          } else {
            console.error('[Bedrock Proxy] Gemini error:', r.status, await r.text());
          }
        } catch (geminiErr) {
          console.error('[Bedrock Proxy] Gemini fallback error:', geminiErr.message);
        }
      }
    }

    if (!answer) {
      return res.status(502).json({ error: 'Empty response from all AI providers' });
    }

    res.json({ answer });
  } catch (error) {
    console.error('[Bedrock Proxy] Internal error:', error);
    res.status(500).send('Proxy error: ' + error.message);
  }
});

// Proxy for Hugging Face API (to avoid CORS on web)
app.post('/api/huggingface', async (req, res) => {
  try {
    const { model, inputs, parameters, apiKey: bodyApiKey } = req.body;

    // Get API key from env (preferred) or body
    const apiKey = process.env.EXPO_PUBLIC_HUGGINGFACE_API_KEY;

    if (!apiKey) {
      console.error('[HF Proxy] Hugging Face API key is not configured on the server.');
      return res.status(500).json({ error: 'API key not configured on server.' });
    }

    console.log(`[HF Proxy] Processing request for model: ${model}`);

    // Updated to new router domain as api-inference is deprecated
    const targetUrl = `https://router.huggingface.co/models/${model}`;

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        inputs,
        parameters
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Proxy] Upstream error: ${response.status}`, errorText);
      return res.status(502).json({
        error: `Upstream Hugging Face error: ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('[Proxy] Internal error:', error);
    res.status(500).send('Proxy error: ' + error.message);
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
