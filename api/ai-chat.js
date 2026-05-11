/**
 * Vercel Serverless Function — /api/ai-chat
 *
 * Proxies AI chat requests server-side.
 * API keys are stored ONLY in Vercel Environment Variables — never in the client bundle.
 *
 * POST /api/ai-chat
 * Body: { question: string, systemPrompt: string, history: [{role, content}] }
 * Returns: { answer: string }
 * 
 * Cost optimization: Uses Amazon Nova Lite ($0.06/1M input, $0.24/1M output)
 * instead of openai.gpt-oss-120b ($15-60/1M tokens)
 */

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

// ── Simple in-memory rate limiter ────────────────────────────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100;    // max 100 requests per minute

function checkRateLimit(ip) {
    const now = Date.now();
    const key = ip || 'unknown';
    const entry = rateLimitMap.get(key);
    
    if (!entry || now - entry.start > RATE_LIMIT_WINDOW_MS) {
        rateLimitMap.set(key, { start: now, count: 1 });
        return true;
    }
    
    entry.count++;
    if (entry.count > MAX_REQUESTS_PER_WINDOW) {
        return false;
    }
    return true;
}

// Clean up old entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap.entries()) {
        if (now - entry.start > RATE_LIMIT_WINDOW_MS * 2) {
            rateLimitMap.delete(key);
        }
    }
}, 5 * 60 * 1000);

// ── Max request size (characters) ────────────────────────────────────────────
const MAX_REQUEST_CHARS = 50000;

export default async function handler(req, res) {
    // CORS headers (allow same-origin + Vercel preview URLs)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Rate limiting
    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp)) {
        console.warn(`[ai-chat] Rate limit exceeded for ${clientIp}`);
        return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
    }

    try {
        const { question, systemPrompt, history = [] } = req.body;

        if (!question || !systemPrompt) {
            return res.status(400).json({ error: 'Missing required fields: question, systemPrompt' });
        }

        // Request size guard
        const totalChars = (question?.length || 0) + (systemPrompt?.length || 0) + 
            history.reduce((sum, h) => sum + (h.content?.length || 0), 0);
        if (totalChars > MAX_REQUEST_CHARS) {
            console.warn(`[ai-chat] Request too large: ${totalChars} chars (max ${MAX_REQUEST_CHARS})`);
            return res.status(413).json({ error: `Request too large (${totalChars} chars). Max: ${MAX_REQUEST_CHARS}` });
        }

        // Build the full message array
        const messages = [
            ...history.slice(-8),   // Keep last 8 turns to limit token usage
            { role: 'user', content: question },
        ];

        let answer = null;
        const errors = [];

        // ── 0. Try AWS Bedrock — Amazon Nova Lite (cheapest!) ─────────────────
        const awsKeyId = process.env.AWS_ACCESS_KEY_ID;
        const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
        const awsRegion = process.env.AWS_REGION || "us-east-1";
        const bedrockModel = process.env.BEDROCK_MODEL || "amazon.nova-lite-v1:0";

        if (!answer && awsKeyId && awsSecretKey) {
            try {
                console.log(`[ai-chat] Using Bedrock model: ${bedrockModel} in ${awsRegion}`);

                const client = new BedrockRuntimeClient({
                    region: awsRegion,
                    credentials: {
                        accessKeyId: awsKeyId,
                        secretAccessKey: awsSecretKey
                    }
                });

                // Amazon Nova uses a different payload format than Claude
                const isNovaModel = bedrockModel.startsWith('amazon.nova');
                const isClaudeModel = bedrockModel.startsWith('anthropic.');

                let payload;
                if (isNovaModel) {
                    // Amazon Nova format
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
                    // Claude format
                    payload = {
                        anthropic_version: "bedrock-2023-05-31",
                        max_tokens: 4096,
                        system: systemPrompt,
                        messages: messages.filter(m => m.role !== 'system')
                    };
                } else {
                    // Generic format (fallback)
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

                // Extract answer based on model type
                if (isNovaModel) {
                    answer = responseBody.output?.message?.content?.[0]?.text || null;
                } else if (isClaudeModel) {
                    answer = responseBody.content?.[0]?.text || null;
                } else {
                    answer = responseBody.choices?.[0]?.message?.content ||
                             responseBody.content?.[0]?.text || null;
                }

                if (answer) {
                    console.log(`[ai-chat] ✅ Bedrock ${bedrockModel} success (${answer.length} chars)`);
                } else {
                    console.error('[ai-chat] Bedrock returned empty answer. Response:', JSON.stringify(responseBody).substring(0, 500));
                    errors.push(`Bedrock ${bedrockModel}: Empty response`);
                }
            } catch (e) {
                console.error('[ai-chat] AWS Bedrock error:', e.message);
                errors.push(`Bedrock: ${e.message}`);
            }
        } else if (!awsKeyId || !awsSecretKey) {
            errors.push('Bedrock: Missing AWS credentials');
        }

        // ── 1. Fallback: Try Gemini ──────────────────────────────────────────
        const geminiKey = process.env.GEMINI_API_KEY || process.env.EXPO_PUBLIC_GEMINI_API_KEY;
        if (!answer && geminiKey) {
            try {
                // Gemini uses alternating user/model turns (no system role)
                const systemText = systemPrompt || '';
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
                    if (answer) {
                        console.log(`[ai-chat] ✅ Gemini fallback success (${answer.length} chars)`);
                    } else {
                        errors.push('Gemini: Empty response content');
                    }
                } else {
                    const errText = await r.text();
                    console.warn('[ai-chat] Gemini', r.status, errText);
                    errors.push(`Gemini: ${r.status} ${errText}`);
                }
            } catch (e) {
                console.error('[ai-chat] Gemini error:', e.message);
                errors.push(`Gemini: ${e.message}`);
            }
        } else if (!geminiKey) {
            errors.push('Gemini: Missing API key');
        }

        if (!answer) {
            console.error('[ai-chat] All providers failed:', errors);
            return res.status(502).json({
                error: 'כל ספקי ה-AI נכשלו. בדוק את Environment Variables ב-Vercel Dashboard.',
                details: errors,
            });
        }

        return res.status(200).json({ answer });

    } catch (err) {
        console.error('[ai-chat] Unhandled error:', err);
        return res.status(500).json({ error: 'Internal server error: ' + err.message });
    }
}
