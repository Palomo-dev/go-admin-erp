'use client';

/**
 * Catálogo (diseño 85-00): chips por grupo con conteo y secciones con tarjetas. El estado de cada
 * tarjeta lo decide el servidor (`construirCatalogo`): nada se muestra «Disponible» sin conector.
 * El grupo elegido y el filtro de estado («Filtros» de la barra) viven en la URL (`grupo`, `estado`).
 */
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { ChipsOpcion, EmptyState, Skeleton } from '@/components/kit';
import {
  conteoPorGrupo,
  filtrarCatalogo,
  type GrupoCatalogo,
  type ItemCatalogo,
} from '@/lib/services/integrations/conexiones/catalogoConexiones';
import { ORDEN_GRUPOS } from '../presentacion';
import { filtrarCatalogoPorEstado, grupoDeUrl, type Filtros } from '../filtrosConexiones';
import { TarjetaServicio } from './TarjetaServicio';

type Filtro = GrupoCatalogo | 'todos';

export interface PestanaCatalogoProps {
  items: ItemCatalogo[];
  cargando: boolean;
  error: string | null;
  busqueda: string;
  filtros: Filtros;
  onGrupoChange: (grupo: Filtro) => void;
  onLimpiarFiltros: () => void;
  onReintentar: () => void;
  nombreServicio: (i: ItemCatalogo) => string;
  onAbrirFicha: (i: ItemCatalogo) => void;
}

export function PestanaCatalogo({ items, cargando, error, busqueda, filtros, onGrupoChange, onLimpiarFiltros, onReintentar, nombreServicio, onAbrirFicha }: PestanaCatalogoProps) {
  const t = useTranslations('integracionesConexiones');
  const grupo = grupoDeUrl(filtros);
  const conteo = useMemo(() => conteoPorGrupo(items), [items]);
  const visibles = useMemo(
    () => filtrarCatalogoPorEstado(filtrarCatalogo(items, grupo, busqueda, nombreServicio), filtros),
    [items, grupo, busqueda, nombreServicio, filtros],
  );

  if (cargando) {
    return (
      <ul aria-busy="true" aria-label={t('comun.cargando')} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i}>
            <Skeleton className="h-36 rounded-xl" />
          </li>
        ))}
      </ul>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-line bg-surface">
        <EmptyState variante="error" titulo={t('comun.errorCarga')} descripcion={error} onReintentar={onReintentar} />
      </div>
    );
  }

  const opciones = (['todos', ...ORDEN_GRUPOS] as Filtro[]).map((g) => ({
    valor: g,
    etiqueta: t(`grupos.${g}.chip`),
    adorno: <span className="text-fg-muted">{conteo[g] ?? 0}</span>,
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* En celular los chips de grupo se desplazan en horizontal en lugar de ocupar cuatro líneas. */}
      <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 sm:pb-0 sm:overflow-visible">
        <ChipsOpcion<Filtro> opciones={opciones} valor={grupo} onValorChange={onGrupoChange} etiqueta={t('catalogo.filtroGrupo')} className="w-max flex-nowrap sm:w-auto sm:flex-wrap" />
      </div>

      {visibles.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState variante="search" termino={busqueda} onLimpiarFiltros={onLimpiarFiltros} />
        </div>
      ) : (
        ORDEN_GRUPOS.map((g) => {
          const delGrupo = visibles.filter((i) => i.grupo === g);
          if (delGrupo.length === 0) return null;
          return (
            <section key={g} aria-labelledby={`grupo-${g}`} className="flex flex-col gap-3">
              <div>
                <h2 id={`grupo-${g}`} className="text-base font-semibold text-fg">{t(`grupos.${g}.titulo`)}</h2>
                <p className="text-sm text-fg-secondary">{t(`grupos.${g}.descripcion`)}</p>
              </div>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {delGrupo.map((item) => (
                  <li key={item.id} className="flex">
                    <TarjetaServicio item={item} nombre={nombreServicio(item)} onAbrirFicha={onAbrirFicha} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
