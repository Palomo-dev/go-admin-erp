'use client';

/**
 * Organización › Plan y facturación › Módulos (Figma 08, sección 7).
 *
 * - Agrupados por vertical (la sección del módulo en el catálogo del menú).
 * - Básicos (`modules.is_core`): etiqueta «Básico» y candado «Incluido
 *   siempre», sin interruptor.
 * - No incluidos en el plan: «Disponible en el plan X · Ver planes».
 * - Páginas del módulo con interruptor «Visible / Oculta»; atenuadas y sin
 *   interruptor si el módulo está apagado.
 * - «Restablecer» va en el «⋯» de la cabecera con ConfirmDialog.
 *
 * La organización sale de la sesión (`/api/me/capacidades`), no de
 * `localStorage`. Las escrituras pasan por `/api/modules` y
 * `/api/modules/pages`, que exigen administrador. Qué página se ve lo decide
 * SOLO `paginaActiva()` (ausente = visible): la misma regla que el menú.
 */
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, ChevronDown, ChevronRight, Grid3x3, Lock, RotateCcw, Package } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/config';
import { EmptyState, RowActionsMenu, SearchInput, StatusBadge, clasesBoton } from '@/components/kit';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useModuleContext } from '@/lib/context/ModuleContext';
import { moduleManagementService, type Module } from '@/lib/services/moduleManagementService';
import { MODULE_PAGES, type ModulePage } from '@/lib/config/modulePages';
import { paginaActiva } from '@/lib/navigation/paginaActiva';
import { moduloPorCodigo } from '@/lib/navigation/catalog';
import { useNombresNav } from '@/lib/navigation/useNombresNav';
import {
  agruparPorVertical,
  coincideModulo,
  cupoOpcionales,
  estadoModulo,
  opcionalesActivos,
  type EstadoModulo,
  type PlanModulos,
} from '@/lib/organizacion/modulos';
import { cn } from '@/utils/Utils';
import { PantallaOrganizacion } from '@/components/organization/acceso/PantallaOrganizacion';
import { useCupoPlan } from '@/components/organization/acceso/useCupoPlan';

function iconoModulo(code: string) {
  return moduloPorCodigo(code)?.icono ?? Package;
}

interface Datos {
  modulos: Module[];
  activos: Set<string>;
  ocultas: Record<string, string[]>;
  planes: PlanModulos[];
}

function Modulos({ organizationId, pedidoRestablecer }: { organizationId: number; pedidoRestablecer: number }) {
  const t = useTranslations('org.acceso.modulos');
  const tNav = useTranslations('nav');
  const nombres = useNombresNav();
  const pathname = usePathname();
  const cupo = useCupoPlan();
  const moduleContext = useModuleContext();
  const [, startTransition] = useTransition();

  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState(false);
  const [texto, setTexto] = useState('');
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [restablecer, setRestablecer] = useState(false);
  const [restableciendo, setRestableciendo] = useState(false);

  const cargar = useCallback(async () => {
    setError(false);
    try {
      const [modulos, ocultas, activos, planes] = await Promise.all([
        moduleManagementService.getAllModules(),
        moduleManagementService.getHiddenModulePages(organizationId),
        moduleManagementService.getActiveModules(organizationId),
        supabase.from('plans').select('code, name, max_modules, price_cop_month, is_active, is_custom_enterprise, module_config'),
      ]);
      setDatos({
        modulos,
        ocultas,
        activos: new Set(activos.map((m) => m.code)),
        planes: (planes.data ?? []) as PlanModulos[],
      });
    } catch (e) {
      console.warn('[modulos] carga', e instanceof Error ? e.message : e);
      setError(true);
    }
  }, [organizationId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // «⋯ › Restablecer» de la cabecera abre la confirmación.
  useEffect(() => {
    if (pedidoRestablecer > 0) setRestablecer(true);
  }, [pedidoRestablecer]);

  const planActual = useMemo(
    () => datos?.planes.find((p) => p.code === cupo.datos?.plan?.codigo) ?? null,
    [datos?.planes, cupo.datos?.plan?.codigo],
  );
  const ctx = useMemo(
    () => (datos ? { modulos: datos.modulos, activos: datos.activos, plan: planActual, planes: datos.planes } : null),
    [datos, planActual],
  );

  const nombreModulo = (m: Module) => {
    const etiqueta = moduloPorCodigo(m.code)?.etiqueta;
    return etiqueta && tNav.has(etiqueta) ? tNav(etiqueta) : m.name;
  };
  const paginasDe = (codigo: string): ModulePage[] => MODULE_PAGES[codigo] ?? [];
  const visible = (codigo: string, href: string) =>
    paginaActiva(codigo, href, { modulosActivos: [codigo], paginasOcultas: datos?.ocultas ?? {} });

  const avisarMenu = (detalle?: Record<string, unknown>) => {
    window.dispatchEvent(detalle ? new CustomEvent('modules-updated', { detail: detalle }) : new Event('modules-updated'));
  };

  const conmutarModulo = async (m: Module, activo: boolean) => {
    if (!datos) return;
    const antes = datos;
    const activos = new Set(datos.activos);
    if (activo) activos.delete(m.code);
    else activos.add(m.code);
    setDatos({ ...datos, activos });
    setOcupado(m.code);
    try {
      const res = await fetch('/api/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          moduleCode: m.code,
          action: activo ? 'deactivate' : 'activate',
          modulePages: activo ? undefined : paginasDe(m.code),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
      if (!res.ok || !json.success) throw new Error(res.status === 403 ? t('toasts.sinPermiso') : json.message);
      // Encender o apagar el módulo deja todas sus páginas visibles.
      const ocultas = { ...datos.ocultas };
      delete ocultas[m.code];
      setDatos((d) => (d ? { ...d, ocultas } : d));
      startTransition(() => moduleContext.refreshModules());
      avisarMenu({ paginasOcultas: ocultas, activeModuleCodes: [...activos] });
      setTimeout(() => avisarMenu(), 500);
      toast.success(t(activo ? 'toasts.apagado' : 'toasts.encendido', { modulo: nombreModulo(m) }));
    } catch (e) {
      setDatos(antes);
      toast.error(t('toasts.errorModulo'), { description: e instanceof Error && e.message ? e.message : undefined });
    } finally {
      setOcupado(null);
    }
  };

  const conmutarPagina = async (codigo: string, p: ModulePage, estaVisible: boolean) => {
    if (!datos) return;
    const antes = datos.ocultas;
    const delModulo = antes[codigo] ?? [];
    const ocultas = { ...antes, [codigo]: estaVisible ? [...delModulo, p.href] : delModulo.filter((h) => h !== p.href) };
    setDatos({ ...datos, ocultas });
    setOcupado(`${codigo}:${p.href}`);
    avisarMenu({ paginasOcultas: ocultas });
    try {
      const res = await fetch('/api/modules/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, moduleCode: codigo, pageHref: p.href, pageName: p.name, isActive: !estaVisible }),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
      if (!res.ok || !json.success) throw new Error(res.status === 403 ? t('toasts.sinPermiso') : json.message);
      avisarMenu();
    } catch (e) {
      setDatos((d) => (d ? { ...d, ocultas: antes } : d));
      avisarMenu({ paginasOcultas: antes });
      toast.error(t('toasts.errorPagina'), { description: e instanceof Error && e.message ? e.message : undefined });
    } finally {
      setOcupado(null);
    }
  };

  /** Vuelven a verse todas las páginas de los módulos encendidos. Los módulos no cambian. */
  const ejecutarRestablecer = async () => {
    if (!datos) return;
    setRestableciendo(true);
    let fallos = 0;
    for (const [codigo, hrefs] of Object.entries(datos.ocultas)) {
      for (const href of hrefs) {
        const p = paginasDe(codigo).find((x) => x.href === href);
        if (!p) continue;
        const res = await fetch('/api/modules/pages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ organizationId, moduleCode: codigo, pageHref: href, pageName: p.name, isActive: true }),
        }).catch(() => null);
        if (!res?.ok) fallos++;
      }
    }
    await cargar();
    avisarMenu();
    setRestableciendo(false);
    setRestablecer(false);
    if (fallos > 0) toast.error(t('toasts.restablecerParcial', { n: fallos }));
    else toast.success(t('toasts.restablecido'));
  };

  if (error) return <EmptyState variante="error" titulo={t('error.titulo')} descripcion={t('error.descripcion')} onReintentar={() => void cargar()} />;
  if (!datos || !ctx) {
    return (
      <div className="flex flex-col gap-3" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  const grupos = agruparPorVertical(datos.modulos)
    .map((g) => ({ ...g, modulos: g.modulos.filter((m) => coincideModulo(m, texto, paginasDe(m.code))) }))
    .filter((g) => g.modulos.length > 0);
  const tituloGrupo = (clave: string) => (clave === 'nucleo' ? t('grupos.nucleo') : clave === 'otros' ? t('grupos.otros') : tNav(seccionNav(clave)));
  const cupoMods = cupoOpcionales(ctx);
  const usados = opcionalesActivos(ctx);

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={texto} onChange={setTexto} onValueChange={setTexto} placeholder={t('busqueda.placeholder')} etiqueta={t('busqueda.etiqueta')} className="sm:max-w-md sm:flex-1" />
        {cupoMods !== null && (
          <p className={cn('text-[13px]', usados >= cupoMods ? 'text-warning-text' : 'text-fg-secondary')}>
            {t('cupo', { usados, maximo: cupoMods })}
          </p>
        )}
      </div>

      {grupos.length === 0 && <EmptyState variante="search" termino={texto} onLimpiarFiltros={() => setTexto('')} />}

      {grupos.map((g) => {
        const todosFuera = g.modulos.every((m) => estadoModulo(m, ctx).tipo === 'otroPlan');
        return (
          <section key={g.clave} aria-labelledby={`grupo-${g.clave}`} className="flex flex-col gap-3">
            <div>
              <h2 id={`grupo-${g.clave}`} className="text-base font-semibold text-fg">
                {tituloGrupo(g.clave)}
              </h2>
              <p className="text-[13px] text-fg-secondary">
                {g.clave === 'nucleo' ? t('grupos.nucleoDescripcion') : todosFuera ? t('grupos.noIncluidos') : t('grupos.opcionales')}
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {g.modulos.map((m) => {
                const estado = estadoModulo(m, ctx);
                const encendido = estado.tipo === 'basico' || estado.tipo === 'activo';
                const paginas = paginasDe(m.code);
                const abierto = abiertos.has(m.code);
                const nVisibles = paginas.filter((p) => visible(m.code, p.href)).length;
                const Icono = iconoModulo(m.code);
                return (
                  <li key={m.code} className={cn('rounded-xl border border-line bg-surface', abierto && 'border-line-brand')}>
                    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 gap-3">
                        <span aria-hidden="true" className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', encendido ? 'bg-brand-tint text-brand' : 'bg-subtle text-fg-muted')}>
                          <Icono className="size-5" strokeWidth={1.5} />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-fg">{nombreModulo(m)}</h3>
                            {estado.tipo === 'basico' && <StatusBadge estado="basico" tono="neutro" etiqueta={t('basico')} tamano="sm" />}
                            {estado.tipo === 'otroPlan' && <StatusBadge estado="plan" tono="marca" etiqueta={estado.plan ?? t('aMedida')} tamano="sm" />}
                          </div>
                          {m.description && <p className="text-[13px] text-fg-secondary">{m.description}</p>}
                        </div>
                      </div>
                      <ControlModulo
                        estado={estado}
                        cargando={ocupado === m.code}
                        nombre={nombreModulo(m)}
                        onConmutar={() => void conmutarModulo(m, estado.tipo === 'activo')}
                      />
                    </div>
                    {paginas.length > 1 && estado.tipo !== 'otroPlan' && (
                      <div className="border-t border-line px-4 py-2">
                        <button
                          type="button"
                          aria-expanded={abierto}
                          aria-controls={`paginas-${m.code}`}
                          onClick={() =>
                            setAbiertos((s) => {
                              const n = new Set(s);
                              if (n.has(m.code)) n.delete(m.code);
                              else n.add(m.code);
                              return n;
                            })
                          }
                          className="flex w-full items-center justify-between gap-2 rounded-md py-1 text-[13px] font-medium text-fg-secondary hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            {abierto ? <ChevronDown aria-hidden="true" className="size-4" /> : <ChevronRight aria-hidden="true" className="size-4" />}
                            {t('paginas.titulo')}
                          </span>
                          <span className="tabular-nums">{encendido ? t('paginas.visibles', { n: nVisibles, total: paginas.length }) : t('paginas.moduloApagado')}</span>
                        </button>
                        {abierto && (
                          <ul id={`paginas-${m.code}`} className={cn('mt-2 flex flex-col divide-y divide-line', !encendido && 'opacity-60')}>
                            {paginas.map((p) => {
                              const esVisible = visible(m.code, p.href);
                              const ultima = esVisible && nVisibles <= 1;
                              const actual = pathname === p.href;
                              const motivo = !encendido ? t('paginas.motivoApagado') : ultima ? t('paginas.motivoUltima') : actual ? t('paginas.motivoActual') : undefined;
                              return (
                                <li key={p.href} className="flex items-center justify-between gap-3 py-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm text-fg">{nombres.pagina({ href: p.href, nombre: p.name })}</p>
                                    <p className="truncate font-mono text-xs text-fg-muted">{p.href}</p>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-2">
                                    <span className="text-xs text-fg-secondary">{encendido && esVisible ? t('paginas.visible') : t('paginas.oculta')}</span>
                                    <Switch
                                      checked={encendido && esVisible}
                                      disabled={!!motivo || ocupado === `${m.code}:${p.href}`}
                                      title={motivo}
                                      aria-label={t('paginas.aria', { pagina: nombres.pagina({ href: p.href, nombre: p.name }) })}
                                      onCheckedChange={() => void conmutarPagina(m.code, p, esVisible)}
                                    />
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <ConfirmDialog
        open={restablecer}
        onOpenChange={(o) => !o && !restableciendo && setRestablecer(false)}
        title={t('restablecer.titulo')}
        description={t('restablecer.descripcion')}
        confirmLabel={t('restablecer.confirmar')}
        cancelLabel={t('restablecer.cancelar')}
        loading={restableciendo}
        onConfirm={ejecutarRestablecer}
      />
    </div>
  );
}

/** Código de sección del catálogo → clave `nav.section*`. */
function seccionNav(clave: string): string {
  const mapa: Record<string, string> = {
    principal: 'sectionMain',
    ventas: 'sectionSales',
    gestion: 'sectionManagement',
    organizacion: 'sectionOrganization',
    sistema: 'sectionSystem',
  };
  return mapa[clave] ?? 'sectionSystem';
}

function ControlModulo({ estado, cargando, nombre, onConmutar }: { estado: EstadoModulo; cargando: boolean; nombre: string; onConmutar: () => void }) {
  const t = useTranslations('org.acceso.modulos');
  switch (estado.tipo) {
    case 'basico':
      return (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] text-fg-secondary">
          <Lock aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('incluidoSiempre')}
        </span>
      );
    case 'otroPlan':
      return (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="text-[13px] text-fg-secondary">{estado.plan ? t('disponibleEn', { plan: estado.plan }) : t('soloAMedida')}</span>
          <Link href="/app/organizacion/plan" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
            {t('verPlanes')}
            <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </Link>
        </div>
      );
    default: {
      const limite = estado.tipo === 'limite';
      return (
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[13px] text-fg-secondary">{estado.tipo === 'activo' ? t('activo') : limite ? t('limite') : t('apagado')}</span>
          <Switch checked={estado.tipo === 'activo'} disabled={cargando || limite} title={limite ? t('limiteMotivo') : undefined} aria-label={t('aria', { modulo: nombre })} onCheckedChange={onConmutar} />
        </div>
      );
    }
  }
}

export default function ModulosPage() {
  const t = useTranslations('org.acceso.modulos');
  const cupo = useCupoPlan();
  const [pedirRestablecer, setPedirRestablecer] = useState(0);
  const plan = cupo.datos?.plan?.nombre;
  const menu = (
    <RowActionsMenu
      orientacion="horizontal"
      tamano="md"
      titulo={t('titulo')}
      acciones={[
        { id: 'restablecer', etiqueta: t('menu.restablecer'), descripcion: t('menu.restablecerDescripcion'), icono: RotateCcw, onSelect: () => setPedirRestablecer((n) => n + 1) },
        { id: 'planes', etiqueta: t('menu.compararPlanes'), icono: ArrowUpRight, onSelect: () => (window.location.href = '/app/organizacion/plan') },
      ]}
    />
  );
  return (
    <PantallaOrganizacion
      titulo={t('titulo')}
      subtitulo={plan ? t('subtitulo', { plan }) : t('subtituloSinPlan')}
      icono={Grid3x3}
      permiso="organizacion"
      acciones={menu}
      movil={{ accion: menu }}
    >
      {({ organizationId }) => <Modulos key={organizationId} organizationId={organizationId} pedidoRestablecer={pedirRestablecer} />}
    </PantallaOrganizacion>
  );
}
