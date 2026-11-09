// Transcripción Whisper en el navegador (sin backend, sin coste de API).
const BeatSyncTranscribe = (() => {
  // Versión fijada para que la app no cambie sin aviso.
  const LIB_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/dist/transformers.min.js';
  let libPromise = null;
  const pipelines = new Map();

  const loadLib = () => (libPromise ??= import(LIB_URL));

  async function getPipeline(model, onStatus) {
    if (!pipelines.has(model)) {
      const promise = loadLib()
        .then(({ pipeline }) =>
          pipeline('automatic-speech-recognition', model, {
            progress_callback: p => {
              if (p.status === 'progress') onStatus(`Descargando modelo… ${Math.round(p.progress)}%`);
            },
          }),
        )
        .catch(err => {
          pipelines.delete(model); // permite reintentar
          throw err;
        });
      pipelines.set(model, promise);
    }
    return pipelines.get(model);
  }

  // Devuelve chunks: [{ timestamp: [start, end], text }]
  // words: true devuelve un chunk por palabra (necesario para alinear letra conocida)
  async function transcribe(audioUrl, { model = 'Xenova/whisper-base', language = 'auto', words = false, onStatus = () => {} } = {}) {
    onStatus('Cargando modelo (la primera vez tarda más)…');
    const asr = await getPipeline(model, onStatus);
    onStatus('Transcribiendo en tu navegador. Puede tardar varios minutos con audios largos…');
    const options = {
      return_timestamps: words ? 'word' : true,
      chunk_length_s: 30,
      stride_length_s: 5,
    };
    if (language !== 'auto') options.language = language; // 'spanish' | 'english'
    const result = await asr(audioUrl, options);
    return result.chunks ?? [];
  }

  return { transcribe };
})();

if (typeof module !== 'undefined') module.exports = BeatSyncTranscribe;
