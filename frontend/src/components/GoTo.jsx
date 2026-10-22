import { useNavigate } from 'react-router-dom'

// Enlace que se puede poner dentro de otro enlace (ej. una tarjeta de partido) sin anidar <a>
export default function GoTo({ to, className = '', children }) {
  const nav = useNavigate()
  const go = (e) => { e.preventDefault(); e.stopPropagation(); nav(to) }
  return (
    <div role="link" tabIndex={0} onClick={go} onKeyDown={(e) => { if (e.key === 'Enter') go(e) }} className={'cursor-pointer ' + className}>
      {children}
    </div>
  )
}
