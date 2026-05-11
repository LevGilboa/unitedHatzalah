# AWS Cost Analysis Report

## Summary of Findings

The $500 AWS charge is likely the result of several high-volume AI processing patterns in the codebase, combined with an expensive default model configuration.

## Key Cost Drivers

### 1. High Token Volume per Course Generation
When creating a "Complete Course" (5 phases), the system makes **7 independent AI calls**:
- 1 for content analysis
- 1 for dynamic course planning
- 5 for exercise generation (one per phase)

For each call, the **entire combined content** of all uploaded files is sent in the prompt. If a user uploads five 50,000-character files (~250k characters total), each course generation transmits nearly **1.75 million characters** (approx. 430,000 tokens) in input alone.

### 2. Context-Heavy AI Chat
The Q&A chat feature attached to each course sends up to **40,000 characters** of course context with **every single message**. In a long conversation, this leads to massive token consumption even for simple questions.

### 3. Suspicious Model Configuration
If `BEDROCK_MODEL` is not explicitly set, the code defaults to `openai.gpt-oss-120b`. This is a non-standard model name likely provided by the `bedrock-mantle` proxy. High-parameter models in this tier can cost up to 4-10x more than standard models like Claude 3 Haiku or Gemini 1.5 Flash.

### 4. Public Unsecured API Endpoint
The `/api/ai-chat` endpoint has **no authentication**. Any external actor who discovers the URL can send arbitrary, large payloads to your Bedrock models, which are then billed to your AWS account.

## Recommended Immediate Actions

1.  **[CRITICAL] Switch to Gemini**: Gemini 1.5 Flash is significantly cheaper and often faster for these tasks.
2.  **[CRITICAL] Secure the API**: Add a simple API key or JWT check to `/api/ai-chat` to prevent unauthorized usage.
3.  **Optimize Context**: Instead of sending the full text for every call, use the "Summary" generated in Phase 1 for subsequent chat/exercise calls.
4.  **Implement Token Limits**: Add safety checks to reject files or combinations that exceed a reasonable token budget (e.g., 100k tokens).

## Calculated Cost Projection
*Assuming $15 per 1 million tokens (typical high-end model price):*
- **1 Course Generation**: ~$6.50
- **100 Courses**: ~$650.00
- **Chat (10 messages)**: ~$1.20 per user session

If the model is in the "Opus" tier ($60/1M tokens), these costs quadruple.
