'use client';

/**
 * Inspector «Tarjeta de producto»: preset, botones, etiquetas, texto y contenedor.
 * Lo guardado es `product_card_style`. Elegir «Actual» no cambia el render de hoy.
 *
 * Opciones de las plantillas de tienda (Figma B1, PLANO §2 ítems 1-9), con la insignia «Nuevo»:
 * precio junto al nombre, línea bajo el nombre, prefijo «Desde», fuente del nombre, estilo «Suave»
 * de los botones, texto del botón «Elegir», corazón (estilo y esquina), tarjetas con borde
 * compartido y cómo entra la segunda foto. Su opción «como hoy» no escribe la clave
 * (`tarjetaTiendaLogica.ts`).
 */
import { useTextosEditor } from '../textos';
import { ColorTema, InsigniaNuevo } from './PartesZonaGlobal';
import { EtiquetasPropiasTarjeta } from './EtiquetasPropiasTarjeta';
import { SelectKit, CasillaKit, NumeroKit } from './controlesKit';
import { useEffect, useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import {
  OPCION_HOY,
  opcionVisibleTarjeta,
  textoElegirAlGuardar,
  valorAlElegirTarjeta,
  type ClaveListaTienda,
} from './tarjetaTiendaLogica';
import { TabBar, clasesBoton } from '@/components/kit';
import {
  ALINEACIONES,
  ANCHOS_BOTON,
  AJUSTES_IMAGEN,
  ESTILOS_BOTON_TARJETA,
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
  MAX_TEXTO_ELEGIR,
  POSICIONES_PRECIO_TARJETA,
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
  /** Claves con valor propio de la sección (estilo de tarjeta o claves sueltas de siempre). */
  propias?: string[];
  /** Restablece un valor: lo borra del estilo y de la clave suelta heredada. */
  onRestablecer?: (clave: string) => void;
  /** Copia el estilo efectivo a todas las secciones de productos de la página. */
  onAplicarTodas?: (estilo: EstiloTarjetaProducto) => void;
}

const NOMBRE_CLAVE: Record<string, string> = {
  card_radius: 'Radio', card_shadow: 'Sombra', card_border_width: 'Borde', card_border_color: 'Color del borde',
  card_bg: 'Fondo', card_bg_2: 'Fondo 2', card_bg_angle: 'Ángulo del fondo', card_padding: 'Relleno', card_gap: 'Separación',
  image_fit: 'Ajuste de la imagen', image_ratio: 'Proporción de la imagen', image_bg: 'Fondo de la imagen',
  image_padding: 'Relleno de la imagen', image_radius: 'Radio de la imagen', hover_image: 'Imagen al pasar el mouse',
  text_align: 'Alineación', title_lines: 'Líneas del título', title_weight: 'Peso del título', title_size: 'Tamaño del título',
  price_color: 'Color del precio', price_position: 'Precio', price_size: 'Tamaño del precio', show_compare_price: 'Precio anterior tachado',
  show_reviews: 'Reseñas', reviews_position: 'Posición de reseñas', reviews_style: 'Estilo de reseñas', show_brand: 'Marca',
  show_category: 'Categoría', label_shape: 'Forma de etiquetas', label_style: 'Estilo de etiquetas', label_position: 'Posición de etiquetas',
  card_subtitle: 'Línea bajo el nombre', price_prefix: 'Prefijo del precio', title_font: 'Fuente del nombre',
  card_grid_lines: 'Tarjetas con borde compartido', wishlist_style: 'Estilo del corazón', wishlist_position: 'Posición del corazón',
  hover_image_transition: 'Cómo entra la segunda foto', choose_label: 'Texto de «Elegir»',
};

/** Opciones nuevas (Figma B1). La primera, `OPCION_HOY`, no escribe la clave. */
const OPCIONES_TIENDA: Record<ClaveListaTienda, readonly (readonly [string, string])[]> = {
  card_subtitle: [
    [OPCION_HOY, 'Ninguna (hoy)'],
    ['brand', 'Marca'],
    ['dimensions', 'Medidas (largo × ancho × alto)'],
    ['reference', 'Referencia'],
    ['description', '1.ª línea de la descripción'],
  ],
  price_prefix: [
    [OPCION_HOY, 'Ninguno (hoy)'],
    ['desde', '«Desde»'],
  ],
  title_font: [
    [OPCION_HOY, 'La del cuerpo (hoy)'],
    ['heading', 'La de títulos del tema'],
  ],
  wishlist_style: [
    [OPCION_HOY, 'Como lo decida la sección (hoy)'],
    ['none', 'Ninguno'],
    ['circle', 'En círculo'],
    ['ghost', 'Fantasma'],
  ],
  wishlist_position: [
    [OPCION_HOY, 'Arriba a la derecha (hoy)'],
    ['top_left', 'Arriba a la izquierda'],
  ],
  hover_image_transition: [
    [OPCION_HOY, 'Fundido (hoy)'],
    ['slide', 'Se desliza'],
  ],
};

function Campo({ etiqueta, children, nuevo, ayuda }: { etiqueta: string; children: ReactNode; nuevo?: boolean; ayuda?: string }) {
  return (
    <div role="group" aria-label={etiqueta} className="flex flex-col gap-1 text-[12px] leading-4 text-fg-secondary">
      <span className="flex flex-wrap items-center gap-1.5">
        {etiqueta}
        {nuevo && <InsigniaNuevo />}
      </span>
      {children}
      {ayuda && <span className="text-[11px] leading-[14px] text-fg-muted">{ayuda}</span>}
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
  nuevo,
  ayuda,
}: {
  etiqueta: string;
  valor: T | undefined;
  opciones: readonly T[];
  nombres?: Record<string, string>;
  onCambiar: (valor: T) => void;
  nuevo?: boolean;
  ayuda?: string;
}) {
  return (
    <Campo etiqueta={etiqueta} nuevo={nuevo} ayuda={ayuda}>
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

function Interruptor({ etiqueta, valor, onCambiar, nuevo, ayuda }: { etiqueta: string; valor: boolean | undefined; onCambiar: (v: boolean) => void; nuevo?: boolean; ayuda?: string }) {
  const casilla = (
    <CasillaKit
      titulo={nuevo ? <span className="flex flex-wrap items-center gap-1.5">{etiqueta}<InsigniaNuevo /></span> : etiqueta}
      checked={valor === true}
      onChange={(e) => onCambiar(e.target.checked)}
    />
  );
  if (!ayuda) return casilla;
  return (
    <div className="flex flex-col gap-0.5">
      {casilla}
      <span className="text-[11px] leading-[14px] text-fg-muted">{ayuda}</span>
    </div>
  );
}

/**
 * Texto del botón «Elegir» (`choose_label`, máx. 24). Se edita en un borrador local y se guarda al
 * salir del campo o con Enter: el normalizador recorta espacios y, guardando a cada tecla, no se
 * podría escribir «Elige un acabado». Vacío = el texto de hoy (borra la clave).
 */
function TextoElegir({ valor, onGuardar }: { valor: string | undefined; onGuardar: (texto: string | null) => void }) {
  const [borrador, setBorrador] = useState(valor ?? '');
  useEffect(() => setBorrador(valor ?? ''), [valor]);
  const guardar = () => {
    const texto = textoElegirAlGuardar(borrador, MAX_TEXTO_ELEGIR);
    if (texto !== (valor ?? null)) onGuardar(texto);
  };
  return (
    <Campo
      etiqueta="Elige una variante antes de agregar"
      nuevo
      ayuda={`Máx. ${MAX_TEXTO_ELEGIR}. Vacío: el texto de hoy. Agregar no cambia: un producto con variantes lleva a elegir.`}
    >
      <Input
        aria-label="Texto del botón «Elegir»"
        value={borrador}
        maxLength={MAX_TEXTO_ELEGIR}
        placeholder="Elige un acabado"
        onChange={(e) => setBorrador(e.target.value)}
        onBlur={guardar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') guardar();
        }}
        className="h-8 text-sm"
      />
    </Campo>
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

export function InspectorTarjetaProducto({ guardado, heredado, onCambiar, onQuitar, onAplicarTodas, propias, onRestablecer }: InspectorTarjetaProductoProps) {
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
  /** Lista de una opción nueva: «como hoy» primero; elegirla borra la clave (ver tarjetaTiendaLogica). */
  const listaTienda = (clave: ClaveListaTienda, etiquetaLista: string, ayuda?: string) => (
    <Lista
      etiqueta={etiquetaLista}
      nuevo
      ayuda={ayuda}
      valor={opcionVisibleTarjeta(clave, vista)}
      opciones={OPCIONES_TIENDA[clave].map(([v]) => v)}
      nombres={Object.fromEntries(OPCIONES_TIENDA[clave])}
      onCambiar={(v) => cambiar(clave, valorAlElegirTarjeta(clave, v, heredado))}
    />
  );

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

      {onRestablecer && propias && propias.length > 0 && (
        <div role="group" aria-label="Valores propios de esta sección" className="flex flex-col gap-1 text-[12px] leading-4 text-fg-secondary">
          <span>Valores propios de esta sección. Toca uno para restablecerlo: vuelve al del preset de la sección si tiene uno; si no, al estilo del sitio.</span>
          <div className="flex flex-wrap gap-1">
            {propias.map((k) => (
              <button key={k} type="button" title="Restablecer" onClick={() => onRestablecer(k)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                {NOMBRE_CLAVE[k] ?? k} ↺
              </button>
            ))}
          </div>
        </div>
      )}

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
          <Lista etiqueta="Estilo" valor={b.button_style} opciones={ESTILOS_BOTON_TARJETA} nombres={{ solid: 'Sólido', outline: 'Contorno', ghost: 'Fantasma', gradient: 'Degradado', icon_only: 'Solo ícono', soft: 'Suave (nuevo)' }} ayuda="Suave: fondo tenue del color del texto y texto del color principal." onCambiar={(v) => setBotonCampo('button_style', v)} />
          {boton === 'choose' && <TextoElegir valor={vista.choose_label} onGuardar={(texto) => cambiar('choose_label', texto)} />}
          <Lista etiqueta="Forma" valor={b.button_shape} opciones={FORMAS_BOTON} nombres={{ square: 'Cuadrada', rounded: 'Redonda (8)', semi: 'Semi (14)', pill: 'Píldora', circle: 'Círculo' }} onCambiar={(v) => setBotonCampo('button_shape', v)} />
          <Lista etiqueta="Tamaño" valor={b.button_size} opciones={TAMANOS_BOTON} nombres={{ sm: 'Chico', md: 'Mediano', lg: 'Grande' }} onCambiar={(v) => setBotonCampo('button_size', v)} />
          <Lista etiqueta="Ancho" valor={b.button_width} opciones={ANCHOS_BOTON} nombres={{ full: 'Completo', auto: 'Automático' }} onCambiar={(v) => setBotonCampo('button_width', v)} />
          <Lista etiqueta="Posición" valor={b.button_position} opciones={POSICIONES_BOTON} nombres={{ bottom: 'Abajo', over_image_bottom: 'Sobre la imagen', over_image_corner: 'Esquina de la imagen', inline_price: 'Junto al precio' }} onCambiar={(v) => setBotonCampo('button_position', v)} />
          <Lista etiqueta="Visibilidad" valor={b.button_visibility} opciones={VISIBILIDAD_BOTON} nombres={{ always: 'Siempre', hover: 'Al pasar el mouse (en celular, siempre)' }} onCambiar={(v) => setBotonCampo('button_visibility', v)} />
          {boton === 'add' && b.button_style === 'icon_only' && b.button_shape === 'circle' && (
            <Interruptor etiqueta="Contador de cantidad" valor={b.quantity_stepper === true} onCambiar={(v) => setBotonCampo('quantity_stepper', v ? true : undefined)} />
          )}
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
          <div role="group" aria-label="Corazón · favoritos" className="flex flex-col gap-3 border-t border-line pt-3">
            <span className="text-[12px] font-semibold leading-4 text-fg-secondary">Corazón · favoritos</span>
            {listaTienda('wishlist_style', 'Estilo del corazón', 'Sin elegir, el corazón sale o no según los botones de la sección, como hoy.')}
            {listaTienda('wishlist_position', 'Posición del corazón')}
          </div>
          <p className="rounded-md bg-subtle p-2 text-[11px] leading-[14px] text-fg-muted">
            «Agregar · $ precio» se activa en la ficha, no en la tarjeta: Plantillas de página › Producto › bloque Acciones.
          </p>
        </div>
      )}

      {pestana === 'etiquetas' && (
        <div className="flex flex-col gap-3">
          <Interruptor etiqueta="Unidades vendidas («180 vendidos»)" valor={vista.show_sales_count === true} onCambiar={(v) => cambiar('show_sales_count', v ? true : undefined)} />
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
          <EtiquetasPropiasTarjeta lista={vista.labels_custom ?? []} onCambiar={(l) => cambiar('labels_custom', l.length > 0 ? l : undefined)} />
        </div>
      )}

      {pestana === 'texto' && (
        <div className="flex flex-col gap-3">
          <Lista etiqueta="Alineación" valor={vista.text_align} opciones={ALINEACIONES} nombres={{ left: 'Izquierda', center: 'Centro', right: 'Derecha' }} onCambiar={(v) => cambiar('text_align', v)} />
          <Lista etiqueta="Precio" valor={vista.price_position} opciones={POSICIONES_PRECIO_TARJETA} nombres={{ below_title: 'Debajo del título', above_title: 'Arriba del título', beside_button: 'Junto al botón', over_image: 'Sobre la imagen', beside_title: 'Junto al nombre (nuevo)' }} onCambiar={(v) => cambiar('price_position', v)} />
          {listaTienda('price_prefix', 'Prefijo del precio', 'Solo en productos con variantes, sobre el precio que ya se muestra.')}
          <Lista etiqueta="Tamaño del precio" valor={vista.price_size} opciones={TAMANOS_TEXTO} nombres={{ sm: 'Chico', md: 'Mediano', lg: 'Grande' }} onCambiar={(v) => cambiar('price_size', v)} />
          <Color etiqueta="Color del precio" valor={vista.price_color} onCambiar={(v) => cambiar('price_color', v)} />
          <Interruptor etiqueta="Precio anterior tachado" valor={vista.show_compare_price !== false} onCambiar={(v) => cambiar('show_compare_price', v)} />
          <Interruptor etiqueta="Reseñas" valor={vista.show_reviews === true} onCambiar={(v) => cambiar('show_reviews', v)} />
          <Lista etiqueta="Posición de reseñas" valor={vista.reviews_position} opciones={POSICIONES_RESENA} nombres={{ above_title: 'Arriba del título', below_title: 'Debajo del título', over_image: 'Sobre la imagen' }} onCambiar={(v) => cambiar('reviews_position', v)} />
          <Lista etiqueta="Estilo de reseñas" valor={vista.reviews_style} opciones={ESTILOS_RESENA} nombres={{ stars: 'Estrellas', number_star: 'Número con estrella' }} onCambiar={(v) => cambiar('reviews_style', v)} />
          <Lista etiqueta="Líneas del título" valor={vista.title_lines ? String(vista.title_lines) as '1' | '2' | '3' : undefined} opciones={['1', '2', '3']} nombres={{ '1': '1 línea', '2': '2 líneas', '3': '3 líneas' }} onCambiar={(v) => cambiar('title_lines', Number(v))} />
          <Lista etiqueta="Peso del título" valor={vista.title_weight} opciones={PESOS_TITULO} nombres={{ normal: 'Normal', medium: 'Medio', semibold: 'Seminegrita', bold: 'Negrita' }} onCambiar={(v) => cambiar('title_weight', v)} />
          <Lista etiqueta="Tamaño del título" valor={vista.title_size} opciones={TAMANOS_TEXTO} nombres={{ sm: 'Chico', md: 'Mediano', lg: 'Grande' }} onCambiar={(v) => cambiar('title_size', v)} />
          {listaTienda('title_font', 'Fuente del nombre')}
          {listaTienda('card_subtitle', 'Línea bajo el nombre', 'Si el producto no tiene el dato, no se muestra la línea.')}
          <Interruptor etiqueta="Mostrar marca" valor={vista.show_brand === true} onCambiar={(v) => cambiar('show_brand', v)} />
          <Interruptor etiqueta="Mostrar categoría" valor={vista.show_category === true} onCambiar={(v) => cambiar('show_category', v)} />
        </div>
      )}

      {pestana === 'contenedor' && (
        <div className="flex flex-col gap-3">
          <Rango etiqueta="Radio" valor={vista.card_radius} min={0} max={48} onCambiar={(n) => cambiar('card_radius', n)} />
          <Rango etiqueta="Borde" valor={vista.card_border_width} min={0} max={8} onCambiar={(n) => cambiar('card_border_width', n)} />
          <Color etiqueta="Color del borde" valor={vista.card_border_color} onCambiar={(v) => cambiar('card_border_color', v)} />
          <Lista etiqueta="Sombra" valor={vista.card_shadow} opciones={SOMBRAS_TARJETA} nombres={{ none: 'Ninguna', sm: 'Suave', md: 'Media', lg: 'Fuerte', xl: 'Muy fuerte', hover: 'Al pasar el mouse' }} onCambiar={(v) => cambiar('card_shadow', v)} />
          <div className="grid grid-cols-2 gap-2">
            <Color etiqueta="Fondo" valor={vista.card_bg === 'transparent' ? undefined : vista.card_bg} onCambiar={(v) => cambiar('card_bg', v)} />
            <Color etiqueta="Fondo 2" valor={vista.card_bg_2} onCambiar={(v) => cambiar('card_bg_2', v)} />
          </div>
          <Rango etiqueta="Ángulo del fondo" valor={vista.card_bg_angle} min={0} max={360} onCambiar={(n) => cambiar('card_bg_angle', n)} />
          <Rango etiqueta="Relleno" valor={vista.card_padding} min={0} max={48} onCambiar={(n) => cambiar('card_padding', n)} />
          <Interruptor
            etiqueta="Tarjetas con borde compartido"
            nuevo
            ayuda="Sin separación: una línea de 1 px entre tarjetas. Con esto encendido, la separación no aplica."
            valor={vista.card_grid_lines === true}
            onCambiar={(v) => cambiar('card_grid_lines', v ? true : null)}
          />
          <Rango etiqueta="Separación entre tarjetas" valor={vista.card_gap} min={0} max={64} onCambiar={(n) => cambiar('card_gap', n)} />
          <Lista etiqueta="Proporción de la imagen" valor={vista.image_ratio} opciones={RATIOS_IMAGEN} onCambiar={(v) => cambiar('image_ratio', v)} />
          <Lista etiqueta="Ajuste de la imagen" valor={vista.image_fit} opciones={AJUSTES_IMAGEN} nombres={{ cover: 'Cubrir', contain: 'Contener', fill: 'Rellenar' }} onCambiar={(v) => cambiar('image_fit', v)} />
          <Color etiqueta="Fondo de la imagen" valor={vista.image_bg} onCambiar={(v) => cambiar('image_bg', v)} />
          <Rango etiqueta="Relleno de la imagen" valor={vista.image_padding} min={0} max={32} onCambiar={(n) => cambiar('image_padding', n)} />
          <Rango etiqueta="Radio de la imagen" valor={vista.image_radius} min={0} max={32} onCambiar={(n) => cambiar('image_radius', n)} />
          <Lista etiqueta="Imagen al pasar el mouse" valor={vista.hover_image} opciones={HOVER_IMAGEN} nombres={{ none: 'Ninguna', zoom: 'Zoom', second: 'Segunda imagen' }} onCambiar={(v) => cambiar('hover_image', v)} />
          {vista.hover_image === 'second' && listaTienda('hover_image_transition', 'Cómo entra la segunda foto')}
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
