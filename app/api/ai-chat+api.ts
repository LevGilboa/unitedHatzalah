/**
 * Server-side AI Chat Proxy
 * Keeps ALL API keys on the server — never exposed to the browser.
 *
 * POST /api/ai-chat
 * Body: { question: string, systemPrompt: string, history: {role, content}[] }
 * Returns: { answer: string }
 */

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { question, systemPrompt, history = [] } = body as {
            question: string;
            systemPrompt: string;
            history: { role: string; content: string }[];
        };

        if (!question || !systemPrompt) {
            return new Response(JSON.stringify({ error: 'Missing required fields' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Build message array
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.slice(-8), // keep last 8 turns to limit token usage
            { role: 'user', content: question },
        ];

        let answer: string | null = null;

        // ── Try Gemini ──────────────────────────────────────────────────────────
        const geminiKey = process.env['EXPO_PUBLIC_GEMINI_API_KEY'];
        if (!answer && geminiKey) {
            try {
                // Gemini uses a different structure: alternate user/model turns only
                const geminiContents = messages
                    .filter(m => m.role !== 'system')
                    .map(m => ({
                        role: m.role === 'assistant' ? 'model' : 'user',
                        parts: [{ text: m.content }],
                    }));

                // Prepend the system prompt as the first user message if needed
                const systemContent = messages.find(m => m.role === 'system')?.content || '';
                if (systemContent && geminiContents[0]?.role === 'user') {
                    geminiContents[0].parts[0].text = `${systemContent}\n\n${geminiContents[0].parts[0].text}`;
                }

                const res = await fetch(
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
                if (res.ok) {
                    const data = await res.json();
                    answer = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
                } else {
                    console.warn('[ai-chat] Gemini error:', res.status, await res.text());
                }
            } catch (e) {
                console.error('[ai-chat] Gemini exception:', e);
            }
        }

        // ── Try Groq ────────────────────────────────────────────────────────────
        const groqKey = process.env['EXPO_PUBLIC_GROQ_API_KEY'];
        const groqModel = process.env['EXPO_PUBLIC_GROQ_MODEL'] || 'llama-3.1-70b-versatile';
        if (!answer && groqKey) {
            try {
                const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${groqKey}`,
                    },
                    body: JSON.stringify({
                        model: groqModel,
                        messages,
                        temperature: 0.7,
                        max_tokens: 1024,
                    }),
                });
                if (res.ok) {
                    const data = await res.json();
                    answer = data.choices?.[0]?.message?.content || null;
                } else {
                    console.warn('[ai-chat] Groq error:', res.status, await res.text());
                }
            } catch (e) {
                console.error('[ai-chat] Groq exception:', e);
            }
        }

        // ── Try Ollama ──────────────────────────────────────────────────────────
        const ollamaEndpoint = process.env['EXPO_PUBLIC_OLLAMA_ENDPOINT'];
        const ollamaModel = process.env['EXPO_PUBLIC_OLLAMA_MODEL'] || 'mistral';
        if (!answer && ollamaEndpoint) {
            try {
                const baseUrl = ollamaEndpoint.replace(/\/$/, '');
                const res = await fetch(`${baseUrl}/v1/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'ngrok-skip-browser-warning': '69420',
                    },
                    body: JSON.stringify({
                        model: ollamaModel,
                        messages,
                        temperature: 0.7,
                        max_tokens: 1024,
                    }),
                });
                if (res.ok) {
                    const data = await res.json();
                    answer = data.choices?.[0]?.message?.content || null;
                } else {
                    console.warn('[ai-chat] Ollama error:', res.status);
                }
            } catch (e) {
                console.error('[ai-chat] Ollama exception:', e);
            }
        }

        if (!answer) {
            return new Response(
                JSON.stringify({ error: 'כל ספקי ה-AI נכשלו. בדוק את הגדרות המפתחות בשרת.' }),
                { status: 502, headers: { 'Content-Type': 'application/json' } }
            );
        }

        return new Response(JSON.stringify({ answer }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error: any) {
        console.error('[ai-chat] Unhandled error:', error);
        return new Response(JSON.stringify({ error: 'Internal server error: ' + error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
