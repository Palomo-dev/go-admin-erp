'use client';

/**
 * Panel «Encabezado» del editor del sitio (Figma 2058:40377 y 2064:102, aprobados el 2026-10-06):
 * pestañas Contenido / Diseño / Estilo como las demás secciones, y cada opción del contrato
 * (`OPCIONES_SHELL`) editable. Lo de la plantilla es solo el valor por defecto.
 *
 * No guarda: cada cambio va a `onCambiar` (el `cambiarAjustes` del editor), que en V2 lo escribe
 * en `shell.header` del borrador y en legacy en la fila de `website_settings`; el lienzo lo pinta
 * en vivo por el PreviewBridge (`goadmin:settings`).
 */
import { useId, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { CampoNumero, ChipsOpcion, TabBar, clasesBoton, idPanel, idPestana } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DispositivoVista } from '@/components/sitio-web/ui/dispositivos';
import type { ShellPorDefecto } from '@/lib/website/v2/plantillaCompleta';
import { buscadorPropioCelular, cambioBuscador, cambioCirculoAcento, cambioQuitarTodos, circuloAcentoActivo, entradasAnterioresEncabezado, type EntradaAnterior } from './anterioresLogica';
import { useTextosEditor } from '../textos';
import {
  BandaGlobal,
  CabeceraZona,
  ColorTema,
  EtiquetaGrupo,
  FilaInterruptor,
  MiniaturaEncabezado,
  TarjetaComposicion,
  TarjetaPlantilla,
  TituloBloque,
} from './PartesZonaGlobal';
import { textoSobreAcento } from '@/lib/website/v2/tokensEstilo';
import { estiloDeHeaderLayout } from '@/lib/website/v2/mapeoAjustes';
import {
  DESTINO_PROPIO,
  cambiosRestablecer,
  escribirAnuncios,
  esDestinoDeLista,
  leerAnuncios,
  opcionBooleana,
  opcionesDestino,
  valorOpcion,
} from './zonaGlobalLogica';

/** Figma 2058:40377 / 2064:102: tres pestañas. 'celular' y 'constructor' quedan como alias de Diseño (enlaces viejos). */
export type PestanaZona = 'contenido' | 'diseno' | 'estilo' | 'celular' | 'constructor';

export interface MenuDisponible {
  id: string;
  name: string;
  enlaces?: number;
}

export interface InspectorEncabezadoProps {
  /** Ajustes en vivo (documento V2 visto como columnas, o la fila legacy). */
  ajustes: Record<string, unknown>;
  onCambiar: (cambios: Record<string, unknown>) => void;
  menus: readonly MenuDisponible[];
  paginas: readonly { slug: string; titulo: string }[];
  porDefecto: ShellPorDefecto;
  enBorrador: boolean;
  dispositivo: DispositivoVista;
  coloresTema: { fondo: string; texto: string; acento: string };
  onEditarMenu: () => void;
  onCerrar: () => void;
  pestanaInicial?: PestanaZona;
}

const COMPOSICIONES = ['default', 'centered', 'split', 'minimal', 'mega'] as const;
const SIN_MENU = '__ninguno';

export function InspectorEncabezado(p: InspectorEncabezadoProps) {
  const t = useTextosEditor();
  const [pestana, setPestana] = useState<PestanaZona>(p.pestanaInicial === 'celular' || p.pestanaInicial === 'constructor' ? 'diseno' : p.pestanaInicial ?? 'diseno');
  const a = p.ajustes;
  const titulo = t('zonaGlobal.titulo.header');
  const idTabs = 'inspector-encabezado';
  const cambiar = (c: Record<string, unknown>) => p.onCambiar(c);
  const texto = (k: string) => (typeof a[k] === 'string' ? (a[k] as string) : '');

  return (
    <aside aria-label={t('inspector.etiqueta', { nombre: titulo })} className="flex h-full min-h-0 w-full flex-col bg-surface text-fg">
      <CabeceraZona titulo={titulo} onRestablecer={() => cambiar(cambiosRestablecer('header', p.porDefecto.header))} onCerrar={p.onCerrar} />
      <TabBar
        id={idTabs}
        etiqueta={t('zonaGlobal.pestanas', { zona: titulo.toLowerCase() })}
        pestanas={[
          { valor: 'contenido', etiqueta: t('zonaGlobal.pestana.contenido') },
          { valor: 'diseno', etiqueta: t('zonaGlobal.pestana.diseno') },
          { valor: 'estilo', etiqueta: t('zonaGlobal.pestana.estilo') },
        ]}
        valor={pestana}
        onValorChange={setPestana}
        className="mt-2 px-2"
      />
      <div role="tabpanel" id={idPanel(idTabs, pestana)} aria-labelledby={idPestana(idTabs, pestana)} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
        <BandaGlobal />
        {pestana === 'contenido' && <Contenido {...p} cambiar={cambiar} texto={texto} />}
        {pestana === 'diseno' && (
          <>
            <TarjetaPlantilla nombre={p.porDefecto.nombre} enBorrador={p.enBorrador} />
            <Diseno {...p} cambiar={cambiar} />
          </>
        )}
        {pestana === 'estilo' && <Estilo {...p} cambiar={cambiar} />}
      </div>
    </aside>
  );
}

type Interno = InspectorEncabezadoProps & { cambiar: (c: Record<string, unknown>) => void };

// ─── Menú (en Contenido y en Diseño, como en Figma) ───────────────────────────────────────────

function SelectorMenu({ ajustes, menus, cambiar, onEditarMenu, etiqueta, comoTitulo }: Interno & { etiqueta: string; comoTitulo?: boolean }) {
  const t = useTextosEditor();
  const id = useId();
  const actual = typeof ajustes.header_menu_id === 'string' ? ajustes.header_menu_id : null;
  return (
    <div className="flex flex-col gap-2">
      {comoTitulo ? (
        <h3 id={id} className="text-[13px] font-semibold leading-[18px] text-fg">
          {etiqueta}
        </h3>
      ) : (
        <EtiquetaGrupo id={id}>{etiqueta}</EtiquetaGrupo>
      )}
      <div className="flex items-center gap-2">
        <Select value={actual ?? SIN_MENU} onValueChange={(v) => cambiar({ header_menu_id: v === SIN_MENU ? null : v })}>
          <SelectTrigger aria-labelledby={id} className="h-10 min-w-0 flex-1">
            <SelectValue placeholder={t('zonaGlobal.menu.elegir')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SIN_MENU}>{t('zonaGlobal.menu.sinMenu')}</SelectItem>
            {menus.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.enlaces !== undefined ? t('zonaGlobal.menu.enlaces', { menu: m.name, n: m.enlaces }) : m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button type="button" onClick={onEditarMenu} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
          {t('zonaGlobal.menu.editar')}
        </button>
      </div>
    </div>
  );
}

// ─── Contenido ─────────────────────────────────────────────────────────────────────────────────

function CampoBoton({
  etiquetaTexto,
  claveTexto,
  claveUrl,
  ajustes,
  cambiar,
  paginas,
}: Pick<Interno, 'ajustes' | 'cambiar' | 'paginas'> & { etiquetaTexto: string; claveTexto: string; claveUrl: string }) {
  const t = useTextosEditor();
  const opciones = useMemo(
    () =>
      opcionesDestino(paginas, {
        pagina: (titulo) => t('zonaGlobal.boton.pagina', { titulo }),
        whatsapp: t('zonaGlobal.boton.whatsapp'),
        maps: t('zonaGlobal.boton.maps'),
        ruta: (valor) => t(`zonaGlobal.boton.rutas.${valor.replace(/^\//, '')}`),
      }),
    [paginas, t],
  );
  const url = typeof ajustes[claveUrl] === 'string' ? (ajustes[claveUrl] as string) : '';
  const [propio, setPropio] = useState(() => !esDestinoDeLista(url, opciones));
  const idEnlace = useId();
  const idTexto = useId();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <EtiquetaGrupo id={idTexto}>{etiquetaTexto}</EtiquetaGrupo>
        <Input
          aria-labelledby={idTexto}
          value={typeof ajustes[claveTexto] === 'string' ? (ajustes[claveTexto] as string) : ''}
          maxLength={40}
          onChange={(e) => cambiar({ [claveTexto]: e.target.value === '' ? null : e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <EtiquetaGrupo id={idEnlace}>{t('zonaGlobal.boton.enlace')}</EtiquetaGrupo>
        <Select
          value={propio ? DESTINO_PROPIO : url || undefined}
          onValueChange={(v) => {
            if (v === DESTINO_PROPIO) {
              setPropio(true);
              return;
            }
            setPropio(false);
            cambiar({ [claveUrl]: v });
          }}
        >
          <SelectTrigger aria-labelledby={idEnlace} className="h-10">
            <SelectValue placeholder={t('zonaGlobal.boton.elegirEnlace')} />
          </SelectTrigger>
          <SelectContent>
            {opciones.map((o) => (
              <SelectItem key={o.valor} value={o.valor}>
                {o.etiqueta}
              </SelectItem>
            ))}
            <SelectItem value={DESTINO_PROPIO}>{t('zonaGlobal.boton.enlacePropio')}</SelectItem>
          </SelectContent>
        </Select>
        {propio && (
          <>
            <Input aria-label={t('zonaGlobal.boton.enlacePropio')} value={url} placeholder="/reservas" onChange={(e) => cambiar({ [claveUrl]: e.target.value === '' ? null : e.target.value })} />
            <p className="text-[11px] leading-[14px] text-fg-muted">{t('zonaGlobal.boton.enlacePropioAyuda')}</p>
          </>
        )}
      </div>
    </div>
  );
}

function Contenido(p: Interno & { texto: (k: string) => string }) {
  const t = useTextosEditor();
  const a = p.ajustes;
  const cambiar = p.cambiar;
  const idBarra = useId();
  const segundo = Boolean(p.texto('header_cta2_text') || p.texto('header_cta2_url'));
  const anuncios = leerAnuncios(a.topbar_announcement);
  const [conAnuncio, setConAnuncio] = useState(anuncios.length > 0);
  const elementos = [
    opcionBooleana(a, 'topbar_show_branch_status') && 'sede',
    opcionBooleana(a, 'topbar_show_phone') && 'telefono',
    opcionBooleana(a, 'topbar_show_email') && 'correo',
    (conAnuncio || anuncios.length > 0) && 'anuncio',
    opcionBooleana(a, 'topbar_show_free_shipping') && 'envio',
    opcionBooleana(a, 'topbar_show_availability') && 'cupos',
  ].filter(Boolean) as string[];
  const claveDeElemento: Record<string, string> = {
    sede: 'topbar_show_branch_status',
    telefono: 'topbar_show_phone',
    correo: 'topbar_show_email',
    envio: 'topbar_show_free_shipping',
    cupos: 'topbar_show_availability',
  };

  return (
    <>
      <SelectorMenu {...p} comoTitulo etiqueta={t('zonaGlobal.menu.titulo')} />
      <section className="flex flex-col gap-3">
        <TituloBloque>{t('zonaGlobal.boton.principal')}</TituloBloque>
        <CampoBoton etiquetaTexto={t('zonaGlobal.boton.texto')} claveTexto="header_cta_text" claveUrl="header_cta_url" ajustes={a} cambiar={cambiar} paginas={p.paginas} />
      </section>

      <section className="flex flex-col gap-3">
        <TituloBloque>{t('zonaGlobal.boton.segundo')}</TituloBloque>
        <FilaInterruptor
          titulo={t('zonaGlobal.boton.mostrarSegundo')}
          ayuda={t('zonaGlobal.boton.segundoAyuda')}
          nuevo
          valor={segundo}
          onCambiar={(v) =>
            cambiar(v ? { header_cta2_text: p.texto('header_cta2_text') || t('zonaGlobal.pie.accion.whatsapp'), header_cta2_url: p.texto('header_cta2_url') || 'whatsapp' } : { header_cta2_text: null, header_cta2_url: null })
          }
        />
        {segundo && <CampoBoton etiquetaTexto={t('zonaGlobal.boton.texto')} claveTexto="header_cta2_text" claveUrl="header_cta2_url" ajustes={a} cambiar={cambiar} paginas={p.paginas} />}
      </section>

      <section className="flex flex-col gap-3">
        <TituloBloque>{t('zonaGlobal.barra.titulo')}</TituloBloque>
        <FilaInterruptor titulo={t('zonaGlobal.barra.mostrar')} valor={opcionBooleana(a, 'show_topbar')} onCambiar={(v) => cambiar({ show_topbar: v, mobile_show_topbar: null })} />
        {opcionBooleana(a, 'show_topbar') && (
          <>
            <span id={idBarra} className="sr-only">
              {t('zonaGlobal.barra.elementos')}
            </span>
            <ChipsOpcion
              multiple
              aria-labelledby={idBarra}
              opciones={[
                { valor: 'sede', etiqueta: t('zonaGlobal.barra.sede') },
                { valor: 'telefono', etiqueta: t('zonaGlobal.barra.telefono') },
                { valor: 'anuncio', etiqueta: t('zonaGlobal.barra.anuncio') },
                // Fuera del Figma: solo aparecen si la tienda ya los tiene prendidos, para poder apagarlos.
                ...(elementos.includes('correo') ? [{ valor: 'correo', etiqueta: t('zonaGlobal.barra.correo') }] : []),
                ...(elementos.includes('envio') ? [{ valor: 'envio', etiqueta: t('zonaGlobal.barra.envioGratis') }] : []),
                ...(elementos.includes('cupos') ? [{ valor: 'cupos', etiqueta: t('zonaGlobal.barra.cupos') }] : []),
                { valor: 'idioma', etiqueta: t('zonaGlobal.barra.idioma'), deshabilitada: true, motivo: t('zonaGlobal.barra.idiomaPendiente') },
              ]}
              valor={elementos}
              onValorChange={(lista) => {
                const cambios: Record<string, unknown> = {};
                for (const [el, col] of Object.entries(claveDeElemento)) {
                  const on = lista.includes(el);
                  if (on !== elementos.includes(el)) cambios[col] = on;
                }
                const anuncio = lista.includes('anuncio');
                if (anuncio !== elementos.includes('anuncio')) {
                  setConAnuncio(anuncio);
                  if (!anuncio) cambios.topbar_announcement = null;
                }
                if (Object.keys(cambios).length > 0) cambiar(cambios);
              }}
            />
            {opcionBooleana(a, 'topbar_show_branch_status') && (
              <p className="-mt-1 text-[11px] leading-[14px] text-fg-muted">{t('zonaGlobal.barra.sedeAyuda')}</p>
            )}
            {elementos.includes('anuncio') && <Anuncios valor={a.topbar_announcement} onCambiar={(v) => cambiar({ topbar_announcement: v })} />}
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <TituloBloque>{t('zonaGlobal.acciones.titulo')}</TituloBloque>
        <FilaInterruptor
          titulo={t('zonaGlobal.acciones.buscador')}
          ayuda={t('zonaGlobal.acciones.buscadorAyuda')}
          valor={valorOpcion(a, 'search_style') !== 'hidden'}
          onCambiar={(v) => cambiar(cambioBuscador(a, v ? 'icon' : 'hidden'))}
        />
        <FilaInterruptor titulo={t('zonaGlobal.acciones.carrito')} valor={opcionBooleana(a, 'show_header_cart')} onCambiar={(v) => cambiar({ show_header_cart: v })} />
        <FilaInterruptor
          titulo={t('zonaGlobal.acciones.cuenta')}
          ayuda={t('zonaGlobal.acciones.cuentaAyuda')}
          valor={opcionBooleana(a, 'show_header_auth')}
          onCambiar={(v) => cambiar({ show_header_auth: v })}
        />
        <FilaInterruptor
          titulo={t('zonaGlobal.acciones.moneda')}
          ayuda={t('zonaGlobal.acciones.monedaAyuda')}
          valor={opcionBooleana(a, 'header_show_currency')}
          onCambiar={(v) => cambiar({ header_show_currency: v })}
        />
        <FilaInterruptor
          titulo={t('zonaGlobal.acciones.sede')}
          ayuda={t('zonaGlobal.acciones.sedeAyuda')}
          nuevo
          valor={opcionBooleana(a, 'header_show_branch_selector')}
          onCambiar={(v) => cambiar({ header_show_branch_selector: v })}
        />
      </section>
    </>
  );
}

function Anuncios({ valor, onCambiar }: { valor: unknown; onCambiar: (v: string | null) => void }) {
  const t = useTextosEditor();
  const lista = leerAnuncios(valor);
  const filas = lista.length > 0 ? lista : [''];
  const escribir = (nueva: string[]) => onCambiar(escribirAnuncios(nueva) ?? (nueva.length > 0 ? JSON.stringify(nueva) : null));
  return (
    <div className="flex flex-col gap-2">
      <EtiquetaGrupo>{t('zonaGlobal.barra.anuncioTexto')}</EtiquetaGrupo>
      {filas.map((m, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            aria-label={t('zonaGlobal.barra.anuncioMensaje', { n: i + 1 })}
            value={m}
            maxLength={120}
            placeholder={t('movil.avisoPlaceholder')}
            onChange={(e) => {
              const nueva = [...filas];
              nueva[i] = e.target.value;
              escribir(nueva);
            }}
          />
          {filas.length > 1 && (
            <button
              type="button"
              aria-label={t('zonaGlobal.barra.anuncioQuitar', { n: i + 1 })}
              onClick={() => escribir(filas.filter((_, j) => j !== i))}
              className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'w-8 shrink-0 px-0')}
            >
              <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] leading-[14px] text-fg-muted">{t('zonaGlobal.barra.anuncioAyuda')}</p>
        <button type="button" onClick={() => escribir([...filas, ''])} className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'shrink-0')}>
          <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('zonaGlobal.barra.anuncioAgregar')}
        </button>
      </div>
    </div>
  );
}

// ─── Diseño ────────────────────────────────────────────────────────────────────────────────────

/**
 * Una sola opción para el lado del logo (computador y celular).
 * La composición decide la estructura; solo «Clásico» deja elegir el lado (la tienda solo lo
 * respeta ahí: HeaderClassic y FilaLogoMovil vía logoEfectivo). Al cambiar de composición se
 * escribe el lado que esa composición pinta, con valor explícito (no `null`), para que el lienzo
 * en vivo lo reciba y no se quede con el lado guardado. También se suelta `header_layout`
 * (preset de estilo) porque en la tienda manda sobre `header_style`.
 */
export function cambioComposicion(c: string): Record<string, unknown> {
  return {
    header_style: c,
    header_layout: null,
    logo_position: c === 'centered' || c === 'split' ? 'center' : 'left',
    mobile_logo_position: null,
  };
}

export function composicionConLado(c: string | undefined): boolean {
  return !c || c === 'default';
}

/** Composición que la tienda pinta: `header_layout` manda si viene (estiloDeHeaderLayout). */
export function composicionEncabezado(a: Record<string, unknown>): string | undefined {
  return estiloDeHeaderLayout(a.header_layout) ?? valorOpcion<string>(a, 'header_style');
}

/** Igual que `logoEfectivo` de la tienda. */
export function ladoLogo(a: Record<string, unknown>): string {
  const pos = a.logo_position;
  if (pos === 'left' || pos === 'center' || pos === 'right') return pos;
  const c = composicionEncabezado(a);
  return c === 'centered' || c === 'split' ? 'center' : 'left';
}

function Diseno(p: Interno) {
  const t = useTextosEditor();
  const a = p.ajustes;
  const cambiar = p.cambiar;
  const idComp = useId();
  const idLogo = useId();
  const idBc = useId();
  const idMc = useId();
  const idCol = useId();
  const composicion = composicionEncabezado(a);
  const megaId = typeof a.header_mega_menu_id === 'string' ? a.header_mega_menu_id : null;
  const mega = megaId ? p.menus.find((m) => m.id === megaId) : null;

  return (
    <>
      <div className="flex flex-col gap-3">
        <EtiquetaGrupo id={idComp}>{t('zonaGlobal.diseno.titulo')}</EtiquetaGrupo>
        <div role="radiogroup" aria-labelledby={idComp} className="grid grid-cols-2 gap-1.5">
          {COMPOSICIONES.map((c) => (
            <TarjetaComposicion
              key={c}
              etiqueta={t(`zonaGlobal.diseno.composicion.${c}`)}
              seleccionada={composicion === c}
              onElegir={() => { if (c !== composicion) cambiar(cambioComposicion(c)); }}
            >
              <MiniaturaEncabezado composicion={c} />
            </TarjetaComposicion>
          ))}
        </div>
      </div>

      {composicionConLado(composicion) ? (
        <div className="flex flex-col gap-2">
          <EtiquetaGrupo id={idLogo}>{t('zonaGlobal.diseno.logo')}</EtiquetaGrupo>
          <ChipsOpcion
            aria-labelledby={idLogo}
            opciones={[
              { valor: 'left', etiqueta: t('zonaGlobal.diseno.izquierda') },
              { valor: 'center', etiqueta: t('zonaGlobal.diseno.centro') },
              { valor: 'right', etiqueta: t('zonaGlobal.diseno.derecha') },
            ]}
            valor={ladoLogo(a)}
            onValorChange={(v) => cambiar({ logo_position: v, mobile_logo_position: null })}
          />
          <p className="text-[11px] leading-[14px] text-fg-muted">{t('zonaGlobal.diseno.logoAyuda')}</p>
        </div>
      ) : (
        <p className="text-xs leading-4 text-fg-muted">{t(`zonaGlobal.diseno.logoFijo.${composicion === 'centered' || composicion === 'split' ? 'centro' : 'izquierda'}`)}</p>
      )}
      <SelectorMenu {...p} etiqueta={t('zonaGlobal.menu.tituloDiseno')} />
      {composicion === 'mega' && (
        <>
          {mega && <p className="-mt-2 text-xs font-medium leading-4 text-fg-muted">{t('zonaGlobal.menu.megaAyuda', { menu: mega.name })}</p>}
          <div className="flex flex-col gap-2">
            <EtiquetaGrupo id={idCol}>{t('zonaGlobal.menu.columnasMega')}</EtiquetaGrupo>
            <ChipsOpcion
              aria-labelledby={idCol}
              opciones={['2', '3', '4', '5'].map((n) => ({ valor: n, etiqueta: n }))}
              valor={String(valorOpcion(a, 'mega_menu_columns') ?? 4)}
              onValorChange={(v) => cambiar({ mega_menu_columns: Number(v) })}
            />
          </div>
        </>
      )}

      <div className="flex flex-col gap-2">
        <EtiquetaGrupo id={idBc}>{t('zonaGlobal.diseno.buscador')}</EtiquetaGrupo>
        <ChipsOpcion
          aria-labelledby={idBc}
          opciones={[
            { valor: 'icon', etiqueta: t('zonaGlobal.diseno.icono') },
            { valor: 'bar', etiqueta: t('zonaGlobal.diseno.barraVisible') },
            { valor: 'hidden', etiqueta: t('zonaGlobal.diseno.oculto') },
          ]}
          valor={valorOpcion<string>(a, 'search_style') ?? 'icon'}
          onValorChange={(v) => cambiar(cambioBuscador(a, v))}
        />
        <p className="text-[11px] leading-[14px] text-fg-muted">{t('zonaGlobal.diseno.buscadorAyuda')}</p>
        {buscadorPropioCelular(a) && (
          <p role="note" className="rounded-md bg-surface-muted px-2 py-1.5 text-[11px] leading-[14px] text-fg-secondary">
            {t('zonaGlobal.diseno.buscadorCelularPropio', { valor: t(`zonaGlobal.diseno.buscadorNombre.${buscadorPropioCelular(a)}`) })}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <EtiquetaGrupo id={idMc}>{t('zonaGlobal.diseno.menuCelular')}</EtiquetaGrupo>
        <ChipsOpcion
          aria-labelledby={idMc}
          opciones={(['drawer', 'fullscreen', 'bottom_sheet', 'tabs'] as const).map((v) => ({ valor: v, etiqueta: t(`zonaGlobal.diseno.menuCelularOpcion.${v}`) }))}
          valor={valorOpcion<string>(a, 'mobile_menu_style') ?? 'drawer'}
          onValorChange={(v) => cambiar({ mobile_menu_style: v })}
        />
      </div>
    </>
  );
}

// ─── Estilo ────────────────────────────────────────────────────────────────────────────────────

function Estilo(p: Interno) {
  const t = useTextosEditor();
  const a = p.ajustes;
  const cambiar = p.cambiar;
  const color = (k: string) => (typeof a[k] === 'string' && a[k] ? (a[k] as string) : null);
  const transparente = valorOpcion(a, 'header_style') === 'transparent';
  return (
    <>
      <div className="flex flex-col gap-1.5 rounded-lg bg-subtle px-3 py-2.5">
        <p className="text-[13px] font-semibold leading-[18px] text-fg">{t('zonaGlobal.estilo.avisoTitulo')}</p>
        <p className="text-xs leading-4 text-fg-secondary">{t('zonaGlobal.estilo.avisoTexto')}</p>
      </div>
      <ColorTema etiqueta={t('zonaGlobal.estilo.fondo')} valor={color('header_bg_color')} colorTema={p.coloresTema.fondo} onCambiar={(v) => cambiar({ header_bg_color: v })} />
      <ColorTema
        etiqueta={t('zonaGlobal.estilo.textoEnlaces')}
        valor={color('header_text_color')}
        colorTema={p.coloresTema.texto}
        fondo={color('header_bg_color') ?? p.coloresTema.fondo}
        onCambiar={(v) => cambiar({ header_text_color: v })}
      />
      <ColorTema etiqueta={t('zonaGlobal.estilo.barra')} valor={color('topbar_bg_color')} colorTema={p.coloresTema.texto} onCambiar={(v) => cambiar({ topbar_bg_color: v })} />
      <ColorTema
        etiqueta={t('zonaGlobal.estilo.boton')}
        valor={color('cta_bg_color')}
        colorTema={p.coloresTema.acento}
        onCambiar={(v) => cambiar(v === null ? { cta_bg_color: null, cta_text_color: null } : { cta_bg_color: v })}
      />
      {color('cta_bg_color') && (
        <ColorTema
          etiqueta={t('zonaGlobal.estilo.botonTexto')}
          valor={color('cta_text_color')}
          colorTema={p.coloresTema.fondo}
          fondo={color('cta_bg_color') ?? undefined}
          onCambiar={(v) => cambiar({ cta_text_color: v })}
        />
      )}
      <section className="flex flex-col gap-3">
        <TituloBloque>{t('zonaGlobal.estilo.iconos')}</TituloBloque>
        <FilaInterruptor
          titulo={t('zonaGlobal.acciones.presetCirculo')}
          ayuda={t('zonaGlobal.acciones.iconosCirculoAyuda')}
          valor={circuloAcentoActivo(a)}
          onCambiar={(v) => cambiar(cambioCirculoAcento(a, v))}
        />
        {circuloAcentoActivo(a) && (() => {
          // Paquete 5-nov B1/B4: fondo del círculo (vacío = marca) y color del ícono (vacío = automático).
          const fondoCirculo = color('header_icons_circle_bg') ?? p.coloresTema.acento;
          return (
            <>
              <ColorTema
                etiqueta={t('zonaGlobal.acciones.circuloFondo')}
                etiquetaNulo={t('zonaGlobal.acciones.circuloFondoAcento')}
                valor={color('header_icons_circle_bg')}
                colorTema={p.coloresTema.acento}
                onCambiar={(v) => cambiar({ header_icons_circle_bg: v })}
              />
              <ColorTema
                etiqueta={t('zonaGlobal.acciones.circuloIcono')}
                etiquetaNulo={t('zonaGlobal.acciones.circuloIconoAuto')}
                valor={color('header_icons_circle_fg')}
                colorTema={textoSobreAcento(fondoCirculo)}
                fondo={fondoCirculo}
                onCambiar={(v) => cambiar({ header_icons_circle_fg: v })}
              />
            </>
          );
        })()}
      </section>
      <section className="flex flex-col gap-3">
        <TituloBloque>{t('zonaGlobal.estilo.transparencia')}</TituloBloque>
        <FilaInterruptor
          titulo={t('zonaGlobal.estilo.transparente')}
          ayuda={t('zonaGlobal.estilo.transparenteAyuda')}
          nuevo
          valor={transparente}
          onCambiar={(v) => cambiar({ header_style: v ? 'transparent' : p.porDefecto.header.composicion === 'transparent' ? 'default' : p.porDefecto.header.composicion })}
        />
        <FilaInterruptor
          titulo={t('zonaGlobal.estilo.fijo')}
          ayuda={t('zonaGlobal.estilo.fijoAyuda')}
          valor={opcionBooleana(a, 'header_sticky')}
          onCambiar={(v) => cambiar({ header_sticky: v })}
        />
      </section>
      <EspaciosEncabezado ajustes={a} cambiar={cambiar} />
      <FormaBoton ajustes={a} cambiar={cambiar} />
      <AjustesAnteriores ajustes={a} entradas={entradasAnterioresEncabezado(a, CLAVES_ANTERIORES_ENCABEZADO)} cambiar={cambiar} />
      <button
        type="button"
        onClick={() => cambiar(cambiosRestablecer('header', p.porDefecto.header))}
        className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'self-start')}
      >
        {t('zonaGlobal.restablecer')}
      </button>
    </>
  );
}

/** Igual que `headerSobreHero` de la tienda (lib/website/espacioHeader.ts). */
export function encabezadoSobrePortada(a: Record<string, unknown>): boolean {
  if (a.header_style === 'transparent' && a.header_transparent_over_hero !== false) return true;
  return a.header_transparent_over_hero === true;
}

/** «Espacios»: encabezado sobre la portada y espacio encima de la primera sección (PR #426). */
function EspaciosEncabezado({ ajustes: a, cambiar }: { ajustes: Record<string, unknown>; cambiar: (c: Record<string, unknown>) => void }) {
  const t = useTextosEditor();
  const id = useId();
  const transparente = a.header_style === 'transparent';
  const offset = typeof a.first_section_offset_px === 'number' ? a.first_section_offset_px : null;
  return (
    <section className="flex flex-col gap-3">
      <TituloBloque>{t('zonaGlobal.estilo.espacios')}</TituloBloque>
      <FilaInterruptor
        titulo={t('zonaGlobal.acciones.headerSobreHero')}
        ayuda={t('zonaGlobal.acciones.headerSobreHeroAyuda')}
        valor={encabezadoSobrePortada(a)}
        // Transparente ya va encima por defecto: encender suelta la clave; si no, se escribe explícito.
        onCambiar={(v) => cambiar({ header_transparent_over_hero: v ? (transparente ? null : true) : false })}
      />
      <div className="flex flex-col gap-2">
        <EtiquetaGrupo id={id}>{t('zonaGlobal.acciones.espacioPrimera')}</EtiquetaGrupo>
        <CampoNumero
          aria-labelledby={id}
          valor={offset}
          placeholder="0"
          decimales={0}
          minimo={0}
          maximo={240}
          alinear="izquierda"
          onValorChange={(v) => cambiar({ first_section_offset_px: v == null || v <= 0 ? null : Math.min(240, Math.round(v)) })}
        />
        <p className="text-[11px] leading-[14px] text-fg-muted">{t('zonaGlobal.acciones.espacioPrimeraAyuda')}</p>
      </div>
    </section>
  );
}

export { cambioBuscador } from './anterioresLogica';

const FORMAS_BOTON = [
  { valor: '0', clave: 'recto' },
  { valor: '8', clave: 'redondeado' },
  { valor: '999', clave: 'pildora' },
] as const;

/** Figma 1787:902808 «Forma del botón de acción»: escribe `cta_border_radius` (la tienda lo lee en HeaderCTA, HeaderCTA2 y HeaderCTAMovil). */
function FormaBoton({ ajustes, cambiar }: { ajustes: Record<string, unknown>; cambiar: (c: Record<string, unknown>) => void }) {
  const t = useTextosEditor();
  const id = useId();
  const r = typeof ajustes.cta_border_radius === 'number' ? ajustes.cta_border_radius : null;
  const actual = r === null ? '8' : r >= 999 ? '999' : r <= 0 ? '0' : r === 8 ? '8' : null;
  return (
    <div className="flex flex-col gap-2">
      <EtiquetaGrupo id={id}>{t('zonaGlobal.estilo.formaBoton')}</EtiquetaGrupo>
      <ChipsOpcion
        aria-labelledby={id}
        opciones={FORMAS_BOTON.map((f) => ({ valor: f.valor, etiqueta: t(`zonaGlobal.estilo.forma.${f.clave}`) }))}
        valor={actual}
        onValorChange={(v) => cambiar({ cta_border_radius: v === '8' ? null : Number(v) })}
      />
    </div>
  );
}

/**
 * Claves que el panel ya no muestra (Constructor rechazado y controles fuera del Figma v2). La
 * tienda las sigue pintando tal cual; aquí solo se listan si la tienda tiene un valor guardado
 * distinto del de siempre, para poder quitarlo. Sin valores guardados, este bloque no aparece.
 */
export const CLAVES_ANTERIORES_ENCABEZADO = [
  'header_builder',
  'mobile_header',
  'header_menu_source',
  'header_icons_weight',
  'header_cart_glyph',
  'search_icon',
  'auth_icon',
  'currency_icon',
  'header_booking_bar',
  'mobile_logo_position',
  'mobile_show_topbar',
  'mobile_search_style',
  'header_divider',
  'header_divider_color',
  'header_hover_color',
  'header_mobile_icon_color',
  'mobile_menu_bg_color',
  'mobile_menu_text_color',
  'mobile_menu_link_hover_color',
  'mobile_menu_link_active_color',
  'mobile_menu_title_color',
  'mobile_menu_divider_color',
  'mobile_menu_currency_text_color',
  'mobile_menu_currency_border_color',
  'mobile_menu_currency_bg_color',
  'mobile_menu_login_bg_color',
  'mobile_menu_login_text_color',
  'mobile_menu_register_border_color',
  'mobile_menu_register_text_color',
  'mobile_menu_logout_color',
] as const;

export function clavesAnterioresConValor(ajustes: Record<string, unknown>): string[] {
  return entradasAnterioresEncabezado(ajustes, CLAVES_ANTERIORES_ENCABEZADO).map((e) => e.id);
}

/** Bloque «Ajustes de versiones anteriores» (encabezado y pie): quitar por clave, con dependencias. */
export function AjustesAnteriores({ ajustes, entradas, cambiar }: { ajustes: Record<string, unknown>; entradas: readonly EntradaAnterior[]; cambiar: (c: Record<string, unknown>) => void }) {
  const t = useTextosEditor();
  if (entradas.length === 0) return null;
  const quitables = entradas.filter((e) => e.quitar);
  return (
    <details className="rounded-lg border border-line bg-surface px-3 py-2">
      <summary className="cursor-pointer text-[13px] font-semibold leading-[18px] text-fg">
        {t('zonaGlobal.anteriores.titulo', { n: entradas.length })}
      </summary>
      <p className="mt-2 text-[11px] leading-[14px] text-fg-muted">{t('zonaGlobal.anteriores.ayuda')}</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {entradas.map((e) => (
          <li key={e.id} className="flex flex-col gap-1.5 text-xs text-fg-secondary">
           <div className="flex items-center justify-between gap-2">
            <span className="flex flex-col">
              <span>{t(`zonaGlobal.anteriores.clave.${e.id}`)}</span>
              {e.motivo && <span className="text-[11px] leading-[14px] text-fg-muted">{t(`zonaGlobal.anteriores.motivo.${e.motivo}`)}</span>}
            </span>
            {e.quitar && (
              <button type="button" onClick={() => cambiar(e.quitar!)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
                {t('zonaGlobal.anteriores.quitar')}
              </button>
            )}
           </div>
            {e.editables?.map((ed) => (
              <FilaInterruptor key={ed.clave} titulo={t(`zonaGlobal.anteriores.campoMovil.${ed.clave}`)} valor={ed.valor} onCambiar={(v) => cambiar(ed.cambio(v))} />
            ))}
          </li>
        ))}
      </ul>
      {quitables.length > 1 && (
        <button type="button" onClick={() => cambiar(cambioQuitarTodos(ajustes, entradas))} className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'mt-2')}>
          {t('zonaGlobal.anteriores.quitarTodos')}
        </button>
      )}
    </details>
  );
}
