const CLS = { V: 'bg-live text-black', E: 'bg-warn text-black', D: 'bg-danger text-white' }

// "Últimas": resultados de los últimos partidos de la zona (V ganó, E empató, D perdió), del más viejo al más nuevo
export default function Forma({ form, size = 'md' }) {
  if (!form?.length) return <span className="text-muted">—</span>
  const box = size === 'sm' ? 'h-[18px] w-[18px] text-[10px]' : 'h-6 w-6 text-xs'
  return (
    <span className="inline-flex gap-0.5" aria-label={'Últimos resultados: ' + form.join(' ')}>
      {form.map((r, i) => (
        <span key={i} className={'grid place-items-center rounded font-extrabold ' + box + ' ' + CLS[r]}>{r}</span>
      ))}
    </span>
  )
}
