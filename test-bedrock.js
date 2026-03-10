const fetch = require('node-fetch');

async function run() {
    try {
        const url = 'https://bedrock-mantle.us-east-1.api.aws/v1/chat/completions';
        const apiKey = process.env.BEDROCK_API_KEY;
        const messages = [
            { role: 'system', content: 'אתה מורה מומחה שיוצר תרגילים חינוכיים בעברית. תמיד החזר JSON תקין בלבד.' },
            { role: 'user', content: 'אתה מורה מומחה שיוצר תרגילים מחומר לימוד. חומר הלימוד: ' + 'A'.repeat(50000) }
        ];

        const body = {
            model: "openai.gpt-oss-120b",
            messages,
            max_tokens: 1024,
            temperature: 0.7
        };
        const res = await fetch(url, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey
            }
        });
        console.log('Status:', res.status);
        console.log('OK:', res.ok);
        const text = await res.text();
        console.log('Response len:', text.length);
        console.log('Response:', text.substring(0, 500));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

run();
