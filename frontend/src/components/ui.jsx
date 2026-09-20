export const inputCls =
  'w-full rounded-xl border border-line bg-bg px-4 py-3 outline-none focus:border-accent disabled:opacity-40'

export function Btn({ children, onClick, disabled, tone = 'base', className = '', type = 'button' }) {
  const tones = {
    base: 'border border-line bg-surface-2',
    accent: 'bg-accent text-black',
    danger: 'bg-danger text-white',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={'flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold disabled:opacity-40 ' + tones[tone] + ' ' + className}
    >
      {children}
    </button>
  )
}

export function Alert({ children, tone = 'danger', onClose }) {
  const t = tone === 'danger' ? 'border-danger/40 bg-danger/10 text-danger' : 'border-live/40 bg-live/10 text-live'
  return (
    <button onClick={onClose} className={'w-full rounded-2xl border px-4 py-3 text-left text-sm font-bold ' + t}>
      {children}
    </button>
  )
}
