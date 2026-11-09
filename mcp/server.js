#!/usr/bin/env node
// Servidor MCP para BeatSync Studio.
// Trabaja sobre los mismos archivos JSON que exporta la app (formato beatsync-studio v2),
// así que puedes editar con IA y abrir el resultado en el navegador, o al revés.
import { createRequire } from 'node:module';
import { readFile, writeFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// Reutiliza la lógica de la app (js/core.js es CommonJS-compatible)
const require = createRequire(import.meta.url);
const Core = require('../js/core.js');

const FORMAT = 'beatsync-studio';
const VERSION = 2;

const server = new McpServer({ name: 'beatsync-studio', version: '0.1.0' });

// ---------- Utilidades de proyecto ----------

const resolveFile = file => path.resolve(process.cwd(), file);

async function exists(file) {
  try {
    await access(file, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function loadProject(file) {
  const raw = JSON.parse(await readFile(resolveFile(file), 'utf8'));
  if (!Array.isArray(raw.cues)) throw new Error('El archivo no contiene un array "cues".');
  return {
    name: String(raw.name || 'Proyecto'),
    cues: raw.cues.map(Core.normalizeCue),
  };
}

async function saveProject(file, project) {
  const data = { format: FORMAT, version: VERSION, name: project.name, cues: project.cues };
  await writeFile(resolveFile(file), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// La app numera las frases desde 1; el MCP hace lo mismo para que coincidan
function checkIndex(project, index) {
  if (index < 1 || index > project.cues.length) {
    throw new Error(`Índice ${index} fuera de rango (el proyecto tiene ${project.cues.length} frases).`);
  }
  return index - 1;
}

const text = t => ({ content: [{ type: 'text', text: t }] });
const json = v => text(JSON.stringify(v, null, 2));

// Envuelve cada herramienta: los errores vuelven al cliente en lugar de tumbar el servidor
function tool(name, description, schema, handler) {
  server.registerTool(name, { description, inputSchema: schema }, async args => {
    try {
      return await handler(args);
    } catch (err) {
      return { content: [{ type: 'text', text: 'Error: ' + err.message }], isError: true };
    }
  });
}

const fileParam = z.string().describe('Ruta al archivo .json del proyecto (formato de BeatSync Studio)');
const timeParam = z.number().min(0).nullable().optional().describe('Segundos desde el inicio del audio');

// ---------- Herramientas ----------

tool(
  'create_project',
  'Crea un proyecto vacío de BeatSync en un archivo JSON. Falla si el archivo ya existe.',
  { file: fileParam, name: z.string().default('Mi videoclip') },
  async ({ file, name }) => {
    if (await exists(resolveFile(file))) throw new Error('El archivo ya existe; elige otra ruta.');
    await saveProject(file, { name, cues: [] });
    return text(`Proyecto "${name}" creado en ${resolveFile(file)}.`);
  },
);

tool(
  'get_project',
  'Devuelve el nombre y todas las frases del proyecto, con índice (empezando en 1), tiempos y escena.',
  { file: fileParam },
  async ({ file }) => {
    const p = await loadProject(file);
    return json({
      name: p.name,
      count: p.cues.length,
      cues: p.cues.map((c, i) => ({ index: i + 1, text: c.text, start: c.start, end: c.end, scene: c.scene })),
    });
  },
);

tool(
  'import_lyrics',
  'Sustituye todas las frases del proyecto por las líneas de texto dadas (una frase por línea). Los tiempos se pierden.',
  { file: fileParam, lyrics: z.string().describe('Letra o guion: una frase por línea') },
  async ({ file, lyrics }) => {
    const p = await loadProject(file);
    p.cues = Core.parseLines(lyrics).map(line => Core.makeCue(line));
    await saveProject(file, p);
    return text(`${p.cues.length} frases importadas. Los tiempos están vacíos: marca o alinea después.`);
  },
);

tool(
  'add_cue',
  'Añade una frase al final del proyecto. start y end son opcionales (en segundos).',
  {
    file: fileParam,
    text: z.string().min(1),
    start: timeParam,
    end: timeParam,
    scene: z.string().optional(),
  },
  async ({ file, text: line, start, end, scene }) => {
    const p = await loadProject(file);
    p.cues.push(Core.makeCue(line, { start: start ?? null, end: end ?? null, scene: scene ?? '' }));
    await saveProject(file, p);
    return text(`Frase ${p.cues.length} añadida.`);
  },
);

tool(
  'update_cue',
  'Modifica una frase existente por su índice (empezando en 1). Solo cambia los campos que pases.',
  {
    file: fileParam,
    index: z.number().int().min(1),
    text: z.string().optional(),
    start: timeParam,
    end: timeParam,
    scene: z.string().optional(),
  },
  async ({ file, index, text: line, start, end, scene }) => {
    const p = await loadProject(file);
    const cue = p.cues[checkIndex(p, index)];
    if (line !== undefined) cue.text = line;
    if (start !== undefined) cue.start = start;
    if (end !== undefined) cue.end = end;
    if (scene !== undefined) cue.scene = scene;
    await saveProject(file, p);
    return json({ index, text: cue.text, start: cue.start, end: cue.end, scene: cue.scene });
  },
);

tool(
  'delete_cue',
  'Elimina una frase por su índice (empezando en 1).',
  { file: fileParam, index: z.number().int().min(1) },
  async ({ file, index }) => {
    const p = await loadProject(file);
    const [removed] = p.cues.splice(checkIndex(p, index), 1);
    await saveProject(file, p);
    return text(`Frase eliminada: "${removed.text}". Quedan ${p.cues.length}.`);
  },
);

tool(
  'clean_cues',
  'Limpia el proyecto: quita etiquetas como [Music] o (upbeat music), filas vacías y duplicados solapados.',
  { file: fileParam },
  async ({ file }) => {
    const p = await loadProject(file);
    const before = p.cues.length;
    p.cues = Core.cleanCues(p.cues);
    await saveProject(file, p);
    return text(`Limpieza hecha: ${before - p.cues.length} frases eliminadas, ${p.cues.length} quedan.`);
  },
);

tool(
  'export_subtitles',
  'Genera subtítulos (SRT, VTT) o CSV a partir de las frases marcadas. Si pasas out, también los guarda en ese archivo.',
  {
    file: fileParam,
    format: z.enum(['srt', 'vtt', 'csv']),
    out: z.string().optional().describe('Ruta de salida opcional'),
  },
  async ({ file, format, out }) => {
    const p = await loadProject(file);
    const timed = p.cues.filter(c => c.start !== null);
    if (format !== 'csv' && !timed.length) throw new Error('No hay frases con tiempo para exportar.');
    const output = format === 'srt' ? Core.toSrt(timed)
      : format === 'vtt' ? Core.toVtt(timed)
      : Core.toCsv(p.cues);
    if (out) await writeFile(resolveFile(out), output, 'utf8');
    return text(out ? `Guardado en ${resolveFile(out)}.\n\n${output}` : output);
  },
);

// ---------- Arranque ----------

const transport = new StdioServerTransport();
await server.connect(transport);
