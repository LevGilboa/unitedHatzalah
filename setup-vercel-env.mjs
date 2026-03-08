/**
 * setup-vercel-env.mjs
 * One-shot script: reads .env and pushes all AI keys to Vercel
 * Run: node setup-vercel-env.mjs
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Keys to push to Vercel (DO NOT include in client bundle)
const SECRET_KEYS = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_REGION',
    'EXPO_PUBLIC_GEMINI_API_KEY',
    'EXPO_PUBLIC_GROQ_API_KEY',
    'EXPO_PUBLIC_GROQ_MODEL',
    'EXPO_PUBLIC_HUGGINGFACE_API_KEY',
    'EXPO_PUBLIC_HUGGINGFACE_MODEL',
    'EXPO_PUBLIC_OLLAMA_ENDPOINT',
    'EXPO_PUBLIC_OLLAMA_MODEL',
    'EXPO_PUBLIC_AI_PROVIDER',
];

// Parse .env file
const envPath = join(__dirname, '.env');
let envContent = '';
try {
    envContent = readFileSync(envPath, 'utf8');
} catch (e) {
    console.error('❌ Could not read .env file:', e.message);
    process.exit(1);
}

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

console.log('🚀 Pushing environment variables to Vercel...\n');

let successCount = 0;
let errorCount = 0;

for (const key of SECRET_KEYS) {
    const value = envVars[key];
    if (!value) {
        console.log(`⏭️  ${key} — not found in .env, skipping`);
        continue;
    }

    try {
        // Remove existing env var first (ignore errors)
        try {
            execSync(`npx vercel env rm ${key} production --yes`, { stdio: 'ignore' });
            execSync(`npx vercel env rm ${key} preview --yes`, { stdio: 'ignore' });
        } catch (_) { }

        // Add for production + preview using --value for clean transport
        for (const env of ['production', 'preview']) {
            // We use JSON.stringify to handle spaces, and then wrap in extra quotes for the shell if needed
            // On Windows, the safest is often to use the --value flag directly.
            const cmd = `npx vercel env add ${key} ${env} --value ${JSON.stringify(value)} --yes --force`;
            execSync(cmd, { stdio: 'pipe' });
        }

        console.log(`✅ ${key} → production + preview`);
        successCount++;
    } catch (err) {
        console.error(`❌ ${key} — error:`, err.message?.slice(0, 120));
        errorCount++;
    }
}

console.log(`\n📊 Done: ${successCount} succeeded, ${errorCount} failed`);
if (successCount > 0) {
    console.log('\n▶️  Now run:  npx vercel --prod\n');
}
