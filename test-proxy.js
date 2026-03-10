const fetch = require('node-fetch');

async function run() {
    try {
        const url = 'http://localhost:3000/api/ai-chat';
        const res = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({ question: 'hello', systemPrompt: 'test' }),
            headers: { 'Content-Type': 'application/json' }
        });
        console.log('Status:', res.status);
        const text = await res.text();
        console.log('Response:', text);
    } catch (e) {
        console.error('Error:', e.message);
    }
}

run();
