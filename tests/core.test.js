const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/core.js');
const Whisper = require('../js/transcribe.js');

test('parseLines ignora líneas vacías y espacios', () => {
  assert.deepEqual(C.parseLines('  Hola \r\n\n  \nmundo'), ['Hola', 'mundo']);
});

test('fmtClock muestra mm:ss.cc', () => {
  assert.equal(C.fmtClock(75.5), '01:15.50');
  assert.equal(C.fmtClock(null), '00:00.00');
});

test('cuesFromChunks convierte chunks de Whisper en frases', () => {
  const cues = C.cuesFromChunks([
    { timestamp: [0, 2.5], text: ' Hi, I am ' },
    { timestamp: [2.5, 5], text: 'building things.' },
    { timestamp: [6, null], text: '' },
  ]);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, 'Hi, I am');
  assert.equal(cues[0].start, 0);
  assert.equal(cues[0].end, 2.5);
  assert.ok(cues[0].id);
});

test('toSrt usa fin explícito, luego siguiente comienzo, y +3 s al final', () => {
  const srt = C.toSrt([
    { text: 'A', start: 1, end: 2 },
    { text: 'B', start: 3, end: null },
    { text: 'C', start: 4, end: null },
    { text: 'sin marcar', start: null, end: null },
  ]);
  assert.match(srt, /^1\n00:00:01,000 --> 00:00:02,000\nA\n/);
  assert.match(srt, /2\n00:00:03,000 --> 00:00:04,000\nB\n/);
  assert.match(srt, /3\n00:00:04,000 --> 00:00:07,000\nC\n/);
  assert.ok(!srt.includes('sin marcar'));
});

test('toVtt tiene cabecera y puntos en milisegundos', () => {
  const vtt = C.toVtt([{ text: 'Hola', start: 61.25, end: 63 }]);
  assert.ok(vtt.startsWith('WEBVTT\n\n'));
  assert.ok(vtt.includes('00:01:01.250 --> 00:01:03.000\nHola'));
});

test('toCsv escapa comillas', () => {
  const csv = C.toCsv([{ text: 'Di "hola"', start: 1, end: 2, scene: '' }]);
  assert.ok(csv.includes('"Di ""hola"""'));
});

test('normalizeCue tolera datos incompletos', () => {
  const c = C.normalizeCue({ text: 42, start: '3.5' });
  assert.equal(c.text, '42');
  assert.equal(c.start, 3.5);
  assert.equal(c.end, null);
  assert.ok(c.id);
});

test('transcribe está expuesto como función', () => {
  assert.equal(typeof Whisper.transcribe, 'function');
});

test('cleanCues borra frases vacías y placeholders sin marcar', () => {
  const out = C.cleanCues([
    { text: 'Una frase con tiempo', start: 1, end: 2 },
    { text: '   ', start: null, end: null },
    { text: 'Nueva frase', start: null, end: null },
    { text: 'Nueva frase', start: 5, end: 6 }, // el usuario la editó con tiempo: se conserva
  ]);
  assert.deepEqual(out.map(c => c.text), ['Una frase con tiempo', 'Nueva frase']);
});

test('cleanText quita etiquetas de Whisper como [Music]', () => {
  assert.equal(C.cleanText('[Music] the quick brown fox jumps [Applause]'), 'the quick brown fox jumps');
});

test('dedupeCues descarta la frase repetida por solape de bloques', () => {
  const out = C.dedupeCues([
    { text: 'alpha beta gamma delta epsilon', start: 1 },
    { text: 'alpha beta gamma', start: 2 },
    { text: 'gamma delta epsilon', start: 3 },
    { text: 'over the lazy dog', start: 4 },
  ]);
  assert.deepEqual(out.map(c => c.text), ['alpha beta gamma delta epsilon', 'over the lazy dog']);
});

test('dedupeCues no descarta frases cortas como "Well"', () => {
  const out = C.dedupeCues([
    { text: 'Well', start: 1 },
    { text: 'Well', start: 2 },
  ]);
  assert.equal(out.length, 2);
});

test('cuesFromChunks aplica la limpieza completa', () => {
  const cues = C.cuesFromChunks([
    { timestamp: [0, 2], text: '[Music]' },
    { timestamp: [2, 4], text: 'the quick brown fox jumps' },
    { timestamp: [4, 6], text: 'the quick brown fox jumps' },
    { timestamp: [6, 8], text: 'one more generic sentence here' },
  ]);
  assert.deepEqual(cues.map(c => c.text), ['the quick brown fox jumps', 'one more generic sentence here']);
});

// Palabras simuladas de Whisper: una palabra por elemento con su tiempo
const w = (text, start) => ({ text, start, end: start + 0.4 });

test('alignLyrics asigna inicio y fin de cada línea a partir de las palabras', () => {
  const lines = ['the quick brown fox jumps', 'over the lazy dog'];
  const words = [
    w(' the', 1), w(' quick', 1.5), w(' brown', 2), w(' fox', 2.5), w(' jumps', 3),
    w(' over', 5), w(' the', 5.4), w(' lazy', 5.8), w(' dog', 6.2),
  ];
  const r = C.alignLyrics(lines, words);
  assert.equal(r.matchedLines, 2);
  assert.equal(r.estimated, 0);
  assert.equal(r.cues[0].start, 1);
  assert.equal(r.cues[0].end, 3.4);
  assert.equal(r.cues[1].start, 5);
  assert.equal(r.cues[1].confidence, 1);
});

test('alignLyrics ignora mayúsculas y acentos al comparar', () => {
  const r = C.alignLyrics(['Canción bonita'], [w(' cancion', 2), w(' BONITA', 2.5)]);
  assert.equal(r.matchedLines, 1);
  assert.equal(r.cues[0].start, 2);
});

test('alignLyrics estima las líneas que no aparecen entre sus vecinas', () => {
  const lines = ['first line here', 'this one is missing', 'last line here'];
  const words = [w(' first', 1), w(' line', 1.5), w(' here', 2), w(' last', 9), w(' line', 9.5), w(' here', 10)];
  const r = C.alignLyrics(lines, words);
  assert.equal(r.matchedLines, 2);
  assert.equal(r.estimated, 1);
  assert.equal(r.cues[1].confidence, 0);
  assert.ok(r.cues[1].start >= 2 && r.cues[1].end <= 9);
});

test('cleanText quita (upbeat music) y notas ♪ pero conserva paréntesis de letra', () => {
  assert.equal(C.cleanText('(upbeat music)'), '');
  assert.equal(C.cleanText('Sample line, ♪ another generic song line ♪'), 'Sample line, another generic song line');
  assert.equal(C.cleanText('Oops (yeah, you know) right'), 'Oops (yeah, you know) right');
});
