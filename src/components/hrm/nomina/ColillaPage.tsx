'use client';

/**
 * Colilla de pago de una persona (Figma 20.23.1 y 23.2): el comprobante con
 * devengados, deducciones y neto, tal como los guardó el motor. «Descargar PDF»
 * usa la impresión del navegador sobre el comprobante solo (guardar como PDF).
 * No es el documento soporte de nómina electrónica (fase 4).
 */
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Info } from 'lucide-react';
import { AvisoTonal, EmptyState, PageHeader, Skeleton, clasesBoton } from '@/components/kit';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { RUTA_NOMINA, rutaPeriodo, usePeriodo, usePersonasNomina } from './apiNomina';
import { agruparItems, contarAlertas, estaCerrado, estadoPeriodo, textoLinea, type ItemColilla } from './nominaLogica';
import { useDinero, useFechas, useNombrePeriodo } from './piezasNomina';
import { MIGA_RRHH } from './NominaPage';
import { EstadoColilla } from './SeccionColillas';

const ESTILO_IMPRESION = `@media print {
  body * { visibility: hidden !important; }
  #colilla-imprimible, #colilla-imprimible * { visibility: visible !important; }
  #colilla-imprimible { position: absolute; inset: 0 auto auto 0; width: 100%; box-shadow: none; border: 0; }
}`;

function Bloque({ titulo, items, total, etiquetaTotal }: { titulo: string; items: readonly ItemColilla[]; total: number; etiquetaTotal: string }) {
  const t = useTranslations('hrmNomina.colilla');
  const dinero = useDinero();
  const unidades = useMemo(() => ({ dias: (n: number) => t('nDias', { n }), horas: (n: number) => t('nHoras', { n }) }), [t]);
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-[13px] font-semibold text-fg">{titulo}</h3>
      {items.map((i, n) => (
        <div key={`${i.codigo}-${n}`} className="flex items-baseline justify-between gap-3 text-[13px]">
          <span className="min-w-0 text-fg-secondary">{textoLinea(i, unidades)}</span>
          <span className="shrink-0 tabular-nums text-fg">{dinero(i.valor)}</span>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-fg-secondary">{etiquetaTotal}</span>
        <span className="shrink-0 text-base font-semibold tabular-nums text-fg">{dinero(total)}</span>
      </div>
    </section>
  );
}

export function ColillaPage({ id, vinculo }: { id: string; vinculo: string }) {
  const t = useTranslations('hrmNomina.colilla');
  const tn = useTranslations('hrmNomina');
  const f = useFechas();
  const { getToday } = useFormatDate();
  const dinero = useDinero();
  const nombrar = useNombrePeriodo();
  const { organization } = useOrganization();
  const { carga, recargar } = usePeriodo(id);
  const { carga: cargaPersonas } = usePersonasNomina();
  const datos = carga.estado === 'listo' ? carga.datos : null;
  const c = datos?.colillas.find((x) => x.vinculo_id === vinculo) ?? null;
  const persona = cargaPersonas.estado === 'listo' ? cargaPersonas.datos.personas.find((x) => x.vinculo_id === vinculo) ?? null : null;
  const g = useMemo(() => agruparItems(c?.items), [c]);
  const periodoNombre = datos ? nombrar({ nombre: datos.periodo.name, tipo: datos.periodo.kind, desde: datos.periodo.period_start, hasta: datos.periodo.period_end }) : '';
  const migas = [
    { etiqueta: tn('migas.rrhh'), href: MIGA_RRHH },
    { etiqueta: tn('titulo'), href: RUTA_NOMINA },
    { etiqueta: periodoNombre || tn('migas.periodos'), href: rutaPeriodo(id) },
  ];

  if (carga.estado !== 'listo' || !c || !datos) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
        <PageHeader variante="form" titulo={t('titulo')} volverA={rutaPeriodo(id)} migas={migas} cargando={carga.estado === 'cargando'} />
        {carga.estado === 'cargando' ? (
          <Skeleton className="mx-auto h-[640px] w-full max-w-[612px] rounded-xl" />
        ) : carga.estado === 'sinPermiso' ? (
          <EmptyState variante="forbidden" titulo={t('sinPermiso')} accion={{ etiqueta: t('volver'), href: rutaPeriodo(id) }} />
        ) : carga.estado === 'listo' || carga.estado === 'noExiste' ? (
          <EmptyState variante="empty" titulo={t('vacio.titulo')} descripcion={t('vacio.descripcion')} accion={{ etiqueta: t('volver'), href: rutaPeriodo(id) }} />
        ) : (
          <EmptyState variante="error" onReintentar={() => void recargar()} />
        )}
      </div>
    );
  }

  const p = datos.periodo;
  const cerrado = estaCerrado(estadoPeriodo(p.status));
  const bloqueada = contarAlertas(c.alertas).bloqueos > 0;
  const ibc = typeof c.bases?.ibc === 'number' ? (c.bases.ibc as number) : null;
  const salario = typeof c.bases?.salario_mensual === 'number' ? (c.bases.salario_mensual as number) : null;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <style>{ESTILO_IMPRESION}</style>
      <PageHeader
        variante="form"
        titulo={t('tituloDe', { nombre: c.nombre ?? '—' })}
        subtitulo={`${periodoNombre} · ${t('neto', { valor: bloqueada ? '—' : dinero(c.neto) })}`}
        volverA={rutaPeriodo(id)}
        migas={migas}
        badge={<EstadoColilla estado={c.estado} />}
        acciones={
          <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'md' })} onClick={() => window.print()} disabled={bloqueada}>
            <Download aria-hidden className="size-4" strokeWidth={1.5} />
            {t('descargar')}
          </button>
        }
        movil={{ menu: [{ id: 'pdf', etiqueta: t('descargar'), icono: Download, onSelect: () => window.print(), deshabilitada: bloqueada }] }}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,612px)_minmax(0,1fr)] lg:items-start lg:justify-center">
        <article id="colilla-imprimible" aria-label={t('comprobante')} className="mx-auto flex w-full max-w-[612px] flex-col gap-5 rounded-xl border border-line bg-surface p-6 sm:p-10">
          <header className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-fg">{t('comprobante')}</h2>
            <p className="text-[13px] text-fg-secondary">{organization?.name ?? ''}</p>
            <p className="mt-2 text-sm font-medium text-fg">{periodoNombre}</p>
            <p className="text-[13px] text-fg-secondary">
              {[t('del', { rango: f.rango(p.period_start, p.period_end) }), p.payment_date ? (cerrado ? t('pagada', { fecha: f.sinAnio(p.payment_date) }) : t('pago', { fecha: f.sinAnio(p.payment_date) })) : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </header>

          {!cerrado ? <AvisoTonal tono="advertencia" compacto titulo={t('borrador')} /> : null}

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-subtle p-3 text-[13px]">
            <dt className="text-fg-secondary">{t('empleado')}</dt>
            <dd className="text-right text-fg">{c.nombre ?? '—'}</dd>
            {persona?.cargo || persona?.area ? (
              <>
                <dt className="text-fg-secondary">{t('cargo')}</dt>
                <dd className="text-right text-fg">{[persona?.cargo, persona?.area].filter(Boolean).join(' · ')}</dd>
              </>
            ) : null}
            {salario !== null ? (
              <>
                <dt className="text-fg-secondary">{t('salario')}</dt>
                <dd className="text-right tabular-nums text-fg">{t('mensual', { valor: dinero(salario) })}</dd>
              </>
            ) : null}
          </dl>

          <Bloque titulo={t('devengados')} items={g.devengados} total={c.devengado} etiquetaTotal={t('totalDevengado')} />
          <Bloque titulo={t('deducciones')} items={g.deducciones} total={c.deducciones} etiquetaTotal={t('totalDeducciones')} />

          <div className="flex items-center justify-between rounded-lg bg-brand-tint px-4 py-3">
            <span className="text-sm font-medium text-brand-deep">{t('netoPagar')}</span>
            <span className="text-xl font-semibold tabular-nums text-brand-deep">{bloqueada ? t('bloqueada') : dinero(c.neto)}</span>
          </div>

          <p className="text-xs leading-4 text-fg-muted">
            {[ibc !== null ? t('ibc', { valor: dinero(ibc) }) : null, t('noEsElectronica'), t('generado', { fecha: f.corta(getToday()) })].filter(Boolean).join(' ')}
          </p>
        </article>

        <div className="flex flex-col gap-4">
          <AvisoTonal tono="informacion" icono={Info} titulo={t('electronica.titulo')} descripcion={t('electronica.descripcion')} />
          <AvisoTonal tono="neutro" titulo={t('entrega.titulo')} descripcion={t('entrega.descripcion')} />
        </div>
      </div>
    </div>
  );
}
