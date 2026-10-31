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

async function readSheet(buffer) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Falta GEMINI_API_KEY en el servidor');
  const img = await forModel(buffer);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + MODEL() + ':generateContent', {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: 'image/jpeg', data: img.toString('base64') } }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA },
      }),
    });
  } finally {
    clearTimeout(timer);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error('Gemini respondió ' + res.status + (json?.error?.message ? ': ' + String(json.error.message).slice(0, 160) : ''));
  const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('');
  if (!text) throw new Error('Gemini no devolvió datos');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Gemini devolvió un formato inesperado'); }
  return { data, model: MODEL() };
}

module.exports = { readSheet };
