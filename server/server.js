const express = require('express');
const path = require('path');
const admin = require('firebase-admin');
const { log } = require('console');

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

// Proxy for Hugging Face API (to avoid CORS on web)
// Proxy for Hugging Face API (to avoid CORS on web)
app.post('/api/huggingface', async (req, res) => {
  try {
    const { model, inputs, parameters, apiKey: bodyApiKey } = req.body;

    // Get API key from env (preferred) or body
    const apiKey = process.env.EXPO_PUBLIC_HUGGINGFACE_API_KEY || bodyApiKey || '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';

    console.log(`[Proxy] Processing request for model: ${model}`);
    console.log(`[Proxy] Auth: ${apiKey ? 'Key Present' : 'MISSING'}`);

    // Updated to new router domain as api-inference is deprecated
    const targetUrl = `https://router.huggingface.co/models/${model}`;
    console.log(`[Proxy] Forwarding to: ${targetUrl}`);

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
