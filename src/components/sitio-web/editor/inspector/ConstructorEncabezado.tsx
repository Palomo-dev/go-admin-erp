'use client';

/**
 * Pestaña «Constructor» del encabezado. No escribe hasta que se mueve un elemento
 * o se cambia un control. Sin `header_builder`, el sitio sigue con el header de hoy.
 */
import { useState } from 'react';
import { BUSCADORES_NUEVOS, FORMAS_CONTENEDOR, OBJETIVOS_ICONO, TIPOS, ZONAS, type ZonaHeader } from '@/lib/website/constructorEncabezado';

const control = 'h-8 w-full rounded-md border border-line bg-surface px-2 text-xs text-fg';
const ETIQUETA: Record<string, string> = {
  topbar_left: 'Topbar · izquierda', topbar_center: 'Topbar · centro', topbar_right: 'Topbar · derecha',
  header_left: 'Header · izquierda', header_center: 'Header · centro', header_right: 'Header · derecha',
  menu_left: 'Menú · izquierda', menu_center: 'Menú · centro', menu_right: 'Menú · derecha',
  mobile_header: 'Celular · header', mobile_bottom: 'Celular · barra',
  logo: 'Logo', menu: 'Menú', search: 'Buscador', currency: 'Moneda', cart: 'Carrito', account: 'Cuenta',
  favorites: 'Favoritos', whatsapp: 'WhatsApp', phone: 'Teléfono', social: 'Redes', text: 'Texto', button: 'Botón',
};

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? { ...(valor as Record<string, unknown>) } : {};
}

export function ConstructorEncabezado({
  ajustes, cambiar, acento,
}: {
  ajustes: Record<string, unknown>;
  cambiar: (c: Record<string, unknown>) => void;
  acento: string;
}) {
  const builder = objeto(ajustes.header_builder);
  const zones = objeto(builder.zones);
  const search = objeto(builder.search);
  const [sel, setSel] = useState<string | null>(null);
  const [arrastra, setArrastra] = useState<{ zona: string; i: number } | null>(null);
  const [vista, setVista] = useState<'escritorio' | 'celular'>('escritorio');

  const guardar = (siguiente: Record<string, unknown>) => {
    const limpio = Object.fromEntries(Object.entries(siguiente).filter(([, v]) => v != null && !(typeof v === 'object' && v && Object.keys(v as object).length === 0)));
    cambiar({ header_builder: Object.keys(limpio).length ? limpio : null });
  };
  const poner = (zona: ZonaHeader, tipo: string) => {
    const lista = Array.isArray(zones[zona]) ? [...(zones[zona] as object[])] : [];
    lista.push({ id: `${tipo}-${lista.length + 1}`, type: tipo, desktop: true, tablet: true, mobile: true });
    guardar({ ...builder, zones: { ...zones, [zona]: lista } });
  };
  const soltar = (destino: ZonaHeader) => {
    if (!arrastra) return;
    const origen = [...((zones[arrastra.zona] as object[]) || [])];
    const [item] = origen.splice(arrastra.i, 1);
    const lista = arrastra.zona === destino ? origen : [...((zones[destino] as object[]) || [])];
    if (!item) return;
    lista.splice(destino === arrastra.zona ? arrastra.i : lista.length, 0, item);
    const zonesSig = { ...zones, [arrastra.zona]: origen, [destino]: lista };
    guardar({ ...builder, zones: zonesSig });
    setArrastra(null);
  };

  const zonasVista = vista === 'celular' ? (['mobile_header', 'mobile_bottom'] as const) : ZONAS.filter((z) => !z.startsWith('mobile'));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <button type="button" className={control} onClick={() => setVista('escritorio')}>Escritorio</button>
        <button type="button" className={control} onClick={() => setVista('celular')}>Celular</button>
      </div>
      <div className="rounded-xl border border-line p-2" style={{ outline: `1px solid ${acento}` }}>
        {zonasVista.map((zona) => (
          <div
            key={zona}
            className="mb-1 min-h-8 rounded border border-dashed border-line px-1 py-1"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => soltar(zona)}
          >
            <p className="text-[10px] text-fg-muted">{ETIQUETA[zona]}</p>
            <div className="flex flex-wrap gap-1">
              {((zones[zona] as { id?: string; type?: string }[]) || []).map((el, i) => (
                <button
                  key={el.id || i}
                  type="button"
                  draggable
                  onDragStart={() => setArrastra({ zona, i })}
                  onClick={() => setSel(`${zona}:${i}`)}
                  className="rounded-full bg-subtle px-2 py-0.5 text-[11px]"
                >
                  {ETIQUETA[el.type || ''] || el.type}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <label className="text-xs text-fg-secondary">
        Agregar a la zona central
        <select className={control} value="" onChange={(e) => { if (e.target.value) poner(vista === 'celular' ? 'mobile_header' : 'header_center', e.target.value); }}>
          <option value="">Elegir elemento</option>
          {TIPOS.map((t) => <option key={t} value={t}>{ETIQUETA[t]}</option>)}
        </select>
      </label>
      <label className="text-xs text-fg-secondary">
        Buscador
        <select className={control} value={String(search.type || '')} onChange={(e) => guardar({ ...builder, search: e.target.value ? { ...search, type: e.target.value } : null })}>
          <option value="">El de hoy</option>
          <option value="bar">Barra</option>
          {BUSCADORES_NUEVOS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      {search.type ? (
        <>
          <input className={control} placeholder="Placeholder" value={String(search.placeholder || '')} onChange={(e) => guardar({ ...builder, search: { ...search, placeholder: e.target.value } })} />
          <select className={control} value={String(search.radius || 'rounded')} aria-label="Esquinas" onChange={(e) => guardar({ ...builder, search: { ...search, radius: e.target.value } })}>
            {['square', 'rounded', 'semi', 'pill'].map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </>
      ) : null}
      <Botones builder={builder} guardar={guardar} />
      <Mega builder={builder} guardar={guardar} />
      <ContenedorDetallado builder={builder} cambiar={cambiar} />
      <MenusDetallados builder={builder} guardar={guardar} />
      {sel && <InspectorSel sel={sel} zones={zones} builder={builder} guardar={guardar} />}
    </div>
  );
}

function Botones({ builder, guardar }: { builder: Record<string, unknown>; guardar: (b: Record<string, unknown>) => void }) {
  const buttons = Array.isArray(builder.buttons) ? builder.buttons as Record<string, unknown>[] : [];
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span>Botones</span>
        <button type="button" className="underline" onClick={() => guardar({ ...builder, buttons: [...buttons, { id: `b${buttons.length + 1}`, text: 'Acción', action: 'link', href: '/', style: 'solid', shape: 'pill', size: 'md' }] })}>Agregar</button>
      </div>
      {buttons.map((b, i) => (
        <div key={i} className="grid grid-cols-2 gap-1">
          <input className={control} value={String(b.text || '')} aria-label="Texto del botón" onChange={(e) => guardar({ ...builder, buttons: buttons.map((x, j) => j === i ? { ...x, text: e.target.value } : x) })} />
          <select className={control} aria-label="Función" value={String(b.action || 'link')} onChange={(e) => guardar({ ...builder, buttons: buttons.map((x, j) => j === i ? { ...x, action: e.target.value } : x) })}>
            {['link', 'whatsapp', 'call', 'cart', 'search', 'menu', 'modal', 'category', 'download'].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}

function Mega({ builder, guardar }: { builder: Record<string, unknown>; guardar: (b: Record<string, unknown>) => void }) {
  const mega = Array.isArray(builder.mega) ? builder.mega as Record<string, unknown>[] : [];
  return (
    <div className="flex flex-col gap-1">
      <button type="button" className="text-left text-xs font-semibold underline" onClick={() => guardar({
        ...builder,
        mega: [...mega, { href: '/categorias', columns: 3, open: 'hover', columns_data: [{ title: 'Columna', links: [{ label: 'Ver todo', href: '/categorias' }] }] }],
      })}>Agregar mega menú</button>
      {mega.map((m, i) => (
        <input key={i} className={control} value={String(m.href || '')} aria-label="Enlace del mega menú" onChange={(e) => guardar({ ...builder, mega: mega.map((x, j) => j === i ? { ...x, href: e.target.value } : x) })} />
      ))}
    </div>
  );
}

function InspectorSel({
  sel, zones, builder, guardar,
}: {
  sel: string
  zones: Record<string, unknown>
  builder: Record<string, unknown>
  guardar: (b: Record<string, unknown>) => void
}) {
  const [zona, indice] = sel.split(':');
  const lista = (Array.isArray(zones[zona]) ? zones[zona] : []) as Record<string, unknown>[];
  const el = lista[Number(indice)];
  if (!el) return null;
  const icons = objeto(builder.icons);
  const tipo = String(el.type || '');
  const icono = objeto(icons[tipo]);
  const setIcono = (k: string, v: unknown) => guardar({ ...builder, icons: { ...icons, [tipo]: { ...icono, [k]: v } } });
  const setEl = (k: string, v: unknown) => {
    const sig = lista.map((x, i) => i === Number(indice) ? { ...x, [k]: v } : x);
    guardar({ ...builder, zones: { ...zones, [zona]: sig } });
  };
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-2">
      <p className="text-xs font-semibold">{ETIQUETA[tipo]}</p>
      <p className="text-[11px] font-semibold">Ícono</p>
      <label className="text-[11px]">Ícono
        <select className={control} value={String(icono.icon || '')} onChange={(e) => setIcono('icon', e.target.value)}>
          <option value="">El de hoy</option>
          {['search', 'shopping-bag', 'shopping-cart', 'user', 'heart', 'globe', 'phone'].map((ic) => <option key={ic} value={ic}>{ic}</option>)}
        </select>
      </label>
      <label className="text-[11px]">Trazo
        <select className={control} value={String(icono.weight || 'contorno')} onChange={(e) => setIcono('weight', e.target.value)}>
          <option value="contorno">Contorno</option>
          <option value="relleno">Relleno</option>
          <option value="duotono">Duotono</option>
        </select>
      </label>
      <label className="text-[11px]">Contenedor
        <select className={control} value={String(icono.container || 'none')} onChange={(e) => setIcono('container', e.target.value)}>
          <option value="none">Ninguno</option>
          <option value="circle">Círculo</option>
          <option value="rounded">Cuadrado redondeado</option>
          <option value="square">Cuadrado</option>
        </select>
      </label>
      <p className="text-[11px] font-semibold">Estilo</p>
      <label className="text-[11px]">Color<input type="color" value={typeof icono.color === 'string' ? icono.color : '#111111'} onChange={(e) => setIcono('color', e.target.value)} /></label>
      <label className="text-[11px]">Fondo<input type="color" value={typeof icono.background === 'string' ? icono.background : '#ffffff'} onChange={(e) => setIcono('background', e.target.value)} /></label>
      <label className="text-[11px]">Borde<input type="color" value={typeof icono.border === 'string' ? icono.border : '#e5e7eb'} onChange={(e) => setIcono('border', e.target.value)} /></label>
      <label className="text-[11px]">Hover<input type="color" value={typeof icono.hover === 'string' ? icono.hover : '#111111'} onChange={(e) => setIcono('hover', e.target.value)} /></label>
      <p className="text-[11px] font-semibold">Visibilidad</p>
      <label className="flex justify-between text-[11px]"><span>Escritorio</span><input type="checkbox" checked={el.desktop !== false} onChange={(e) => setEl('desktop', e.target.checked)} /></label>
      <label className="flex justify-between text-[11px]"><span>Tablet</span><input type="checkbox" checked={el.tablet !== false} onChange={(e) => setEl('tablet', e.target.checked)} /></label>
      <label className="flex justify-between text-[11px]"><span>Celular</span><input type="checkbox" checked={el.mobile !== false} onChange={(e) => setEl('mobile', e.target.checked)} /></label>
    </div>
  );
}

const OBJETIVO_ETIQUETA: Record<string, string> = {
  all: 'Todos los íconos', cart: 'Carrito', account: 'Cuenta', currency: 'Moneda', favorites: 'Favoritos', search: 'Búsqueda',
}
const FORMA_ETIQUETA: Record<string, string> = {
  none: 'Solo ícono', circle: 'Círculo', square: 'Cuadrado', rounded: 'Redondeado', semi: 'Semi', squircle: 'Squircle',
}

function ContenedorDetallado({ builder, cambiar }: { builder: Record<string, unknown>; cambiar: (c: Record<string, unknown>) => void }) {
  const caja = objeto(builder.icon_container)
  const [objetivo, setObjetivo] = useState<'all' | (typeof OBJETIVOS_ICONO)[number]>('all')
  const actual = objetivo === 'all' ? caja : objeto(objeto(caja.targets)[objetivo])
  const escribir = (patch: Record<string, unknown>) => {
    const base: Record<string, unknown> = { ...caja, shape: typeof caja.shape === 'string' ? caja.shape : 'circle' }
    let icon_container: Record<string, unknown>
    if (objetivo === 'all') icon_container = { ...base, ...patch, scope: base.scope === 'each' ? 'each' : 'all' }
    else {
      const targets = objeto(base.targets)
      const forma = typeof actual.shape === 'string' ? actual.shape : typeof base.shape === 'string' ? base.shape : 'circle'
      targets[objetivo] = { ...actual, ...patch, shape: forma }
      icon_container = { ...base, scope: 'each', targets }
    }
    const { icon_container: _fuera, ...resto } = builder
    cambiar({ header_icons_circle: false, header_builder: { ...resto, icon_container } })
  }
  const num = (clave: string, min: number, max: number, etiqueta: string) => (
    <label className="text-[11px]">{etiqueta}
      <input className={control} type="number" min={min} max={max} aria-label={etiqueta} value={actual[clave] == null ? '' : String(actual[clave])} onChange={(e) => {
        const raw = e.target.value
        if (!raw.trim()) { escribir({ [clave]: undefined }); return }
        const n = Math.round(Number(raw))
        if (Number.isFinite(n)) escribir({ [clave]: Math.min(max, Math.max(min, n)) })
      }} />
    </label>
  )
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-2">
      <p className="text-xs font-semibold">Contenedor de íconos</p>
      <label className="text-[11px]">Aplicar a
        <select className={control} aria-label="Aplicar contenedor a" value={objetivo} onChange={(e) => setObjetivo(e.target.value as typeof objetivo)}>
          <option value="all">{OBJETIVO_ETIQUETA.all}</option>
          {OBJETIVOS_ICONO.map((c) => <option key={c} value={c}>{OBJETIVO_ETIQUETA[c]}</option>)}
        </select>
      </label>
      <label className="text-[11px]">Forma
        <select className={control} aria-label="Forma del contenedor" value={String(actual.shape || caja.shape || '')} onChange={(e) => escribir({ shape: e.target.value })}>
          <option value="">Elegir</option>
          {FORMAS_CONTENEDOR.map((f) => <option key={f} value={f}>{FORMA_ETIQUETA[f]}</option>)}
        </select>
      </label>
      {(actual.shape || caja.shape) === 'rounded' && num('radius', 4, 16, 'Radio')}
      <div className="grid grid-cols-3 gap-1">
        {num('box', 24, 64, 'Caja')}
        {num('icon', 12, 40, 'Ícono')}
        {num('padding', 0, 16, 'Padding')}
      </div>
      <label className="text-[11px]">Fondo
        <select className={control} aria-label="Fondo del contenedor" value={['primary', 'accent', 'secondary', 'transparent'].includes(String(actual.background)) ? String(actual.background) : actual.background ? 'hex' : ''} onChange={(e) => {
          const v = e.target.value
          if (v === 'hex') escribir({ background: '#111111', gradient_1: undefined, gradient_2: undefined })
          else escribir({ background: v || undefined, gradient_1: undefined, gradient_2: undefined })
        }}>
          <option value="">Sin fondo</option>
          <option value="primary">Primario</option>
          <option value="accent">Acento</option>
          <option value="secondary">Secundario</option>
          <option value="transparent">Transparente</option>
          <option value="hex">Color propio</option>
        </select>
      </label>
      {typeof actual.background === 'string' && !['primary', 'accent', 'secondary', 'transparent'].includes(actual.background) && (
        <label className="text-[11px]">Color de fondo<input type="color" aria-label="Color de fondo" value={String(actual.background)} onChange={(e) => escribir({ background: e.target.value })} /></label>
      )}
      <div className="grid grid-cols-3 gap-1">
        <label className="text-[11px]">Degradado<input type="color" aria-label="Degradado 1" value={typeof actual.gradient_1 === 'string' ? actual.gradient_1 : '#111111'} onChange={(e) => escribir({ gradient_1: e.target.value })} /></label>
        <label className="text-[11px]">Hasta<input type="color" aria-label="Degradado 2" value={typeof actual.gradient_2 === 'string' ? actual.gradient_2 : '#ffffff'} onChange={(e) => escribir({ gradient_2: e.target.value })} /></label>
        {num('angle', 0, 360, 'Ángulo')}
      </div>
      {num('opacity', 0, 100, 'Opacidad')}
      <div className="grid grid-cols-3 gap-1">
        {num('border_width', 0, 4, 'Borde')}
        <label className="text-[11px]">Estilo
          <select className={control} aria-label="Estilo del borde" value={String(actual.border_style || 'solid')} onChange={(e) => escribir({ border_style: e.target.value })}>
            <option value="solid">Sólido</option>
            <option value="dotted">Punteado</option>
          </select>
        </label>
        <label className="text-[11px]">Color<input type="color" aria-label="Color del borde" value={typeof actual.border_color === 'string' && actual.border_color.startsWith('#') ? actual.border_color : '#94a3b8'} onChange={(e) => escribir({ border_color: e.target.value })} /></label>
      </div>
      <label className="text-[11px]">Sombra
        <select className={control} aria-label="Sombra" value={String(actual.shadow || 'none')} onChange={(e) => escribir({ shadow: e.target.value })}>
          <option value="none">Ninguna</option>
          <option value="sm">Suave</option>
          <option value="md">Media</option>
          <option value="lg">Flotante</option>
        </select>
      </label>
      <label className="text-[11px]">Color de sombra<input type="color" aria-label="Color de sombra" value={typeof actual.shadow_color === 'string' && actual.shadow_color.startsWith('#') ? actual.shadow_color : '#0f172a'} onChange={(e) => escribir({ shadow_color: e.target.value })} /></label>
      <p className="text-[11px] font-semibold">Hover y activo</p>
      <label className="text-[11px]">Color al pasar<input type="color" aria-label="Color al pasar" value={typeof actual.hover_color === 'string' && actual.hover_color.startsWith('#') ? actual.hover_color : '#111111'} onChange={(e) => escribir({ hover_color: e.target.value })} /></label>
      <label className="text-[11px]">Fondo al pasar<input type="color" aria-label="Fondo al pasar" value={typeof actual.hover_background === 'string' && actual.hover_background.startsWith('#') ? actual.hover_background : '#ffffff'} onChange={(e) => escribir({ hover_background: e.target.value })} /></label>
      {num('hover_scale', 90, 120, 'Escala')}
      <label className="text-[11px]">Sombra al pasar
        <select className={control} aria-label="Sombra al pasar" value={String(actual.hover_shadow || '')} onChange={(e) => escribir({ hover_shadow: e.target.value || undefined })}>
          <option value="">La misma</option>
          <option value="none">Ninguna</option>
          <option value="sm">Suave</option>
          <option value="md">Media</option>
          <option value="lg">Flotante</option>
        </select>
      </label>
      <label className="text-[11px]">Color activo<input type="color" aria-label="Color activo" value={typeof actual.active_color === 'string' && actual.active_color.startsWith('#') ? actual.active_color : '#111111'} onChange={(e) => escribir({ active_color: e.target.value })} /></label>
      <p className="text-[11px] font-semibold">Ícono</p>
      <label className="text-[11px]">Color del ícono<input type="color" aria-label="Color del ícono" value={typeof actual.icon_color === 'string' && actual.icon_color.startsWith('#') ? actual.icon_color : '#111111'} onChange={(e) => escribir({ icon_color: e.target.value })} /></label>
      <label className="text-[11px]">Trazo
        <select className={control} aria-label="Trazo del ícono" value={String(actual.weight || 'contorno')} onChange={(e) => escribir({ weight: e.target.value })}>
          <option value="contorno">Contorno</option>
          <option value="relleno">Relleno</option>
          <option value="duotono">Duotono</option>
        </select>
      </label>
      {num('stroke', 1, 4, 'Grosor')}
      {objetivo === 'all' || objetivo === 'cart' ? (
        <>
          <p className="text-[11px] font-semibold">Contador del carrito</p>
          <label className="text-[11px]">Forma
            <select className={control} aria-label="Forma del contador" value={String((objetivo === 'all' ? caja : actual).badge_shape || 'circle')} onChange={(e) => escribir({ badge_shape: e.target.value })}>
              <option value="circle">Círculo</option>
              <option value="pill">Píldora</option>
            </select>
          </label>
          <label className="text-[11px]">Posición
            <select className={control} aria-label="Posición del contador" value={String((objetivo === 'all' ? caja : actual).badge_position || 'top-right')} onChange={(e) => escribir({ badge_position: e.target.value })}>
              <option value="top-right">Arriba a la derecha</option>
              <option value="top-left">Arriba a la izquierda</option>
            </select>
          </label>
          <label className="text-[11px]">Color del contador<input type="color" aria-label="Color del contador" value={typeof (objetivo === 'all' ? caja : actual).badge_color === 'string' ? String((objetivo === 'all' ? caja : actual).badge_color) : '#111111'} onChange={(e) => escribir({ badge_color: e.target.value })} /></label>
        </>
      ) : null}
    </div>
  )
}

function MenusDetallados({ builder, guardar }: { builder: Record<string, unknown>; guardar: (b: Record<string, unknown>) => void }) {
  const menus = Array.isArray(builder.menus) ? builder.menus as Record<string, unknown>[] : []
  const poner = (lista: Record<string, unknown>[]) => guardar({ ...builder, menus: lista.length ? lista : null })
  const setMenu = (i: number, patch: Record<string, unknown>) => poner(menus.map((m, j) => j === i ? { ...m, ...patch } : m))
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span>Menús</span>
        <button type="button" className="underline" onClick={() => poner([...menus, { id: `m${menus.length + 1}`, name: `Menú ${menus.length + 1}`, zone: 'menu_center', type: 'links', mobile: true, mobile_order: menus.length, items: [{ label: 'Inicio', href: '/', kind: 'link' }] }])}>Agregar</button>
      </div>
      {menus.map((menu, i) => {
        const items = Array.isArray(menu.items) ? menu.items as Record<string, unknown>[] : []
        const setItems = (lista: Record<string, unknown>[]) => setMenu(i, { items: lista })
        return (
          <div key={String(menu.id || i)} className="flex flex-col gap-1 rounded-lg border border-line p-2">
            <input className={control} aria-label="Nombre del menú" value={String(menu.name || '')} onChange={(e) => setMenu(i, { name: e.target.value })} />
            <div className="grid grid-cols-2 gap-1">
              <select className={control} aria-label="Zona del menú" value={String(menu.zone || 'menu_center')} onChange={(e) => setMenu(i, { zone: e.target.value })}>
                {ZONAS.map((z) => <option key={z} value={z}>{ETIQUETA[z]}</option>)}
              </select>
              <select className={control} aria-label="Tipo de menú" value={String(menu.type || 'links')} onChange={(e) => setMenu(i, { type: e.target.value })}>
                <option value="links">Enlaces</option>
                <option value="mega">Mega menú</option>
                <option value="mixed">Mixto</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <select className={control} aria-label="Indicador" value={String(menu.indicator || 'none')} onChange={(e) => setMenu(i, { indicator: e.target.value })}>
                <option value="none">Sin indicador</option>
                <option value="underline">Subrayado</option>
                <option value="pill">Píldora</option>
                <option value="background">Fondo</option>
              </select>
              <select className={control} aria-label="Fuente del menú" value={String(menu.font || 'sans')} onChange={(e) => setMenu(i, { font: e.target.value })}>
                <option value="sans">Sans</option>
                <option value="serif">Serif</option>
                <option value="mono">Mono</option>
              </select>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <label className="text-[11px]">Tamaño<input className={control} type="number" min={10} max={24} aria-label="Tamaño" value={menu.size == null ? '' : String(menu.size)} onChange={(e) => setMenu(i, { size: e.target.value ? Number(e.target.value) : undefined })} /></label>
              <label className="text-[11px]">Separación<input className={control} type="number" min={0} max={40} aria-label="Separación" value={menu.gap == null ? '' : String(menu.gap)} onChange={(e) => setMenu(i, { gap: e.target.value ? Number(e.target.value) : undefined })} /></label>
              <label className="text-[11px]">Orden celular<input className={control} type="number" min={0} max={20} aria-label="Orden en el celular" value={menu.mobile_order == null ? String(i) : String(menu.mobile_order)} onChange={(e) => setMenu(i, { mobile_order: Number(e.target.value) })} /></label>
            </div>
            <label className="text-[11px]">Peso
              <select className={control} aria-label="Peso" value={String(menu.weight || 'medium')} onChange={(e) => setMenu(i, { weight: e.target.value })}>
                <option value="normal">Normal</option>
                <option value="medium">Medio</option>
                <option value="semibold">Seminegrita</option>
                <option value="bold">Negrita</option>
              </select>
            </label>
            <div className="grid grid-cols-3 gap-1">
              <label className="text-[11px]">Color<input type="color" aria-label="Color del menú" value={typeof menu.color === 'string' ? menu.color : '#111111'} onChange={(e) => setMenu(i, { color: e.target.value })} /></label>
              <label className="text-[11px]">Hover<input type="color" aria-label="Color al pasar" value={typeof menu.hover === 'string' ? menu.hover : '#111111'} onChange={(e) => setMenu(i, { hover: e.target.value })} /></label>
              <label className="text-[11px]">Activo<input type="color" aria-label="Color activo" value={typeof menu.active === 'string' ? menu.active : '#111111'} onChange={(e) => setMenu(i, { active: e.target.value })} /></label>
            </div>
            <label className="flex justify-between text-[11px]"><span>Mayúsculas</span><input type="checkbox" aria-label="Mayúsculas" checked={menu.uppercase === true} onChange={(e) => setMenu(i, { uppercase: e.target.checked })} /></label>
            <label className="flex justify-between text-[11px]"><span>En el menú móvil</span><input type="checkbox" aria-label="En el menú móvil" checked={menu.mobile !== false} onChange={(e) => setMenu(i, { mobile: e.target.checked })} /></label>
            {items.map((item, k) => (
              <div key={k} className="grid grid-cols-2 gap-1">
                <input className={control} aria-label="Texto del ítem" value={String(item.label || '')} onChange={(e) => setItems(items.map((x, j) => j === k ? { ...x, label: e.target.value } : x))} />
                <input className={control} aria-label="Enlace del ítem" value={String(item.href || '')} onChange={(e) => setItems(items.map((x, j) => j === k ? { ...x, href: e.target.value } : x))} />
                <select className={control} aria-label="Tipo de ítem" value={String(item.kind || 'link')} onChange={(e) => setItems(items.map((x, j) => j === k ? { ...x, kind: e.target.value } : x))}>
                  <option value="link">Enlace</option>
                  <option value="dropdown">Desplegable</option>
                  <option value="mega">Mega</option>
                </select>
                <input className={control} aria-label="Etiqueta" placeholder="Nuevo" value={String(item.badge || '')} onChange={(e) => setItems(items.map((x, j) => j === k ? { ...x, badge: e.target.value } : x))} />
              </div>
            ))}
            <button type="button" className="text-left text-[11px] underline" onClick={() => setItems([...items, { label: 'Enlace', href: '/', kind: 'link' }])}>Agregar ítem</button>
          </div>
        )
      })}
    </div>
  )
}
