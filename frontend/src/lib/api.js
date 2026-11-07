import { supabase } from './supabase'

const BASE = import.meta.env.VITE_BACKEND_URL

// Lecturas públicas sin sesión: pasan por el CDN de Vercel (/edge, reescrito hacia Render en vercel.json).
// El backend las marca con s-maxage=5: miles de visitantes leyendo lo mismo no llegan al servidor.
// Con sesión (organización, mesa, jugadores) se va directo al backend: ven sus cambios al instante.
const EDGE_ON = import.meta.env.PROD && import.meta.env.VITE_EDGE !== '0'
const EDGE_PATHS = /^\/(tournaments|teams|players|stats|matches|search)(\/|\?|$)/

// Si no hay red, el navegador tira un error técnico ("Load failed", "Failed to fetch"): lo cambiamos por un mensaje claro
const MSG_OFFLINE = 'Sin conexión a internet. Revisá tu red y volvé a intentar.'
const MSG_SERVER = 'No pudimos conectar con el servidor. Puede estar iniciándose: probá de nuevo en unos segundos.'
async function netFetch(url, opts) {
  try {
    return await fetch(url, opts)
  } catch (e) {
    if (e?.name === 'AbortError') throw e
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    throw Object.assign(new Error(offline ? MSG_OFFLINE : MSG_SERVER), { status: 0, offline })
  }
}

// GET repetidos: los que están en vuelo se comparten y el resultado vive 3 s.
// Cualquier escritura (POST/PATCH/PUT/DELETE) vacía el caché, así cada persona ve sus cambios al instante.
const GET_TTL_MS = 3000
const getCache = new Map() // clave -> { at, promise }

export const clearApiCache = () => getCache.clear()

export function api(method, path, body) {
  if (method !== 'GET') {
    getCache.clear()
    return apiFetch(method, path, body)
  }
  const hit = getCache.get(path)
  if (hit && Date.now() - hit.at < GET_TTL_MS) return hit.promise
  const promise = apiFetch(method, path, body)
  getCache.set(path, { at: Date.now(), promise })
  promise.catch(() => getCache.delete(path)) // los errores no se guardan
  if (getCache.size > 200) getCache.clear()
  return promise
}

async function apiFetch(method, path, body) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const init = {
    method,
    headers: {
      'ngrok-skip-browser-warning': 'true',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }
  const viaEdge = EDGE_ON && method === 'GET' && !token && EDGE_PATHS.test(path)
  let res
  if (viaEdge) {
    // Si el CDN falla (o Render está arrancando y el CDN corta), se reintenta directo
    res = await netFetch('/edge' + path, init).catch(() => null)
    if (!res || res.status >= 502) res = null
  }
  if (!res) res = await netFetch(BASE + path, init)
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    // Sesión revocada o inexistente en Supabase: se limpia solo este dispositivo y se vuelve al login
    if (res.status === 401 && json?.code === 'SESSION_GONE' && token) {
      supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    }
    throw Object.assign(new Error(json?.error || json?.errors?.join(', ') || 'Error'), {
      status: res.status,
      data: json,
    })
  }
  return json
}

export async function apiUploadPhoto(file) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await netFetch(BASE + '/me/photo', {
    method: 'PUT',
    headers: {
      'ngrok-skip-browser-warning': 'true',
      'Content-Type': file.type,
      Authorization: 'Bearer ' + token,
    },
    body: file,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw Object.assign(new Error(json?.error || 'Error al subir la foto'), { status: res.status })
  return json
}

export async function apiUpload(path, file) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await netFetch(BASE + path, {
    method: 'PUT',
    headers: {
      'ngrok-skip-browser-warning': 'true',
      'Content-Type': file.type,
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: file,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw Object.assign(new Error(json?.error || 'Error al subir la imagen'), { status: res.status })
  return json
}

// Foto de la planilla de juego: se guarda el original y se lee; la mesa confirma después
export async function apiUploadSheet(matchId, file) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await netFetch(BASE + '/matches/' + matchId + '/sheet/photo', {
    method: 'POST',
    headers: {
      'ngrok-skip-browser-warning': 'true',
      'Content-Type': file.type,
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: file,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw Object.assign(new Error(json?.error || 'No se pudo subir la planilla'), { status: res.status })
  return json
}
