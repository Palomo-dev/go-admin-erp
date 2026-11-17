'use client';

/**
 * «¿Por qué está apagada la nómina?» (Figma 20.24.3, y «Ver qué falta» de 20.25).
 *
 * Lo que pidió el Contador antes de encender cada empresa: la vista previa del plan
 * de cuentas (las subcuentas que se crearán) y la lista de terceros sin entidad o
 * sin NIT, que bloquea el encendido. Todo es de solo lectura: la vista previa la
 * prepara la plataforma (`fn_hr_nomina_plan_vista_previa`) y encender lo hace solo
 * la service role (`fn_hr_nomina_habilitar`) con la aprobación escrita.
 */
import { useTranslations } from 'next-intl';
import { CheckCircle2, CircleAlert, Clock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Dialogo, EmptyState, SeccionPlegable, Skeleton } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useConfiguracionNomina, type ConfiguracionNomina } from './apiNomina';

type EstadoPaso = 'listo' | 'pendiente' | 'bloquea';

function Paso({ titulo, detalle, estado }: { titulo: string; detalle: string; estado: EstadoPaso }) {
  const Icono: LucideIcon = estado === 'listo' ? CheckCircle2 : estado === 'bloquea' ? CircleAlert : Clock;
  return (
    <li className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0">
      <Icono
        aria-hidden
        strokeWidth={1.5}
        className={estado === 'listo' ? 'mt-0.5 size-5 shrink-0 text-success-text' : estado === 'bloquea' ? 'mt-0.5 size-5 shrink-0 text-danger-text' : 'mt-0.5 size-5 shrink-0 text-fg-muted'}
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-fg">{titulo}</p>
        <p className="text-[13px] leading-[18px] text-fg-secondary">{detalle}</p>
      </div>
    </li>
  );
}

/** Pasos para encender la nómina, con los datos de la vista previa del plan. */
export function PasosEncendido({ datos }: { datos: ConfiguracionNomina }) {
  const t = useTranslations('hrmNomina.apagada');
  const { formatDateTime } = useFormatDate();
  const plan = datos.plan;
  const terceros = plan?.terceros_incompletos ?? [];
  const conceptosConCuenta = datos.conceptos.filter((c) => c.cuenta_debito || c.cuenta_credito).length;
  return (
    <ul className="overflow-hidden rounded-xl border border-line bg-surface">
      <Paso titulo={t('pasos.conceptos')} detalle={t('pasos.conceptosDetalle', { n: datos.conceptos.length, conCuenta: conceptosConCuenta })} estado="listo" />
      <Paso
        titulo={t('pasos.plan')}
        detalle={
          !plan
            ? t('pasos.planSinPreparar')
            : t('pasos.planPreparado', { n: plan.cuentas_a_crear.length, fecha: formatDateTime(plan.preparada_at) })
        }
        estado={plan ? 'listo' : 'pendiente'}
      />
      <Paso
        titulo={t('pasos.terceros')}
        detalle={!plan ? t('pasos.tercerosSinPlan') : terceros.length ? t('pasos.tercerosFaltan', { n: terceros.length }) : t('pasos.tercerosListos')}
        estado={!plan ? 'pendiente' : terceros.length ? 'bloquea' : 'listo'}
      />
      <Paso
        titulo={t('pasos.aprobacion')}
        detalle={
          plan?.aprobada_at
            ? t('pasos.aprobacionLista', { fecha: formatDateTime(plan.aprobada_at) })
            : t('pasos.aprobacionPendiente')
        }
        estado={plan?.aprobada_at ? 'listo' : 'pendiente'}
      />
      <Paso
        titulo={t('pasos.encendido')}
        detalle={datos.habilitada ? t('pasos.encendidoListo') : t('pasos.encendidoPendiente')}
        estado={datos.habilitada ? 'listo' : 'pendiente'}
      />
    </ul>
  );
}

/** Cuentas que se crearán y terceros sin NIT (la lista que pidió el Contador). */
export function DetallePlan({ datos }: { datos: ConfiguracionNomina }) {
  const t = useTranslations('hrmNomina.apagada');
  const tt = useTranslations('hrmNomina.terceros');
  const plan = datos.plan;
  if (!plan) return null;
  return (
    <div className="flex flex-col gap-3">
      <SeccionPlegable titulo={t('cuentasTitulo')} resumen={t('nCuentas', { n: plan.cuentas_a_crear.length })}>
        {plan.cuentas_a_crear.length === 0 ? (
          <p className="text-sm text-fg-secondary">{t('sinCuentas')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line text-sm">
            {plan.cuentas_a_crear.map((c) => (
              <li key={c.cuenta} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="font-mono tabular-nums text-fg">{c.cuenta}</span> <span className="text-fg-secondary">{c.nombre ?? ''}</span>
                </span>
                <span className="shrink-0 text-xs text-fg-muted">{c.cuenta_mayor ? t('bajo', { cuenta: c.cuenta_mayor }) : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </SeccionPlegable>
      <SeccionPlegable titulo={t('tercerosTitulo')} resumen={t('nTerceros', { n: plan.terceros_incompletos.length })} abiertaPorDefecto={plan.terceros_incompletos.length > 0}>
        {plan.terceros_incompletos.length === 0 ? (
          <p className="text-sm text-fg-secondary">{t('sinTerceros')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line text-sm">
            {plan.terceros_incompletos.map((x, i) => (
              <li key={`${x.vinculo_id}-${x.tercero}-${i}`} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-fg">{x.nombre ?? t('empleadoSinNombre')}</span>
                <span className="shrink-0 text-xs text-fg-secondary">
                  {tt.has(x.tercero) ? tt(x.tercero) : x.tercero} · {x.falta === 'nit' ? t('faltaNit') : t('faltaEntidad')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SeccionPlegable>
    </div>
  );
}

export function DialogoNominaApagada({ abierto, onAbiertoChange }: { abierto: boolean; onAbiertoChange: (v: boolean) => void }) {
  const t = useTranslations('hrmNomina.apagada');
  const { carga, recargar } = useConfiguracionNomina(abierto);
  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('subtitulo')}
      ancho={560}
      primario={{ etiqueta: t('entendido'), onClick: () => onAbiertoChange(false) }}
      textoCancelar={t('cerrar')}
    >
      <div className="flex flex-col gap-4">
        {carga.estado === 'cargando' ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : carga.estado === 'sinPermiso' ? (
          <EmptyState variante="forbidden" compacto titulo={t('sinPermiso')} />
        ) : carga.estado !== 'listo' ? (
          <EmptyState variante="error" compacto onReintentar={() => void recargar()} />
        ) : (
          <>
            <PasosEncendido datos={carga.datos} />
            <DetallePlan datos={carga.datos} />
          </>
        )}
        <p className="text-[13px] leading-[18px] text-fg-secondary">{t('mientras')}</p>
      </div>
    </Dialogo>
  );
}
