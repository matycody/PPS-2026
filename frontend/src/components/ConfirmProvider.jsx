import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Btn, inputCls } from './ui'

const ConfirmCtx = createContext(null)

// ask({ title, message, confirmText, cancelText, danger, input: { type, placeholder } })
//   sin input -> devuelve true / false
//   con input -> devuelve el texto escrito, o null si se cancela
export function useConfirm() {
  const ctx = useContext(ConfirmCtx)
  if (!ctx) throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>')
  return ctx
}

export function ConfirmProvider({ children }) {
  const [opts, setOpts] = useState(null)
  const [value, setValue] = useState('')
  const resolver = useRef(null)

  const ask = useCallback((o) => new Promise((resolve) => {
    resolver.current = resolve
    setValue('')
    setOpts(typeof o === 'string' ? { message: o } : o)
  }), [])

  const finish = useCallback((result) => {
    resolver.current?.(result)
    resolver.current = null
    setOpts(null)
  }, [])

  const hasInput = !!opts?.input
  const cancel = useCallback(() => finish(hasInput ? null : false), [finish, hasInput])
  const accept = () => {
    if (hasInput) { if (value.trim()) finish(value.trim()) } else finish(true)
  }

  useEffect(() => {
    if (!opts) return undefined
    const onKey = (e) => { if (e.key === 'Escape') cancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [opts, cancel])

  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      {opts && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4" onClick={cancel}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl border border-line bg-surface p-5 shadow-2xl"
          >
            <h2 id="confirm-title" className="text-lg font-extrabold">{opts.title ?? 'Confirmar'}</h2>
            {opts.message && <p className="mt-2 text-sm text-muted">{opts.message}</p>}
            {hasInput && (
              <input
                autoFocus
                type={opts.input.type ?? 'text'}
                placeholder={opts.input.placeholder}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && accept()}
                className={inputCls + ' mt-3'}
              />
            )}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Btn onClick={cancel}>{opts.cancelText ?? 'Cancelar'}</Btn>
              <Btn tone={opts.danger ? 'danger' : 'accent'} disabled={hasInput && !value.trim()} onClick={accept}>
                {opts.confirmText ?? 'Aceptar'}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  )
}
