'use client';

/**
 * «Encabezado › Diseño › Buscador › Apariencia» (Figma «16 Sitio web» 3242:99098, estados
 * 3248:99253, plantillas 3247:98931; aprobado 2026-11-25).
 *
 * Se abre desde la fila «Apariencia del buscador ›» de Diseño › Buscador, que se SUMA a lo de hoy
 * (interruptor, forma de computador y celular, búsquedas populares: nada se quita). No guarda: cada
 * cambio va a `cambiar` (el `cambiarAjustes` del editor) y el lienzo lo pinta en vivo.
 *
 * Valores, plantillas, contraste y CSS de la muestra: `@/lib/website/v2/aparienciaBuscador` (la
 * misma copia que pinta la tienda). Textos: `sitioWeb.editor.aparienciaBuscador.*` (es/en/fr/pt).
 */
import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ChevronRight, Monitor, RotateCcw, Search, Smartphone, TriangleAlert } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { CampoNumero, ChipsOpcion, ConfirmDialog, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { ColorField } from '@/components/sitio-web/ui/ColorField';
import { formatearRazon } from '@/lib/utils/contrasteColor';
import {
  ALTO_MAX,
  ALTO_MIN,
  ANCHO_MAX_MAX,
  ANCHO_MAX_MIN,
  LARGO_AYUDA,
  LARGO_TEXTO_BOTON,
  LARGO_TEXTO_CATEGORIAS,
  PLANTILLAS_BUSCADOR,
  RADIO_PX_MAX,
  SOMBRA_CSS,
  SOMBRAS_BUSCADOR,
  avisosContraste,
  estadoPlantilla,
  estiloCajaApariencia,
  rellenoCampo,
  resolverApariencia,
  variablesApariencia,
  type AparienciaBuscador,
  type AparienciaResuelta,
  type ClaveApariencia,
  type ColoresBuscador,
  type DispositivoBuscador,
  type PlantillaBuscador,
} from '@/lib/website/v2/aparienciaBuscador';
import { EtiquetaGrupo, FilaInterruptor, InsigniaNuevo, TituloBloque } from './PartesZonaGlobal';
import {
  aparienciaGuardada,
  aparienciaVista,
  celularCopia,
  cambioApariencia,
  cambioPlantilla,
  cambioRestablecerApariencia,
  dispositivosEditables,
  formaDe,
} from './aparienciaBuscadorLogica';

type Ajustes = Record<string, unknown>;
type Cambiar = (c: Ajustes) => void;
type ColoresTema = { fondo: string; texto: string; acento: string };

const HOY = '__hoy';
const PROPIO = '__propio';

function useT() {
  return useTranslations('sitioWeb.editor.aparienciaBuscador');
}

const Ayuda = ({ children }: { children: ReactNode }) => <p className="text-[11px] leading-[14px] text-fg-muted">{children}</p>;

function coloresDe(c: ColoresTema): ColoresBuscador {
  return { primary: c.acento, text: c.texto, background: c.fondo };
}

// ─── Muestra (la misma CSS que la tienda) ──────────────────────────────────────────────────────

export type EstadoMuestra = 'normal' | 'hover' | 'foco' | 'texto';

/** Barra de muestra en un estado fijo (sin JS de la tienda): para la vista previa y la fila-enlace. */
export function MuestraBuscador({ res, estado = 'normal', ayuda, texto, compacta = false }: { res: AparienciaResuelta; estado?: EstadoMuestra; ayuda: string; texto?: string; compacta?: boolean }) {
  const vars = variablesApariencia(res);
  const caja = estiloCajaApariencia(res) as CSSProperties;
  const foco = estado === 'foco' || estado === 'texto';
  const borde = foco ? res.bordeFoco : estado === 'hover' ? res.bordeHover : res.bordeColor;
  const sombra = foco ? vars['--bq-sombra-foco'] : SOMBRA_CSS[res.sombra];
  const pegado = res.boton !== 'none' && res.botonPegado;
  const boton =
    res.boton === 'none' ? null : (
      <span
        className={cn('inline-flex shrink-0 items-center justify-center gap-1 px-2.5 text-[12px] font-semibold', pegado ? 'self-stretch' : '')}
        style={{ backgroundColor: res.botonFondo, color: res.botonColor, borderRadius: res.botonRadio, ...(pegado ? {} : { height: compacta ? 32 : res.alto }) }}
      >
        {res.boton !== 'text' && <Search aria-hidden="true" className="size-3.5" />}
        {(res.boton === 'text' || res.boton === 'icon_text') && res.botonTexto}
      </span>
    );
  const barra = (
    <span
      aria-hidden="true"
      className={cn('relative flex min-w-0 flex-1 items-stretch', pegado && res.dispositivo === 'computador' ? 'gap-1 p-1' : '')}
      style={{
        ...caja,
        maxWidth: undefined,
        marginLeft: undefined,
        marginRight: undefined,
        width: undefined,
        height: compacta ? 32 : res.alto,
        borderColor: borde,
        boxShadow: sombra,
      }}
    >
      {res.categorias && (
        <span className={cn('flex shrink-0 items-center px-2 text-[12px] font-medium', res.categoriasSeparador && 'border-r border-r-gray-200')} style={{ color: res.texto }}>
          {res.categoriasTexto} ▾
        </span>
      )}
      <span className="relative flex min-w-0 flex-1 items-center" style={rellenoCampo(res)}>
        {res.iconoLado !== 'none' && (
          <Search
            aria-hidden="true"
            className={cn('absolute top-1/2 -translate-y-1/2', res.iconoLado === 'right' ? 'right-3' : 'left-3')}
            style={{ width: res.iconoTamano, height: res.iconoTamano, color: res.iconoColor }}
          />
        )}
        <span className="truncate text-[13px]" style={{ color: texto ? res.texto : res.ayudaColor }}>
          {texto ?? res.ayuda ?? ayuda}
          {foco && <span className="ml-px inline-block h-3.5 w-px translate-y-0.5 bg-current" />}
        </span>
      </span>
      {pegado && boton}
    </span>
  );
  return (
    <span className="flex w-full min-w-0 items-center gap-2" data-muestra-buscador={estado}>
      {barra}
      {!pegado && boton}
    </span>
  );
}

// ─── Fila-enlace en Diseño › Buscador ──────────────────────────────────────────────────────────

/** «Apariencia del buscador ›» con la plantilla actual y la muestra de hoy (Figma A1). */
export function FilaAparienciaBuscador({ ajustes: a, coloresTema, onAbrir }: { ajustes: Ajustes; coloresTema: ColoresTema; onAbrir: () => void }) {
  const t = useT();
  const estado = estadoPlantilla(aparienciaGuardada(a, 'computador'));
  const res = resolverApariencia(aparienciaVista(a, 'computador'), formaDe(a, 'computador'), coloresDe(coloresTema));
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="flex w-full flex-col gap-2 rounded-lg border border-brand-action bg-brand-tint px-3 py-2.5 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      data-fila="apariencia-buscador"
    >
      <span className="flex w-full items-start gap-2">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-[13px] font-medium leading-[18px] text-fg">
            {t('abrir')}
            <InsigniaNuevo />
          </span>
          <span className="text-[11px] leading-[14px] text-fg-muted">
            {t('abrirAyuda', { plantilla: nombrePlantilla(t, estado) })}
          </span>
        </span>
        <ChevronRight aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
      </span>
      <span className="flex w-full rounded-md bg-white p-2">
        <MuestraBuscador res={res} ayuda={t('ayudaHoy')} compacta />
      </span>
    </button>
  );
}

function nombrePlantilla(t: ReturnType<typeof useT>, e: { base: PlantillaBuscador | null; personalizada: boolean }): string {
  if (!e.base) return t('plantillas.personalizadoSin');
  const nombre = t(`plantillas.${e.base}`);
  return e.personalizada ? t('plantillas.personalizadoDesde', { plantilla: nombre }) : nombre;
}

/** Cabecera de la vista: ← para volver, «Buscador › Apariencia» y las migas. */
export function CabeceraVistaApariencia({ onVolver }: { onVolver: () => void }) {
  const t = useT();
  return (
    <div className="flex items-start gap-2 px-4 pt-4">
      <button
        type="button"
        onClick={onVolver}
        aria-label={t('volver')}
        title={t('volver')}
        className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'w-8 shrink-0 px-0')}
      >
        <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.5} />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 className="text-base font-semibold leading-[22px] text-fg">{t('titulo')}</h2>
        <p className="text-xs font-medium leading-4 text-fg-secondary">{t('migas')}</p>
      </div>
    </div>
  );
}

// ─── Piezas de la vista ────────────────────────────────────────────────────────────────────────

/** Chips con etiqueta de grupo. `null` (chip «hoy») quita la subclave. */
function Grupo<V extends string>({ etiqueta, opciones, valor, onCambiar, ayuda }: { etiqueta: string; opciones: { valor: V; etiqueta: string }[]; valor: V; onCambiar: (v: V) => void; ayuda?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <EtiquetaGrupo id={id}>{etiqueta}</EtiquetaGrupo>
      <ChipsOpcion aria-labelledby={id} opciones={opciones} valor={valor} onValorChange={onCambiar} />
      {ayuda && <Ayuda>{ayuda}</Ayuda>}
    </div>
  );
}

/**
 * Color con chips (hoy, tokens del tema, «Propio») y el campo de color si es propio. `valor` es lo
 * guardado (token o hex); sin nada guardado, el chip «hoy».
 */
function ColorOpciones({
  etiqueta,
  opciones,
  valor,
  actual,
  fondo,
  hoyToken,
  onCambiar,
}: {
  etiqueta: string;
  /** El primero es «hoy» (quita la subclave). */
  opciones: { valor: string; etiqueta: string }[];
  valor: string | undefined;
  /** Hex que se ve ahora: con él arranca «Propio». */
  actual: string;
  fondo?: string;
  /** Token que equivale a lo de hoy (p. ej. `primary` en el fondo del botón): se marca «hoy». */
  hoyToken?: string;
  onCambiar: (v: string | null) => void;
}) {
  const t = useT();
  const elegido =
    valor === undefined || valor === hoyToken ? HOY : opciones.some((o) => o.valor === valor) ? valor : PROPIO;
  // Un token del tema que no está entre los chips se edita como su color de ahora.
  const hexPropio = valor && valor.startsWith('#') ? valor : actual.startsWith('#') ? actual : '#111827';
  return (
    <div className="flex flex-col gap-2">
      <Grupo
        etiqueta={etiqueta}
        opciones={[...opciones, { valor: PROPIO, etiqueta: t('propio') }]}
        valor={elegido}
        onCambiar={(v) => onCambiar(v === HOY ? null : v === PROPIO ? (actual.startsWith('#') ? actual : '#111827') : v)}
      />
      {elegido === PROPIO && <ColorField etiqueta={t('colorPropio')} valor={hexPropio} onCambiar={(hex) => onCambiar(hex)} fondo={fondo} />}
    </div>
  );
}

// ─── Vista ─────────────────────────────────────────────────────────────────────────────────────

export function VistaAparienciaBuscador({
  ajustes: a,
  cambiar,
  coloresTema,
  onIrIconos,
}: {
  ajustes: Ajustes;
  cambiar: Cambiar;
  coloresTema: ColoresTema;
  /** Acceso directo al dibujo de la lupa (un solo dato: `search_icon`, en Encabezado › Íconos). */
  onIrIconos?: () => void;
}) {
  const t = useT();
  const editables = dispositivosEditables(a);
  const [dispositivoElegido, setDispositivo] = useState<DispositivoBuscador>('computador');
  const d: DispositivoBuscador = editables.includes(dispositivoElegido) ? dispositivoElegido : 'computador';
  const [estado, setEstado] = useState<EstadoMuestra>('normal');
  const [confirmar, setConfirmar] = useState<null | { tipo: 'restablecer' } | { tipo: 'plantilla'; id: PlantillaBuscador }>(null);
  const [descartados, setDescartados] = useState<string[]>([]);

  const forma = formaDe(a, d);
  const guardada = aparienciaGuardada(a, d);
  const vista = aparienciaVista(a, d);
  const g: AparienciaBuscador = vista ?? {};
  const colores = coloresDe(coloresTema);
  const res = resolverApariencia(vista, forma, colores, d);
  const fondoEncabezado = typeof a.header_bg_color === 'string' && a.header_bg_color ? a.header_bg_color : coloresTema.fondo;
  const avisos = avisosContraste(res, fondoEncabezado).filter((x) => !descartados.includes(`${d}:${x.campo}:${x.sugerido}`));
  const plantilla = estadoPlantilla(d === 'celular' && celularCopia(a) ? aparienciaGuardada(a, 'computador') : guardada);
  const fondoMedido = res.fondo === 'transparent' ? fondoEncabezado : res.fondo;

  const poner = (cambios: Partial<Record<ClaveApariencia, unknown>>) => cambiar(cambioApariencia(a, d, cambios));
  const ponerUno = (clave: ClaveApariencia) => (v: string | null) => poner({ [clave]: v === HOY ? null : v });
  const elegirPlantilla = (id: PlantillaBuscador) => {
    if (plantilla.base === id && plantilla.personalizada) setConfirmar({ tipo: 'plantilla', id });
    else cambiar(cambioPlantilla(d, id));
  };

  const altoGuardado = g.height;
  const altoChip = altoGuardado === undefined ? HOY : typeof altoGuardado === 'number' ? 'propio' : altoGuardado;
  const radioPx = g.radius_px ?? (res.radio >= 9999 ? null : res.radio);

  return (
    <div className="flex flex-col gap-5" data-vista="apariencia-buscador">
      {/* Vista previa en vivo con los estados (Figma A2: Normal · Pasar el cursor · Enfocado · Con texto). */}
      <section className="flex flex-col gap-2 rounded-lg bg-subtle p-3" aria-label={t('previa.titulo')}>
        <p className="flex items-center gap-1.5 text-[11px] font-medium leading-[14px] text-fg-secondary">
          {d === 'celular' ? <Smartphone aria-hidden="true" className="size-3.5" /> : <Monitor aria-hidden="true" className="size-3.5" />}
          {t('previa.titulo')} · {t(`dispositivo.${d}`)} · {t(`previa.estado.${estado}`)}
        </p>
        <div className="flex rounded-md bg-white p-3" style={{ backgroundColor: fondoEncabezado }}>
          <MuestraBuscador res={res} estado={estado} ayuda={t('ayudaHoy')} texto={estado === 'texto' ? t('previa.textoEjemplo') : undefined} />
        </div>
        <ChipsOpcion
          etiqueta={t('previa.estados')}
          opciones={(['normal', 'hover', 'foco', 'texto'] as const).map((e) => ({ valor: e, etiqueta: t(`previa.estado.${e}`) }))}
          valor={estado}
          onValorChange={setEstado}
        />
        <Ayuda>{t('previa.ayuda')}</Ayuda>
      </section>

      {editables.length > 1 && (
        <div className="flex flex-col gap-2">
          <Grupo
            etiqueta={t('editando')}
            opciones={editables.map((x) => ({ valor: x, etiqueta: t(`dispositivo.${x}`) }))}
            valor={d}
            onCambiar={(x) => setDispositivo(x)}
            ayuda={t('editandoAyuda')}
          />
          {d === 'celular' && celularCopia(a) && (
            <p className="rounded-md border border-line-info bg-info-subtle px-3 py-2 text-[12px] leading-4 text-info-text">{t('celularCopia')}</p>
          )}
        </div>
      )}
      {forma === 'hidden' && <p className="rounded-md bg-subtle px-3 py-2 text-[12px] leading-4 text-fg-secondary">{t('formaOculta')}</p>}

      <section className="flex flex-col gap-2">
        <TituloBloque>{t('plantillas.titulo')}</TituloBloque>
        <Ayuda>{t('plantillas.ayuda')}</Ayuda>
        <ChipsOpcion
          etiqueta={t('plantillas.titulo')}
          opciones={PLANTILLAS_BUSCADOR.map((id) => ({ valor: id, etiqueta: id === 'today' ? t('plantillas.todayDefecto') : t(`plantillas.${id}`) }))}
          valor={plantilla.base && !plantilla.personalizada ? plantilla.base : ('' as PlantillaBuscador)}
          onValorChange={elegirPlantilla}
        />
        {plantilla.personalizada && (
          <p className="text-[12px] font-medium leading-4 text-brand-deep" data-plantilla-personalizada="">
            {nombrePlantilla(t, plantilla)}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <TituloBloque>{t('tamano.titulo')}</TituloBloque>
        <Grupo
          etiqueta={t('tamano.alto')}
          opciones={[
            { valor: HOY, etiqueta: t('hoyValor', { valor: `${resolverApariencia(null, forma, colores, d).alto} px` }) },
            { valor: 'sm', etiqueta: 'S · 40 px' },
            { valor: 'md', etiqueta: 'M · 44 px' },
            { valor: 'lg', etiqueta: 'L · 48 px' },
            { valor: 'propio', etiqueta: t('propio') },
          ]}
          valor={altoChip}
          onCambiar={(v) => poner({ height: v === HOY ? null : v === 'propio' ? res.alto : v })}
          ayuda={t('tamano.altoCelular')}
        />
        {altoChip === 'propio' && (
          <CampoNumero aria-label={t('tamano.altoPropio')} valor={res.alto} decimales={0} minimo={ALTO_MIN} maximo={ALTO_MAX} sufijo="px" tamano="sm" onValorChange={(n) => poner({ height: n === null ? null : Math.min(ALTO_MAX, Math.max(ALTO_MIN, Math.round(n))) })} />
        )}
        <Grupo
          etiqueta={t('tamano.ancho')}
          opciones={[
            { valor: 'auto', etiqueta: t('tamano.automatico') },
            { valor: 'fill', etiqueta: t('tamano.lleno') },
          ]}
          valor={res.ancho}
          onCambiar={(v) => poner({ width: v === 'auto' ? null : v })}
        />
        {res.ancho === 'auto' && (
          <div className="flex flex-col gap-1.5">
            <EtiquetaGrupo>{t('tamano.anchoMaximo')}</EtiquetaGrupo>
            <CampoNumero aria-label={t('tamano.anchoMaximo')} valor={g.max_width ?? null} placeholder={t('tamano.sinTope')} decimales={0} minimo={ANCHO_MAX_MIN} maximo={ANCHO_MAX_MAX} sufijo="px" tamano="sm" onValorChange={(n) => poner({ max_width: n === null ? null : Math.min(ANCHO_MAX_MAX, Math.max(ANCHO_MAX_MIN, Math.round(n))) })} />
            <Ayuda>{t('tamano.anchoMaximoAyuda', { min: ANCHO_MAX_MIN, max: ANCHO_MAX_MAX })}</Ayuda>
          </div>
        )}
        <Grupo
          etiqueta={t('tamano.alineacion')}
          opciones={[
            { valor: HOY, etiqueta: t('hoy') },
            { valor: 'left', etiqueta: t('tamano.izquierda') },
            { valor: 'center', etiqueta: t('tamano.centro') },
            { valor: 'right', etiqueta: t('tamano.derecha') },
          ]}
          valor={g.align ?? HOY}
          onCambiar={ponerUno('align')}
        />
      </section>

      <section className="flex flex-col gap-3">
        <TituloBloque>{t('bordes.titulo')}</TituloBloque>
        <Grupo
          etiqueta={t('bordes.grosor')}
          opciones={['0', '1', '2', '3'].map((n) => ({ valor: n, etiqueta: n === '0' ? '0' : `${n} px` }))}
          valor={String(res.bordeAncho)}
          onCambiar={(v) => poner({ border_width: Number(v) })}
        />
        {res.bordeAncho > 0 && (
          <>
            <ColorOpciones
              etiqueta={t('bordes.color')}
              opciones={[{ valor: HOY, etiqueta: t('bordes.colorTema') }, { valor: 'primary', etiqueta: t('colorMarca') }]}
              valor={g.border_color}
              actual={res.bordeColor}
              onCambiar={ponerUno('border_color')}
            />
            <Grupo
              etiqueta={t('bordes.estilo')}
              opciones={[
                { valor: 'solid', etiqueta: t('bordes.completo') },
                { valor: 'bottom', etiqueta: t('bordes.soloAbajo') },
                { valor: 'dashed', etiqueta: t('bordes.punteado') },
              ]}
              valor={res.bordeEstilo}
              onCambiar={(v) => poner({ border_style: v === 'solid' ? null : v })}
            />
          </>
        )}
        <ColorOpciones
          etiqueta={t('bordes.alEnfocar')}
          opciones={[{ valor: HOY, etiqueta: t('bordes.alEnfocarHoy') }, { valor: 'same', etiqueta: t('bordes.igualNormal') }]}
          valor={g.focus_border_color}
          hoyToken="primary"
          actual={res.bordeFoco}
          onCambiar={ponerUno('focus_border_color')}
        />
      </section>

      {res.bordeEstilo !== 'bottom' && (
        <section className="flex flex-col gap-3">
          <TituloBloque>{t('esquinas.titulo')}</TituloBloque>
          <Grupo
            etiqueta={t('esquinas.forma')}
            opciones={(['square', 'soft', 'rounded', 'pill'] as const).map((e) => ({ valor: e, etiqueta: t(`esquinas.${e}`) }))}
            valor={g.radius ?? (res.radio >= 9999 ? 'pill' : res.radio === 0 ? 'square' : res.radio <= 8 ? 'soft' : 'rounded')}
            onCambiar={(v) => poner({ radius: v, radius_px: null })}
          />
          {res.radio < 9999 && (
            <div className="flex flex-col gap-1.5">
              <EtiquetaGrupo>{t('esquinas.radio')}</EtiquetaGrupo>
              <CampoNumero aria-label={t('esquinas.radio')} valor={radioPx} decimales={0} minimo={0} maximo={RADIO_PX_MAX} sufijo="px" tamano="sm" onValorChange={(n) => poner({ radius_px: n === null ? null : Math.min(RADIO_PX_MAX, Math.max(0, Math.round(n))) })} />
              <Ayuda>{t('esquinas.radioAyuda', { max: RADIO_PX_MAX })}</Ayuda>
            </div>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <TituloBloque>{t('sombra.titulo')}</TituloBloque>
        <Grupo
          etiqueta={t('sombra.normal')}
          opciones={SOMBRAS_BUSCADOR.map((s) => ({ valor: s, etiqueta: t(`sombra.${s}`) }))}
          valor={res.sombra}
          onCambiar={(v) => poner({ shadow: v })}
          ayuda={t('sombra.ayuda')}
        />
        <Grupo
          etiqueta={t('sombra.alEnfocar')}
          opciones={[
            { valor: 'same', etiqueta: t('sombra.igual') },
            { valor: 'up', etiqueta: t('sombra.unNivelMas') },
            { valor: 'none', etiqueta: t('sombra.none') },
          ]}
          valor={g.focus_shadow ?? 'same'}
          onCambiar={(v) => poner({ focus_shadow: v === 'same' ? null : v })}
        />
      </section>

      <section className="flex flex-col gap-3">
        <TituloBloque>{t('interior.titulo')}</TituloBloque>
        <ColorOpciones
          etiqueta={t('interior.fondo')}
          opciones={[
            { valor: HOY, etiqueta: t('hoy') },
            { valor: '#FFFFFF', etiqueta: t('interior.blanco') },
            { valor: 'background', etiqueta: t('interior.delTema') },
            { valor: 'transparent', etiqueta: t('interior.transparente') },
          ]}
          valor={g.bg}
          actual={res.fondo}
          onCambiar={ponerUno('bg')}
        />
        <ColorOpciones
          etiqueta={t('interior.texto')}
          opciones={[{ valor: HOY, etiqueta: t('hoy') }]}
          valor={g.text_color}
          actual={res.texto}
          fondo={fondoMedido}
          onCambiar={ponerUno('text_color')}
        />
        <div className="flex flex-col gap-1.5">
          <EtiquetaGrupo>{t('interior.ayuda')}</EtiquetaGrupo>
          <Input aria-label={t('interior.ayuda')} value={g.placeholder ?? ''} placeholder={t('ayudaHoy')} maxLength={LARGO_AYUDA} onChange={(e) => poner({ placeholder: e.target.value.trim() === '' ? null : e.target.value })} />
          <Ayuda>{t('interior.ayudaNota', { max: LARGO_AYUDA })}</Ayuda>
        </div>
        <ColorOpciones
          etiqueta={t('interior.ayudaColor')}
          opciones={[{ valor: HOY, etiqueta: t('hoyValor', { valor: '#6B7280' }) }]}
          valor={g.placeholder_color}
          actual={res.ayudaColor}
          fondo={fondoMedido}
          onCambiar={ponerUno('placeholder_color')}
        />
        <Grupo
          etiqueta={t('interior.fuente')}
          opciones={[
            { valor: 'body', etiqueta: t('interior.fuenteTema') },
            { valor: 'heading', etiqueta: t('interior.fuenteTitulos') },
          ]}
          valor={res.fuente}
          onCambiar={(v) => poner({ font: v === 'body' ? null : v })}
        />
      </section>

      {avisos.length > 0 && (
        <section className="flex flex-col gap-2" aria-live="polite">
          {avisos.map((x) => (
            <div key={x.campo} role="note" className="flex flex-col gap-2 rounded-lg border border-line-warning bg-warning-subtle px-3 py-2.5" data-aviso-contraste={x.campo}>
              <p className="flex items-center gap-1.5 text-[13px] font-semibold leading-[18px] text-warning-text">
                <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
                {t(`contraste.${x.campo}`, { razon: formatearRazon(x.razon) })}
              </p>
              <p className="text-[12px] leading-4 text-warning-text">
                {t('contraste.necesita', { minimo: String(x.minimo).replace('.', ','), sugerido: x.sugerido ?? '—' })}
              </p>
              <div className="flex flex-wrap gap-2">
                {x.sugerido && (
                  <button
                    type="button"
                    className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
                    onClick={() => poner({ [x.campo === 'texto' ? 'text_color' : x.campo === 'ayuda' ? 'placeholder_color' : 'button_fg']: x.sugerido })}
                  >
                    {t('contraste.usar')}
                  </button>
                )}
                <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => setDescartados((l) => [...l, `${d}:${x.campo}:${x.sugerido}`])}>
                  {t('contraste.dejar')}
                </button>
              </div>
            </div>
          ))}
          <Ayuda>{t('contraste.nota')}</Ayuda>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <TituloBloque>{t('icono.titulo')}</TituloBloque>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] leading-4 text-fg-secondary">{t('icono.dibujo')}</span>
          <button type="button" onClick={onIrIconos} disabled={!onIrIconos} className="inline-flex shrink-0 items-center gap-0.5 text-[12px] font-medium text-brand-deep hover:underline disabled:opacity-50">
            {t('icono.irIconos')}
            <ChevronRight aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
          </button>
        </div>
        <Grupo
          etiqueta={t('icono.posicion')}
          opciones={[
            { valor: 'left', etiqueta: t('icono.izquierda') },
            { valor: 'right', etiqueta: t('icono.derecha') },
            { valor: 'none', etiqueta: t('icono.sinIcono') },
          ]}
          valor={res.iconoLado}
          onCambiar={(v) => poner({ icon_side: v === 'left' ? null : v })}
        />
        {res.iconoLado !== 'none' && (
          <>
            <ColorOpciones
              etiqueta={t('icono.color')}
              opciones={[
                { valor: HOY, etiqueta: t('icono.gris') },
                { valor: 'primary', etiqueta: t('colorMarca') },
                { valor: 'text', etiqueta: t('icono.colorTexto') },
              ]}
              valor={g.icon_color}
              actual={res.iconoColor}
              onCambiar={ponerUno('icon_color')}
            />
            <Grupo
              etiqueta={t('icono.tamano')}
              opciones={['16', '20', '24'].map((n) => ({ valor: n, etiqueta: `${n} px` }))}
              valor={String(res.iconoTamano)}
              onCambiar={(v) => poner({ icon_size: Number(v) })}
            />
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <TituloBloque>{t('boton.titulo')}</TituloBloque>
        <Grupo
          etiqueta={t('boton.tipo')}
          opciones={(['none', 'icon', 'text', 'icon_text'] as const).map((b) => ({ valor: b, etiqueta: t(`boton.${b}`) }))}
          valor={g.button ?? resolverApariencia(null, forma, colores).boton}
          onCambiar={(v) => poner({ button: v })}
          ayuda={d === 'celular' ? t('boton.celular') : undefined}
        />
        {res.boton !== 'none' && (
          <>
            {(g.button === 'text' || g.button === 'icon_text') && (
              <div className="flex flex-col gap-1.5">
                <EtiquetaGrupo>{t('boton.texto')}</EtiquetaGrupo>
                <Input aria-label={t('boton.texto')} value={g.button_text ?? ''} placeholder={t('boton.textoHoy')} maxLength={LARGO_TEXTO_BOTON} onChange={(e) => poner({ button_text: e.target.value.trim() === '' ? null : e.target.value })} />
              </div>
            )}
            <ColorOpciones
              etiqueta={t('boton.fondo')}
              opciones={[{ valor: HOY, etiqueta: t('boton.primario') }, { valor: 'accent', etiqueta: t('boton.acento') }]}
              valor={g.button_bg}
              hoyToken="primary"
              actual={res.botonFondo}
              onCambiar={ponerUno('button_bg')}
            />
            <ColorOpciones
              etiqueta={t('boton.iconoTexto')}
              opciones={[{ valor: HOY, etiqueta: t('boton.automatico') }, { valor: '#FFFFFF', etiqueta: t('boton.blanco') }, { valor: '#111827', etiqueta: t('boton.negro') }]}
              valor={g.button_fg === 'auto' ? undefined : g.button_fg}
              actual={res.botonColor}
              fondo={res.botonFondo}
              onCambiar={ponerUno('button_fg')}
            />
            {d === 'computador' && (
              <Grupo
                etiqueta={t('boton.posicion')}
                opciones={[
                  { valor: 'pegado', etiqueta: t('boton.pegado') },
                  { valor: 'separado', etiqueta: t('boton.separado') },
                ]}
                valor={res.botonPegado ? 'pegado' : 'separado'}
                onCambiar={(v) => poner({ button_attached: v === 'pegado' ? null : false })}
              />
            )}
            <Grupo
              etiqueta={t('boton.esquinas')}
              opciones={(['inherit', 'square', 'soft', 'rounded', 'pill'] as const).map((e) => ({ valor: e, etiqueta: e === 'inherit' ? t('boton.comoBarra') : t(`esquinas.${e}`) }))}
              valor={g.button_radius ?? 'inherit'}
              onCambiar={(v) => poner({ button_radius: v === 'inherit' ? null : v })}
            />
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <TituloBloque>{t('categorias.titulo')}</TituloBloque>
        <Ayuda>{t('categorias.ayuda')}</Ayuda>
        <FilaInterruptor
          titulo={t('categorias.mostrar')}
          ayuda={t('categorias.mostrarAyuda')}
          valor={res.categorias}
          onCambiar={(v) => poner({ categories: v === (forma === 'mega') ? null : v ? 'show' : 'hide' })}
        />
        {res.categorias && (
          <>
            <Grupo
              etiqueta={t('categorias.estilo')}
              opciones={[
                { valor: 'plain', etiqueta: t('categorias.simple') },
                { valor: 'boxed', etiqueta: t('categorias.enCaja') },
              ]}
              valor={res.categoriasEstilo}
              onCambiar={(v) => poner({ categories_style: v === 'plain' ? null : v })}
            />
            <FilaInterruptor titulo={t('categorias.separador')} valor={res.categoriasSeparador} onCambiar={(v) => poner({ categories_divider: v ? null : false })} />
            <div className="flex flex-col gap-1.5">
              <EtiquetaGrupo>{t('categorias.texto')}</EtiquetaGrupo>
              <Input aria-label={t('categorias.texto')} value={g.categories_text ?? ''} placeholder={t('categorias.textoHoy')} maxLength={LARGO_TEXTO_CATEGORIAS} onChange={(e) => poner({ categories_text: e.target.value.trim() === '' ? null : e.target.value })} />
              <Ayuda>{t('categorias.celular')}</Ayuda>
            </div>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <TituloBloque>{t('anillo.titulo')}</TituloBloque>
        <p className="rounded-md border border-line-info bg-info-subtle px-3 py-2 text-[12px] leading-4 text-info-text">{t('anillo.nota')}</p>
        <ColorOpciones
          etiqueta={t('anillo.color')}
          opciones={[{ valor: HOY, etiqueta: t('anillo.hoy') }]}
          valor={g.focus_ring_color}
          actual={coloresTema.acento}
          onCambiar={ponerUno('focus_ring_color')}
        />
      </section>

      <section className="flex flex-col gap-3">
        <TituloBloque>{t('desplegable.titulo')}</TituloBloque>
        <Grupo
          etiqueta={t('desplegable.esquinas')}
          opciones={(['square', 'soft', 'rounded'] as const).map((e) => ({ valor: e, etiqueta: e === 'rounded' ? t('hoyValor', { valor: t('esquinas.rounded') }) : t(`esquinas.${e}`) }))}
          valor={g.dropdown_radius ?? 'rounded'}
          onCambiar={(v) => poner({ dropdown_radius: v === 'rounded' ? null : v })}
        />
        <Grupo
          etiqueta={t('desplegable.sombra')}
          opciones={(['sm', 'md', 'lg'] as const).map((s) => ({ valor: s, etiqueta: s === 'lg' ? t('hoyValor', { valor: t('sombra.lg') }) : t(`sombra.${s}`) }))}
          valor={g.dropdown_shadow ?? 'lg'}
          onCambiar={(v) => poner({ dropdown_shadow: v === 'lg' ? null : v })}
        />
        <FilaInterruptor titulo={t('desplegable.imagenes')} valor={res.desplegableImagenes} onCambiar={(v) => poner({ dropdown_images: v ? null : false })} />
        <FilaInterruptor titulo={t('desplegable.precios')} valor={res.desplegablePrecios} onCambiar={(v) => poner({ dropdown_prices: v ? null : false })} />
        <Ayuda>{t('desplegable.populares')}</Ayuda>
      </section>

      <section className="flex flex-col gap-2 border-t border-line pt-4">
        <button type="button" className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'w-full gap-1.5')} onClick={() => setConfirmar({ tipo: 'restablecer' })}>
          <RotateCcw aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('restablecer.boton')}
        </button>
        <Ayuda>{t('restablecer.ayuda')}</Ayuda>
      </section>

      <ConfirmDialog
        abierto={confirmar !== null}
        onAbiertoChange={(v) => { if (!v) setConfirmar(null); }}
        tono="advertencia"
        titulo={confirmar?.tipo === 'plantilla' ? t('plantillas.confirmarTitulo') : t('restablecer.titulo')}
        descripcion={confirmar?.tipo === 'plantilla' ? t('plantillas.confirmarTexto', { plantilla: t(`plantillas.${confirmar.id}`) }) : t('restablecer.texto')}
        textoConfirmar={confirmar?.tipo === 'plantilla' ? t('plantillas.confirmarBoton') : t('restablecer.confirmar')}
        textoCancelar={t('cancelar')}
        onConfirmar={() => {
          if (confirmar?.tipo === 'plantilla') cambiar(cambioPlantilla(d, confirmar.id));
          else if (confirmar?.tipo === 'restablecer') cambiar(cambioRestablecerApariencia());
          setConfirmar(null);
        }}
      />
    </div>
  );
}
