/**
 * «Calificar» (CRM ola 3A), sin React. El paso 2 es el `OpportunityForm`
 * único con `Origen=lead`; su cuerpo es el de `POST /api/crm/opportunities` y
 * `POST /api/crm/leads/[id]/qualify` fija `customer_id` y `origen` en el
 * servidor, así que aquí se quitan (no se confía en ellos desde el navegador).
 */
export type PasoCalificar = 1 | 2;

export function pasoSiguiente(paso: PasoCalificar): PasoCalificar {
  return paso === 1 ? 2 : 2;
}

export function cuerpoCalificar(cuerpo: Record<string, unknown>): Record<string, unknown> {
  const { customer_id: _c, origen: _o, origen_ref: _r, organization_id: _g, ...resto } = cuerpo;
  void _c;
  void _o;
  void _r;
  void _g;
  return resto;
}
