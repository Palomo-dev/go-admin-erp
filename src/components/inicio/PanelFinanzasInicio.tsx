'use client';

/**
 * Panel desplegado de «Finanzas» en «Módulos» del inicio (Figma `03
 * Navegación y shell` › «Inicio — pendientes de Finanzas en el módulo»,
 * 2360:42276: con pendientes 2360:42278, al día 2360:43042; aprobado por el
 * dueño el 2026-11-07).
 *
 * Cuatro cifras (dinero disponible, por cobrar vencido, por pagar en 7 días,
 * resultado del mes anterior) y «Pendientes»: solo lo que la persona puede
 * resolver, cada fila enlazada a la pantalla que lo resuelve. Todo llega
 * armado del servidor (`GET /api/inicio/modulos`, `finanzasInicio.ts`): aquí
 * no hay cálculo ni consulta.
 */
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, ArrowRight, DollarSign } from 'lucide-react';
import { EmptyState } from '@/components/kit/EmptyState';
import { StatCard } from '@/components/kit/StatCard';
import { StatusBadge } from '@/components/kit/StatusBadge';
import type { CifraModulo } from '@/lib/dashboard/resumenModulos';
import type { FinanzasInicio, MesPlano, PendienteFinanzas } from '@/lib/dashboard/finanzasInicio';

export interface PanelFinanzasInicioProps {
  datos: FinanzasInicio;
  /** Formato de cifras del inicio (moneda de la organización, locale). */
  cifra: (c: CifraModulo) => string;
  onReintentar: () => void;
}

/** Nombre del mes en el idioma de la interfaz. Mes de calendario: sin zona horaria. */
export function nombreMes(m: MesPlano, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(m.anio, m.mes - 1, 15, 12)));
}

const ENLACE =
  'rounded-md text-sm font-medium text-link outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand';

function FilaPendiente({ fila }: { fila: PendienteFinanzas }) {
  const t = useTranslations('inicioFinanzas');
  const locale = useLocale();
  const params = { ...(fila.que.params ?? {}), ...(fila.mes ? { mes: nombreMes(fila.mes, locale) } : {}) };
  const que = t(fila.que.clave, params);
  return (
    <li
      className="flex flex-col gap-1 border-t border-line px-4 py-2.5 lg:grid lg:grid-cols-[minmax(0,1fr)_16rem_4rem_8rem] lg:items-center lg:gap-3"
      data-pendiente={fila.id}
    >
      <div className="flex items-center justify-between gap-2 lg:contents">
        <p className="min-w-0 text-sm leading-5 text-fg first-letter:uppercase">{que}</p>
        <span className="lg:order-3">
          <StatusBadge estado={fila.id} etiqueta={String(fila.cantidad)} tono={fila.tono} apariencia="suave" />
        </span>
      </div>
      <p className="text-xs leading-5 text-fg-secondary lg:order-2 lg:text-sm">{t(fila.donde.clave)}</p>
      <Link href={fila.href} className={`${ENLACE} self-start lg:order-4 lg:justify-self-end`}>
        {t(fila.accion.clave)}
        <span className="sr-only">: {que}</span>
      </Link>
    </li>
  );
}

export function PanelFinanzasInicio({ datos, cifra, onReintentar }: PanelFinanzasInicioProps) {
  const t = useTranslations('inicioFinanzas');
  const tModulos = useTranslations('home.modulos');
  const locale = useLocale();
  const { pendientes, porCobrarVencido, porPagar, resultado } = datos;

  return (
    <div className="flex flex-col gap-3" data-finanzas-inicio>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          etiqueta={t('kpis.disponible')}
          icono={DollarSign}
          valor={<span className="text-base font-medium leading-6 text-fg-secondary">{t('kpis.noDisponible')}</span>}
          detalle={t('kpis.disponibleMotivo')}
        />
        {porCobrarVencido && (
          <StatCard
            etiqueta={t('kpis.porCobrarVencido')}
            icono={DollarSign}
            valor={cifra(porCobrarVencido.kpi.cifra)}
            detalle={porCobrarVencido.kpi.detalle ? tModulos(porCobrarVencido.kpi.detalle.clave, porCobrarVencido.kpi.detalle.params) : undefined}
            tono={porCobrarVencido.kpi.tono ?? 'neutro'}
            tendencia={porCobrarVencido.kpi.tono === 'peligro' ? 'baja' : undefined}
            href={porCobrarVencido.href ?? undefined}
          />
        )}
        {porPagar && (
          <StatCard
            etiqueta={t('kpis.porPagar')}
            icono={DollarSign}
            valor={cifra(porPagar.kpi.cifra)}
            detalle={porPagar.kpi.detalle ? tModulos(porPagar.kpi.detalle.clave, porPagar.kpi.detalle.params) : undefined}
            tono={porPagar.kpi.tono ?? 'neutro'}
            iconoDetalle={porPagar.kpi.tono === 'advertencia' ? AlertTriangle : undefined}
            href={porPagar.href ?? undefined}
          />
        )}
        {resultado && (
          <StatCard
            etiqueta={t('kpis.resultado', { mes: nombreMes(resultado.mes, locale) })}
            icono={DollarSign}
            valor={
              resultado.estado === 'ok' ? (
                cifra(resultado.cifra)
              ) : (
                <span className="text-base font-medium leading-6 text-fg-secondary">{t('kpis.noDisponible')}</span>
              )
            }
            detalle={resultado.estado === 'ok' ? t('kpis.resultadoDetalle') : t('kpis.resultadoError')}
            tono={resultado.estado === 'ok' ? 'neutro' : 'peligro'}
            href={resultado.estado === 'ok' ? resultado.href ?? undefined : undefined}
          />
        )}
      </div>

      <section aria-labelledby="inicio-finanzas-pendientes" className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-2 bg-subtle px-4 py-3">
          <h3 id="inicio-finanzas-pendientes" className="text-sm font-semibold leading-5 text-fg">
            {t('pendientes.titulo')}
          </h3>
          {pendientes.estado === 'pendientes' && (
            <StatusBadge estado="pendientes" etiqueta={String(pendientes.total)} tono="advertencia" apariencia="suave" />
          )}
          {pendientes.estado === 'alDia' && <StatusBadge estado="alDia" etiqueta={t('fila.alDia')} tono="exito" apariencia="suave" />}
          <p className="text-xs leading-4 text-fg-secondary sm:ml-auto">{t('pendientes.soloTusPermisos')}</p>
        </div>

        {pendientes.estado === 'error' ? (
          <div className="border-t border-line">
            <EmptyState variante="error" compacto titulo={t('pendientes.errorTitulo')} descripcion={t('pendientes.errorDesc')} onReintentar={onReintentar} />
          </div>
        ) : pendientes.estado === 'alDia' ? (
          <p className="border-t border-line px-4 py-4 text-sm leading-5 text-fg-secondary">{t('pendientes.vacio')}</p>
        ) : (
          <>
            <ul>
              {pendientes.filas.map((f) => (
                <FilaPendiente key={f.id} fila={f} />
              ))}
            </ul>
            {pendientes.parcial && (
              <p role="status" className="border-t border-line px-4 py-2.5 text-xs leading-4 text-warning-text">
                {t('pendientes.parcial')}
              </p>
            )}
          </>
        )}
      </section>

      {datos.hrefReportes && (
        <Link href={datos.hrefReportes} className={`${ENLACE} inline-flex items-center gap-1 self-end`}>
          {t('reportes')}
          <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </Link>
      )}
    </div>
  );
}
