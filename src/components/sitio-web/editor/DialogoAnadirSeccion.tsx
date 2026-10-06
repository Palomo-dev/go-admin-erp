'use client';

/**
 * «Añadir sección» por propósito (Figma A/05e; C-reorganizado 03 y 05): buscador arriba, lista
 * de propósitos con su contador a la izquierda (Presentar, Carta, Reservar, Confianza,
 * Ubicación, Vender…), miniaturas de las secciones del propósito a la derecha y «Cancelar» /
 * «+ Añadir sección». La sección se añade DESPUÉS de la seleccionada.
 *
 * El catálogo y su agrupación salen de `sectionsByBranchType` (sin lista propia) y «Faltan datos»
 * de los conteos reales del ERP (`avisoFaltanDatos`): no bloquea.
 */
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/utils/Utils';
import { Dialogo, EmptyState, SearchInput } from '@/components/kit';
import type { SectionTypeDefinition } from '@/lib/services/websitePageBuilderService';
import type { BranchType } from '@/types/branch';
import { filtrarCatalogo, getSectionCatalogForBranch } from '@/lib/services/website/sectionsByBranchType';
import { avisoFaltanDatos, type ConteoFuentes } from '@/lib/services/website/fuentesDatosSecciones';
import { AvisoConAccion } from '@/components/organization/branding/editor/AvisoConAccion';
import { SectionThumbnail } from '@/components/sitio-web/ui/SectionThumbnail';
import { miniaturaDeSeccion } from './iconosSeccion';
import { useTextosEditor } from './textos';

const RECOMENDADAS = 'recomendadas';

export interface DialogoAnadirSeccionProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  onAnadir: (tipo: string, variante: string) => void;
  tipoSede?: BranchType | null;
  tipoPagina?: string | null;
  pagina: string;
  despuesDe: string | null;
  /** Nombre de la sede si se edita una sede V2 (la sección es solo de ella). */
  sede?: string | null;
  conteos: ConteoFuentes | null;
}

export function DialogoAnadirSeccion(p: DialogoAnadirSeccionProps) {
  const t = useTextosEditor();
  const [busqueda, setBusqueda] = useState('');
  const [grupo, setGrupo] = useState<string>(RECOMENDADAS);
  const [elegida, setElegida] = useState<SectionTypeDefinition | null>(null);
  const catalogo = useMemo(() => getSectionCatalogForBranch(p.tipoSede, { pageType: p.tipoPagina }), [p.tipoSede, p.tipoPagina]);
  const filtrado = useMemo(() => filtrarCatalogo(catalogo, busqueda), [catalogo, busqueda]);
  const buscando = busqueda.trim().length > 0;

  const grupos = useMemo(() => {
    const lista = filtrado.grupos
      .filter((g) => g.secciones.length > 0)
      .map((g) => ({ id: g.id as string, etiqueta: g.etiqueta, proposito: g.proposito, secciones: g.secciones }));
    if (filtrado.recomendadas.length > 0) {
      lista.unshift({ id: RECOMENDADAS, etiqueta: t('anadir.recomendadas'), proposito: t('anadir.recomendadasProposito'), secciones: filtrado.recomendadas });
    }
    return lista;
  }, [filtrado, t]);

  useEffect(() => {
    if (!p.abierto) return;
    setBusqueda('');
    setElegida(null);
    setGrupo(catalogo.recomendadas.length > 0 ? RECOMENDADAS : catalogo.grupos[0]?.id ?? RECOMENDADAS);
  }, [p.abierto, catalogo]);

  const activo = grupos.find((g) => g.id === grupo) ?? grupos[0];
  const sujeto = p.sede ?? t('sede.tuOrganizacion');
  const aviso = elegida ? avisoFaltanDatos(elegida.type, elegida.label, p.conteos, sujeto) : null;

  const anadir = () => {
    if (!elegida) return;
    p.onAnadir(elegida.type, elegida.variants[0]?.id ?? 'default');
    p.onAbiertoChange(false);
  };

  const lugar = p.despuesDe ? t('anadir.despuesDe', { seccion: p.despuesDe, pagina: p.pagina }) : t('anadir.enPagina', { pagina: p.pagina });
  return (
    <Dialogo
      abierto={p.abierto}
      onAbiertoChange={p.onAbiertoChange}
      titulo={p.sede ? t('anadir.tituloSede', { sede: p.sede }) : t('anadir.titulo')}
      descripcion={p.sede ? t('anadir.descripcionSede', { lugar, sede: p.sede }) : t('anadir.descripcion', { lugar })}
      ancho={880}
      primario={{
        etiqueta: aviso ? t('anadir.anadirIgual') : t('anadir.anadir'),
        onClick: anadir,
        deshabilitada: !elegida,
        motivo: elegida ? undefined : t('anadir.elige'),
      }}
    >
      <div className="flex flex-col gap-4">
        <SearchInput
          value={busqueda}
          onChange={setBusqueda}
          onValueChange={setBusqueda}
          debounceMs={0}
          placeholder={t('anadir.buscar')}
          etiqueta={t('anadir.buscarEtiqueta')}
          atajo={false}
          pistaAtajo={false}
        />
        <div className="grid min-h-[360px] grid-cols-[180px_minmax(0,1fr)] gap-4">
          <div role="tablist" aria-orientation="vertical" aria-label={t('anadir.propositos')} className="flex flex-col gap-1">
            {grupos.map((g) => (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={activo?.id === g.id}
                onClick={() => setGrupo(g.id)}
                className={cn(
                  'flex h-9 items-center justify-between rounded-lg px-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  activo?.id === g.id ? 'bg-brand-tint font-medium text-brand-deep' : 'text-fg hover:bg-hover',
                )}
              >
                <span className="truncate">{g.etiqueta}</span>
                <span className="text-xs tabular-nums text-fg-secondary">{g.secciones.length}</span>
              </button>
            ))}
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            {buscando && filtrado.coincidencias === 0 ? (
              <EmptyState variante="search" termino={busqueda} onLimpiarFiltros={() => setBusqueda('')} compacto />
            ) : activo ? (
              <>
                <h3 className="text-sm font-semibold text-fg">
                  {t('anadir.grupoTitulo', { grupo: activo.etiqueta, proposito: activo.proposito })}
                </h3>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {activo.secciones.map((def) => (
                    <SectionThumbnail
                      key={def.type}
                      tipo={miniaturaDeSeccion(def.type)}
                      etiqueta={def.label}
                      seleccionada={elegida?.type === def.type}
                      onSeleccionar={() => setElegida(def)}
                    />
                  ))}
                </div>
                {elegida && <p className="text-[13px] leading-[18px] text-fg-secondary">{elegida.description}</p>}
                {aviso && <AvisoConAccion titulo={aviso.titulo} detalle={aviso.detalle} accion={aviso.accion} />}
              </>
            ) : null}
          </div>
        </div>
        <p className="text-xs leading-4 text-fg-secondary">
          {buscando ? t('anadir.coinciden', { n: filtrado.coincidencias, total: catalogo.total }) : t('anadir.pie', { total: catalogo.total })}
        </p>
      </div>
    </Dialogo>
  );
}
