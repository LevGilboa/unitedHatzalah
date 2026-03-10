require('dotenv').config({ path: '../.env' }); // Load from root .env
const express = require('express');
const path = require('path');
const admin = require('firebase-admin');
const { log } = require('console');
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

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

// Middleware to parse JSON request bodies
app.use(express.json());

// Load the service account key
const serviceAccount = require('./serviceAccount.json');

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://united-db8c8.firebaseio.com", // Replace with your actual database URL
});

// Initialize Firestore after Firebase Admin is initialized
const db = admin.firestore();

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Define a route for the root URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/calls', async (req, res) => {
  try {
    const newCall = { skill: 'CPR', location: 'Jerusalem' };
    const docRef = await db.collection('calls').add(newCall);
    res.status(201).send(`User added with ID: ${docRef.id}`);
  } catch (error) {
    res.status(500).send('Error adding user: ' + error.message);
  }
});

app.post('/calls', async (req, res) => {
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

// Proxy for AWS Bedrock API (to avoid CORS on web)
app.post('/api/ai-chat', async (req, res) => {
  try {
    const { question, systemPrompt, history = [] } = req.body;

    if (!question || !systemPrompt) {
      return res.status(400).json({ error: 'Missing required fields: question, systemPrompt' });
    }

    // Build the full message array
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-8),   // Keep last 8 turns to limit token usage
      { role: 'user', content: question },
    ];

    console.log(`[Bedrock Proxy] Processing request: ${question.slice(0, 50)}...`);

    const awsApiKey = process.env.AWS_BEDROCK_API_KEY;
    const bedrockBaseUrl = process.env.BEDROCK_OPENAI_BASE_URL || 'https://bedrock-mantle.eu-central-1.api.aws/v1';
    const bedrockModel = process.env.BEDROCK_MODEL || 'openai.gpt-oss-120b';
    const awsKeyId = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
    const awsRegion = process.env.AWS_REGION || "eu-central-1";

    if (!awsApiKey && (!awsKeyId || !awsSecretKey)) {
      console.error('[Bedrock Proxy] ERROR: Missing AWS credentials in environment variables');
      return res.status(500).json({ error: 'Missing AWS credentials on server' });
    }

    let answer = null;

    if (awsApiKey) {
      // Preferred: OpenAI-compatible bedrock-mantle endpoint
      console.log(`[Bedrock Proxy] Using model: ${bedrockModel} via bedrock-mantle`);
      const r = await fetch(`${bedrockBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${awsApiKey}`
        },
        body: JSON.stringify({
          model: bedrockModel,
          messages,
          max_tokens: 8192,
          temperature: 0.7
        })
      });

      if (r.ok) {
        const data = await r.json();
        const message = data.choices?.[0]?.message;

        // If content is null, could be due to hitting max_tokens while reasoning
        if (message && message.content === null && message.reasoning) {
          console.warn('[Bedrock Proxy] Warning: content is null, hit max_tokens during reasoning. Extracted reasoning block.');
          // Some parsers might find JSON in the reasoning block if it squeezed it in
          answer = message.reasoning;
        } else {
          answer = message?.content || null;
        }

        if (!answer) {
          console.error('[Bedrock Proxy] ERROR: answer is null but response was OK. Data:', JSON.stringify(data));
          // Check if the API returned an error inside an HTTP 200 wrapper
          if (data.error) {
            return res.status(502).json({ error: `Bedrock API Error: ${data.error.message || JSON.stringify(data.error)}` });
          }
        }
      } else {
        const errText = await r.text();
        console.error('[Bedrock Proxy] mantle error:', r.status, errText);
        return res.status(502).json({ error: `Bedrock mantle error: ${r.status}` });
      }
    } else {
      // Fallback: AWS SDK with IAM credentials
      const systemText = messages.find(m => m.role === 'system')?.content || '';
      const claudePayload = {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1024,
        system: systemText,
        messages: messages.filter(m => m.role !== 'system')
      };
      const client = new BedrockRuntimeClient({
        region: awsRegion,
        credentials: {
          accessKeyId: awsKeyId,
          secretAccessKey: awsSecretKey
        }
      });
      const command = new InvokeModelCommand({
        modelId: "anthropic.claude-3-haiku-20240307-v1:0",
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify(claudePayload)
      });
      const response = await client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      answer = responseBody.content?.[0]?.text || null;
    }

    if (!answer) {
      return res.status(502).json({ error: 'Empty response from Bedrock' });
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
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
