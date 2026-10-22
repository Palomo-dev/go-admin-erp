'use client';

/**
 * Pestaña «Constructor» del encabezado. No escribe hasta que se mueve un elemento
 * o se cambia un control. Sin `header_builder`, el sitio sigue con el header de hoy.
 */
import { useState } from 'react';
import { BUSCADORES_NUEVOS, TIPOS, ZONAS, type ZonaHeader } from '@/lib/website/constructorEncabezado';

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
        <input key={i} className={control} value={String(b.text || '')} aria-label="Texto del botón" onChange={(e) => {
          const sig = buttons.map((x, j) => j === i ? { ...x, text: e.target.value } : x);
          guardar({ ...builder, buttons: sig });
        }} />
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
      <label className="text-[11px]">Ícono<input className={control} value={String(icono.icon || '')} onChange={(e) => setIcono('icon', e.target.value)} /></label>
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
      <label className="text-[11px]">Color<input type="color" value={typeof icono.color === 'string' ? icono.color : '#111111'} onChange={(e) => setIcono('color', e.target.value)} /></label>
      <label className="text-[11px]">Fondo<input type="color" value={typeof icono.background === 'string' ? icono.background : '#ffffff'} onChange={(e) => setIcono('background', e.target.value)} /></label>
      <label className="flex justify-between text-[11px]"><span>Escritorio</span><input type="checkbox" checked={el.desktop !== false} onChange={(e) => setEl('desktop', e.target.checked)} /></label>
      <label className="flex justify-between text-[11px]"><span>Tablet</span><input type="checkbox" checked={el.tablet !== false} onChange={(e) => setEl('tablet', e.target.checked)} /></label>
      <label className="flex justify-between text-[11px]"><span>Celular</span><input type="checkbox" checked={el.mobile !== false} onChange={(e) => setEl('mobile', e.target.checked)} /></label>
    </div>
  );
}
