import { supabase } from './supabase'

const BASE = import.meta.env.VITE_BACKEND_URL

export async function api(method, path, body) {
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
