import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'

// Prode de varios partidos a la vez (listas): una sola consulta por pantalla en vez de una por fila.
// Sin sesión no pide nada y las filas no muestran el prode.
export function usePredictions(ids) {
  const user = useAuthStore((s) => s.user)
  const [map, setMap] = useState({})
  const key = ids.slice(0, 100).join(',')

  useEffect(() => {
    if (!user || !key) return
    let live = true
    api('GET', '/predictions/matches?ids=' + key).then((r) => live && setMap((p) => ({ ...p, ...r }))).catch(() => {})
    return () => { live = false }
  }, [user, key])

  // Elegir una opción; tocar la misma otra vez la quita. Devuelve el texto del error si falla.
  const pick = async (matchId, p) => {
    try {
      if (map[matchId]?.pick === p) await api('DELETE', '/predictions/match/' + matchId)
      else await api('POST', '/predictions', { matchId, pick: p })
      const r = await api('GET', '/predictions/matches?ids=' + matchId)
      setMap((m) => ({ ...m, ...r }))
      return ''
    } catch (e) {
      return e.message
    }
  }
  return { map, pick }
}
