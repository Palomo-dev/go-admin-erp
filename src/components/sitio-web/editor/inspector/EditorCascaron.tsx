'use client';

import type { ReactNode } from 'react';

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
          <option value="">Como hoy</option>
          <option value="left">Izquierda</option>
          <option value="center">Centro</option>
          <option value="right">Derecha</option>
        </select>
      </Campo>
      <Campo etiqueta="Disposición">
        <select className={control} value={String(e.layout ?? '')} onChange={(ev) => set('layout', ev.target.value)}>
          <option value="">Como hoy</option>
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
    </div>
  );
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
