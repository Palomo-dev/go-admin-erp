'use client';

/**
 * Encabezado › Celular › Menú inferior (v2): pestañas tipo app o botones de acción, con los
 * botones que el sitio quiera. Cada botón se puede quitar, ocultar, agregar y reordenar, y
 * cambiar su texto, ícono, acción y destino (teléfono, WhatsApp con mensaje, página, URL…).
 * Filas del Constructor de menú (`MenuLinkRow`) y piezas del kit. Lógica en `menuInferiorLogica.ts`.
 */
import { useId, useState } from 'react';
import {
  ArrowDown, ArrowUp, CalendarCheck, CalendarDays, Heart, Home, LayoutGrid, Link2, ListMinus, MapPin, Menu,
  MessageCircle, Package, Percent, Phone, Plus, Search, ShoppingBag, ShoppingCart, Sparkles, Star, Tag, Truck, User,
  type LucideIcon,
} from 'lucide-react';
import { ChipsOpcion, clasesBoton, type AccionFila } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MenuLinkRow, type TipoEnlaceMenu } from '@/components/sitio-web/ui/MenuLinkRow';
import { ICONOS_MENU, MAX_BOTONES, MAX_TEXTO, VARIANTES_MENU, type AccionMenu, type BotonMenu, type IconoMenu, type MenuInferior } from '@/lib/website/menuInferior';
import { useTextosEditor } from '../textos';
import { ColorTema, EtiquetaGrupo, FilaInterruptor, TarjetaComposicion } from './PartesZonaGlobal';
import { useDestinosTienda } from './useDestinosTienda';
import { accionesDisponibles, accionesSinDestino, avisoBoton, botonConAccion, botonNuevo, campoDestino, cambioMenuV2, conVariante, menuDelEditor, mover } from './menuInferiorLogica';

export const ICONO_MENU: Record<IconoMenu, LucideIcon> = {
  home: Home, grid: LayoutGrid, search: Search, bag: ShoppingBag, cart: ShoppingCart, user: User, menu: Menu,
  phone: Phone, whatsapp: MessageCircle, 'map-pin': MapPin, calendar: CalendarDays, 'calendar-check': CalendarCheck,
  package: Package, truck: Truck, tag: Tag, percent: Percent, star: Star, heart: Heart, sparkles: Sparkles, link: Link2,
};

const TIPO_FILA: Partial<Record<AccionMenu, TipoEnlaceMenu>> = { call: 'telefono', whatsapp: 'whatsapp', url: 'externo' };

export function MenuInferiorPanel({ ajustes: a, cambiar, giro, coloresTema }: {
  ajustes: Record<string, unknown>;
  cambiar: (c: Record<string, unknown>) => void;
  giro?: string | null;
  coloresTema?: { fondo: string; texto: string };
}) {
  const t = useTextosEditor();
  const tm = (k: string, v?: Record<string, string | number>) => t(`zonaGlobal.movilEncabezado.mi.${k}`, v);
  const idVariante = useId();
  const idTextos = useId();
  const idDestacado = useId();
  const { menu } = menuDelEditor(a, giro);
  const sinDestino = accionesSinDestino(useDestinosTienda(a, giro === 'restaurante'), giro === 'restaurante');
  const disponibles = accionesDisponibles(a);
  const [abierto, setAbierto] = useState<string | null>(null);
  const poner = (m: MenuInferior) => cambiar(cambioMenuV2(a, m));
  const ponerItems = (items: BotonMenu[]) => poner({ ...menu, items });
  const max = MAX_BOTONES[menu.variant];
  const visibles = menu.items.filter((b) => b.visible).length;

  const acciones = (b: BotonMenu, i: number): AccionFila[] => [
    { id: 'subir', etiqueta: tm('subir'), icono: ArrowUp, deshabilitada: i === 0, onSelect: () => ponerItems(mover(menu.items, i, -1)) },
    { id: 'bajar', etiqueta: tm('bajar'), icono: ArrowDown, deshabilitada: i === menu.items.length - 1, onSelect: () => ponerItems(mover(menu.items, i, 1)) },
    { id: 'quitar', etiqueta: tm('quitar'), icono: ListMinus, destructiva: true, separadorAntes: true, deshabilitada: menu.items.length <= 1, onSelect: () => ponerItems(menu.items.filter((x) => x.id !== b.id)) },
  ];

  return (
    <section className="flex flex-col gap-3" data-bloque="menu-inferior">
      <FilaInterruptor titulo={tm('titulo')} ayuda={tm('ayuda')} valor={menu.enabled} onCambiar={(v) => poner({ ...menu, enabled: v })} />
      <fieldset disabled={!menu.enabled} className={`flex flex-col gap-3 ${menu.enabled ? '' : 'opacity-50'}`}>
        <div className="flex flex-col gap-2">
          <EtiquetaGrupo id={idVariante}>{tm('variante')}</EtiquetaGrupo>
          <div role="radiogroup" aria-labelledby={idVariante} className="grid grid-cols-2 gap-2">
            {VARIANTES_MENU.map((v) => (
              <TarjetaComposicion key={v} etiqueta={tm(`varianteOpcion.${v}`)} seleccionada={menu.variant === v} onElegir={() => menu.variant !== v && poner(conVariante(menu, v))}>
                {v === 'tabs' ? (
                  <><span className="absolute inset-x-0 bottom-0 h-3 bg-surface" />{[20, 35, 50, 65, 80].map((x) => <span key={x} className="absolute bottom-1 size-1.5 rounded-full bg-brand" style={{ left: `${x}%` }} />)}</>
                ) : (
                  <><span className="absolute inset-x-0 bottom-0 h-4 bg-surface" /><span className="absolute bottom-1 left-[8%] h-2 w-[40%] rounded-sm bg-brand" /><span className="absolute bottom-1 right-[8%] h-2 w-[40%] rounded-sm border border-brand" /></>
                )}
              </TarjetaComposicion>
            ))}
          </div>
          <p className="text-[11px] leading-[14px] text-fg-muted">{tm('maximo', { n: max })}</p>
        </div>

        <ul className="flex flex-col gap-1" aria-label={tm('botones')}>
          {menu.items.map((b, i) => {
            const aviso = avisoBoton(b, sinDestino);
            return (
              <li key={b.id} className="flex flex-col gap-2">
                <MenuLinkRow
                  etiqueta={b.label || tm(`accion.${b.action}`)}
                  tipo={TIPO_FILA[b.action] ?? 'pagina'}
                  icono={ICONO_MENU[b.icon]}
                  detalle={aviso ? <span className="text-danger">{tm(`aviso.${aviso}`)}</span> : detalleBoton(b, tm)}
                  oculta={!b.visible}
                  seleccionada={abierto === b.id}
                  onSeleccionar={() => setAbierto(abierto === b.id ? null : b.id)}
                  onAlternarVisible={() => ponerItems(menu.items.map((x) => (x.id === b.id ? { ...x, visible: !x.visible } : x)))}
                  acciones={acciones(b, i)}
                  onMover={(d) => ponerItems(mover(menu.items, i, d))}
                />
                {abierto === b.id && (
                  <EditorBoton
                    boton={b}
                    disponibles={disponibles}
                    onCambiar={(nuevo) => ponerItems(menu.items.map((x) => (x.id === b.id ? nuevo : x)))}
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
        {visibles === 0 && <p className="text-[11px] leading-[14px] text-danger">{tm('sinVisibles')}</p>}

        <div className="flex flex-col gap-2">
          <EtiquetaGrupo id={idTextos}>{tm('textos')}</EtiquetaGrupo>
          <ChipsOpcion
            aria-labelledby={idTextos}
            opciones={[{ valor: 'always', etiqueta: tm('textosOpcion.always') }, { valor: 'never', etiqueta: tm('textosOpcion.never') }]}
            valor={menu.style.labels}
            onValorChange={(v) => poner({ ...menu, style: { ...menu.style, labels: v as 'always' | 'never' } })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <EtiquetaGrupo id={idDestacado}>{tm(menu.variant === 'tabs' ? 'centro' : 'principal')}</EtiquetaGrupo>
          <ChipsOpcion
            aria-labelledby={idDestacado}
            opciones={[
              { valor: '', etiqueta: tm(menu.variant === 'tabs' ? 'centroNinguno' : 'principalPrimero') },
              ...menu.items.filter((b) => b.visible).map((b) => ({ valor: b.id, etiqueta: b.label || tm(`accion.${b.action}`) })),
            ]}
            valor={(menu.variant === 'tabs' ? menu.style.centerId : menu.style.primaryId) ?? ''}
            onValorChange={(v) => {
              const style = { ...menu.style };
              const k = menu.variant === 'tabs' ? 'centerId' : 'primaryId';
              if (v) style[k] = v; else delete style[k];
              poner({ ...menu, style });
            }}
          />
        </div>
        <ColorTema etiqueta={tm('fondo')} valor={menu.style.background ?? null} colorTema={coloresTema?.fondo ?? '#ffffff'} onCambiar={(v) => poner({ ...menu, style: { ...menu.style, background: v ?? undefined } })} />
        <ColorTema etiqueta={tm(menu.variant === 'tabs' ? 'activo' : 'colorPrincipal')} valor={menu.style.active ?? null} colorTema={coloresTema?.texto ?? '#111827'} onCambiar={(v) => poner({ ...menu, style: { ...menu.style, active: v ?? undefined } })} />
        <ColorTema etiqueta={tm('inactivo')} valor={menu.style.inactive ?? null} colorTema={coloresTema?.texto ?? '#111827'} onCambiar={(v) => poner({ ...menu, style: { ...menu.style, inactive: v ?? undefined } })} />
      </fieldset>
    </section>
  );
}

function detalleBoton(b: BotonMenu, tm: (k: string, v?: Record<string, string | number>) => string): string {
  const accion = tm(`accion.${b.action}`);
  const destino = b.target?.trim();
  if (destino) return `${accion} · ${destino}`;
  const campo = campoDestino(b.action);
  return campo === 'telefono' || campo === 'whatsapp' || campo === 'direccion' ? `${accion} · ${tm('deLaTienda')}` : accion;
}

function EditorBoton({ boton: b, disponibles, onCambiar }: { boton: BotonMenu; disponibles: readonly AccionMenu[]; onCambiar: (b: BotonMenu) => void }) {
  const t = useTextosEditor();
  const tm = (k: string) => t(`zonaGlobal.movilEncabezado.mi.${k}`);
  const idAccion = useId();
  const idTexto = useId();
  const idIcono = useId();
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
      <EtiquetaGrupo id={idIcono}>{tm('icono')}</EtiquetaGrupo>
      <div role="radiogroup" aria-labelledby={idIcono} className="grid grid-cols-7 gap-1">
        {ICONOS_MENU.map((ic) => {
          const Icono = ICONO_MENU[ic];
          const sel = b.icon === ic;
          return (
            <button
              key={ic}
              type="button"
              role="radio"
              aria-checked={sel}
              aria-label={tm(`iconoOpcion.${ic}`)}
              title={tm(`iconoOpcion.${ic}`)}
              onClick={() => onCambiar({ ...b, icon: ic })}
              className={`flex h-8 items-center justify-center rounded-md border ${sel ? 'border-brand bg-brand/10 text-brand-deep' : 'border-border text-fg-secondary hover:bg-subtle'}`}
            >
              <Icono aria-hidden="true" className="size-4" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
