'use client';

/**
 * Configuración › Organización › Plan y facturación (Figma 93-config-plan-y-
 * facturacion-resumen): resumen de SOLO LECTURA dentro del diálogo. Antes la
 * entrada era un enlace que sacaba del diálogo.
 *
 * - Tarjeta del plan: nombre, ciclo y renovación, con «Gestionar plan y
 *   facturación» (Organización › Plan y facturación) y «Ver facturas» (las de
 *   la suscripción, /app/plan/billing). Los dos navegan y cierran el diálogo.
 * - «Uso del plan»: módulos activos, sucursales, usuarios y créditos de IA.
 * - Sin barra de guardar: aquí no se edita nada.
 *
 * Datos: los lee el servidor con la organización de la sesión, de las mismas
 * fuentes que la página de Plan — `GET /api/me/plan` (suscripción, cupos de
 * `fn_cupo_plan`, saldo de `ai_settings`) y `GET /api/modules`
 * (`organization_modules` frente al catálogo `modules`). Si una de las dos no
 * responde, sus filas se omiten en lugar de inventarlas.
 */
import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { EmptyState, clasesBoton } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlanSesion, type PlanSesion } from '@/components/shell/sesion/usePlanSesion';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateInTz } from '@/lib/utils/dateDisplay';

/** Organización › Plan y facturación › Plan (`/app/plan` redirige aquí). */
export const RUTA_GESTIONAR_PLAN = '/app/organizacion/plan';
/** Facturas de la suscripción (Plan y facturación › Facturas). */
export const RUTA_FACTURAS_PLAN = '/app/plan/billing';
/** Los créditos de IA se compran en la página de Plan («Comprar más»). */
export const RUTA_RECARGAR_CREDITOS = '/app/organizacion/plan';

interface ModulosDelPlan {
  activos: number;
  total: number;
}

interface EstadoModulosApi {
  active_modules_count?: number;
  available_modules?: Array<{ is_active?: boolean }>;
}

/** Módulos activos de la organización frente a los del catálogo (`GET /api/modules`). */
function useModulosDelPlan(): { modulos: ModulosDelPlan | null; listo: boolean } {
  const [estado, setEstado] = useState<{ modulos: ModulosDelPlan | null; listo: boolean }>({ modulos: null, listo: false });
  useEffect(() => {
    let vivo = true;
    fetch('/api/modules', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { data?: EstadoModulosApi } | null) => {
        if (!vivo) return;
        const d = j?.data;
        const activos = d?.active_modules_count;
        if (typeof activos !== 'number' || !Array.isArray(d?.available_modules)) {
          setEstado({ modulos: null, listo: true });
          return;
        }
        // Los del catálogo que se pueden encender (`modules.is_active`) y aún no están encendidos.
        const porEncender = d.available_modules.filter((m) => m.is_active !== false).length;
        setEstado({ modulos: { activos, total: activos + porEncender }, listo: true });
      })
      .catch(() => vivo && setEstado({ modulos: null, listo: true }));
    return () => {
      vivo = false;
    };
  }, []);
  return estado;
}

interface Props {
  /** El diálogo navega y se cierra (`ConfiguracionPanelRenderer`). */
  onAbrirEnlace?: (href: string) => void;
}

function Enlace({ href, onAbrir, className, children }: { href: string; onAbrir?: (href: string) => void; className: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={className}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        if (!onAbrir || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        onAbrir(href);
      }}
    >
      {children}
    </Link>
  );
}

function Fila({ titulo, descripcion, valor }: { titulo: string; descripcion?: string; valor: ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-b border-line py-3">
      <dt className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-fg">{titulo}</span>
        {descripcion && <span className="block text-[13px] text-fg-muted">{descripcion}</span>}
      </dt>
      <dd className="shrink-0 text-right text-sm tabular-nums text-fg">{valor}</dd>
    </div>
  );
}

type Plan = NonNullable<PlanSesion['plan']>;

export function PlanResumenPanel({ onAbrirEnlace }: Props) {
  const t = useTranslations('configuracionDialogo.planResumen');
  const locale = useLocaleIntl();
  const { timezone } = useFormatDate();
  const { datos, cargando, error, recargar } = usePlanSesion();
  const { modulos, listo: modulosListos } = useModulosDelPlan();

  const fecha = useCallback(
    (valor: string | null | undefined) => (valor ? formatDateInTz(valor, timezone, { locale, day: 'numeric', month: 'long', year: 'numeric' }) : ''),
    [timezone, locale],
  );

  if (error && !datos) {
    return <EmptyState variante="error" titulo={t('error.titulo')} descripcion={t('error.descripcion')} onReintentar={() => void recargar()} />;
  }
  if (!datos || cargando || !modulosListos) {
    return (
      <div className="flex max-w-3xl flex-col gap-4" aria-busy="true">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const plan = datos.plan;
  const uso = datos.uso;
  const estado = (p: Plan | null): string => {
    if (!p || p.estado === 'sin_plan') return t('estado.sinPlan');
    if (p.estado === 'vencido') return t('estado.vencido');
    if (p.estado === 'cancelado') return t('estado.cancelado');
    if (p.estado === 'prueba') {
      const fin = fecha(p.finPrueba ?? p.proximoCobro);
      return fin ? t('estado.prueba', { fecha: fin }) : '';
    }
    if (p.cancelaAlFinal) {
      const fin = fecha(p.finPeriodo ?? p.proximoCobro);
      return fin ? t('estado.cancela', { fecha: fin }) : '';
    }
    const renueva = fecha(p.proximoCobro);
    return renueva ? t('estado.renueva', { fecha: renueva }) : '';
  };
  const frase = estado(plan);
  const saldoIa = uso.creditosIa.restantesPlan + uso.creditosIa.comprados;
  const cupo = (actual: number, maximo: number | null, conMaximo: string, sinMaximo: string) =>
    maximo === null ? t(sinMaximo, { actual }) : t(conMaximo, { actual, maximo });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <section aria-labelledby="plan-resumen-titulo" className="flex flex-col gap-3 rounded-xl border border-line-brand bg-brand-tint p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="plan-resumen-titulo" className="text-lg font-semibold text-fg">
            {plan?.nombre ? t('plan', { nombre: plan.nombre }) : t('sinPlan')}
          </h3>
          {plan && plan.estado !== 'sin_plan' && (
            <span className="rounded-md bg-surface px-2 py-0.5 text-xs font-medium text-brand">{t(`periodo.${plan.periodo}`)}</span>
          )}
        </div>
        <p className="text-sm text-fg-secondary">
          {frase ? `${frase} ` : ''}
          {t('donde')}
        </p>
        <div className="flex flex-wrap gap-2">
          <Enlace href={RUTA_GESTIONAR_PLAN} onAbrir={onAbrirEnlace} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
            {t('gestionar')}
          </Enlace>
          {plan && (
            <Enlace href={RUTA_FACTURAS_PLAN} onAbrir={onAbrirEnlace} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
              {t('verFacturas')}
            </Enlace>
          )}
        </div>
      </section>

      <section aria-labelledby="plan-uso-titulo" className="flex flex-col">
        <h3 id="plan-uso-titulo" className="border-b border-line pb-2 text-base font-semibold text-fg">
          {t('usoTitulo')}
        </h3>
        <dl>
          {modulos && (
            <Fila titulo={t('modulos.titulo')} descripcion={t('modulos.descripcion')} valor={t('modulos.valor', { actual: modulos.activos, total: modulos.total })} />
          )}
          <Fila titulo={t('sucursales.titulo')} valor={cupo(uso.sucursales.actual, uso.sucursales.maximo, 'sucursales.valor', 'sucursales.sinLimite')} />
          <Fila
            titulo={t('usuarios.titulo')}
            descripcion={t('usuarios.descripcion')}
            valor={cupo(uso.usuarios.actual, uso.usuarios.maximo, 'usuarios.valor', 'usuarios.sinLimite')}
          />
          <Fila
            titulo={t('creditos.titulo')}
            descripcion={t('creditos.descripcion')}
            valor={
              <span className="inline-flex flex-wrap items-center justify-end gap-x-1">
                <span>{t('creditos.saldo', { n: saldoIa })}</span>
                <span aria-hidden="true" className="text-fg-muted">
                  ·
                </span>
                <Enlace href={RUTA_RECARGAR_CREDITOS} onAbrir={onAbrirEnlace} className="font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                  {t('creditos.recargar')}
                </Enlace>
              </span>
            }
          />
        </dl>
      </section>

      <p className="text-[13px] text-fg-muted">{t('nota')}</p>
    </div>
  );
}
