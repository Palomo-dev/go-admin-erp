'use client';

/**
 * Inspector «Tarjeta de producto»: preset, botones, etiquetas, texto y contenedor.
 * Lo guardado es `product_card_style`. Elegir «Actual» no cambia el render de hoy.
 */
import { useTextosEditor } from '../textos';
import { ColorTema } from './PartesZonaGlobal';
import { SelectKit, CasillaKit, NumeroKit } from './controlesKit';
import { useState, type ReactNode } from 'react';
import { TabBar, clasesBoton } from '@/components/kit';
import {
  ALINEACIONES,
  ANCHOS_BOTON,
  AJUSTES_IMAGEN,
  ESTILOS_BOTON,
  ESTILOS_ETIQUETA,
  ESTILOS_RESENA,
  FORMAS_BOTON,
  FORMAS_ETIQUETA,
  HOVER_IMAGEN,
  ICONOS_BOTON,
  LADOS_ICONO,
  PESOS_TITULO,
  POSICIONES_BOTON,
  POSICIONES_ETIQUETA,
  POSICIONES_PRECIO,
  POSICIONES_RESENA,
  PRESETS_TARJETA,
  RATIOS_IMAGEN,
  SOMBRAS_TARJETA,
  TAMANOS_BOTON,
  TAMANOS_TEXTO,
  VISIBILIDAD_BOTON,
  guardarCambioTarjeta,
  normalizarTarjeta,
  resolverTarjetaProducto,
  vistaEditorTarjeta,
  type EstiloBotonTarjeta,
  type EstiloEtiquetaTarjeta,
  type EstiloTarjetaProducto,
  type PresetTarjeta,
} from '@/lib/website/tarjetaProducto';

const NOMBRE_PRESET: Record<PresetTarjeta, string> = {
  actual: 'Actual',
  minimal: 'Minimal',
  boxed: 'Caja',
  overlay: 'Sobre la imagen',
  compact: 'Compacta',
  rich: 'Completa',
};

const NOMBRE_BOTON = { add: 'Agregar', buy: 'Comprar', choose: 'Elegir' } as const;
const NOMBRE_ETIQUETA = {
  label_discount: 'Descuento',
  label_new: 'Nuevo',
  label_shipping: 'Envío gratis',
  label_sold_out: 'Agotado',
} as const;

type ClaveBoton = keyof typeof NOMBRE_BOTON;
type ClaveEtiqueta = keyof typeof NOMBRE_ETIQUETA;
type Pestana = 'preset' | 'botones' | 'etiquetas' | 'texto' | 'contenedor';

export interface InspectorTarjetaProductoProps {
  guardado: unknown;
  /** Estilo del sitio, para mostrar lo que hereda una sección que aún no lo reemplaza. */
  heredado?: unknown;
  onCambiar: (estilo: EstiloTarjetaProducto) => void;
  onQuitar?: () => void;
  /** Copia el estilo efectivo a todas las secciones de productos de la página. */
  onAplicarTodas?: (estilo: EstiloTarjetaProducto) => void;
}

function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={etiqueta} className="flex flex-col gap-1 text-[12px] leading-4 text-fg-secondary">
      <span>{etiqueta}</span>
      {children}
    </div>
  );
}

const claseControl = 'h-8 rounded-md border border-line bg-surface px-2 text-sm text-fg';

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
        {opciones.map((o) => (
          <option key={o} value={o}>
            {nombres?.[o] ?? o}
          </option>
        ))}
      </SelectKit>
    </Campo>
  );
}

function Color({
  etiqueta,
  valor,
  onCambiar,
}: {
  etiqueta: string;
  valor: string | undefined;
  onCambiar: (valor: string | null) => void;
}) {
  return (
    <ColorTema etiqueta={etiqueta} valor={valor && /^#[0-9a-fA-F]{6}$/.test(valor) ? valor : null} colorTema="#111827" onCambiar={onCambiar} />
  );
}

function Interruptor({ etiqueta, valor, onCambiar }: { etiqueta: string; valor: boolean | undefined; onCambiar: (v: boolean) => void }) {
  return (
    <CasillaKit titulo={etiqueta} checked={valor === true} onChange={(e) => onCambiar(e.target.checked)} />
  );
}

function Rango({
  etiqueta,
  valor,
  min,
  max,
  onCambiar,
}: {
  etiqueta: string;
  valor: number | undefined;
  min: number;
  max: number;
  onCambiar: (n: number) => void;
}) {
  return (
    <Campo etiqueta={`${etiqueta}${valor != null ? `: ${valor}` : ''}`}>
      <NumeroKit
       
        min={min}
        max={max}
        value={valor ?? min}
        onChange={(e) => onCambiar(Number(e.target.value))}
        className="w-full"
      />
    </Campo>
  );
}

export function InspectorTarjetaProducto({ guardado, heredado, onCambiar, onQuitar, onAplicarTodas }: InspectorTarjetaProductoProps) {
  const tk = useTextosEditor();
  const [pestana, setPestana] = useState<Pestana>('preset');
  const [boton, setBoton] = useState<ClaveBoton>('add');
  const [etiqueta, setEtiqueta] = useState<ClaveEtiqueta>('label_discount');
  const vista = vistaEditorTarjeta(guardado, heredado);
  const cambiar = (ruta: string, valor: unknown) => onCambiar(guardarCambioTarjeta(guardado, ruta, valor));
  const b: EstiloBotonTarjeta = vista[boton] ?? {};
  const e: EstiloEtiquetaTarjeta = vista[etiqueta] ?? {};
  const setBotonCampo = (clave: string, valor: unknown) => cambiar(`${boton}.${clave}`, valor);
  const setEtiquetaCampo = (clave: string, valor: unknown) => cambiar(`${etiqueta}.${clave}`, valor);

  return (
    <section aria-label="Tarjeta de producto" className="flex flex-col gap-3 rounded-lg border border-line p-3">
      <div>
        <h3 className="text-sm font-semibold text-fg">Tarjeta de producto</h3>
        <p className="text-[12px] leading-4 text-fg-secondary">
          El estilo del sitio aplica a todas las tarjetas. Esta sección puede reemplazarlo. Sin cambios, se ve la tarjeta de hoy.
        </p>
      </div>
      <TabBar
        id="tarjeta-producto"
        etiqueta="Opciones de la tarjeta"
        tamano="sm"
        valor={pestana}
        onValorChange={setPestana}
        pestanas={[
          { valor: 'preset', etiqueta: 'Preset' },
          { valor: 'botones', etiqueta: 'Botones' },
          { valor: 'etiquetas', etiqueta: 'Etiquetas' },
          { valor: 'texto', etiqueta: 'Texto y precio' },
          { valor: 'contenedor', etiqueta: 'Contenedor' },
        ]}
      />

      {pestana === 'preset' && (
        <div className="grid grid-cols-2 gap-2">
          {PRESETS_TARJETA.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => cambiar('card_preset', p)}
              className={clasesBoton({ variante: vista.card_preset === p ? 'primario' : 'secundario', tamano: 'sm' })}
            >
              {NOMBRE_PRESET[p]}
            </button>
          ))}
        </div>
      )}

      {pestana === 'botones' && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-1">
            {(Object.keys(NOMBRE_BOTON) as ClaveBoton[]).map((k) => (
              <button key={k} type="button" onClick={() => setBoton(k)} className={clasesBoton({ variante: boton === k ? 'primario' : 'fantasma', tamano: 'sm' })}>
                {NOMBRE_BOTON[k]}
              </button>
            ))}
          </div>
          <Interruptor etiqueta="Mostrar" valor={b.show !== false} onCambiar={(v) => setBotonCampo('show', v)} />
          <Lista etiqueta="Estilo" valor={b.button_style} opciones={ESTILOS_BOTON} nombres={{ solid: 'Sólido', outline: 'Contorno', ghost: 'Fantasma', gradient: 'Degradado', icon_only: 'Solo ícono' }} onCambiar={(v) => setBotonCampo('button_style', v)} />
          <Lista etiqueta="Forma" valor={b.button_shape} opciones={FORMAS_BOTON} nombres={{ square: 'Cuadrada', rounded: 'Redonda (8)', semi: 'Semi (14)', pill: 'Píldora', circle: 'Círculo' }} onCambiar={(v) => setBotonCampo('button_shape', v)} />
          <Lista etiqueta="Tamaño" valor={b.button_size} opciones={TAMANOS_BOTON} nombres={{ sm: 'Chico', md: 'Mediano', lg: 'Grande' }} onCambiar={(v) => setBotonCampo('button_size', v)} />
          <Lista etiqueta="Ancho" valor={b.button_width} opciones={ANCHOS_BOTON} nombres={{ full: 'Completo', auto: 'Automático' }} onCambiar={(v) => setBotonCampo('button_width', v)} />
          <Lista etiqueta="Posición" valor={b.button_position} opciones={POSICIONES_BOTON} nombres={{ bottom: 'Abajo', over_image_bottom: 'Sobre la imagen', over_image_corner: 'Esquina de la imagen', inline_price: 'Junto al precio' }} onCambiar={(v) => setBotonCampo('button_position', v)} />
          <Lista etiqueta="Visibilidad" valor={b.button_visibility} opciones={VISIBILIDAD_BOTON} nombres={{ always: 'Siempre', hover: 'Al pasar el mouse (en celular, siempre)' }} onCambiar={(v) => setBotonCampo('button_visibility', v)} />
          <Lista etiqueta="Ícono" valor={b.icon || undefined} opciones={ICONOS_BOTON} onCambiar={(v) => setBotonCampo('icon', v)} />
          <Lista etiqueta="Lado del ícono" valor={b.icon_side} opciones={LADOS_ICONO} nombres={{ left: 'Izquierda', right: 'Derecha' }} onCambiar={(v) => setBotonCampo('icon_side', v)} />
          <div className="grid grid-cols-2 gap-2">
            <Color etiqueta="Fondo" valor={b.bg} onCambiar={(v) => setBotonCampo('bg', v)} />
            <Color etiqueta="Texto" valor={b.text} onCambiar={(v) => setBotonCampo('text', v)} />
            <Color etiqueta="Borde" valor={b.border} onCambiar={(v) => setBotonCampo('border', v)} />
            <Color etiqueta="Hover" valor={b.hover} onCambiar={(v) => setBotonCampo('hover', v)} />
            <Color etiqueta={tk('controles.degradado1')} valor={b.gradient_1} onCambiar={(v) => setBotonCampo('gradient_1', v)} />
            <Color etiqueta={tk('controles.degradado2')} valor={b.gradient_2} onCambiar={(v) => setBotonCampo('gradient_2', v)} />
          </div>
          <Rango etiqueta="Ángulo del degradado" valor={b.gradient_angle} min={0} max={360} onCambiar={(n) => setBotonCampo('gradient_angle', n)} />
        </div>
      )}

      {pestana === 'etiquetas' && (
        <div className="flex flex-col gap-3">
          <Lista etiqueta="Forma" valor={vista.label_shape} opciones={FORMAS_ETIQUETA} nombres={{ square: 'Cuadrada', rounded: 'Redonda', semi: 'Semi', pill: 'Píldora', circle: 'Círculo (el %)' }} onCambiar={(v) => cambiar('label_shape', v)} />
          <Lista etiqueta="Estilo" valor={vista.label_style} opciones={ESTILOS_ETIQUETA} nombres={{ solid: 'Sólido', soft: 'Suave', outline: 'Contorno', gradient: 'Degradado' }} onCambiar={(v) => cambiar('label_style', v)} />
          <Lista etiqueta="Posición" valor={vista.label_position} opciones={POSICIONES_ETIQUETA} nombres={{ top_left: 'Arriba izquierda', top_right: 'Arriba derecha', bottom_left: 'Abajo izquierda', bottom_right: 'Abajo derecha', over_title: 'Sobre el título' }} onCambiar={(v) => cambiar('label_position', v)} />
          <div className="flex flex-wrap gap-1">
            {(Object.keys(NOMBRE_ETIQUETA) as ClaveEtiqueta[]).map((k) => (
              <button key={k} type="button" onClick={() => setEtiqueta(k)} className={clasesBoton({ variante: etiqueta === k ? 'primario' : 'fantasma', tamano: 'sm' })}>
                {NOMBRE_ETIQUETA[k]}
              </button>
            ))}
          </div>
          <Interruptor etiqueta="Mostrar" valor={e.show === true} onCambiar={(v) => setEtiquetaCampo('show', v)} />
          <div className="grid grid-cols-2 gap-2">
            <Color etiqueta="Fondo" valor={e.bg} onCambiar={(v) => setEtiquetaCampo('bg', v)} />
            <Color etiqueta="Texto" valor={e.text} onCambiar={(v) => setEtiquetaCampo('text', v)} />
            <Color etiqueta={tk('controles.degradado1')} valor={e.gradient_1} onCambiar={(v) => setEtiquetaCampo('gradient_1', v)} />
            <Color etiqueta={tk('controles.degradado2')} valor={e.gradient_2} onCambiar={(v) => setEtiquetaCampo('gradient_2', v)} />
          </div>
        </div>
      )}

      {pestana === 'texto' && (
        <div className="flex flex-col gap-3">
          <Lista etiqueta="Alineación" valor={vista.text_align} opciones={ALINEACIONES} nombres={{ left: 'Izquierda', center: 'Centro', right: 'Derecha' }} onCambiar={(v) => cambiar('text_align', v)} />
          <Lista etiqueta="Precio" valor={vista.price_position} opciones={POSICIONES_PRECIO} nombres={{ below_title: 'Debajo del título', above_title: 'Arriba del título', beside_button: 'Junto al botón', over_image: 'Sobre la imagen' }} onCambiar={(v) => cambiar('price_position', v)} />
          <Lista etiqueta="Tamaño del precio" valor={vista.price_size} opciones={TAMANOS_TEXTO} nombres={{ sm: 'Chico', md: 'Mediano', lg: 'Grande' }} onCambiar={(v) => cambiar('price_size', v)} />
          <Color etiqueta="Color del precio" valor={vista.price_color} onCambiar={(v) => cambiar('price_color', v)} />
          <Interruptor etiqueta="Precio anterior tachado" valor={vista.show_compare_price !== false} onCambiar={(v) => cambiar('show_compare_price', v)} />
          <Interruptor etiqueta="Reseñas" valor={vista.show_reviews === true} onCambiar={(v) => cambiar('show_reviews', v)} />
          <Lista etiqueta="Posición de reseñas" valor={vista.reviews_position} opciones={POSICIONES_RESENA} nombres={{ above_title: 'Arriba del título', below_title: 'Debajo del título', over_image: 'Sobre la imagen' }} onCambiar={(v) => cambiar('reviews_position', v)} />
          <Lista etiqueta="Estilo de reseñas" valor={vista.reviews_style} opciones={ESTILOS_RESENA} nombres={{ stars: 'Estrellas', number_star: 'Número con estrella' }} onCambiar={(v) => cambiar('reviews_style', v)} />
          <Lista etiqueta="Líneas del título" valor={vista.title_lines ? String(vista.title_lines) as '1' | '2' | '3' : undefined} opciones={['1', '2', '3']} nombres={{ '1': '1 línea', '2': '2 líneas', '3': '3 líneas' }} onCambiar={(v) => cambiar('title_lines', Number(v))} />
          <Lista etiqueta="Peso del título" valor={vista.title_weight} opciones={PESOS_TITULO} nombres={{ normal: 'Normal', medium: 'Medio', semibold: 'Seminegrita', bold: 'Negrita' }} onCambiar={(v) => cambiar('title_weight', v)} />
          <Lista etiqueta="Tamaño del título" valor={vista.title_size} opciones={TAMANOS_TEXTO} nombres={{ sm: 'Chico', md: 'Mediano', lg: 'Grande' }} onCambiar={(v) => cambiar('title_size', v)} />
          <Interruptor etiqueta="Mostrar marca" valor={vista.show_brand === true} onCambiar={(v) => cambiar('show_brand', v)} />
          <Interruptor etiqueta="Mostrar categoría" valor={vista.show_category === true} onCambiar={(v) => cambiar('show_category', v)} />
        </div>
      )}

      {pestana === 'contenedor' && (
        <div className="flex flex-col gap-3">
          <Rango etiqueta="Radio" valor={vista.card_radius} min={0} max={32} onCambiar={(n) => cambiar('card_radius', n)} />
          <Rango etiqueta="Borde" valor={vista.card_border_width} min={0} max={8} onCambiar={(n) => cambiar('card_border_width', n)} />
          <Color etiqueta="Color del borde" valor={vista.card_border_color} onCambiar={(v) => cambiar('card_border_color', v)} />
          <Lista etiqueta="Sombra" valor={vista.card_shadow} opciones={SOMBRAS_TARJETA} nombres={{ none: 'Ninguna', sm: 'Suave', md: 'Media', lg: 'Fuerte', hover: 'Al pasar el mouse' }} onCambiar={(v) => cambiar('card_shadow', v)} />
          <div className="grid grid-cols-2 gap-2">
            <Color etiqueta="Fondo" valor={vista.card_bg === 'transparent' ? undefined : vista.card_bg} onCambiar={(v) => cambiar('card_bg', v)} />
            <Color etiqueta="Fondo 2" valor={vista.card_bg_2} onCambiar={(v) => cambiar('card_bg_2', v)} />
          </div>
          <Rango etiqueta="Ángulo del fondo" valor={vista.card_bg_angle} min={0} max={360} onCambiar={(n) => cambiar('card_bg_angle', n)} />
          <Rango etiqueta="Relleno" valor={vista.card_padding} min={0} max={48} onCambiar={(n) => cambiar('card_padding', n)} />
          <Rango etiqueta="Separación entre tarjetas" valor={vista.card_gap} min={0} max={64} onCambiar={(n) => cambiar('card_gap', n)} />
          <Lista etiqueta="Proporción de la imagen" valor={vista.image_ratio} opciones={RATIOS_IMAGEN} onCambiar={(v) => cambiar('image_ratio', v)} />
          <Lista etiqueta="Ajuste de la imagen" valor={vista.image_fit} opciones={AJUSTES_IMAGEN} nombres={{ cover: 'Cubrir', contain: 'Contener' }} onCambiar={(v) => cambiar('image_fit', v)} />
          <Color etiqueta="Fondo de la imagen" valor={vista.image_bg} onCambiar={(v) => cambiar('image_bg', v)} />
          <Rango etiqueta="Relleno de la imagen" valor={vista.image_padding} min={0} max={32} onCambiar={(n) => cambiar('image_padding', n)} />
          <Rango etiqueta="Radio de la imagen" valor={vista.image_radius} min={0} max={32} onCambiar={(n) => cambiar('image_radius', n)} />
          <Lista etiqueta="Imagen al pasar el mouse" valor={vista.hover_image} opciones={HOVER_IMAGEN} nombres={{ none: 'Ninguna', zoom: 'Zoom', second: 'Segunda imagen' }} onCambiar={(v) => cambiar('hover_image', v)} />
        </div>
      )}

      <div className="flex flex-col gap-2">
        {onAplicarTodas && (
          <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => onAplicarTodas(resolverTarjetaProducto(heredado, guardado) ?? normalizarTarjeta(guardado) ?? { card_preset: 'actual' })}>
            Aplicar a todas las secciones de productos
          </button>
        )}
        {onQuitar && (
          <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={onQuitar}>
            Volver a la tarjeta de hoy
          </button>
        )}
      </div>
    </section>
  );
}
