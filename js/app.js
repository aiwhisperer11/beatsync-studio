'use strict';
const $ = id => document.getElementById(id);
const player = $('player');
const {
  STORAGE_KEY, safeTime, makeCue, normalizeCue, parseLines, fmtClock,
  toSrt, toVtt, toCsv,
} = BeatSyncCore;

let state = { name: 'Mi videoclip', cues: [], selected: 0 };
let audioUrl = null;
let pendingImageCueId = null;
const thumbUrls = new Map(); // cueId -> object URL (se revoca en cada render)

function notice(text) { $('message').textContent = text; }

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    notice('El navegador no permite guardar automáticamente. Exporta el JSON.');
  }
}

function download(data, filename, mime) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = () => ($('projectName').value || 'beatsync-project').trim().replace(/[^\p{L}\p{N}-]+/gu, '_').slice(0, 80);

// ---------- Tabla ----------

function render() {
  for (const url of thumbUrls.values()) URL.revokeObjectURL(url);
  thumbUrls.clear();
  const body = $('cueRows');
  body.replaceChildren();
  state.cues.forEach((cue, i) => body.append(rowFor(cue, i)));
  updateActive();
}

function rowFor(cue, i) {
  const tr = document.createElement('tr');
  if (i === state.selected) tr.className = 'active';
  tr.addEventListener('click', e => {
    if (!['INPUT', 'BUTTON'].includes(e.target.tagName)) {
      state.selected = i;
      persist();
      render();
    }
  });
  tr.append(textCell(String(i + 1)));
  tr.append(inputCell(cue, 'start', i));
  tr.append(inputCell(cue, 'end', i));
  tr.append(inputCell(cue, 'text', i));
  tr.append(inputCell(cue, 'scene', i));
  tr.append(imageCell(cue, i));
  tr.append(deleteCell(cue, i));
  return tr;
}

function textCell(content) {
  const td = document.createElement('td');
  td.textContent = content;
  return td;
}

const FIELD_LABELS = { start: 'inicio', end: 'fin', text: 'frase', scene: 'escena' };

function inputCell(cue, field, i) {
  const td = document.createElement('td');
  const inp = document.createElement('input');
  inp.setAttribute('aria-label', `${FIELD_LABELS[field]} de frase ${i + 1}`);
  inp.value = (field === 'start' || field === 'end') ? (cue[field] ?? '') : cue[field];
  inp.addEventListener('focus', () => { state.selected = i; updateActive(); });
  inp.addEventListener('change', () => {
    if (field === 'start' || field === 'end') {
      cue[field] = inp.value.trim() === '' ? null : safeTime(Number(inp.value));
    } else {
      cue[field] = inp.value;
    }
    persist();
    render();
  });
  td.append(inp);
  return td;
}

function button(label, className, title, onClick) {
  const btn = document.createElement('button');
  btn.className = className;
  btn.textContent = label;
  btn.title = title;
  btn.setAttribute('aria-label', title);
  btn.addEventListener('click', onClick);
  return btn;
}

function imageCell(cue, i) {
  const td = document.createElement('td');
  td.className = 'imagecell';
  const holder = document.createElement('div');
  holder.className = 'thumb';
  td.append(
    holder,
    button('🖼', 'smallbtn', `Subir imagen para la frase ${i + 1}`, () => {
      pendingImageCueId = cue.id;
      $('imageFile').click();
    }),
    button('🎞', 'smallbtn', `Capturar fotograma actual para la frase ${i + 1}`, () => captureFrame(cue)),
  );
  BeatSyncImages.get(cue.id).then(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    thumbUrls.set(cue.id, url);
    const img = document.createElement('img');
    img.src = url;
    img.alt = `Imagen de la frase ${i + 1}`;
    holder.append(img);
  }).catch(() => {});
  return td;
}

function deleteCell(cue, i) {
  const td = document.createElement('td');
  td.append(button('×', 'smallbtn delete', 'Eliminar frase', () => {
    state.cues.splice(i, 1);
    state.selected = Math.min(state.selected, Math.max(0, state.cues.length - 1));
    BeatSyncImages.remove(cue.id).catch(() => {});
    persist();
    render();
  }));
  return td;
}

function updateActive() {
  const c = state.cues[state.selected];
  $('activeBox').textContent = c
    ? `Frase ${state.selected + 1}/${state.cues.length} · ${c.text} ${c.start !== null ? '· ' + fmtClock(c.start) : '· Sin marcar'}`
    : 'Importa tu letra o transcribe el audio para empezar.';
  $('progress').textContent = `${state.cues.filter(c => c.start !== null).length} / ${state.cues.length} marcadas`;
  const d = Number.isFinite(player.duration) ? player.duration : 0;
  $('clock').textContent = `${fmtClock(player.currentTime)} / ${fmtClock(d)}`;
}

function choose(delta) {
  if (!state.cues.length) return;
  state.selected = Math.min(state.cues.length - 1, Math.max(0, state.selected + delta));
  persist();
  render();
  $('cueRows').children[state.selected]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function mark() {
  if (!state.cues.length) return notice('Primero importa la letra o transcribe el audio.');
  if (!player.src) return notice('Primero carga un archivo de audio o video.');
  state.cues[state.selected].start = Number(player.currentTime.toFixed(2));
  persist();
  choose(1);
}

// ---------- Imágenes ----------

async function captureFrame(cue) {
  if (!player.videoWidth) {
    return notice('Este archivo es solo audio. Usa 🖼 para subir una imagen.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = player.videoWidth;
  canvas.height = player.videoHeight;
  canvas.getContext('2d').drawImage(player, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  await BeatSyncImages.put(cue.id, blob);
  render();
  notice(`Fotograma guardado en la frase ${state.cues.indexOf(cue) + 1}.`);
}

$('imageFile').addEventListener('change', async e => {
  const file = e.target.files?.[0];
  const cue = state.cues.find(c => c.id === pendingImageCueId);
  e.target.value = '';
  pendingImageCueId = null;
  if (!file || !cue) return;
  await BeatSyncImages.put(cue.id, file);
  render();
  notice('Imagen guardada en la frase.');
});

// ---------- Audio / video ----------

$('audioFile').addEventListener('change', e => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = URL.createObjectURL(file);
  player.src = audioUrl;
  notice(`Archivo cargado localmente: ${file.name}`);
});

player.addEventListener('loadedmetadata', () => {
  player.classList.toggle('audio-only', player.videoWidth === 0);
  updateActive();
});
player.addEventListener('timeupdate', updateActive);

// ---------- Transcripción y letra ----------

$('transcribeBtn').addEventListener('click', async () => {
  if (!audioUrl) return notice('Primero carga un audio o video.');
  if (state.cues.length && !confirm('Esto reemplazará las frases y sus tiempos actuales. ¿Continuar?')) return;
  const btn = $('transcribeBtn');
  btn.disabled = true;
  try {
    const chunks = await BeatSyncTranscribe.transcribe(audioUrl, {
      model: $('modelSelect').value,
      language: $('langSelect').value,
      onStatus: notice,
    });
    const cues = BeatSyncCore.cuesFromChunks(chunks);
    if (!cues.length) return notice('No se detectó voz. Prueba el modelo "small" o revisa el audio.');
    state.cues = cues;
    state.selected = 0;
    persist();
    render();
    notice(`${cues.length} frases transcritas. Revisa el texto y los tiempos antes de exportar.`);
  } catch (err) {
    notice('No se pudo transcribir: ' + err.message);
  } finally {
    btn.disabled = false;
  }
});

$('loadLyrics').addEventListener('click', () => {
  const rows = parseLines($('lyrics').value);
  if (!rows.length) return notice('Escribe una frase por línea.');
  if (state.cues.length && !confirm('Esto reemplazará las frases y sus tiempos actuales. ¿Continuar?')) return;
  state.cues = rows.map(text => makeCue(text));
  state.selected = 0;
  persist();
  render();
  notice(`${rows.length} frases creadas. Reproduce el audio y pulsa M al escuchar cada comienzo.`);
});

$('projectName').addEventListener('input', e => { state.name = e.target.value; persist(); });
$('markBtn').addEventListener('click', mark);
$('prevBtn').addEventListener('click', () => choose(-1));
$('nextBtn').addEventListener('click', () => choose(1));
$('addRow').addEventListener('click', () => {
  state.cues.push(makeCue('Nueva frase'));
  state.selected = state.cues.length - 1;
  persist();
  render();
});
$('cleanBtn').addEventListener('click', () => {
  const before = state.cues.length;
  state.cues = BeatSyncCore.cleanCues(state.cues);
  state.selected = Math.min(state.selected, Math.max(0, state.cues.length - 1));
  persist();
  render();
  notice(`Limpieza hecha: ${before - state.cues.length} frases eliminadas (${state.cues.length} quedan).`);
});
$('sortBtn').addEventListener('click', () => {
  state.cues.sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));
  state.selected = 0;
  persist();
  render();
});

$('newBtn').addEventListener('click', () => {
  if (!confirm('¿Crear un proyecto nuevo? Exporta antes el JSON si quieres conservarlo.')) return;
  state = { name: 'Mi videoclip', cues: [], selected: 0 };
  $('projectName').value = state.name;
  $('lyrics').value = '';
  player.removeAttribute('src');
  player.load();
  $('audioFile').value = '';
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = null;
  persist();
  render();
  notice('Proyecto nuevo creado. Las imágenes guardadas siguen en este navegador hasta que borres las frases.');
});

// ---------- Exportar / importar ----------

$('saveJson').addEventListener('click', () => download(
  JSON.stringify({ format: 'beatsync-studio', version: 2, name: state.name, cues: state.cues }, null, 2),
  slug() + '.json', 'application/json',
));

$('loadJsonBtn').addEventListener('click', () => $('jsonFile').click());
$('jsonFile').addEventListener('change', async e => {
  try {
    const raw = JSON.parse(await e.target.files[0].text());
    if (!Array.isArray(raw.cues)) throw Error('El JSON no contiene frases');
    state = {
      name: String(raw.name || 'Proyecto importado'),
      cues: raw.cues.map(normalizeCue),
      selected: 0,
    };
    $('projectName').value = state.name;
    $('lyrics').value = state.cues.map(c => c.text).join('\n');
    persist();
    render();
    notice('Proyecto importado. Vuelve a cargar el audio para escucharlo.');
  } catch (err) {
    notice('No se pudo importar: ' + err.message);
  }
  e.target.value = '';
});

function exportTimed(makeText, extension, mime, emptyMessage) {
  if (!state.cues.some(c => c.start !== null)) return notice(emptyMessage);
  download(makeText(state.cues), slug() + extension, mime);
}

$('saveCsv').addEventListener('click', () =>
  download(toCsv(state.cues), slug() + '.csv', 'text/csv;charset=utf-8'));
$('saveSrt').addEventListener('click', () =>
  exportTimed(toSrt, '.srt', 'text/plain;charset=utf-8', 'Marca o transcribe al menos una frase para exportar SRT.'));
$('saveVtt').addEventListener('click', () =>
  exportTimed(toVtt, '.vtt', 'text/vtt;charset=utf-8', 'Marca o transcribe al menos una frase para exportar VTT.'));

// ---------- Teclado ----------

document.addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(document.activeElement?.tagName)) return;
  const k = e.key.toLowerCase();
  if (e.code === 'Space') {
    e.preventDefault();
    if (player.src) player.paused ? player.play() : player.pause();
  } else if (k === 'm') {
    e.preventDefault();
    mark();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    choose(-1);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    choose(1);
  } else if (k === 'j') {
    const c = state.cues[state.selected];
    if (c?.start !== null && c?.start !== undefined && player.src) player.currentTime = c.start;
  }
});

// ---------- Arranque ----------

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (saved && Array.isArray(saved.cues)) {
    state = {
      name: saved.name || 'Mi videoclip',
      cues: saved.cues.map(normalizeCue),
      selected: Math.max(0, Math.min(saved.selected || 0, saved.cues.length - 1)),
    };
    $('projectName').value = state.name;
    $('lyrics').value = state.cues.map(c => c.text).join('\n');
  }
} catch {
  // localStorage vacío o dañado: empezamos de cero
}
render();
