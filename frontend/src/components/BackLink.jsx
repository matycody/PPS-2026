import { Link, useNavigate } from 'react-router-dom'

// Enlace "volver": regresa a la pantalla anterior real (de donde se vino) y no a una fija.
// Si la pantalla se abrió directo (sin historial dentro de la app), va a `to`.
export default function BackLink({ to, className = '', children }) {
  const navigate = useNavigate()
  const onClick = (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (window.history.state && window.history.state.idx > 0) {
      e.preventDefault()
      navigate(-1)
    }
  }
  return <Link to={to} onClick={onClick} className={className}>{children}</Link>
}
