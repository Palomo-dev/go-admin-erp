/// <reference types="jest" />
/**
 * F13 — widgets del vendedor en /app/inicio.
 *
 * Jest de este repo no compila TSX (`jsx: preserve`), así que la lógica de
 * presentación vive en `widgetModels.ts` (puro, se ejecuta aquí) y los
 * componentes se comprueban por contrato de fuente: existen, se exportan,
 * llevan barra `role="progressbar"` en el JSX, usan `useReducedMotion` en las
 * props de `motion` (ronda 2: se mira el JSX, no un comentario), muestran el
 * estado vacío honesto y NO están cableados en `inicio/page.tsx` (WIP del dueño).
 */
import * as fs from 'fs';
import * as path from 'path';
import { commissionsWidgetModel, leaderboardWidgetModel, pipelineWidgetModel, quotaWidgetModel, staggerDelay } from '../widgetModels';

const ROOT = path.resolve(__dirname, '../../../../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const WIDGETS = ['QuotaProgressWidget', 'CommissionsWidget', 'SellerLeaderboardWidget', 'MyPipelineWidget'];
/** Sin comentarios: un guardarraíl que lee un comentario no muerde (M37/M38 de la ronda 1). */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/** Solo lo que se devuelve como JSX (desde el último `return (`). */
const jsxOf = (s: string) => {
  const clean = stripComments(s);
  return clean.slice(clean.lastIndexOf('return ('));
};
const BASE = { organization_id: 120, user_id: 'u-1', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' } as const;

describe('quotaWidgetModel', () => {
  it('sin cuota → estado vacío honesto, sin cifras', () => {
    const m = quotaWidgetModel(null, 'COP');
    expect(m.kind).toBe('empty');
    if (m.kind === 'empty') expect(m.message).toMatch(/sin cuota este mes/i);
  });
  it('con cuota → título, avance, restante y ritmo en la moneda de la cuota', () => {
    const m = quotaWidgetModel(
      {
        target: { ...BASE, id: 't', period: 'monthly', period_start: '2026-09-01', period_end: '2026-09-30', target_type: 'revenue', target_amount: 5_000_000, target_currency: 'COP', achieved_amount: 4_200_000 },
        progress: { pct: 84, raw_pct: 84, remaining: 800_000, days_total: 30, days_elapsed: 23, days_remaining: 7, time_pct: 77, needed_per_day: 114_286, status: 'en_ritmo' },
      },
      'USD'
    );
    expect(m.kind).toBe('quota');
    if (m.kind !== 'quota') return;
    expect(m.title).toBe('Cuota de Septiembre 2026');
    expect(m.pct).toBe(84);
    expect(m.achievedLabel).toMatch(/4\.200\.000/);
    expect(m.targetLabel).toMatch(/5\.000\.000/);
    expect(m.detail).toMatch(/7 días/);
    expect(m.detail).toMatch(/114\.286/);
    expect(m.statusLabel).toBe('En ritmo');
  });
  it('cuota de conteo (llamadas) no formatea como dinero', () => {
    const m = quotaWidgetModel(
      {
        target: { ...BASE, id: 't', period: 'monthly', period_start: '2026-09-01', period_end: '2026-09-30', target_type: 'calls', target_amount: 40, target_currency: 'COP', achieved_amount: 12 },
        progress: { pct: 30, raw_pct: 30, remaining: 28, days_total: 30, days_elapsed: 14, days_remaining: 16, time_pct: 47, needed_per_day: 2, status: 'atrasado' },
      },
      'COP'
    );
    if (m.kind !== 'quota') throw new Error('esperaba cuota');
    expect(m.achievedLabel).toBe('12');
    expect(m.targetLabel).toBe('40 llamadas');
  });
});

describe('commissionsWidgetModel', () => {
  it('devengado vs pagado del mes con porcentaje pagado; sin comisiones → vacío honesto', () => {
    expect(commissionsWidgetModel({ accrued: 120, paid: 80, total: 200, count: 2 }, 'COP')).toMatchObject({ kind: 'data', paidPct: 40, count: 2 });
    expect(commissionsWidgetModel({ accrued: 0, paid: 0, total: 0, count: 0 }, 'COP')).toMatchObject({ kind: 'empty' });
  });
});

describe('leaderboardWidgetModel / pipelineWidgetModel', () => {
  it('ranking: null → oculto; lista → top 5 con mi posición aunque esté fuera del top', () => {
    expect(leaderboardWidgetModel(null, 'COP').kind).toBe('hidden');
    const rows = Array.from({ length: 7 }, (_, i) => ({ rank: i + 1, user_id: `u-${i}`, name: `V${i}`, amount: 700 - i * 100, deals: 1, is_me: i === 6 }));
    const m = leaderboardWidgetModel(rows, 'COP');
    if (m.kind !== 'data') throw new Error('esperaba datos');
    expect(m.top.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(m.me?.rank).toBe(7);
  });
  it('pipeline: sin oportunidades ni tareas → vacío honesto con acción', () => {
    const m = pipelineWidgetModel([], [], 'COP');
    expect(m.opportunitiesEmpty).toMatch(/sin oportunidades abiertas/i);
    expect(m.tasksEmpty).toMatch(/sin tareas para hoy/i);
  });
});

describe('staggerDelay', () => {
  it('escalona 60 ms por widget y 0 con movimiento reducido', () => {
    expect(staggerDelay(0, false)).toBe(0);
    expect(staggerDelay(3, false)).toBeCloseTo(0.18);
    expect(staggerDelay(3, true)).toBe(0);
  });
});

describe('contrato de fuente de los widgets', () => {
  const sources = Object.fromEntries(WIDGETS.map((w) => [w, read(`src/components/inicio/widgets/${w}.tsx`)]));

  it('los cuatro widgets existen, son client components, se exportan por nombre y por el barrel', () => {
    const barrel = read('src/components/inicio/widgets/index.ts');
    for (const w of WIDGETS) {
      expect(sources[w].startsWith("'use client'")).toBe(true);
      expect(sources[w]).toMatch(new RegExp(`export function ${w}\\b`));
      expect(barrel).toContain(w);
    }
  });
  it('la cuota usa la barra accesible compartida: role="progressbar" EN EL JSX (no en un comentario) con valor y texto', () => {
    expect(sources.QuotaProgressWidget).toContain('QuotaProgressBar');
    const bar = jsxOf(read('src/components/shared/QuotaProgressBar.tsx'));
    const tag = bar.match(/<div\b[^>]*>/)?.[0] ?? '';
    expect(tag).toMatch(/\brole="progressbar"/);
    expect(tag).toMatch(/aria-valuenow=\{value\}/);
    expect(tag).toMatch(/aria-valuetext=\{label\}/);
    expect(read('src/lib/services/crm/sellerDashboardModel.ts')).toContain('Sin cuota este mes — pídesela a tu administrador.');
  });
  it('WidgetCard y la barra USAN useReducedMotion en las props de motion (no basta con importarlo)', () => {
    for (const rel of ['src/components/inicio/widgets/WidgetCard.tsx', 'src/components/shared/QuotaProgressBar.tsx']) {
      const src = stripComments(read(rel));
      expect(src).toMatch(/const reduced = useReducedMotion\(\)/);
      const motionTag = jsxOf(src).match(/<motion\.\w+\b[\s\S]*?>/)?.[0] ?? '';
      expect({ rel, initial: /initial=\{reduced \?/.test(motionTag), transition: /transition=\{[^}]*reduced/.test(motionTag) }).toEqual({ rel, initial: true, transition: true });
    }
    for (const w of WIDGETS) expect(sources[w]).not.toMatch(/split\('T'\)|toISOString\(\)/);
  });
  it('ningún componente F13 supera 300 líneas', () => {
    const files = [
      ...WIDGETS.map((w) => `src/components/inicio/widgets/${w}.tsx`),
      'src/components/inicio/widgets/WidgetCard.tsx',
      'src/components/inicio/sections/SellerSection.tsx',
      'src/components/organization/quotas/QuotaEditor.tsx',
      'src/components/organization/quotas/QuotaHistory.tsx',
      'src/components/organization/quotas/MemberQuotasSheet.tsx',
      'src/components/finanzas/comisiones/ComisionesList.tsx',
      'src/components/finanzas/comisiones/ComisionesToolbar.tsx',
      'src/components/finanzas/comisiones/ClawbackDialog.tsx',
      'src/components/finanzas/comisiones/ComisionesFilters.tsx',
      'src/components/finanzas/comisiones/ComisionesSummary.tsx',
      'src/app/app/finanzas/comisiones/page.tsx',
    ];
    const tooLong = files.map((f) => ({ f, lines: read(f).split('\n').length })).filter((x) => x.lines > 300);
    expect(tooLong).toEqual([]);
  });
  it('SellerSection existe y NO está cableada en inicio/page.tsx (WIP del dueño)', () => {
    expect(fs.existsSync(path.join(ROOT, 'src/components/inicio/sections/SellerSection.tsx'))).toBe(true);
    expect(read('src/app/app/inicio/page.tsx')).not.toContain('SellerSection');
  });
  it('ronda 3 — SellerLeaderboardWidget recibe y pinta el error igual que los otros tres (si no, el ranking sigue con cifras viejas mientras los demás dicen «No se pudo cargar»)', () => {
    const widget = sources.SellerLeaderboardWidget;
    expect(widget).toMatch(/error\?:\s*string \| null/);
    const widgetCardTag = jsxOf(widget).match(/<WidgetCard\b[\s\S]*?>/)?.[0] ?? '';
    expect(widgetCardTag).toMatch(/error=\{error\}/);
    const section = stripComments(read('src/components/inicio/sections/SellerSection.tsx'));
    const leaderboardTag = section.match(/<SellerLeaderboardWidget\b[\s\S]*?\/>/)?.[0] ?? '';
    expect(leaderboardTag).toMatch(/error=\{error\}/);
  });
});
