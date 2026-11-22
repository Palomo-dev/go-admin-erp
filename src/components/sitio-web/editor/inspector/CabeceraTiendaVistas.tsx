'use client';

/**
 * Vistas «Encabezado › Íconos», «Encabezado › Selector de moneda» y «Encabezado › Carrito»
 * (Figma «16 Sitio web» 2754:59674, 2757:60344 y 2754:60110, aprobadas el 2026-11-22).
 *
 * Se abren desde el panel Encabezado (filas «Abrir …») y reemplazan las pestañas mientras están
 * abiertas, como la vista del botón principal. No guardan: cada cambio va a `cambiar` (el
 * `cambiarAjustes` del editor) y el lienzo lo pinta en vivo (`goadmin:settings`).
 * Lectura y defaults: `@/lib/website/v2/cabeceraTienda` (la misma que usa la tienda).
 */
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ChevronRight, GripVertical, Globe, Heart, Plus, Repeat, ShoppingCart, Trash2, Type, User } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { clasesBoton, SegmentedControl } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase/config';
import { resolveOrgCurrency } from '@/lib/services/monedaOrganizacion';
import {
  CARRITO_HOY,
  CONTADORES_CARRITO,
  ESTILOS_MONEDA,
  LARGO_TEXTO_BOTON_CARRITO,
  MAX_TEXTOS_BOTON_CARRITO,
  MONEDA_AL_ENTRAR,
  MONEDA_MOVIL,
  TAMANOS_ICONOS,
  TEXTO_BOTON_CARRITO_FIJO,
  TEXTOS_ICONOS_POR_DEFECTO,
  TRAZOS_ICONOS,
  datosMoneda,
  estiloConTexto,
  opcionesCarrito,
  opcionesIconos,
  opcionesMoneda,
  textosBotonLimpios,
  type BotonCarrito,
  type EstiloIconos,
  type EstiloMoneda,
} from '@/lib/website/v2/cabeceraTienda';
import { EtiquetaGrupo, FilaInterruptor, InsigniaNuevo, TarjetaComposicion, TituloBloque } from './PartesZonaGlobal';
import {
  cambioBotonCarrito,
  cambioCarrito,
  cambioEstiloIconos,
  cambioIconos,
  cambioMoneda,
  cambioMonedaVisible,
  cambioTextoIcono,
  moverTexto,
} from './cabeceraTiendaLogica';

type Ajustes = Record<string, unknown>;
type Cambiar = (c: Ajustes) => void;

export type VistaCabeceraTienda = 'iconos' | 'moneda' | 'carrito';

/** Textos de estas vistas: `sitioWeb.editor.cabeceraTienda.*` (es/en/fr/pt). */
function useT() {
  return useTranslations('sitioWeb.editor.cabeceraTienda');
}

const Ayuda = ({ children }: { children: ReactNode }) => <p className="text-[11px] leading-[14px] text-fg-muted">{children}</p>;

/** Cabecera de la vista: flecha para volver, título «Encabezado › …» y «Global · …». */
export function CabeceraVistaTienda({ vista, onVolver }: { vista: VistaCabeceraTienda; onVolver: () => void }) {
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
        <h2 className="text-base font-semibold leading-[22px] text-fg">{t(`${vista}.titulo`)}</h2>
        <p className="text-xs font-medium leading-4 text-fg-secondary">{t(`${vista}.migas`)}</p>
      </div>
    </div>
  );
}

/** Fila que abre una de las vistas (desde Contenido o Estilo del panel Encabezado). */
export function FilaAbrirVistaTienda({ vista, onAbrir }: { vista: VistaCabeceraTienda; onAbrir: (v: VistaCabeceraTienda) => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => onAbrir(vista)}
      className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-[13px] font-medium leading-[18px] text-fg">
          {t(`${vista}.abrir`)}
          <InsigniaNuevo />
        </span>
        <span className="text-[11px] leading-[14px] text-fg-muted">{t(`${vista}.abrirAyuda`)}</span>
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
    </button>
  );
}

/** Segmentado con «ninguno elegido» (= como hoy): el valor vacío no marca ninguna opción. */
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

function BotonComoHoy({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <button type="button" onClick={onClick} className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'self-start')}>
      {t('comoHoy')}
    </button>
  );
}

/** Campo de texto con etiqueta; el vacío guarda `null` (= el texto por defecto). */
function CampoTextoVista({ etiqueta, valor, placeholder, ayuda, max, onCambiar }: { etiqueta: string; valor: string; placeholder?: string; ayuda?: string; max: number; onCambiar: (v: string | null) => void }) {
  const id = useId();
  // Borrador local: lo guardado puede volver recortado (espacios al final) y no debe comerse lo
  // que se está escribiendo. Si cambia desde otro lado (deshacer, restablecer), manda lo guardado.
  const [borrador, setBorrador] = useState(valor);
  useEffect(() => {
    setBorrador((b) => (b.trim() === valor.trim() ? b : valor));
  }, [valor]);
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

const leer = (a: Ajustes, clave: string, campo: string): unknown => {
  const o = a[clave];
  return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>)[campo] : undefined;
};
const textoGuardado = (v: unknown) => (typeof v === 'string' ? v : '');

// ─── Miniaturas de los estilos ────────────────────────────────────────────────────────────────

function MiniaturaIcono({ estilo }: { estilo: EstiloIconos }) {
  const t = useT();
  const icono = <ShoppingCart aria-hidden="true" className="size-3.5" strokeWidth={2} />;
  const insignia = <span className="absolute -right-1.5 -top-1.5 flex size-3.5 items-center justify-center rounded-full bg-brand-action text-[8px] font-bold text-white">3</span>;
  const texto = t('iconos.miniTexto');
  let cuerpo: ReactNode;
  if (estilo === 'texto') {
    cuerpo = (
      <span className="relative flex flex-col items-center gap-0.5 text-white">
        <span className="relative">{icono}{insignia}</span>
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
    cuerpo = <span className="relative flex size-7 items-center justify-center rounded-full bg-brand-action text-white">{icono}{insignia}</span>;
  } else {
    cuerpo = <span className="relative text-white">{icono}{insignia}</span>;
  }
  return <span className="absolute inset-0 flex items-center justify-center bg-[#0B1B46]">{cuerpo}</span>;
}

function MiniaturaMoneda({ estilo }: { estilo: EstiloMoneda }) {
  let cuerpo: ReactNode;
  if (estilo === 'icono') cuerpo = <Globe aria-hidden="true" className="size-4 text-white" strokeWidth={2} />;
  else if (estilo === 'segmento')
    cuerpo = (
      <span className="flex items-center rounded-full bg-white/15 p-0.5 text-[9px] font-semibold text-white">
        <span className="rounded-full bg-white px-1.5 py-0.5 text-[#0B1B46]">COP</span>
        <span className="px-1.5">USD</span>
      </span>
    );
  else
    cuerpo = (
      <span className={cn('flex items-center gap-1 text-[10px] font-semibold text-white', estilo === 'bandera' && 'rounded-full border border-white/60 px-1.5 py-0.5')}>
        {estilo === 'bandera' && <span aria-hidden="true" className="h-2 w-3 rounded-[1px] bg-gradient-to-b from-yellow-400 via-blue-600 to-red-600" />}
        {estilo === 'simbolo' && <span className="flex size-3.5 items-center justify-center rounded-full bg-brand-action text-[8px]">$</span>}
        COP
      </span>
    );
  return <span className="absolute inset-0 flex items-center justify-center bg-[#0B1B46]">{cuerpo}</span>;
}

// ─── Íconos ───────────────────────────────────────────────────────────────────────────────────

const ESTILOS_EDITOR: readonly EstiloIconos[] = ['icono', 'texto', 'pildora', 'relleno', 'circulo'];

function TarjetaIcono({ icono, titulo, visible, onVisible, children }: { icono: ReactNode; titulo: string; visible: boolean; onVisible: (v: boolean) => void; children?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="text-fg">{icono}</span>
        <label htmlFor={id} className="min-w-0 flex-1 text-[13px] font-medium leading-[18px] text-fg">
          {titulo}
        </label>
        <Switch id={id} checked={visible} onCheckedChange={onVisible} className="shrink-0" />
      </div>
      {visible && children}
    </div>
  );
}

export function VistaIconos({ ajustes: a, cambiar, onAbrir }: { ajustes: Ajustes; cambiar: Cambiar; onAbrir: (v: VistaCabeceraTienda) => void }) {
  const t = useT();
  const op = opcionesIconos(a);
  const estiloVista: EstiloIconos = op.estilo === 'texto_lado' ? 'texto' : op.estilo;
  const conTexto = estiloConTexto(op.estilo);
  const textoDe = (k: 'cuenta' | 'carrito' | 'favoritos') => textoGuardado((leer(a, 'header_iconos', 'textos') as Record<string, unknown> | undefined)?.[k]);
  const glifo = a.header_cart_glyph === 'bolsa' || a.header_cart_glyph === 'carrito' ? (a.header_cart_glyph as string) : null;
  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold leading-[18px] text-fg">
            {t('iconos.estilo')}
            <InsigniaNuevo />
          </h3>
          <Ayuda>{t('iconos.estiloAyuda')}</Ayuda>
        </div>
        <div role="radiogroup" aria-label={t('iconos.estilo')} className="grid grid-cols-3 gap-2">
          {ESTILOS_EDITOR.map((e) => (
            <TarjetaComposicion key={e} etiqueta={t(`iconos.estiloOpcion.${e}`)} seleccionada={estiloVista === e} onElegir={() => cambiar(cambioEstiloIconos(a, e))}>
              <MiniaturaIcono estilo={e} />
            </TarjetaComposicion>
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

      <Segmento
        etiqueta={t('iconos.tamano')}
        opciones={TAMANOS_ICONOS.map((v) => ({ valor: v, etiqueta: v.toUpperCase() }))}
        valor={op.tamano}
        onCambiar={(v) => cambiar(cambioIconos(a, { tamano: v }))}
      />
      <Segmento
        etiqueta={t('iconos.trazo')}
        opciones={TRAZOS_ICONOS.map((v) => ({ valor: v, etiqueta: t(`iconos.trazoOpcion.${v}`) }))}
        valor={op.trazo}
        onCambiar={(v) => cambiar(cambioIconos(a, { trazo: v }))}
      />
      {(op.tamano || op.trazo) && <BotonComoHoy onClick={() => cambiar(cambioIconos(a, { tamano: null, trazo: null }))} />}
      <FilaInterruptor
        titulo={t('iconos.mostrarTexto')}
        ayuda={conTexto ? t('iconos.mostrarTextoAyuda') : t('iconos.mostrarTextoSinTexto')}
        valor={op.mostrarTexto}
        deshabilitado={!conTexto}
        onCambiar={(v) => cambiar(cambioIconos(a, { mostrarTexto: v ? null : false }))}
      />

      <section className="flex flex-col gap-3 border-t border-line pt-3">
        <div className="flex flex-col gap-1">
          <TituloBloque>{t('iconos.cuales')}</TituloBloque>
          <Ayuda>{t('iconos.cualesAyuda')}</Ayuda>
        </div>
        <TarjetaIcono icono={<User className="size-4" strokeWidth={1.5} />} titulo={t('iconos.cuenta')} visible={a.show_header_auth !== false} onVisible={(v) => cambiar({ show_header_auth: v })}>
          {conTexto && (
            <CampoTextoVista
              etiqueta={t('iconos.texto')}
              valor={textoDe('cuenta')}
              placeholder={TEXTOS_ICONOS_POR_DEFECTO.cuenta}
              ayuda={t('iconos.porDefecto', { texto: TEXTOS_ICONOS_POR_DEFECTO.cuenta })}
              max={24}
              onCambiar={(v) => cambiar(cambioTextoIcono(a, 'cuenta', v ?? ''))}
            />
          )}
        </TarjetaIcono>
        <TarjetaIcono icono={<ShoppingCart className="size-4" strokeWidth={1.5} />} titulo={t('iconos.carrito')} visible={a.show_header_cart !== false} onVisible={(v) => cambiar({ show_header_cart: v })}>
          {conTexto && (
            <CampoTextoVista
              etiqueta={t('iconos.texto')}
              valor={textoDe('carrito')}
              placeholder={TEXTOS_ICONOS_POR_DEFECTO.carrito}
              ayuda={t('iconos.porDefecto', { texto: TEXTOS_ICONOS_POR_DEFECTO.carrito })}
              max={24}
              onCambiar={(v) => cambiar(cambioTextoIcono(a, 'carrito', v ?? ''))}
            />
          )}
          <Segmento
            etiqueta={t('iconos.contador')}
            opciones={CONTADORES_CARRITO.map((v) => ({ valor: v, etiqueta: t(`iconos.contadorOpcion.${v}`) }))}
            valor={op.contador}
            onCambiar={(v) => cambiar(cambioIconos(a, { contador: v === 'numero' ? null : v }))}
          />
          <Segmento
            etiqueta={t('iconos.glifo')}
            opciones={[
              { valor: 'carrito', etiqueta: t('iconos.glifoOpcion.carrito') },
              { valor: 'bolsa', etiqueta: t('iconos.glifoOpcion.bolsa') },
            ]}
            valor={glifo}
            onCambiar={(v) => cambiar({ header_cart_glyph: v })}
          />
        </TarjetaIcono>
        <TarjetaIcono icono={<Heart className="size-4" strokeWidth={1.5} />} titulo={t('iconos.favoritos')} visible={op.favoritos} onVisible={(v) => cambiar(cambioIconos(a, { favoritos: v ? true : null }))}>
          <Ayuda>{t('iconos.favoritosAyuda')}</Ayuda>
          {conTexto && (
            <CampoTextoVista
              etiqueta={t('iconos.texto')}
              valor={textoDe('favoritos')}
              placeholder={TEXTOS_ICONOS_POR_DEFECTO.favoritos}
              ayuda={t('iconos.porDefecto', { texto: TEXTOS_ICONOS_POR_DEFECTO.favoritos })}
              max={24}
              onCambiar={(v) => cambiar(cambioTextoIcono(a, 'favoritos', v ?? ''))}
            />
          )}
        </TarjetaIcono>
        <TarjetaIcono icono={<Globe className="size-4" strokeWidth={1.5} />} titulo={t('iconos.moneda')} visible={a.header_show_currency !== false} onVisible={(v) => cambiar({ header_show_currency: v })}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] text-fg-secondary">{t('iconos.monedaEstilo')}</span>
            <button type="button" onClick={() => onAbrir('moneda')} className="text-[13px] font-medium text-brand-deep hover:underline">
              {t('iconos.monedaVer')}
            </button>
          </div>
        </TarjetaIcono>
      </section>
    </>
  );
}

// ─── Selector de moneda ─────────────────────────────────────────────────────────────────────

interface MonedaDisponible {
  code: string;
  nombre: string;
}

/**
 * Monedas que ofrece la tienda (las mismas de `/api/currency` allá: la moneda de cada país activo)
 * y la base de la organización (Finanzas › Monedas). Sin red, el catálogo del contrato.
 */
function useMonedasTienda(organizationId: number | null | undefined): { lista: MonedaDisponible[]; base: string } {
  // Base vacía hasta que se resuelve: la moneda sale de la organización, nunca cableada.
  const [estado, setEstado] = useState<{ lista: MonedaDisponible[]; base: string }>({ lista: [], base: '' });
  useEffect(() => {
    let vivo = true;
    (async () => {
      const [paises, base] = await Promise.all([
        supabase.from('countries').select('default_currency_code').eq('is_active', true),
        organizationId ? resolveOrgCurrency(supabase, organizationId).then((m) => m.code) : Promise.resolve(''),
      ]);
      if (!vivo) return;
      const codigos = Array.from(
        new Set(((paises.data ?? []) as { default_currency_code: string | null }[]).map((p) => (p.default_currency_code ?? '').trim().toUpperCase()).filter(Boolean)),
      );
      const baseCodigo = (base || '').trim().toUpperCase();
      if (baseCodigo && !codigos.includes(baseCodigo)) codigos.push(baseCodigo);
      setEstado({ lista: codigos.map((c) => ({ code: c, nombre: datosMoneda(c).nombre })), base: baseCodigo });
    })().catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [organizationId]);
  return estado;
}

export function VistaMoneda({ ajustes: a, cambiar, organizationId }: { ajustes: Ajustes; cambiar: Cambiar; organizationId?: number | null }) {
  const t = useT();
  const op = opcionesMoneda(a);
  const { lista, base } = useMonedasTienda(organizationId);
  const ordenadas = useMemo(() => [...lista].sort((x, y) => (x.code === base ? -1 : y.code === base ? 1 : x.code.localeCompare(y.code))), [lista, base]);
  const idEntrar = useId();
  const visible = (c: string) => c === base || !op.visibles || op.visibles.includes(c);
  return (
    <>
      <section className="flex flex-col gap-3">
        <TituloBloque>{t('moneda.selector')}</TituloBloque>
        <FilaInterruptor titulo={t('moneda.mostrar')} ayuda={t('moneda.mostrarAyuda')} valor={a.header_show_currency !== false} onCambiar={(v) => cambiar({ header_show_currency: v })} />
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-3">
        <div className="flex flex-col gap-1">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold leading-[18px] text-fg">
            {t('moneda.estilo')}
            <InsigniaNuevo />
          </h3>
          <Ayuda>{t('moneda.estiloAyuda')}</Ayuda>
        </div>
        <div role="radiogroup" aria-label={t('moneda.estilo')} className="grid grid-cols-3 gap-2">
          {ESTILOS_MONEDA.map((e) => (
            <TarjetaComposicion key={e} etiqueta={t(`moneda.estiloOpcion.${e}`)} seleccionada={op.estilo === e} onElegir={() => cambiar(cambioMoneda(a, { estilo: e }))}>
              <MiniaturaMoneda estilo={e} />
            </TarjetaComposicion>
          ))}
        </div>
        {op.estilo && <BotonComoHoy onClick={() => cambiar(cambioMoneda(a, { estilo: null }))} />}
        <FilaInterruptor titulo={t('moneda.flecha')} valor={op.flecha} onCambiar={(v) => cambiar(cambioMoneda(a, { flecha: v ? null : false }))} />
      </section>

      <section className="flex flex-col gap-2 border-t border-line pt-3">
        <div className="flex flex-col gap-1">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold leading-[18px] text-fg">
            {t('moneda.visibles')}
            <InsigniaNuevo />
          </h3>
          <Ayuda>{t('moneda.visiblesAyuda')}</Ayuda>
        </div>
        <ul className="flex flex-col gap-2">
          {ordenadas.map((m) => (
            <li key={m.code} className="flex items-center gap-2">
              <Checkbox
                id={`moneda-${m.code}`}
                checked={visible(m.code)}
                disabled={m.code === base}
                onCheckedChange={(v) => cambiar(cambioMonedaVisible(a, m.code, v === true, ordenadas.map((x) => x.code), base))}
              />
              <label htmlFor={`moneda-${m.code}`} className="text-[13px] leading-[18px] text-fg">
                {m.code} · {m.nombre}
                {m.code === base ? ` ${t('moneda.base')}` : ''}
              </label>
            </li>
          ))}
        </ul>
        <Ayuda>{t('moneda.visiblesPie')}</Ayuda>
      </section>

      <section className="flex flex-col gap-2 border-t border-line pt-3">
        <h3 id={idEntrar} className="flex items-center gap-1.5 text-[13px] font-semibold leading-[18px] text-fg">
          {t('moneda.alEntrar')}
          <InsigniaNuevo />
        </h3>
        <Select value={op.alEntrar} onValueChange={(v) => cambiar(cambioMoneda(a, { alEntrar: v === 'pais' ? null : v }))}>
          <SelectTrigger aria-labelledby={idEntrar} className="h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONEDA_AL_ENTRAR.map((v) => (
              <SelectItem key={v} value={v}>
                {t(`moneda.alEntrarOpcion.${v}`, { base })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Ayuda>{t('moneda.alEntrarAyuda', { base })}</Ayuda>
      </section>

      <section className="flex flex-col gap-2 border-t border-line pt-3">
        <div className="flex items-center gap-1.5">
          <TituloBloque>{t('moneda.celular')}</TituloBloque>
          <InsigniaNuevo />
        </div>
        <SegmentedControl
          aria-label={t('moneda.celular')}
          tamano="sm"
          opciones={MONEDA_MOVIL.map((v) => ({ valor: v, etiqueta: t(`moneda.celularOpcion.${v}`) }))}
          valor={op.movil}
          onValorChange={(v) => cambiar(cambioMoneda(a, { movil: v === 'hoja' ? null : v }))}
        />
        <Ayuda>{t(`moneda.celularAyuda.${op.movil}`)}</Ayuda>
      </section>
    </>
  );
}

// ─── Carrito ──────────────────────────────────────────────────────────────────────────────────

/** Lista editable de textos: se edita en local (espacios, filas vacías) y se guarda limpia. */
function TextosQueRotan({ textos, onCambiar }: { textos: string[]; onCambiar: (lista: string[]) => void }) {
  const t = useT();
  const [borrador, setBorrador] = useState<string[]>(textos);
  const [arrastrado, setArrastrado] = useState<number | null>(null);
  const clave = textos.join('\u0000');
  // Otro origen (deshacer, restablecer): se vuelve a lo guardado si difiere de lo que se escribe.
  useEffect(() => {
    setBorrador((b) => (textosBotonLimpios(b).join('\u0000') === clave ? b : textos));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `clave` resume `textos`
  }, [clave]);
  const fijar = (lista: string[]) => {
    setBorrador(lista);
    const limpia = textosBotonLimpios(lista);
    if (limpia.length > 0) onCambiar(limpia);
  };
  return (
    <div className="flex flex-col gap-2">
      <EtiquetaGrupo>{t('carrito.textos')}</EtiquetaGrupo>
      <ul className="flex flex-col gap-2">
        {borrador.map((texto, i) => (
          <li
            key={i}
            draggable
            onDragStart={() => setArrastrado(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (arrastrado !== null) fijar(moverTexto(borrador, arrastrado, i));
              setArrastrado(null);
            }}
            className="flex items-center gap-1.5"
          >
            <GripVertical aria-hidden="true" className="size-4 shrink-0 cursor-grab text-fg-muted" strokeWidth={1.5} />
            <Input
              aria-label={t('carrito.textoN', { n: i + 1 })}
              value={texto}
              maxLength={LARGO_TEXTO_BOTON_CARRITO}
              onChange={(e) => fijar(borrador.map((x, j) => (j === i ? e.target.value : x)))}
              className="h-9 min-w-0 flex-1"
            />
            <button
              type="button"
              aria-label={t('carrito.quitarTexto', { n: i + 1 })}
              disabled={borrador.length <= 1}
              onClick={() => fijar(borrador.filter((_, j) => j !== i))}
              className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'w-8 shrink-0 px-0')}
            >
              <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={borrador.length >= MAX_TEXTOS_BOTON_CARRITO}
        onClick={() => setBorrador([...borrador, ''])}
        className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'self-start')}
      >
        <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('carrito.agregarTexto')}
      </button>
      <Ayuda>{t('carrito.textosAyuda', { max: MAX_TEXTOS_BOTON_CARRITO, largo: LARGO_TEXTO_BOTON_CARRITO })}</Ayuda>
    </div>
  );
}

function TarjetaModo({ activo, icono, titulo, ayuda, onElegir }: { activo: boolean; icono: ReactNode; titulo: string; ayuda: string; onElegir: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={activo}
      onClick={onElegir}
      className={cn(
        'flex flex-col gap-0.5 rounded-lg p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        activo ? 'border-2 border-brand-action bg-brand-tint' : 'border border-line bg-surface hover:bg-hover',
      )}
    >
      <span className={cn('flex items-center gap-1.5 text-[13px] font-medium', activo ? 'text-brand-deep' : 'text-fg')}>
        {icono}
        {titulo}
      </span>
      <span className="text-[11px] leading-[14px] text-fg-muted">{ayuda}</span>
    </button>
  );
}

export function VistaCarrito({ ajustes: a, cambiar, enBorrador }: { ajustes: Ajustes; cambiar: Cambiar; enBorrador: boolean }) {
  const t = useT();
  const op = opcionesCarrito(a);
  const boton = op.boton;
  const guardarBoton = (b: BotonCarrito) => cambiar(cambioBotonCarrito(a, b, enBorrador));
  const crudo = (campo: string) => leer(a, 'header_carrito', campo);
  const enlace = (crudo('enlace') ?? {}) as Record<string, unknown>;
  const envio = (crudo('envioGratis') ?? {}) as Record<string, unknown>;
  const parte = (campo: string, valor: Record<string, unknown>) => cambiar(cambioCarrito(a, { [campo]: { ...((crudo(campo) as Record<string, unknown>) ?? {}), ...valor } }));
  const sinBorrador = !enBorrador;
  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold leading-[18px] text-fg">
            {t('carrito.boton')}
            <InsigniaNuevo />
          </h3>
          <Ayuda>{t('carrito.botonAyuda')}</Ayuda>
        </div>
        <div role="radiogroup" aria-label={t('carrito.boton')} className="grid grid-cols-2 gap-2">
          <TarjetaModo
            activo={boton.modo === 'al_abrir'}
            icono={<Repeat aria-hidden="true" className="size-4" strokeWidth={1.5} />}
            titulo={t('carrito.modo.al_abrir')}
            ayuda={t('carrito.modoAyuda.al_abrir')}
            onElegir={() => guardarBoton({ ...boton, modo: 'al_abrir', orden: boton.orden ?? 'azar' })}
          />
          <TarjetaModo
            activo={boton.modo === 'fijo'}
            icono={<Type aria-hidden="true" className="size-4" strokeWidth={1.5} />}
            titulo={t('carrito.modo.fijo')}
            ayuda={t('carrito.modoAyuda.fijo')}
            onElegir={() => guardarBoton({ ...boton, modo: 'fijo' })}
          />
        </div>
        {boton.modo === 'al_abrir' ? (
          <>
            <TextosQueRotan textos={boton.textos} onCambiar={(textos) => guardarBoton({ ...boton, textos })} />
            <div className="flex flex-col gap-1.5">
              <EtiquetaGrupo>{t('carrito.cuando')}</EtiquetaGrupo>
              <p className="rounded-md border border-line bg-subtle px-3 py-2 text-[13px] text-fg">{t('carrito.cuandoAlAbrir')}</p>
            </div>
          </>
        ) : (
          <CampoTextoVista
            etiqueta={t('carrito.textoFijo')}
            valor={textoGuardado((crudo('boton') as Record<string, unknown> | undefined)?.texto) || (sinBorrador ? boton.textos[0] ?? '' : '')}
            placeholder={boton.textos[0] || TEXTO_BOTON_CARRITO_FIJO}
            ayuda={t('carrito.textoFijoAyuda', { texto: boton.textos[0] || TEXTO_BOTON_CARRITO_FIJO })}
            max={LARGO_TEXTO_BOTON_CARRITO}
            onCambiar={(v) => guardarBoton({ ...boton, texto: v ?? undefined })}
          />
        )}
        {sinBorrador && <Ayuda>{t('carrito.sinBorrador')}</Ayuda>}
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-3">
        <TituloBloque>{t('carrito.enlace')}</TituloBloque>
        <FilaInterruptor titulo={t('carrito.enlaceMostrar')} valor={op.enlace.mostrar} onCambiar={(v) => parte('enlace', { mostrar: v ? null : false })} />
        {op.enlace.mostrar && (
          <>
            <CampoTextoVista
              etiqueta={t('carrito.enlaceTexto')}
              valor={textoGuardado(enlace.texto)}
              placeholder={CARRITO_HOY.enlace.texto}
              ayuda={t('carrito.enlaceAyuda')}
              max={60}
              onCambiar={(v) => parte('enlace', { texto: v })}
            />
            <Segmento
              etiqueta={t('carrito.enlaceEstilo')}
              opciones={[
                { valor: 'borde', etiqueta: t('carrito.enlaceEstiloOpcion.borde') },
                { valor: 'enlace', etiqueta: t('carrito.enlaceEstiloOpcion.enlace') },
              ]}
              valor={op.enlace.estilo}
              onCambiar={(v) => parte('enlace', { estilo: v === 'borde' ? null : v })}
            />
          </>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-3">
        <div className="flex items-center gap-1.5">
          <TituloBloque>{t('carrito.envio')}</TituloBloque>
          <InsigniaNuevo />
        </div>
        <FilaInterruptor titulo={t('carrito.envioBarra')} valor={op.envioGratis.barra} onCambiar={(v) => parte('envioGratis', { barra: v ? null : false })} />
        <CampoTextoVista
          etiqueta={t('carrito.envioFalta')}
          valor={textoGuardado(envio.mensaje)}
          placeholder={CARRITO_HOY.envioGratis.mensaje}
          ayuda={t('carrito.envioFaltaAyuda')}
          max={120}
          onCambiar={(v) => parte('envioGratis', { mensaje: v })}
        />
        <CampoTextoVista
          etiqueta={t('carrito.envioLogrado')}
          valor={textoGuardado(envio.logrado)}
          placeholder={CARRITO_HOY.envioGratis.logrado}
          max={120}
          onCambiar={(v) => parte('envioGratis', { logrado: v })}
        />
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-3">
        <TituloBloque>{t('carrito.otros')}</TituloBloque>
        <CampoTextoVista
          etiqueta={t('carrito.tituloCajon')}
          valor={textoGuardado(crudo('titulo'))}
          placeholder={CARRITO_HOY.titulo}
          max={60}
          onCambiar={(v) => cambiar(cambioCarrito(a, { titulo: v }))}
        />
        <CampoTextoVista
          etiqueta={t('carrito.seguir')}
          valor={textoGuardado(crudo('seguirComprando'))}
          placeholder={CARRITO_HOY.seguirComprando}
          max={60}
          onCambiar={(v) => cambiar(cambioCarrito(a, { seguirComprando: v }))}
        />
        {sinBorrador && <Ayuda>{t('carrito.textosSoloBorrador')}</Ayuda>}
      </section>
    </>
  );
}

