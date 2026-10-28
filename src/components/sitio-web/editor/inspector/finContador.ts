/** Fecha fin del contador (modo «fecha»): se edita con día + hora del kit y se guarda con el desfase de la zona. */
export function partirFin(fin: string, zona?: string): { dia: string; hora: string } {
  const texto = fin ?? ''
  // Con Z o desfase (p. ej. un valor viejo guardado en UTC), se lee en la zona de la sede: así
  // editar solo el día o la hora no corre el fin.
  if (zona && /T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(texto)) {
    const t = new Date(texto)
    if (!Number.isNaN(t.getTime())) {
      try {
        const partes = new Intl.DateTimeFormat('en-US', { timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(t)
        const v = (k: string) => partes.find((p) => p.type === k)?.value ?? ''
        return { dia: `${v('year')}-${v('month')}-${v('day')}`, hora: `${String(Number(v('hour')) % 24).padStart(2, '0')}:${v('minute')}` }
      } catch {
        // zona inválida: se parte el texto tal cual
      }
    }
  }
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(texto)
  return { dia: m?.[1] ?? '', hora: m?.[2] ?? '' }
}

/** Desfase de `zona` en ese día/hora, como «-05:00». */
export function desfaseZona(dia: string, hora: string, zona: string): string {
  const [a, mes, d] = dia.split('-').map(Number)
  const [h, mi] = (hora || '00:00').split(':').map(Number)
  const utc = Date.UTC(a, mes - 1, d, h, mi)
  let partes: Intl.DateTimeFormatPart[]
  try {
    partes = new Intl.DateTimeFormat('en-US', { timeZone: zona || 'UTC', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(utc))
  } catch {
    return 'Z'
  }
  const v = (t: string) => Number(partes.find((p) => p.type === t)?.value ?? 0)
  const local = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour') % 24, v('minute'))
  const min = Math.round((local - utc) / 60000)
  if (min === 0) return 'Z'
  const s = min < 0 ? '-' : '+'
  const abs = Math.abs(min)
  return `${s}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

export function unirFin(dia: string, hora: string, zona: string): string {
  if (!dia) return ''
  const h = hora || '23:59'
  return `${dia}T${h}:00${desfaseZona(dia, h, zona)}`
}
