// Worker de transcripción: corre Whisper fuera del hilo principal para que la página no se congele.
// Lo carga js/transcribe.js con new Worker(..., { type: 'module' }).
const LIB_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/dist/transformers.min.js';

let pipelinePromise = null;
let loadedModel = null;

async function getPipeline(model, reply) {
  if (loadedModel !== model) {
    pipelinePromise = null;
    loadedModel = null;
  }
  if (!pipelinePromise) {
    reply({ type: 'status', text: 'Cargando modelo (la primera vez tarda más)…' });
    const { pipeline } = await import(LIB_URL);
    pipelinePromise = pipeline('automatic-speech-recognition', model, {
      progress_callback: p => {
        if (p.status === 'progress') reply({ type: 'status', text: `Descargando modelo… ${Math.round(p.progress)}%` });
      },
    }).catch(err => {
      pipelinePromise = null; // permite reintentar
      throw err;
    });
    loadedModel = model;
  }
  return pipelinePromise;
}

self.onmessage = async e => {
  const { id, audio, model, language, words } = e.data; // audio: Float32Array 16 kHz mono
  const reply = msg => self.postMessage({ id, ...msg });
  try {
    const asr = await getPipeline(model, reply);
    reply({ type: 'status', text: 'Transcribiendo en tu navegador. Puede tardar varios minutos con audios largos…' });
    const options = {
      return_timestamps: words ? 'word' : true,
      chunk_length_s: 30,
      stride_length_s: 5,
    };
    if (language !== 'auto') options.language = language; // 'spanish' | 'english'
    const result = await asr(audio, options);
    reply({ type: 'result', chunks: result.chunks ?? [] });
  } catch (err) {
    reply({ type: 'error', message: err.message });
  }
};
