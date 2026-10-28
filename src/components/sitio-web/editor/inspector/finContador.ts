/** Fecha fin del contador (modo «fecha»): se edita con día + hora del kit y se guarda con el desfase de la zona. */
export function partirFin(fin: string, zona?: string): { dia: string; hora: string; seg?: string } {
  const texto = fin ?? ''
  // Con Z o desfase (p. ej. un valor viejo guardado en UTC), se lee en la zona de la sede: así
  // editar solo el día o la hora no corre el fin.
  if (zona && /T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(texto)) {
    const t = new Date(texto)
    if (!Number.isNaN(t.getTime())) {
      try {
        const partes = new Intl.DateTimeFormat('en-US', { timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(t)
        const v = (k: string) => partes.find((p) => p.type === k)?.value ?? ''
        const seg = v('second')
        return { dia: `${v('year')}-${v('month')}-${v('day')}`, hora: `${String(Number(v('hour')) % 24).padStart(2, '0')}:${v('minute')}`, seg: seg && seg !== '00' ? seg : undefined }
      } catch {
        // zona inválida: se parte el texto tal cual
      }
    }
  }
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::(\d{2}))?)?/.exec(texto)
  return { dia: m?.[1] ?? '', hora: m?.[2] ?? '', seg: m?.[3] && m[3] !== '00' ? m[3] : undefined }
}

/** Minutos que `zona` va adelante de UTC en el instante `utc` (null si la zona no vale). */
function minutosZona(utc: number, zona: string): number | null {
  let partes: Intl.DateTimeFormatPart[]
  try {
    partes = new Intl.DateTimeFormat('en-US', { timeZone: zona || 'UTC', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(utc))
  } catch {
    return null
  }
  const v = (t: string) => Number(partes.find((p) => p.type === t)?.value ?? 0)
  const local = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour') % 24, v('minute'))
  return Math.round((local - Math.floor(utc / 60000) * 60000) / 60000)
}

/**
 * Desfase de `zona` para ese día/hora local, como «-05:00». Se calcula dos veces: primero con la
 * hora local tomada como UTC y luego en el instante real (hora local − desfase), para que en los
 * días de cambio de horario el desfase sea el de esa hora y no el de unas horas antes o después.
 */
export function desfaseZona(dia: string, hora: string, zona: string): string {
  const [a, mes, d] = dia.split('-').map(Number)
  const [h, mi] = (hora || '00:00').split(':').map(Number)
  const comoUtc = Date.UTC(a, mes - 1, d, h, mi)
  const primero = minutosZona(comoUtc, zona)
  if (primero === null) return 'Z'
  const min = minutosZona(comoUtc - primero * 60000, zona) ?? primero
  if (min === 0) return 'Z'
  const s = min < 0 ? '-' : '+'
  const abs = Math.abs(min)
  return `${s}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

/** Une día + hora con el desfase de la zona; `seg` conserva los segundos que ya traía el valor. */
export function unirFin(dia: string, hora: string, zona: string, seg?: string): string {
  if (!dia) return ''
  const h = hora || '23:59'
  return `${dia}T${h}:${seg && /^\d{2}$/.test(seg) ? seg : '00'}${desfaseZona(dia, h, zona)}`
}
