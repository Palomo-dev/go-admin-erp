/**
 * F14 — conversión del embudo (puro).
 *
 * `fn_pipeline_funnel(p_org_id)` devuelve, por etapa, cuántas oportunidades
 * están HOY en esa etapa (`opportunity_count`) y su monto. No es un embudo
 * histórico: para leerlo como conversión se toma el acumulado «llegó a esta
 * etapa o a una posterior»:
 *
 *   cadena            = etapas no perdidas por posición HASTA la primera `is_won`
 *   reached(i)        = Σ count(j) para j ≥ i dentro de la cadena
 *   conversión(i→i+1) = reached(i+1) / reached(i)     (null si reached(i) = 0;
 *                       null en la ganada: no hay «siguiente»)
 *   share(i)          = reached(i) / reached(0)
 *   global            = reached(ganada) / reached(0)  (`overallBasis = 'won'`)
 *
 * Las etapas `is_lost` se devuelven aparte (`lost`): una perdida no «llegó»
 * a la etapa final. Las etapas normales creadas DESPUÉS de la ganada (caso
 * real: «Primera llamada» en posición 6 tras «Ganado» en la 4) no forman parte
 * de la cadena y se devuelven en `ignoredAfterWon` para avisar en la UI; en la
 * ronda 1 la global tomaba la última posición y pintaba 0 % donde 1 de 4 había
 * llegado a Ganado (25 %). Sin etapa ganada la base es la última de la cadena
 * (`overallBasis = 'last'`) y la UI lo declara. Limitación honesta: una
 * oportunidad perdida desde Demo también deja de contarse en Lead; el acumulado
 * mide lo que sigue vivo o ganó.
 */

export interface FunnelStageInput {
  stage_id: string;
  stage_name: string;
  position: number;
  opportunity_count: number;
  total_amount: number;
  is_won?: boolean | null;
  is_lost?: boolean | null;
  pipeline_id?: string | null;
}

export interface FunnelStageConversion {
  stage_id: string;
  stage_name: string;
  position: number;
  /** Oportunidades hoy en la etapa. */
  count: number;
  amount: number;
  /** Acumulado: en esta etapa o en una posterior (sin perdidas). */
  reached: number;
  /** % de las que llegaron a la primera etapa. */
  sharePct: number;
  /** % que pasa a la siguiente etapa; null en la última o sin base. */
  conversionToNextPct: number | null;
  is_won: boolean;
}

export interface FunnelConversion {
  stages: FunnelStageConversion[];
  lost: { count: number; amount: number };
  overallPct: number | null;
  /** Qué etapa cierra la global: la ganada, la última (sin ganada) o ninguna (sin etapas). */
  overallBasis: 'won' | 'last' | null;
  totalReached: number;
  /** Etapas normales posteriores a la ganada: fuera de la cadena, con su conteo actual. */
  ignoredAfterWon: Array<{ stage_id: string; stage_name: string; count: number }>;
}

const pct = (num: number, den: number): number | null => (den > 0 ? (num / den) * 100 : null);

export function computeFunnelConversion(rows: FunnelStageInput[]): FunnelConversion {
  const sorted = [...rows].sort((a, b) => a.position - b.position);
  const lostRows = sorted.filter((r) => r.is_lost === true);
  const notLost = sorted.filter((r) => r.is_lost !== true);
  const wonIndex = notLost.findIndex((r) => r.is_won === true);
  const chain = wonIndex >= 0 ? notLost.slice(0, wonIndex + 1) : notLost;
  const ignoredAfterWon = (wonIndex >= 0 ? notLost.slice(wonIndex + 1) : []).map((r) => ({
    stage_id: r.stage_id,
    stage_name: r.stage_name,
    count: r.opportunity_count || 0,
  }));

  const lost = {
    count: lostRows.reduce((s, r) => s + (r.opportunity_count || 0), 0),
    amount: lostRows.reduce((s, r) => s + (r.total_amount || 0), 0),
  };

  const reached: number[] = new Array(chain.length).fill(0);
  let acc = 0;
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    acc += chain[i].opportunity_count || 0;
    reached[i] = acc;
  }
  const base = reached[0] ?? 0;

  const stages: FunnelStageConversion[] = chain.map((r, i) => ({
    stage_id: r.stage_id,
    stage_name: r.stage_name,
    position: r.position,
    count: r.opportunity_count || 0,
    amount: r.total_amount || 0,
    reached: reached[i],
    sharePct: base > 0 ? (reached[i] / base) * 100 : 0,
    conversionToNextPct: i < chain.length - 1 ? pct(reached[i + 1], reached[i]) : null,
    is_won: r.is_won === true,
  }));

  const overallPct = chain.length > 0 ? pct(reached[chain.length - 1], base) : null;
  const overallBasis: FunnelConversion['overallBasis'] = chain.length === 0 ? null : wonIndex >= 0 ? 'won' : 'last';
  return { stages, lost, overallPct, overallBasis, totalReached: base, ignoredAfterWon };
}
