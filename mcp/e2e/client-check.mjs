// Prueba de extremo a extremo: lanza el servidor con el cliente MCP oficial del SDK
// y ejecuta un flujo completo, igual que lo haría un asistente de IA.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const serverPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../server.js');
const dir = await mkdtemp(path.join(tmpdir(), 'beatsync-mcp-'));
const file = path.join(dir, 'proyecto.json');

const client = new Client({ name: 'beatsync-check', version: '0.0.0' });
await client.connect(new StdioClientTransport({ command: 'node', args: [serverPath], cwd: dir }));

try {
  const { tools } = await client.listTools();
  assert.equal(tools.length, 8, 'deben existir 8 herramientas');

  const call = async (name, args) => {
    const r = await client.callTool({ name, arguments: args });
    return { text: r.content[0].text, isError: Boolean(r.isError) };
  };

  let r = await call('create_project', { file, name: 'Check' });
  assert.equal(r.isError, false);

  r = await call('import_lyrics', { file, lyrics: 'one two three\nfour five six\nfour five six' });
  assert.equal(r.isError, false);

  r = await call('update_cue', { file, index: 1, start: 1, end: 2 });
  assert.equal(r.isError, false);

  // Un índice fuera de rango debe devolver error al cliente, no tumbar el servidor
  r = await call('update_cue', { file, index: 99, start: 1 });
  assert.equal(r.isError, true);

  // La frase duplicada se elimina: de 3 frases quedan 2
  r = await call('clean_cues', { file });
  assert.match(r.text, /2 quedan/);

  r = await call('export_subtitles', { file, format: 'srt' });
  assert.match(r.text, /00:00:01,000 --> 00:00:02,000/);

  console.log('OK: 8 herramientas listadas y flujo completo ejecutado por un cliente MCP');
} finally {
  await client.close();
}
