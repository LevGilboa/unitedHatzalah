const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
require('dotenv').config({ path: '../.env' });

async function run() {
    try {
        const client = new BedrockRuntimeClient({
            region: (process.env.AWS_REGION || 'us-east-1').replace(/^["']|["']$/g, ''),
            credentials: {
                accessKeyId: (process.env.AWS_ACCESS_KEY_ID || '').replace(/^["']|["']$/g, ''),
                secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || '').replace(/^["']|["']$/g, '')
            }
        });
        const claudePayload = {
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 1024,
            system: "You are a helpful assistant.",
            messages: [{ role: 'user', content: 'Say hello world' }]
        };
        const command = new InvokeModelCommand({
            modelId: "anthropic.claude-3-haiku-20240307-v1:0",
            contentType: "application/json",
            accept: "application/json",
            body: JSON.stringify(claudePayload)
        });
        const response = await client.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));
        console.log("Success:", responseBody.content?.[0]?.text);
    } catch (e) {
        console.error("Error:", e);
    }
}
run();
