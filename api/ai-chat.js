/**
 * Vercel Serverless Function — /api/ai-chat
 *
 * Proxies AI chat requests server-side.
 * API keys are stored ONLY in Vercel Environment Variables — never in the client bundle.
 *
 * POST /api/ai-chat
 * Body: { question: string, systemPrompt: string, history: [{role, content}] }
 * Returns: { answer: string }
 */

export default async function handler(req, res) {
    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // CORS headers (allow same-origin + Vercel preview URLs)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

        let answer = null;

        // ── 1. Try Gemini ────────────────────────────────────────────────────────
        const geminiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
        if (!answer && geminiKey) {
            try {
                // Gemini uses alternating user/model turns (no system role)
                const systemText = messages.find(m => m.role === 'system')?.content || '';
                const geminiContents = messages
                    .filter(m => m.role !== 'system')
                    .map((m, i) => ({
                        role: m.role === 'assistant' ? 'model' : 'user',
                        parts: [{
                            // Prepend system prompt to first user message
                            text: i === 0 && systemText ? `${systemText}\n\n${m.content}` : m.content
                        }],
                    }));

                const r = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: geminiContents,
                            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
                        }),
                    }
                );
                if (r.ok) {
                    const data = await r.json();
                    answer = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
                } else {
                    console.warn('[ai-chat] Gemini', r.status, await r.text());
                }
            } catch (e) {
                console.error('[ai-chat] Gemini error:', e.message);
            }
        }

        // ── 2. Try Groq ──────────────────────────────────────────────────────────
        const groqKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
        const groqModel = process.env.EXPO_PUBLIC_GROQ_MODEL || 'llama-3.1-70b-versatile';
        if (!answer && groqKey) {
            try {
                const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${groqKey}`,
                    },
                    body: JSON.stringify({ model: groqModel, messages, temperature: 0.7, max_tokens: 1024 }),
                });
                if (r.ok) {
                    const data = await r.json();
                    answer = data.choices?.[0]?.message?.content || null;
                } else {
                    console.warn('[ai-chat] Groq', r.status, await r.text());
                }
            } catch (e) {
                console.error('[ai-chat] Groq error:', e.message);
            }
        }

        // ── 3. Try Hugging Face ──────────────────────────────────────────────────
        const hfKey = process.env.EXPO_PUBLIC_HUGGINGFACE_API_KEY;
        const hfModel = process.env.EXPO_PUBLIC_HUGGINGFACE_MODEL || 'Qwen/Qwen2.5-72B-Instruct';
        if (!answer && hfKey) {
            try {
                const r = await fetch('https://router.huggingface.co/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${hfKey}`,
                    },
                    body: JSON.stringify({ model: hfModel, messages, temperature: 0.7, max_tokens: 1024 }),
                });
                if (r.ok) {
                    const data = await r.json();
                    answer = data.choices?.[0]?.message?.content || null;
                } else {
                    console.warn('[ai-chat] HuggingFace', r.status, await r.text());
                }
            } catch (e) {
                console.error('[ai-chat] HuggingFace error:', e.message);
            }
        }

        // ── 4. Try Ollama ────────────────────────────────────────────────────────
        const ollamaEndpoint = process.env.EXPO_PUBLIC_OLLAMA_ENDPOINT;
        const ollamaModel = process.env.EXPO_PUBLIC_OLLAMA_MODEL || 'mistral';
        if (!answer && ollamaEndpoint) {
            try {
                const baseUrl = ollamaEndpoint.replace(/\/$/, '');
                const r = await fetch(`${baseUrl}/v1/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'ngrok-skip-browser-warning': '69420',
                    },
                    body: JSON.stringify({ model: ollamaModel, messages, temperature: 0.7, max_tokens: 1024 }),
                });
                if (r.ok) {
                    const data = await r.json();
                    answer = data.choices?.[0]?.message?.content || null;
                } else {
                    console.warn('[ai-chat] Ollama', r.status);
                }
            } catch (e) {
                console.error('[ai-chat] Ollama error:', e.message);
            }
        }

        if (!answer) {
            return res.status(502).json({
                error: 'כל ספקי ה-AI נכשלו. בדוק את Environment Variables ב-Vercel Dashboard.',
            });
        }

        return res.status(200).json({ answer });

    } catch (err) {
        console.error('[ai-chat] Unhandled error:', err);
        return res.status(500).json({ error: 'Internal server error: ' + err.message });
    }
}
