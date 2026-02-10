

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { model, inputs, parameters, apiKey: bodyApiKey } = body;

        // Use server-side environment variable as primary source, fallback to client-provided key
        const apiKey = process.env['EXPO_PUBLIC_HUGGINGFACE_API_KEY'] || bodyApiKey;

        console.log('[API Proxy] Processing request for model:', model);

        // Use the new Router API (OpenAI compatible)
        const targetUrl = 'https://router.huggingface.co/v1/chat/completions';

        console.log('[API Proxy] Forwarding to:', targetUrl);

        if (!apiKey) {
            return new Response(JSON.stringify({ error: "Missing API Key configuration on server" }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Qwen and modern models typically use ChatML or similar structues.
        // We use the standard OpenAI 'messages' format with 'system' and 'user' roles,
        // which the Hugging Face Router automatically maps to the model's specific template (e.g. ChatML).

        const openAIBody = {
            model: model,
            messages: [
                {
                    role: "system",
                    content: "You are an expert educational AI. Output ONLY valid JSON with no markdown formatting. The JSON must follow this structure: { \"exercises\": [ { \"type\": \"...\", \"question\": \"...\", \"answer\": \"...\", \"explanation\": \"...\" } ] }"
                },
                {
                    role: "user",
                    content: inputs
                }
            ],
            response_format: { type: "json_object" },
            max_tokens: 4096,
            temperature: parameters?.temperature || 0.1,
            stream: false
        };

        // Server-side fetch to Hugging Face
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(openAIBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[API Proxy] Upstream error:', response.status, errorText);
            return new Response(JSON.stringify({
                error: `Upstream Hugging Face error: ${response.status}`,
                details: errorText
            }), {
                status: 502,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const data = await response.json();

        // Transform OpenAI response back to legacy format expected by client
        // Client expects: [{ generated_text: "..." }] or { generated_text: "..." }
        const generatedText = data.choices?.[0]?.message?.content || "";
        const legacyResponse = [{ generated_text: generatedText }];

        return new Response(JSON.stringify(legacyResponse), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error: any) {
        console.error('[API Proxy] Internal error:', error);
        return new Response('Proxy error: ' + error.message, { status: 500 });
    }
}
