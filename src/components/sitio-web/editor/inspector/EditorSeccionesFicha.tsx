'use client';

/**
 * Paneles de las secciones de la ficha de producto: Beneficios, Reseñas, Productos relacionados y
 * Descripción (Figma «16 Sitio web», sección 2983:72501, aprobada por el dueño el 2026-11-24):
 * - Beneficios: Diseño 2985:72792 · Contenido 2985:72976 · Estilo 2985:73273.
 * - Reseñas: Diseño 2987:73690 · Contenido 2987:73880 · Estilo 2987:74017.
 * - Relacionados: Diseño 2989:74314 · Contenido 2989:74523 · Estilo 2989:74670.
 * - Descripción: Diseño 2991:74640 · Contenido 2991:74830 · Estilo 2991:74978.
 *
 * No guarda: cada cambio va a `onCambiar` (contenido del bloque) y el lienzo lo pinta en vivo,
 * como el resto del inspector. Claves, lectura y valores por defecto (= el aspecto de hoy):
 * `@/lib/website/v2/seccionesFicha` (la misma copia que usa la tienda). «Volver al aspecto de
 * hoy» quita las claves nuevas de la sección.
 */
import { useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  BadgePercent, ChevronDown, Clock, CreditCard, Info, Lock, MapPin, PackageCheck, Phone, Plus, RefreshCw, ShieldCheck, Star, Trash2, Truck, Wrench,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import { AvisoTonal, ChipsOpcion, SegmentedControl, clasesBoton } from '@/components/kit';
import { AsaArrastre, CLASES_HUECO, Ordenable, ZonaOrdenable } from '@/components/kit/arrastreTabla';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ColorField } from '@/components/sitio-web/ui/ColorField';
import {
  BENEFICIOS_POR_DEFECTO,
  CLAVES_BENEFICIOS,
  CLAVES_DESCRIPCION,
  CLAVES_NUEVAS_BENEFICIOS,
  CLAVES_NUEVAS_DESCRIPCION,
  CLAVES_NUEVAS_RELACIONADOS,
  CLAVES_NUEVAS_RESENAS,
  CLAVES_RELACIONADOS,
  CLAVES_RESENAS,
  COLOR_PROPIO_ICONO_POR_DEFECTO,
  FILAS_FICHA,
  ICONOS_BENEFICIO,
  LINEAS_VER_MAS,
  MAX_BENEFICIOS,
  PARTES_DESCRIPCION,
  TITULOS_PARTES_POR_DEFECTO,
  TITULO_RELACIONADOS_POR_DEFECTO,
  TONOS_MULTICOLOR,
  conClave,
  leerItemsBeneficios,
  leerOpcionesBeneficios,
  leerOpcionesDescripcion,
  leerOpcionesRelacionados,
  leerOpcionesResenas,
  sinClaves,
  type BeneficioFichaItem,
  type FiltroResenas,
  type ParteDescripcion,
} from '@/lib/website/v2/seccionesFicha';
import { EtiquetaGrupo, FilaInterruptor, InsigniaNuevo, TarjetaComposicion, TituloBloque } from './PartesZonaGlobal';

/** Inventario › Productos: los relacionados a mano y la ficha técnica se editan en cada producto (pestaña Tienda). */
export const RUTA_INVENTARIO_PRODUCTOS = '/app/inventario/productos';

/** Tipos de sección con panel propio. */
export const TIPOS_SECCIONES_FICHA = ['product_benefits', 'product_reviews', 'related_products', 'product_description'] as const;
export type TipoSeccionFicha = (typeof TIPOS_SECCIONES_FICHA)[number];

export function esSeccionFichaConPanel(tipo: string): tipo is TipoSeccionFicha {
  return (TIPOS_SECCIONES_FICHA as readonly string[]).includes(tipo);
}

/**
 * Campos genéricos (`contentFields`) que estos paneles ya pintan: no se muestran dos veces. Los de
 * la descripción (`layout`, `show_specs`) la tienda nunca los aplicó; `max_height` es «Por letras».
 */
export const CAMPOS_CUBIERTOS_FICHA: Readonly<Record<TipoSeccionFicha, readonly string[]>> = {
  product_benefits: ['items', 'columns', 'gap'],
  product_reviews: ['reviews_source', 'empty_state_title', 'empty_state_message', 'empty_state_cta'],
  related_products: ['source', 'max_items', 'title'],
  product_description: ['layout', 'max_height', 'show_specs'],
};

const CLAVES_NUEVAS: Readonly<Record<TipoSeccionFicha, readonly string[]>> = {
  product_benefits: CLAVES_NUEVAS_BENEFICIOS,
  product_reviews: CLAVES_NUEVAS_RESENAS,
  related_products: CLAVES_NUEVAS_RELACIONADOS,
  product_description: CLAVES_NUEVAS_DESCRIPCION,
};

export const ICONOS_LUCIDE_BENEFICIO: Record<string, LucideIcon> = {
  Truck, ShieldCheck, Wrench, RefreshCw, CreditCard, Lock, Clock, MapPin, PackageCheck, BadgePercent, Star, Phone,
  // Los de antes (la tienda los sigue pintando).
  Shield: ShieldCheck,
  Package: PackageCheck,
};

/** Textos: `sitioWeb.editor.seccionesFicha.*` (es/en/fr/pt). */
function useT() {
  return useTranslations('sitioWeb.editor.seccionesFicha');
}

type Cambiar = (contenido: Record<string, unknown>) => void;
export type PestanaPanelFicha = 'diseno' | 'contenido' | 'estilo';

const Ayuda = ({ children }: { children: ReactNode }) => <p className="text-[11px] leading-[14px] text-fg-muted">{children}</p>;

/** Grupo «etiqueta (+ Nuevo) · control segmentado a todo el ancho». */
function Segmento<V extends string>({
  etiqueta, nuevo, opciones, valor, onCambiar, ayuda,
}: { etiqueta: string; nuevo?: boolean; opciones: readonly { valor: V; etiqueta: string }[]; valor: V; onCambiar: (v: V) => void; ayuda?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5">
        <EtiquetaGrupo id={id}>{etiqueta}</EtiquetaGrupo>
        {nuevo && <InsigniaNuevo />}
      </span>
      <SegmentedControl<V> aria-labelledby={id} tamano="sm" anchoCompleto valor={valor} onValorChange={onCambiar} opciones={opciones} />
      {ayuda && <Ayuda>{ayuda}</Ayuda>}
    </div>
  );
}

/** Chips de selección múltiple (filtros, partes, filas de la ficha técnica). */
function ChipsMultiples<V extends string>({
  etiqueta, nuevo, opciones, valores, onCambiar, ayuda,
}: { etiqueta: string; nuevo?: boolean; opciones: readonly { valor: V; etiqueta: string }[]; valores: readonly V[]; onCambiar: (v: V[]) => void; ayuda?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5">
        <EtiquetaGrupo id={id}>{etiqueta}</EtiquetaGrupo>
        {nuevo && <InsigniaNuevo />}
      </span>
      <div role="group" aria-labelledby={id} className="flex flex-wrap gap-1.5">
        {opciones.map((o) => {
          const activo = valores.includes(o.valor);
          return (
            <button
              key={o.valor}
              type="button"
              aria-pressed={activo}
              onClick={() => onCambiar(activo ? valores.filter((v) => v !== o.valor) : [...valores, o.valor])}
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors',
                activo ? 'border-brand bg-brand-tint text-brand-deep' : 'border-line bg-surface text-fg-secondary hover:bg-hover',
              )}
            >
              {activo && <span aria-hidden="true">✓</span>}
              {o.etiqueta}
            </button>
          );
        })}
      </div>
      {ayuda && <Ayuda>{ayuda}</Ayuda>}
    </div>
  );
}

function CampoTextoFicha({ etiqueta, valor, placeholder, onCambiar, max = 120, largo }: { etiqueta: string; valor: string; placeholder?: string; onCambiar: (v: string | undefined) => void; max?: number; largo?: boolean }) {
  const id = useId();
  const [texto, setTexto] = useState(valor);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold leading-4 text-fg-secondary">{etiqueta}</label>
      {largo ? (
        <Textarea id={id} value={texto} maxLength={max} placeholder={placeholder} rows={2} onChange={(e) => { setTexto(e.target.value); onCambiar(e.target.value.trim() ? e.target.value : undefined); }} />
      ) : (
        <Input id={id} value={texto} maxLength={max} placeholder={placeholder} onChange={(e) => { setTexto(e.target.value); onCambiar(e.target.value.trim() ? e.target.value : undefined); }} />
      )}
    </div>
  );
}

/** Miniatura genérica de estilo: rectángulos que sugieren la forma (Figma, tarjetas de estilo). */
function Miniatura({ forma }: { forma: string }) {
  const barra = (w: string, extra = '') => <span className={cn('block h-1.5 rounded-sm bg-line-strong', extra)} style={{ width: w }} />;
  const punto = <span className="block size-2.5 shrink-0 rounded-full bg-brand-action/70" />;
  const caja = 'absolute inset-0 flex p-2';
  switch (forma) {
    case 'lista':
      return <span className={cn(caja, 'flex-col justify-center gap-1.5')}>{[0, 1, 2].map((i) => <span key={i} className="flex items-center gap-1.5">{punto}{barra('70%')}</span>)}</span>;
    case 'tarjetas':
    case 'rejilla':
      return <span className={cn(caja, 'items-center gap-1')}>{[0, 1, 2].map((i) => <span key={i} className="flex h-9 flex-1 flex-col gap-1 rounded-sm border border-line bg-surface p-1"><span className="block size-2.5 rounded-sm bg-fg-secondary" />{barra('80%')}</span>)}</span>;
    case 'franja':
      return <span className={cn(caja, 'items-center')}><span className="flex w-full items-center justify-around rounded-sm bg-surface px-1 py-2">{[0, 1, 2].map((i) => <span key={i} className="flex items-center gap-1">{punto}{barra('14px')}</span>)}</span></span>;
    case 'insignias':
      return <span className={cn(caja, 'flex-wrap content-center gap-1')}>{[0, 1, 2, 3].map((i) => <span key={i} className="flex items-center gap-1 rounded-full border border-line bg-surface px-1.5 py-0.5">{punto}{barra('16px')}</span>)}</span>;
    case 'clasico':
      return <span className={cn(caja, 'gap-1.5')}><span className="flex w-1/3 flex-col gap-1">{barra('100%', 'bg-fg-secondary')}{[0, 1, 2].map((i) => <span key={i} className="block h-1 rounded-sm bg-brand-action/70" />)}</span><span className="flex flex-1 flex-col gap-1">{[0, 1, 2].map((i) => <span key={i} className="block h-2.5 rounded-sm border border-line bg-surface" />)}</span></span>;
    case 'carrusel':
      return <span className={cn(caja, 'flex-col gap-1')}>{barra('60%', 'bg-fg-secondary')}<span className="flex flex-1 gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className="flex-1 rounded-sm border border-line bg-surface" />)}</span></span>;
    case 'compacta':
      return <span className={cn(caja, 'flex-col justify-center gap-1 rounded-sm')}><span className="flex gap-1">{barra('30%', 'bg-brand-action/70')}{barra('20%')}</span>{barra('90%')}{barra('70%')}</span>;
    case 'fotos':
      return <span className={cn(caja, 'flex-col gap-1')}><span className="flex gap-1">{[0, 1, 2, 3, 4].map((i) => <span key={i} className="block size-4 rounded-sm bg-line-strong" />)}</span><span className="flex flex-1 gap-1">{[0, 1].map((i) => <span key={i} className="flex-1 rounded-sm border border-line bg-surface" />)}</span></span>;
    case 'juntos':
      return <span className={cn(caja, 'items-center gap-1')}>{[0, 1, 2].map((i) => <span key={i} className="flex items-center gap-1"><span className="block size-5 rounded-sm bg-surface" />{i < 2 && <span className="text-[8px] text-fg-muted">+</span>}</span>)}<span className="ml-auto flex flex-col gap-1">{barra('20px', 'bg-fg-secondary')}<span className="block h-1.5 w-5 rounded-sm bg-brand-action" /></span></span>;
    case 'ver_mas':
      return <span className={cn(caja, 'flex-col justify-center gap-1')}>{barra('40%', 'bg-fg-secondary')}{barra('90%')}{barra('80%')}<span className="block h-1.5 w-1/4 rounded-sm bg-brand-action" /></span>;
    case 'pestanas':
      return <span className={cn(caja, 'flex-col gap-1.5')}><span className="flex gap-1.5"><span className="block h-1.5 w-1/4 rounded-sm bg-fg-secondary" />{barra('20%')}{barra('20%')}</span><span className="block h-0.5 w-1/4 bg-brand-action" />{barra('90%')}{barra('80%')}</span>;
    case 'acordeon':
      return <span className={cn(caja, 'flex-col justify-center gap-1.5')}>{[0, 1, 2].map((i) => <span key={i} className="flex items-center justify-between border-b border-line pb-1">{barra('50%', 'bg-fg-secondary')}<span className="block size-1.5 bg-fg-muted" /></span>)}</span>;
    case 'tabla':
      return <span className={cn(caja, 'gap-1.5')}><span className="flex flex-1 flex-col justify-center gap-1">{barra('90%')}{barra('80%')}{barra('85%')}</span><span className="flex flex-1 flex-col justify-center gap-0.5 rounded-sm border border-line bg-surface p-1">{[0, 1, 2, 3].map((i) => <span key={i} className="flex gap-1">{barra('40%')}{barra('40%', 'bg-fg-secondary')}</span>)}</span></span>;
    default:
      return null;
  }
}

function EstilosTarjetas<V extends string>({ estilos, valor, onElegir, etiqueta, insignia }: { estilos: readonly V[]; valor: V; onElegir: (v: V) => void; etiqueta: (v: V) => string; insignia?: (v: V) => ReactNode }) {
  const t = useT();
  const id = useId();
  return (
    <section className="flex flex-col gap-2" aria-labelledby={id}>
      <span className="flex items-center gap-2">
        <span id={id}><TituloBloque>{t('estilo')}</TituloBloque></span>
        <InsigniaNuevo />
      </span>
      <Ayuda>{t('ayudaEstilo')}</Ayuda>
      <div role="radiogroup" aria-labelledby={id} className="grid grid-cols-2 gap-2">
        {estilos.map((e) => (
          <div key={e} className="flex flex-col gap-1">
            <TarjetaComposicion etiqueta={etiqueta(e)} seleccionada={valor === e} onElegir={() => onElegir(e)}>
              <Miniatura forma={e} />
            </TarjetaComposicion>
            {insignia?.(e)}
          </div>
        ))}
      </div>
    </section>
  );
}

function Restablecer({ tipo, contenido, onCambiar }: { tipo: TipoSeccionFicha; contenido: Record<string, unknown>; onCambiar: Cambiar }) {
  const t = useT();
  const conOpciones = CLAVES_NUEVAS[tipo].some((k) => contenido[k] !== undefined);
  if (!conOpciones) return null;
  return (
    <div className="flex flex-col gap-1 border-t border-line pt-3">
      <button type="button" onClick={() => onCambiar(sinClaves(contenido, CLAVES_NUEVAS[tipo]))} className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'self-start')}>
        {t('restablecer')}
      </button>
      <Ayuda>{t('ayudaRestablecer')}</Ayuda>
    </div>
  );
}

// ─── Beneficios ─────────────────────────────────────────────────────────────────────────────

function PanelBeneficios({ pestana, contenido, onCambiar }: { pestana: PestanaPanelFicha; contenido: Record<string, unknown>; onCambiar: Cambiar }) {
  const t = useT();
  const o = useMemo(() => leerOpcionesBeneficios(contenido), [contenido]);
  const k = CLAVES_BENEFICIOS;
  const poner = (clave: string, v: unknown) => onCambiar(conClave(contenido, clave, v));
  // La primera opción nueva fija el estilo de hoy (Lista): la tienda pasa al pintado con opciones.
  const ponerNueva = (clave: string, v: unknown) => onCambiar(conClave({ ...contenido, [k.estilo]: contenido[k.estilo] ?? o.estilo }, clave, v));

  if (pestana === 'diseno') {
    return (
      <>
        <EstilosTarjetas estilos={['lista', 'tarjetas', 'franja', 'insignias'] as const} valor={o.estilo} onElegir={(v) => poner(k.estilo, v)} etiqueta={(v) => t(`beneficios.estilos.${v}`)} />
        <Segmento
          etiqueta={t('beneficios.columnasEscritorio')}
          opciones={['1', '2', '3', '4'].map((v) => ({ valor: v, etiqueta: v }))}
          valor={String(o.columnas)}
          onCambiar={(v) => ponerNueva('columns', Number(v))}
          ayuda={t('beneficios.ayudaColumnas')}
        />
        <Segmento
          etiqueta={t('beneficios.columnasCelular')}
          nuevo
          opciones={[{ valor: 'igual', etiqueta: t('beneficios.comoEscritorio') }, { valor: '1', etiqueta: t('beneficios.unaColumna') }, { valor: '2', etiqueta: t('beneficios.dosColumnas') }]}
          valor={o.columnasCelular === null ? 'igual' : String(o.columnasCelular)}
          onCambiar={(v) => ponerNueva(k.columnasCelular, v === 'igual' ? undefined : Number(v))}
        />
        <Segmento
          etiqueta={t('alineacion')}
          nuevo
          opciones={[{ valor: 'izquierda', etiqueta: t('izquierda') }, { valor: 'centro', etiqueta: t('centrada') }]}
          valor={o.alineacion}
          onCambiar={(v) => ponerNueva(k.alineacion, v)}
        />
        <FilaInterruptor titulo={t('beneficios.lineas')} ayuda={t('beneficios.ayudaLineas')} valor={o.lineas} onCambiar={(v) => ponerNueva(k.lineas, v)} />
        <FilaInterruptor titulo={t('beneficios.descripcion')} ayuda={t('beneficios.ayudaDescripcion')} valor={o.mostrarDescripcion} onCambiar={(v) => ponerNueva(k.mostrarDescripcion, v)} />
        <Segmento
          etiqueta={t('beneficios.espacio')}
          opciones={['8', '12', '16', '24', '32'].map((v) => ({ valor: v, etiqueta: `${v} px` }))}
          valor={String(o.gap ?? 16)}
          onCambiar={(v) => ponerNueva('gap', Number(v))}
        />
        <Restablecer tipo="product_benefits" contenido={contenido} onCambiar={onCambiar} />
      </>
    );
  }
  if (pestana === 'contenido') return <ListaBeneficios contenido={contenido} onCambiar={onCambiar} />;

  // Estilo
  const colorEjemplo = (i: number) => (o.modoColor === 'propio' ? o.colorPropio : o.modoColor === 'marca' ? 'var(--brand-action, #4361ee)' : TONOS_MULTICOLOR[i % 4]);
  return (
    <>
      <Segmento
        etiqueta={t('beneficios.colorIconos')}
        nuevo
        opciones={[{ valor: 'marca', etiqueta: t('beneficios.deLaMarca') }, { valor: 'propio', etiqueta: t('beneficios.unoPropio') }, { valor: 'multicolor', etiqueta: t('beneficios.multicolor') }]}
        valor={o.modoColor}
        onCambiar={(v) => ponerNueva(k.modoColor, v)}
      />
      {o.modoColor === 'marca' && (
        <div className="flex flex-col gap-1.5">
          <ChipsOpcion
            etiqueta={t('beneficios.deLaMarca')}
            opciones={(['primario', 'secundario', 'acento'] as const).map((v) => ({ valor: v, etiqueta: t(`beneficios.marca.${v}`) }))}
            valor={o.colorMarca}
            onValorChange={(v) => ponerNueva(k.colorMarca, v)}
          />
          <Ayuda>{t('beneficios.ayudaMarca')}</Ayuda>
        </div>
      )}
      {o.modoColor === 'propio' && (
        <ColorField etiqueta={t('beneficios.colorPropio')} valor={o.colorPropio ?? COLOR_PROPIO_ICONO_POR_DEFECTO} onCambiar={(hex) => ponerNueva(k.colorPropio, hex)} />
      )}
      {o.modoColor === 'multicolor' && <Ayuda>{t('beneficios.ayudaMulticolor')}</Ayuda>}
      <Segmento
        etiqueta={t('beneficios.fondo')}
        nuevo
        opciones={[{ valor: 'suave', etiqueta: t('beneficios.suave') }, { valor: 'solido', etiqueta: t('beneficios.solido') }, { valor: 'ninguno', etiqueta: t('beneficios.sinFondo') }]}
        valor={o.fondo}
        onCambiar={(v) => ponerNueva(k.fondo, v)}
      />
      <Segmento
        etiqueta={t('beneficios.forma')}
        nuevo
        opciones={[{ valor: 'circulo', etiqueta: t('circulo') }, { valor: 'cuadrado', etiqueta: t('beneficios.cuadrado') }]}
        valor={o.forma}
        onCambiar={(v) => ponerNueva(k.forma, v)}
      />
      <Segmento
        etiqueta={t('beneficios.tamano')}
        nuevo
        opciones={[{ valor: 'sm', etiqueta: t('pequeno') }, { valor: 'md', etiqueta: t('mediano') }, { valor: 'lg', etiqueta: t('grande') }]}
        valor={o.tamano}
        onCambiar={(v) => ponerNueva(k.tamano, v)}
      />
      <div className="flex flex-col gap-2 rounded-lg bg-subtle p-3" aria-hidden="true">
        <span className="text-[11px] text-fg-secondary">{t('beneficios.vistaPrevia')}</span>
        <span className="flex gap-2">
          {[Truck, ShieldCheck, Wrench, RefreshCw].map((Icono, i) => {
            const color = colorEjemplo(i);
            const solido = o.fondo === 'solido';
            return (
              <span
                key={i}
                className={cn('flex size-9 items-center justify-center', o.forma === 'circulo' ? 'rounded-full' : 'rounded-lg')}
                style={{ backgroundColor: o.fondo === 'ninguno' ? undefined : solido ? color : `color-mix(in srgb, ${color} 14%, transparent)` }}
              >
                <Icono className="size-4" style={{ color: solido ? '#fff' : color }} strokeWidth={1.75} />
              </span>
            );
          })}
        </span>
      </div>
      <Segmento
        etiqueta={t('beneficios.tarjeta')}
        opciones={[{ valor: 'ninguno', etiqueta: t('sinBorde') }, { valor: 'linea', etiqueta: t('lineaFina') }, { valor: 'sombra', etiqueta: t('sombra') }]}
        valor={o.borde}
        onCambiar={(v) => ponerNueva(k.borde, v)}
        ayuda={t('beneficios.ayudaTarjeta')}
      />
      <ColorField etiqueta={t('beneficios.fondoTarjeta')} valor={o.fondoItem ?? '#FFFFFF'} onCambiar={(hex) => ponerNueva(k.fondoItem, hex)} />
      <AvisoTonal tono="informacion" compacto icono={Info} titulo={t('beneficios.avisoSolido')} />
    </>
  );
}

function ListaBeneficios({ contenido, onCambiar }: { contenido: Record<string, unknown>; onCambiar: Cambiar }) {
  const t = useT();
  const guardados = leerItemsBeneficios(contenido);
  const items: BeneficioFichaItem[] = guardados.length > 0 ? guardados : BENEFICIOS_POR_DEFECTO.map((b) => ({ ...b, color: null }));
  const [abierto, setAbierto] = useState<number | null>(null);
  const ids = items.map((_, i) => `b${i}`);
  const guardar = (lista: BeneficioFichaItem[]) =>
    onCambiar({ ...contenido, items: lista.map((b) => ({ icon: b.icon, title: b.title, description: b.description, ...(b.color ? { color: b.color } : {}) })) });
  const cambiar = (i: number, cambio: Partial<BeneficioFichaItem>) => guardar(items.map((b, j) => (j === i ? { ...b, ...cambio } : b)));
  const nombre = (id: string) => items[Number(id.slice(1))]?.title || t('beneficios.sinTitulo');

  return (
    <section className="flex flex-col gap-2">
      <TituloBloque>{t('beneficios.lista', { n: items.length, max: MAX_BENEFICIOS })}</TituloBloque>
      <Ayuda>{t('beneficios.ayudaLista')}</Ayuda>
      <ZonaOrdenable
        ids={ids}
        nombre={nombre}
        modo="tabla"
        onMover={(id, sobre) => {
          const de = Number(String(id).slice(1));
          const a = Number(String(sobre).slice(1));
          const lista = [...items];
          const [x] = lista.splice(de, 1);
          lista.splice(a, 0, x);
          setAbierto(null);
          guardar(lista);
        }}
        capa={(id) => <div className="rounded-lg border border-brand bg-surface px-3 py-2 text-[13px] font-medium text-fg shadow-lg">{nombre(id)}</div>}
      >
        <div className="flex flex-col gap-2">
          {items.map((b, i) => {
            const Icono = ICONOS_LUCIDE_BENEFICIO[b.icon] ?? Star;
            const abiertoAqui = abierto === i;
            return (
              <Ordenable key={ids[i]} id={ids[i]}>
                {(fila) => (
                  <div ref={fila.ref} style={fila.estilo} className={cn('rounded-lg border bg-surface', abiertoAqui ? 'border-brand' : 'border-line', fila.arrastrando && CLASES_HUECO)}>
                    <div className="flex items-center gap-1 py-1 pl-1 pr-1.5">
                      <AsaArrastre asa={fila.asa} nombre={nombre(ids[i])} />
                      <Icono aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
                      <span className="ml-1 min-w-0 flex-1 truncate text-[13px] font-medium text-fg">{b.title || t('beneficios.sinTitulo')}</span>
                      <button type="button" onClick={() => guardar(items.filter((_, j) => j !== i))} disabled={items.length <= 1} aria-label={t('beneficios.quitar', { nombre: nombre(ids[i]) })} className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'w-8 px-0 disabled:opacity-40')}>
                        <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                      </button>
                      <button type="button" onClick={() => setAbierto(abiertoAqui ? null : i)} aria-expanded={abiertoAqui} aria-label={t('beneficios.abrir', { nombre: nombre(ids[i]) })} className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'w-8 px-0')}>
                        <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform', abiertoAqui && 'rotate-180')} strokeWidth={1.5} />
                      </button>
                    </div>
                    {abiertoAqui && (
                      <div className="flex flex-col gap-3 border-t border-line px-3 py-3">
                        <SelectorIcono valor={b.icon} onCambiar={(icon) => cambiar(i, { icon })} />
                        <CampoTextoFicha etiqueta={t('beneficios.titulo')} valor={b.title} max={80} onCambiar={(v) => cambiar(i, { title: v ?? '' })} />
                        <CampoTextoFicha etiqueta={t('beneficios.texto')} valor={b.description} max={200} onCambiar={(v) => cambiar(i, { description: v ?? '' })} />
                        <div className="flex flex-col gap-1.5">
                          <ChipsOpcion
                            etiqueta={t('beneficios.colorItem')}
                            opciones={[{ valor: 'auto', etiqueta: t('beneficios.colorAuto') }, { valor: 'propio', etiqueta: t('beneficios.unoPropio') }]}
                            valor={b.color ? 'propio' : 'auto'}
                            onValorChange={(v) => cambiar(i, { color: v === 'auto' ? null : TONOS_MULTICOLOR[i % 4] })}
                          />
                          {b.color && <ColorField etiqueta={t('beneficios.colorItem')} valor={b.color} onCambiar={(hex) => cambiar(i, { color: hex })} />}
                          <Ayuda>{t('beneficios.ayudaColorItem')}</Ayuda>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Ordenable>
            );
          })}
        </div>
      </ZonaOrdenable>
      <button
        type="button"
        disabled={items.length >= MAX_BENEFICIOS}
        onClick={() => {
          guardar([...items, { icon: 'Star', title: t('beneficios.nuevo'), description: '', color: null }]);
          setAbierto(items.length);
        }}
        className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'self-start')}
      >
        <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('beneficios.anadir')}
      </button>
    </section>
  );
}

function SelectorIcono({ valor, onCambiar }: { valor: string; onCambiar: (v: string) => void }) {
  const t = useT();
  const id = useId();
  const actual = valor === 'Shield' ? 'ShieldCheck' : valor === 'Package' ? 'PackageCheck' : valor;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5"><EtiquetaGrupo id={id}>{t('beneficios.icono')}</EtiquetaGrupo><InsigniaNuevo /></span>
      <div role="radiogroup" aria-labelledby={id} className="grid grid-cols-6 gap-1.5">
        {ICONOS_BENEFICIO.map((nombre) => {
          const Icono = ICONOS_LUCIDE_BENEFICIO[nombre];
          const sel = actual === nombre;
          return (
            <button
              key={nombre}
              type="button"
              role="radio"
              aria-checked={sel}
              aria-label={t(`beneficios.iconos.${nombre}`)}
              title={t(`beneficios.iconos.${nombre}`)}
              onClick={() => onCambiar(nombre)}
              className={cn('flex h-9 items-center justify-center rounded-md border', sel ? 'border-2 border-brand-action bg-brand-tint text-brand-deep' : 'border-line bg-surface text-fg-secondary hover:bg-hover')}
            >
              <Icono aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Reseñas ────────────────────────────────────────────────────────────────────────────────

function PanelResenas({ pestana, contenido, onCambiar }: { pestana: PestanaPanelFicha; contenido: Record<string, unknown>; onCambiar: Cambiar }) {
  const t = useT();
  const o = useMemo(() => leerOpcionesResenas(contenido), [contenido]);
  const k = CLAVES_RESENAS;
  const poner = (clave: string, v: unknown) => onCambiar(conClave(contenido, clave, v));
  const ponerNueva = (clave: string, v: unknown) => onCambiar(conClave({ ...contenido, [k.estilo]: contenido[k.estilo] ?? o.estilo }, clave, v));

  if (pestana === 'diseno') {
    return (
      <>
        <EstilosTarjetas estilos={['clasico', 'carrusel', 'compacta', 'fotos'] as const} valor={o.estilo} onElegir={(v) => poner(k.estilo, v)} etiqueta={(v) => t(`resenas.estilos.${v}`)} />
        <Segmento etiqueta={t('resenas.porPagina')} opciones={['5', '10', '20'].map((v) => ({ valor: v, etiqueta: v }))} valor={String(o.porPagina)} onCambiar={(v) => ponerNueva(k.porPagina, Number(v))} />
        <Segmento
          etiqueta={t('resenas.orden')}
          nuevo
          opciones={(['helpful', 'recent', 'highest', 'lowest'] as const).map((v) => ({ valor: v, etiqueta: t(`resenas.ordenes.${v}`) }))}
          valor={o.orden}
          onCambiar={(v) => ponerNueva(k.orden, v)}
        />
        <ChipsMultiples<FiltroResenas>
          etiqueta={t('resenas.filtros')}
          nuevo
          opciones={(['estrellas', 'fotos', 'verificada'] as const).map((v) => ({ valor: v, etiqueta: t(`resenas.filtrosOpciones.${v}`) }))}
          valores={o.filtros}
          onCambiar={(v) => ponerNueva(k.filtros, v)}
        />
        <FilaInterruptor titulo={t('resenas.fotos')} ayuda={t('resenas.ayudaFotos')} valor={o.fotos} onCambiar={(v) => ponerNueva(k.fotos, v)} />
        <FilaInterruptor titulo={t('resenas.respuesta')} ayuda={t('resenas.ayudaRespuesta')} valor={o.respuesta} onCambiar={(v) => ponerNueva(k.respuesta, v)} />
        <FilaInterruptor titulo={t('resenas.util')} valor={o.util} onCambiar={(v) => ponerNueva(k.util, v)} />
        <FilaInterruptor titulo={t('resenas.ciudad')} valor={o.ciudad} onCambiar={(v) => ponerNueva(k.ciudad, v)} />
        <Restablecer tipo="product_reviews" contenido={contenido} onCambiar={onCambiar} />
      </>
    );
  }
  if (pestana === 'contenido') {
    const fuente = typeof contenido.reviews_source === 'string' ? contenido.reviews_source : 'site';
    return (
      <>
        <Segmento
          etiqueta={t('resenas.fuente')}
          opciones={[
            { valor: 'site', etiqueta: t('resenas.fuentes.sitio') },
            { valor: 'real', etiqueta: t('resenas.fuentes.real') },
            { valor: 'mixed', etiqueta: t('resenas.fuentes.mixed') },
            { valor: 'auto', etiqueta: t('resenas.fuentes.auto') },
            { valor: 'generated', etiqueta: t('resenas.fuentes.generated') },
          ]}
          valor={fuente}
          onCambiar={(v) => poner('reviews_source', v === 'site' ? undefined : v)}
          ayuda={t('resenas.ayudaFuente')}
        />
        <CampoTextoFicha etiqueta={t('resenas.titulo')} valor={typeof contenido[k.titulo] === 'string' ? (contenido[k.titulo] as string) : ''} placeholder={o.titulo} onCambiar={(v) => ponerNueva(k.titulo, v)} />
        <CampoTextoFicha etiqueta={t('resenas.textoBoton')} valor={typeof contenido[k.textoBoton] === 'string' ? (contenido[k.textoBoton] as string) : ''} placeholder={o.textoBoton} max={60} onCambiar={(v) => ponerNueva(k.textoBoton, v)} />
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          <TituloBloque>{t('resenas.vacio')}</TituloBloque>
          <Ayuda>{t('resenas.ayudaVacio')}</Ayuda>
          <CampoTextoFicha etiqueta={t('resenas.vacioTitulo')} valor={typeof contenido.empty_state_title === 'string' ? contenido.empty_state_title : ''} onCambiar={(v) => poner('empty_state_title', v)} />
          <CampoTextoFicha etiqueta={t('resenas.vacioMensaje')} largo max={300} valor={typeof contenido.empty_state_message === 'string' ? contenido.empty_state_message : ''} onCambiar={(v) => poner('empty_state_message', v)} />
          <CampoTextoFicha etiqueta={t('resenas.vacioBoton')} max={60} valor={typeof contenido.empty_state_cta === 'string' ? contenido.empty_state_cta : ''} onCambiar={(v) => poner('empty_state_cta', v)} />
        </div>
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <Segmento
            etiqueta={t('resenas.quien')}
            nuevo
            opciones={[{ valor: 'cualquiera', etiqueta: t('resenas.cualquiera') }, { valor: 'compradores', etiqueta: t('resenas.compradores') }]}
            valor={o.quienOpina}
            onCambiar={(v) => ponerNueva(k.quienOpina, v)}
            ayuda={t('resenas.ayudaQuien')}
          />
        </div>
      </>
    );
  }
  return (
    <>
      <Segmento etiqueta={t('resenas.colorEstrellas')} nuevo opciones={[{ valor: 'amarillo', etiqueta: t('resenas.amarillo') }, { valor: 'tienda', etiqueta: t('colorTienda') }]} valor={o.colorEstrellas} onCambiar={(v) => ponerNueva(k.colorEstrellas, v)} />
      <Segmento etiqueta={t('resenas.colorBarras')} nuevo opciones={[{ valor: 'tienda', etiqueta: t('colorTienda') }, { valor: 'gris', etiqueta: t('resenas.grisOscuro') }]} valor={o.colorBarras} onCambiar={(v) => ponerNueva(k.colorBarras, v)} />
      <Segmento etiqueta={t('resenas.boton')} nuevo opciones={[{ valor: 'relleno', etiqueta: t('relleno') }, { valor: 'borde', etiqueta: t('conBorde') }, { valor: 'enlace', etiqueta: t('enlace') }]} valor={o.boton} onCambiar={(v) => ponerNueva(k.boton, v)} />
      <Segmento etiqueta={t('resenas.tarjeta')} nuevo opciones={[{ valor: 'borde', etiqueta: t('conBorde') }, { valor: 'sin_borde', etiqueta: t('sinBorde') }, { valor: 'suave', etiqueta: t('fondoSuave') }]} valor={o.tarjeta} onCambiar={(v) => ponerNueva(k.tarjeta, v)} />
      <Segmento etiqueta={t('resenas.resumen')} nuevo opciones={[{ valor: 'suave', etiqueta: t('fondoSuave') }, { valor: 'ninguno', etiqueta: t('sinFondo') }]} valor={o.resumen} onCambiar={(v) => ponerNueva(k.resumen, v)} />
      <FilaInterruptor titulo={t('resenas.avatar')} ayuda={t('resenas.ayudaAvatar')} valor={o.avatar} onCambiar={(v) => ponerNueva(k.avatar, v)} />
      <Segmento etiqueta={t('resenas.tamanoTitulo')} opciones={[{ valor: 'sm', etiqueta: t('pequeno') }, { valor: 'md', etiqueta: t('mediano') }, { valor: 'lg', etiqueta: t('grande') }]} valor={o.tamanoTitulo} onCambiar={(v) => ponerNueva(k.tamanoTitulo, v)} />
    </>
  );
}

// ─── Productos relacionados ─────────────────────────────────────────────────────────────────

function PanelRelacionados({ pestana, contenido, onCambiar }: { pestana: PestanaPanelFicha; contenido: Record<string, unknown>; onCambiar: Cambiar }) {
  const t = useT();
  const o = useMemo(() => leerOpcionesRelacionados(contenido), [contenido]);
  const k = CLAVES_RELACIONADOS;
  const poner = (clave: string, v: unknown) => onCambiar(conClave(contenido, clave, v));
  const ponerNueva = (clave: string, v: unknown) => onCambiar(conClave({ ...contenido, [k.estilo]: contenido[k.estilo] ?? o.estilo }, clave, v));

  if (pestana === 'diseno') {
    return (
      <>
        <EstilosTarjetas
          estilos={['carrusel', 'rejilla', 'lista', 'juntos'] as const}
          valor={o.estilo}
          onElegir={(v) => poner(k.estilo, v)}
          etiqueta={(v) => t(`relacionados.estilos.${v}`)}
          insignia={(v) => (v === 'juntos' ? <span className="px-1"><InsigniaNuevo /></span> : null)}
        />
        <Ayuda>{t('relacionados.ayudaTarjeta')}</Ayuda>
        <Segmento etiqueta={t('relacionados.columnas')} opciones={['3', '4', '5', '6'].map((v) => ({ valor: v, etiqueta: v }))} valor={String(o.columnas)} onCambiar={(v) => ponerNueva('columns', Number(v))} />
        <Segmento etiqueta={t('relacionados.celular')} nuevo opciones={[{ valor: 'deslizable', etiqueta: t('relacionados.deslizable') }, { valor: 'dos', etiqueta: t('beneficios.dosColumnas') }]} valor={o.celular} onCambiar={(v) => ponerNueva(k.celular, v)} />
        <Segmento etiqueta={t('relacionados.cantidad')} opciones={['4', '6', '8', '12'].map((v) => ({ valor: v, etiqueta: v }))} valor={String(o.cantidad)} onCambiar={(v) => ponerNueva('max_items', Number(v))} />
        <FilaInterruptor titulo={t('relacionados.flechas')} ayuda={t('relacionados.soloCarrusel')} valor={o.flechas} onCambiar={(v) => ponerNueva('show_arrows', v)} />
        <FilaInterruptor titulo={t('relacionados.puntos')} ayuda={t('relacionados.soloCarrusel')} valor={o.puntos} onCambiar={(v) => ponerNueva('show_dots', v)} />
        <FilaInterruptor titulo={t('relacionados.verTodos')} ayuda={t('relacionados.ayudaVerTodos')} valor={o.verTodos} onCambiar={(v) => ponerNueva(k.verTodos, v)} />
        <Restablecer tipo="related_products" contenido={contenido} onCambiar={onCambiar} />
      </>
    );
  }
  if (pestana === 'contenido') {
    const fuentes = ['category', 'tag', 'manual', 'bought_together'] as const;
    return (
      <>
        <CampoTextoFicha etiqueta={t('relacionados.titulo')} valor={typeof contenido.title === 'string' ? contenido.title : ''} placeholder={TITULO_RELACIONADOS_POR_DEFECTO} onCambiar={(v) => poner('title', v)} />
        <div className="flex flex-col gap-2">
          <TituloBloque>{t('relacionados.queProductos')}</TituloBloque>
          <div role="radiogroup" aria-label={t('relacionados.queProductos')} className="flex flex-col gap-2">
            {fuentes.map((f) => {
              const sel = o.fuente === f;
              return (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={sel}
                  onClick={() => poner('source', f === 'category' ? undefined : f)}
                  className={cn('flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left', sel ? 'border-2 border-brand-action bg-brand-tint' : 'border-line bg-surface hover:bg-hover')}
                >
                  <span aria-hidden="true" className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2', sel ? 'border-brand-action' : 'border-line-strong')}>
                    {sel && <span className="size-2 rounded-full bg-brand-action" />}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-fg">
                      {t(`relacionados.fuentes.${f}`)}
                      {(f === 'manual' || f === 'bought_together') && <InsigniaNuevo />}
                    </span>
                    <span className="text-[11px] leading-[14px] text-fg-muted">{t(`relacionados.ayudasFuente.${f}`)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <FilaInterruptor titulo={t('relacionados.ocultarAgotados')} ayuda={t('relacionados.ayudaAgotados')} valor={o.ocultarAgotados} onCambiar={(v) => ponerNueva(k.ocultarAgotados, v)} />
        <AvisoTonal tono="informacion" compacto icono={Info} titulo={t('relacionados.aManoTitulo')} descripcion={t('relacionados.aManoDescripcion')} accion={{ etiqueta: t('relacionados.irInventario'), href: RUTA_INVENTARIO_PRODUCTOS, externo: true }} />
      </>
    );
  }
  return (
    <>
      <AvisoTonal tono="informacion" compacto icono={Info} titulo={t('relacionados.estiloTarjeta')} />
      <Segmento etiqueta={t('relacionados.alineacionTitulo')} nuevo opciones={[{ valor: 'izquierda', etiqueta: t('izquierda') }, { valor: 'centro', etiqueta: t('centrado') }]} valor={o.alineacionTitulo} onCambiar={(v) => ponerNueva(k.alineacionTitulo, v)} />
      <Segmento etiqueta={t('relacionados.formaFlechas')} nuevo opciones={[{ valor: 'circulo', etiqueta: t('circulo') }, { valor: 'cuadrado', etiqueta: t('cuadrado') }]} valor={o.formaFlechas} onCambiar={(v) => ponerNueva(k.formaFlechas, v)} />
      <Segmento etiqueta={t('relacionados.cajaTotal')} nuevo opciones={[{ valor: 'suave', etiqueta: t('fondoSuave') }, { valor: 'borde', etiqueta: t('conBorde') }]} valor={o.cajaTotal} onCambiar={(v) => ponerNueva(k.cajaTotal, v)} />
    </>
  );
}

// ─── Descripción ────────────────────────────────────────────────────────────────────────────

function PanelDescripcion({ pestana, contenido, onCambiar }: { pestana: PestanaPanelFicha; contenido: Record<string, unknown>; onCambiar: Cambiar }) {
  const t = useT();
  const o = useMemo(() => leerOpcionesDescripcion(contenido), [contenido]);
  const k = CLAVES_DESCRIPCION;
  const poner = (clave: string, v: unknown) => onCambiar(conClave(contenido, clave, v));
  const ponerNueva = (clave: string, v: unknown) => onCambiar(conClave({ ...contenido, [k.estilo]: contenido[k.estilo] ?? o.estilo }, clave, v));
  const nombreParte = (p: ParteDescripcion) => t(`descripcion.partes.${p}`);

  if (pestana === 'diseno') {
    return (
      <>
        <EstilosTarjetas estilos={['ver_mas', 'pestanas', 'acordeon', 'tabla'] as const} valor={o.estilo} onElegir={(v) => poner(k.estilo, v)} etiqueta={(v) => t(`descripcion.estilos.${v}`)} />
        <ChipsMultiples<ParteDescripcion>
          etiqueta={t('descripcion.partesTitulo')}
          nuevo
          opciones={PARTES_DESCRIPCION.map((p) => ({ valor: p, etiqueta: nombreParte(p) }))}
          valores={o.partes}
          onCambiar={(v) => ponerNueva(k.partes, v.length ? v : ['descripcion'])}
          ayuda={t('descripcion.ayudaPartes')}
        />
        {(o.estilo === 'pestanas' || o.estilo === 'acordeon') && (
          <Segmento etiqueta={t('descripcion.abierta')} nuevo opciones={o.partes.map((p) => ({ valor: p, etiqueta: nombreParte(p) }))} valor={o.abierta} onCambiar={(v) => ponerNueva(k.abierta, v)} />
        )}
        <Segmento
          etiqueta={t('descripcion.lineas')}
          opciones={[{ valor: 'letras', etiqueta: t('descripcion.porLetras') }, ...LINEAS_VER_MAS.map((n) => ({ valor: String(n), etiqueta: String(n) }))]}
          valor={o.lineas === null ? 'letras' : String(o.lineas)}
          onCambiar={(v) => ponerNueva(k.lineas, v === 'letras' ? undefined : Number(v))}
          ayuda={t('descripcion.ayudaLineas', { letras: o.letras })}
        />
        <Segmento etiqueta={t('descripcion.celular')} nuevo opciones={[{ valor: 'igual', etiqueta: t('descripcion.igual') }, { valor: 'acordeon', etiqueta: t('descripcion.estilos.acordeon') }]} valor={o.celular} onCambiar={(v) => ponerNueva(k.celular, v)} />
        <FilaInterruptor titulo={t('descripcion.variasAbiertas')} ayuda={t('descripcion.soloAcordeon')} valor={o.variasAbiertas} onCambiar={(v) => ponerNueva(k.variasAbiertas, v)} />
        <Restablecer tipo="product_description" contenido={contenido} onCambiar={onCambiar} />
      </>
    );
  }
  if (pestana === 'contenido') {
    const campoTitulo = (p: ParteDescripcion, clave: string) => (
      <CampoTextoFicha key={p} etiqueta={nombreParte(p)} max={60} valor={typeof contenido[clave] === 'string' ? (contenido[clave] as string) : ''} placeholder={TITULOS_PARTES_POR_DEFECTO[p]} onCambiar={(v) => ponerNueva(clave, v)} />
    );
    return (
      <>
        <AvisoTonal tono="informacion" compacto icono={Info} titulo={t('descripcion.textoTitulo')} descripcion={t('descripcion.textoDescripcion')} accion={{ etiqueta: t('descripcion.editarInventario'), href: RUTA_INVENTARIO_PRODUCTOS, externo: true }} />
        <TituloBloque>{t('descripcion.titulos')}</TituloBloque>
        {campoTitulo('descripcion', k.tituloDescripcion)}
        {campoTitulo('especificaciones', k.tituloEspecificaciones)}
        {campoTitulo('envio', k.tituloEnvio)}
        {campoTitulo('preguntas', k.tituloPreguntas)}
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          <ChipsMultiples
            etiqueta={t('descripcion.filas')}
            opciones={FILAS_FICHA.map((f) => ({ valor: f, etiqueta: t(`descripcion.filasOpciones.${f}`) }))}
            valores={o.filas}
            onCambiar={(v) => ponerNueva(k.filas, v)}
            ayuda={t('descripcion.ayudaFilas')}
          />
          <FilaInterruptor titulo={t('descripcion.ocultarVacias')} valor={o.ocultarVacias} onCambiar={(v) => ponerNueva(k.ocultarVacias, v)} />
          <FilaInterruptor titulo={t('descripcion.filasPropias')} ayuda={t('descripcion.ayudaFilasPropias')} nuevo valor={o.filasPropias} onCambiar={(v) => ponerNueva(k.filasPropias, v)} />
        </div>
      </>
    );
  }
  return (
    <>
      <Segmento etiqueta={t('descripcion.pestanaActiva')} nuevo opciones={[{ valor: 'tienda', etiqueta: t('colorTienda') }, { valor: 'texto', etiqueta: t('descripcion.textoSitio') }]} valor={o.colorPestana} onCambiar={(v) => ponerNueva(k.colorPestana, v)} />
      <Segmento etiqueta={t('descripcion.vinetas')} nuevo opciones={[{ valor: 'punto', etiqueta: t('descripcion.punto') }, { valor: 'check', etiqueta: t('descripcion.check') }, { valor: 'numero', etiqueta: t('descripcion.numero') }]} valor={o.vinetas} onCambiar={(v) => ponerNueva(k.vinetas, v)} />
      <Segmento etiqueta={t('descripcion.tabla')} nuevo opciones={[{ valor: 'rayada', etiqueta: t('descripcion.rayada') }, { valor: 'lineas', etiqueta: t('descripcion.conLineas') }, { valor: 'sin', etiqueta: t('descripcion.sinLineas') }]} valor={o.tabla} onCambiar={(v) => ponerNueva(k.tabla, v)} />
      <Segmento etiqueta={t('descripcion.ancho')} nuevo opciones={[{ valor: 'comodo', etiqueta: t('descripcion.comodo') }, { valor: 'completo', etiqueta: t('descripcion.todoAncho') }]} valor={o.ancho} onCambiar={(v) => ponerNueva(k.ancho, v)} />
      <Segmento etiqueta={t('descripcion.tamanoTexto')} opciones={[{ valor: 'sm', etiqueta: t('pequeno') }, { valor: 'md', etiqueta: t('descripcion.normal') }, { valor: 'lg', etiqueta: t('grande') }]} valor={o.tamanoTexto} onCambiar={(v) => ponerNueva(k.tamanoTexto, v)} />
    </>
  );
}

// ─── Entrada ────────────────────────────────────────────────────────────────────────────────

export interface PanelSeccionFichaProps {
  tipo: TipoSeccionFicha;
  pestana: PestanaPanelFicha;
  contenido: Record<string, unknown>;
  onCambiar: Cambiar;
}

/** Panel de la pestaña dada para una de las cuatro secciones de la ficha. */
export function PanelSeccionFicha({ tipo, pestana, contenido, onCambiar }: PanelSeccionFichaProps) {
  const cuerpo =
    tipo === 'product_benefits' ? <PanelBeneficios pestana={pestana} contenido={contenido} onCambiar={onCambiar} />
      : tipo === 'product_reviews' ? <PanelResenas pestana={pestana} contenido={contenido} onCambiar={onCambiar} />
        : tipo === 'related_products' ? <PanelRelacionados pestana={pestana} contenido={contenido} onCambiar={onCambiar} />
          : <PanelDescripcion pestana={pestana} contenido={contenido} onCambiar={onCambiar} />;
  return (
    <div className="flex flex-col gap-4" data-panel-seccion-ficha={`${tipo}:${pestana}`}>
      {cuerpo}
    </div>
  );
}
