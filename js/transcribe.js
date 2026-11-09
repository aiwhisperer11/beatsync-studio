// Transcripción Whisper en el navegador (sin backend, sin coste de API).
// El trabajo pesado corre en js/transcribe-worker.js para no bloquear la página.
const BeatSyncTranscribe = (() => {
  let worker = null;
  let seq = 0;
  const pending = new Map(); // id -> { resolve, reject, onStatus }

  function getWorker() {
    if (worker) return worker;
    worker = new Worker('js/transcribe-worker.js', { type: 'module' });
    worker.onmessage = e => {
      const { id, type } = e.data;
      const job = pending.get(id);
      if (!job) return;
      if (type === 'status') job.onStatus(e.data.text);
      else if (type === 'result') {
        pending.delete(id);
        job.resolve(e.data.chunks);
      } else if (type === 'error') {
        pending.delete(id);
        job.reject(new Error(e.data.message));
      }
    };
    worker.onerror = e => {
      // Si el worker se cae (p. ej. no se pudo cargar el script), avisamos a todos los trabajos pendientes
      for (const job of pending.values()) job.reject(new Error('El motor de transcripción falló: ' + (e.message || 'error desconocido')));
      pending.clear();
      worker = null;
    };
    return worker;
  }

  // Los workers no tienen AudioContext, así que el audio se decodifica aquí, a 16 kHz mono,
  // y se transfiere al worker como Float32Array (sin copiarlo).
  async function decodeAudio(audioUrl, onStatus) {
    onStatus('Preparando audio…');
    const data = await (await fetch(audioUrl)).arrayBuffer();
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    try {
      const decoded = await ctx.decodeAudioData(data);
      return decoded.getChannelData(0);
    } finally {
      ctx.close();
    }
  }

  // Devuelve chunks: [{ timestamp: [start, end], text }]
  // words: true devuelve un chunk por palabra (necesario para alinear letra conocida)
  function transcribe(audioUrl, { model = 'Xenova/whisper-base', language = 'auto', words = false, onStatus = () => {} } = {}) {
    return decodeAudio(audioUrl, onStatus).then(audio => new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject, onStatus });
      getWorker().postMessage({ id, audio, model, language, words }, [audio.buffer]);
    }));
  }

  return { transcribe };
})();

if (typeof module !== 'undefined') module.exports = BeatSyncTranscribe;
