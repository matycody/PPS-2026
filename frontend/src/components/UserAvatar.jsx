import { useEffect, useState } from 'react'
import { useAuthStore } from '../stores/authStore'

const SIZES = { md: 'h-11 w-11 text-sm', lg: 'h-14 w-14 text-base' }

// Foto de la cuenta; si no hay (o falló), las iniciales del mail
export default function UserAvatar({ size = 'md' }) {
  const user = useAuthStore((s) => s.user)
  const photoUrl = useAuthStore((s) => s.photoUrl)
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [photoUrl])

  const dim = SIZES[size] ?? SIZES.md
  const initials = (user?.email ?? '?').slice(0, 2).toUpperCase()

  if (photoUrl && !broken) {
    return (
      <img
        src={photoUrl}
        alt=""
        onError={() => {
          setBroken(true)
          useAuthStore.getState().refreshPhoto() // la URL firmada pudo vencer
        }}
        className={dim + ' shrink-0 rounded-full object-cover'}
      />
    )
  }
  return (
    <div className={dim + ' grid shrink-0 place-items-center rounded-full bg-accent font-extrabold text-black'}>
      {initials}
    </div>
  )
}
