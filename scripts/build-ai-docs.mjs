// Builds the AI-friendly documentation bundles from the sources in docs/ai and the OpenAPI contract:
//   server/public/llms.txt          short index (llmstxt.org style)
//   server/public/llms-full.txt     everything in one file: playbook + glossary + prompts + API reference
//   server/public/postman.json      Postman collection generated from /openapi.json
//   server/public/docs/ai/...       the markdown sources, for linking
// Run: npm run build:ai-docs   (uses tsx to read the TypeScript OpenAPI definition)
import fs from 'node:fs';
import path from 'node:path';
import { buildOpenApi } from '../server/src/modules/system/openapi.ts';

const root = path.resolve(import.meta.dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const out = (f, s) => { const p = path.join(root, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const HOST = '{{HOST}}';                                   // replaced with the real address when the file is served
const spec = buildOpenApi(HOST);

// ---------------------------------------------------------------- API reference as markdown
const resolve = s => (s && s.$ref ? spec.components.schemas[s.$ref.split('/').pop()] : s);
function fields(schema, indent = '') {
  schema = resolve(schema);
  if (!schema) return '';
  if (schema.allOf) return schema.allOf.map(x => fields(x, indent)).join('');
  const req = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).map(([k, v]) => {
    const r = resolve(v);
    const type = Array.isArray(r.type) ? r.type.join('|') : r.type ?? 'object';
    const extra = [r.enum && `one of ${r.enum.join(', ')}`, r.pattern && `pattern ${r.pattern}`, r.minimum !== undefined && `min ${r.minimum}`, r.maximum !== undefined && `max ${r.maximum}`, r.maxLength && `max length ${r.maxLength}`].filter(Boolean).join(', ');
    const line = `${indent}- \`${k}\` (${type}${req.has(k) ? ', required' : ''})${r.description ? ': ' + r.description : ''}${extra ? ` [${extra}]` : ''}\n`;
    return line + (r.type === 'object' && r.properties ? fields(r, indent + '  ') : '') + (r.type === 'array' && r.items ? fields(r.items, indent + '  ') : '');
  }).join('');
}
function apiReference() {
  let md = '';
  for (const [p, ops] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(ops)) {
      md += `### ${method.toUpperCase()} ${p}\n${op.summary}.${op.description ? ' ' + op.description : ''}\n`;
      const params = (op.parameters ?? []).map(x => `\`${x.name}\` (${x.in}${x.required ? ', required' : ''})${x.schema?.enum ? ' one of ' + x.schema.enum.join(', ') : ''}${x.description ? ': ' + x.description : ''}`);
      if (params.length) md += `Parameters:\n${params.map(x => '- ' + x).join('\n')}\n`;
      const body = op.requestBody?.content?.['application/json']?.schema;
      if (body) md += `Request body:\n${fields(body)}`;
      md += 'Responses:\n' + Object.entries(op.responses).map(([code, r]) => `- ${code}: ${r.description}`).join('\n') + '\n\n';
    }
  }
  md += '## Messages we send to YOU\n\n';
  for (const [name, hook] of Object.entries(spec.webhooks)) {
    const op = hook.post;
    md += `### ${name}: ${op.summary}\n${op.description ? op.description + '\n' : ''}`;
    const body = op.requestBody?.content?.['application/json']?.schema;
    if (body) md += `Body:\n${fields(body)}`;
    md += '\n';
  }
  md += '## Error shape\nEvery error is `{ "error": "message", "code": "machine_code" }`.\n';
  return md;
}

// ---------------------------------------------------------------- bundles
const demote = (md, n = 1) => md.replace(/^(#{1,5}) /gm, (_, h) => '#'.repeat(Math.min(6, h.length + n)) + ' ');
const host = s => s.replaceAll('https://<our-host>', HOST).replaceAll('<our-host>', HOST).replaceAll('{HOST}', HOST);
const playbook = host(read('docs/ai/integration-playbook.md'));
const glossary = host(read('docs/ai/glossary.md'));
const promptFiles = ['integrate-sessions', 'integrate-managed-wallet', 'integrate-seamless-wallet', 'webhook-receiver', 'rooms-and-leaderboards', 'review-my-integration'];
const prompts = promptFiles.map(n => host(read(`docs/ai/prompts/${n}.md`)));

out('server/public/llms-full.txt', `# MiniGame Studio: full integration reference for AI assistants

> Everything an AI assistant needs to help a developer integrate MiniGame Studio (customizable mini games) into their own website or app.
> Server address: ${HOST}. Machine-readable contract: ${HOST}/openapi.json. Human guide: ${HOST}/docs/.
> Read the whole file before writing code. Do not invent endpoints, fields or error codes that are not written here.

# Part 1: Integration playbook

${demote(playbook.replace(/^# .*\n/, ''))}

# Part 2: Glossary

${demote(glossary.replace(/^# .*\n/, ''))}

# Part 3: Ready-made task prompts

The developer may paste one of these (filled in) together with this file.

${prompts.map(p => demote(p, 1)).join('\n\n')}

# Part 4: API reference (generated from ${HOST}/openapi.json)

${apiReference()}
`);

out('server/public/llms.txt', `# MiniGame Studio

> A platform of customizable mini games (first game: Lucky Wheel 77) that a company embeds in its own website or mobile app. The company's own system logs users in and (optionally) holds the coins; MiniGame Studio runs the game, keeps results and offers APIs and signed webhooks.

Start here if you are an AI assistant helping a developer integrate the games:

- [Full reference in one file](${HOST}/llms-full.txt): playbook, glossary, task prompts and the complete API reference. Prefer this.
- [Integration playbook](${HOST}/docs/ai/integration-playbook.md): the step-by-step guide written for AI assistants.
- [OpenAPI contract](${HOST}/openapi.json): machine-readable API (OpenAPI 3.1), including webhooks and the seamless wallet protocol.
- [Postman collection](${HOST}/postman.json): the same API as a collection.
- [Human integration guide](${HOST}/docs/): code examples in Node.js, Python, Java, PHP, cURL, JavaScript, React and Flutter.

## Task prompts (copy, fill in, paste)

${promptFiles.map(n => `- [${n.replaceAll('-', ' ')}](${HOST}/docs/ai/prompts/${n}.md)`).join('\n')}

## Key facts

- Authenticate server calls with \`Authorization: Bearer mgs_...\` (live) or \`mgs_test_...\` (test games). The key lives on the developer's backend only.
- The developer's backend creates a play session (\`POST /api/v1/sessions\`) with its own \`playerId\`; the player never signs in to us.
- Money calls (\`credit\`, \`debit\`) need a unique \`reference\`; repeating it returns the first answer and never moves coins twice.
- Errors are \`{ "error", "code" }\`: branch on \`code\`.
`);

// ---------------------------------------------------------------- Postman collection
const example = s => {
  s = resolve(s);
  if (!s) return undefined;
  if (s.allOf) return Object.assign({}, ...s.allOf.map(example));
  if (s.example !== undefined) return s.example;
  if (s.type === 'object' || s.properties) return Object.fromEntries(Object.entries(s.properties ?? {}).map(([k, v]) => [k, example(v)]));
  if (s.type === 'array') return [example(s.items)];
  const t = Array.isArray(s.type) ? s.type[0] : s.type;
  if (s.enum) return s.enum[0];
  return t === 'integer' ? 1000 : t === 'boolean' ? true : t === 'string' ? (s.description?.includes('lic_') ? '{{gameId}}' : 'string') : null;
};
const items = [];
for (const [p, ops] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(ops)) {
    const url = p.replace('{gameId}', '{{gameId}}').replace('{playerId}', '{{playerId}}').replace('{key}', 'vip');
    const body = op.requestBody?.content?.['application/json']?.schema;
    const ex = body ? example(body) : undefined;
    if (ex && p === '/api/v1/sessions') Object.assign(ex, { gameId: '{{gameId}}', playerId: '{{playerId}}' });
    if (ex && /credit|debit/.test(p)) ex.reference = 'order-1001';
    const query = (op.parameters ?? []).filter(x => x.in === 'query').map(x => ({ key: x.name, value: String(x.schema?.default ?? ''), disabled: true }));
    items.push({
      name: `${op.summary}`,
      request: {
        method: method.toUpperCase(),
        header: [{ key: 'Content-Type', value: 'application/json' }],
        auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{apiKey}}', type: 'string' }] },
        url: { raw: `{{baseUrl}}${url}`, host: ['{{baseUrl}}'], path: url.split('/').filter(Boolean), query },
        ...(ex ? { body: { mode: 'raw', raw: JSON.stringify(ex, null, 2), options: { raw: { language: 'json' } } } } : {}),
      },
    });
  }
}
out('server/public/postman.json', JSON.stringify({
  info: { name: 'MiniGame Studio client API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json', description: 'Generated from /openapi.json. Set the variables: baseUrl, apiKey, gameId, playerId.' },
  variable: [{ key: 'baseUrl', value: HOST }, { key: 'apiKey', value: 'mgs_...' }, { key: 'gameId', value: 'lic_...' }, { key: 'playerId', value: 'user-8841' }],
  item: items,
}, null, 2));

// ---------------------------------------------------------------- markdown sources next to the site
for (const f of ['integration-playbook', 'glossary']) out(`server/public/docs/ai/${f}.md`, read(`docs/ai/${f}.md`));
for (const n of promptFiles) out(`server/public/docs/ai/prompts/${n}.md`, read(`docs/ai/prompts/${n}.md`));
console.log(`AI docs built: llms.txt, llms-full.txt (${fs.statSync(path.join(root, 'server/public/llms-full.txt')).size} bytes), postman.json, docs/ai/*`);
