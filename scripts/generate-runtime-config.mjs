import { writeFile } from 'node:fs/promises';

const apiBase = String(process.env.GIPPO_API_BASE_URL || '').trim().replace(/\/+$/, '');

const content = `// Auto-generated at build time (Netlify).
// Set env var GIPPO_API_BASE_URL to override the API base URL.
// Example: https://financeiro-backend-580167451147.southamerica-east1.run.app/v1
(function(){
  if (!${JSON.stringify(Boolean(apiBase))}) return;
  window.__API_BASE_URL = ${JSON.stringify(apiBase)};
})();
`;

await writeFile(new URL('../runtime-config.js', import.meta.url), content, 'utf8');
console.log('Wrote runtime-config.js', apiBase ? `(API=${apiBase})` : '(API not set)');
