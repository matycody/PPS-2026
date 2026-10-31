import { supabase } from './supabase'

const BASE = import.meta.env.VITE_BACKEND_URL

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
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'ngrok-skip-browser-warning': 'true',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
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
  const res = await fetch(BASE + '/me/photo', {
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
  const res = await fetch(BASE + path, {
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
  const res = await fetch(BASE + '/matches/' + matchId + '/sheet/photo', {
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
