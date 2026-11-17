'use client';

/**
 * Revisión y cierre (Figma 20.19.1, 19.2 y 19.6–19.8).
 *
 * - «Antes de cerrar»: la lista sale de `fn_hr_nomina_bloqueos` (la base decide qué
 *   bloquea); aquí solo se pinta cada punto como listo, pendiente o bloqueante.
 * - «Quién revisa y aprueba» (decisión 7): RR. HH. prepara y revisa, la gerencia
 *   aprueba en Aprobaciones, y quien preliquidó no puede aprobar su propia nómina
 *   (lo valida el motor de aprobaciones; aquí se avisa).
 * - Ajustes de un período cerrado y su cierre (19.5).
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CheckCircle2, CircleAlert, Clock, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AvisoTonal, EmptyState, FilaDato, ListaDatos, Skeleton, StatusBadge, Tarjeta, clasesBoton } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { cerrarAjuste, codigoDeError, type DetallePeriodo, type RevisionPeriodo } from './apiNomina';
import { claveBloqueo, estadoPeriodo, puntosRevision, type EstadoPunto } from './nominaLogica';
import { useDinero, useErrorNomina } from './piezasNomina';

export const RUTA_APROBACIONES = '/app/hrm/aprobaciones';

const ICONO: Record<EstadoPunto, LucideIcon> = { listo: CheckCircle2, pendiente: Clock, bloquea: CircleAlert };
const COLOR: Record<EstadoPunto, string> = { listo: 'text-success-text', pendiente: 'text-fg-muted', bloquea: 'text-danger-text' };

export function SeccionRevision({
  periodo,
  revision,
  cargaRevision,
  onReintentar,
  onRecargar,
}: {
  periodo: DetallePeriodo;
  revision: RevisionPeriodo | null;
  cargaRevision: 'cargando' | 'error' | 'sinPermiso' | 'noExiste' | 'listo';
  onReintentar: () => void;
  onRecargar: () => void;
}) {
  const t = useTranslations('hrmNomina.revision');
  const ta = useTranslations('hrmNomina.alertas');
  const dinero = useDinero();
  const mensajeError = useErrorNomina();
  const { formatDateTime } = useFormatDate();
  const [cerrando, setCerrando] = useState<string | null>(null);

  if (cargaRevision === 'cargando') return <Skeleton className="h-96 w-full rounded-xl" />;
  if (cargaRevision === 'sinPermiso') return <EmptyState variante="forbidden" titulo={t('sinPermiso')} />;
  if (!revision) return <EmptyState variante="error" onReintentar={onReintentar} />;

  const p = periodo.periodo;
  const estado = estadoPeriodo(p.status);
  const puntos = puntosRevision(revision.bloqueos, p.kind, revision.aprobacion);
  const listos = puntos.filter((x) => x.estado === 'listo').length;
  const detalleDe = (x: (typeof puntos)[number]): string => {
    if (x.estado === 'listo') return t(`puntos.${x.clave}.listo`);
    if (x.clave === 'aprobacion') return x.estado === 'pendiente' ? t('puntos.aprobacion.pendiente') : t('puntos.aprobacion.rechazada');
    return x.codigos
      .map((c) => {
        const b = revision.bloqueos.find((y) => y.codigo === c);
        return ta(claveBloqueo(c), { n: b?.cantidad ?? 0 });
      })
      .join(' · ');
  };

  const aprob = revision.aprobacion;
  const pendienteAprobacion = estado === 'en_revision' && (!aprob || aprob.estado === 'pendiente');

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-4">
        {estado === 'en_revision' && aprob && aprob.estado === 'pendiente' ? (
          <AvisoTonal
            tono="informacion"
            titulo={t('faltaAprobacion')}
            descripcion={aprob.solicitada ? t('faltaAprobacionDetalle', { fecha: formatDateTime(aprob.solicitada) }) : undefined}
            accion={revision.permisos.cerrar && !revision.es_preparador ? { etiqueta: t('irAprobaciones'), href: RUTA_APROBACIONES } : undefined}
          />
        ) : null}
        <Tarjeta
          titulo={t('antesDeCerrar')}
          accion={<StatusBadge estado="listas" tono={listos === puntos.length ? 'exito' : 'advertencia'} apariencia="contorno" etiqueta={t('nListas', { n: listos, total: puntos.length })} />}
          sinRelleno
        >
          <ul className="divide-y divide-line">
            {puntos.map((x) => {
              const Icono = ICONO[x.estado];
              return (
                <li key={x.clave} className="flex items-start gap-3 px-4 py-3">
                  <Icono aria-hidden className={`mt-0.5 size-5 shrink-0 ${COLOR[x.estado]}`} strokeWidth={1.5} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg">{t(`puntos.${x.clave}.titulo`)}</p>
                    <p className="text-[13px] leading-[18px] text-fg-secondary">{detalleDe(x)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Tarjeta>

        {revision.ajustes.length > 0 ? (
          <Tarjeta titulo={t('ajustes.titulo')} sinRelleno>
            <ul className="divide-y divide-line">
              {revision.ajustes.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg">{t('ajustes.numero', { n: a.numero })}</p>
                    <p className="text-[13px] text-fg-secondary">{[a.motivo, a.ejecutado ? formatDateTime(a.ejecutado) : null].filter(Boolean).join(' · ')}</p>
                  </div>
                  {revision.permisos.cerrar ? (
                    <button
                      type="button"
                      className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
                      disabled={!revision.habilitada || cerrando !== null}
                      title={!revision.habilitada ? t('ajustes.apagada') : undefined}
                      onClick={async () => {
                        setCerrando(a.id);
                        try {
                          await cerrarAjuste(a.id);
                          toast.success(t('ajustes.cerrado'));
                          onRecargar();
                        } catch (e) {
                          toast.error(mensajeError(codigoDeError(e)));
                        } finally {
                          setCerrando(null);
                        }
                      }}
                    >
                      {t('ajustes.cerrar')}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </Tarjeta>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        <Tarjeta titulo={t('quien.titulo')} icono={ShieldCheck}>
          <ListaDatos divisores>
            <FilaDato
              etiqueta={t('quien.preparo')}
              valor={revision.preliquidado_por ? (revision.preliquidado_por === revision.usuario_id ? t('quien.tu') : t('quien.otraPersona')) : '—'}
            />
            <FilaDato
              etiqueta={t('quien.aprueba')}
              valor={
                <StatusBadge
                  estado={aprob?.estado ?? 'sin_regla'}
                  tono={aprob?.estado === 'aprobada' ? 'exito' : aprob?.estado === 'rechazada' ? 'peligro' : aprob ? 'advertencia' : 'neutro'}
                  etiqueta={t(`quien.estados.${aprob?.estado ?? 'sin_regla'}`)}
                />
              }
            />
          </ListaDatos>
          <p className="mt-3 text-[13px] leading-[18px] text-fg-secondary">{t('quien.regla')}</p>
          {revision.es_preparador && pendienteAprobacion ? (
            <AvisoTonal className="mt-3" compacto tono="informacion" titulo={t('quien.noPuedesAprobar')} />
          ) : null}
        </Tarjeta>

        <Tarjeta titulo={t('loQueSeCierra')}>
          <ListaDatos>
            <FilaDato etiqueta={t('empleados')} valor={String(p.total_employees ?? 0)} />
            <FilaDato etiqueta={t('devengado')} valor={dinero(p.total_gross)} />
            <FilaDato etiqueta={t('deducciones')} valor={dinero(p.total_deductions)} />
            <FilaDato etiqueta={t('neto')} valor={dinero(p.total_net)} tamano="lg" />
            <FilaDato etiqueta={t('costo')} valor={dinero(p.total_employer_cost)} />
          </ListaDatos>
        </Tarjeta>
      </div>
    </div>
  );
}
