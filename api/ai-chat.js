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

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import crypto from 'crypto';

// Helper to sign Bedrock requests dynamically using SigV4
function getSignedBedrockToken(accessKey, secretKey, region) {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]/g, '').split('.')[0] + 'Z';
    const dateStamp = amzDate.substring(0, 8);
    const host = 'bedrock.amazonaws.com';
    const urlPath = '/';
    const credentialScope = `${dateStamp}/${region}/bedrock/aws4_request`;

    function getSignatureKey(key, dateStamp, regionName, serviceName) {
        const kDate = crypto.createHmac('sha256', 'AWS4' + key).update(dateStamp, 'utf8').digest();
        const kRegion = crypto.createHmac('sha256', kDate).update(regionName, 'utf8').digest();
        const kService = crypto.createHmac('sha256', kRegion).update(serviceName, 'utf8').digest();
        const kSigning = crypto.createHmac('sha256', kService).update('aws4_request', 'utf8').digest();
        return kSigning;
    }

    let canonicalQueryString = [
        `Action=CallWithBearerToken`,
        `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
        `X-Amz-Credential=${encodeURIComponent(accessKey + '/' + credentialScope)}`,
        `X-Amz-Date=${amzDate}`,
        `X-Amz-Expires=3600`, // Short expiry for the request itself
        `X-Amz-SignedHeaders=host`
    ].join('&');

    const canonicalRequest = `GET\n${urlPath}\n${canonicalQueryString}\nhost:${host}\n\nhost\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest, 'utf8').digest('hex')}`;
    const signingKey = getSignatureKey(secretKey, dateStamp, region, 'bedrock');
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');
    
    canonicalQueryString += `&X-Amz-Signature=${signature}`;
    const signedUrl = `bedrock.amazonaws.com/?${canonicalQueryString}`;
    return 'bedrock-api-key-' + Buffer.from(signedUrl).toString('base64');
}

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
        const errors = [];

        // ── 0. Try AWS Bedrock via OpenAI-compatible endpoint (bedrock-mantle) ────
        // Note: No EXPO_PUBLIC_ prefix so it is NEVER baked into the client by mistake.
        const awsApiKey = process.env.AWS_BEDROCK_API_KEY;
        const bedrockBaseUrl = process.env.BEDROCK_OPENAI_BASE_URL || 'https://bedrock-mantle.eu-central-1.api.aws/v1';
        const bedrockModel = process.env.BEDROCK_MODEL || 'openai.gpt-oss-120b';
        const awsKeyId = process.env.AWS_ACCESS_KEY_ID;
        const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
        const awsRegion = process.env.AWS_REGION || "eu-central-1";

        if (!answer && (awsApiKey || (awsKeyId && awsSecretKey))) {
            try {
                // If we have permanent keys but no API key, generate a dynamic token
                const effectiveApiKey = awsApiKey || getSignedBedrockToken(awsKeyId, awsSecretKey, awsRegion);
                
                if (effectiveApiKey) {
                    // ── Preferred: OpenAI-compatible bedrock-mantle endpoint ────────
                    console.log(`[ai-chat] Using Bedrock via OpenAI-compatible endpoint (${bedrockModel}) - ${awsApiKey ? 'Static' : 'Dynamic'} Token`);
                    try {
                        const r = await fetch(`${bedrockBaseUrl}/chat/completions`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${effectiveApiKey}`
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
                            if (message && message.content === null && message.reasoning) {
                                console.warn('[ai-chat] Warning: content is null but reasoning is present. Falling back to reasoning.');
                                answer = message.reasoning;
                            } else {
                                answer = message?.content || null;
                            }

                            if (!answer) {
                                console.error('[ai-chat] ERROR: answer is null but response was OK. Data:', JSON.stringify(data));
                                errors.push('Bedrock (mantle): Empty response content');
                            }
                        } else {
                            const errText = await r.text();
                            console.warn('[ai-chat] Bedrock mantle error:', r.status, errText);
                            errors.push(`Bedrock mantle: ${r.status} ${errText}`);
                        }
                    } catch (fetchErr) {
                        console.error('[ai-chat] Bedrock mantle fetch exception:', fetchErr.message);
                        errors.push(`Bedrock mantle fetch failed: ${fetchErr.message}`);
                    }
                } else {
                    // ── Fallback: AWS SDK with IAM credentials ──────────────────────
                    const systemText = messages.find(m => m.role === 'system')?.content || '';
                    const claudePayload = {
                        anthropic_version: "bedrock-2023-05-31",
                        max_tokens: 8192,
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
                    if (!answer) errors.push('Bedrock SDK: Empty response content');
                }
            } catch (e) {
                console.error('[ai-chat] AWS Bedrock error:', e.message);
                errors.push(`Bedrock: ${e.message}`);
            }
        } else if (!awsApiKey && (!awsKeyId || !awsSecretKey)) {
            errors.push('Bedrock: Missing credentials');
        }

        // ── 1. Try Gemini ────────────────────────────────────────────────────────
        const geminiKey = process.env.GEMINI_API_KEY || process.env.EXPO_PUBLIC_GEMINI_API_KEY;
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
                            generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
                        }),
                    }
                );
                if (r.ok) {
                    const data = await r.json();
                    answer = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
                    if (!answer) errors.push('Gemini: Empty response content');
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
