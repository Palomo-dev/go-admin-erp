'use client';

/**
 * Encabezado › Celular › Menú inferior (v2): pestañas tipo app, botones de acción, píldora
 * flotante, solo íconos o isla con un botón aparte, con los botones que el sitio quiera. Cada botón
 * se puede quitar, ocultar, agregar y reordenar (arrastre del kit o «Subir/Bajar»), y cambiar su
 * texto, ícono, acción, destino y contador. Filas del Constructor de menú (`MenuLinkRow`) y piezas
 * del kit. Lógica en `menuInferiorLogica.ts`.
 *
 * 2026-11-23 (Figma 2836:69391, E1 2845:70738 · E2 2846:70764 · efectos 2861:71749, aprobado):
 * tarjetas de estilo con miniatura, marca del activo, forma del destacado, botón aparte, colores,
 * contador de Carrito y Favoritos, al bajar, páginas especiales, «No repetir en la cabecera»
 * (apagado por defecto) y efectos con vista previa. Lo que se deja como hoy no escribe su clave.
 */
import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowDown, ArrowUp, CalendarCheck, CalendarDays, CircleUserRound, Gift, Heart, Home, LayoutGrid, Link2, List, ListMinus, MapPin, Menu,
  MessageCircle, Package, Percent, Phone, Play, Plus, Search, ShoppingBag, ShoppingBasket, ShoppingCart, Sparkles, Star, Store, Tag, Truck, User,
  type LucideIcon,
} from 'lucide-react';
import { ChipsOpcion, clasesBoton, useArrastreArbol, type AccionFila } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MenuLinkRow, type TipoEnlaceMenu } from '@/components/sitio-web/ui/MenuLinkRow';
import {
  ANCHOS_FLOTANTE, CONTADORES_MENU, EFECTOS_TOQUE, FORMAS_CENTRO, ICONOS_MENU, INDICADORES_MENU, MAX_BOTONES, MAX_TEXTO, MS_VELOCIDAD, TEMAS_MENU,
  VARIANTES_MENU, VELOCIDADES_EFECTO, contadorMenu, efectoActivoMenu, fichaMenu, indicadorMenu,
  type AccionMenu, type BotonMenu, type ContadorMenu, type EfectoActivo, type EfectoToque, type IconoMenu, type IndicadorMenu, type MenuInferior,
  type TemaMenu, type VarianteMenu,
} from '@/lib/website/menuInferior';
import { useTextosEditor } from '../textos';
import { ColorTema, EtiquetaGrupo, FilaInterruptor, InsigniaNuevo, TarjetaComposicion } from './PartesZonaGlobal';
import { FilaDeslizador, FilaSegmento } from './PildoraYBoton';
import { useDestinosTienda } from './useDestinosTienda';
import { estiloGlifosCabecera, type EstiloGlifos, type PesoGlifo } from '@/lib/website/v2/glifosTienda';
import { CampoIcono } from './iconos/CampoIcono';
import { EstiloIconosSeccion } from './iconos/EstiloIconosSeccion';
import { phosphorComoLucide } from './iconos/GlifoEditor';
import { muestrasCabecera, muestrasMenu } from './iconos/muestrasGlifo';
import { botonConIcono, conEstiloGlifos, conPesoPropio, pesoPropioBoton } from './iconos/selectorIconosLogica';
import {
  accionesDisponibles, accionesSinDestino, avisoBoton, botonConAccion, botonNuevo, campoDestino, cambioMenuV2, conAlBajar, conContador, conEfectoActivo,
  conEfectoToque, conEstiloFlotante, conFicha, conIndicador, conNoRepetir, conTema, conVariante, conVelocidad, esFlotante, estiloFlotante, menuDelEditor,
  mover, moverA, temaEditor, usaCentro, usaMarca, type AnchoFlotante,
} from './menuInferiorLogica';

export const ICONO_MENU: Record<IconoMenu, LucideIcon> = {
  home: Home, grid: LayoutGrid, search: Search, bag: ShoppingBag, cart: ShoppingCart, user: User, menu: Menu,
  phone: Phone, whatsapp: MessageCircle, 'map-pin': MapPin, calendar: CalendarDays, 'calendar-check': CalendarCheck,
  package: Package, truck: Truck, tag: Tag, percent: Percent, star: Star, heart: Heart, sparkles: Sparkles, link: Link2,
  store: Store, list: List, basket: ShoppingBasket, 'user-circle': CircleUserRound, gift: Gift,
};

const TIPO_FILA: Partial<Record<AccionMenu, TipoEnlaceMenu>> = { call: 'telefono', whatsapp: 'whatsapp', url: 'externo' };
/** Estilos nuevos (Figma N2 y N4): llevan «Nuevo» en su tarjeta. */
const VARIANTES_NUEVAS: readonly VarianteMenu[] = ['icons', 'split'];
/** Tarjetas de «Efecto del activo» (Figma X-E1): el punto se elige en «Marca del activo». */
const TARJETAS_EFECTO: readonly EfectoActivo[] = ['color', 'pill', 'underline', 'slide', 'fill', 'bounce', 'glow', 'label'];

type Tm = (k: string, v?: Record<string, string | number>) => string;

export function MenuInferiorPanel({ ajustes: a, cambiar, giro, coloresTema }: {
  ajustes: Record<string, unknown>;
  cambiar: (c: Record<string, unknown>) => void;
  giro?: string | null;
  coloresTema?: { fondo: string; texto: string };
}) {
  const t = useTextosEditor();
  const tm: Tm = (k, v) => t(`zonaGlobal.movilEncabezado.mi.${k}`, v);
  const idVariante = useId();
  const idTextos = useId();
  const idDestacado = useId();
  const idAparte = useId();
  const { menu } = menuDelEditor(a, giro);
  const sinDestino = accionesSinDestino(useDestinosTienda(a, giro === 'restaurante'), giro === 'restaurante');
  const disponibles = accionesDisponibles(a);
  const [abierto, setAbierto] = useState<string | null>(null);
  const poner = (m: MenuInferior) => cambiar(cambioMenuV2(a, m));
  const ponerItems = (items: BotonMenu[]) => poner({ ...menu, items });
  const max = MAX_BOTONES[menu.variant];
  // Pestañas y píldora flotante destacan con `centerId`; acciones, con `primaryId`; la Isla tiene
  // su botón aparte (`splitId`).
  const centro = usaCentro(menu.variant);
  const visibles = menu.items.filter((b) => b.visible);
  const tema = temaEditor(menu);
  // Arrastre del kit (escritorio, HTML5) con el índice como id; con teclado, Alt + ↑/↓ o el menú «⋯».
  const arrastre = useArrastreArbol({
    puedeSoltar: (_o, d) => (d !== null ? true : tm('arrastrar')),
    onSoltar: (o, d) => { if (d !== null) ponerItems(moverA(menu.items, o, d)); },
    deshabilitado: !menu.enabled,
    ayuda: tm('arrastrar'),
  });

  const acciones = (b: BotonMenu, i: number): AccionFila[] => [
    { id: 'subir', etiqueta: tm('subir'), icono: ArrowUp, deshabilitada: i === 0, onSelect: () => ponerItems(mover(menu.items, i, -1)) },
    { id: 'bajar', etiqueta: tm('bajar'), icono: ArrowDown, deshabilitada: i === menu.items.length - 1, onSelect: () => ponerItems(mover(menu.items, i, 1)) },
    { id: 'quitar', etiqueta: tm('quitar'), icono: ListMinus, destructiva: true, separadorAntes: true, deshabilitada: menu.items.length <= 1, onSelect: () => ponerItems(menu.items.filter((x) => x.id !== b.id)) },
  ];
  const nombreBoton = (b: BotonMenu) => b.label || tm(`accion.${b.action}`);

  return (
    <section className="flex flex-col gap-3" data-bloque="menu-inferior">
      <FilaInterruptor titulo={tm('titulo')} ayuda={tm('ayuda')} valor={menu.enabled} onCambiar={(v) => poner({ ...menu, enabled: v })} />
      <fieldset disabled={!menu.enabled} className={`flex flex-col gap-3 ${menu.enabled ? '' : 'opacity-50'}`}>
        <div className="flex flex-col gap-2">
          <EtiquetaGrupo id={idVariante}>{tm('variante')}</EtiquetaGrupo>
          <div role="radiogroup" aria-labelledby={idVariante} className="grid grid-cols-3 gap-2">
            {VARIANTES_MENU.map((v) => (
              <TarjetaComposicion key={v} etiqueta={tm(`varianteOpcion.${v}`)} seleccionada={menu.variant === v} onElegir={() => menu.variant !== v && poner(conVariante(menu, v))}>
                <MiniaturaMenu variante={v} />
                {VARIANTES_NUEVAS.includes(v) && <span className="absolute left-1 top-1"><InsigniaNuevo /></span>}
              </TarjetaComposicion>
            ))}
          </div>
          <p className="text-[11px] leading-[14px] text-fg-muted">{tm('maximo', { n: max })}</p>
        </div>

        {esFlotante(menu.variant) && <OpcionesFlotante menu={menu} poner={poner} />}

        {usaMarca(menu.variant) && (
          <div className="flex flex-col gap-1.5" data-bloque="marca-activo">
            <FilaSegmento<IndicadorMenu>
              etiqueta={tm('marca')}
              opciones={INDICADORES_MENU.map((v) => ({ valor: v, etiqueta: tm(`marcaOpcion.${v}`) }))}
              valor={indicadorMenu(menu)}
              onCambiar={(v) => poner(conIndicador(menu, v))}
            />
            <p className="text-[11px] leading-[14px] text-fg-muted">{tm('marcaAyuda')}</p>
          </div>
        )}

        {menu.variant !== 'icons' && menu.variant !== 'split' && (
          <div className="flex flex-col gap-2">
            <EtiquetaGrupo id={idDestacado}>{tm(centro ? 'centro' : 'principal')}</EtiquetaGrupo>
            <ChipsOpcion
              aria-labelledby={idDestacado}
              opciones={[
                { valor: '', etiqueta: tm(centro ? 'centroNinguno' : 'principalPrimero') },
                ...visibles.map((b) => ({ valor: b.id, etiqueta: nombreBoton(b) })),
              ]}
              valor={(centro ? menu.style.centerId : menu.style.primaryId) ?? ''}
              onValorChange={(v) => {
                const style = { ...menu.style };
                const k = centro ? 'centerId' : 'primaryId';
                if (v) style[k] = v; else delete style[k];
                if (!style.centerId) delete style.centerShape;
                poner({ ...menu, style });
              }}
            />
          </div>
        )}
        {menu.variant === 'tabs' && menu.style.centerId && (
          <FilaSegmento<(typeof FORMAS_CENTRO)[number]>
            etiqueta={tm('formaCentro')}
            opciones={FORMAS_CENTRO.map((v) => ({ valor: v, etiqueta: tm(`formaCentroOpcion.${v}`) }))}
            valor={menu.style.centerShape ?? 'circle'}
            onCambiar={(v) => {
              const style = { ...menu.style };
              if (v === 'notch') style.centerShape = 'notch'; else delete style.centerShape;
              poner({ ...menu, style });
            }}
          />
        )}
        {menu.variant === 'split' && (
          <div className="flex flex-col gap-2">
            <EtiquetaGrupo id={idAparte}>{tm('aparte')}</EtiquetaGrupo>
            <ChipsOpcion
              aria-labelledby={idAparte}
              opciones={visibles.map((b) => ({ valor: b.id, etiqueta: nombreBoton(b) }))}
              valor={menu.style.splitId ?? (visibles.find((b) => b.action === 'cart') ?? visibles.at(-1))?.id ?? null}
              onValorChange={(v) => {
                const style = { ...menu.style };
                const porDefecto = (visibles.find((b) => b.action === 'cart') ?? visibles.at(-1))?.id;
                if (v && v !== porDefecto) style.splitId = v; else delete style.splitId;
                poner({ ...menu, style });
              }}
            />
            <p className="text-[11px] leading-[14px] text-fg-muted">{tm('aparteAyuda')}</p>
          </div>
        )}

        <div className="flex flex-col gap-2" data-bloque="colores-menu">
          <FilaSegmento<TemaMenu>
            etiqueta={tm('colores')}
            opciones={TEMAS_MENU.map((v) => ({ valor: v, etiqueta: tm(`coloresOpcion.${v}`) }))}
            valor={tema}
            onCambiar={(v) => poner(conTema(menu, v))}
          />
          <p className="text-[11px] leading-[14px] text-fg-muted">{tm('coloresAyuda')}</p>
          {tema === 'custom' && (
            <>
              <ColorTema etiqueta={tm('fondo')} valor={menu.style.background ?? null} colorTema={coloresTema?.fondo ?? '#ffffff'} onCambiar={(v) => poner({ ...menu, style: { ...menu.style, background: v ?? undefined } })} />
              <ColorTema etiqueta={tm(menu.variant === 'actions' ? 'colorPrincipal' : 'activo')} valor={menu.style.active ?? null} colorTema={coloresTema?.texto ?? '#111827'} onCambiar={(v) => poner({ ...menu, style: { ...menu.style, active: v ?? undefined } })} />
              <ColorTema etiqueta={tm('inactivo')} valor={menu.style.inactive ?? null} colorTema={coloresTema?.texto ?? '#111827'} onCambiar={(v) => poner({ ...menu, style: { ...menu.style, inactive: v ?? undefined } })} />
            </>
          )}
        </div>

        <Recuadro titulo={tm('contador.titulo')} bloque="contador-menu">
          {(['cart', 'favorites'] as const).map((cual) => (
            <FilaSegmento<ContadorMenu>
              key={cual}
              etiqueta={tm(`contador.${cual}`)}
              opciones={CONTADORES_MENU.map((v) => ({ valor: v, etiqueta: tm(`contador.opcion.${v}`) }))}
              valor={contadorMenu(menu, cual)}
              onCambiar={(v) => poner(conContador(menu, cual, v))}
            />
          ))}
          <p className="text-[11px] leading-[14px] text-fg-muted">{tm('contador.ayuda')}</p>
        </Recuadro>

        <div className="flex flex-col gap-1.5">
          <FilaSegmento<'always' | 'hide'>
            etiqueta={tm('alBajar')}
            opciones={(['always', 'hide'] as const).map((v) => ({ valor: v, etiqueta: tm(`alBajarOpcion.${v}`) }))}
            valor={menu.style.scroll ?? 'always'}
            onCambiar={(v) => poner(conAlBajar(menu, v))}
          />
          <p className="text-[11px] leading-[14px] text-fg-muted">{tm('alBajarAyuda')}</p>
        </div>

        <Recuadro titulo={tm('paginas.titulo')} bloque="paginas-especiales">
          <FilaSegmento<'hide' | 'stack'>
            etiqueta={tm('paginas.ficha')}
            opciones={(['hide', 'stack'] as const).map((v) => ({ valor: v, etiqueta: tm(`paginas.fichaOpcion.${v}`) }))}
            valor={fichaMenu(menu)}
            onCambiar={(v) => poner(conFicha(menu, v))}
          />
          <p className="text-[11px] leading-[14px] text-fg-muted">{tm('paginas.fichaAyuda')}</p>
          <FilaFija etiqueta={tm('paginas.checkout')} valor={tm('paginas.checkoutValor')} />
          <FilaFija etiqueta={tm('paginas.chat')} valor={tm('paginas.chatValor')} />
        </Recuadro>

        <FilaInterruptor titulo={tm('noRepetir')} ayuda={tm('noRepetirAyuda')} valor={menu.style.dedupeHeader === true} onCambiar={(v) => poner(conNoRepetir(menu, v))} />

        <p className="text-[11px] leading-[14px] text-fg-muted">{tm('arrastrar')}</p>
        <ul className="flex flex-col gap-1" aria-label={tm('botones')}>
          {menu.items.map((b, i) => {
            const aviso = avisoBoton(b, sinDestino);
            return (
              <li key={b.id} className="flex flex-col gap-2">
                <MenuLinkRow
                  etiqueta={nombreBoton(b)}
                  tipo={TIPO_FILA[b.action] ?? 'pagina'}
                  icono={b.glyph ? phosphorComoLucide(b.glyph.name, b.glyph.weight ?? menu.style.iconStyle?.weight ?? 'regular') : ICONO_MENU[b.icon]}
                  detalle={aviso ? <span className="text-danger">{tm(`aviso.${aviso}`)}</span> : detalleBoton(b, menu, tm)}
                  oculta={!b.visible}
                  seleccionada={abierto === b.id}
                  onSeleccionar={() => setAbierto(abierto === b.id ? null : b.id)}
                  onAlternarVisible={() => ponerItems(menu.items.map((x) => (x.id === b.id ? { ...x, visible: !x.visible } : x)))}
                  acciones={acciones(b, i)}
                  arrastre={arrastre.nodo(i)}
                  onMover={(d) => ponerItems(mover(menu.items, i, d))}
                />
                {abierto === b.id && (
                  <EditorBoton
                    boton={b}
                    disponibles={disponibles}
                    onCambiar={(nuevo) => ponerItems(menu.items.map((x) => (x.id === b.id ? nuevo : x)))}
                    contador={b.action === 'cart' || b.action === 'favorites' ? { valor: contadorMenu(menu, b.action), onCambiar: (v) => poner(conContador(menu, b.action as 'cart' | 'favorites', v)) } : null}
                    estiloIconos={menu.style.iconStyle ?? null}
                    pesoPropio={b.glyph ? { valor: pesoPropioBoton(menu, b), onCambiar: (p) => poner(conPesoPropio(menu, b.id, p)) } : null}
                  />
                )}
              </li>
            );
          })}
        </ul>
        {menu.items.length < max && (
          <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => {
            const nuevo = botonNuevo(menu.items, disponibles);
            ponerItems([...menu.items, nuevo]);
            setAbierto(nuevo.id);
          }}>
            <Plus aria-hidden="true" className="size-4" /> {tm('agregar')}
          </button>
        )}
        {visibles.length === 0 && <p className="text-[11px] leading-[14px] text-danger">{tm('sinVisibles')}</p>}

        {menu.variant !== 'icons' && (
          <div className="flex flex-col gap-2">
            <EtiquetaGrupo id={idTextos}>{tm('textos')}</EtiquetaGrupo>
            <ChipsOpcion
              aria-labelledby={idTextos}
              opciones={[{ valor: 'always', etiqueta: tm('textosOpcion.always') }, { valor: 'never', etiqueta: tm('textosOpcion.never') }]}
              valor={menu.style.labels}
              onValorChange={(v) => poner({ ...menu, style: { ...menu.style, labels: v as 'always' | 'never' } })}
            />
          </div>
        )}

        {/* «Estilo de los íconos» (Figma 2852:71245): la misma sección de Encabezado › Íconos. */}
        <EstiloIconosSeccion
          ambito="menu"
          estilo={menu.style.iconStyle ?? null}
          onCambiar={(e) => poner(conEstiloGlifos(menu, e))}
          copiar={{ estilo: estiloGlifosCabecera(a) }}
          colores={{ fondo: coloresTema?.fondo ?? '#FFFFFF', texto: coloresTema?.texto ?? '#111827', acento: typeof a.primary_color === 'string' ? a.primary_color : '#3B4BDB' }}
          muestrasCabecera={muestrasCabecera(a)}
          muestrasMenu={muestrasMenu(menu, ICONO_MENU)}
        />

        <Efectos menu={menu} poner={poner} tm={tm} />
      </fieldset>
    </section>
  );
}

function Recuadro({ titulo, bloque, children }: { titulo: string; bloque: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-line p-3" data-bloque={bloque}>
      <h4 className="text-[13px] font-semibold leading-[18px] text-fg">{titulo}</h4>
      {children}
    </div>
  );
}

/** Regla fija del sitio (sin opción): etiqueta y su valor en una píldora. */
function FilaFija({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] leading-[18px] text-fg">{etiqueta}</span>
      <span className="rounded-full bg-subtle px-2.5 py-0.5 text-[11px] font-medium leading-4 text-fg-secondary">{valor}</span>
    </div>
  );
}

/** Miniatura de cada estilo (Figma E1): barra, acciones, píldora, solo íconos e isla. */
function MiniaturaMenu({ variante }: { variante: VarianteMenu }) {
  const puntos = (xs: number[], clase = 'bg-fg-secondary', y = 'bottom-1') => xs.map((x) => <span key={x} className={`absolute ${y} size-1.5 rounded-full ${clase}`} style={{ left: `${x}%` }} />);
  switch (variante) {
    case 'tabs':
      return <><span className="absolute inset-x-0 bottom-0 h-3 bg-surface" />{puntos([20, 35, 50, 65, 80], 'bg-brand')}</>;
    case 'floating':
      // Píldora flotante (P4): separada del borde, con el destacado relleno.
      return <><span className="absolute bottom-2 left-[14%] h-3.5 w-[72%] rounded-full border border-line-strong bg-surface/80" />{puntos([24, 38, 52, 66], 'bg-fg-secondary', 'bottom-[13px]')}<span className="absolute bottom-[11px] left-[45%] size-2.5 rounded-full bg-brand" /></>;
    case 'icons':
      // N2: barra oscura, el activo en una píldora con su nombre.
      return <><span className="absolute inset-x-0 bottom-0 h-4 bg-fg" /><span className="absolute bottom-1 left-[8%] h-2 w-[24%] rounded-full bg-brand" />{puntos([44, 58, 72, 86], 'bg-surface')}</>;
    case 'split':
      // N4: isla con 4 botones y el carrito aparte en su círculo.
      return <><span className="absolute bottom-2 left-[8%] h-3.5 w-[58%] rounded-full border border-line-strong bg-surface/80" />{puntos([16, 28, 40, 52], 'bg-fg-secondary', 'bottom-[13px]')}<span className="absolute bottom-[9px] right-[8%] size-[18px] rounded-full bg-brand" /></>;
    default:
      return <><span className="absolute inset-x-0 bottom-0 h-4 bg-surface" /><span className="absolute bottom-1 left-[8%] h-2 w-[40%] rounded-sm bg-brand" /><span className="absolute bottom-1 right-[8%] h-2 w-[40%] rounded-sm border border-brand" /></>;
  }
}

function detalleBoton(b: BotonMenu, m: MenuInferior, tm: Tm): string {
  const accion = tm(`accion.${b.action}`);
  if (b.action === 'cart' || b.action === 'favorites') return `${accion} · ${tm('contadorBoton').toLowerCase()}: ${tm(`contador.opcion.${contadorMenu(m, b.action)}`).toLowerCase()}`;
  const destino = b.target?.trim();
  if (destino) return `${accion} · ${destino}`;
  const campo = campoDestino(b.action);
  return campo === 'telefono' || campo === 'whatsapp' || campo === 'direccion' ? `${accion} · ${tm('deLaTienda')}` : accion;
}

function EditorBoton({ boton: b, disponibles, onCambiar, contador, estiloIconos, pesoPropio }: {
  boton: BotonMenu;
  disponibles: readonly AccionMenu[];
  onCambiar: (b: BotonMenu) => void;
  /** Carrito y Favoritos: su contador (el mismo de «Contador en el ícono»). */
  contador: { valor: ContadorMenu; onCambiar: (v: ContadorMenu) => void } | null;
  /** «Estilo de los íconos» del menú (para «Duotono · como todos»). */
  estiloIconos: EstiloGlifos | null;
  /** Peso propio del botón (solo con un ícono del catálogo nuevo). */
  pesoPropio: { valor: PesoGlifo | null; onCambiar: (p: PesoGlifo | null) => void } | null;
}) {
  const t = useTextosEditor();
  const tm = (k: string) => t(`zonaGlobal.movilEncabezado.mi.${k}`);
  const idAccion = useId();
  const idTexto = useId();
  const idDestino = useId();
  const idMensaje = useId();
  const campo = campoDestino(b.action);
  const opciones = disponibles.includes(b.action) ? disponibles : [b.action, ...disponibles];
  return (
    <div className="ml-6 flex flex-col gap-2 rounded-lg border border-border bg-surface p-2.5" data-boton={b.id}>
      <label htmlFor={idAccion} className="text-xs font-semibold text-fg-secondary">{tm('accionCampo')}</label>
      <Select value={b.action} onValueChange={(v) => onCambiar(botonConAccion(b, v as AccionMenu))}>
        <SelectTrigger id={idAccion}><SelectValue /></SelectTrigger>
        <SelectContent>
          {opciones.map((x) => <SelectItem key={x} value={x}>{tm(`accion.${x}`)}</SelectItem>)}
        </SelectContent>
      </Select>
      {campo && (
        <>
          <label htmlFor={idDestino} className="text-xs font-semibold text-fg-secondary">{tm(`destino.${campo}`)}</label>
          <Input
            id={idDestino}
            value={b.target ?? ''}
            maxLength={300}
            inputMode={campo === 'telefono' || campo === 'whatsapp' ? 'tel' : undefined}
            placeholder={tm(`destinoPlaceholder.${campo}`)}
            onChange={(e) => onCambiar({ ...b, target: e.target.value || undefined })}
          />
          <p className="text-[11px] leading-[14px] text-fg-muted">{tm(`destinoAyuda.${campo}`)}</p>
        </>
      )}
      {b.action === 'whatsapp' && (
        <>
          <label htmlFor={idMensaje} className="text-xs font-semibold text-fg-secondary">{tm('mensaje')}</label>
          <Input id={idMensaje} value={b.message ?? ''} maxLength={300} placeholder={tm('mensajePlaceholder')} onChange={(e) => onCambiar({ ...b, message: e.target.value || undefined })} />
        </>
      )}
      <label htmlFor={idTexto} className="text-xs font-semibold text-fg-secondary">{tm('texto')}</label>
      <Input id={idTexto} value={b.label} maxLength={MAX_TEXTO} onChange={(e) => onCambiar({ ...b, label: e.target.value })} />
      {/* Ícono (Figma 2853:71499): actual + «Cambiar», sugeridos y el selector completo. Los 25
          dibujos de siempre siguen en el selector, en «De siempre». */}
      <CampoIcono
        nombreAccion={b.label || tm(`accion.${b.action}`)}
        accion={b.action}
        clasicos={ICONOS_MENU.map((ic) => ({ nombre: ic, etiqueta: tm(`iconoOpcion.${ic}`), Icono: ICONO_MENU[ic] }))}
        actual={b.glyph ? { tipo: 'phosphor', ref: b.glyph } : { tipo: 'clasico', nombre: b.icon }}
        pesoGeneral={estiloIconos?.weight}
        onElegir={(e) => onCambiar(botonConIcono(b, e))}
        pesoPropio={pesoPropio}
      />
      {contador && (
        <FilaSegmento<ContadorMenu>
          etiqueta={tm('contadorBoton')}
          opciones={CONTADORES_MENU.map((v) => ({ valor: v, etiqueta: tm(`contador.opcion.${v}`) }))}
          valor={contador.valor}
          onCambiar={contador.onCambiar}
        />
      )}
    </div>
  );
}

/** P4 · opciones de la píldora flotante y de la Isla (`style.glass`, `offset`, `width`). */
function OpcionesFlotante({ menu, poner }: { menu: MenuInferior; poner: (m: MenuInferior) => void }) {
  const t = useTextosEditor();
  const tf = (k: string, v?: Record<string, string | number>) => t(`zonaGlobal.movilEncabezado.mi.flotante.${k}`, v);
  const e = estiloFlotante(menu);
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3" data-bloque="pildora-flotante">
      <h4 className="flex items-center gap-1.5 text-[13px] font-semibold leading-[18px] text-fg">
        {tf('titulo')}
        <InsigniaNuevo />
      </h4>
      <FilaInterruptor titulo={tf('vidrio')} ayuda={tf('vidrioAyuda')} valor={e.glass} onCambiar={(v) => poner(conEstiloFlotante(menu, { glass: v }))} />
      <FilaDeslizador
        etiqueta={tf('separacion')}
        valor={e.offset}
        texto={tf('px', { n: e.offset })}
        min={0}
        max={32}
        onCambiar={(v) => poner(conEstiloFlotante(menu, { offset: v }))}
      />
      {menu.variant === 'floating' && (
        <FilaSegmento<AnchoFlotante>
          etiqueta={tf('ancho')}
          opciones={ANCHOS_FLOTANTE.map((v) => ({ valor: v, etiqueta: tf(`anchoOpcion.${v}`) }))}
          valor={e.width}
          onCambiar={(v) => poner(conEstiloFlotante(menu, { width: v }))}
        />
      )}
    </div>
  );
}

// ─── Efectos (Figma X-E1 2861:71749) ─────────────────────────────────────────────────────────

/** ¿El navegador del editor pide menos movimiento? En ese caso la vista previa solo cambia el color. */
function useMenosMovimiento(): boolean {
  const [menos, setMenos] = useState(false);
  useEffect(() => {
    const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : null;
    if (!mq) return;
    setMenos(mq.matches);
    const alCambiar = () => setMenos(mq.matches);
    mq.addEventListener?.('change', alCambiar);
    return () => mq.removeEventListener?.('change', alCambiar);
  }, []);
  return menos;
}

function Efectos({ menu, poner, tm }: { menu: MenuInferior; poner: (m: MenuInferior) => void; tm: Tm }) {
  const idActivo = useId();
  const idToque = useId();
  const conActivo = menu.variant !== 'actions';
  const efecto = efectoActivoMenu(menu) ?? 'color';
  const toque = menu.style.pressEffect ?? 'none';
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3" data-bloque="efectos-menu">
      <h4 className="flex items-center gap-1.5 text-[13px] font-semibold leading-[18px] text-fg">
        {tm('efectos.titulo')}
        <InsigniaNuevo />
      </h4>
      <VistaPreviaEfectos efecto={conActivo ? efecto : 'color'} toque={toque} ms={MS_VELOCIDAD[menu.style.fxSpeed ?? 'normal']} tm={tm} />
      {conActivo && (
        <div className="flex flex-col gap-2">
          <EtiquetaGrupo id={idActivo}>{tm('efectos.activo')}</EtiquetaGrupo>
          <div role="radiogroup" aria-labelledby={idActivo} className="grid grid-cols-4 gap-1.5">
            {TARJETAS_EFECTO.map((v) => (
              <TarjetaComposicion key={v} compacta etiqueta={tm(`efectos.activoOpcion.${v}`)} seleccionada={efecto === v} onElegir={() => poner(conEfectoActivo(menu, v))}>
                <MiniaturaEfecto efecto={v} />
              </TarjetaComposicion>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <EtiquetaGrupo id={idToque}>{tm('efectos.toque')}</EtiquetaGrupo>
        <ChipsOpcion
          aria-labelledby={idToque}
          opciones={EFECTOS_TOQUE.map((v) => ({ valor: v, etiqueta: tm(`efectos.toqueOpcion.${v}`) }))}
          valor={toque}
          onValorChange={(v) => poner(conEfectoToque(menu, v as EfectoToque))}
        />
      </div>
      <FilaSegmento<(typeof VELOCIDADES_EFECTO)[number]>
        etiqueta={tm('efectos.velocidad')}
        opciones={VELOCIDADES_EFECTO.map((v) => ({ valor: v, etiqueta: tm(`efectos.velocidadOpcion.${v}`) }))}
        valor={menu.style.fxSpeed ?? 'normal'}
        onCambiar={(v) => poner(conVelocidad(menu, v))}
      />
      <p className="text-[11px] leading-[14px] text-fg-muted">{tm('efectos.ayuda')}</p>
    </div>
  );
}

/** Dos íconos en la tarjeta: Inicio quieto y Buscar con el efecto del activo. */
function MiniaturaEfecto({ efecto }: { efecto: EfectoActivo }) {
  if (efecto === 'label') {
    return <span className="absolute inset-x-2 top-1/2 flex -translate-y-1/2 items-center justify-end"><span className="h-3 w-9 rounded-full bg-brand" /></span>;
  }
  const marca: Record<EfectoActivo, string> = {
    color: '', pill: 'bg-brand/15 rounded-md', underline: 'border-b-2 border-brand', dot: '', slide: 'bg-brand/15 rounded-md',
    fill: '', bounce: 'scale-125', glow: 'rounded-full shadow-[0_0_0_3px_rgba(37,99,235,0.18)] bg-brand/10', label: '',
  };
  return (
    <span className="absolute inset-0 flex items-center justify-around px-2">
      <Home aria-hidden="true" className="size-3 text-fg-secondary" />
      <span className={`flex size-5 items-center justify-center ${marca[efecto]}`}>
        <Search aria-hidden="true" className="size-3 text-brand" {...(efecto === 'fill' ? { fill: 'currentColor' } : {})} />
      </span>
    </span>
  );
}

const PREVIA: { icono: LucideIcon; clave: string }[] = [
  { icono: Home, clave: 'home' }, { icono: LayoutGrid, clave: 'categories_modal' }, { icono: Search, clave: 'search' },
  { icono: Heart, clave: 'favorites' }, { icono: ShoppingCart, clave: 'cart' },
];

/**
 * Vista previa en vivo (Figma X-E1): cinco íconos; tocar uno lo vuelve el activo con el efecto
 * elegido y muestra el efecto al tocar. «Reproducir» pasa el activo al siguiente.
 */
function VistaPreviaEfectos({ efecto, toque, ms, tm }: { efecto: EfectoActivo; toque: EfectoToque; ms: number; tm: Tm }) {
  const [activo, setActivo] = useState(0);
  const [tocado, setTocado] = useState<number | null>(null);
  const [pulso, setPulso] = useState(0);
  const menos = useMenosMovimiento();
  const transicion = menos ? 'none' : `all ${ms}ms ease`;
  const tocar = (i: number) => {
    setActivo(i);
    setTocado(i);
    setPulso((n) => n + 1);
    window.setTimeout(() => setTocado(null), ms * 1.5);
  };
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-subtle p-2.5" data-bloque="vista-previa-efectos">
      <p className="text-[11px] font-medium leading-[14px] text-fg-muted">{tm('efectos.vistaPrevia')}</p>
      <div className="relative grid grid-cols-5 rounded-lg bg-surface py-1.5">
        {efecto === 'slide' && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-1 rounded-md bg-brand/15"
            style={{ width: '20%', transform: `translateX(${activo * 100}%)`, transition: transicion }}
          />
        )}
        {PREVIA.map(({ icono: Icono, clave }, i) => {
          const es = i === activo;
          const presionado = tocado === i && !menos;
          const estiloIcono: CSSProperties = {
            transition: transicion,
            transform: presionado && toque === 'scale' ? 'scale(0.9)' : presionado && toque === 'tilt' ? 'rotate(-12deg)' : presionado && toque === 'bounce' ? 'scale(1.12)' : es && efecto === 'bounce' && !menos ? 'scale(1.1)' : undefined,
          };
          const fondo = es && efecto === 'pill' ? 'bg-brand/15 rounded-md' : es && efecto === 'glow' ? 'rounded-full bg-brand/10 shadow-[0_0_0_4px_rgba(37,99,235,0.15)]' : '';
          const oscuro = tocado === i && toque === 'darken' ? 'rounded-full bg-fg/10' : '';
          const soloActivo = efecto === 'label';
          return (
            <button
              key={clave}
              type="button"
              onClick={() => tocar(i)}
              aria-pressed={es}
              className="relative flex flex-col items-center gap-0.5 overflow-hidden rounded-md py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {tocado === i && toque === 'ripple' && !menos && (
                <span key={pulso} aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 size-12 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-brand/20" />
              )}
              {soloActivo && es ? (
                <span className="flex items-center gap-1 rounded-full bg-brand px-2 py-1 text-[10px] font-semibold text-white">
                  <Icono aria-hidden="true" className="size-3.5" />
                  {tm(`accion.${clave}`).split(' ')[0]}
                </span>
              ) : (
                <>
                  <span className={`flex size-7 items-center justify-center ${fondo} ${oscuro}`} style={estiloIcono}>
                    <Icono aria-hidden="true" className={`size-4 ${es ? 'text-brand' : 'text-fg-secondary'}`} {...(es && efecto === 'fill' ? { fill: 'currentColor' } : {})} />
                  </span>
                  {!soloActivo && (
                    <span className={`text-[9px] leading-3 ${es ? 'font-semibold text-brand' : 'text-fg-muted'}`}>{tm(`accion.${clave}`).split(' ')[0]}</span>
                  )}
                  {es && efecto === 'underline' && <span aria-hidden="true" className="absolute bottom-0 h-0.5 w-4 rounded-full bg-brand" />}
                  {es && efecto === 'dot' && <span aria-hidden="true" className="absolute bottom-0 size-1 rounded-full bg-brand" />}
                </>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => tocar((activo + 1) % PREVIA.length)}>
          <Play aria-hidden="true" className="size-3.5" /> {tm('efectos.reproducir')}
        </button>
        <span className="text-[11px] leading-[14px] text-fg-muted">{tm('efectos.tocaIcono')}</span>
      </div>
    </div>
  );
}
