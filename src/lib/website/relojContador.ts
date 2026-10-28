/**
 * Reloj del contador regresivo «clásico»: el mismo objetivo en el editor (vista previa) y en la tienda.
 *
 * Puro, sin imports: la tienda (goadmin-websites) guarda una copia idéntica en
 * lib/website/relojContador.ts (scripts/verify-copias-erp.mjs). La zona llega ya validada:
 * cada lado aplica su zona por defecto antes de llamar aquí.
 *
 * Cambio de horario: una hora que no existe ese día (hueco de primavera) da la siguiente hora
 * válida, nunca una antes; una hora repetida (otoño) da SIEMPRE la segunda ocurrencia
 * (Madrid, Nueva York, Santiago…).
 */

/** Fecha y hora de pared en `zona` (hourCycle h23: la medianoche es 00, nunca 24). */
export function partesEnZona(instante: Date, zona: string): { y: number; mo: number; d: number; h: number; mi: number; s: number } {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(instante)
  const v = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0)
  return { y: v('year'), mo: v('month'), d: v('day'), h: v('hour') % 24, mi: v('minute'), s: v('second') }
}

/**
 * Fin «AAAA-MM-DD[THH:mm[:ss]]» sin desfase (lo que guarda el `datetime-local`) leído en `zona`;
 * con Z o desfase, tal cual. Sin hora: 23:59. `null` si no es una fecha.
 */
export function instanteFinEnZona(fin: string, zona: string): Date | null {
  const texto = (fin ?? '').trim()
  if (!texto) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(texto)
  if (!m) {
    const d = new Date(texto)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4] ?? '23', m[5] ?? '59', m[6] ?? '00'].map(Number)
  const comoUtc = Date.UTC(y, mo - 1, d, h, mi, s)
  const desfase = (utc: number): number => {
    const q = partesEnZona(new Date(utc), zona)
    return Date.UTC(q.y, q.mo - 1, q.d, q.h, q.mi, q.s) - utc
  }
  // Desfases de la zona alrededor de esa hora de pared (±18 h cubren cualquier zona y un solo cambio).
  const desfases = [...new Set([-64_800_000, 0, 64_800_000].map((k) => desfase(comoUtc + k)))]
  const candidatos = desfases.map((o) => comoUtc - o)
  // La hora pedida existe si el instante, visto en la zona, da esa misma hora de pared.
  const validos = candidatos.filter((t) => desfase(t) + t === comoUtc)
  // Hora repetida (otoño): la segunda ocurrencia, la más tardía. Hueco (primavera, esa hora no existe
  // ese día): la siguiente hora válida, nunca una antes, que también es el candidato más tardío.
  return new Date(Math.max(...(validos.length > 0 ? validos : candidatos)))
}

/** Próximo reinicio diario a `hora` (0–23; otra cosa → 0) en `zona`, estrictamente después de `ahora`. */
export function proximoReinicioEnZona(ahora: Date, zona: string, hora: number | null | undefined): Date | null {
  const h = Number.isInteger(hora) && (hora as number) >= 0 && (hora as number) <= 23 ? (hora as number) : 0
  const hoy = partesEnZona(ahora, zona)
  const dia = (desplazo: number) => {
    // Aritmética de calendario pura (el día ya viene en la zona); UTC solo como calendario neutro.
    const f = new Date(Date.UTC(hoy.y, hoy.mo - 1, hoy.d + desplazo))
    return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}-${String(f.getUTCDate()).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00`
  }
  const deHoy = instanteFinEnZona(dia(0), zona)
  if (deHoy && deHoy.getTime() > ahora.getTime()) return deHoy
  return instanteFinEnZona(dia(1), zona)
}
