'use client';

/**
 * Inspector «Banners»: distribución, lista reordenable, texto, botón, estilo y hover.
 * Escribe `banner_layout` y `banner_style`. Sin esas claves la tienda no cambia.
 */
import { bannersDesdeAnteriores } from './espaciadoSeccion';
import { useTextosEditor } from '../textos';
import { ColorTema } from './PartesZonaGlobal';
import { SelectKit, NumeroKit, CasillaKit } from './controlesKit';
import { useState, type ReactNode } from 'react';
import { GripVertical } from 'lucide-react';
import { TabBar, clasesBoton } from '@/components/kit';
import {
  ALINEACIONES,
  DISTRIBUCIONES,
  ESTILOS_BOTON,
  FORMAS_BANNER,
  FORMAS_BOTON,
  HOVER_BANNER,
  MOVIL_BANNER,
  OVERLAY_POS,
  POSICIONES_BOTON,
  SOMBRAS_BANNER,
  TAMANOS_BOTON,
  VALIGN,
  avisoDistribucion,
  bloquesDistribucion,
  grupoDistribucion,
  normalizarEstiloBanners,
  type Distribucion,
  type EstiloBanners,
} from '@/lib/website/distribucionBanner';

const NOMBRE: Record<Distribucion, string> = {
  grid: 'Cuadrícula',
  hero_plus_2: 'Grande + 2',
  '2_plus_hero': '2 + grande',
  hero_plus_4: 'Grande + 4',
  split_50: 'Mitad y mitad',
  triple_center: 'Centro más alto',
  masonry: 'Mosaico',
  full_stack: 'Apilados',
  carousel: 'Carrusel',
  circles: 'Círculos',
  side_text: 'Texto al lado',
};

type Pestana = 'distribucion' | 'banners' | 'texto' | 'boton' | 'estilo' | 'hover';

const claseControl = 'h-8 w-full rounded-md border border-line bg-surface px-2 text-sm text-fg';

function Miniatura({ layout }: { layout: Distribucion }) {
  const grupo = grupoDistribucion(layout) || (layout === 'circles' ? 4 : 3);
  const bloques = grupoDistribucion(layout) ? bloquesDistribucion(layout, grupo, true) : [];
  const bloque = bloques[0];
  if (layout === 'circles') {
    return (
      <span className="flex h-10 items-end justify-center gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <span key={i} className="flex flex-col items-center gap-0.5">
            <span className="size-3 rounded-full bg-current opacity-70" />
            <span className="h-0.5 w-3 bg-current opacity-40" />
          </span>
        ))}
      </span>
    );
  }
  if (layout === 'masonry') {
    return (
      <span className="grid h-10 w-full grid-cols-3 gap-0.5">
        <span className="bg-current opacity-70" />
        <span className="mt-2 bg-current opacity-50" />
        <span className="mt-1 bg-current opacity-60" />
      </span>
    );
  }
  if (layout === 'full_stack' || layout === 'side_text') {
    return (
      <span className="flex h-10 w-full flex-col justify-center gap-1">
        <span className="h-2 w-full bg-current opacity-70" />
        <span className={`h-2 bg-current opacity-50 ${layout === 'side_text' ? 'ml-4 w-2/3' : 'w-full'}`} />
      </span>
    );
  }
  if (layout === 'carousel') {
    return (
      <span className="flex h-10 items-center gap-0.5">
        <span className="h-6 w-1/2 bg-current opacity-70" />
        <span className="h-6 w-1/3 bg-current opacity-40" />
      </span>
    );
  }
  if (layout === 'grid' || !bloque) {
    return (
      <span className="grid h-10 w-full grid-cols-2 gap-0.5">
        <span className="bg-current opacity-70" />
        <span className="bg-current opacity-50" />
        <span className="bg-current opacity-50" />
        <span className="bg-current opacity-70" />
      </span>
    );
  }
  return (
    <span
      className="grid h-10 w-full gap-0.5"
      style={{ gridTemplateColumns: bloque.plantilla, gridTemplateRows: `repeat(${bloque.filas}, 1fr)` }}
    >
      {bloque.celdas.map((c) => (
        <span
          key={c.index}
          className="bg-current opacity-70"
          style={{ gridColumn: `${c.col} / span ${c.colSpan}`, gridRow: `${c.row} / span ${c.rowSpan}` }}
        />
      ))}
    </span>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={etiqueta} className="flex flex-col gap-1 text-[12px] leading-4 text-fg-secondary">
      <span>{etiqueta}</span>
      {children}
    </div>
  );
}

function Lista<T extends string>({
  etiqueta,
  valor,
  opciones,
  nombres,
  onCambiar,
}: {
  etiqueta: string;
  valor: T | undefined;
  opciones: readonly T[];
  nombres?: Record<string, string>;
  onCambiar: (valor: T) => void;
}) {
  return (
    <Campo etiqueta={etiqueta}>
      <SelectKit className={claseControl} value={valor ?? ''} onChange={(e) => onCambiar(e.target.value as T)}>
        <option value="">Sin cambio</option>
        {opciones.map((o) => (
          <option key={o} value={o}>
            {nombres?.[o] ?? o}
          </option>
        ))}
      </SelectKit>
    </Campo>
  );
}

function Color({ etiqueta, valor, onCambiar }: { etiqueta: string; valor?: string; onCambiar: (v: string | null) => void }) {
  return (
    <ColorTema etiqueta={etiqueta} valor={valor && /^#[0-9a-fA-F]{6}$/.test(valor) ? valor : null} colorTema="#111827" onCambiar={onCambiar} />
  );
}

export function InspectorBanners({
  contenido,
  onCambiar,
}: {
  contenido: Record<string, unknown>;
  onCambiar: (contenido: Record<string, unknown>) => void;
}) {
  const tk = useTextosEditor();
  const [pestana, setPestana] = useState<Pestana>('distribucion');
  const [abierto, setAbierto] = useState<number | null>(0);
  const [arrastre, setArrastre] = useState<number | null>(null);
  // BANNER-01: una sola «Distribución». Sin claves nuevas se muestra (y se toma al editar) lo que
  // la sección tenía en layout / columns / columns_mobile / gap, para que la tienda se vea igual.
  const modoNuevo = contenido.banner_layout != null || contenido.banner_style != null;
  const legado = bannersDesdeAnteriores(contenido);
  const layout = (modoNuevo ? (typeof contenido.banner_layout === 'string' ? contenido.banner_layout : 'grid') : legado.layout) as Distribucion;
  const estilo = ((modoNuevo ? normalizarEstiloBanners(contenido.banner_style) : legado.estilo) ?? {}) as EstiloBanners;
  const banners = Array.isArray(contenido.banners) ? (contenido.banners as Record<string, unknown>[]) : [];
  const aviso = avisoDistribucion(DISTRIBUCIONES.includes(layout as Distribucion) ? (layout as Distribucion) : 'grid', banners.length, estilo.last_full !== false);

  const ponerEstilo = (parcial: Partial<EstiloBanners>) => {
    const siguiente = { ...estilo, ...parcial };
    for (const [k, v] of Object.entries(parcial)) {
      if (v == null || v === '') delete (siguiente as Record<string, unknown>)[k];
    }
    onCambiar({
      ...contenido,
      ...(modoNuevo ? {} : { banner_layout: legado.layout }),
      banner_style: Object.keys(siguiente).length ? siguiente : undefined,
    });
  };
  const ponerBanner = (i: number, parcial: Record<string, unknown>) => {
    const lista = banners.map((b, n) => (n === i ? { ...b, ...parcial } : b));
    onCambiar({ ...contenido, banners: lista });
  };
  const mover = (desde: number, hasta: number) => {
    if (desde === hasta || hasta < 0 || hasta >= banners.length) return;
    const lista = [...banners];
    const [item] = lista.splice(desde, 1);
    lista.splice(hasta, 0, item);
    onCambiar({ ...contenido, banners: lista });
  };

  return (
    <section aria-label="Banners" className="flex flex-col gap-3 rounded-lg border border-line p-3">
      <div>
        <h3 className="text-sm font-semibold text-fg">Banners</h3>
        <p className="text-[12px] leading-4 text-fg-secondary">
          Sin distribución nueva, la sección se ve como hoy. El enlace de cada banner sigue en Contenido.
        </p>
      </div>
      <TabBar
        id="banners-promo"
        etiqueta="Opciones de banners"
        tamano="sm"
        valor={pestana}
        onValorChange={setPestana}
        pestanas={[
          { valor: 'distribucion', etiqueta: 'Distribución' },
          { valor: 'banners', etiqueta: 'Banners' },
          { valor: 'texto', etiqueta: 'Texto' },
          { valor: 'boton', etiqueta: 'Botón' },
          { valor: 'estilo', etiqueta: 'Estilo' },
          { valor: 'hover', etiqueta: 'Hover' },
        ]}
      />

      {pestana === 'distribucion' && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            {DISTRIBUCIONES.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onCambiar({ ...contenido, banner_layout: id, ...(modoNuevo || !Object.keys(legado.estilo).length ? {} : { banner_style: legado.estilo }) })}
                className={`flex flex-col gap-1 rounded-lg border p-2 text-left text-[12px] ${layout === id ? 'border-brand text-brand' : 'border-line text-fg'}`}
              >
                <Miniatura layout={id} />
                <span className="font-medium">{NOMBRE[id]}</span>
                <span className="text-fg-secondary">{grupoDistribucion(id) ? `Grupos de ${grupoDistribucion(id)}` : 'Cualquier cantidad'}</span>
              </button>
            ))}
          </div>
          {aviso && (
            <p className={`text-[12px] leading-4 ${aviso.tipo === 'ok' ? 'text-fg-secondary' : 'text-amber-700'}`}>{aviso.texto}</p>
          )}
          <CasillaKit titulo="El último ocupa el ancho completo" checked={estilo.last_full !== false} onChange={(e) => ponerEstilo({ last_full: e.target.checked })} />
          <Lista
            etiqueta="En celular"
            valor={estilo.mobile_layout}
            opciones={MOVIL_BANNER}
            nombres={{ same: 'La misma distribución', carousel: 'Carrusel', stack: 'Apilado' }}
            onCambiar={(v) => ponerEstilo({ mobile_layout: v })}
          />
          <div className="grid grid-cols-3 gap-2">
            <Campo etiqueta="Columnas escritorio">
              <NumeroKit min={1} max={6} value={estilo.columns_desktop ?? ''} onChange={(e) => ponerEstilo({ columns_desktop: e.target.value ? Number(e.target.value) : undefined })} />
            </Campo>
            <Campo etiqueta="Tablet">
              <NumeroKit min={1} max={4} value={estilo.columns_tablet ?? ''} onChange={(e) => ponerEstilo({ columns_tablet: e.target.value ? Number(e.target.value) : undefined })} />
            </Campo>
            <Campo etiqueta="Celular">
              <NumeroKit min={1} max={2} value={estilo.columns_mobile ?? ''} onChange={(e) => ponerEstilo({ columns_mobile: e.target.value ? Number(e.target.value) : undefined })} />
            </Campo>
          </div>
          {(layout === 'carousel' || estilo.mobile_layout === 'carousel') && (
            <div className="grid grid-cols-2 gap-2">
              <Campo etiqueta="Visibles (1–4)">
                <NumeroKit min={1} max={4} value={estilo.slides ?? 1} onChange={(e) => ponerEstilo({ slides: Number(e.target.value) })} />
              </Campo>
              <Campo etiqueta="Intervalo (ms)">
                <NumeroKit min={1500} max={20000} step={500} value={estilo.interval_ms ?? 5000} onChange={(e) => ponerEstilo({ interval_ms: Number(e.target.value) })} />
              </Campo>
              <CasillaKit titulo="Autoplay" checked={estilo.autoplay === true} onChange={(e) => ponerEstilo({ autoplay: e.target.checked })} />
              <CasillaKit titulo="Flechas" checked={estilo.show_arrows !== false} onChange={(e) => ponerEstilo({ show_arrows: e.target.checked })} />
              <CasillaKit titulo="Puntos" checked={estilo.show_dots !== false} onChange={(e) => ponerEstilo({ show_dots: e.target.checked })} />
            </div>
          )}
        </div>
      )}

      {pestana === 'banners' && (
        <ul className="flex flex-col gap-2">
          {banners.map((b, i) => (
            <li
              key={i}
              draggable
              onDragStart={() => setArrastre(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (arrastre != null) mover(arrastre, i);
                setArrastre(null);
              }}
              className="rounded-lg border border-line"
            >
              <button type="button" className="flex w-full items-center gap-2 px-2 py-2 text-left text-sm" onClick={() => setAbierto(abierto === i ? null : i)}>
                <GripVertical className="size-4 text-fg-secondary" />
                <span className="truncate">{typeof b.title === 'string' && b.title ? b.title : `Banner ${i + 1}`}</span>
              </button>
              {abierto === i && (
                <div className="flex flex-col gap-2 border-t border-line p-2">
                  <Campo etiqueta="Imagen de escritorio">
                    <input className={claseControl} value={typeof b.image_url === 'string' ? b.image_url : ''} onChange={(e) => ponerBanner(i, { image_url: e.target.value })} />
                  </Campo>
                  <Campo etiqueta="Imagen de celular">
                    <input className={claseControl} value={typeof b.image_url_mobile === 'string' ? b.image_url_mobile : ''} onChange={(e) => ponerBanner(i, { image_url_mobile: e.target.value || undefined })} />
                  </Campo>
                  <Campo etiqueta="Imagen al pasar el mouse">
                    <input className={claseControl} value={typeof b.image_url_hover === 'string' ? b.image_url_hover : ''} onChange={(e) => ponerBanner(i, { image_url_hover: e.target.value || undefined })} />
                  </Campo>
                  <Campo etiqueta="Texto alternativo">
                    <input className={claseControl} value={typeof b.alt === 'string' ? b.alt : ''} onChange={(e) => ponerBanner(i, { alt: e.target.value || undefined })} />
                  </Campo>
                  <Campo etiqueta="Enlace">
                    <input className={claseControl} value={typeof b.link_url === 'string' ? b.link_url : typeof b.cta_url === 'string' ? b.cta_url : ''} onChange={(e) => ponerBanner(i, { link_url: e.target.value, link_type: b.link_type || 'url' })} />
                  </Campo>
                  <Lista etiqueta="Ajuste" valor={b.image_fit === 'contain' || b.image_fit === 'cover' ? b.image_fit : undefined} opciones={['cover', 'contain'] as const} nombres={{ cover: 'Cubrir', contain: 'Contener' }} onCambiar={(v) => ponerBanner(i, { image_fit: v })} />
                  <Lista etiqueta="Punto focal" valor={typeof b.focal_point === 'string' ? (b.focal_point as 'center') : undefined} opciones={['center', 'top', 'bottom', 'left', 'right'] as const} nombres={{ center: 'Centro', top: 'Arriba', bottom: 'Abajo', left: 'Izquierda', right: 'Derecha' }} onCambiar={(v) => ponerBanner(i, { focal_point: v })} />
                  <Campo etiqueta="Etiqueta pequeña">
                    <input className={claseControl} value={typeof b.kicker === 'string' ? b.kicker : ''} onChange={(e) => ponerBanner(i, { kicker: e.target.value || undefined })} />
                  </Campo>
                  <CasillaKit titulo="Texto sobre la imagen" checked={b.show_overlay_text !== false && estilo.show_overlay_text !== false} onChange={(e) => ponerBanner(i, { show_overlay_text: e.target.checked })} />
                </div>
              )}
            </li>
          ))}
          {banners.length === 0 && <p className="text-[12px] text-fg-secondary">Agrega banners en Contenido.</p>}
        </ul>
      )}

      {pestana === 'texto' && (
        <div className="flex flex-col gap-3">
          <CasillaKit titulo="Texto sobre la imagen" checked={estilo.show_overlay_text !== false} onChange={(e) => ponerEstilo({ show_overlay_text: e.target.checked })} />
          <Lista etiqueta="Horizontal" valor={estilo.text_align} opciones={ALINEACIONES} nombres={{ left: 'Izquierda', center: 'Centro', right: 'Derecha' }} onCambiar={(v) => ponerEstilo({ text_align: v })} />
          <Lista etiqueta="Vertical" valor={estilo.text_valign} opciones={VALIGN} nombres={{ top: 'Arriba', center: 'Centro', bottom: 'Abajo' }} onCambiar={(v) => ponerEstilo({ text_valign: v })} />
          <Lista etiqueta="Tamaño" valor={estilo.title_size} opciones={['sm', 'md', 'lg'] as const} nombres={{ sm: 'Chico', md: 'Mediano', lg: 'Grande' }} onCambiar={(v) => ponerEstilo({ title_size: v })} />
          <Lista etiqueta="Peso" valor={estilo.title_weight} opciones={['normal', 'medium', 'semibold', 'bold'] as const} nombres={{ normal: 'Normal', medium: 'Medio', semibold: 'Seminegrita', bold: 'Negrita' }} onCambiar={(v) => ponerEstilo({ title_weight: v })} />
          <Color etiqueta="Color del texto" valor={estilo.text_color} onCambiar={(v) => ponerEstilo({ text_color: v ?? undefined })} />
          <Lista etiqueta="Capa" valor={estilo.overlay} opciones={['none', 'solid', 'gradient'] as const} nombres={{ none: 'Ninguna', solid: 'Sólida', gradient: 'Degradado' }} onCambiar={(v) => ponerEstilo({ overlay: v })} />
          <Lista etiqueta="Posición de la capa" valor={estilo.overlay_position} opciones={OVERLAY_POS} nombres={{ bottom: 'Abajo', left: 'Izquierda', full: 'Completa' }} onCambiar={(v) => ponerEstilo({ overlay_position: v })} />
          <div className="grid grid-cols-2 gap-2">
            <Color etiqueta="Color 1" valor={estilo.overlay_color} onCambiar={(v) => ponerEstilo({ overlay_color: v ?? undefined })} />
            <Color etiqueta="Color 2" valor={estilo.overlay_color_2} onCambiar={(v) => ponerEstilo({ overlay_color_2: v ?? undefined })} />
          </div>
          <Campo etiqueta={`Ángulo${estilo.overlay_angle != null ? `: ${estilo.overlay_angle}` : ''}`}>
            <NumeroKit min={0} max={360} value={estilo.overlay_angle ?? 180} onChange={(e) => ponerEstilo({ overlay_angle: Number(e.target.value) })} />
          </Campo>
          <Campo etiqueta={`Opacidad${estilo.overlay_opacity != null ? `: ${estilo.overlay_opacity}` : ''}`}>
            <NumeroKit min={0} max={100} value={estilo.overlay_opacity ?? 55} onChange={(e) => ponerEstilo({ overlay_opacity: Number(e.target.value) })} />
          </Campo>
        </div>
      )}

      {pestana === 'boton' && (
        <div className="flex flex-col gap-3">
          <CasillaKit titulo="Mostrar botón" checked={estilo.button_on !== false} onChange={(e) => ponerEstilo({ button_on: e.target.checked })} />
          <Lista etiqueta="Estilo" valor={estilo.button_style} opciones={ESTILOS_BOTON} nombres={{ solid: 'Sólido', outline: 'Contorno', ghost: 'Fantasma', gradient: 'Degradado', icon_only: 'Solo ícono' }} onCambiar={(v) => ponerEstilo({ button_style: v })} />
          <Lista etiqueta="Forma" valor={estilo.button_shape} opciones={FORMAS_BOTON} nombres={{ square: 'Cuadrada', rounded: 'Redonda', semi: 'Semi', pill: 'Píldora', circle: 'Círculo' }} onCambiar={(v) => ponerEstilo({ button_shape: v })} />
          <Lista etiqueta="Tamaño" valor={estilo.button_size} opciones={TAMANOS_BOTON} nombres={{ sm: 'Chico', md: 'Mediano', lg: 'Grande' }} onCambiar={(v) => ponerEstilo({ button_size: v })} />
          <Lista etiqueta="Posición" valor={estilo.button_position} opciones={POSICIONES_BOTON} nombres={{ tl: 'Arriba izquierda', tc: 'Arriba centro', tr: 'Arriba derecha', ml: 'Centro izquierda', mc: 'Centro', mr: 'Centro derecha', bl: 'Abajo izquierda', bc: 'Abajo centro', br: 'Abajo derecha' }} onCambiar={(v) => ponerEstilo({ button_position: v })} />
          <div className="grid grid-cols-2 gap-2">
            <Color etiqueta="Fondo" valor={estilo.button_bg} onCambiar={(v) => ponerEstilo({ button_bg: v ?? undefined })} />
            <Color etiqueta="Texto" valor={estilo.button_color} onCambiar={(v) => ponerEstilo({ button_color: v ?? undefined })} />
            <Color etiqueta="Borde" valor={estilo.button_border} onCambiar={(v) => ponerEstilo({ button_border: v ?? undefined })} />
            <Color etiqueta="Hover" valor={estilo.button_hover} onCambiar={(v) => ponerEstilo({ button_hover: v ?? undefined })} />
            <Color etiqueta={tk('controles.degradado1')} valor={estilo.button_gradient_1} onCambiar={(v) => ponerEstilo({ button_gradient_1: v ?? undefined })} />
            <Color etiqueta={tk('controles.degradado2')} valor={estilo.button_gradient_2} onCambiar={(v) => ponerEstilo({ button_gradient_2: v ?? undefined })} />
          </div>
        </div>
      )}

      {pestana === 'estilo' && (
        <div className="flex flex-col gap-3">
          <Lista etiqueta="Forma" valor={estilo.banner_shape} opciones={FORMAS_BANNER} nombres={{ rect: 'Rectangular', rounded: 'Redondeado', semi: 'Semi', circle: 'Círculo', arch: 'Arco' }} onCambiar={(v) => ponerEstilo({ banner_shape: v })} />
          <Campo etiqueta={`Radio${estilo.banner_radius != null ? `: ${estilo.banner_radius}` : ''}`}>
            <NumeroKit min={0} max={48} value={estilo.banner_radius ?? 16} onChange={(e) => ponerEstilo({ banner_radius: Number(e.target.value) })} />
          </Campo>
          <Campo etiqueta="Borde">
            <NumeroKit min={0} max={8} value={estilo.border_width ?? 0} onChange={(e) => ponerEstilo({ border_width: Number(e.target.value) })} />
          </Campo>
          <Color etiqueta="Color del borde" valor={estilo.border_color} onCambiar={(v) => ponerEstilo({ border_color: v ?? undefined })} />
          <Lista etiqueta="Sombra" valor={estilo.shadow} opciones={SOMBRAS_BANNER} nombres={{ none: 'Ninguna', sm: 'Suave', md: 'Media', lg: 'Fuerte' }} onCambiar={(v) => ponerEstilo({ shadow: v })} />
          <Campo etiqueta={`Separación${estilo.gap != null ? `: ${estilo.gap}` : ''}`}>
            <NumeroKit min={0} max={64} value={estilo.gap ?? 24} onChange={(e) => ponerEstilo({ gap: Number(e.target.value) })} />
          </Campo>
          <Campo etiqueta={`Margen de la sección${estilo.section_margin != null ? `: ${estilo.section_margin}` : ''}`}>
            <NumeroKit min={0} max={80} value={estilo.section_margin ?? 0} onChange={(e) => ponerEstilo({ section_margin: Number(e.target.value) })} />
          </Campo>
          <div className="grid grid-cols-2 gap-2">
            <Color etiqueta="Fondo" valor={estilo.section_bg} onCambiar={(v) => ponerEstilo({ section_bg: v ?? undefined })} />
            <Color etiqueta="Fondo 2" valor={estilo.section_bg_2} onCambiar={(v) => ponerEstilo({ section_bg_2: v ?? undefined })} />
          </div>
        </div>
      )}

      {pestana === 'hover' && (
        <Lista
          etiqueta="Al pasar el mouse"
          valor={estilo.hover}
          opciones={HOVER_BANNER}
          nombres={{ none: 'Ninguno', zoom: 'Zoom', lift: 'Elevar', darken: 'Oscurecer', reveal: 'Mostrar texto o botón', second: 'Imagen secundaria' }}
          onCambiar={(v) => ponerEstilo({ hover: v })}
        />
      )}

      {(contenido.banner_layout != null || contenido.banner_style != null) && (
        <button
          type="button"
          className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
          onClick={() => {
            const siguiente = { ...contenido };
            delete siguiente.banner_layout;
            delete siguiente.banner_style;
            if (Array.isArray(siguiente.banners)) {
              siguiente.banners = (siguiente.banners as Record<string, unknown>[]).map((b) => {
                const limpio = { ...b };
                for (const clave of ['image_url_mobile', 'image_url_hover', 'focal_point', 'alt', 'kicker', 'show_overlay_text', 'text_align', 'text_valign', 'image_fit']) {
                  delete limpio[clave];
                }
                return limpio;
              });
            }
            onCambiar(siguiente);
          }}
        >
          Volver a la distribución de hoy
        </button>
      )}
    </section>
  );
}
