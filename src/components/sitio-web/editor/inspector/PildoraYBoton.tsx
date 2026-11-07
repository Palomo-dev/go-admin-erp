'use client';

/**
 * Controles nuevos del panel «Encabezado» (Figma «Editor · Encabezado píldora, menú inferior y
 * botones», 2026-11-07):
 * - P1 · grupo «Píldora» de Diseño, solo con la composición `pill`;
 * - P2 · vista «Botón principal», con flecha para volver al encabezado.
 * Solo presentación y kit; qué clave escribe cada control está en `pildoraLogica.ts`.
 */
import { useId, type ReactNode } from 'react';
import {
  ArrowLeft,
  CalendarCheck,
  CalendarDays,
  ChevronRight,
  Heart,
  Info,
  MapPin,
  MessageCircle,
  Package,
  Percent,
  Phone,
  Search,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Star,
  Tag,
  Truck,
  User,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import { ChipsOpcion, SegmentedControl, clasesBoton } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTextosEditor } from '../textos';
import { ColorTema, EtiquetaGrupo, FilaInterruptor, InsigniaNuevo } from './PartesZonaGlobal';
import {
  ESTILOS_BOTON,
  ESTILOS_PILDORA,
  FORMAS_BOTON,
  ICONOS_BOTON,
  LADOS_ICONO,
  LETRAS_PILDORA,
  PILDORA_AL_BAJAR,
  POSICIONES_PILDORA,
  RELLENO_X,
  SEPARACION_DE_HOY,
  SOMBRAS_BOTON,
  altoBoton,
  altoMostrado,
  anchoBoton,
  ANCHO_FIJO_INICIAL,
  cambioAlto,
  cambioAncho,
  cambioEstiloBoton,
  cambioFormaBoton,
  cambioIconoBoton,
  cambioLadoIcono,
  cambioMayusculas,
  cambioModoAncho,
  cambioPildora,
  cambioRellenoX,
  cambioSeparacion,
  cambioSombra,
  cambioTamanoBoton,
  estiloBoton,
  formaBoton,
  iconoBoton,
  ladoAplica,
  ladoIcono,
  mayusculasBoton,
  radioDeHoy,
  rellenoX,
  separacionPildora,
  sombraBoton,
  tamanoBoton,
  valorPildora,
  type EstiloBoton,
  type FormaBoton,
  type LadoIcono,
  type Mayusculas,
  type SombraBoton,
  type TamanoBoton,
} from './pildoraLogica';

type Cambiar = (c: Record<string, unknown>) => void;

/** Íconos del botón principal (nombre de lucide en kebab-case → componente). */
export const ICONOS_LUCIDE_BOTON: Record<(typeof ICONOS_BOTON)[number], LucideIcon> = {
  'calendar-days': CalendarDays,
  'calendar-check': CalendarCheck,
  phone: Phone,
  'message-circle': MessageCircle,
  'map-pin': MapPin,
  'shopping-bag': ShoppingBag,
  'shopping-cart': ShoppingCart,
  package: Package,
  truck: Truck,
  tag: Tag,
  percent: Percent,
  star: Star,
  heart: Heart,
  sparkles: Sparkles,
  user: User,
  search: Search,
};

// ─── Piezas ────────────────────────────────────────────────────────────────────────────────────

/** Etiqueta y valor arriba, deslizador debajo (Figma P1/P2). Escribe en cada movimiento: el lienzo lo pinta en vivo. */
export function FilaDeslizador({
  etiqueta,
  valor,
  texto,
  min,
  max,
  paso = 1,
  onCambiar,
  deshabilitado,
  accion,
}: {
  etiqueta: string;
  valor: number;
  /** Lo que se lee a la derecha («10 %», «Automático»). */
  texto: string;
  min: number;
  max: number;
  paso?: number;
  onCambiar: (v: number) => void;
  deshabilitado?: boolean;
  /** Botón pequeño bajo el deslizador (p. ej. volver a lo de hoy). */
  accion?: ReactNode;
}) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1.5', deshabilitado && 'opacity-60')}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-semibold leading-4 text-fg-secondary">
          {etiqueta}
        </label>
        <span className="text-xs tabular-nums leading-4 text-fg-muted">{texto}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={paso}
        value={Math.min(max, Math.max(min, valor))}
        aria-valuetext={texto}
        disabled={deshabilitado}
        onChange={(e) => onCambiar(Number(e.target.value))}
        className="h-5 w-full cursor-pointer accent-brand-action disabled:cursor-not-allowed"
      />
      {accion}
    </div>
  );
}

/** Etiqueta a la izquierda y control segmentado a la derecha; baja de línea si no cabe. */
export function FilaSegmento<V extends string>({
  etiqueta,
  opciones,
  valor,
  onCambiar,
  deshabilitado,
}: {
  etiqueta: string;
  opciones: readonly { valor: V; etiqueta: string }[];
  valor: V;
  onCambiar: (v: V) => void;
  deshabilitado?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
      <span id={id} className={cn('text-[13px] font-medium leading-[18px] text-fg', deshabilitado && 'opacity-60')}>
        {etiqueta}
      </span>
      <SegmentedControl aria-labelledby={id} tamano="sm" opciones={opciones} valor={valor} onValorChange={onCambiar} deshabilitado={deshabilitado} />
    </div>
  );
}

function BotonTexto({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'self-start')}>
      {children}
    </button>
  );
}

/** Fila que abre la vista «Botón principal» (Contenido, Diseño con píldora y Estilo). */
export function FilaAbrirBoton({ onAbrir }: { onAbrir: () => void }) {
  const t = useTextosEditor();
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={`${t('zonaGlobal.botonPrincipal.titulo')}: ${t('zonaGlobal.botonPrincipal.abrir')}`}
      className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13px] font-medium leading-[18px] text-fg">{t('zonaGlobal.botonPrincipal.abrir')}</span>
        <span className="text-[11px] leading-[14px] text-fg-muted">{t('zonaGlobal.botonPrincipal.abrirAyuda')}</span>
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
    </button>
  );
}

// ─── P1 · Grupo «Píldora» ──────────────────────────────────────────────────────────────────────

export function GrupoPildora({ ajustes: a, cambiar, onAbrirBoton }: { ajustes: Record<string, unknown>; cambiar: Cambiar; onAbrirBoton: () => void }) {
  const t = useTextosEditor();
  const tp = (k: string, v?: Record<string, string | number>) => t(`zonaGlobal.pildora.${k}`, v);
  const estilo = valorPildora(a, 'header_pill_style');
  const opacidad = valorPildora(a, 'header_pill_glass_opacity');
  const desenfoque = valorPildora(a, 'header_pill_blur');
  const separacion = separacionPildora(a);
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-3" data-bloque="pildora">
      <div className="flex flex-col gap-1">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold leading-[18px] text-fg">
          {tp('titulo')}
          <InsigniaNuevo />
        </h3>
        <p className="text-[11px] leading-[14px] text-fg-muted">{tp('ayuda')}</p>
      </div>
      <FilaSegmento
        etiqueta={tp('estilo')}
        opciones={ESTILOS_PILDORA.map((v) => ({ valor: v, etiqueta: tp(`estiloOpcion.${v}`) }))}
        valor={estilo}
        onCambiar={(v) => cambiar(cambioPildora('header_pill_style', v))}
      />
      {estilo === 'vidrio' && (
        <FilaDeslizador
          etiqueta={tp('transparencia')}
          valor={opacidad}
          texto={tp('porcentaje', { n: opacidad })}
          min={0}
          max={40}
          onCambiar={(v) => cambiar(cambioPildora('header_pill_glass_opacity', v))}
        />
      )}
      <FilaDeslizador
        etiqueta={tp('desenfoque')}
        valor={desenfoque}
        texto={tp('px', { n: desenfoque })}
        min={0}
        max={32}
        onCambiar={(v) => cambiar(cambioPildora('header_pill_blur', v))}
      />
      <FilaInterruptor
        titulo={tp('borde')}
        valor={valorPildora(a, 'header_pill_border')}
        onCambiar={(v) => cambiar(cambioPildora('header_pill_border', v))}
      />
      <FilaSegmento
        etiqueta={tp('alBajar')}
        opciones={PILDORA_AL_BAJAR.map((v) => ({ valor: v, etiqueta: tp(`alBajarOpcion.${v}`) }))}
        valor={valorPildora(a, 'header_pill_on_scroll')}
        onCambiar={(v) => cambiar(cambioPildora('header_pill_on_scroll', v))}
      />
      <FilaSegmento
        etiqueta={tp('letras')}
        opciones={LETRAS_PILDORA.map((v) => ({ valor: v, etiqueta: tp(`letrasOpcion.${v}`) }))}
        valor={valorPildora(a, 'header_pill_text_case')}
        onCambiar={(v) => cambiar(cambioPildora('header_pill_text_case', v))}
      />
      <FilaDeslizador
        etiqueta={tp('separacion')}
        valor={separacion ?? SEPARACION_DE_HOY}
        texto={separacion === null ? tp('separacionHoy', { n: SEPARACION_DE_HOY }) : tp('px', { n: separacion })}
        min={0}
        max={32}
        onCambiar={(v) => cambiar(cambioSeparacion(v))}
        accion={separacion !== null ? <BotonTexto onClick={() => cambiar(cambioSeparacion(null))}>{tp('comoHoy')}</BotonTexto> : undefined}
      />
      <div className="flex flex-col gap-1.5">
        <FilaSegmento
          etiqueta={tp('posicion')}
          opciones={POSICIONES_PILDORA.map((v) => ({ valor: v, etiqueta: tp(`posicionOpcion.${v}`) }))}
          valor={valorPildora(a, 'header_pill_position')}
          onCambiar={(v) => cambiar(cambioPildora('header_pill_position', v))}
        />
        <p className="text-[11px] leading-[14px] text-fg-muted">{tp('posicionAyuda')}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <EtiquetaGrupo>{tp('botonPrincipal')}</EtiquetaGrupo>
        <FilaAbrirBoton onAbrir={onAbrirBoton} />
      </div>
    </section>
  );
}

// ─── P2 · Vista «Botón principal» ──────────────────────────────────────────────────────────────

/** Cabecera de la vista: flecha para volver, título y de dónde viene. */
export function CabeceraBotonPrincipal({ onVolver }: { onVolver: () => void }) {
  const t = useTextosEditor();
  return (
    <div className="flex items-start gap-2 px-4 pt-4">
      <button
        type="button"
        onClick={onVolver}
        aria-label={t('zonaGlobal.botonPrincipal.volver')}
        title={t('zonaGlobal.botonPrincipal.volver')}
        className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'w-8 shrink-0 px-0')}
      >
        <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.5} />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 className="text-base font-semibold leading-[22px] text-fg">{t('zonaGlobal.botonPrincipal.titulo')}</h2>
        <p className="text-xs font-medium leading-4 text-fg-secondary">{t('zonaGlobal.botonPrincipal.migas')}</p>
      </div>
    </div>
  );
}

/** Dibujo de cada forma en su tarjeta (Figma P2/P3). */
const DIBUJO_FORMA: Record<FormaBoton, string> = {
  pill: 'h-5 w-12 rounded-full',
  rounded: 'h-5 w-12 rounded-md',
  square: 'h-5 w-12 rounded-none',
  circle: 'size-7 rounded-full',
};

function TarjetasForma({ ajustes: a, cambiar }: { ajustes: Record<string, unknown>; cambiar: Cambiar }) {
  const t = useTextosEditor();
  const id = useId();
  const actual = formaBoton(a);
  const radio = radioDeHoy(a);
  return (
    <div className="flex flex-col gap-2">
      <EtiquetaGrupo id={id}>{t('zonaGlobal.botonPrincipal.forma')}</EtiquetaGrupo>
      <div role="radiogroup" aria-labelledby={id} className="grid grid-cols-4 gap-1.5">
        {FORMAS_BOTON.map((f) => {
          const sel = actual === f;
          return (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={sel}
              onClick={() => cambiar(cambioFormaBoton(f))}
              className={cn(
                'flex min-w-0 flex-col items-center gap-1.5 rounded-lg px-1 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                sel ? 'border-2 border-brand-action bg-brand-tint' : 'border border-line bg-surface hover:bg-hover',
              )}
            >
              <span aria-hidden="true" className="flex h-7 items-center justify-center">
                <span className={cn('block bg-fg', DIBUJO_FORMA[f])} />
              </span>
              <span className={cn('w-full truncate text-center text-xs leading-4', sel ? 'text-brand-deep' : 'text-fg')}>
                {t(`zonaGlobal.botonPrincipal.formaOpcion.${f}`)}
              </span>
            </button>
          );
        })}
      </div>
      {actual === null ? (
        <p className="text-[11px] leading-[14px] text-fg-muted">{t('zonaGlobal.botonPrincipal.formaPersonalizada', { n: radio })}</p>
      ) : (
        <BotonTexto onClick={() => cambiar(cambioFormaBoton(null))}>{t('zonaGlobal.botonPrincipal.formaVolver', { n: radio })}</BotonTexto>
      )}
    </div>
  );
}

const SIN_ICONO = '__ninguno';

function SelectorIconoBoton({ ajustes: a, cambiar }: { ajustes: Record<string, unknown>; cambiar: Cambiar }) {
  const t = useTextosEditor();
  const id = useId();
  const actual = iconoBoton(a);
  const nombres: string[] = [...ICONOS_BOTON];
  if (actual && !nombres.includes(actual)) nombres.push(actual);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span id={id} className="text-[13px] font-medium leading-[18px] text-fg">
          {t('zonaGlobal.botonPrincipal.icono')}
        </span>
        <Select value={actual ?? SIN_ICONO} onValueChange={(v) => cambiar(cambioIconoBoton(v === SIN_ICONO ? null : v))}>
          <SelectTrigger aria-labelledby={id} className="h-9 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SIN_ICONO}>{t('zonaGlobal.botonPrincipal.iconoNinguno')}</SelectItem>
            {nombres.map((n) => {
              const Icono = (ICONOS_LUCIDE_BOTON as Record<string, LucideIcon | undefined>)[n];
              return (
                <SelectItem key={n} value={n}>
                  <span className="flex items-center gap-2">
                    {Icono && <Icono aria-hidden="true" className="size-4" strokeWidth={1.5} />}
                    {Icono ? t(`zonaGlobal.botonPrincipal.iconoNombre.${n}`) : n}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      {actual === null && formaBoton(a) === 'circle' && (
        <p className="text-[11px] leading-[14px] text-fg-muted">{t('zonaGlobal.botonPrincipal.iconoCirculo')}</p>
      )}
    </div>
  );
}

/**
 * Vista «Botón principal» (P2). `children` = texto y destino (el mismo campo de Contenido). La nota
 * del diseño sobre el segundo botón y los de las secciones va como ayuda: esos aún no se editan aquí.
 */
export function VistaBotonPrincipal({
  ajustes: a,
  cambiar,
  coloresTema,
  children,
}: {
  ajustes: Record<string, unknown>;
  cambiar: Cambiar;
  coloresTema: { fondo: string; texto: string; acento: string };
  children: ReactNode;
}) {
  const t = useTextosEditor();
  const tb = (k: string, v?: Record<string, string | number>) => t(`zonaGlobal.botonPrincipal.${k}`, v);
  const idEstilo = useId();
  const idSombra = useId();
  const ancho = anchoBoton(a);
  const alto = altoBoton(a);
  const tamano = tamanoBoton(a);
  const relleno = rellenoX(a);
  return (
    <div className="flex flex-col gap-4">
      {children}
      <TarjetasForma ajustes={a} cambiar={cambiar} />
      <FilaSegmento<TamanoBoton | 'hoy'>
        etiqueta={tb('tamano')}
        opciones={(['hoy', 'sm', 'md', 'lg'] as const).map((v) => ({ valor: v, etiqueta: tb(`tamanoOpcion.${v}`) }))}
        valor={tamano ?? 'hoy'}
        onCambiar={(v) => cambiar(cambioTamanoBoton(a, v === 'hoy' ? null : v))}
      />
      <FilaSegmento<'auto' | 'fijo'>
        etiqueta={tb('ancho')}
        opciones={(['auto', 'fijo'] as const).map((v) => ({ valor: v, etiqueta: tb(`anchoOpcion.${v}`) }))}
        valor={ancho === null ? 'auto' : 'fijo'}
        onCambiar={(v) => cambiar(cambioModoAncho(a, v))}
      />
      <FilaDeslizador
        etiqueta={tb('anchoFijo')}
        valor={ancho ?? ANCHO_FIJO_INICIAL}
        texto={tb(ancho === null ? 'anchoOpcion.auto' : 'anchoFijoPx', { n: ancho ?? ANCHO_FIJO_INICIAL })}
        min={60}
        max={280}
        deshabilitado={ancho === null}
        onCambiar={(v) => cambiar(cambioAncho(v))}
      />
      <FilaDeslizador
        etiqueta={tb('alto')}
        valor={altoMostrado(a)}
        texto={alto === null ? tb('altoAuto') : t('zonaGlobal.pildora.px', { n: alto })}
        min={28}
        max={80}
        onCambiar={(v) => cambiar(cambioAlto(a, v))}
        accion={alto !== null ? <BotonTexto onClick={() => cambiar(cambioAlto(a, null))}>{tb('altoQuitar')}</BotonTexto> : undefined}
      />
      <FilaDeslizador
        etiqueta={tb('relleno')}
        valor={relleno}
        texto={t('zonaGlobal.pildora.px', { n: relleno })}
        min={RELLENO_X.min}
        max={RELLENO_X.max}
        onCambiar={(v) => cambiar(cambioRellenoX(v))}
      />
      <div className="flex flex-col gap-2">
        <EtiquetaGrupo id={idEstilo}>{tb('estilo')}</EtiquetaGrupo>
        <ChipsOpcion<EstiloBoton>
          aria-labelledby={idEstilo}
          opciones={ESTILOS_BOTON.map((v) => ({ valor: v, etiqueta: tb(`estiloOpcion.${v}`) }))}
          valor={estiloBoton(a)}
          onValorChange={(v) => cambiar(cambioEstiloBoton(v))}
        />
      </div>
      <SelectorIconoBoton ajustes={a} cambiar={cambiar} />
      <FilaSegmento<LadoIcono>
        etiqueta={tb('lado')}
        opciones={LADOS_ICONO.map((v) => ({ valor: v, etiqueta: tb(`ladoOpcion.${v}`) }))}
        valor={ladoIcono(a)}
        deshabilitado={!ladoAplica(a)}
        onCambiar={(v) => cambiar(cambioLadoIcono(a, v))}
      />
      <FilaSegmento<Mayusculas>
        etiqueta={tb('mayusculas')}
        opciones={(['sitio', 'si', 'no'] as const).map((v) => ({ valor: v, etiqueta: tb(`mayusculasOpcion.${v}`) }))}
        valor={mayusculasBoton(a)}
        onCambiar={(v) => cambiar(cambioMayusculas(v))}
      />
      <div className="flex flex-col gap-2">
        <EtiquetaGrupo id={idSombra}>{tb('sombra')}</EtiquetaGrupo>
        <ChipsOpcion<SombraBoton>
          aria-labelledby={idSombra}
          opciones={SOMBRAS_BOTON.map((v) => ({ valor: v, etiqueta: tb(`sombraOpcion.${v}`) }))}
          valor={sombraBoton(a)}
          onValorChange={(v) => cambiar(cambioSombra(v))}
        />
      </div>
      <section className="flex flex-col gap-3">
        <h3 className="text-[13px] font-semibold leading-[18px] text-fg">{tb('colores')}</h3>
        <ColoresBotonPrincipal ajustes={a} cambiar={cambiar} coloresTema={coloresTema} etiquetas={{ fondo: tb('colorFondo'), texto: tb('colorTexto') }} />
      </section>
      <div className="flex items-start gap-2 rounded-lg border border-line-info bg-info-subtle px-3 py-2">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info-text" strokeWidth={1.5} />
        <p className="text-xs leading-4 text-info-text">{tb('nota')}</p>
      </div>
    </div>
  );
}

/**
 * Fondo y texto del botón principal (`cta_bg_color`, `cta_text_color`): los mismos dos controles de
 * Estilo, que se quedan allí también (mismo valor en los dos sitios).
 */
export function ColoresBotonPrincipal({
  ajustes: a,
  cambiar,
  coloresTema,
  etiquetas,
}: {
  ajustes: Record<string, unknown>;
  cambiar: Cambiar;
  coloresTema: { fondo: string; acento: string };
  etiquetas?: { fondo: string; texto: string };
}) {
  const t = useTextosEditor();
  const leer = (k: string) => (typeof a[k] === 'string' && a[k] ? (a[k] as string) : null);
  return (
    <>
      <ColorTema
        etiqueta={etiquetas?.fondo ?? t('zonaGlobal.estilo.boton')}
        valor={leer('cta_bg_color')}
        colorTema={coloresTema.acento}
        onCambiar={(v) => cambiar(v === null ? { cta_bg_color: null, cta_text_color: null } : { cta_bg_color: v })}
      />
      {leer('cta_bg_color') && (
        <ColorTema
          etiqueta={etiquetas?.texto ?? t('zonaGlobal.estilo.botonTexto')}
          valor={leer('cta_text_color')}
          colorTema={coloresTema.fondo}
          fondo={leer('cta_bg_color') ?? undefined}
          onCambiar={(v) => cambiar({ cta_text_color: v })}
        />
      )}
    </>
  );
}
