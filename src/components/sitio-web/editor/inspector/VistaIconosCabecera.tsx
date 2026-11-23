'use client';

/**
 * Vista «Encabezado › Íconos»: el ÚNICO lugar de los íconos de la cabecera (Figma «16 Sitio web»
 * 2830:73206, aprobado el 2026-11-22; A1 2830:75153, A2 2830:75542, A2b 2830:76085, A3 2830:76009).
 *
 * Antes los íconos se configuraban en tres sitios que se pisaban (Contenido › Acciones, Estilo ›
 * Íconos y esta vista). Ahora aquí: estilo general, forma en el celular, un solo tamaño, un solo
 * trazo, mostrar texto, el fondo de los íconos (plegado) y una tarjeta por ícono (Buscar,
 * Favoritos, Carrito, Cuenta y Moneda) con mostrar/ocultar, dibujo, forma propia, texto y lo suyo.
 * La tarjeta Cuenta trae «Al tocar el ícono de cuenta» (Figma 2839:69662, 2839:70276, 2839:70417).
 *
 * Mismas columnas y claves de siempre (show_header_cart, show_header_auth, header_show_currency,
 * header_cart_glyph, header_icons, *_icon, header_icons_weight, header_icons_box, header_iconos):
 * solo cambia dónde se editan. Campos nuevos, dentro del documento V2: `header_iconos.movil`,
 * `header_iconos.por_icono` y `header_cuenta`. No guarda: cada cambio va a `cambiar`.
 */
import { useId, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight, Globe, Heart, Monitor, Search, ShoppingCart, Smartphone, Undo2, User } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { ChipsOpcion, SegmentedControl, clasesBoton } from '@/components/kit';
import { clasesBadgeTono } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CONTADORES_CARRITO,
  DESPUES_INGRESAR,
  DESTINOS_VENTANA_CUENTA,
  FORMAS_ICONO,
  ICONOS_EN_CELULAR,
  LARGO_BOTON_CUENTA,
  LARGO_TEXTO_ICONO,
  LARGO_TITULO_CUENTA,
  MODOS_CUENTA,
  TAMANOS_ICONOS,
  TEXTOS_CUENTA_POR_DEFECTO,
  TEXTOS_ICONOS_POR_DEFECTO,
  TRAZOS_UNIFICADOS,
  estiloConTexto,
  estiloDeIcono,
  estiloSoloComputador,
  opcionesCuenta,
  opcionesIconos,
  opcionesMoneda,
  trazoUnificado,
  type EstiloIconos,
  type FormaIcono,
  type IconoCabecera,
  type ModoCuenta,
  type OpcionesIconos,
} from '@/lib/website/v2/cabeceraTienda';
import type { AccionEncabezado } from '@/lib/website/v2/iconosEncabezado';
import { textoSobreAcento } from '@/lib/website/v2/tokensEstilo';
import { useTextosEditor } from '../textos';
import { ColorTema, EtiquetaGrupo, FilaInterruptor, InsigniaNuevo, TarjetaComposicion } from './PartesZonaGlobal';
import { ICONOS_LUCIDE_ENCABEZADO, OPCIONES_ICONO_ACCION, cambioIconoAccion, iconoAccionEncabezado } from './iconosAccionesLogica';
import { FORMAS_CAJA, SOMBRAS_CAJA, cajaIconos, cambioCaja, cambioForma, formaCaja, tamanoIcono } from './encabezadoCapacidades';
import { circuloAcentoActivo } from './anterioresLogica';
import { buscadorCelular, buscadorComputador, formaBuscadorCelular } from './buscadorCelularLogica';
import {
  cambioCuenta,
  cambioEstiloIconos,
  cambioFormaIcono,
  cambioIconos,
  cambioIconosEnCelular,
  cambioTextoIcono,
  cambioTrazoUnificado,
} from './cabeceraTiendaLogica';

type Ajustes = Record<string, unknown>;
type Cambiar = (c: Ajustes) => void;
type VistaDestino = 'moneda' | 'favoritos';

export interface VistaIconosProps {
  ajustes: Ajustes;
  cambiar: Cambiar;
  /** Abre otra vista de la cabecera (Selector de moneda, Favoritos). */
  onAbrir: (v: VistaDestino) => void;
  /** Lleva a Diseño › Buscador (el buscador se prende y se apaga en un solo lugar). */
  onIrBuscador?: () => void;
  /** Colores del tema para «Fondo de los íconos». Sin ellos, la marca por defecto del editor. */
  coloresTema?: { fondo: string; texto: string; acento: string };
}

const COLORES_RESPALDO = { fondo: '#FFFFFF', texto: '#111827', acento: '#3B4BDB' };

function useT() {
  return useTranslations('sitioWeb.editor.cabeceraTienda');
}

const Ayuda = ({ children, id }: { children: ReactNode; id?: string }) => (
  <p id={id} className="text-[11px] leading-[14px] text-fg-muted">
    {children}
  </p>
);

/** Nota del celular dentro de una tarjeta (Figma: fondo gris con el ícono del teléfono). */
const NotaCelular = ({ children }: { children: ReactNode }) => (
  <p className="flex items-start gap-1.5 rounded-md bg-subtle px-2 py-1.5 text-[11px] leading-[14px] text-fg-secondary">
    <Smartphone aria-hidden="true" className="mt-px size-3.5 shrink-0" strokeWidth={1.5} />
    <span>{children}</span>
  </p>
);

/** Insignia «Solo computador» de Píldora y Relleno (Figma A1). */
function InsigniaSoloComputador() {
  const t = useT();
  return (
    <span className={clasesBadgeTono('advertencia', 'suave', 'sm')}>
      <Monitor aria-hidden="true" className="size-3" strokeWidth={1.5} />
      {t('iconos.soloComputador')}
    </span>
  );
}

/** Segmentado con etiqueta a la izquierda; `valor` vacío no marca ninguna opción. */
function Segmento<V extends string>({ etiqueta, opciones, valor, onCambiar }: { etiqueta: string; opciones: readonly { valor: V; etiqueta: string }[]; valor: V | null; onCambiar: (v: V) => void }) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
      <span id={id} className="text-[13px] font-medium leading-[18px] text-fg">
        {etiqueta}
      </span>
      <SegmentedControl aria-labelledby={id} tamano="sm" opciones={opciones} valor={(valor ?? '') as V} onValorChange={onCambiar} />
    </div>
  );
}

/** Campo de texto; el vacío guarda `null` (= el texto por defecto). Borrador local, como las demás vistas. */
function CampoTexto({ etiqueta, valor, placeholder, ayuda, max, onCambiar }: { etiqueta: string; valor: string; placeholder?: string; ayuda?: string; max: number; onCambiar: (v: string | null) => void }) {
  const id = useId();
  const [borrador, setBorrador] = useState(valor);
  const [ultimo, setUltimo] = useState(valor);
  // Otro origen (deshacer, restablecer): manda lo guardado si difiere de lo que se escribe.
  if (valor !== ultimo) {
    setUltimo(valor);
    if (borrador.trim() !== valor.trim()) setBorrador(valor);
  }
  return (
    <div className="flex flex-col gap-1.5">
      <EtiquetaGrupo id={id}>{etiqueta}</EtiquetaGrupo>
      <Input
        aria-labelledby={id}
        value={borrador}
        placeholder={placeholder}
        maxLength={max}
        onChange={(e) => {
          setBorrador(e.target.value);
          onCambiar(e.target.value.trim() === '' ? null : e.target.value);
        }}
      />
      {ayuda && <Ayuda>{ayuda}</Ayuda>}
    </div>
  );
}

const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const textoGuardado = (a: Ajustes, k: string) => {
  const v = objeto(objeto(a.header_iconos)?.textos)?.[k];
  return typeof v === 'string' ? v : '';
};

// ─── Miniaturas ───────────────────────────────────────────────────────────────────────────────

function MiniaturaIcono({ estilo }: { estilo: EstiloIconos }) {
  const t = useT();
  const icono = <ShoppingCart aria-hidden="true" className="size-3.5" strokeWidth={2} />;
  const insignia = <span className="absolute -right-1.5 -top-1.5 flex size-3.5 items-center justify-center rounded-full bg-brand-action text-[8px] font-bold text-white">3</span>;
  const texto = t('iconos.miniTexto');
  let cuerpo: ReactNode;
  if (estilo === 'texto') {
    cuerpo = (
      <span className="relative flex flex-col items-center gap-0.5 text-white">
        <span className="relative">
          {icono}
          {insignia}
        </span>
        <span className="text-[8px] leading-none">{texto}</span>
      </span>
    );
  } else if (estilo === 'pildora' || estilo === 'relleno' || estilo === 'texto_lado') {
    cuerpo = (
      <span
        className={cn(
          'relative flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-white',
          estilo === 'pildora' && 'rounded-full border border-white/60',
          estilo === 'relleno' && 'rounded-md bg-brand-action',
        )}
      >
        {icono}
        {texto}
        {insignia}
      </span>
    );
  } else if (estilo === 'circulo') {
    cuerpo = (
      <span className="relative flex size-7 items-center justify-center rounded-full bg-brand-action text-white">
        {icono}
        {insignia}
      </span>
    );
  } else {
    cuerpo = (
      <span className="relative text-white">
        {icono}
        {insignia}
      </span>
    );
  }
  return <span className="absolute inset-0 flex items-center justify-center bg-[#0B1B46]">{cuerpo}</span>;
}

/** Miniatura de la caja de los íconos (Figma A3): la lupa dentro de la forma. */
function MiniaturaCaja({ forma }: { forma: string }) {
  const radio: Record<string, string> = { circle: '9999px', square: '0', rounded: '6px', semi: '10px', squircle: '12px' };
  const conCaja = forma !== 'none';
  return (
    <span className="absolute inset-0 flex items-center justify-center">
      <span
        className={cn('flex size-8 items-center justify-center', conCaja ? 'bg-brand-action text-white' : 'border border-dashed border-line-strong text-fg')}
        style={{ borderRadius: radio[forma] ?? '4px' }}
      >
        <Search aria-hidden="true" className="size-3.5" strokeWidth={2} />
      </span>
    </span>
  );
}

/** Miniaturas de «Al tocar el ícono de cuenta» (Figma E-A1 2839:69662). */
function MiniaturaModoCuenta({ modo }: { modo: ModoCuenta }) {
  const barra = <span className="absolute inset-x-0 top-0 h-2.5 bg-[#0B1B46]" />;
  const lineas = (
    <>
      <span className="block h-[3px] w-full rounded-sm bg-line-strong" />
      <span className="block h-[3px] w-3/4 rounded-sm bg-line-strong" />
      <span className="mt-0.5 block h-1.5 w-full rounded-sm bg-brand-action" />
    </>
  );
  const rejilla = (
    <span className="absolute inset-x-1.5 bottom-1.5 top-4 grid grid-cols-3 gap-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <span key={i} className="rounded-sm bg-white/70" />
      ))}
    </span>
  );
  if (modo === 'pagina') {
    return (
      <span className="absolute inset-0 bg-subtle">
        {barra}
        <span className="absolute left-1/2 top-4 flex w-12 -translate-x-1/2 flex-col gap-1 rounded-sm bg-white p-1.5 shadow-sm">{lineas}</span>
      </span>
    );
  }
  if (modo === 'panel') {
    return (
      <span className="absolute inset-0 bg-fg-muted/40">
        {barra}
        {rejilla}
        <span className="absolute bottom-0 right-0 top-0 flex w-[38%] flex-col gap-1 bg-white p-1.5 pt-2">{lineas}</span>
      </span>
    );
  }
  if (modo === 'ventana') {
    return (
      <span className="absolute inset-0 bg-subtle">
        {barra}
        {rejilla}
        <span className="absolute right-1.5 top-3 flex w-[40%] flex-col gap-1 rounded-sm bg-white p-1.5 shadow-md">{lineas}</span>
      </span>
    );
  }
  return (
    <span className="absolute inset-0 bg-fg-muted/40">
      {barra}
      {rejilla}
      <span className="absolute left-1/2 top-1/2 flex w-14 -translate-x-1/2 -translate-y-1/3 flex-col gap-1 rounded-sm bg-white p-1.5 shadow-md">{lineas}</span>
    </span>
  );
}

// ─── Tarjeta de un ícono ──────────────────────────────────────────────────────────────────────

const ICONO_TITULO: Readonly<Record<IconoCabecera, typeof User>> = { buscar: Search, favoritos: Heart, carrito: ShoppingCart, cuenta: User, moneda: Globe };

/** «Dibujo»: las opciones reales de cada acción (OPCIONES_ICONO_ACCION) y la columna de siempre. */
function DibujoIcono({ accion, ajustes: a, cambiar }: { accion: AccionEncabezado; ajustes: Ajustes; cambiar: Cambiar }) {
  const t = useT();
  const te = useTextosEditor();
  const actual = iconoAccionEncabezado(a, accion);
  const nombres: string[] = [...OPCIONES_ICONO_ACCION[accion]];
  if (!nombres.includes(actual)) nombres.push(actual);
  return (
    <div className="flex flex-col gap-1.5">
      <EtiquetaGrupo>{t('iconos.dibujo')}</EtiquetaGrupo>
      <ChipsOpcion
        etiqueta={te(`zonaGlobal.acciones.iconoAccion.${accion}`)}
        opciones={nombres.map((n) => {
          // Un nombre guardado puede no estar en el mapa: sin ícono se muestra el nombre tal cual.
          const conIcono = Object.prototype.hasOwnProperty.call(ICONOS_LUCIDE_ENCABEZADO, n);
          const Icono = conIcono ? ICONOS_LUCIDE_ENCABEZADO[n] : null;
          return {
            valor: n,
            etiqueta: conIcono ? te(`zonaGlobal.acciones.iconoNombre.${n}`) : n,
            adorno: Icono ? <Icono aria-hidden="true" className="size-4" strokeWidth={1.5} /> : undefined,
          };
        })}
        valor={actual}
        onValorChange={(v) => cambiar(cambioIconoAccion(a, accion, v))}
      />
    </div>
  );
}

const DEMAS = 'demas';

/** «Forma»: «Como los demás» o una forma propia (Figma A2b). */
function FormaIconoCampo({ icono, op, ajustes: a, cambiar, formas }: { icono: IconoCabecera; op: OpcionesIconos; ajustes: Ajustes; cambiar: Cambiar; formas: readonly FormaIcono[] }) {
  const t = useT();
  const id = useId();
  const propia = op.porIcono[icono] ?? null;
  const general = op.estilo === 'texto_lado' ? 'texto' : op.estilo;
  return (
    <div className="flex flex-col gap-1.5" data-forma-icono={icono}>
      <div className="flex items-center justify-between gap-3">
        <span id={id} className="text-[13px] font-medium leading-[18px] text-fg">
          {t('iconos.forma')}
        </span>
        <Select value={propia ?? DEMAS} onValueChange={(v) => cambiar(cambioFormaIcono(a, icono, v === DEMAS ? null : (v as FormaIcono)))}>
          <SelectTrigger aria-labelledby={id} className="h-9 w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEMAS}>{t('iconos.formaOpcion.demas')}</SelectItem>
            {formas.map((f) => (
              <SelectItem key={f} value={f}>
                <span className="flex items-center gap-2">
                  {t(`iconos.formaOpcion.${f}`)}
                  {estiloSoloComputador(f) && <InsigniaSoloComputador />}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {propia ? (
        <div className="flex items-center justify-between gap-2">
          <Ayuda>{t('iconos.formaPropiaAyuda')}</Ayuda>
          <button type="button" onClick={() => cambiar(cambioFormaIcono(a, icono, null))} className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'shrink-0')}>
            <Undo2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('iconos.volverDemas')}
          </button>
        </div>
      ) : (
        <Ayuda>{t('iconos.formaDemasAyuda', { estilo: t(`iconos.estiloOpcion.${general}`) })}</Ayuda>
      )}
    </div>
  );
}

/** Marco de la tarjeta: ícono, título, insignia de forma propia y el interruptor (o lo que lo reemplace). */
function TarjetaIcono({
  icono,
  titulo,
  forma,
  derecha,
  children,
}: {
  icono: IconoCabecera;
  titulo: string;
  forma: FormaIcono | null;
  derecha: ReactNode;
  children?: ReactNode;
}) {
  const t = useT();
  const Icono = ICONO_TITULO[icono];
  return (
    <div className={cn('flex flex-col gap-3 rounded-lg bg-surface p-3', forma ? 'border-2 border-brand-action' : 'border border-line')} data-tarjeta-icono={icono}>
      <div className="flex items-center gap-2">
        <Icono aria-hidden="true" className="size-4 shrink-0 text-fg" strokeWidth={1.5} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-[18px] text-fg">{titulo}</span>
        {forma && <span className="rounded-full bg-brand-tint px-1.5 py-0.5 text-[10px] font-medium text-brand-deep">{t(`iconos.formaOpcion.${forma}`)}</span>}
        {derecha}
      </div>
      {children}
    </div>
  );
}

function InterruptorIcono({ titulo, visible, onVisible }: { titulo: string; visible: boolean; onVisible: (v: boolean) => void }) {
  return <Switch aria-label={titulo} checked={visible} onCheckedChange={onVisible} className="shrink-0" />;
}

/** Fila-enlace dentro de una tarjeta («Diseño › Buscador ›», «Ver panel de favoritos ›»…). */
function FilaEnlace({ texto, enlace, onClick }: { texto: string; enlace: string; onClick?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[12px] leading-4 text-fg-secondary">{texto}</span>
      <button type="button" onClick={onClick} disabled={!onClick} className="inline-flex shrink-0 items-center gap-0.5 text-[12px] font-medium text-brand-deep hover:underline disabled:opacity-50">
        {enlace}
        <ChevronRight aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
      </button>
    </div>
  );
}

// ─── Fondo de los íconos (lo que antes era la caja de Estilo › Íconos) ─────────────────────────

/**
 * «Fondo de los íconos» (Figma A3 2830:76009): forma, color, degradado, sombra y hover de la caja,
 * y los colores del círculo de acento. SIN tamaño propio: el tamaño es uno solo (S / M / L); el
 * de la caja guardado (20 / 22 / 28 px) se sigue respetando mientras no se elija S, M o L.
 */
function FondoIconos({ ajustes: a, cambiar, coloresTema }: { ajustes: Ajustes; cambiar: Cambiar; coloresTema: { fondo: string; texto: string; acento: string } }) {
  const t = useT();
  const te = useTextosEditor();
  const [abierto, setAbierto] = useState(false);
  const idSombra = useId();
  const idCuerpo = useId();
  const caja = cajaIconos(a);
  const forma = formaCaja(a);
  const formas: string[] = [...FORMAS_CAJA];
  if (!formas.includes(forma)) formas.push(forma);
  const hex = (v: unknown) => (typeof v === 'string' && /^#/.test(v) ? v : null);
  const conCaja = !!caja && forma !== 'none';
  const degradado = !!caja && !!caja.gradient_1 && !!caja.gradient_2;
  const sombra = typeof caja?.shadow === 'string' ? caja.shadow : 'none';
  const color = (k: string) => (typeof a[k] === 'string' && a[k] ? (a[k] as string) : null);
  const resumen = [
    te(`zonaGlobal.acciones.formaNombre.${forma}`),
    forma === 'none' ? null : hex(caja?.background) || (forma === 'circle' && !caja && hex(a.header_icons_circle_bg)) ? t('iconos.fondo.colorPropio') : t('iconos.fondo.colorMarca'),
    forma === 'none' ? null : te(`zonaGlobal.acciones.sombraNombre.${sombra}`),
    t('iconos.fondo.mas'),
  ]
    .filter(Boolean)
    .join(' · ');
  const tamCaja = tamanoIcono(a);
  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls={idCuerpo}
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[13px] font-medium leading-[18px] text-fg">{t('iconos.fondo.titulo')}</span>
          <span className="text-[11px] leading-[14px] text-fg-muted">{resumen}</span>
        </span>
        {abierto ? (
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
        ) : (
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
        )}
      </button>
      {!abierto && <Ayuda>{t('iconos.fondo.ayuda')}</Ayuda>}
      {abierto && (
        <div id={idCuerpo} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3" data-fondo-iconos="">
          <div className="flex flex-col gap-1">
            <EtiquetaGrupo>{t('iconos.fondo.caja')}</EtiquetaGrupo>
            <Ayuda>{t('iconos.fondo.cajaAyuda')}</Ayuda>
          </div>
          <div role="radiogroup" aria-label={t('iconos.fondo.caja')} className="grid grid-cols-3 gap-2">
            {formas.map((f) => (
              <TarjetaComposicion key={f} etiqueta={te(`zonaGlobal.acciones.formaNombre.${f}`)} seleccionada={forma === f} onElegir={() => cambiar(cambioForma(a, f))}>
                <MiniaturaCaja forma={f} />
              </TarjetaComposicion>
            ))}
          </div>
          <Ayuda>{tamCaja !== null ? t('iconos.fondo.tamanoGuardado', { n: tamCaja }) : t('iconos.fondo.sinTamano')}</Ayuda>
          {conCaja && (
            <>
              <ColorTema
                etiqueta={te('zonaGlobal.acciones.cajaFondo')}
                etiquetaNulo={te('zonaGlobal.acciones.cajaFondoAcento')}
                valor={hex(caja.background)}
                colorTema={coloresTema.acento}
                onCambiar={(v) => cambiar(cambioCaja(a, { background: v ?? 'accent' }))}
              />
              <FilaInterruptor
                titulo={te('zonaGlobal.acciones.degradado')}
                valor={degradado}
                onCambiar={(v) => cambiar(cambioCaja(a, v ? { gradient_1: hex(caja.background) ?? coloresTema.acento, gradient_2: coloresTema.texto } : { gradient_1: null, gradient_2: null }))}
              />
              {degradado && (
                <>
                  <ColorTema etiqueta={te('zonaGlobal.acciones.degradado1')} valor={hex(caja.gradient_1)} colorTema={coloresTema.acento} onCambiar={(v) => cambiar(cambioCaja(a, { gradient_1: v ?? coloresTema.acento }))} />
                  <ColorTema etiqueta={te('zonaGlobal.acciones.degradado2')} valor={hex(caja.gradient_2)} colorTema={coloresTema.texto} onCambiar={(v) => cambiar(cambioCaja(a, { gradient_2: v ?? coloresTema.texto }))} />
                </>
              )}
              <div className="flex flex-col gap-2">
                <EtiquetaGrupo id={idSombra}>{te('zonaGlobal.acciones.sombra')}</EtiquetaGrupo>
                <ChipsOpcion
                  aria-labelledby={idSombra}
                  opciones={SOMBRAS_CAJA.map((v) => ({ valor: v, etiqueta: te(`zonaGlobal.acciones.sombraNombre.${v}`) }))}
                  valor={sombra}
                  onValorChange={(v) => cambiar(cambioCaja(a, { shadow: v === 'none' ? null : v }))}
                />
              </div>
              <ColorTema
                etiqueta={te('zonaGlobal.acciones.hoverFondo')}
                etiquetaNulo={te('zonaGlobal.acciones.hoverFondoIgual')}
                valor={hex(caja.hover_background)}
                colorTema={coloresTema.acento}
                onCambiar={(v) => cambiar(cambioCaja(a, { hover_background: v }))}
              />
            </>
          )}
          {!!caja && (
            <FilaInterruptor
              titulo={te('zonaGlobal.acciones.hoverAgrandar')}
              valor={typeof caja.hover_scale === 'number' && caja.hover_scale > 100}
              onCambiar={(v) => cambiar(cambioCaja(a, { hover_scale: v ? 110 : null }))}
            />
          )}
          {circuloAcentoActivo(a) && !caja && (
            // Círculo de acento sin caja (paquete 5-nov B1/B4): fondo (vacío = marca) y color del ícono.
            <>
              <ColorTema
                etiqueta={te('zonaGlobal.acciones.circuloFondo')}
                etiquetaNulo={te('zonaGlobal.acciones.circuloFondoAcento')}
                valor={color('header_icons_circle_bg')}
                colorTema={coloresTema.acento}
                onCambiar={(v) => cambiar({ header_icons_circle_bg: v })}
              />
              <ColorTema
                etiqueta={te('zonaGlobal.acciones.circuloIcono')}
                etiquetaNulo={te('zonaGlobal.acciones.circuloIconoAuto')}
                valor={color('header_icons_circle_fg')}
                colorTema={textoSobreAcento(color('header_icons_circle_bg') ?? coloresTema.acento)}
                fondo={color('header_icons_circle_bg') ?? coloresTema.acento}
                onCambiar={(v) => cambiar({ header_icons_circle_fg: v })}
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Cuenta: al tocar el ícono ────────────────────────────────────────────────────────────────

/** «Al tocar el ícono de cuenta» (Figma E-A1/A2/A3): 4 modos con miniatura y sus opciones. */
function AlTocarCuenta({ ajustes: a, cambiar }: { ajustes: Ajustes; cambiar: Cambiar }) {
  const t = useT();
  const op = opcionesCuenta(a);
  const crudo = objeto(a.header_cuenta) ?? {};
  const texto = (k: string) => (typeof crudo[k] === 'string' ? (crudo[k] as string) : '');
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-3" data-al-tocar-cuenta={op.modo}>
      <h4 className="flex items-center gap-1.5 text-[13px] font-semibold leading-[18px] text-fg">
        {t('cuenta.alTocar')}
        <InsigniaNuevo />
      </h4>
      <div role="radiogroup" aria-label={t('cuenta.alTocar')} className="grid grid-cols-2 gap-2">
        {MODOS_CUENTA.map((m) => (
          <TarjetaComposicion key={m} etiqueta={t(`cuenta.modo.${m}`)} seleccionada={op.modo === m} onElegir={() => cambiar(cambioCuenta(a, { modo: m }))}>
            <MiniaturaModoCuenta modo={m} />
          </TarjetaComposicion>
        ))}
      </div>
      <Ayuda>{op.modo === 'pagina' ? t('cuenta.ayudaPagina') : t('cuenta.ayudaOtros')}</Ayuda>
      {op.modo === 'pagina' ? (
        <p className="rounded-md bg-subtle px-2.5 py-2 text-[11px] leading-[14px] text-fg-secondary">{t('cuenta.notaPagina')}</p>
      ) : (
        <>
          <CampoTexto
            etiqueta={t('cuenta.titulo')}
            valor={texto('titulo')}
            placeholder={TEXTOS_CUENTA_POR_DEFECTO.titulo}
            ayuda={t('cuenta.vacio', { texto: TEXTOS_CUENTA_POR_DEFECTO.titulo })}
            max={LARGO_TITULO_CUENTA}
            onCambiar={(v) => cambiar(cambioCuenta(a, { titulo: v }))}
          />
          <CampoTexto
            etiqueta={t('cuenta.boton')}
            valor={texto('boton')}
            placeholder={TEXTOS_CUENTA_POR_DEFECTO.boton}
            ayuda={t('cuenta.vacio', { texto: TEXTOS_CUENTA_POR_DEFECTO.boton })}
            max={LARGO_BOTON_CUENTA}
            onCambiar={(v) => cambiar(cambioCuenta(a, { boton: v }))}
          />
          {op.modo === 'ventana' ? (
            <div className="flex flex-col gap-1.5">
              <SegmentedControl
                etiqueta={t('cuenta.destino')}
                tamano="sm"
                opciones={DESTINOS_VENTANA_CUENTA.map((v) => ({ valor: v, etiqueta: t(`cuenta.destinoOpcion.${v}`) }))}
                valor={op.ventanaDestino}
                onValorChange={(v) => cambiar(cambioCuenta(a, { ventanaDestino: v }))}
              />
              <Ayuda>
                <span className="font-medium text-fg-secondary">{t('cuenta.destino')}</span> · {t('cuenta.destinoAyuda')}
              </Ayuda>
            </div>
          ) : (
            <FilaInterruptor titulo={t('cuenta.beneficios')} ayuda={t('cuenta.beneficiosAyuda')} valor={op.beneficios} onCambiar={(v) => cambiar(cambioCuenta(a, { beneficios: v }))} />
          )}
          <div className="flex flex-col gap-1.5">
            <EtiquetaGrupo>{t('cuenta.despues')}</EtiquetaGrupo>
            <SegmentedControl
              etiqueta={t('cuenta.despues')}
              tamano="sm"
              opciones={DESPUES_INGRESAR.map((v) => ({ valor: v, etiqueta: t(`cuenta.despuesOpcion.${v}`) }))}
              valor={op.despues}
              onValorChange={(v) => cambiar(cambioCuenta(a, { despues: v }))}
            />
            <Ayuda>{t('cuenta.despuesAyuda')}</Ayuda>
          </div>
        </>
      )}
    </section>
  );
}

// ─── La vista ─────────────────────────────────────────────────────────────────────────────────

const ESTILOS_EDITOR: readonly EstiloIconos[] = ['icono', 'texto', 'pildora', 'relleno', 'circulo'];
/** Buscar no lleva texto: su forma propia es solo ícono o círculo. */
const FORMAS_BUSCAR: readonly FormaIcono[] = ['icono', 'circulo'];

export function VistaIconos({ ajustes: a, cambiar, onAbrir, onIrBuscador, coloresTema }: VistaIconosProps) {
  const t = useT();
  const op = opcionesIconos(a);
  const estiloVista: EstiloIconos = op.estilo === 'texto_lado' ? 'texto' : op.estilo;
  const conTexto = estiloConTexto(op.estilo) || Object.values(op.porIcono).some((f) => f !== undefined && estiloConTexto(f));
  const trazo = trazoUnificado(a) ?? 'normal';
  const tamCaja = tamanoIcono(a);
  const lleva = (icono: IconoCabecera) => estiloConTexto(estiloDeIcono(op, icono));
  const campoTexto = (icono: 'cuenta' | 'carrito' | 'favoritos') =>
    lleva(icono) ? (
      <CampoTexto
        etiqueta={t('iconos.texto')}
        valor={textoGuardado(a, icono)}
        placeholder={TEXTOS_ICONOS_POR_DEFECTO[icono]}
        ayuda={t('iconos.porDefecto', { texto: TEXTOS_ICONOS_POR_DEFECTO[icono] })}
        max={LARGO_TEXTO_ICONO}
        onCambiar={(v) => cambiar(cambioTextoIcono(a, icono, v ?? ''))}
      />
    ) : null;
  const notaSoloComputador = (icono: IconoCabecera) => {
    const f = op.porIcono[icono];
    return f && estiloSoloComputador(f) ? <NotaCelular>{t('iconos.notaFormaCelular', { forma: t(`iconos.formaOpcion.${f}`) })}</NotaCelular> : null;
  };
  const visibleCarrito = a.show_header_cart !== false;
  const visibleCuenta = a.show_header_auth !== false;
  const visibleMoneda = a.header_show_currency !== false;
  // Solo se ofrece lo que la tienda de verdad pinta (queja del dueño 2026-11-23: dibujos que no cambian nada).
  const lupaVisible =
    formaBuscadorCelular(buscadorComputador(a)) === 'icon' || formaBuscadorCelular(buscadorCelular(a)) === 'icon';
  const estiloMoneda = opcionesMoneda(a).estilo;
  const dibujoMonedaVisible = estiloMoneda === null || estiloMoneda === 'icono';

  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold leading-[18px] text-fg">
            {t('iconos.estiloGeneral')}
            <InsigniaNuevo />
          </h3>
          <Ayuda>{t('iconos.estiloGeneralAyuda')}</Ayuda>
        </div>
        <div role="radiogroup" aria-label={t('iconos.estiloGeneral')} className="grid grid-cols-3 gap-2">
          {ESTILOS_EDITOR.map((e) => (
            <div key={e} className="flex flex-col items-center gap-1">
              <TarjetaComposicion etiqueta={t(`iconos.estiloOpcion.${e}`)} seleccionada={estiloVista === e} onElegir={() => cambiar(cambioEstiloIconos(a, e))}>
                <MiniaturaIcono estilo={e} />
              </TarjetaComposicion>
              {estiloSoloComputador(e) && <InsigniaSoloComputador />}
            </div>
          ))}
        </div>
        {estiloVista === 'texto' && (
          <Segmento
            etiqueta={t('iconos.posicionTexto')}
            opciones={[
              { valor: 'texto', etiqueta: t('iconos.debajo') },
              { valor: 'texto_lado', etiqueta: t('iconos.alLado') },
            ]}
            valor={op.estilo === 'texto_lado' ? 'texto_lado' : 'texto'}
            onCambiar={(v) => cambiar(cambioEstiloIconos(a, v))}
          />
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-lg bg-subtle p-3" data-iconos-celular={op.movil}>
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold leading-[18px] text-fg">
          <Smartphone aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('iconos.celular')}
          <InsigniaNuevo />
        </h3>
        <ChipsOpcion
          etiqueta={t('iconos.celular')}
          opciones={ICONOS_EN_CELULAR.map((v) => ({ valor: v, etiqueta: t(`iconos.celularOpcion.${v}`) }))}
          valor={op.movil}
          onValorChange={(v) => cambiar(cambioIconosEnCelular(a, v))}
        />
        <Ayuda>{t('iconos.celularAyuda')}</Ayuda>
      </section>

      <div className="flex flex-col gap-1.5">
        <Segmento
          etiqueta={t('iconos.tamano')}
          opciones={TAMANOS_ICONOS.map((v) => ({ valor: v, etiqueta: v.toUpperCase() }))}
          valor={op.tamano}
          onCambiar={(v) => cambiar(cambioIconos(a, { tamano: v }))}
        />
        <div className="flex items-center justify-between gap-2">
          <Ayuda>{tamCaja !== null && !op.tamano ? t('iconos.tamanoAyudaCaja', { n: tamCaja }) : t('iconos.tamanoAyuda')}</Ayuda>
          {op.tamano && (
            <button type="button" onClick={() => cambiar(cambioIconos(a, { tamano: null }))} className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'shrink-0')}>
              {t('comoHoy')}
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Segmento
          etiqueta={t('iconos.trazo')}
          opciones={TRAZOS_UNIFICADOS.map((v) => ({ valor: v, etiqueta: t(`iconos.trazoOpcion.${v}`) }))}
          valor={trazo}
          onCambiar={(v) => cambiar(cambioTrazoUnificado(a, v))}
        />
        <Ayuda>{t('iconos.trazoAyuda')}</Ayuda>
      </div>
      <FilaInterruptor
        titulo={t('iconos.mostrarTexto')}
        ayuda={conTexto ? t('iconos.mostrarTextoAyuda') : t('iconos.mostrarTextoSinTexto')}
        valor={op.mostrarTexto}
        deshabilitado={!conTexto}
        onCambiar={(v) => cambiar(cambioIconos(a, { mostrarTexto: v ? null : false }))}
      />

      <FondoIconos ajustes={a} cambiar={cambiar} coloresTema={coloresTema ?? COLORES_RESPALDO} />

      <section className="flex flex-col gap-3 border-t border-line pt-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-[13px] font-semibold leading-[18px] text-fg">{t('iconos.cualesTitulo')}</h3>
          <Ayuda>{t('iconos.cualesTituloAyuda')}</Ayuda>
        </div>

        <TarjetaIcono
          icono="buscar"
          titulo={t('iconos.buscar')}
          forma={op.porIcono.buscar ?? null}
          derecha={<span className="shrink-0 rounded-full bg-subtle px-2 py-0.5 text-[10px] font-medium text-fg-secondary">{t('iconos.buscarEnDiseno')}</span>}
        >
          {/* El dibujo y la forma de la lupa solo se ven cuando el buscador es un ícono (en
              computador o en el celular). Con barra, el botón de la barra no los usa. */}
          {lupaVisible ? (
            <>
              <DibujoIcono accion="search" ajustes={a} cambiar={cambiar} />
              <FormaIconoCampo icono="buscar" op={op} ajustes={a} cambiar={cambiar} formas={FORMAS_BUSCAR} />
            </>
          ) : (
            <Ayuda>{t('iconos.buscarEsBarra')}</Ayuda>
          )}
          <FilaEnlace texto={t('iconos.buscarMostrar')} enlace={t('iconos.buscarIr')} onClick={onIrBuscador} />
          <NotaCelular>{t('iconos.buscarCelular')}</NotaCelular>
        </TarjetaIcono>

        <TarjetaIcono
          icono="favoritos"
          titulo={t('iconos.favoritos')}
          forma={op.porIcono.favoritos ?? null}
          derecha={<InterruptorIcono titulo={t('iconos.favoritos')} visible={op.favoritos} onVisible={(v) => cambiar(cambioIconos(a, { favoritos: v ? true : null }))} />}
        >
          {op.favoritos && (
            <>
              <div className="flex flex-col gap-1.5">
                <EtiquetaGrupo>{t('iconos.dibujo')}</EtiquetaGrupo>
                <ChipsOpcion
                  etiqueta={t('iconos.dibujoFavoritos')}
                  opciones={[{ valor: 'heart', etiqueta: t('iconos.corazon'), adorno: <Heart aria-hidden="true" className="size-4" strokeWidth={1.5} /> }]}
                  valor="heart"
                  onValorChange={() => undefined}
                />
                <Ayuda>{t('iconos.soloCorazon')}</Ayuda>
              </div>
              <FormaIconoCampo icono="favoritos" op={op} ajustes={a} cambiar={cambiar} formas={FORMAS_ICONO} />
              {campoTexto('favoritos')}
              <FilaEnlace texto={t('iconos.favoritosAbre')} enlace={t('iconos.favoritosVerPanel')} onClick={() => onAbrir('favoritos')} />
              {notaSoloComputador('favoritos') ?? <NotaCelular>{t('iconos.favoritosCelular')}</NotaCelular>}
            </>
          )}
        </TarjetaIcono>

        <TarjetaIcono
          icono="carrito"
          titulo={t('iconos.carrito')}
          forma={op.porIcono.carrito ?? null}
          derecha={<InterruptorIcono titulo={t('iconos.carrito')} visible={visibleCarrito} onVisible={(v) => cambiar({ show_header_cart: v })} />}
        >
          {visibleCarrito && (
            <>
              <DibujoIcono accion="cart" ajustes={a} cambiar={cambiar} />
              <Ayuda>{t('iconos.dibujoCarritoAyuda')}</Ayuda>
              <FormaIconoCampo icono="carrito" op={op} ajustes={a} cambiar={cambiar} formas={FORMAS_ICONO} />
              {campoTexto('carrito')}
              <Segmento
                etiqueta={t('iconos.contador')}
                opciones={CONTADORES_CARRITO.map((v) => ({ valor: v, etiqueta: t(`iconos.contadorOpcion.${v}`) }))}
                valor={op.contador}
                onCambiar={(v) => cambiar(cambioIconos(a, { contador: v === 'numero' ? null : v }))}
              />
              {notaSoloComputador('carrito')}
            </>
          )}
        </TarjetaIcono>

        <TarjetaIcono
          icono="cuenta"
          titulo={t('iconos.cuenta')}
          forma={op.porIcono.cuenta ?? null}
          derecha={<InterruptorIcono titulo={t('iconos.cuenta')} visible={visibleCuenta} onVisible={(v) => cambiar({ show_header_auth: v })} />}
        >
          {visibleCuenta && (
            <>
              <DibujoIcono accion="account" ajustes={a} cambiar={cambiar} />
              <FormaIconoCampo icono="cuenta" op={op} ajustes={a} cambiar={cambiar} formas={FORMAS_ICONO} />
              {campoTexto('cuenta')}
              {notaSoloComputador('cuenta')}
              <AlTocarCuenta ajustes={a} cambiar={cambiar} />
            </>
          )}
        </TarjetaIcono>

        <TarjetaIcono
          icono="moneda"
          titulo={t('iconos.moneda')}
          forma={op.porIcono.moneda ?? null}
          derecha={<InterruptorIcono titulo={t('iconos.moneda')} visible={visibleMoneda} onVisible={(v) => cambiar({ header_show_currency: v })} />}
        >
          {visibleMoneda && (
            <>
              {/* El dibujo de la moneda solo se usa sin estilo propio o con «Solo ícono»; con
                  Bandera, Código, Código + símbolo o Segmento la tienda no lo pinta. */}
              {dibujoMonedaVisible ? (
                <>
                  <DibujoIcono accion="currency" ajustes={a} cambiar={cambiar} />
                  <Ayuda>{t('iconos.monedaTexto')}</Ayuda>
                </>
              ) : (
                <Ayuda>{t('iconos.monedaSinDibujo', { estilo: t(`moneda.estiloOpcion.${estiloMoneda}`) })}</Ayuda>
              )}
              <FormaIconoCampo icono="moneda" op={op} ajustes={a} cambiar={cambiar} formas={FORMAS_ICONO} />
              <FilaEnlace texto={t('iconos.monedaEstiloFila')} enlace={t('iconos.monedaCambiar')} onClick={() => onAbrir('moneda')} />
              {notaSoloComputador('moneda') ?? <NotaCelular>{t('iconos.monedaCelular')}</NotaCelular>}
            </>
          )}
        </TarjetaIcono>
      </section>
    </>
  );
}
