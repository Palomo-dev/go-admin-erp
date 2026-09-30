'use client';

import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { StatCard } from '@/components/kit/StatCard';
import { KpiCompacto } from '@/components/kit/KpiCompacto';
import { porcentajeContactados, type ResumenLeads } from './leadsPantallaLogica';

/**
 * KPI de Leads (Figma 765:446848): Leads (+N este mes), Sin responsable
 * (asígnalos en lote), Contactados (7 días, % del total) y Calificados este
 * mes (oportunidades nuevas). En móvil, la franja compacta (768:6419).
 */
export function LeadsKpis({ resumen, cargando }: { resumen: ResumenLeads | null; cargando: boolean }) {
  const t = useTranslations('crm.pantallaLeads.kpi');
  const idioma = useLocale();
  const n = (x: number | undefined) => new Intl.NumberFormat(idioma).format(x ?? 0);
  const pct = new Intl.NumberFormat(idioma, { maximumFractionDigits: 1 }).format(resumen ? porcentajeContactados(resumen) : 0);
  return (
    <>
      <div className="hidden gap-4 lg:grid lg:grid-cols-4" role="group" aria-label={t('grupo')}>
        <StatCard etiqueta={t('leads')} valor={n(resumen?.total)} detalle={t('nuevosMes', { n: n(resumen?.nuevos_mes) })} cargando={cargando} />
        <StatCard
          etiqueta={t('sinResponsable')}
          valor={n(resumen?.sin_responsable)}
          detalle={resumen?.sin_responsable ? t('asignarLote') : t('todosAsignados')}
          tono={resumen?.sin_responsable ? 'advertencia' : 'neutro'}
          iconoDetalle={resumen?.sin_responsable ? AlertTriangle : undefined}
          cargando={cargando}
        />
        <StatCard etiqueta={t('contactados')} valor={n(resumen?.contactados_7d)} detalle={t('delTotal', { pct })} cargando={cargando} />
        <StatCard
          etiqueta={t('calificados')}
          valor={n(resumen?.calificados_mes)}
          detalle={t('oportunidadesNuevas', { n: n(resumen?.calificados_mes) })}
          tono={resumen?.calificados_mes ? 'exito' : 'neutro'}
          tendencia={resumen?.calificados_mes ? 'sube' : undefined}
          cargando={cargando}
        />
      </div>
      <KpiCompacto
        className="lg:hidden"
        etiqueta={t('grupo')}
        cargando={cargando}
        cifras={[
          { id: 'leads', etiqueta: t('leads'), valor: n(resumen?.total) },
          { id: 'sin', etiqueta: t('sinResponsable'), valor: n(resumen?.sin_responsable), tono: resumen?.sin_responsable ? 'advertencia' : 'neutro' },
          { id: 'cal', etiqueta: t('calificadosCorto'), valor: n(resumen?.calificados_mes), tono: resumen?.calificados_mes ? 'exito' : 'neutro' },
        ]}
      />
    </>
  );
}
