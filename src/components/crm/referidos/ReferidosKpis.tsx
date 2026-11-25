'use client';

import { AlertTriangle } from 'lucide-react';
import { StatCard } from '@/components/kit/StatCard';
import { KpiCompacto } from '@/components/kit/KpiCompacto';
import { localeIntl } from '@/components/kit/idioma';
import type { ResumenReferidos } from './referidosLogica';
import { useReferidosFormato } from './useReferidosFormato';

/** Nombre del mes anterior a `hoy` (`YYYY-MM-DD`) en el idioma de la interfaz. */
function mesAnterior(hoy: string, idioma: string): string {
  const [a, m] = hoy.split('-').map(Number);
  return new Intl.DateTimeFormat(localeIntl(idioma), { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(a, m - 2, 15)));
}

/**
 * KPI de Referidos (Figma 1298:768716): referidos este mes (frente al mes
 * anterior), tasa de conversión, recompensas pendientes y pagadas en el año.
 * Pendientes y pagadas abren la vista «Recompensas». En móvil (1313:88789),
 * dos cifras: conversión y recompensas pendientes.
 */
export function ReferidosKpis({ resumen, cargando, onVerRecompensas }: { resumen: ResumenReferidos; cargando: boolean; onVerRecompensas: () => void }) {
  const { t, idioma, dinero, hoy } = useReferidosFormato();
  const k = (clave: string, v?: Record<string, string | number>) => t(`kpi.${clave}`, v);
  const n = (x: number) => new Intl.NumberFormat(localeIntl(idioma)).format(x);
  const dia = hoy();
  const delta = resumen.esteMes - resumen.mesAnterior;
  const tasa = `${n(resumen.tasa)} %`;
  return (
    <>
      <div className="hidden gap-4 lg:grid lg:grid-cols-4" role="group" aria-label={k('grupo')}>
        <StatCard
          etiqueta={k('esteMes')}
          valor={n(resumen.esteMes)}
          detalle={k('frenteA', { delta: `${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${n(Math.abs(delta))}`, mes: mesAnterior(dia, idioma) })}
          cargando={cargando}
        />
        <StatCard
          etiqueta={k('tasa')}
          valor={tasa}
          detalle={k('convertidosDe', { n: n(resumen.convertidos), total: n(resumen.total) })}
          tono={resumen.convertidos ? 'exito' : 'neutro'}
          tendencia={resumen.convertidos ? 'sube' : undefined}
          cargando={cargando}
        />
        <StatCard
          etiqueta={k('pendientes')}
          valor={dinero(resumen.pendientesMonto)}
          detalle={resumen.pendientesN ? k('porRegistrar', { n: resumen.pendientesN }) : k('alDia')}
          tono={resumen.pendientesN ? 'advertencia' : 'neutro'}
          iconoDetalle={resumen.pendientesN ? AlertTriangle : undefined}
          onClick={onVerRecompensas}
          cargando={cargando}
        />
        <StatCard
          etiqueta={k('pagadas')}
          valor={dinero(resumen.pagadasMonto)}
          detalle={k('registradasEn', { n: resumen.pagadasN, anio: dia.slice(0, 4) })}
          onClick={onVerRecompensas}
          cargando={cargando}
        />
      </div>
      <KpiCompacto
        className="lg:hidden"
        etiqueta={k('grupo')}
        etiquetaNatural
        cargando={cargando}
        cifras={[
          { id: 'tasa', etiqueta: k('conversionCorto'), valor: tasa, tono: resumen.convertidos ? 'exito' : 'neutro' },
          { id: 'pendientes', etiqueta: k('pendientes'), valor: dinero(resumen.pendientesMonto), tono: resumen.pendientesN ? 'advertencia' : 'neutro', onClick: onVerRecompensas },
        ]}
      />
    </>
  );
}
