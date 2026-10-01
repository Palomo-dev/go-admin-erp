/** La probabilidad pondera el pronóstico; no representa un cierre comercial. */
export function esOportunidadGanada(o: { status: string | null; is_won?: boolean | null }): boolean {
  return o.status === 'won' || o.is_won === true;
}
