const sharp = require('sharp');

// Lee la foto de una planilla de juego con Gemini y devuelve los jugadores de cada equipo.
// La herramienta solo propone: la mesa confirma. Se puede cambiar de modelo con GEMINI_MODEL.
const MODEL = () => process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const TIMEOUT_MS = 60000;

const TEAM = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    players: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          number: { type: 'STRING' },
          name: { type: 'STRING' },
          dni: { type: 'STRING' },
          signed: { type: 'BOOLEAN' },
        },
        required: ['name', 'dni', 'signed'],
      },
    },
  },
  required: ['name', 'players'],
};

const SCHEMA = {
  type: 'OBJECT',
  properties: { teamA: TEAM, teamB: TEAM, date: { type: 'STRING' }, time: { type: 'STRING' } },
  required: ['teamA', 'teamB'],
};

const PROMPT = `Esta es la foto de una "Planilla de juego" de dodgeball (Dodgeball Argentina).
Arriba están EQUIPO A y EQUIPO B con sus nombres, la fecha y la hora.
Hay dos tablas lado a lado: la izquierda es el equipo A y la derecha el equipo B. Cada fila tiene: Nº, NOMBRE Y APELLIDO, DNI, FIRMA y casillas de sanciones.
Extraé SOLO las filas que tengan un nombre. Ignorá las filas vacías.
Para cada jugador devolvé:
- number: el número de la columna Nº si hay uno escrito; si no, cadena vacía.
- name: nombre y apellido tal como está escrito.
- dni: solo los dígitos del DNI, sin puntos ni espacios. Si no se lee con seguridad, cadena vacía. No inventes dígitos.
- signed: true únicamente si en la celda FIRMA de esa fila hay una firma o trazo hecho a mano. Si la celda está vacía, false.
Devolvé también date (DD/MM/AAAA) y time (HH:MM) si se leen, o cadena vacía.
No incluyas DT, asistentes ni shaggers: solo la lista de jugadores.`;

// Achica y endereza la foto para mandarla (el original se guarda aparte, sin tocar)
async function forModel(buffer) {
  return sharp(buffer).rotate().resize(2000, 2000, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Modelos de respaldo si el principal está saturado (GEMINI_FALLBACK_MODELS, separados por coma)
const models = () => [MODEL(), ...(process.env.GEMINI_FALLBACK_MODELS || 'gemini-3.5-flash,gemini-3.5-flash-lite').split(',').map((m) => m.trim()).filter(Boolean)]
  .filter((m, i, a) => a.indexOf(m) === i);

async function callModel(model, key, img) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: 'image/jpeg', data: img.toString('base64') } }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA },
      }),
    });
    const json = await res.json().catch(() => null);
    return { res, json };
  } finally {
    clearTimeout(timer);
  }
}

async function readSheet(buffer) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Falta GEMINI_API_KEY en el servidor');
  const img = await forModel(buffer);
  let lastErr;
  for (const model of models()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) await sleep(2500);
      let out;
      try { out = await callModel(model, key, img); } catch (e) { lastErr = new Error('Gemini no respondió a tiempo'); continue; }
      const { res, json } = out;
      if (!res.ok) {
        const e = new Error('Gemini respondió ' + res.status + (json?.error?.message ? ': ' + String(json.error.message).slice(0, 160) : ''));
        if (!(res.status === 404 && lastErr)) lastErr = e; // un modelo inexistente no tapa el error real
        if (RETRYABLE.has(res.status)) continue; // reintenta y luego pasa al modelo de respaldo
        if (res.status === 404) break; // modelo inexistente: probar el siguiente
        throw e;
      }
      const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('');
      if (!text) { lastErr = new Error('Gemini no devolvió datos'); continue; }
      let data;
      try { data = JSON.parse(text); } catch { lastErr = new Error('Gemini devolvió un formato inesperado'); continue; }
      return { data, model };
    }
  }
  throw lastErr || new Error('Gemini no disponible');
}

module.exports = { readSheet };
