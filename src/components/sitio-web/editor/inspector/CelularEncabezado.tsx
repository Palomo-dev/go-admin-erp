'use client';

/**
 * Pestaña «Celular» del encabezado. No escribe nada hasta que se cambia un control.
 * `mobile_menu_style` legado (drawer, fullscreen, bottom_sheet, tabs) sin `mobile_header`
 * deja el sitio como está.
 */
import { useState } from 'react';
import { Select } from '@/components/kit';
import { ESTILOS_MENU, ITEMS_BARRA_INICIALES } from '@/lib/website/menuMovil';
import { useTextosEditor } from '../textos';
import { EtiquetaGrupo, FilaInterruptor } from './PartesZonaGlobal';

const ESTILO_ETIQUETA: Record<string, string> = {
  drawer: 'Lateral (el de hoy)',
  drawer_left: 'Cajón desde la izquierda',
  drawer_right: 'Cajón desde la derecha',
  fullscreen: 'Pantalla completa',
  bottom_sheet: 'Hoja desde abajo',
  top_dropdown: 'Cortina desde arriba',
  tabs: 'Barra tipo app (la de hoy)',
  none: 'Solo la barra inferior',
};

const control = 'h-9 w-full rounded-md border border-line bg-surface px-2 text-sm text-fg';

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? { ...(valor as Record<string, unknown>) } : {};
}

export function CelularEncabezado({
  ajustes,
  cambiar,
  acento,
}: {
  ajustes: Record<string, unknown>;
  cambiar: (c: Record<string, unknown>) => void;
  acento: string;
}) {
  const t = useTextosEditor();
  const header = objeto(ajustes.mobile_header);
  const panel = objeto(header.panel);
  const barra = objeto(header.bottom_nav);
  const layout = objeto(header.layout);
  const iconos = objeto(header.icons);
  const estilo = typeof ajustes.mobile_menu_style === 'string' ? ajustes.mobile_menu_style : 'drawer';

  const escribir = (parte: string, valor: unknown) => {
    const siguiente = { ...header, [parte]: valor };
    if (valor == null || (typeof valor === 'object' && valor && Object.keys(valor as object).length === 0)) delete siguiente[parte];
    cambiar({ mobile_header: Object.keys(siguiente).length ? siguiente : null });
  };
  const setPanel = (k: string, v: unknown) => {
    const sig = { ...panel, [k]: v };
    if (v == null || v === '') delete sig[k];
    escribir('panel', Object.keys(sig).length ? sig : null);
  };
  const setLayout = (k: string, v: unknown) => escribir('layout', { ...layout, [k]: v });
  const setIconos = (k: string, v: unknown) => escribir('icons', { ...iconos, [k]: v });
  const setBarra = (parcial: Record<string, unknown>) => escribir('bottom_nav', { ...barra, ...parcial });

  return (
    <div className="flex flex-col gap-4">
      <VistaMini estilo={estilo} acento={acento} animacion={String(panel.animation || 'slide')} />
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-fg">{t('zonaGlobal.celular.menu')}</h3>
        <label className="flex flex-col gap-1 text-xs text-fg-secondary">
          {t('zonaGlobal.celular.abrir')}
          <Select className={control} tamano="sm" valor={String(estilo) || '__predeterminado__'} onValorChange={(valor) => cambiar({ mobile_menu_style: (valor === '__predeterminado__' ? '' : valor) })} opciones={[...(ESTILOS_MENU.map((v) =>({ valor: String(v) || '__predeterminado__', etiqueta: String(ESTILO_ETIQUETA[v]) })))]} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-secondary">
          {t('zonaGlobal.celular.ancho')} ({Number(panel.width) || 85}%)
          <input type="range" min={70} max={100} value={Number(panel.width) || 85} onChange={(e) => setPanel('width', Number(e.target.value))} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-secondary">
          {t('zonaGlobal.celular.fondo')}
          <Select className={control} tamano="sm" valor={String(String(panel.background || '')) || '__predeterminado__'} onValorChange={(valor) => setPanel('background', (valor === '__predeterminado__' ? '' : valor) || null)} opciones={[{ valor: String("") || '__predeterminado__', etiqueta: String("Como hoy") }, { valor: String("color") || '__predeterminado__', etiqueta: String("Color") }, { valor: String("gradient") || '__predeterminado__', etiqueta: String("Degradado") }, { valor: String("blur") || '__predeterminado__', etiqueta: String("Desenfoque") }]} />
        </label>
        {panel.background === 'color' && <input aria-label="Color del menú" type="color" value={typeof panel.color === 'string' ? panel.color : '#ffffff'} onChange={(e) => setPanel('color', e.target.value)} />}
        {panel.background === 'gradient' && (
          <div className="flex gap-2">
            <input aria-label="Degradado 1" type="color" value={typeof panel.gradient_1 === 'string' ? panel.gradient_1 : '#ffffff'} onChange={(e) => setPanel('gradient_1', e.target.value)} />
            <input aria-label="Degradado 2" type="color" value={typeof panel.gradient_2 === 'string' ? panel.gradient_2 : acento} onChange={(e) => setPanel('gradient_2', e.target.value)} />
          </div>
        )}
        <label className="flex flex-col gap-1 text-xs text-fg-secondary">
          {t('zonaGlobal.celular.capa')} ({Number(panel.overlay ?? 50)}%)
          <input type="range" min={0} max={90} value={Number(panel.overlay ?? 50)} onChange={(e) => setPanel('overlay', Number(e.target.value))} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-secondary">
          {t('zonaGlobal.celular.animacion')}
          <Select className={control} tamano="sm" valor={String(String(panel.animation || 'slide')) || '__predeterminado__'} onValorChange={(valor) => setPanel('animation', (valor === '__predeterminado__' ? '' : valor))} opciones={[{ valor: String("slide") || '__predeterminado__', etiqueta: String("Deslizar") }, { valor: String("fade") || '__predeterminado__', etiqueta: String("Fundido") }, { valor: String("scale") || '__predeterminado__', etiqueta: String("Escala") }]} />
        </label>
        <FilaInterruptor titulo="Logo dentro del menú" valor={panel.show_logo === true} onCambiar={(v) => setPanel('show_logo', v)} />
        <FilaInterruptor titulo="Buscador dentro del menú" valor={panel.show_search === true} onCambiar={(v) => setPanel('show_search', v)} />
        <FilaInterruptor titulo="Redes dentro del menú" valor={panel.show_social === true} onCambiar={(v) => setPanel('show_social', v)} />
        <FilaInterruptor titulo="Contacto dentro del menú" valor={panel.show_contact === true} onCambiar={(v) => setPanel('show_contact', v)} />
        <label className="flex flex-col gap-1 text-xs text-fg-secondary">
          Categorías
          <Select className={control} tamano="sm" valor={String(String(panel.categories || 'accordion')) || '__predeterminado__'} onValorChange={(valor) => setPanel('categories', (valor === '__predeterminado__' ? '' : valor))} opciones={[{ valor: String("accordion") || '__predeterminado__', etiqueta: String("Acordeón") }, { valor: String("list") || '__predeterminado__', etiqueta: String("Lista") }]} />
        </label>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-fg">{t('zonaGlobal.celular.barra')}</h3>
        <FilaInterruptor
          titulo={t('zonaGlobal.celular.barraOn')}
          valor={barra.enabled === true}
          onCambiar={(v) => setBarra(v ? { enabled: true, items: Array.isArray(barra.items) ? barra.items : ITEMS_BARRA_INICIALES } : { enabled: false })}
        />
        {barra.enabled === true && <EditorItems barra={barra} setBarra={setBarra} acento={acento} />}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-fg">{t('zonaGlobal.celular.disposicion')}</h3>
        <label className="flex flex-col gap-1 text-xs text-fg-secondary">
          {t('zonaGlobal.celular.logo')}
          <Select className={control} tamano="sm" valor={String(String(layout.logo || 'inherit')) || '__predeterminado__'} onValorChange={(valor) => setLayout('logo', (valor === '__predeterminado__' ? '' : valor))} opciones={[{ valor: String("inherit") || '__predeterminado__', etiqueta: String("Como el sitio") }, { valor: String("left") || '__predeterminado__', etiqueta: String("Izquierda") }, { valor: String("center") || '__predeterminado__', etiqueta: String("Centro") }, { valor: String("right") || '__predeterminado__', etiqueta: String("Derecha") }]} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-secondary">
          {t('zonaGlobal.celular.filas')}
          <Select className={control} tamano="sm" valor={String(String(layout.arrangement || '')) || '__predeterminado__'} onValorChange={(valor) => setLayout('arrangement', (valor === '__predeterminado__' ? '' : valor) || null)} opciones={[{ valor: String("") || '__predeterminado__', etiqueta: String("Como hoy") }, { valor: String("menu-logo-acciones") || '__predeterminado__', etiqueta: String("Menú · logo · acciones") }, { valor: String("logo-acciones-menu") || '__predeterminado__', etiqueta: String("Logo · acciones · menú") }, { valor: String("logo-sobre-acciones") || '__predeterminado__', etiqueta: String("Logo arriba") }, { valor: String("acciones-sobre-logo") || '__predeterminado__', etiqueta: String("Acciones arriba") }]} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-secondary">
          {t('zonaGlobal.celular.logoTam')}
          <input className={control} type="number" min={24} max={96} placeholder="Automático" value={layout.logo_size == null ? '' : String(layout.logo_size)} onChange={(e) => setLayout('logo_size', e.target.value ? Number(e.target.value) : null)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-secondary">
          {t('zonaGlobal.celular.alto')}
          <input className={control} type="number" min={48} max={120} placeholder="Automático" value={layout.header_height == null ? '' : String(layout.header_height)} onChange={(e) => setLayout('header_height', e.target.value ? Number(e.target.value) : null)} />
        </label>
        <FilaInterruptor titulo={t('zonaGlobal.celular.fijo')} valor={layout.sticky !== false} onCambiar={(v) => setLayout('sticky', v)} />
        <FilaInterruptor titulo={t('zonaGlobal.celular.oculta')} valor={layout.hide_on_scroll === true} onCambiar={(v) => setLayout('hide_on_scroll', v)} />
        <FilaInterruptor titulo={t('zonaGlobal.celular.transparente')} valor={layout.transparent_hero === true} onCambiar={(v) => setLayout('transparent_hero', v)} />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-fg">{t('zonaGlobal.celular.iconos')}</h3>
        <label className="flex flex-col gap-1 text-xs text-fg-secondary">
          {t('zonaGlobal.celular.hamburguesa')}
          <Select className={control} tamano="sm" valor={String(String(iconos.menu || 'lines3')) || '__predeterminado__'} onValorChange={(valor) => setIconos('menu', (valor === '__predeterminado__' ? '' : valor))} opciones={[{ valor: String("lines3") || '__predeterminado__', etiqueta: String("Tres líneas") }, { valor: String("lines2") || '__predeterminado__', etiqueta: String("Dos líneas") }, { valor: String("dots") || '__predeterminado__', etiqueta: String("Puntos") }, { valor: String("grid") || '__predeterminado__', etiqueta: String("Cuadrícula") }, { valor: String("text") || '__predeterminado__', etiqueta: String("Texto «Menú»") }]} />
        </label>
        <FilaInterruptor titulo="Mostrar menú" valor={iconos.show_menu !== false} onCambiar={(v) => setIconos('show_menu', v)} />
        <FilaInterruptor titulo="Mostrar búsqueda" valor={iconos.show_search !== false} onCambiar={(v) => setIconos('show_search', v)} />
        <FilaInterruptor titulo="Mostrar carrito" valor={iconos.show_cart !== false} onCambiar={(v) => setIconos('show_cart', v)} />
        <FilaInterruptor titulo="Mostrar cuenta" valor={iconos.show_account !== false} onCambiar={(v) => setIconos('show_account', v)} />
        <label className="flex flex-col gap-1 text-xs text-fg-secondary">
          {t('zonaGlobal.celular.estiloIcono')}
          <Select className={control} tamano="sm" valor={String(String(iconos.style || 'plain')) || '__predeterminado__'} onValorChange={(valor) => setIconos('style', (valor === '__predeterminado__' ? '' : valor))} opciones={[{ valor: String("plain") || '__predeterminado__', etiqueta: String("Solo ícono") }, { valor: String("circle") || '__predeterminado__', etiqueta: String("Fondo circular") }, { valor: String("border") || '__predeterminado__', etiqueta: String("Con borde") }]} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-secondary">
          {t('zonaGlobal.celular.buscador')}
          <Select className={control} tamano="sm" valor={String(String(header.search || '')) || '__predeterminado__'} onValorChange={(valor) => escribir('search', (valor === '__predeterminado__' ? '' : valor) || null)} opciones={[{ valor: String("") || '__predeterminado__', etiqueta: String("Como hoy") }, { valor: String("icon") || '__predeterminado__', etiqueta: String("Ícono") }, { valor: String("bar") || '__predeterminado__', etiqueta: String("Barra bajo el logo") }, { valor: String("fullscreen") || '__predeterminado__', etiqueta: String("Pantalla completa") }]} />
        </label>
      </section>
    </div>
  );
}

function EditorItems({ barra, setBarra, acento }: { barra: Record<string, unknown>; setBarra: (p: Record<string, unknown>) => void; acento: string }) {
  const t = useTextosEditor();
  const items = (Array.isArray(barra.items) ? barra.items : ITEMS_BARRA_INICIALES) as Record<string, unknown>[];
  const [arrastra, setArrastra] = useState<number | null>(null);
  const mover = (desde: number, hacia: number) => {
    if (hacia < 0 || hacia >= items.length || desde === hacia) return;
    const sig = [...items];
    const [item] = sig.splice(desde, 1);
    sig.splice(hacia, 0, item);
    setBarra({ items: sig });
  };
  return (
    <div className="flex flex-col gap-2">
      <EtiquetaGrupo id="items-barra">{t('zonaGlobal.celular.items')}</EtiquetaGrupo>
      <ul className="flex flex-col gap-2" aria-labelledby="items-barra">
        {items.map((item, i) => (
          <li
            key={String(item.id || i)}
            draggable
            onDragStart={() => setArrastra(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (arrastra != null) mover(arrastra, i); setArrastra(null); }}
            className="flex flex-col gap-1 rounded-md border border-line p-2"
          >
            <div className="flex gap-1">
              <input className={control} value={String(item.label || '')} aria-label="Texto del ítem" onChange={(e) => {
                const sig = items.map((it, j) => j === i ? { ...it, label: e.target.value } : it);
                setBarra({ items: sig });
              }} />
              <button type="button" className="px-2 text-xs" onClick={() => mover(i, i - 1)} aria-label="Subir">↑</button>
              <button type="button" className="px-2 text-xs" onClick={() => mover(i, i + 1)} aria-label="Bajar">↓</button>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <Select className={control} aria-label="Ícono" tamano="sm" valor={String(String(item.icon || 'home')) || '__predeterminado__'} onValorChange={(valor) => setBarra({ items: items.map((it, j) => j === i ? { ...it, icon: (valor === '__predeterminado__' ? '' : valor) } : it) })} opciones={[...(['home', 'grid', 'search', 'bag', 'cart', 'user', 'heart', 'tag', 'whatsapp', 'link'].map((ic) =>({ valor: String(ic) || '__predeterminado__', etiqueta: String(ic) })))]} />
              <Select className={control} aria-label="Acción" tamano="sm" valor={String(String(item.action || 'link')) || '__predeterminado__'} onValorChange={(valor) => setBarra({ items: items.map((it, j) => j === i ? { ...it, action: (valor === '__predeterminado__' ? '' : valor) } : it) })} opciones={[{ valor: String("link") || '__predeterminado__', etiqueta: String("Enlace") }, { valor: String("menu") || '__predeterminado__', etiqueta: String("Abrir el menú") }, { valor: String("search") || '__predeterminado__', etiqueta: String("Abrir la búsqueda") }, { valor: String("cart") || '__predeterminado__', etiqueta: String("Abrir el carrito") }]} />
            </div>
            <label className="flex items-center justify-between text-xs">
              <span>Mostrar texto</span>
              <input type="checkbox" checked={item.show_label !== false} onChange={(e) => setBarra({ items: items.map((it, j) => j === i ? { ...it, show_label: e.target.checked } : it) })} />
            </label>
          </li>
        ))}
      </ul>
      <label className="flex flex-col gap-1 text-xs text-fg-secondary">
        {t('zonaGlobal.celular.indicador')}
        <Select className={control} tamano="sm" valor={String(String(barra.indicator || 'pill')) || '__predeterminado__'} onValorChange={(valor) => setBarra({ indicator: (valor === '__predeterminado__' ? '' : valor) })} opciones={[{ valor: String("dot") || '__predeterminado__', etiqueta: String("Punto") }, { valor: String("line") || '__predeterminado__', etiqueta: String("Línea") }, { valor: String("pill") || '__predeterminado__', etiqueta: String("Píldora") }]} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-fg-secondary">
        {t('zonaGlobal.celular.central')}
        <Select className={control} tamano="sm" valor={String(String(barra.center_id || '')) || '__predeterminado__'} onValorChange={(valor) => setBarra({ center_id: (valor === '__predeterminado__' ? '' : valor) || null })} opciones={[{ valor: String("") || '__predeterminado__', etiqueta: String("Ninguno") }, ...(items.map((it) =>({ valor: String(String(it.id)) || '__predeterminado__', etiqueta: String(String(it.label || it.id)) })))]} />
      </label>
      <FilaInterruptor titulo="Sombra" valor={barra.shadow === true} onCambiar={(v) => setBarra({ shadow: v })} />
      <FilaInterruptor titulo="Borde superior" valor={barra.border !== false} onCambiar={(v) => setBarra({ border: v })} />
      <FilaInterruptor titulo="Flotante con margen" valor={barra.float === true} onCambiar={(v) => setBarra({ float: v })} />
      <p className="text-[11px] text-fg-muted" style={{ color: acento }}>Arrastra un ítem para cambiar el orden. Entre 3 y 5.</p>
    </div>
  );
}

/** Miniatura del celular: al tocar la hamburguesa corre la animación del estilo elegido. */
function VistaMini({ estilo, acento, animacion }: { estilo: string; acento: string; animacion: string }) {
  const t = useTextosEditor();
  const [abierto, setAbierto] = useState(false);
  const lado = estilo === 'drawer_left' ? 'left' : estilo === 'bottom_sheet' ? 'bottom' : estilo === 'top_dropdown' ? 'top' : estilo === 'fullscreen' ? 'full' : estilo === 'none' || estilo === 'tabs' ? 'none' : 'right';
  const transform = !abierto
    ? lado === 'left' ? 'translateX(-100%)' : lado === 'right' ? 'translateX(100%)' : lado === 'bottom' ? 'translateY(100%)' : lado === 'top' ? 'translateY(-100%)' : animacion === 'scale' ? 'scale(0.9)' : 'none'
    : 'none';
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="self-start text-xs text-fg-secondary">{t('zonaGlobal.celular.vista')}</p>
      <div className="relative h-44 w-28 overflow-hidden rounded-2xl border border-line bg-subtle">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="h-2 w-8 rounded-sm" style={{ background: acento }} />
          {estilo !== 'none' && estilo !== 'tabs' && (
            <button type="button" aria-label="Abrir menú de la miniatura" className="text-[10px] font-bold" onClick={() => setAbierto((v) => !v)}>☰</button>
          )}
        </div>
        {lado !== 'none' && (
          <div
            className={`absolute bg-white/95 shadow ${lado === 'left' ? 'left-0 top-0 h-full w-4/5' : lado === 'right' ? 'right-0 top-0 h-full w-4/5' : lado === 'bottom' ? 'inset-x-0 bottom-0 h-2/3 rounded-t-xl' : lado === 'top' ? 'inset-x-0 top-0 h-1/2' : 'inset-1 rounded-xl'}`}
            style={{
              transform,
              opacity: animacion === 'fade' ? (abierto ? 1 : 0) : 1,
              transition: 'transform 280ms ease, opacity 280ms ease',
              background: acento,
            }}
          />
        )}
        {(estilo === 'tabs' || estilo === 'none' || true) && (
          <div className="absolute inset-x-1 bottom-1 flex justify-around rounded-full bg-white py-1 text-[8px] shadow">
            <span>Inicio</span><span style={{ color: acento }}>Buscar</span><span>Carrito</span>
          </div>
        )}
      </div>
    </div>
  );
}
