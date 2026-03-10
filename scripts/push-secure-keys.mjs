/**
 * push-secure-keys.mjs
 * Correctly pushes AI keys to Vercel WITHOUT the EXPO_PUBLIC_ prefix.
 * This ensures they are NEVER exposed to the frontend bundle.
 * 
 * Run: node scripts/push-secure-keys.mjs
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Map of .env keys to Vercel secure keys (without EXPO_PUBLIC_)
const KEY_MAPPING = {
    'EXPO_PUBLIC_GEMINI_API_KEY': 'GEMINI_API_KEY',
    'EXPO_PUBLIC_GROQ_API_KEY': 'GROQ_API_KEY',
    'EXPO_PUBLIC_HUGGINGFACE_API_KEY': 'HUGGINGFACE_API_KEY',
    'AWS_ACCESS_KEY_ID': 'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY': 'AWS_SECRET_ACCESS_KEY',
    'AWS_REGION': 'AWS_REGION',
    'AWS_BEDROCK_API_KEY': 'AWS_BEDROCK_API_KEY',
    'BEDROCK_OPENAI_BASE_URL': 'BEDROCK_OPENAI_BASE_URL',
    'BEDROCK_MODEL': 'BEDROCK_MODEL'
};

// Also include the original names just in case some other logic needs them
const ALL_KEYS = [
    ...Object.keys(KEY_MAPPING),
    ...Object.values(KEY_MAPPING)
];

const envPath = join(__dirname, '..', '.env');
if (!existsSync(envPath)) {
    console.error('❌ .env file not found');
    process.exit(1);
}

const envContent = readFileSync(envPath, 'utf8');
const envVars = {};
for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    envVars[key] = value;
}

console.log('🛡️  Pushing SECURE environment variables to Vercel...\n');

for (const [envKey, vercelKey] of Object.entries(KEY_MAPPING)) {
    const value = envVars[envKey];
    if (!value) continue;

    console.log(`📡 Processing ${vercelKey}...`);
    
    try {
        // Production
        execSync(`npx vercel env add ${vercelKey} production --value ${JSON.stringify(value)} --yes --force`, { stdio: 'pipe' });
        // Preview/Development
        execSync(`npx vercel env add ${vercelKey} preview --value ${JSON.stringify(value)} --yes --force`, { stdio: 'pipe' });
        
        console.log(`✅ ${vercelKey} pushed successfully.`);
    } catch (err) {
        console.error(`❌ Failed to push ${vercelKey}:`, err.message);
    }
}

console.log('\n✨ DONE! Your keys are now stored securely in Vercel.');
console.log('🚀 Run `npm run deploy` to apply changes.');
