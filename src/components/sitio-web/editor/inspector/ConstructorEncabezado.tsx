'use client';

/**
 * Pestaña «Constructor» del encabezado. No escribe hasta que se mueve un elemento
 * o se cambia un control. Sin `header_builder`, el sitio sigue con el header de hoy.
 */
import { useState } from 'react';
import { Select, FormField } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { ColorMarcaField } from '@/components/sitio-web/ui/ColorMarcaField';
import type { ColoresMarca } from '@/lib/website/v2/colorMarca';
import { FilaInterruptor } from './PartesZonaGlobal';
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
  ajustes, cambiar, acento, colores = { acento },
}: {
  ajustes: Record<string, unknown>;
  cambiar: (c: Record<string, unknown>) => void;
  acento: string;
  colores?: ColoresMarca;
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
        <Select className={control} tamano="sm" valor={String("") || '__predeterminado__'} onValorChange={(valor) => { if ((valor === '__predeterminado__' ? '' : valor)) poner(vista === 'celular' ? 'mobile_header' : 'header_center', (valor === '__predeterminado__' ? '' : valor)); }} opciones={[{ valor: String("") || '__predeterminado__', etiqueta: String("Elegir elemento") }, ...(TIPOS.map((t) =>({ valor: String(t) || '__predeterminado__', etiqueta: String(ETIQUETA[t]) })))]} />
      </label>
      <label className="text-xs text-fg-secondary">
        Buscador
        <Select className={control} tamano="sm" valor={String(String(search.type || '')) || '__predeterminado__'} onValorChange={(valor) => guardar({ ...builder, search: (valor === '__predeterminado__' ? '' : valor) ? { ...search, type: (valor === '__predeterminado__' ? '' : valor) } : null })} opciones={[{ valor: String("") || '__predeterminado__', etiqueta: String("El de hoy") }, { valor: String("bar") || '__predeterminado__', etiqueta: String("Barra") }, ...(BUSCADORES_NUEVOS.map((t) =>({ valor: String(t) || '__predeterminado__', etiqueta: String(t) })))]} />
      </label>
      {search.type ? (
        <>
          <input className={control} placeholder="Placeholder" value={String(search.placeholder || '')} onChange={(e) => guardar({ ...builder, search: { ...search, placeholder: e.target.value } })} />
          <Select className={control} aria-label="Esquinas" tamano="sm" valor={String(String(search.radius || 'rounded')) || '__predeterminado__'} onValorChange={(valor) => guardar({ ...builder, search: { ...search, radius: (valor === '__predeterminado__' ? '' : valor) } })} opciones={[...(['square', 'rounded', 'semi', 'pill'].map((f) =>({ valor: String(f) || '__predeterminado__', etiqueta: String(f) })))]} />
        </>
      ) : null}
      {!!search.type && (
        <section className="flex flex-col gap-3" aria-label="Apariencia del buscador">
          <FormField etiqueta="Borde del buscador">
            {(campo) => <Select id={campo.id} aria-describedby={campo['aria-describedby']} aria-invalid={campo['aria-invalid']} aria-labelledby={campo.idEtiqueta} tamano="sm" valor={String(search.border || 'thin')} opciones={[{ valor: 'none', etiqueta: 'Sin borde' }, { valor: 'thin', etiqueta: 'Fino' }, { valor: 'thick', etiqueta: 'Grueso' }]} onValorChange={(v) => guardar({ ...builder, search: { ...search, border: v } })} />}
          </FormField>
          <ColorMarcaField etiqueta="Color del borde" valor={String(search.border_color || 'marca:acento')} colores={colores} onCambiar={(v) => guardar({ ...builder, search: { ...search, border_color: v } })} />
          <ColorMarcaField etiqueta="Fondo del buscador" valor={String(search.background || 'marca:fondo')} colores={colores} onCambiar={(v) => guardar({ ...builder, search: { ...search, background: v } })} />
          <FilaInterruptor titulo="Sombra del buscador" valor={search.shadow === true} onCambiar={(v) => guardar({ ...builder, search: { ...search, shadow: v } })} />
          <FormField etiqueta="Ícono del buscador">
            {(campo) => <Select id={campo.id} aria-describedby={campo['aria-describedby']} aria-invalid={campo['aria-invalid']} aria-labelledby={campo.idEtiqueta} tamano="sm" valor={String(search.icon || 'search')} opciones={[{ valor: 'search', etiqueta: 'Lupa' }, { valor: 'scan-search', etiqueta: 'Escanear' }]} onValorChange={(v) => guardar({ ...builder, search: { ...search, icon: v } })} />}
          </FormField>
          <FormField etiqueta="Posición del ícono">
            {(campo) => <Select id={campo.id} aria-describedby={campo['aria-describedby']} aria-invalid={campo['aria-invalid']} aria-labelledby={campo.idEtiqueta} tamano="sm" valor={String(search.icon_side || 'left')} opciones={[{ valor: 'left', etiqueta: 'Izquierda' }, { valor: 'right', etiqueta: 'Derecha' }]} onValorChange={(v) => guardar({ ...builder, search: { ...search, icon_side: v } })} />}
          </FormField>
          <ColorMarcaField etiqueta="Color del ícono de búsqueda" valor={String(search.icon_color || 'marca:texto')} colores={colores} onCambiar={(v) => guardar({ ...builder, search: { ...search, icon_color: v } })} />
          <FormField etiqueta="Botón de búsqueda">
            {(campo) => <Select id={campo.id} aria-describedby={campo['aria-describedby']} aria-invalid={campo['aria-invalid']} aria-labelledby={campo.idEtiqueta} tamano="sm" valor={String(search.button || 'none')} opciones={[{ valor: 'none', etiqueta: 'Sin botón' }, { valor: 'text', etiqueta: 'Texto Buscar' }, { valor: 'icon', etiqueta: 'Ícono' }]} onValorChange={(v) => guardar({ ...builder, search: { ...search, button: v } })} />}
          </FormField>
          <FormField etiqueta="Buscador en celular">
            {(campo) => <Select id={campo.id} aria-labelledby={campo.idEtiqueta} tamano="sm" valor={String(search.mobile || 'bar')} opciones={[{ valor: 'bar', etiqueta: 'Barra visible' }, { valor: 'icon', etiqueta: 'Ícono' }, { valor: 'fullscreen', etiqueta: 'Panel de pantalla completa' }]} onValorChange={(v) => guardar({ ...builder, search: { ...search, mobile: v } })} />}
          </FormField>
          <FormField etiqueta="Ancho máximo del buscador">
            <Input type="number" min={120} max={960} value={search.width == null ? '' : String(search.width)} placeholder="Automático" onChange={(e) => guardar({ ...builder, search: { ...search, width: e.target.value ? Math.min(960, Math.max(120, Number(e.target.value))) : undefined } })} />
          </FormField>
        </section>
      )}
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
          <Select className={control} aria-label="Función" tamano="sm" valor={String(String(b.action || 'link')) || '__predeterminado__'} onValorChange={(valor) => guardar({ ...builder, buttons: buttons.map((x, j) => j === i ? { ...x, action: (valor === '__predeterminado__' ? '' : valor) } : x) })} opciones={[...(['link', 'whatsapp', 'call', 'cart', 'search', 'menu', 'modal', 'category', 'download'].map((a) =>({ valor: String(a) || '__predeterminado__', etiqueta: String(a) })))]} />
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
        <Select className={control} tamano="sm" valor={String(String(icono.icon || '')) || '__predeterminado__'} onValorChange={(valor) => setIcono('icon', (valor === '__predeterminado__' ? '' : valor))} opciones={[{ valor: String("") || '__predeterminado__', etiqueta: String("El de hoy") }, ...(['search', 'shopping-bag', 'shopping-cart', 'user', 'heart', 'globe', 'phone'].map((ic) =>({ valor: String(ic) || '__predeterminado__', etiqueta: String(ic) })))]} />
      </label>
      <label className="text-[11px]">Trazo
        <Select className={control} tamano="sm" valor={String(String(icono.weight || 'contorno')) || '__predeterminado__'} onValorChange={(valor) => setIcono('weight', (valor === '__predeterminado__' ? '' : valor))} opciones={[{ valor: String("contorno") || '__predeterminado__', etiqueta: String("Contorno") }, { valor: String("relleno") || '__predeterminado__', etiqueta: String("Relleno") }, { valor: String("duotono") || '__predeterminado__', etiqueta: String("Duotono") }]} />
      </label>
      <label className="text-[11px]">Contenedor
        <Select className={control} tamano="sm" valor={String(String(icono.container || 'none')) || '__predeterminado__'} onValorChange={(valor) => setIcono('container', (valor === '__predeterminado__' ? '' : valor))} opciones={[{ valor: String("none") || '__predeterminado__', etiqueta: String("Ninguno") }, { valor: String("circle") || '__predeterminado__', etiqueta: String("Círculo") }, { valor: String("rounded") || '__predeterminado__', etiqueta: String("Cuadrado redondeado") }, { valor: String("square") || '__predeterminado__', etiqueta: String("Cuadrado") }]} />
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
    const resto = Object.fromEntries(Object.entries(builder).filter(([clave]) => clave !== 'icon_container'))
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
        <Select className={control} aria-label="Aplicar contenedor a" tamano="sm" valor={String(objetivo) || '__predeterminado__'} onValorChange={(valor) => setObjetivo((valor === '__predeterminado__' ? '' : valor) as typeof objetivo)} opciones={[{ valor: String("all") || '__predeterminado__', etiqueta: String(OBJETIVO_ETIQUETA.all) }, ...(OBJETIVOS_ICONO.map((c) =>({ valor: String(c) || '__predeterminado__', etiqueta: String(OBJETIVO_ETIQUETA[c]) })))]} />
      </label>
      <label className="text-[11px]">Forma
        <Select className={control} aria-label="Forma del contenedor" tamano="sm" valor={String(String(actual.shape || caja.shape || '')) || '__predeterminado__'} onValorChange={(valor) => escribir({ shape: (valor === '__predeterminado__' ? '' : valor) })} opciones={[{ valor: String("") || '__predeterminado__', etiqueta: String("Elegir") }, ...(FORMAS_CONTENEDOR.map((f) =>({ valor: String(f) || '__predeterminado__', etiqueta: String(FORMA_ETIQUETA[f]) })))]} />
      </label>
      {(actual.shape || caja.shape) === 'rounded' && num('radius', 4, 16, 'Radio')}
      <div className="grid grid-cols-3 gap-1">
        {num('box', 24, 64, 'Caja')}
        {num('icon', 12, 40, 'Ícono')}
        {num('padding', 0, 16, 'Padding')}
      </div>
      <label className="text-[11px]">Fondo
        <Select className={control} aria-label="Fondo del contenedor" tamano="sm" valor={String(['primary', 'accent', 'secondary', 'transparent'].includes(String(actual.background)) ? String(actual.background) : actual.background ? 'hex' : '') || '__predeterminado__'} onValorChange={(valor) => {
          const v = (valor === '__predeterminado__' ? '' : valor)
          if (v === 'hex') escribir({ background: '#111111', gradient_1: undefined, gradient_2: undefined })
          else escribir({ background: v || undefined, gradient_1: undefined, gradient_2: undefined })
        }} opciones={[{ valor: String("") || '__predeterminado__', etiqueta: String("Sin fondo") }, { valor: String("primary") || '__predeterminado__', etiqueta: String("Primario") }, { valor: String("accent") || '__predeterminado__', etiqueta: String("Acento") }, { valor: String("secondary") || '__predeterminado__', etiqueta: String("Secundario") }, { valor: String("transparent") || '__predeterminado__', etiqueta: String("Transparente") }, { valor: String("hex") || '__predeterminado__', etiqueta: String("Color propio") }]} />
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
          <Select className={control} aria-label="Estilo del borde" tamano="sm" valor={String(String(actual.border_style || 'solid')) || '__predeterminado__'} onValorChange={(valor) => escribir({ border_style: (valor === '__predeterminado__' ? '' : valor) })} opciones={[{ valor: String("solid") || '__predeterminado__', etiqueta: String("Sólido") }, { valor: String("dotted") || '__predeterminado__', etiqueta: String("Punteado") }]} />
        </label>
        <label className="text-[11px]">Color<input type="color" aria-label="Color del borde" value={typeof actual.border_color === 'string' && actual.border_color.startsWith('#') ? actual.border_color : '#94a3b8'} onChange={(e) => escribir({ border_color: e.target.value })} /></label>
      </div>
      <label className="text-[11px]">Sombra
        <Select className={control} aria-label="Sombra" tamano="sm" valor={String(String(actual.shadow || 'none')) || '__predeterminado__'} onValorChange={(valor) => escribir({ shadow: (valor === '__predeterminado__' ? '' : valor) })} opciones={[{ valor: String("none") || '__predeterminado__', etiqueta: String("Ninguna") }, { valor: String("sm") || '__predeterminado__', etiqueta: String("Suave") }, { valor: String("md") || '__predeterminado__', etiqueta: String("Media") }, { valor: String("lg") || '__predeterminado__', etiqueta: String("Flotante") }]} />
      </label>
      <label className="text-[11px]">Color de sombra<input type="color" aria-label="Color de sombra" value={typeof actual.shadow_color === 'string' && actual.shadow_color.startsWith('#') ? actual.shadow_color : '#0f172a'} onChange={(e) => escribir({ shadow_color: e.target.value })} /></label>
      <p className="text-[11px] font-semibold">Hover y activo</p>
      <label className="text-[11px]">Color al pasar<input type="color" aria-label="Color al pasar" value={typeof actual.hover_color === 'string' && actual.hover_color.startsWith('#') ? actual.hover_color : '#111111'} onChange={(e) => escribir({ hover_color: e.target.value })} /></label>
      <label className="text-[11px]">Fondo al pasar<input type="color" aria-label="Fondo al pasar" value={typeof actual.hover_background === 'string' && actual.hover_background.startsWith('#') ? actual.hover_background : '#ffffff'} onChange={(e) => escribir({ hover_background: e.target.value })} /></label>
      {num('hover_scale', 90, 120, 'Escala')}
      <label className="text-[11px]">Sombra al pasar
        <Select className={control} aria-label="Sombra al pasar" tamano="sm" valor={String(String(actual.hover_shadow || '')) || '__predeterminado__'} onValorChange={(valor) => escribir({ hover_shadow: (valor === '__predeterminado__' ? '' : valor) || undefined })} opciones={[{ valor: String("") || '__predeterminado__', etiqueta: String("La misma") }, { valor: String("none") || '__predeterminado__', etiqueta: String("Ninguna") }, { valor: String("sm") || '__predeterminado__', etiqueta: String("Suave") }, { valor: String("md") || '__predeterminado__', etiqueta: String("Media") }, { valor: String("lg") || '__predeterminado__', etiqueta: String("Flotante") }]} />
      </label>
      <label className="text-[11px]">Color activo<input type="color" aria-label="Color activo" value={typeof actual.active_color === 'string' && actual.active_color.startsWith('#') ? actual.active_color : '#111111'} onChange={(e) => escribir({ active_color: e.target.value })} /></label>
      <p className="text-[11px] font-semibold">Ícono</p>
      <label className="text-[11px]">Color del ícono<input type="color" aria-label="Color del ícono" value={typeof actual.icon_color === 'string' && actual.icon_color.startsWith('#') ? actual.icon_color : '#111111'} onChange={(e) => escribir({ icon_color: e.target.value })} /></label>
      <label className="text-[11px]">Trazo
        <Select className={control} aria-label="Trazo del ícono" tamano="sm" valor={String(String(actual.weight || 'contorno')) || '__predeterminado__'} onValorChange={(valor) => escribir({ weight: (valor === '__predeterminado__' ? '' : valor) })} opciones={[{ valor: String("contorno") || '__predeterminado__', etiqueta: String("Contorno") }, { valor: String("relleno") || '__predeterminado__', etiqueta: String("Relleno") }, { valor: String("duotono") || '__predeterminado__', etiqueta: String("Duotono") }]} />
      </label>
      {num('stroke', 1, 4, 'Grosor')}
      {objetivo === 'all' || objetivo === 'cart' ? (
        <>
          <p className="text-[11px] font-semibold">Contador del carrito</p>
          <label className="text-[11px]">Forma
            <Select className={control} aria-label="Forma del contador" tamano="sm" valor={String(String((objetivo === 'all' ? caja : actual).badge_shape || 'circle')) || '__predeterminado__'} onValorChange={(valor) => escribir({ badge_shape: (valor === '__predeterminado__' ? '' : valor) })} opciones={[{ valor: String("circle") || '__predeterminado__', etiqueta: String("Círculo") }, { valor: String("pill") || '__predeterminado__', etiqueta: String("Píldora") }]} />
          </label>
          <label className="text-[11px]">Posición
            <Select className={control} aria-label="Posición del contador" tamano="sm" valor={String(String((objetivo === 'all' ? caja : actual).badge_position || 'top-right')) || '__predeterminado__'} onValorChange={(valor) => escribir({ badge_position: (valor === '__predeterminado__' ? '' : valor) })} opciones={[{ valor: String("top-right") || '__predeterminado__', etiqueta: String("Arriba a la derecha") }, { valor: String("top-left") || '__predeterminado__', etiqueta: String("Arriba a la izquierda") }]} />
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
            <FormField etiqueta="Contenido del menú">
              {(campo) => <Select id={campo.id} aria-labelledby={campo.idEtiqueta} tamano="sm" valor={String(menu.source || 'manual')} opciones={[{ valor: 'manual', etiqueta: 'Enlaces propios' }, { valor: 'pages', etiqueta: 'Menú de páginas' }, { valor: 'categories', etiqueta: 'Categorías de la tienda' }]} onValorChange={(v) => setMenu(i, { source: v })} />}
            </FormField>
            <div className="grid grid-cols-2 gap-1">
              <Select className={control} aria-label="Zona del menú" tamano="sm" valor={String(String(menu.zone || 'menu_center')) || '__predeterminado__'} onValorChange={(valor) => setMenu(i, { zone: (valor === '__predeterminado__' ? '' : valor) })} opciones={[...(ZONAS.map((z) =>({ valor: String(z) || '__predeterminado__', etiqueta: String(ETIQUETA[z]) })))]} />
              <Select className={control} aria-label="Tipo de menú" tamano="sm" valor={String(String(menu.type || 'links')) || '__predeterminado__'} onValorChange={(valor) => setMenu(i, { type: (valor === '__predeterminado__' ? '' : valor) })} opciones={[{ valor: String("links") || '__predeterminado__', etiqueta: String("Enlaces") }, { valor: String("mega") || '__predeterminado__', etiqueta: String("Mega menú") }, { valor: String("mixed") || '__predeterminado__', etiqueta: String("Mixto") }]} />
            </div>
            <div className="grid grid-cols-2 gap-1">
              <Select className={control} aria-label="Indicador" tamano="sm" valor={String(String(menu.indicator || 'none')) || '__predeterminado__'} onValorChange={(valor) => setMenu(i, { indicator: (valor === '__predeterminado__' ? '' : valor) })} opciones={[{ valor: String("none") || '__predeterminado__', etiqueta: String("Sin indicador") }, { valor: String("underline") || '__predeterminado__', etiqueta: String("Subrayado") }, { valor: String("pill") || '__predeterminado__', etiqueta: String("Píldora") }, { valor: String("background") || '__predeterminado__', etiqueta: String("Fondo") }]} />
              <Select className={control} aria-label="Fuente del menú" tamano="sm" valor={String(String(menu.font || 'sans')) || '__predeterminado__'} onValorChange={(valor) => setMenu(i, { font: (valor === '__predeterminado__' ? '' : valor) })} opciones={[{ valor: String("sans") || '__predeterminado__', etiqueta: String("Sans") }, { valor: String("serif") || '__predeterminado__', etiqueta: String("Serif") }, { valor: String("mono") || '__predeterminado__', etiqueta: String("Mono") }]} />
            </div>
            <div className="grid grid-cols-3 gap-1">
              <label className="text-[11px]">Tamaño<input className={control} type="number" min={10} max={24} aria-label="Tamaño" value={menu.size == null ? '' : String(menu.size)} onChange={(e) => setMenu(i, { size: e.target.value ? Number(e.target.value) : undefined })} /></label>
              <label className="text-[11px]">Separación<input className={control} type="number" min={0} max={40} aria-label="Separación" value={menu.gap == null ? '' : String(menu.gap)} onChange={(e) => setMenu(i, { gap: e.target.value ? Number(e.target.value) : undefined })} /></label>
              <label className="text-[11px]">Orden celular<input className={control} type="number" min={0} max={20} aria-label="Orden en el celular" value={menu.mobile_order == null ? String(i) : String(menu.mobile_order)} onChange={(e) => setMenu(i, { mobile_order: Number(e.target.value) })} /></label>
            </div>
            <label className="text-[11px]">Peso
              <Select className={control} aria-label="Peso" tamano="sm" valor={String(String(menu.weight || 'medium')) || '__predeterminado__'} onValorChange={(valor) => setMenu(i, { weight: (valor === '__predeterminado__' ? '' : valor) })} opciones={[{ valor: String("normal") || '__predeterminado__', etiqueta: String("Normal") }, { valor: String("medium") || '__predeterminado__', etiqueta: String("Medio") }, { valor: String("semibold") || '__predeterminado__', etiqueta: String("Seminegrita") }, { valor: String("bold") || '__predeterminado__', etiqueta: String("Negrita") }]} />
            </label>
            <div className="grid grid-cols-3 gap-1">
              <label className="text-[11px]">Color<input type="color" aria-label="Color del menú" value={typeof menu.color === 'string' ? menu.color : '#111111'} onChange={(e) => setMenu(i, { color: e.target.value })} /></label>
              <label className="text-[11px]">Hover<input type="color" aria-label="Color al pasar" value={typeof menu.hover === 'string' ? menu.hover : '#111111'} onChange={(e) => setMenu(i, { hover: e.target.value })} /></label>
              <label className="text-[11px]">Activo<input type="color" aria-label="Color activo" value={typeof menu.active === 'string' ? menu.active : '#111111'} onChange={(e) => setMenu(i, { active: e.target.value })} /></label>
            </div>
            <label className="flex justify-between text-[11px]"><span>Mayúsculas</span><input type="checkbox" aria-label="Mayúsculas" checked={menu.uppercase === true} onChange={(e) => setMenu(i, { uppercase: e.target.checked })} /></label>
            <label className="flex justify-between text-[11px]"><span>En el menú móvil</span><input type="checkbox" aria-label="En el menú móvil" checked={menu.mobile !== false} onChange={(e) => setMenu(i, { mobile: e.target.checked })} /></label>
            {(!menu.source || menu.source === 'manual') ? <>
            {items.map((item, k) => (
              <div key={k} className="grid grid-cols-2 gap-1">
                <input className={control} aria-label="Texto del ítem" value={String(item.label || '')} onChange={(e) => setItems(items.map((x, j) => j === k ? { ...x, label: e.target.value } : x))} />
                <input className={control} aria-label="Enlace del ítem" value={String(item.href || '')} onChange={(e) => setItems(items.map((x, j) => j === k ? { ...x, href: e.target.value } : x))} />
                <Select className={control} aria-label="Tipo de ítem" tamano="sm" valor={String(String(item.kind || 'link')) || '__predeterminado__'} onValorChange={(valor) => setItems(items.map((x, j) => j === k ? { ...x, kind: (valor === '__predeterminado__' ? '' : valor) } : x))} opciones={[{ valor: String("link") || '__predeterminado__', etiqueta: String("Enlace") }, { valor: String("dropdown") || '__predeterminado__', etiqueta: String("Desplegable") }, { valor: String("mega") || '__predeterminado__', etiqueta: String("Mega") }]} />
                <input className={control} aria-label="Etiqueta" placeholder="Nuevo" value={String(item.badge || '')} onChange={(e) => setItems(items.map((x, j) => j === k ? { ...x, badge: e.target.value } : x))} />
              </div>
            ))}
            <button type="button" className="text-left text-[11px] underline" onClick={() => setItems([...items, { label: 'Enlace', href: '/', kind: 'link' }])}>Agregar ítem</button>
            </> : <p className="text-xs text-fg-secondary">Los enlaces se actualizan automáticamente con las páginas o categorías de la tienda.</p>}
          </div>
        )
      })}
    </div>
  )
}
