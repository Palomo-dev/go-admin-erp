'use client';

import { useTextosEditor } from '../textos';
import { SelectKit, NumeroKit, CasillaKit, ColorKit } from './controlesKit';
import { useState, type ReactNode } from 'react';
import { accionDesdeVerTodo, CLAVES_VER_TODO } from './espaciadoSeccion';
import { FontField } from '@/components/sitio-web/ui/FontField';
import { FONTS } from '@/lib/services/websiteSettingsService';
import { familiaCss } from '@/components/sitio-web/diseno/catalogo';
import { fuenteEncabezadoAlCampo, fuenteEncabezadoAlGuardar, type FuentesTema } from '@/lib/website/v2/fuenteTema';

/** Controles de `section_header` y `section_background`. No escriben nada hasta que se cambia un campo. */

const control = 'h-8 w-full rounded-md border border-line bg-surface px-2 text-sm text-fg';

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? { ...(valor as Record<string, unknown>) } : {};
}

function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={etiqueta} className="flex flex-col gap-1 text-[12px] text-fg-secondary">
      <span>{etiqueta}</span>
      {children}
    </div>
  );
}

export function EditorEncabezado({ valor, onCambiar, fuentes = {} }: { valor: unknown; onCambiar: (v: unknown) => void; fuentes?: FuentesTema }) {
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
      {/* CASCAR-02: el título y la descripción se escriben en Contenido › Título / Subtítulo (un solo campo). */}
      <p className="text-[11px] leading-[14px] text-fg-muted">El título y la descripción se escriben en Contenido.</p>
      <CasillaKit titulo="Mostrar título" checked={e.show_title !== false} onChange={(ev) => set('show_title', ev.target.checked)} />
      <CasillaKit titulo="Mostrar descripción" checked={e.show_description !== false} onChange={(ev) => set('show_description', ev.target.checked)} />
      <Campo etiqueta="Tamaño del título">
        <SelectKit className={control} value={String(e.title_size ?? '')} onChange={(ev) => set('title_size', ev.target.value)}>
          <option value="">Como hoy</option>
          {['sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'].map((t) => <option key={t} value={t}>{t}</option>)}
        </SelectKit>
      </Campo>
      <Campo etiqueta="Peso">
        <SelectKit className={control} value={String(e.title_weight ?? '')} onChange={(ev) => set('title_weight', ev.target.value)}>
          <option value="">Como hoy</option>
          {['normal', 'medium', 'semibold', 'bold'].map((t) => <option key={t} value={t}>{t}</option>)}
        </SelectKit>
      </Campo>
      <Campo etiqueta="Alineación">
        <SelectKit className={control} value={String(e.align ?? '')} onChange={(ev) => set('align', ev.target.value)}>
          <option value="">Heredar del estilo global</option>
          <option value="left">Izquierda</option>
          <option value="center">Centro</option>
          <option value="right">Derecha</option>
        </SelectKit>
      </Campo>
      <Campo etiqueta="Disposición">
        <SelectKit className={control} value={String(e.layout ?? '')} onChange={(ev) => set('layout', ev.target.value)}>
          <option value="">Heredar del estilo global</option>
          <option value="stacked">Título arriba</option>
          <option value="inline">Título y botón en fila</option>
          <option value="side">Columna lateral</option>
        </SelectKit>
      </Campo>
      <Campo etiqueta="Línea decorativa">
        <SelectKit className={control} value={String(e.title_line ?? '')} onChange={(ev) => set('title_line', ev.target.value)}>
          <option value="">Ninguna</option>
          <option value="below">Debajo</option>
          <option value="sides">A los lados</option>
        </SelectKit>
      </Campo>
      <ColorKit etiqueta="Color de la línea" value={typeof e.line_color === 'string' && e.line_color.startsWith('#') ? e.line_color : '#111827'} onChange={(ev) => set('line_color', ev.target.value)} />
      <CasillaKit titulo="Mayúsculas" checked={e.title_uppercase === true} onChange={(ev) => set('title_uppercase', ev.target.checked)} />
      <ColorKit etiqueta="Color del título" value={typeof e.title_color === 'string' && e.title_color.startsWith('#') ? e.title_color : '#111827'} onChange={(ev) => set('title_color', ev.target.value)} />
      <ColorKit etiqueta="Color 2 (degradado)" value={typeof e.title_color_2 === 'string' && e.title_color_2.startsWith('#') ? e.title_color_2 : '#111827'} onChange={(ev) => set('title_color_2', ev.target.value)} />
      {/* ENCABE-93: fuente del título con el selector del kit (lee 'site' o la familia guardada). */}
      <FontField etiqueta="Fuente del título" valor={fuenteEncabezadoAlCampo(e.title_font)} onCambiar={(v) => set('title_font', fuenteEncabezadoAlGuardar(v, fuentes, 'titulos'))} fuentesTema={fuentes} porDefecto="titulos" catalogo={FONTS} familiaCss={familiaCss} />
      <Campo etiqueta="Tamaño de la descripción">
        <SelectKit className={control} value={String(e.description_size ?? '')} onChange={(ev) => set('description_size', ev.target.value)}>
          <option value="">Como hoy</option>
          <option value="sm">Pequeño</option>
          <option value="md">Mediano</option>
          <option value="lg">Grande</option>
        </SelectKit>
      </Campo>
      <ColorKit etiqueta="Color de la descripción" value={typeof e.description_color === 'string' && e.description_color.startsWith('#') ? e.description_color : '#4b5563'} onChange={(ev) => set('description_color', ev.target.value)} />
      <Campo etiqueta="Peso de la descripción">
        <SelectKit className={control} value={String(e.description_weight ?? '')} onChange={(ev) => set('description_weight', ev.target.value)}>
          <option value="">Como hoy</option>
          {['normal', 'medium', 'semibold', 'bold'].map((t) => <option key={t} value={t}>{t}</option>)}
        </SelectKit>
      </Campo>
      {/* ENCABE-97 */}
      <FontField etiqueta="Fuente de la descripción" valor={fuenteEncabezadoAlCampo(e.description_font)} onCambiar={(v) => set('description_font', fuenteEncabezadoAlGuardar(v, fuentes, 'cuerpo'))} fuentesTema={fuentes} porDefecto="cuerpo" catalogo={FONTS} familiaCss={familiaCss} />
      <Campo etiqueta="Ancho máximo de la descripción (caracteres)"><NumeroKit min={20} max={80} value={String(e.description_max ?? '')} onChange={(ev) => set('description_max', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      {/* CASCAR-05/06: una sola acción «Ver todo». Lee el botón anterior (view_all_*) y al editar lo pasa a section_action. */}
      <Accion
        valor={e.section_action ?? accionDesdeVerTodo(e)}
        onCambiar={(v) => {
          const siguiente = { ...e, section_action: v };
          for (const k of CLAVES_VER_TODO) delete siguiente[k];
          if (v == null) delete siguiente.section_action;
          onCambiar(Object.keys(siguiente).length ? siguiente : undefined);
        }}
      />
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
        <SelectKit className={control} value={String(a.dest ?? 'url')} onChange={(ev) => set('dest', ev.target.value)}>
          <option value="url">URL</option>
          <option value="page">Página</option>
          <option value="category">Categoría</option>
          <option value="collection">Colección</option>
        </SelectKit>
      </Campo>
      <Campo etiqueta="Destino"><input className={control} placeholder={a.dest === 'category' ? 'perros o /categorias/perros' : a.dest === 'page' ? '/contacto' : a.dest === 'collection' ? 'verano' : 'https://'} value={String(a.href ?? '')} onChange={(ev) => set('href', ev.target.value)} /></Campo>
      <Campo etiqueta="Tipo">
        <SelectKit className={control} value={String(a.kind ?? 'link')} onChange={(ev) => set('kind', ev.target.value)}>
          <option value="link">Enlace</option>
          <option value="button">Botón</option>
        </SelectKit>
      </Campo>
      <Campo etiqueta="Posición">
        <SelectKit className={control} value={String(a.position ?? 'inline')} onChange={(ev) => set('position', ev.target.value)}>
          <option value="inline">A la derecha del título</option>
          <option value="below">Debajo del título</option>
          <option value="end">Al final, centrado</option>
        </SelectKit>
      </Campo>
      <Campo etiqueta="Estilo del botón">
        <SelectKit className={control} value={String(a.style ?? 'solid')} onChange={(ev) => set('style', ev.target.value)}>
          <option value="solid">Sólido</option>
          <option value="outline">Contorno</option>
          <option value="ghost">Texto</option>
        </SelectKit>
      </Campo>
      <Campo etiqueta="Forma">
        <SelectKit className={control} value={String(a.shape ?? 'pill')} onChange={(ev) => set('shape', ev.target.value)}>
          <option value="pill">Píldora</option>
          <option value="rounded">Redondeado</option>
          <option value="square">Cuadrado</option>
        </SelectKit>
      </Campo>
      <ColorKit etiqueta="Color" value={typeof a.color === 'string' && a.color.startsWith('#') ? a.color : '#111827'} onChange={(ev) => set('color', ev.target.value)} />
      <ColorKit etiqueta="Color del texto" value={typeof a.text_color === 'string' && a.text_color.startsWith('#') ? a.text_color : '#ffffff'} onChange={(ev) => set('text_color', ev.target.value)} />
      <CasillaKit titulo="Flecha" checked={a.icon === true} onChange={(ev) => set('icon', ev.target.checked)} />
      <CasillaKit titulo="Subrayar al pasar" checked={a.underline !== false} onChange={(ev) => set('underline', ev.target.checked)} />
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
        <SelectKit className={control} value={String(m.kind ?? '')} onChange={(ev) => set('kind', ev.target.value)}>
          <option value="">Ninguno</option>
          <option value="image">Imagen</option>
          <option value="icon">Ícono</option>
        </SelectKit>
      </Campo>
      <Campo etiqueta="Imagen o ícono"><input className={control} value={String(m.src ?? m.icon ?? '')} onChange={(ev) => set(m.kind === 'icon' ? 'icon' : 'src', ev.target.value)} /></Campo>
      <Campo etiqueta="Lugar">
        <SelectKit className={control} value={String(m.place ?? 'left')} onChange={(ev) => set('place', ev.target.value)}>
          <option value="left">A la izquierda</option>
          <option value="above">Encima</option>
        </SelectKit>
      </Campo>
      <Campo etiqueta="Tamaño"><NumeroKit min={16} max={96} value={String(m.size ?? '')} onChange={(ev) => set('size', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <Campo etiqueta="Forma">
        <SelectKit className={control} value={String(m.shape ?? 'rounded')} onChange={(ev) => set('shape', ev.target.value)}>
          <option value="rounded">Redondeado</option>
          <option value="circle">Círculo</option>
          <option value="square">Cuadrado</option>
        </SelectKit>
      </Campo>
    </div>
  );
}

const CLAVES_HEREDABLES = ['align', 'layout', 'title_font', 'title_size', 'title_weight', 'title_color', 'title_uppercase', 'title_line', 'description_size', 'description_color', 'description_font', 'description_weight']

export function EditorPestanas({ contenido, onCambiar, fuentes }: { contenido: Record<string, unknown>; onCambiar: (v: Record<string, unknown>) => void; fuentes?: FuentesTema }) {
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
          <CasillaKit titulo="Heredar del estilo global"
              checked={!local && CLAVES_HEREDABLES.every((k) => objeto(contenido.section_header)[k] == null || objeto(contenido.section_header)[k] === '')}
              onChange={(ev) => {
                if (ev.target.checked) { setLocal(false); restablecer() }
                else setLocal(true)
              }} />
          <EditorEncabezado valor={contenido.section_header} fuentes={fuentes} onCambiar={(v) => setClave('section_header', v)} />
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
        <SelectKit className={control} value={String(v.display_mode ?? '')} onChange={(ev) => set('display_mode', ev.target.value)}>
          <option value="">Como hoy</option>
          <option value="grid">Cuadrícula</option>
          <option value="carousel">Carrusel</option>
          <option value="list">Lista</option>
          <option value="masonry">Mosaico</option>
        </SelectKit>
      </Campo>
      <Campo etiqueta="Paginación">
        <SelectKit className={control} value={String(v.pagination ?? '')} onChange={(ev) => set('pagination', ev.target.value)}>
          <option value="">Como hoy</option>
          <option value="none">Sin páginas</option>
          <option value="pages">Páginas</option>
          <option value="load_more">Cargar más</option>
          <option value="infinite">Infinito</option>
          <option value="full">Mostrar todo</option>
        </SelectKit>
      </Campo>
      <Campo etiqueta="Por página"><NumeroKit min={1} max={48} value={String(v.per_page ?? '')} onChange={(ev) => set('per_page', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <Campo etiqueta="Columnas escritorio"><NumeroKit min={1} max={6} value={String(v.columns_desktop ?? '')} onChange={(ev) => set('columns_desktop', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <Campo etiqueta="Columnas tablet"><NumeroKit min={1} max={4} value={String(v.columns_tablet ?? '')} onChange={(ev) => set('columns_tablet', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <Campo etiqueta="Columnas celular"><NumeroKit min={1} max={2} value={String(v.columns_mobile ?? '')} onChange={(ev) => set('columns_mobile', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <Campo etiqueta="Separación"><NumeroKit min={0} max={64} value={String(v.item_gap ?? '')} onChange={(ev) => set('item_gap', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <Campo etiqueta="Flechas">
        <SelectKit className={control} value={String(v.arrow_position ?? '')} onChange={(ev) => set('arrow_position', ev.target.value)}>
          <option value="">Como hoy</option>
          <option value="sides">A los lados</option>
          <option value="top">Arriba a la derecha</option>
          <option value="bottom">Abajo</option>
        </SelectKit>
      </Campo>
      <Campo etiqueta="Visibles en escritorio"><NumeroKit min={1} max={6} value={String(v.visible_desktop ?? '')} onChange={(ev) => set('visible_desktop', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <Campo etiqueta="Visibles en tablet"><NumeroKit min={1} max={4} value={String(v.visible_tablet ?? '')} onChange={(ev) => set('visible_tablet', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <Campo etiqueta="Visibles en celular"><NumeroKit min={1} max={2} value={String(v.visible_mobile ?? '')} onChange={(ev) => set('visible_mobile', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <CasillaKit titulo="Puntos" checked={v.dots === true} onChange={(ev) => set('dots', ev.target.checked)} />
      <CasillaKit titulo="Barra de progreso" checked={v.progress === true} onChange={(ev) => set('progress', ev.target.checked)} />
      <CasillaKit titulo="Autoplay" checked={v.autoplay === true} onChange={(ev) => set('autoplay', ev.target.checked)} />
      <Campo etiqueta="Intervalo (s)"><NumeroKit min={2} max={20} value={String(v.autoplay_interval ?? '')} onChange={(ev) => set('autoplay_interval', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <CasillaKit titulo="Loop" checked={v.loop !== false} onChange={(ev) => set('loop', ev.target.checked)} />
      <CasillaKit titulo="Arrastre" checked={v.drag !== false} onChange={(ev) => set('drag', ev.target.checked)} />
    </div>
  )
}

export function EditorFondo({ valor, onCambiar }: { valor: unknown; onCambiar: (v: unknown) => void }) {
  const tk = useTextosEditor();
  const f = objeto(valor);
  const set = (k: string, v: unknown) => {
    const siguiente = { ...f, [k]: v };
    if (v == null || v === '') delete siguiente[k];
    onCambiar(Object.keys(siguiente).length ? siguiente : undefined);
  };
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
      <p className="text-sm font-semibold text-fg">Fondo de la sección</p>
      <ColorKit etiqueta="Color" value={typeof f.color === 'string' && f.color.startsWith('#') ? f.color : '#ffffff'} onChange={(ev) => set('color', ev.target.value)} />
      <ColorKit etiqueta={tk('controles.degradado1')} value={typeof f.gradient_1 === 'string' && f.gradient_1.startsWith('#') ? f.gradient_1 : '#ffffff'} onChange={(ev) => set('gradient_1', ev.target.value)} />
      <ColorKit etiqueta={tk('controles.degradado2')} value={typeof f.gradient_2 === 'string' && f.gradient_2.startsWith('#') ? f.gradient_2 : '#ffffff'} onChange={(ev) => set('gradient_2', ev.target.value)} />
      <Campo etiqueta="Ángulo"><NumeroKit min={0} max={360} value={String(f.gradient_angle ?? '')} onChange={(ev) => set('gradient_angle', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <Campo etiqueta="Imagen de escritorio"><input className={control} value={String(f.image_url ?? '')} onChange={(ev) => set('image_url', ev.target.value)} /></Campo>
      <Campo etiqueta="Imagen de celular"><input className={control} value={String(f.image_url_mobile ?? '')} onChange={(ev) => set('image_url_mobile', ev.target.value)} /></Campo>
      <Campo etiqueta="Ajuste">
        <SelectKit className={control} value={String(f.image_fit ?? '')} onChange={(ev) => set('image_fit', ev.target.value)}>
          <option value="">Cubrir</option>
          <option value="cover">Cubrir</option>
          <option value="contain">Contener</option>
        </SelectKit>
      </Campo>
      <Campo etiqueta="Posición de la imagen">
        <SelectKit className={control} value={String(f.image_position ?? '')} onChange={(ev) => set('image_position', ev.target.value)}>
          <option value="">Centro</option>
          <option value="center">Centro</option>
          <option value="top">Arriba</option>
          <option value="bottom">Abajo</option>
          <option value="left">Izquierda</option>
          <option value="right">Derecha</option>
        </SelectKit>
      </Campo>
      <Campo etiqueta="Opacidad de la capa"><NumeroKit min={0} max={100} value={String(f.overlay_opacity ?? '')} onChange={(ev) => set('overlay_opacity', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <CasillaKit titulo="Parallax" checked={f.parallax === true} onChange={(ev) => set('parallax', ev.target.checked)} />
      <Campo etiqueta="Relleno superior"><NumeroKit min={0} max={200} value={String(f.padding_top ?? '')} onChange={(ev) => set('padding_top', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <Campo etiqueta="Relleno inferior"><NumeroKit min={0} max={200} value={String(f.padding_bottom ?? '')} onChange={(ev) => set('padding_bottom', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      <Campo etiqueta="Ancho">
        <SelectKit className={control} value={String(f.width ?? '')} onChange={(ev) => set('width', ev.target.value)}>
          <option value="">Como hoy</option>
          <option value="content">Contenido</option>
          <option value="full">Completo</option>
        </SelectKit>
      </Campo>
      <Campo etiqueta="Separador">
        <SelectKit className={control} value={String(f.separator ?? '')} onChange={(ev) => set('separator', ev.target.value)}>
          <option value="">Ninguno</option>
          <option value="line">Línea</option>
          <option value="wave">Ola</option>
          <option value="diagonal">Diagonal</option>
        </SelectKit>
      </Campo>
      <ColorKit etiqueta="Color del separador" value={typeof f.separator_color === 'string' && f.separator_color.startsWith('#') ? f.separator_color : '#111827'} onChange={(ev) => set('separator_color', ev.target.value)} />
    </div>
  );
}
