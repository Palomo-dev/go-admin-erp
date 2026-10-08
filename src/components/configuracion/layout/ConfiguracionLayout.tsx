'use client';

/**
 * Configuración unificada (decisión del dueño, 2026-10-07; Figma página «10
 * Configuración», sección «10. Configuración unificada»).
 *
 * - Escritorio: menú lateral con buscador y los módulos del plan (el abierto
 *   muestra sus secciones); a la derecha, la sección elegida.
 * - Celular: índice de módulos con buscador; al abrir uno, sus secciones como
 *   chips y la sección debajo.
 * - Buscador: lleva directo a cualquier ajuste («Módulo › Sección»).
 * - Deep link estable `?modulo=&seccion=#ancla`: baja al ajuste y lo resalta.
 * - Qué se ve y qué se edita lo decide el servidor (`useSeccionesPermitidas`).
 */
import { useCallback, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Breadcrumbs, EmptyState, SearchInput, useEsEscritorio } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/Utils';
import { CONFIG_MODULES } from '../config/configModulesRegistry';
import type { SeccionConfig } from '../config/configSectionsRegistry';
import { buscarAjustes, construirIndice } from '../config/buscadorConfiguracion';
import { useConfiguracionState } from '../hooks/useConfiguracionState';
import { useSeccionesPermitidas } from '../hooks/useSeccionesPermitidas';
import { useResaltarAncla } from '../hooks/useResaltarAncla';
import { ConfiguracionSidebar, type ModuloMenu } from './ConfiguracionSidebar';
import { ConfiguracionSearch } from './ConfiguracionSearch';
import { ConfiguracionPanelRenderer } from './ConfiguracionPanelRenderer';
import { AvisoMovido } from './AvisoMovido';

function Esqueleto() {
  return (
    <div className="flex h-full" aria-busy="true">
      <div className="hidden w-72 shrink-0 flex-col gap-3 border-r border-line bg-sidebar p-4 lg:flex">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-full" />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
      <div className="flex-1 space-y-4 p-4 lg:p-8">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function ConfiguracionLayout() {
  const t = useTranslations('configuracionUnificada');
  const estado = useConfiguracionState();
  const permitidas = useSeccionesPermitidas();
  const esEscritorio = useEsEscritorio();
  const [consulta, setConsulta] = useState('');

  const menu = useMemo<ModuloMenu[]>(() => {
    return CONFIG_MODULES.map((modulo) => ({
      modulo,
      secciones: permitidas.secciones.filter((p) => p.seccion.modulo === modulo.id).map((p) => p.seccion),
    })).filter((m) => m.secciones.length > 0);
  }, [permitidas.secciones]);

  const indice = useMemo(
    () =>
      construirIndice(
        permitidas.secciones.map((p) => p.seccion),
        {
          modulo: (id) => t(`modulos.${id}`),
          seccion: (clave) => ({ titulo: t(`secciones.${clave}.titulo`), palabras: t(`secciones.${clave}.palabras`) }),
          ajuste: (clave) => ({ titulo: t(`ajustes.${clave}.titulo`), palabras: t(`ajustes.${clave}.palabras`) }),
        },
      ),
    [permitidas.secciones, t],
  );
  const resultados = useMemo(() => buscarAjustes(consulta, indice), [consulta, indice]);

  // Sección efectiva: la de la URL si la persona puede verla; en escritorio, sin
  // módulo en la URL, la primera disponible. En el celular, sin módulo, el índice.
  const pedida = estado.seccion ? permitidas.secciones.find((p) => p.seccion.id === estado.seccion?.id) : undefined;
  const actual = pedida ?? (esEscritorio && !estado.moduleId ? permitidas.secciones.find((p) => p.seccion.id === menu[0]?.secciones[0]?.id) : undefined);
  const moduloActual = actual ? CONFIG_MODULES.find((m) => m.id === actual.seccion.modulo) : undefined;
  const seccionesModulo = menu.find((m) => m.modulo.id === moduloActual?.id)?.secciones ?? [];

  useResaltarAncla(consulta ? null : estado.ajuste, actual?.seccion.id);

  const elegirSeccion = useCallback(
    (s: SeccionConfig) => {
      setConsulta('');
      estado.setSeccion(s);
    },
    [estado],
  );
  const elegirModulo = useCallback(
    (id: string) => {
      setConsulta('');
      estado.setModule(id);
    },
    [estado],
  );

  if (permitidas.cargando) return <Esqueleto />;
  if (permitidas.error) {
    return (
      <div className="p-4 lg:p-8">
        <EmptyState variante="error" titulo={t('estados.errorTitulo')} descripcion={permitidas.error} onReintentar={() => void permitidas.recargar()} />
      </div>
    );
  }
  if (menu.length === 0) {
    return (
      <div className="p-4 lg:p-8">
        <EmptyState variante="empty" icono={Settings} titulo={t('estados.vacioTitulo')} descripcion={t('estados.vacioDescripcion')} />
      </div>
    );
  }

  const buscador = (id: string) => (
    <SearchInput
      id={id}
      value={consulta}
      onChange={setConsulta}
      onValueChange={setConsulta}
      debounceMs={150}
      placeholder={t('buscar.placeholder')}
      etiqueta={t('buscar.etiqueta')}
      className="w-full"
    />
  );

  const tituloModulo = moduloActual ? t(`modulos.${moduloActual.id}`) : '';
  const tituloSeccion = actual ? t(`secciones.${actual.seccion.clave}.titulo`) : '';

  const seccionVista = actual && moduloActual && (
    <div className="flex min-w-0 max-w-5xl flex-col gap-4">
      <Breadcrumbs migas={[{ etiqueta: t('titulo') }, { etiqueta: tituloModulo }, { etiqueta: tituloSeccion }]} className="hidden lg:block" />
      <header className="flex items-center gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-subtle text-fg-secondary">
          <moduloActual.icon className="size-5" strokeWidth={1.5} />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-7 text-fg lg:text-2xl">{tituloSeccion}</h1>
          <p className="text-sm text-fg-secondary">{t(`secciones.${actual.seccion.clave}.descripcion`)}</p>
        </div>
      </header>
      {/* Fijo arriba: al llegar con ancla la página baja hasta el ajuste y el aviso tiene que seguir a la vista. */}
      <div className="sticky top-0 z-10 empty:hidden">
        <AvisoMovido origen={estado.movido} onVisto={estado.quitarMovido} />
      </div>
      <ConfiguracionPanelRenderer
        key={actual.seccion.id}
        seccion={actual.seccion}
        puedeEditar={actual.puedeEditar}
        algunAjusteEditable={Object.values(actual.ajustes).some(Boolean)}
      />
    </div>
  );

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-72 shrink-0 flex-col gap-3 overflow-y-auto border-r border-line bg-sidebar px-3 py-4 lg:flex">
        <p className="flex items-center gap-2 px-1 text-base font-semibold text-fg">
          <Settings aria-hidden="true" className="size-[18px]" />
          {t('titulo')}
        </p>
        {buscador('config-buscar-escritorio')}
        <ConfiguracionSidebar
          modulos={menu}
          moduloActivo={moduloActual?.id ?? null}
          seccionActiva={consulta ? null : actual?.seccion.id ?? null}
          onModulo={elegirModulo}
          onSeccion={elegirSeccion}
        />
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto bg-canvas px-4 py-4 lg:px-10 lg:py-7">
        {!esEscritorio && (actual ? (
          <div className="mb-4 flex flex-col gap-3">
            <button
              type="button"
              onClick={estado.limpiarModulo}
              className="inline-flex items-center gap-1.5 self-start rounded-md text-sm font-medium text-fg-secondary outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              {t('menu.volver')}
            </button>
            {seccionesModulo.length > 1 && (
              <nav aria-label={t('menu.secciones', { modulo: tituloModulo })} className="-mx-4 overflow-x-auto px-4">
                <ul className="flex gap-2">
                  {seccionesModulo.map((s) => {
                    const activa = s.id === actual.seccion.id;
                    return (
                      <li key={s.id} className="shrink-0">
                        <button
                          type="button"
                          onClick={() => elegirSeccion(s)}
                          aria-current={activa ? 'page' : undefined}
                          className={cn(
                            'rounded-full border px-3 py-1.5 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand',
                            activa ? 'border-line-brand bg-brand-tint text-brand' : 'border-line bg-surface text-fg-secondary',
                          )}
                        >
                          {t(`secciones.${s.clave}.titulo`)}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            )}
          </div>
        ) : (
          <div className="mb-4">{buscador('config-buscar-movil')}</div>
        ))}

        {consulta.trim() ? (
          <ConfiguracionSearch consulta={consulta} resultados={resultados} onLimpiar={() => setConsulta('')} onElegir={() => setConsulta('')} />
        ) : seccionVista ? (
          seccionVista
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">{t('menu.modulosPlan')}</p>
            <ul aria-label={t('menu.aria')} className="overflow-hidden rounded-xl border border-line bg-surface">
              {menu.map(({ modulo, secciones }) => (
                <li key={modulo.id} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => elegirModulo(modulo.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                  >
                    <modulo.icon aria-hidden="true" className="size-[18px] shrink-0 text-fg-secondary" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium text-fg">{t(`modulos.${modulo.id}`)}</span>
                      <span className="block truncate text-xs text-fg-muted">{secciones.map((s) => t(`secciones.${s.clave}.titulo`)).join(', ')}</span>
                    </span>
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-fg-muted">{t('menu.soloActivos')}</p>
          </div>
        )}
      </main>
    </div>
  );
}
