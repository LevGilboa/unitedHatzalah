const fs = require('fs');
const cp = require('child_process');

const content = fs.readFileSync('.env', 'utf8');
const lines = content.split('\n');

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  
  const [key, ...rest] = trimmed.split('=');
  const value = rest.join('=');
  
  if (key && value) {
    let cleanKey = key;
    console.log('Adding', cleanKey, 'to Vercel...');
    for (const env of ['production', 'preview', 'development']) {
        try {
          cp.execSync('npx vercel env rm ' + cleanKey + ' ' + env + ' -y', { stdio: 'ignore' });
        } catch(e) {}
        try {
          cp.execSync('npx vercel env add ' + cleanKey + ' ' + env, {
            input: value + '\n',
            stdio: ['pipe', 'ignore', 'ignore']
          });
          console.log('Success for', cleanKey, env);
        } catch(e) {
          console.error('Failed to add', cleanKey, env);
        }
    }
  }
}
