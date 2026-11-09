// Funciones puras: sin DOM, sin red. Se pueden probar con Node (tests/core.test.js).
const BeatSyncCore = (() => {
  const STORAGE_KEY = 'beatsync-studio-v1';

  const safeTime = n => (Number.isFinite(n) && n >= 0 ? n : null);
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const parseLines = text => text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

  // Mm:ss.cc para la interfaz
  const fmtClock = n => {
    const t = safeTime(n) ?? 0;
    const m = Math.floor(t / 60);
    return `${String(m).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;
  };

  // hh:mm:ss,mmm (SRT) o hh:mm:ss.mmm (VTT)
  const stamp = (n, sep) => {
    const ms = Math.max(0, Math.round(n * 1000));
    const pad = (x, l = 2) => String(x).padStart(l, '0');
    const h = Math.floor(ms / 3600000);
    const m = Math.floor(ms / 60000) % 60;
    const s = Math.floor(ms / 1000) % 60;
    return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
  };

  const makeCue = (text, extra = {}) => ({
    id: newId(), text, start: null, end: null, scene: '', ...extra,
  });

  // Normaliza datos externos (JSON importado, localStorage antiguo)
  const normalizeCue = c => ({
    id: c.id ? String(c.id) : newId(),
    text: String(c.text || ''),
    start: c.start == null ? null : safeTime(Number(c.start)),
    end: c.end == null ? null : safeTime(Number(c.end)),
    scene: String(c.scene || ''),
  });

  // Texto para comparar duplicados: minúsculas, sin acentos ni signos
  const norm = t =>
    String(t ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  // Palabras normalizadas (para comparar letra y transcripción)
  const wordsOf = t => norm(t).split(' ').filter(Boolean);

  // Whisper marca sonidos como [Music], [Applause]... Se quitan del texto.
  // Quita [Music], (upbeat music), (applause)... y los símbolos de nota musical.
  // Solo se borran paréntesis que describen sonidos, por si la letra los usa de verdad.
  const SOUND_TAG = /\((?:[^)]*\b(?:music|applause|laughter|noise|sound|singing|humming)\b[^)]*)\)/gi;
  const cleanText = t =>
    String(t ?? '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(SOUND_TAG, '')
      .replace(/[♪♫]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  // Filas vacías o placeholders de "+ Añadir frase" sin marcar
  const isEmptyCue = c =>
    !norm(c.text) || (c.text.trim() === 'Nueva frase' && (c.start === null || c.start === undefined));

  // Whisper procesa en bloques solapados: la misma frase puede salir dos veces.
  // Se descarta una frase de 3+ palabras si ya está contenida en la anterior o en la siguiente.
  const dedupeCues = cues => {
    const out = [];
    cues.forEach((c, i) => {
      const n = norm(c.text);
      if (n.split(' ').length >= 3) {
        const prev = out[out.length - 1];
        const next = cues[i + 1];
        if (prev && norm(prev.text).includes(n)) return;
        if (next && norm(next.text).includes(n)) return;
      }
      out.push(c);
    });
    return out;
  };

  // Limpieza completa: quita etiquetas, filas vacías y duplicados solapados
  const cleanCues = cues =>
    dedupeCues(
      cues
        .map(c => ({ ...c, text: cleanText(c.text) }))
        .filter(c => !isEmptyCue(c)),
    );

  // Salida de Whisper: [{ timestamp: [start, end], text }]
  const cuesFromChunks = chunks =>
    cleanCues(
      chunks
        .map(c => ({
          text: String(c.text || '').trim(),
          start: safeTime(c.timestamp?.[0]),
          end: safeTime(c.timestamp?.[1]),
        }))
        .filter(c => c.start !== null)
        .map(c => makeCue(c.text, { start: c.start, end: c.end })),
    );

  // Devuelve solo las frases marcadas, ordenadas, con fin válido.
  // Si falta el fin, usa el siguiente comienzo o start + 3 s.
  const timedCues = cues => {
    const timed = cues
      .filter(c => c.start !== null && c.start !== undefined)
      .sort((a, b) => a.start - b.start);
    return timed.map((c, i) => {
      const next = timed[i + 1]?.start;
      const validEnd = c.end !== null && c.end !== undefined && c.end > c.start;
      let end;
      if (validEnd) end = c.end;
      else if (next !== undefined && next > c.start) end = next;
      else end = c.start + 3;
      return { ...c, end };
    });
  };

  const toSrt = cues =>
    timedCues(cues)
      .map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.text}\n`)
      .join('\n');

  const toVtt = cues =>
    'WEBVTT\n\n' +
    timedCues(cues)
      .map(c => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.text}\n`)
      .join('\n');

  const csvField = s => '"' + String(s ?? '').replaceAll('"', '""') + '"';
  const toCsv = cues =>
    'index,start_seconds,end_seconds,lyric,scene\n' +
    cues
      .map((c, i) => [i + 1, c.start ?? '', c.end ?? '', c.text, c.scene].map(csvField).join(','))
      .join('\n');

  // Alineación de letra conocida con palabras transcritas (con tiempos por palabra).
  // lines: array de líneas de la letra. words: [{ text, start, end }] de Whisper.
  // Usa LCS sobre palabras normalizadas: cada palabra de la letra que aparece en el audio
  // ancla la línea. Las líneas sin ancla se estiman entre sus vecinas.
  const alignLyrics = (lines, words) => {
    const lyric = [];
    lines.forEach((line, li) => wordsOf(line).forEach(w => lyric.push({ w, li })));
    const asr = [];
    words.forEach(x => {
      if (safeTime(x.start) === null) return;
      wordsOf(x.text).forEach(w => asr.push({ w, start: x.start, end: safeTime(x.end) ?? x.start }));
    });

    // Tabla LCS
    const n = lyric.length, m = asr.length;
    const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        dp[i][j] = lyric[i - 1].w === asr[j - 1].w
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
    // Recuperar pares coincidentes
    const matches = Array.from({ length: lines.length }, () => []);
    let i = n, j = m;
    while (i > 0 && j > 0) {
      if (lyric[i - 1].w === asr[j - 1].w) {
        matches[lyric[i - 1].li].push(asr[j - 1]);
        i--; j--;
      } else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
      else j--;
    }

    // Tiempos por línea; las no encontradas se estiman entre vecinas
    const times = matches.map(list => {
      if (!list.length) return null;
      return { start: Math.min(...list.map(x => x.start)), end: Math.max(...list.map(x => x.end)) };
    });
    let estimated = 0;
    const cues = lines.map((text, k) => {
      const hit = times[k];
      if (hit) return { text, start: hit.start, end: hit.end, confidence: matches[k].length / wordsOf(text).length };
      estimated++;
      const prevEnd = [...times.slice(0, k)].reverse().find(t => t)?.end ?? 0;
      const nextStart = times.slice(k + 1).find(t => t)?.start;
      const start = prevEnd;
      const end = nextStart !== undefined && nextStart > start ? nextStart : start + 2;
      return { text, start, end, confidence: 0 };
    });
    const matchedLines = times.filter(Boolean).length;
    return { cues, matchedLines, estimated };
  };

  return {
    alignLyrics, STORAGE_KEY, safeTime, newId, parseLines, fmtClock, makeCue, normalizeCue,
    cuesFromChunks, cleanCues, cleanText, isEmptyCue, dedupeCues, timedCues, toSrt, toVtt, toCsv,
  };
})();

if (typeof module !== 'undefined') module.exports = BeatSyncCore;
