'use client';

/**
 * «Módulos» del inicio: filas plegadas con resumen (`FilaModulo` 445:195568 /
 * `ModuloResumenFila` 638:388816) y su panel desplegado («Inicio — Dashboard
 * por módulo», 642:25956), más el modo «Reordenar y ocultar» (646:32649).
 * Aprobado por el dueño el 2026-09-30.
 *
 * - Una sola lectura (`GET /api/inicio/modulos`) para toda la lista: el panel
 *   desplegado usa el MISMO resumen, sin otra consulta. Plegar no consulta.
 * - Qué módulos aparecen lo decide el servidor (menú visible + permiso de
 *   lectura resuelto en la base); aquí no hay lista de módulos ni de rutas.
 * - Un solo badge sólido en toda la lista: el del estado más grave.
 * - Escritorio: varios desplegados a la vez. Móvil: acordeón, uno a la vez.
 * - Reordenar y ocultar: flechas (accesibles con teclado) e interruptor «En
 *   el inicio»; «Listo» guarda en `user_dashboard_preferences`. Ocultar no
 *   cambia permisos y deja de consultar el módulo.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, ChevronDown, GripVertical, LayoutGrid } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { EmptyState } from '@/components/kit/EmptyState';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { clasesBoton } from '@/components/kit/botonClases';
import { useEsEscritorio } from '@/components/kit/useEsEscritorio';
import { CATALOGO_NAV } from '@/lib/navigation/catalog';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatMoneda } from '@/lib/utils/moneda';
import { queryPeriodo, type FechasPeriodo, type HorasPeriodo, type PeriodoInicio } from '@/lib/dashboard/periodo';
import { moverModulo, type PreferenciasInicio } from '@/lib/dashboard/preferenciasInicio';
import type { CifraModulo, KpiModulo, ResumenModulo, TextoModulo } from '@/lib/dashboard/resumenModulos';
import type { ModuloInicio, ModulosInicio as DatosModulos } from '@/lib/dashboard/inicio.server';
import { formatoEntero, formatoVariacion, useLecturaInicio } from './useLecturaInicio';

export interface ModulosInicioProps {
  organizationId: number;
  periodo: PeriodoInicio;
  horas?: HorasPeriodo | null;
  fechas?: FechasPeriodo | null;
  sucursal: number | null;
  version?: number;
  prefs: PreferenciasInicio;
  /** Guarda las preferencias; true si la base las aceptó. */
  onGuardar: (p: PreferenciasInicio) => Promise<boolean>;
  guardando?: boolean;
  /** Avisa qué módulos llegaron (para «Personalizar el inicio»). */
  onModulos?: (modulos: Array<{ codigo: string; etiqueta: string }>) => void;
}

function useFormatoCifra() {
  const t = useTranslations('home.modulos');
  const locale = useLocale();
  return (c: CifraModulo): string =>
    c.tipo === 'moneda'
      ? formatMoneda(c.valor, c.moneda, { decimals: 0 })
      : c.tipo === 'numero'
        ? formatoEntero(c.valor, locale)
        : t(c.texto.clave, c.texto.params);
}

function textoResumen(r: ResumenModulo, t: (k: string, p?: Record<string, string | number>) => string, cifra: (c: CifraModulo) => string): string {
  return r.resumen
    .map((s) => ('cifra' in s ? t(s.clave, { valor: cifra(s.cifra) }) : t((s as TextoModulo).clave, (s as TextoModulo).params)))
    .join(' · ');
}

function Kpi({ kpi, cifra }: { kpi: KpiModulo; cifra: (c: CifraModulo) => string }) {
  const t = useTranslations('home.modulos');
  const locale = useLocale();
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-canvas p-3" data-tono={kpi.tono ?? 'neutro'}>
      <h4 className="text-xs font-medium leading-4 text-fg-secondary">{t(`kpis.${kpi.etiqueta}`)}</h4>
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-lg font-semibold leading-7 text-fg tabular-nums">{cifra(kpi.cifra)}</p>
        {kpi.delta !== undefined && kpi.delta !== null && (
          <StatusBadge estado="variacion" etiqueta={formatoVariacion(kpi.delta, locale)} tono={kpi.delta >= 0 ? 'exito' : 'peligro'} apariencia="suave" />
        )}
      </div>
      {kpi.detalle && <p className="text-xs leading-4 text-fg-secondary">{t(kpi.detalle.clave, kpi.detalle.params)}</p>}
    </div>
  );
}

export function ModulosInicio({ organizationId, periodo, horas, fechas, sucursal, version = 0, prefs, onGuardar, guardando, onModulos }: ModulosInicioProps) {
  const t = useTranslations('home.modulos');
  const tNav = useTranslations('nav');
  const cifra = useFormatoCifra();
  const { formatTime } = useFormatDate();
  const esEscritorio = useEsEscritorio();
  const url = `/api/inicio/modulos?${queryPeriodo({ periodo, horas, fechas, sucursal })}`;
  const { estado, recargar } = useLecturaInicio<DatosModulos>(url, organizationId, version);

  const [abiertos, setAbiertos] = useState<string[]>([]);
  const [reordenando, setReordenando] = useState(false);
  const [borradorOrden, setBorradorOrden] = useState<string[]>([]);
  const [borradorOcultos, setBorradorOcultos] = useState<string[]>([]);
  const [errorGuardar, setErrorGuardar] = useState(false);

  const iconos = useMemo(() => new Map(CATALOGO_NAV.map((m) => [m.id, m.icono])), []);

  useEffect(() => {
    if (estado.fase === 'listo') onModulos?.(estado.datos.modulos.map((m) => ({ codigo: m.codigo, etiqueta: m.etiqueta })));
  }, [estado, onModulos]);

  if (estado.fase === 'sinPermiso') return null;

  const modulos = estado.fase === 'listo' ? estado.datos.modulos : [];
  const visibles = modulos.filter((m) => !m.oculto);
  const porCodigo = new Map(modulos.map((m) => [m.codigo, m]));
  const listaReordenar = borradorOrden.map((c) => porCodigo.get(c)).filter((m): m is ModuloInicio => !!m);

  const alternar = (codigo: string) =>
    setAbiertos((prev) =>
      prev.includes(codigo) ? prev.filter((c) => c !== codigo) : esEscritorio ? [...prev, codigo] : [codigo],
    );

  const empezarReordenar = () => {
    setBorradorOrden(modulos.map((m) => m.codigo));
    setBorradorOcultos(modulos.filter((m) => m.oculto).map((m) => m.codigo));
    setErrorGuardar(false);
    setReordenando(true);
  };

  const guardar = async (orden: string[], ocultos: string[]) => {
    setErrorGuardar(false);
    const ok = await onGuardar({ ...prefs, modulosOrden: orden, modulosOcultos: ocultos });
    if (ok) setReordenando(false);
    else setErrorGuardar(true);
  };

  const alcance = sucursal === null ? t('alcanceTodas') : t('alcanceUna');

  return (
    <section aria-labelledby="inicio-modulos-titulo" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="inicio-modulos-titulo" className="text-lg font-semibold leading-6 text-fg">
          {t('titulo')}
        </h2>
        {estado.fase === 'listo' && (
          <StatusBadge
            estado="modulos"
            etiqueta={reordenando ? t('visiblesDe', { n: borradorOrden.length - borradorOcultos.length, total: borradorOrden.length }) : t('activos', { n: visibles.length })}
            tono="neutro"
            apariencia="suave"
          />
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {estado.fase === 'listo' && modulos.length > 0 && !reordenando && (
            <button type="button" onClick={empezarReordenar} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
              {t('reordenar')}
            </button>
          )}
          {reordenando && (
            <>
              <button type="button" disabled={guardando} onClick={() => guardar([], [])} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
                {t('restablecer')}
              </button>
              <button type="button" disabled={guardando} onClick={() => setReordenando(false)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                {t('cancelar')}
              </button>
              <button type="button" disabled={guardando} onClick={() => guardar(borradorOrden, borradorOcultos)} className={clasesBoton({ variante: 'primario', tamano: 'sm' })}>
                {t('listo')}
              </button>
            </>
          )}
        </div>
      </div>

      {reordenando && <p className="text-sm leading-5 text-fg-secondary">{t('ayudaReordenar')}</p>}
      {errorGuardar && (
        <p role="alert" className="text-sm text-danger">
          {t('errorGuardar')}
        </p>
      )}

      {estado.fase === 'cargando' ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : estado.fase === 'error' ? (
        <EmptyState variante="error" compacto onReintentar={() => recargar(false)} />
      ) : modulos.length === 0 ? (
        <EmptyState compacto titulo={t('vacioTitulo')} descripcion={t('vacioDesc')} />
      ) : reordenando ? (
        <ul className="flex flex-col gap-2">
          {listaReordenar.map((m, i) => {
            const Icono = iconos.get(m.idNav) ?? LayoutGrid;
            const nombre = tNav(m.etiqueta);
            const enInicio = !borradorOcultos.includes(m.codigo);
            return (
              <li key={m.codigo} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2" data-modulo={m.codigo}>
                <GripVertical aria-hidden="true" className="size-4 text-fg-secondary" strokeWidth={1.5} />
                <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-lg bg-brand-tint text-brand">
                  <Icono className="size-4" strokeWidth={1.5} />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{nombre}</span>
                <button
                  type="button"
                  aria-label={t('subir', { modulo: nombre })}
                  disabled={i === 0}
                  onClick={() => setBorradorOrden((o) => moverModulo(o, m.codigo, -1))}
                  className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40"
                >
                  <ArrowUp aria-hidden="true" className="size-4" strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  aria-label={t('bajar', { modulo: nombre })}
                  disabled={i === listaReordenar.length - 1}
                  onClick={() => setBorradorOrden((o) => moverModulo(o, m.codigo, 1))}
                  className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40"
                >
                  <ArrowDown aria-hidden="true" className="size-4" strokeWidth={1.5} />
                </button>
                <label className="flex items-center gap-2 text-xs text-fg-secondary">
                  <span className="max-sm:sr-only">{t('enElInicio')}</span>
                  <Switch
                    checked={enInicio}
                    aria-label={t('mostrarEnInicio', { modulo: nombre })}
                    onCheckedChange={(v) =>
                      setBorradorOcultos((o) => (v ? o.filter((c) => c !== m.codigo) : [...o, m.codigo]))
                    }
                  />
                </label>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibles.map((m) => {
            const r = m.resumen;
            const Icono = iconos.get(m.idNav) ?? LayoutGrid;
            const nombre = tNav(m.etiqueta);
            const abierto = abiertos.includes(m.codigo);
            const idPanel = `inicio-modulo-${m.codigo}`;
            const solido = estado.fase === 'listo' && estado.datos.badgeSolido === m.codigo;
            return (
              <li key={m.codigo} className="rounded-lg border border-line bg-surface" data-modulo={m.codigo}>
                <button
                  type="button"
                  aria-expanded={abierto}
                  aria-controls={idPanel}
                  onClick={() => alternar(m.codigo)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
                    <Icono className="size-4" strokeWidth={1.5} />
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-fg">{nombre}</span>
                  {r?.badge && (
                    <StatusBadge
                      estado={r.badge.clave}
                      etiqueta={t(r.badge.clave, r.badge.params)}
                      tono={r.tono}
                      apariencia={solido ? 'solido' : 'suave'}
                      className="shrink-0"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs text-fg-secondary max-sm:hidden" data-resumen>
                    {r?.error ? t('errorModulo') : r ? textoResumen(r, t, cifra) : null}
                  </span>
                  <ChevronDown aria-hidden="true" className={cn('ml-auto size-4 shrink-0 text-fg-secondary transition-transform', abierto && 'rotate-180')} strokeWidth={1.5} />
                </button>
                {abierto && (
                  <div id={idPanel} className="flex flex-col gap-3 border-t border-line px-3 pb-3 pt-3">
                    {r?.error ? (
                      <EmptyState variante="error" compacto onReintentar={() => recargar(false)} />
                    ) : r ? (
                      <>
                        <p className="text-xs text-fg-secondary sm:hidden">{textoResumen(r, t, cifra)}</p>
                        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                          {r.kpis.map((k, i) => (
                            <Kpi key={`${k.etiqueta}-${i}`} kpi={k} cifra={cifra} />
                          ))}
                        </div>
                      </>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-fg-secondary">
                      <span>
                        {t('pie', {
                          alcance,
                          cuando: r?.usaPeriodo ? t('cuandoPeriodo') : t('cuandoHoy'),
                          hora: estado.fase === 'listo' ? formatTime(estado.datos.calculadoEn) : '',
                        })}
                      </span>
                      <Link href={m.href} className="ml-auto rounded-md font-medium text-link outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand">
                        {t('verModulo')}
                        <span className="sr-only">: {nombre}</span>
                      </Link>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
