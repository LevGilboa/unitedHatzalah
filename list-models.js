require('dotenv').config({ path: '.env' });

const apiKey = process.env.AWS_BEDROCK_API_KEY;
const baseUrl = process.env.BEDROCK_OPENAI_BASE_URL || 'https://bedrock-mantle.eu-central-1.api.aws/v1';

if (!apiKey) { console.error('No AWS_BEDROCK_API_KEY found'); process.exit(1); }

console.log(`Using base URL: ${baseUrl}`);
console.log(`API Key starts with: ${apiKey.slice(0, 20)}...`);
console.log('');

(async () => {
  // List available models
  const r = await fetch(`${baseUrl}/models`, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  const text = await r.text();
  console.log(`GET /models => ${r.status}`);
  
  if (r.ok) {
    const data = JSON.parse(text);
    console.log('Available models:');
    (data.data || data.models || []).forEach(m => console.log(' -', m.id || m));
  } else {
    console.log('Response:', text.slice(0, 300));
  }
})();
