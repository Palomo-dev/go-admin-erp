'use client';

import { useState, type ReactNode } from 'react';

/** Controles de `section_header` y `section_background`. No escriben nada hasta que se cambia un campo. */

const control = 'h-8 w-full rounded-md border border-line bg-surface px-2 text-sm text-fg';

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? { ...(valor as Record<string, unknown>) } : {};
}

function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">
      <span>{etiqueta}</span>
      {children}
    </label>
  );
}

export function EditorEncabezado({ valor, onCambiar }: { valor: unknown; onCambiar: (v: unknown) => void }) {
  const e = objeto(valor);
  const set = (k: string, v: unknown) => {
    const siguiente = { ...e, [k]: v };
    if (v == null || v === '') delete siguiente[k];
    onCambiar(Object.keys(siguiente).length ? siguiente : undefined);
  };
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
      <p className="text-sm font-semibold text-fg">Encabezado de la sección</p>
      <Campo etiqueta="Etiqueta pequeña"><input className={control} value={String(e.eyebrow ?? '')} onChange={(ev) => set('eyebrow', ev.target.value)} /></Campo>
      <Campo etiqueta="Título"><input className={control} value={String(e.title ?? '')} onChange={(ev) => set('title', ev.target.value)} /></Campo>
      <Campo etiqueta="Descripción"><textarea className={control} rows={2} value={String(e.description ?? '')} onChange={(ev) => set('description', ev.target.value)} /></Campo>
      <label className="flex justify-between text-sm text-fg"><span>Mostrar título</span><input type="checkbox" checked={e.show_title !== false} onChange={(ev) => set('show_title', ev.target.checked)} /></label>
      <label className="flex justify-between text-sm text-fg"><span>Mostrar descripción</span><input type="checkbox" checked={e.show_description !== false} onChange={(ev) => set('show_description', ev.target.checked)} /></label>
      <Campo etiqueta="Tamaño del título">
        <select className={control} value={String(e.title_size ?? '')} onChange={(ev) => set('title_size', ev.target.value)}>
          <option value="">Como hoy</option>
          {['sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Peso">
        <select className={control} value={String(e.title_weight ?? '')} onChange={(ev) => set('title_weight', ev.target.value)}>
          <option value="">Como hoy</option>
          {['normal', 'medium', 'semibold', 'bold'].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Alineación">
        <select className={control} value={String(e.align ?? '')} onChange={(ev) => set('align', ev.target.value)}>
          <option value="">Heredar del estilo global</option>
          <option value="left">Izquierda</option>
          <option value="center">Centro</option>
          <option value="right">Derecha</option>
        </select>
      </Campo>
      <Campo etiqueta="Disposición">
        <select className={control} value={String(e.layout ?? '')} onChange={(ev) => set('layout', ev.target.value)}>
          <option value="">Heredar del estilo global</option>
          <option value="stacked">Título arriba</option>
          <option value="inline">Título y botón en fila</option>
          <option value="side">Columna lateral</option>
        </select>
      </Campo>
      <Campo etiqueta="Línea decorativa">
        <select className={control} value={String(e.title_line ?? '')} onChange={(ev) => set('title_line', ev.target.value)}>
          <option value="">Ninguna</option>
          <option value="below">Debajo</option>
          <option value="sides">A los lados</option>
        </select>
      </Campo>
      <Campo etiqueta="Color de la línea"><input type="color" value={typeof e.line_color === 'string' && e.line_color.startsWith('#') ? e.line_color : '#111827'} onChange={(ev) => set('line_color', ev.target.value)} /></Campo>
      <label className="flex justify-between text-sm text-fg"><span>Mayúsculas</span><input type="checkbox" checked={e.title_uppercase === true} onChange={(ev) => set('title_uppercase', ev.target.checked)} /></label>
      <Campo etiqueta="Color del título"><input type="color" value={typeof e.title_color === 'string' && e.title_color.startsWith('#') ? e.title_color : '#111827'} onChange={(ev) => set('title_color', ev.target.value)} /></Campo>
      <Campo etiqueta="Color 2 (degradado)"><input type="color" value={typeof e.title_color_2 === 'string' && e.title_color_2.startsWith('#') ? e.title_color_2 : '#111827'} onChange={(ev) => set('title_color_2', ev.target.value)} /></Campo>
      <Campo etiqueta="Fuente (site o nombre)"><input className={control} value={String(e.title_font ?? '')} onChange={(ev) => set('title_font', ev.target.value)} /></Campo>
      <Campo etiqueta="Tamaño de la descripción">
        <select className={control} value={String(e.description_size ?? '')} onChange={(ev) => set('description_size', ev.target.value)}>
          <option value="">Como hoy</option>
          <option value="sm">Pequeño</option>
          <option value="md">Mediano</option>
          <option value="lg">Grande</option>
        </select>
      </Campo>
      <Campo etiqueta="Color de la descripción"><input type="color" value={typeof e.description_color === 'string' && e.description_color.startsWith('#') ? e.description_color : '#4b5563'} onChange={(ev) => set('description_color', ev.target.value)} /></Campo>
      <Campo etiqueta="Peso de la descripción">
        <select className={control} value={String(e.description_weight ?? '')} onChange={(ev) => set('description_weight', ev.target.value)}>
          <option value="">Como hoy</option>
          {['normal', 'medium', 'semibold', 'bold'].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Fuente de la descripción"><input className={control} value={String(e.description_font ?? '')} onChange={(ev) => set('description_font', ev.target.value)} /></Campo>
      <Campo etiqueta="Ancho máximo de la descripción (caracteres)"><input className={control} type="number" min={20} max={80} value={String(e.description_max ?? '')} onChange={(ev) => set('description_max', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <label className="flex justify-between text-sm text-fg"><span>Botón «Ver todo»</span><input type="checkbox" checked={e.view_all === true} onChange={(ev) => set('view_all', ev.target.checked)} /></label>
      <Campo etiqueta="Texto del botón"><input className={control} value={String(e.view_all_label ?? '')} onChange={(ev) => set('view_all_label', ev.target.value)} /></Campo>
      <Campo etiqueta="Enlace del botón"><input className={control} value={String(e.view_all_url ?? '')} onChange={(ev) => set('view_all_url', ev.target.value)} /></Campo>
      <Campo etiqueta="Estilo del botón">
        <select className={control} value={String(e.view_all_style ?? '')} onChange={(ev) => set('view_all_style', ev.target.value)}>
          <option value="">Sólido</option>
          <option value="solid">Sólido</option>
          <option value="outline">Contorno</option>
          <option value="ghost">Texto</option>
        </select>
      </Campo>
      <Accion valor={e.section_action} onCambiar={(v) => set('section_action', v)} />
      <Medio valor={e.media} onCambiar={(v) => set('media', v)} />
    </div>
  );
}

function Accion({ valor, onCambiar }: { valor: unknown; onCambiar: (v: unknown) => void }) {
  const a = objeto(valor);
  const set = (k: string, v: unknown) => {
    const siguiente = { ...a, [k]: v };
    if (v == null || v === '') delete siguiente[k];
    onCambiar(Object.keys(siguiente).length ? siguiente : undefined);
  };
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-2">
      <p className="text-xs font-semibold text-fg">Acción</p>
      <Campo etiqueta="Texto"><input className={control} placeholder="Ver todas" value={String(a.text ?? '')} onChange={(ev) => set('text', ev.target.value)} /></Campo>
      <Campo etiqueta="Tipo de destino">
        <select className={control} value={String(a.dest ?? 'url')} onChange={(ev) => set('dest', ev.target.value)}>
          <option value="url">URL</option>
          <option value="page">Página</option>
          <option value="category">Categoría</option>
          <option value="collection">Colección</option>
        </select>
      </Campo>
      <Campo etiqueta="Destino"><input className={control} placeholder={a.dest === 'category' ? 'perros o /categorias/perros' : a.dest === 'page' ? '/contacto' : a.dest === 'collection' ? 'verano' : 'https://'} value={String(a.href ?? '')} onChange={(ev) => set('href', ev.target.value)} /></Campo>
      <Campo etiqueta="Tipo">
        <select className={control} value={String(a.kind ?? 'link')} onChange={(ev) => set('kind', ev.target.value)}>
          <option value="link">Enlace</option>
          <option value="button">Botón</option>
        </select>
      </Campo>
      <Campo etiqueta="Posición">
        <select className={control} value={String(a.position ?? 'inline')} onChange={(ev) => set('position', ev.target.value)}>
          <option value="inline">A la derecha del título</option>
          <option value="below">Debajo del título</option>
          <option value="end">Al final, centrado</option>
        </select>
      </Campo>
      <Campo etiqueta="Estilo del botón">
        <select className={control} value={String(a.style ?? 'solid')} onChange={(ev) => set('style', ev.target.value)}>
          <option value="solid">Sólido</option>
          <option value="outline">Contorno</option>
          <option value="ghost">Texto</option>
        </select>
      </Campo>
      <Campo etiqueta="Forma">
        <select className={control} value={String(a.shape ?? 'pill')} onChange={(ev) => set('shape', ev.target.value)}>
          <option value="pill">Píldora</option>
          <option value="rounded">Redondeado</option>
          <option value="square">Cuadrado</option>
        </select>
      </Campo>
      <Campo etiqueta="Color"><input type="color" value={typeof a.color === 'string' && a.color.startsWith('#') ? a.color : '#111827'} onChange={(ev) => set('color', ev.target.value)} /></Campo>
      <Campo etiqueta="Color del texto"><input type="color" value={typeof a.text_color === 'string' && a.text_color.startsWith('#') ? a.text_color : '#ffffff'} onChange={(ev) => set('text_color', ev.target.value)} /></Campo>
      <label className="flex justify-between text-sm text-fg"><span>Flecha</span><input type="checkbox" checked={a.icon === true} onChange={(ev) => set('icon', ev.target.checked)} /></label>
      <label className="flex justify-between text-sm text-fg"><span>Subrayar al pasar</span><input type="checkbox" checked={a.underline !== false} onChange={(ev) => set('underline', ev.target.checked)} /></label>
    </div>
  );
}

function Medio({ valor, onCambiar }: { valor: unknown; onCambiar: (v: unknown) => void }) {
  const m = objeto(valor);
  const set = (k: string, v: unknown) => {
    const siguiente = { ...m, [k]: v };
    if (v == null || v === '') delete siguiente[k];
    onCambiar(Object.keys(siguiente).length ? siguiente : undefined);
  };
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-2">
      <p className="text-xs font-semibold text-fg">Junto al título</p>
      <Campo etiqueta="Tipo">
        <select className={control} value={String(m.kind ?? '')} onChange={(ev) => set('kind', ev.target.value)}>
          <option value="">Ninguno</option>
          <option value="image">Imagen</option>
          <option value="icon">Ícono</option>
        </select>
      </Campo>
      <Campo etiqueta="Imagen o ícono"><input className={control} value={String(m.src ?? m.icon ?? '')} onChange={(ev) => set(m.kind === 'icon' ? 'icon' : 'src', ev.target.value)} /></Campo>
      <Campo etiqueta="Lugar">
        <select className={control} value={String(m.place ?? 'left')} onChange={(ev) => set('place', ev.target.value)}>
          <option value="left">A la izquierda</option>
          <option value="above">Encima</option>
        </select>
      </Campo>
      <Campo etiqueta="Tamaño"><input className={control} type="number" min={16} max={96} value={String(m.size ?? '')} onChange={(ev) => set('size', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <Campo etiqueta="Forma">
        <select className={control} value={String(m.shape ?? 'rounded')} onChange={(ev) => set('shape', ev.target.value)}>
          <option value="rounded">Redondeado</option>
          <option value="circle">Círculo</option>
          <option value="square">Cuadrado</option>
        </select>
      </Campo>
    </div>
  );
}

const CLAVES_HEREDABLES = ['align', 'layout', 'title_font', 'title_size', 'title_weight', 'title_color', 'title_uppercase', 'title_line', 'description_size', 'description_color', 'description_font', 'description_weight']

export function EditorPestanas({ contenido, onCambiar }: { contenido: Record<string, unknown>; onCambiar: (v: Record<string, unknown>) => void }) {
  const [pestana, setPestana] = useState<'encabezado' | 'visual' | 'fondo'>('encabezado')
  const [local, setLocal] = useState(false)
  const setClave = (clave: string, valor: unknown) => {
    const siguiente = { ...contenido, [clave]: valor }
    if (valor == null) delete siguiente[clave]
    onCambiar(siguiente)
  }
  const restablecer = () => {
    const header = objeto(contenido.section_header)
    for (const k of CLAVES_HEREDABLES) delete header[k]
    setClave('section_header', Object.keys(header).length ? header : undefined)
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1">
        {(['encabezado', 'visual', 'fondo'] as const).map((p) => (
          <button key={p} type="button" className={control} onClick={() => setPestana(p)}>
            {p === 'encabezado' ? 'Encabezado' : p === 'visual' ? 'Visualización' : 'Fondo y espaciado'}
          </button>
        ))}
      </div>
      {pestana === 'encabezado' && (
        <>
          <label className="flex justify-between text-sm text-fg">
            <span>Heredar del estilo global</span>
            <input
              type="checkbox"
              checked={!local && CLAVES_HEREDABLES.every((k) => objeto(contenido.section_header)[k] == null || objeto(contenido.section_header)[k] === '')}
              onChange={(ev) => {
                if (ev.target.checked) { setLocal(false); restablecer() }
                else setLocal(true)
              }}
            />
          </label>
          <EditorEncabezado valor={contenido.section_header} onCambiar={(v) => setClave('section_header', v)} />
          <button type="button" className="text-left text-xs underline" onClick={restablecer}>Restablecer sección al estilo global</button>
        </>
      )}
      {pestana === 'visual' && <EditorVisual valor={contenido.section_display} onCambiar={(v) => setClave('section_display', v)} />}
      {pestana === 'fondo' && <EditorFondo valor={contenido.section_background} onCambiar={(v) => setClave('section_background', v)} />}
    </div>
  )
}

function EditorVisual({ valor, onCambiar }: { valor: unknown; onCambiar: (v: unknown) => void }) {
  const v = objeto(valor)
  const set = (k: string, val: unknown) => {
    const siguiente = { ...v, [k]: val }
    if (val == null || val === '') delete siguiente[k]
    onCambiar(Object.keys(siguiente).length ? siguiente : undefined)
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
      <Campo etiqueta="Modo">
        <select className={control} value={String(v.display_mode ?? '')} onChange={(ev) => set('display_mode', ev.target.value)}>
          <option value="">Como hoy</option>
          <option value="grid">Cuadrícula</option>
          <option value="carousel">Carrusel</option>
          <option value="list">Lista</option>
          <option value="masonry">Mosaico</option>
        </select>
      </Campo>
      <Campo etiqueta="Paginación">
        <select className={control} value={String(v.pagination ?? '')} onChange={(ev) => set('pagination', ev.target.value)}>
          <option value="">Como hoy</option>
          <option value="none">Sin páginas</option>
          <option value="pages">Páginas</option>
          <option value="load_more">Cargar más</option>
          <option value="infinite">Infinito</option>
          <option value="full">Mostrar todo</option>
        </select>
      </Campo>
      <Campo etiqueta="Por página"><input className={control} type="number" min={1} max={48} value={String(v.per_page ?? '')} onChange={(ev) => set('per_page', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <Campo etiqueta="Columnas escritorio"><input className={control} type="number" min={1} max={6} value={String(v.columns_desktop ?? '')} onChange={(ev) => set('columns_desktop', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <Campo etiqueta="Columnas tablet"><input className={control} type="number" min={1} max={4} value={String(v.columns_tablet ?? '')} onChange={(ev) => set('columns_tablet', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <Campo etiqueta="Columnas celular"><input className={control} type="number" min={1} max={2} value={String(v.columns_mobile ?? '')} onChange={(ev) => set('columns_mobile', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <Campo etiqueta="Separación"><input className={control} type="number" min={0} max={64} value={String(v.item_gap ?? '')} onChange={(ev) => set('item_gap', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <Campo etiqueta="Flechas">
        <select className={control} value={String(v.arrow_position ?? '')} onChange={(ev) => set('arrow_position', ev.target.value)}>
          <option value="">Como hoy</option>
          <option value="sides">A los lados</option>
          <option value="top">Arriba a la derecha</option>
          <option value="bottom">Abajo</option>
        </select>
      </Campo>
      <Campo etiqueta="Visibles en escritorio"><input className={control} type="number" min={1} max={6} value={String(v.visible_desktop ?? '')} onChange={(ev) => set('visible_desktop', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <Campo etiqueta="Visibles en tablet"><input className={control} type="number" min={1} max={4} value={String(v.visible_tablet ?? '')} onChange={(ev) => set('visible_tablet', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <Campo etiqueta="Visibles en celular"><input className={control} type="number" min={1} max={2} value={String(v.visible_mobile ?? '')} onChange={(ev) => set('visible_mobile', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <label className="flex justify-between text-sm text-fg"><span>Puntos</span><input type="checkbox" checked={v.dots === true} onChange={(ev) => set('dots', ev.target.checked)} /></label>
      <label className="flex justify-between text-sm text-fg"><span>Barra de progreso</span><input type="checkbox" checked={v.progress === true} onChange={(ev) => set('progress', ev.target.checked)} /></label>
      <label className="flex justify-between text-sm text-fg"><span>Autoplay</span><input type="checkbox" checked={v.autoplay === true} onChange={(ev) => set('autoplay', ev.target.checked)} /></label>
      <Campo etiqueta="Intervalo (s)"><input className={control} type="number" min={2} max={20} value={String(v.autoplay_interval ?? '')} onChange={(ev) => set('autoplay_interval', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <label className="flex justify-between text-sm text-fg"><span>Loop</span><input type="checkbox" checked={v.loop !== false} onChange={(ev) => set('loop', ev.target.checked)} /></label>
      <label className="flex justify-between text-sm text-fg"><span>Arrastre</span><input type="checkbox" checked={v.drag !== false} onChange={(ev) => set('drag', ev.target.checked)} /></label>
    </div>
  )
}

export function EditorFondo({ valor, onCambiar }: { valor: unknown; onCambiar: (v: unknown) => void }) {
  const f = objeto(valor);
  const set = (k: string, v: unknown) => {
    const siguiente = { ...f, [k]: v };
    if (v == null || v === '') delete siguiente[k];
    onCambiar(Object.keys(siguiente).length ? siguiente : undefined);
  };
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
      <p className="text-sm font-semibold text-fg">Fondo de la sección</p>
      <Campo etiqueta="Color"><input type="color" value={typeof f.color === 'string' && f.color.startsWith('#') ? f.color : '#ffffff'} onChange={(ev) => set('color', ev.target.value)} /></Campo>
      <Campo etiqueta="Degradado 1"><input type="color" value={typeof f.gradient_1 === 'string' && f.gradient_1.startsWith('#') ? f.gradient_1 : '#ffffff'} onChange={(ev) => set('gradient_1', ev.target.value)} /></Campo>
      <Campo etiqueta="Degradado 2"><input type="color" value={typeof f.gradient_2 === 'string' && f.gradient_2.startsWith('#') ? f.gradient_2 : '#ffffff'} onChange={(ev) => set('gradient_2', ev.target.value)} /></Campo>
      <Campo etiqueta="Ángulo"><input className={control} type="number" min={0} max={360} value={String(f.gradient_angle ?? '')} onChange={(ev) => set('gradient_angle', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <Campo etiqueta="Imagen de escritorio"><input className={control} value={String(f.image_url ?? '')} onChange={(ev) => set('image_url', ev.target.value)} /></Campo>
      <Campo etiqueta="Imagen de celular"><input className={control} value={String(f.image_url_mobile ?? '')} onChange={(ev) => set('image_url_mobile', ev.target.value)} /></Campo>
      <Campo etiqueta="Ajuste">
        <select className={control} value={String(f.image_fit ?? '')} onChange={(ev) => set('image_fit', ev.target.value)}>
          <option value="">Cubrir</option>
          <option value="cover">Cubrir</option>
          <option value="contain">Contener</option>
        </select>
      </Campo>
      <Campo etiqueta="Posición de la imagen">
        <select className={control} value={String(f.image_position ?? '')} onChange={(ev) => set('image_position', ev.target.value)}>
          <option value="">Centro</option>
          <option value="center">Centro</option>
          <option value="top">Arriba</option>
          <option value="bottom">Abajo</option>
          <option value="left">Izquierda</option>
          <option value="right">Derecha</option>
        </select>
      </Campo>
      <Campo etiqueta="Opacidad de la capa"><input className={control} type="number" min={0} max={100} value={String(f.overlay_opacity ?? '')} onChange={(ev) => set('overlay_opacity', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <label className="flex justify-between text-sm text-fg"><span>Parallax</span><input type="checkbox" checked={f.parallax === true} onChange={(ev) => set('parallax', ev.target.checked)} /></label>
      <Campo etiqueta="Relleno superior"><input className={control} type="number" min={0} max={200} value={String(f.padding_top ?? '')} onChange={(ev) => set('padding_top', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <Campo etiqueta="Relleno inferior"><input className={control} type="number" min={0} max={200} value={String(f.padding_bottom ?? '')} onChange={(ev) => set('padding_bottom', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <Campo etiqueta="Ancho">
        <select className={control} value={String(f.width ?? '')} onChange={(ev) => set('width', ev.target.value)}>
          <option value="">Como hoy</option>
          <option value="content">Contenido</option>
          <option value="full">Completo</option>
        </select>
      </Campo>
      <Campo etiqueta="Separador">
        <select className={control} value={String(f.separator ?? '')} onChange={(ev) => set('separator', ev.target.value)}>
          <option value="">Ninguno</option>
          <option value="line">Línea</option>
          <option value="wave">Ola</option>
          <option value="diagonal">Diagonal</option>
        </select>
      </Campo>
      <Campo etiqueta="Color del separador"><input type="color" value={typeof f.separator_color === 'string' && f.separator_color.startsWith('#') ? f.separator_color : '#111827'} onChange={(ev) => set('separator_color', ev.target.value)} /></Campo>
    </div>
  );
}
