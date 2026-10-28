'use client';

/**
 * Inspector derecho de la sección seleccionada (Figma A/05a-05d, figma-estilo/01, D/05-23):
 * nombre, «menu_preview · variante «Pestañas»», Duplicar · Ocultar · Eliminar y las pestañas por
 * intención (A/05m): Diseño (variante y opciones de diseño), Contenido (datos del ERP con
 * enlaces de edición), Estilo (fondo, entrada, tipografía, dispositivos y colores) y Avanzado
 * (los campos de STYLE_FIELDS, con aviso).
 *
 * En una sede, las secciones compartidas con el sitio principal se editan igual: el primer cambio
 * pregunta «¿Cambiar solo en <Sede> o en todas las sedes?» (`PreguntaSede`, desde el hook).
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Copy, Eye, EyeOff, ExternalLink, Info, Trash2, TriangleAlert, UtensilsCrossed } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { AvisoTonal, TabBar, clasesBoton, idPanel, idPestana } from '@/components/kit';
import { getSectionDefinition, type ContentFieldDef, type WebsitePageSection } from '@/lib/services/websitePageBuilderService';
import { contenidoTrasEditarBody } from '@/lib/website/legales/documentoLegal';
import type { AvisoFaltanDatos } from '@/lib/services/website/fuentesDatosSecciones';
import { AvisoConAccion } from '@/components/organization/branding/editor/AvisoConAccion';
import type { ThemePalette } from '@/components/organization/branding/editor/fields/types';
import { SectionThumbnail } from '@/components/sitio-web/ui/SectionThumbnail';
import { RAIZ_SITIO_WEB } from '@/components/sitio-web/rutasSitioWeb';
import type { CategoriaInventarioMenu } from '@/components/sitio-web/paginas/tiposPaginas';
import { leerEstiloSeccion, visibilidadDeSeccion, type EstiloSeccion, type Visibilidad } from '@/lib/website/v2/estiloSeccion';
import { miniaturaDeSeccion, nombreDeSeccion, nombreDeVariante } from '../iconosSeccion';
import { useTextosEditor } from '../textos';
import { clavesPropiasTarjeta, esSeccionTarjetaProducto, heredadoTarjetaSeccion, restablecerClaveTarjeta, type EstiloTarjetaProducto } from '@/lib/website/tarjetaProducto';
import { CampoSeccion, campoVisible } from './CampoSeccion';
import { InspectorBanners } from './InspectorBanners';
import { InspectorTarjetaProducto } from './InspectorTarjetaProducto';
import { InspectorEstilo, type SedeEstilo, type TemaEstiloSeccion } from './InspectorEstilo';
import { PanelCarrusel, PanelPaginacion } from './PanelesListaCarrusel';
import { AjustesAnteriores } from './InspectorEncabezado';
import type { Apariencia } from './estiloUnico';
import { carruselGlobalActivo, carruselDesdeClavesAnteriores, cambioTextoEncabezado, valorTextoEncabezado, aplicarCambioContenido, capaAlSubirPrimeraImagen, campoCubiertoPorEstilo, entradasAnterioresSeccion } from './espaciadoSeccion';
import { TIPOS_CARRUSEL, TIPOS_PAGINACION, sanitizarCarrusel, sanitizarPaginacion } from '@/lib/website/v2/paginacionCarrusel';

export type PestanaSeccion = 'diseno' | 'contenido' | 'estilo' | 'avanzado';

const GRUPOS: Record<PestanaSeccion, readonly string[]> = {
  diseno: ['layout', 'carousel', 'behavior'],
  contenido: ['content', 'data'],
  estilo: [],
  avanzado: ['style', 'advanced'],
};

export const RUTA_CARTA_SITIO = `${RAIZ_SITIO_WEB}/carta`;

export interface InspectorSeccionProps {
  seccion: WebsitePageSection;
  organizationId?: number;
  enBorrador: boolean;
  onCambiarContenido: (contenido: Record<string, unknown>) => void;
  onCambiarVariante: (variante: string) => void;
  onCambiarEstilo: (estilo: EstiloSeccion | null) => void;
  /** Bloque 4: Estilo escribe ajustes y contenido a la vez (una sola opción por función). */
  onCambiarApariencia?: (a: Apariencia) => void;
  onCambiarVisibilidad: (v: Visibilidad) => void;
  onAlternarVisible: () => void;
  onDuplicar: () => void;
  onEliminar: () => void;
  /** Abrir el constructor de la carta (`menu_full`, orden y destacados). */
  onEditarCarta?: () => void;
  tema: TemaEstiloSeccion;
  paleta?: ThemePalette;
  catalogoFuentes: readonly string[];
  categorias: { lista: readonly CategoriaInventarioMenu[]; cargando: boolean; recargar?: () => void | Promise<void> };
  aviso?: AvisoFaltanDatos | null;
  /** Edición de una sede V2. */
  sede?: {
    nombre: string;
    estilo: SedeEstilo | null;
  } | null;
  pestanaInicial?: PestanaSeccion;
  className?: string;
  /** `product_card_style` del sitio, para mostrarlo cuando la sección no lo reemplaza. */
  estiloTarjetaSitio?: unknown;
  /** Carrusel global del tema (`documento.tema.carrusel`). */
  carruselSitio?: unknown;
  /** Copia el estilo de esta tarjeta a las demás secciones de productos de la página. */
  onAplicarTarjeta?: (estilo: EstiloTarjetaProducto) => void;
}

export function InspectorSeccion(p: InspectorSeccionProps) {
  const t = useTextosEditor();
  const [pestana, setPestana] = useState<PestanaSeccion>(p.pestanaInicial ?? 'diseno');
  const s = p.seccion;
  const definicion = getSectionDefinition(s.section_type);
  const nombre = nombreDeSeccion(s.section_type);
  const variante = nombreDeVariante(s.section_type, s.section_variant);
  const contenido = (s.content ?? {}) as Record<string, unknown>;
  const onCambiarContenido = (siguiente: Record<string, unknown>) =>
    p.onCambiarContenido(capaAlSubirPrimeraImagen(s.section_type, s.section_variant, contenido, siguiente));
  const estilo = useMemo(() => leerEstiloSeccion(s.settings), [s.settings]);
  const visibilidad = useMemo(() => visibilidadDeSeccion(s), [s]);
  const idTabs = `inspector-seccion-${s.id}`;

  const boletin = (definicion?.contentFields ?? []).some((c) => c.type === 'newsletter');
  const campos = (pest: PestanaSeccion): ContentFieldDef[] =>
    (definicion?.contentFields ?? []).filter((c) => {
      // El inspector del boletín ya escribe título, botón e imagen. Esos campos siguen
      // declarados porque el sitio público los pinta, pero no se muestran dos veces.
      if (boletin && c.type !== 'newsletter') return false;
      if (!GRUPOS[pest].includes(c.group ?? 'content')) return false;
      // Espaciado y ancho: una sola opción, en Estilo (Figma v2). Lo guardado sale en «Ajustes de versiones anteriores».
      if (campoCubiertoPorEstilo(c, s.section_type)) return false;
      if (!campoVisible(c, contenido, s.section_variant)) return false;
      // Ítems manuales: se esconden si la sección ya toma sus datos del ERP y no tiene ítems (A/05b).
      if (c.type === 'repeater' && c.key === 'items') {
        const conErp = definicion?.contentFields.some((x) => x.type === 'entity' && x.entity === 'category');
        const items = contenido.items;
        if (conErp && (!Array.isArray(items) || items.length === 0)) return false;
      }
      return true;
    });

  const pintarCampo = (c: ContentFieldDef) => {
    if (c.type === 'carta') {
      return (
        <div key={c.key} className="flex flex-col gap-2 rounded-lg border border-line p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-fg">
            <UtensilsCrossed aria-hidden="true" className="size-4 text-fg-secondary" strokeWidth={1.5} />
            {c.label}
          </p>
          <p className="text-[13px] leading-[18px] text-fg-secondary">{t('contenido.cartaAyuda')}</p>
          <div className="flex flex-wrap gap-2">
            {p.onEditarCarta && (
              <button type="button" onClick={p.onEditarCarta} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                {t('contenido.editarCartaAqui')}
              </button>
            )}
            <Link href={RUTA_CARTA_SITIO} target="_blank" rel="noopener noreferrer" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
              <ExternalLink aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('contenido.editarEnCarta')}
            </Link>
          </div>
        </div>
      );
    }
    return (
      <CampoSeccion
        key={c.key}
        campo={c}
        valor={c.key === 'body' ? (contenido.body ?? contenido.content) : valorTextoEncabezado(contenido, c.key, s.section_type)}
        contenido={contenido}
        onCambiar={(v) => {
          const siguiente: Record<string, unknown> =
            c.key === 'body' ? contenidoTrasEditarBody(contenido, String(v ?? ''), new Date().toISOString()) : cambioTextoEncabezado(contenido, c.key, v, s.section_type);
          // Exclusión mutua de categories_grid (como en el editor anterior).
          if (c.key === 'show_icon' && v === true) siguiente.show_image = false;
          if (c.key === 'show_image' && v === true) siguiente.show_icon = false;
          onCambiarContenido(siguiente);
        }}
        onCambiarContenido={onCambiarContenido}
        organizationId={p.organizationId}
        paleta={p.paleta}
        fondo={p.tema.colores.fondo ?? null}
        fuentes={p.tema.fuentes}
        categorias={p.categorias}
      />
    );
  };

  /** Campos con el título de su bloque («TEXTOS», «PAGO»…) cuando el bloque cambia (lámina 17). */
  const pintarConBloques = (lista: readonly ContentFieldDef[]) => {
    let bloque: string | undefined;
    return lista.flatMap((c) => {
      const nodos = [];
      // Tras los bloques propios de la sección, los campos comunes (ancho, espaciado) van aparte.
      const titulo = c.section ?? (bloque ? t('inspector.masOpciones') : undefined);
      if (titulo && c.section !== bloque) {
        nodos.push(
          <h3 key={`bloque-${titulo}`} className="-mb-1 pt-1 text-xs font-semibold uppercase leading-4 tracking-wide text-fg-secondary">
            {titulo}
          </h3>,
        );
      }
      bloque = c.section;
      nodos.push(pintarCampo(c));
      return nodos;
    });
  };

  const avisoBorrador = (
    <AvisoTonal
      tono="informacion"
      compacto
      titulo={p.enBorrador ? t('inspector.borradorTitulo') : t('inspector.legacyTitulo')}
      descripcion={p.enBorrador ? t('inspector.borradorDescripcion') : t('inspector.legacyDescripcion')}
    />
  );

  return (
    <aside aria-label={t('inspector.etiqueta', { nombre })} className={cn('flex min-h-0 flex-col bg-surface', p.className)}>
      <div className="flex items-start gap-2 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold leading-6 text-fg">
            {p.sede ? t('inspector.tituloSede', { nombre, sede: p.sede.nombre }) : nombre}
          </h2>
          <p className="truncate text-[13px] leading-[18px] text-fg-secondary">
            {t('inspector.tipoVariante', { tipo: s.section_type, variante })}
          </p>
        </div>
        <div className="flex shrink-0 items-center">
          <button type="button" onClick={p.onDuplicar} aria-label={t('inspector.duplicar')} title={t('inspector.duplicarAtajo')} className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'w-8 px-0')}>
            <Copy aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={p.onAlternarVisible}
            aria-label={s.is_visible ? t('inspector.ocultar') : t('inspector.mostrar')}
            aria-pressed={!s.is_visible}
            className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'w-8 px-0')}
          >
            {s.is_visible ? <EyeOff aria-hidden="true" className="size-4" strokeWidth={1.5} /> : <Eye aria-hidden="true" className="size-4" strokeWidth={1.5} />}
          </button>
          <button type="button" onClick={p.onEliminar} aria-label={t('inspector.eliminar')} title={t('inspector.eliminarAtajo')} className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'w-8 px-0')}>
            <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <TabBar
        id={idTabs}
        etiqueta={t('inspector.pestanas')}
        pestanas={[
          { valor: 'diseno', etiqueta: t('inspector.diseno') },
          { valor: 'contenido', etiqueta: t('inspector.contenido') },
          { valor: 'estilo', etiqueta: t('inspector.estilo') },
          { valor: 'avanzado', etiqueta: t('inspector.avanzado') },
        ]}
        valor={pestana}
        onValorChange={setPestana}
        className="mt-2 px-2"
      />

      <div role="tabpanel" id={idPanel(idTabs, pestana)} aria-labelledby={idPestana(idTabs, pestana)} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        {p.aviso && pestana !== 'estilo' && <AvisoConAccion titulo={p.aviso.titulo} detalle={p.aviso.detalleLienzo} accion={p.aviso.accion} />}

        {pestana === 'diseno' && (
          <>
            {definicion && definicion.variants.length > 1 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[13px] font-semibold leading-[18px] text-fg">{t('inspector.variante')}</h3>
                </div>
                <div role="group" aria-label={t('inspector.variante')} className="grid grid-cols-2 gap-3">
                  {definicion.variants.map((v) => (
                    <SectionThumbnail
                      key={v.id}
                      tipo={miniaturaDeSeccion(s.section_type)}
                      etiqueta={v.label}
                      seleccionada={s.section_variant === v.id}
                      onSeleccionar={() => p.onCambiarVariante(v.id)}
                    />
                  ))}
                </div>
              </div>
            )}
            {esSeccionTarjetaProducto(s.section_type) && (
              <InspectorTarjetaProducto
                guardado={contenido.product_card_style}
                heredado={heredadoTarjetaSeccion(contenido, p.estiloTarjetaSitio)}
                onCambiar={(estilo) => onCambiarContenido({ ...contenido, product_card_style: estilo })}
                onQuitar={() => {
                  const siguiente = { ...contenido };
                  delete siguiente.product_card_style;
                  onCambiarContenido(siguiente);
                }}
                onAplicarTodas={p.onAplicarTarjeta}
                propias={clavesPropiasTarjeta(contenido)}
                onRestablecer={(clave) => onCambiarContenido(restablecerClaveTarjeta(contenido, clave))}
              />
            )}
            {s.section_type === 'promo_banners' && (
              <InspectorBanners contenido={contenido} onCambiar={onCambiarContenido} />
            )}
            {pintarConBloques(campos('diseno'))}
            {(TIPOS_PAGINACION as readonly string[]).includes(s.section_type) && (
              <PanelPaginacion
                valor={sanitizarPaginacion(contenido.paginacion)}
                usarGlobal={sanitizarPaginacion(contenido.paginacion)?.usar_global !== false}
                onUsarGlobal={(v) => {
                  if (v) {
                    const siguiente = { ...contenido };
                    delete siguiente.paginacion;
                    onCambiarContenido(siguiente);
                  } else {
                    onCambiarContenido({ ...contenido, paginacion: { usar_global: false } });
                  }
                }}
                onCambiar={(val) => onCambiarContenido({ ...contenido, paginacion: { usar_global: false, ...val } })}
                color="#111827"
              />
            )}
            {(TIPOS_CARRUSEL as readonly string[]).includes(s.section_type) && (
              <PanelCarrusel
                valor={sanitizarCarrusel(contenido.carrusel)}
                usarGlobal={sanitizarCarrusel(contenido.carrusel)?.usar_global !== false}
                onUsarGlobal={(v) => {
                  if (v) {
                    const siguiente = { ...contenido };
                    delete siguiente.carrusel;
                    onCambiarContenido(siguiente);
                  } else {
                    // Arranca con lo que la sección ya tenía (claves anteriores), para que se vea igual.
                    onCambiarContenido({ ...contenido, carrusel: { usar_global: false, ...(carruselGlobalActivo(p.carruselSitio) ? {} : carruselDesdeClavesAnteriores(contenido, s.section_type)) } });
                  }
                }}
                onCambiar={(val) => onCambiarContenido({ ...contenido, carrusel: { usar_global: false, ...val } })}
              />
            )}
            {avisoBorrador}
          </>
        )}

        {pestana === 'contenido' &&
          (campos('contenido').length === 0 ? (
            <p className="text-[13px] leading-[18px] text-fg-secondary">{t('inspector.sinContenido')}</p>
          ) : (
            pintarConBloques(campos('contenido'))
          ))}

        {pestana === 'estilo' && (
          <InspectorEstilo
            estilo={estilo}
            visibilidad={visibilidad}
            onCambiarEstilo={p.onCambiarEstilo}
            onCambiarVisibilidad={p.onCambiarVisibilidad}
            tema={p.tema}
            catalogoFuentes={p.catalogoFuentes}
            sede={p.sede?.estilo ?? null}
            unico={
              p.onCambiarApariencia && !p.sede
                ? {
                    apariencia: { settings: (s.settings ?? {}) as Record<string, unknown>, contenido },
                    aplicar: p.onCambiarApariencia,
                    campoImagen: (valor, onCambiar) => (
                      <CampoSeccion
                        campo={{ key: 'bg_image', label: t('estilo.fondoImagen'), type: 'image', group: 'style' }}
                        valor={valor}
                        contenido={contenido}
                        onCambiar={(v) => onCambiar(typeof v === 'string' && v ? v : undefined)}
                        onCambiarContenido={onCambiarContenido}
                        organizationId={p.organizationId}
                        paleta={p.paleta}
                        categorias={p.categorias}
                      />
                    ),
                  }
                : null
            }
          />
        )}
        {pestana === 'estilo' && (
          <AjustesAnteriores
            ajustes={contenido}
            entradas={entradasAnterioresSeccion(contenido, s.section_type)}
            cambiar={(c) => onCambiarContenido(aplicarCambioContenido(contenido, c))}
          />
        )}

        {pestana === 'avanzado' && (
          <>
            <AvisoTonal tono="advertencia" icono={TriangleAlert} titulo={t('avanzado.titulo')} descripcion={t('avanzado.descripcion')} />
            {pintarConBloques(campos('avanzado'))}
            <p className="flex items-start gap-1.5 text-xs leading-4 text-fg-secondary">
              <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
              {t('avanzado.precedencia')}
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
