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
import { ChipsOpcion, TabBar, clasesBoton, idPanel, idPestana } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DispositivoVista } from '@/components/sitio-web/ui/dispositivos';
import type { ShellPorDefecto } from '@/lib/website/v2/plantillaCompleta';
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
import { CelularEncabezado } from './CelularEncabezado';
import { ConstructorEncabezado } from './ConstructorEncabezado';
import { PRESETS_CONTENEDOR } from '@/lib/website/constructorEncabezado';
import { ColorField } from '@/components/sitio-web/ui/ColorField';
import {
  DESTINO_PROPIO,
  cambiosRestablecer,
  escribirAnuncios,
  esDestinoDeLista,
  leerAnuncios,
  formaCarritoEncabezado,
  opcionBooleana,
  opcionesDestino,
  valorOpcion,
} from './zonaGlobalLogica';

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
  const [pestana, setPestana] = useState<PestanaZona>(p.pestanaInicial ?? 'diseno');
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
          { valor: 'celular', etiqueta: t('zonaGlobal.pestana.celular') },
          { valor: 'constructor', etiqueta: t('zonaGlobal.pestana.constructor') },
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
        {pestana === 'celular' && <CelularEncabezado ajustes={a} cambiar={cambiar} acento={p.coloresTema.acento} />}
        {pestana === 'constructor' && <ConstructorEncabezado ajustes={a} cambiar={cambiar} acento={p.coloresTema.acento} />}
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
  const idFuente = useId();
  const idTrazo = useId();
  const idForma = useId();
  const idCaja = useId();
  const idEspacio = useId();
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
      <MenusSimultaneos ajustes={a} menus={p.menus} cambiar={cambiar} />
      <div className="flex flex-col gap-2">
        <EtiquetaGrupo id={idFuente}>{t('zonaGlobal.menu.fuente')}</EtiquetaGrupo>
        <ChipsOpcion
          aria-labelledby={idFuente}
          opciones={[
            { valor: 'menu', etiqueta: t('zonaGlobal.menu.fuenteMenu') },
            { valor: 'categorias_carta', etiqueta: t('zonaGlobal.menu.fuenteCarta') },
          ]}
          valor={valorOpcion<string>(a, 'header_menu_source')}
          onValorChange={(v) => cambiar({ header_menu_source: v })}
        />
      </div>

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
        <FilaInterruptor titulo={t('zonaGlobal.barra.mostrar')} valor={opcionBooleana(a, 'show_topbar')} onCambiar={(v) => cambiar({ show_topbar: v })} />
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
                { valor: 'correo', etiqueta: t('zonaGlobal.barra.correo') },
                { valor: 'anuncio', etiqueta: t('zonaGlobal.barra.anuncio') },
                { valor: 'envio', etiqueta: t('zonaGlobal.barra.envioGratis') },
                { valor: 'cupos', etiqueta: t('zonaGlobal.barra.cupos') },
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
          onCambiar={(v) => cambiar({ search_style: v ? 'icon' : 'hidden' })}
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
        <div className="flex flex-col gap-2 pt-1">
          <EtiquetaGrupo id={idTrazo}>{t('zonaGlobal.acciones.iconosTrazo')}</EtiquetaGrupo>
          <ChipsOpcion
            aria-labelledby={idTrazo}
            opciones={[
              { valor: 'contorno', etiqueta: t('zonaGlobal.acciones.contorno') },
              { valor: 'relleno', etiqueta: t('zonaGlobal.acciones.relleno') },
            ]}
            valor={valorOpcion<string>(a, 'header_icons_weight') === 'relleno' ? 'relleno' : 'contorno'}
            onValorChange={(v) => cambiar({ header_icons_weight: v })}
          />
          <EtiquetaGrupo id={idForma}>{t('zonaGlobal.acciones.iconosForma')}</EtiquetaGrupo>
          <ChipsOpcion
            aria-labelledby={idForma}
            opciones={[
              { valor: 'bolsa', etiqueta: t('zonaGlobal.acciones.bolsa') },
              { valor: 'carrito', etiqueta: t('zonaGlobal.acciones.carrito') },
            ]}
            valor={formaCarritoEncabezado(a)}
            onValorChange={(v) =>
              cambiar({
                header_cart_glyph: v,
                cart_icon: v === 'carrito' ? 'shopping-cart' : 'shopping-bag',
              })
            }
          />
        </div>
        <EtiquetaGrupo>{t('zonaGlobal.acciones.iconoBusqueda')}</EtiquetaGrupo>
        <ChipsOpcion
          opciones={[
            { valor: 'search', etiqueta: 'Buscar' },
            { valor: 'scan-search', etiqueta: 'Escanear' },
          ]}
          valor={typeof a.search_icon === 'string' && a.search_icon ? a.search_icon : 'search'}
          onValorChange={(v) => cambiar({ search_icon: v })}
        />
        <EtiquetaGrupo>{t('zonaGlobal.acciones.iconoCuenta')}</EtiquetaGrupo>
        <ChipsOpcion
          opciones={[
            { valor: 'user', etiqueta: 'Usuario' },
            { valor: 'user-circle', etiqueta: 'Círculo' },
          ]}
          valor={typeof a.auth_icon === 'string' && a.auth_icon ? a.auth_icon : 'user'}
          onValorChange={(v) => cambiar({ auth_icon: v })}
        />
        <EtiquetaGrupo>{t('zonaGlobal.acciones.iconoMoneda')}</EtiquetaGrupo>
        <ChipsOpcion
          opciones={[
            { valor: 'globe', etiqueta: 'Globo' },
            { valor: 'coins', etiqueta: 'Monedas' },
          ]}
          valor={typeof a.currency_icon === 'string' && a.currency_icon ? a.currency_icon : 'globe'}
          onValorChange={(v) => cambiar({ currency_icon: v })}
        />
        <FilaInterruptor
          titulo={t('zonaGlobal.acciones.iconosCirculo')}
          ayuda={t('zonaGlobal.acciones.iconosCirculoAyuda')}
          valor={opcionBooleana(a, 'header_icons_circle')}
          onCambiar={(v) => cambiar({ header_icons_circle: v })}
        />
        <div className="flex flex-col gap-2">
          <EtiquetaGrupo id={idCaja}>{t('zonaGlobal.acciones.contenedorIconos')}</EtiquetaGrupo>
          <p className="text-[11px] leading-[14px] text-fg-muted">{t('zonaGlobal.acciones.contenedorAyuda')}</p>
          <ChipsOpcion
            aria-labelledby={idCaja}
            opciones={[
              { valor: 'circulo_acento', etiqueta: t('zonaGlobal.acciones.presetCirculo') },
              { valor: 'cuadrado_suave', etiqueta: t('zonaGlobal.acciones.presetCuadrado') },
              { valor: 'borde_fino', etiqueta: t('zonaGlobal.acciones.presetBorde') },
              { valor: 'sombra_flotante', etiqueta: t('zonaGlobal.acciones.presetSombra') },
              { valor: 'solo_icono', etiqueta: t('zonaGlobal.acciones.presetSolo') },
            ]}
            valor={presetContenedorActivo(a)}
            onValorChange={(v) => aplicarPresetContenedor(a, v, cambiar)}
          />
          <EtiquetaGrupo id={`${idCaja}-forma`}>{t('zonaGlobal.diseno.formaCaja')}</EtiquetaGrupo>
          <ChipsOpcion
            aria-labelledby={`${idCaja}-forma`}
            opciones={[
              { valor: 'circle', etiqueta: t('zonaGlobal.diseno.formaCirculo') },
              { valor: 'square', etiqueta: t('zonaGlobal.diseno.formaCuadrado') },
              { valor: 'semi', etiqueta: t('zonaGlobal.diseno.formaSemi') },
              { valor: 'none', etiqueta: t('zonaGlobal.diseno.formaNinguna') },
            ]}
            valor={formaCajaActiva(a)}
            onValorChange={(v) => aplicarFormaCaja(a, v, cambiar)}
          />
          <EtiquetaGrupo>{t('zonaGlobal.diseno.sombraCaja')}</EtiquetaGrupo>
          <ChipsOpcion
            opciones={[
              { valor: 'none', etiqueta: t('zonaGlobal.diseno.sombraNinguna') },
              { valor: 'sm', etiqueta: 'S' },
              { valor: 'md', etiqueta: 'M' },
              { valor: 'lg', etiqueta: 'L' },
            ]}
            valor={textoCaja(a, 'shadow') || 'none'}
            onValorChange={(v) => escribirCaja(a, { shadow: v }, cambiar)}
          />
          <EtiquetaGrupo>{t('zonaGlobal.diseno.bordeCaja')}</EtiquetaGrupo>
          <ChipsOpcion
            opciones={[
              { valor: '0', etiqueta: '0' },
              { valor: '1', etiqueta: '1' },
              { valor: '2', etiqueta: '2' },
            ]}
            valor={String(numeroCaja(a, 'border_width') ?? 0)}
            onValorChange={(v) => escribirCaja(a, { border_width: Number(v), border_style: Number(v) ? 'solid' : undefined, border_color: '#111827' }, cambiar)}
          />
          <ColorField
            etiqueta={t('zonaGlobal.diseno.hoverCaja')}
            valor={textoCaja(a, 'hover_background') || '#E5E7EB'}
            onCambiar={(hex) => escribirCaja(a, { hover_background: hex, hover_scale: 105 }, cambiar)}
          />
          {formaCajaActiva(a) !== 'none' && (
            <ColorField
              etiqueta={t('zonaGlobal.diseno.fondoCaja')}
              valor={textoCaja(a, 'background') || '#FFFFFF'}
              onCambiar={(hex) => escribirCaja(a, { background: hex }, cambiar)}
            />
          )}
        </div>
        <FilaInterruptor
          titulo={t('zonaGlobal.acciones.headerSobreHero')}
          ayuda={t('zonaGlobal.acciones.headerSobreHeroAyuda')}
          nuevo
          valor={opcionBooleana(a, 'header_transparent_over_hero')}
          onCambiar={(v) => cambiar({ header_transparent_over_hero: v })}
        />
        <div className="flex flex-col gap-1">
          <label className="text-[13px] font-medium text-fg" htmlFor={idEspacio}>
            {t('zonaGlobal.acciones.espacioPrimera')}
          </label>
          <input
            id={idEspacio}
            type="number"
            min={0}
            max={240}
            className="h-9 w-24 rounded-md border border-line bg-surface px-2 text-sm"
            value={String(valorOpcion<number>(a, 'first_section_offset_px') ?? 0)}
            onChange={(e) => {
              const n = Math.min(240, Math.max(0, Math.round(Number(e.target.value) || 0)))
              cambiar({ first_section_offset_px: n })
            }}
          />
          <span className="text-[11px] leading-[14px] text-fg-muted">{t('zonaGlobal.acciones.espacioPrimeraAyuda')}</span>
        </div>
        <FilaInterruptor
          titulo={t('zonaGlobal.acciones.sede')}
          ayuda={t('zonaGlobal.acciones.sedeAyuda')}
          nuevo
          valor={opcionBooleana(a, 'header_show_branch_selector')}
          onCambiar={(v) => cambiar({ header_show_branch_selector: v })}
        />
        <FilaInterruptor
          titulo={t('zonaGlobal.acciones.reserva')}
          ayuda={t('zonaGlobal.acciones.reservaAyuda')}
          nuevo
          valor={opcionBooleana(a, 'header_booking_bar')}
          onCambiar={(v) => cambiar({ header_booking_bar: v })}
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

function Diseno(p: Interno) {
  const t = useTextosEditor();
  const a = p.ajustes;
  const cambiar = p.cambiar;
  const idComp = useId();
  const idLogo = useId();
  const idBc = useId();
  const idBm = useId();
  const idMc = useId();
  const idCol = useId();
  const composicion = valorOpcion<string>(a, 'header_style');
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
              onElegir={() => cambiar(c === 'centered' || c === 'split' ? { header_style: c, logo_position: 'center' } : { header_style: c })}
            >
              <MiniaturaEncabezado composicion={c} />
            </TarjetaComposicion>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <EtiquetaGrupo id={idLogo}>{t('zonaGlobal.diseno.logo')}</EtiquetaGrupo>
        <ChipsOpcion
          aria-labelledby={idLogo}
          opciones={[
            { valor: 'left', etiqueta: t('zonaGlobal.diseno.izquierda') },
            { valor: 'center', etiqueta: t('zonaGlobal.diseno.centro') },
            { valor: 'right', etiqueta: t('zonaGlobal.diseno.derecha') },
          ]}
          valor={valorOpcion<string>(a, 'logo_position') ?? (composicion === 'centered' || composicion === 'split' ? 'center' : 'left')}
          onValorChange={(v) => cambiar({ logo_position: v })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <EtiquetaGrupo id={`${idLogo}-movil`}>{t('zonaGlobal.diseno.logoCelular')}</EtiquetaGrupo>
        <ChipsOpcion
          aria-labelledby={`${idLogo}-movil`}
          opciones={[
            { valor: 'inherit', etiqueta: t('zonaGlobal.diseno.heredar') },
            { valor: 'left', etiqueta: t('zonaGlobal.diseno.izquierda') },
            { valor: 'center', etiqueta: t('zonaGlobal.diseno.centro') },
            { valor: 'right', etiqueta: t('zonaGlobal.diseno.derecha') },
          ]}
          valor={valorOpcion<string>(a, 'mobile_logo_position') ?? 'inherit'}
          onValorChange={(v) => cambiar({ mobile_logo_position: v })}
        />
      </div>

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
        <EtiquetaGrupo id={idBc}>{t('zonaGlobal.diseno.buscadorComputador')}</EtiquetaGrupo>
        <ChipsOpcion
          aria-labelledby={idBc}
          opciones={[
            { valor: 'icon', etiqueta: t('zonaGlobal.diseno.icono') },
            { valor: 'bar', etiqueta: t('zonaGlobal.diseno.barraVisible') },
            { valor: 'outline', etiqueta: t('zonaGlobal.diseno.barraOutline') },
            { valor: 'pill', etiqueta: t('zonaGlobal.diseno.barraPill') },
            { valor: 'soft', etiqueta: t('zonaGlobal.diseno.barraSoft') },
            { valor: 'underline', etiqueta: t('zonaGlobal.diseno.barraUnderline') },
            { valor: 'filled', etiqueta: t('zonaGlobal.diseno.barraFilled') },
            { valor: 'hidden', etiqueta: t('zonaGlobal.diseno.oculto') },
          ]}
          valor={estiloBuscadorActivo(a)}
          onValorChange={(v) => aplicarBuscador(a, v, cambiar)}
        />
        {esBarraBuscador(a) && (
          <>
            <EtiquetaGrupo>{t('zonaGlobal.diseno.bordeBarra')}</EtiquetaGrupo>
            <ChipsOpcion
              opciones={[
                { valor: 'none', etiqueta: '0' },
                { valor: 'thin', etiqueta: '1' },
                { valor: 'thick', etiqueta: '2' },
              ]}
              valor={textoBusqueda(a, 'border')}
              onValorChange={(v) => escribirCromoBuscador(a, { border: v }, cambiar)}
            />
            <EtiquetaGrupo>{t('zonaGlobal.diseno.radioBarra')}</EtiquetaGrupo>
            <ChipsOpcion
              opciones={[
                { valor: 'square', etiqueta: t('zonaGlobal.diseno.formaCuadrado') },
                { valor: 'rounded', etiqueta: 'Redondeada' },
                { valor: 'semi', etiqueta: t('zonaGlobal.diseno.formaSemi') },
                { valor: 'pill', etiqueta: 'Píldora' },
              ]}
              valor={textoBusqueda(a, 'radius')}
              onValorChange={(v) => escribirCromoBuscador(a, { radius: v }, cambiar)}
            />
            <EtiquetaGrupo>{t('zonaGlobal.diseno.sombraBarra')}</EtiquetaGrupo>
            <ChipsOpcion
              opciones={[
                { valor: 'off', etiqueta: t('zonaGlobal.diseno.sombraNinguna') },
                { valor: 'on', etiqueta: 'Con sombra' },
              ]}
              valor={busquedaDe(a).shadow === true ? 'on' : busquedaDe(a).shadow === false ? 'off' : null}
              onValorChange={(v) => escribirCromoBuscador(a, { shadow: v === 'on' }, cambiar)}
            />
            <EtiquetaGrupo>{t('zonaGlobal.diseno.ladoIcono')}</EtiquetaGrupo>
            <ChipsOpcion
              opciones={[
                { valor: 'left', etiqueta: t('zonaGlobal.diseno.izquierda') },
                { valor: 'right', etiqueta: t('zonaGlobal.diseno.derecha') },
              ]}
              valor={textoBusqueda(a, 'icon_side')}
              onValorChange={(v) => escribirCromoBuscador(a, { icon_side: v }, cambiar)}
            />
            <EtiquetaGrupo>{t('zonaGlobal.diseno.posicionBarra')}</EtiquetaGrupo>
            <ChipsOpcion
              opciones={[
                { valor: 'left', etiqueta: t('zonaGlobal.diseno.izquierda') },
                { valor: 'center', etiqueta: t('zonaGlobal.diseno.centro') },
                { valor: 'right', etiqueta: t('zonaGlobal.diseno.derecha') },
              ]}
              valor={textoBusqueda(a, 'align')}
              onValorChange={(v) => escribirAlineacionBuscador(a, v, cambiar)}
            />
            <ColorField
              etiqueta={t('zonaGlobal.diseno.fondoBarra')}
              valor={textoBusqueda(a, 'background') || '#F3F4F6'}
              onCambiar={(hex) => escribirCromoBuscador(a, { background: hex }, cambiar)}
            />
            <ColorField
              etiqueta={t('zonaGlobal.diseno.colorBorde')}
              valor={textoBusqueda(a, 'border_color') || '#111827'}
              onCambiar={(hex) => escribirCromoBuscador(a, { border_color: hex, border: textoBusqueda(a, 'border') || 'thin' }, cambiar)}
            />
          </>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <EtiquetaGrupo id={idBm}>{t('zonaGlobal.diseno.buscadorCelular')}</EtiquetaGrupo>
        <ChipsOpcion
          aria-labelledby={idBm}
          opciones={[
            { valor: 'icon', etiqueta: t('zonaGlobal.diseno.icono') },
            { valor: 'bar', etiqueta: t('zonaGlobal.diseno.barraBajoLogo') },
            { valor: 'hidden', etiqueta: t('zonaGlobal.diseno.oculto') },
          ]}
          valor={valorOpcion<string>(a, 'mobile_search_style') ?? 'icon'}
          onValorChange={(v) => cambiar({ mobile_search_style: v })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <EtiquetaGrupo id={idMc}>{t('zonaGlobal.diseno.menuCelular')}</EtiquetaGrupo>
        <ChipsOpcion
          aria-labelledby={idMc}
          opciones={(['drawer', 'fullscreen', 'bottom_sheet', 'tabs', 'top_dropdown'] as const).map((v) => ({ valor: v, etiqueta: t(`zonaGlobal.diseno.menuCelularOpcion.${v}`) }))}
          valor={estiloMenuCelular(a)}
          onValorChange={(v) => cambiar({ mobile_menu_style: v === 'drawer' ? ladoCajon(a) : v })}
        />
      </div>
      {(estiloMenuCelular(a) === 'drawer' || valorOpcion<string>(a, 'mobile_menu_style') === 'drawer_left') && (
        <div className="flex flex-col gap-2">
          <EtiquetaGrupo id={`${idMc}-lado`}>{t('zonaGlobal.diseno.ladoCajon')}</EtiquetaGrupo>
          <ChipsOpcion
            aria-labelledby={`${idMc}-lado`}
            opciones={[
              { valor: 'drawer', etiqueta: t('zonaGlobal.diseno.ladoDerecha') },
              { valor: 'drawer_left', etiqueta: t('zonaGlobal.diseno.ladoIzquierda') },
            ]}
            valor={ladoCajon(a)}
            onValorChange={(v) => cambiar({ mobile_menu_style: v })}
          />
        </div>
      )}
      <FilaInterruptor titulo={t('zonaGlobal.diseno.barraCelular')} valor={opcionBooleana(a, 'mobile_show_topbar')} onCambiar={(v) => cambiar({ mobile_show_topbar: v })} />
    </>
  );
}

function MenuMovil({ p, fondoMenu }: { p: Interno; fondoMenu: string }) {
  const t = useTextosEditor();
  const a = p.ajustes;
  const cambiar = p.cambiar;
  const color = (k: string) => (typeof a[k] === 'string' && a[k] ? (a[k] as string) : null);
  const automatico = t('zonaGlobal.estilo.automatico');
  const campo = (clave: string, etiqueta: string, arranque: string, fondo = fondoMenu) => (
    <ColorTema
      key={clave}
      etiqueta={etiqueta}
      valor={color(clave)}
      colorTema={arranque}
      fondo={fondo}
      etiquetaNulo={automatico}
      onCambiar={(v) => cambiar({ [clave]: v })}
    />
  );
  return (
    <section className="flex flex-col gap-3">
      <TituloBloque>{t('zonaGlobal.estilo.menuMovil')}</TituloBloque>
      <p className="text-[11px] leading-[14px] text-fg-muted">{t('zonaGlobal.estilo.menuMovilAyuda')}</p>
      {campo('mobile_menu_bg_color', t('zonaGlobal.estilo.menuFondo'), color('header_bg_color') ?? p.coloresTema.fondo, color('header_bg_color') ?? p.coloresTema.fondo)}
      {campo('mobile_menu_text_color', t('zonaGlobal.estilo.menuTexto'), color('header_text_color') ?? p.coloresTema.texto)}
      {campo('mobile_menu_link_hover_color', t('zonaGlobal.estilo.menuHover'), p.coloresTema.acento)}
      {campo('mobile_menu_link_active_color', t('zonaGlobal.estilo.menuActivo'), p.coloresTema.acento)}
      {campo('mobile_menu_title_color', t('zonaGlobal.estilo.menuTitulo'), color('header_text_color') ?? p.coloresTema.texto)}
      {campo('mobile_menu_divider_color', t('zonaGlobal.estilo.menuDivisor'), color('header_divider_color') ?? p.coloresTema.texto)}
      {campo('mobile_menu_currency_text_color', t('zonaGlobal.estilo.menuMoneda'), p.coloresTema.texto)}
      {campo('mobile_menu_currency_border_color', t('zonaGlobal.estilo.menuMonedaBorde'), p.coloresTema.texto)}
      {campo('mobile_menu_currency_bg_color', t('zonaGlobal.estilo.menuMonedaFondo'), p.coloresTema.fondo)}
      {campo('mobile_menu_login_bg_color', t('zonaGlobal.estilo.menuEntrarFondo'), p.coloresTema.acento, p.coloresTema.acento)}
      {campo('mobile_menu_login_text_color', t('zonaGlobal.estilo.menuEntrarTexto'), '#ffffff', color('mobile_menu_login_bg_color') ?? p.coloresTema.acento)}
      {campo('mobile_menu_register_border_color', t('zonaGlobal.estilo.menuRegistroBorde'), p.coloresTema.acento)}
      {campo('mobile_menu_register_text_color', t('zonaGlobal.estilo.menuRegistroTexto'), p.coloresTema.acento)}
      {campo('mobile_menu_logout_color', t('zonaGlobal.estilo.menuSalir'), '#DC2626')}
    </section>
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
      <FilaInterruptor
        titulo={t('zonaGlobal.estilo.divisor')}
        ayuda={t('zonaGlobal.estilo.divisorAyuda')}
        valor={opcionBooleana(a, 'header_divider')}
        onCambiar={(v) => cambiar({ header_divider: v })}
      />
      {opcionBooleana(a, 'header_divider') && (
        <ColorTema
          etiqueta={t('zonaGlobal.estilo.divisorColor')}
          valor={color('header_divider_color')}
          colorTema={p.coloresTema.texto}
          fondo={color('header_bg_color') ?? p.coloresTema.fondo}
          onCambiar={(v) => cambiar({ header_divider_color: v })}
        />
      )}
      <ColorTema
        etiqueta={t('zonaGlobal.estilo.hoverIconos')}
        valor={color('header_hover_color')}
        colorTema={p.coloresTema.texto}
        fondo={color('header_bg_color') ?? p.coloresTema.fondo}
        onCambiar={(v) => cambiar({ header_hover_color: v })}
      />
      <ColorTema
        etiqueta={t('zonaGlobal.estilo.iconosMoviles')}
        valor={color('header_mobile_icon_color')}
        colorTema={color('header_text_color') ?? p.coloresTema.texto}
        fondo={color('header_bg_color') ?? p.coloresTema.fondo}
        etiquetaNulo={t('zonaGlobal.estilo.automatico')}
        onCambiar={(v) => cambiar({ header_mobile_icon_color: v })}
      />
      <MenuMovil p={p} fondoMenu={color('mobile_menu_bg_color') ?? color('header_bg_color') ?? p.coloresTema.fondo} />
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

const PRESETS_VISIBLES = ['circulo_acento', 'cuadrado_suave', 'borde_fino', 'sombra_flotante', 'solo_icono'] as const
type PresetVisible = (typeof PRESETS_VISIBLES)[number]

function registro(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {}
}

/** Sin caja guardada, «Solo ícono» (el de hoy) o «Círculo acento» si el booleano sigue prendido. */
function presetContenedorActivo(ajustes: Record<string, unknown>): PresetVisible | null {
  const caja = registro(registro(ajustes.header_builder).icon_container)
  if (typeof caja.shape !== 'string') return ajustes.header_icons_circle === true ? 'circulo_acento' : 'solo_icono'
  if (caja.scope === 'each') return null
  for (const clave of ['cuadrado_suave', 'borde_fino', 'sombra_flotante', 'solo_icono'] as const) {
    const p = PRESETS_CONTENEDOR[clave] as { shape: string; background?: string; shadow?: string; border_width?: number; radius?: number }
    if (p.shape !== caja.shape) continue
    if ((p.background ?? undefined) !== (caja.background ?? undefined)) continue
    if ((p.shadow ?? undefined) !== (caja.shadow ?? undefined)) continue
    if ((p.border_width ?? undefined) !== (caja.border_width ?? undefined)) continue
    if ((p.radius ?? undefined) !== (caja.radius ?? undefined)) continue
    return clave
  }
  return null
}

const ESTILOS_BARRA = ['outline', 'pill', 'soft', 'underline', 'filled'] as const

function estiloBuscadorActivo(ajustes: Record<string, unknown>): string {
  const estilo = valorOpcion<string>(ajustes, 'search_style') ?? 'icon'
  if (estilo !== 'bar') return estilo
  const variante = registro(registro(ajustes.header_builder).search).variant
  return typeof variante === 'string' && (ESTILOS_BARRA as readonly string[]).includes(variante) ? variante : 'bar'
}

function busquedaDe(ajustes: Record<string, unknown>): Record<string, unknown> {
  return registro(registro(ajustes.header_builder).search)
}

function textoBusqueda(ajustes: Record<string, unknown>, clave: string): string | null {
  const valor = busquedaDe(ajustes)[clave]
  return typeof valor === 'string' && valor ? valor : null
}

function esBarraBuscador(ajustes: Record<string, unknown>): boolean {
  const estilo = estiloBuscadorActivo(ajustes)
  return estilo === 'bar' || (ESTILOS_BARRA as readonly string[]).includes(estilo)
}

function escribirCromoBuscador(ajustes: Record<string, unknown>, parcial: Record<string, unknown>, cambiar: (c: Record<string, unknown>) => void) {
  const builder = registro(ajustes.header_builder)
  const search = busquedaDe(ajustes)
  const estilo = estiloBuscadorActivo(ajustes)
  const variant = (ESTILOS_BARRA as readonly string[]).includes(estilo) ? estilo : undefined
  const base = variant ? {} : { radius: search.radius ?? 'pill', border: search.border ?? 'thin' }
  cambiar({
    search_style: 'bar',
    header_builder: { ...builder, search: { ...search, type: 'bar', ...base, ...(variant ? { variant } : {}), ...parcial } },
  })
}

function escribirAlineacionBuscador(ajustes: Record<string, unknown>, align: string, cambiar: (c: Record<string, unknown>) => void) {
  const builder = registro(ajustes.header_builder)
  const search = busquedaDe(ajustes)
  cambiar({ header_builder: { ...builder, search: { ...search, align } } })
}

function aplicarBuscador(ajustes: Record<string, unknown>, valor: string, cambiar: (c: Record<string, unknown>) => void) {
  const builder = registro(ajustes.header_builder)
  const search = registro(builder.search)
  const esEstilo = (ESTILOS_BARRA as readonly string[]).includes(valor)
  if (!esEstilo) {
    const { variant: _variante, ...resto } = search
    const { search: _buscar, ...sinBuscar } = builder
    const header_builder = Object.keys(resto).length ? { ...builder, search: resto } : Object.keys(sinBuscar).length ? sinBuscar : null
    cambiar({ search_style: valor, header_builder })
    return
  }
  cambiar({
    search_style: 'bar',
    header_builder: { ...builder, search: { ...search, type: 'bar', variant: valor } },
  })
}

function estiloMenuCelular(ajustes: Record<string, unknown>): string {
  const valor = valorOpcion<string>(ajustes, 'mobile_menu_style') ?? 'drawer'
  return valor === 'drawer_left' || valor === 'drawer_right' ? 'drawer' : valor
}

function ladoCajon(ajustes: Record<string, unknown>): string {
  return valorOpcion<string>(ajustes, 'mobile_menu_style') === 'drawer_left' ? 'drawer_left' : 'drawer'
}

function cajaDe(ajustes: Record<string, unknown>): Record<string, unknown> {
  return registro(registro(ajustes.header_builder).icon_container)
}

function formaCajaActiva(ajustes: Record<string, unknown>): string {
  const forma = cajaDe(ajustes).shape
  return typeof forma === 'string' ? forma : 'none'
}

function textoCaja(ajustes: Record<string, unknown>, clave: string): string {
  const valor = cajaDe(ajustes)[clave]
  return typeof valor === 'string' ? valor : ''
}

function numeroCaja(ajustes: Record<string, unknown>, clave: string): number | null {
  const valor = cajaDe(ajustes)[clave]
  return typeof valor === 'number' ? valor : null
}

function escribirCaja(ajustes: Record<string, unknown>, parcial: Record<string, unknown>, cambiar: (c: Record<string, unknown>) => void) {
  const builder = registro(ajustes.header_builder)
  const caja: Record<string, unknown> = { ...cajaDe(ajustes), ...parcial, scope: 'all' }
  if (!caja.shape) caja.shape = 'circle'
  cambiar({ header_icons_circle: false, header_builder: { ...builder, icon_container: caja } })
}

function aplicarFormaCaja(ajustes: Record<string, unknown>, forma: string, cambiar: (c: Record<string, unknown>) => void) {
  if (forma === 'none' && !cajaDe(ajustes).shape) {
    cambiar({ header_icons_circle: false })
    return
  }
  escribirCaja(ajustes, { shape: forma, ...(forma === 'semi' ? { radius: 14 } : {}) }, cambiar)
}

function MenusSimultaneos({ ajustes, menus, cambiar }: { ajustes: Record<string, unknown>; menus: readonly MenuDisponible[]; cambiar: (c: Record<string, unknown>) => void }) {
  const t = useTextosEditor()
  const lista = (Array.isArray(ajustes.header_menus) ? ajustes.header_menus : []) as { menuId?: string; zone?: string }[]
  const [menuId, setMenuId] = useState(menus[0]?.id ?? '')
  const [zona, setZona] = useState('header')
  const nombre = (id: string) => menus.find((m) => m.id === id)?.name ?? id
  return (
    <section className="flex flex-col gap-3">
      <TituloBloque>{t('zonaGlobal.diseno.menusExtra')}</TituloBloque>
      <p className="text-[11px] leading-[14px] text-fg-muted">{t('zonaGlobal.diseno.menusExtraAyuda')}</p>
      {lista.map((item, i) => (
        <div key={`${item.menuId}-${i}`} className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2">
          <span className="min-w-0 truncate text-sm text-fg">
            {nombre(item.menuId || '')} · {item.zone === 'topbar' ? t('zonaGlobal.diseno.zonaTopbar') : item.zone === 'menu' ? t('zonaGlobal.diseno.zonaMenuBarra') : t('zonaGlobal.diseno.zonaHeader')}
          </span>
          <button
            type="button"
            className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
            onClick={() => cambiar({ header_menus: lista.filter((_, j) => j !== i) })}
          >
            {t('zonaGlobal.diseno.quitar')}
          </button>
        </div>
      ))}
      {menus.length > 0 && (
        <>
          <ChipsOpcion
            opciones={menus.map((m) => ({ valor: m.id, etiqueta: m.name }))}
            valor={menuId}
            onValorChange={setMenuId}
          />
          <ChipsOpcion
            opciones={[
              { valor: 'header', etiqueta: t('zonaGlobal.diseno.zonaHeader') },
              { valor: 'topbar', etiqueta: t('zonaGlobal.diseno.zonaTopbar') },
              { valor: 'menu', etiqueta: t('zonaGlobal.diseno.zonaMenuBarra') },
            ]}
            valor={zona}
            onValorChange={setZona}
          />
          <button
            type="button"
            className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'self-start')}
            onClick={() => {
              if (!menuId) return
              cambiar({ header_menus: [...lista, { menuId, zone: zona }] })
            }}
          >
            {t('zonaGlobal.diseno.agregarMenu')}
          </button>
        </>
      )}
    </section>
  )
}

function aplicarPresetContenedor(ajustes: Record<string, unknown>, clave: PresetVisible, cambiar: (c: Record<string, unknown>) => void) {
  const builder = registro(ajustes.header_builder)
  if (clave === 'circulo_acento') {
    const { icon_container: _fuera, ...resto } = builder
    const cambio: Record<string, unknown> = { header_icons_circle: true }
    if ('icon_container' in builder) cambio.header_builder = Object.keys(resto).length ? resto : null
    cambiar(cambio)
    return
  }
  cambiar({
    header_icons_circle: false,
    header_builder: { ...builder, icon_container: { ...PRESETS_CONTENEDOR[clave], scope: 'all' } },
  })
}
