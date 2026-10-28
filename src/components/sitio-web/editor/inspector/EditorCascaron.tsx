'use client';

import { useTextosEditor } from '../textos';
import { SelectKit, NumeroKit, CasillaKit, ColorKit } from './controlesKit';
import { useState, type ReactNode } from 'react';
import { accionDesdeVerTodo, CLAVES_VER_TODO } from './espaciadoSeccion';
import { ATAJOS_ESPACIADO, aplicarAtajo, atajoActual, cambioEspacio, type AtajoEspaciado } from './espacioUnico';
import { ChipsOpcion } from '@/components/kit';
import type { FuentesTema } from '@/lib/website/v2/fuenteTema';
import type { EspacioSeccion, LadoEspacio } from '@/lib/website/espacioSeccion';

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

export function EditorEncabezado({ valor, onCambiar }: { valor: unknown; onCambiar: (v: unknown) => void; fuentes?: FuentesTema }) {
  const tk = useTextosEditor();
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
      <Campo etiqueta="Tamaño de la descripción">
        <SelectKit className={control} value={String(e.description_size ?? '')} onChange={(ev) => set('description_size', ev.target.value)}>
          <option value="">Como hoy</option>
          <option value="sm">Pequeño</option>
          <option value="md">Mediano</option>
          <option value="lg">Grande</option>
        </SelectKit>
      </Campo>
      <Campo etiqueta="Peso de la descripción">
        <SelectKit className={control} value={String(e.description_weight ?? '')} onChange={(ev) => set('description_weight', ev.target.value)}>
          <option value="">Como hoy</option>
          {['normal', 'medium', 'semibold', 'bold'].map((t) => <option key={t} value={t}>{t}</option>)}
        </SelectKit>
      </Campo>
      {/* ESTILO-06: los colores del título y la descripción se eligen en Estilo › Colores (una sola opción). */}
      <p className="text-[12px] leading-4 text-fg-muted">{tk('estiloUnico.colorEnEstilo')}</p>
      {/* ESTILO-05: la fuente del título y de la descripción se elige en Estilo › Tipografía (una sola opción). */}
      <p className="text-[12px] leading-4 text-fg-muted">{tk('estiloUnico.fuenteEnEstilo')}</p>
      <Campo etiqueta="Ancho máximo de la descripción (caracteres)"><NumeroKit min={20} max={80} value={String(e.description_max ?? '')} onChange={(ev) => set('description_max', ev.target.value ? Number(ev.target.value) : undefined)} /></Campo>
      {/* CASCAR-05/06: una sola acción «Ver todo». Lee el botón anterior (view_all_*) y al editar lo pasa a section_action. */}
      <Accion
        valor={e.section_action ?? accionDesdeVerTodo(e)}
        onCambiar={(v) => {
          const siguiente: Record<string, unknown> = { ...e, section_action: v };
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

export function EditorPestanas({ contenido, onCambiar, fuentes, espacio }: { contenido: Record<string, unknown>; onCambiar: (v: Record<string, unknown>) => void; fuentes?: FuentesTema; espacio?: EspacioSeccion }) {
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
      {pestana === 'fondo' && (
        <EditorFondo
          valor={contenido.section_background}
          espacio={espacio}
          onCambiar={(v) => {
            const siguiente: Record<string, unknown> = { ...contenido, section_background: v }
            if (v == null) delete siguiente.section_background
            // Un solo margen: el px manda en la tienda; la escala anterior (margin_top/bottom) se conserva
            // para que, al vaciar los campos, la sección vuelva a lo de antes (p. ej. 16 px en 333).
            onCambiar(siguiente)
          }}
        />
      )}
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

/** «24 (predeterminado)» o «16 celular · 24 computador (actual)»: lo que la tienda aplica hoy. */
export function textoHeredado(lado: LadoEspacio | undefined, dispositivo?: 'celular' | 'computador'): string | undefined {
  if (!lado) return undefined;
  const origen = lado.propio ? 'actual' : 'predeterminado';
  if (dispositivo) return `${lado[dispositivo]} (${origen})`;
  return lado.celular === lado.computador ? `${lado.computador} (${origen})` : `${lado.celular} celular · ${lado.computador} computador (${origen})`;
}

/** Cambia el margen de un dispositivo y fija el otro con lo que se ve hoy (no cambia sin querer). */
export function cambioMargen(
  f: Record<string, unknown>,
  lado: 'top' | 'bottom',
  dispositivo: 'celular' | 'computador',
  valor: number | undefined,
  actual: LadoEspacio | undefined,
): Record<string, unknown> {
  return cambioEspacio(f, 'margin', lado, dispositivo, valor, actual);
}

/**
 * Estilo › Espaciado: un solo control. Atajos (compacto / normal / amplio = los px de la escala de siempre),
 * relleno y margen en px por dispositivo. Vacío = lo que la tienda pone hoy, visible como placeholder.
 * Abrirlo no guarda nada.
 */
export function ControlEspaciado({ valor, onCambiar, espacio, etiquetasAtajo, deshabilitado }: {
  valor: unknown;
  onCambiar: (v: Record<string, unknown> | undefined) => void;
  espacio?: EspacioSeccion;
  etiquetasAtajo: Record<AtajoEspaciado, string>;
  deshabilitado?: boolean;
}) {
  const f = objeto(valor);
  const enviar = (sig: Record<string, unknown>) => onCambiar(Object.keys(sig).length ? sig : undefined);
  const filas: Array<{ tipo: 'padding' | 'margin'; lado: 'top' | 'bottom'; etiqueta: string; actual?: LadoEspacio }> = [
    { tipo: 'padding', lado: 'top', etiqueta: 'Relleno superior', actual: espacio?.rellenoArriba },
    { tipo: 'padding', lado: 'bottom', etiqueta: 'Relleno inferior', actual: espacio?.rellenoAbajo },
    { tipo: 'margin', lado: 'top', etiqueta: 'Margen superior', actual: espacio?.margenArriba },
    { tipo: 'margin', lado: 'bottom', etiqueta: 'Margen inferior', actual: espacio?.margenAbajo },
  ];
  return (
    <div className="flex flex-col gap-2">
      <ChipsOpcion<string>
        etiqueta="Atajos de relleno"
        opciones={ATAJOS_ESPACIADO.map((a) => ({ valor: a, etiqueta: etiquetasAtajo[a], deshabilitada: deshabilitado }))}
        valor={atajoActual(espacio) ?? ''}
        onValorChange={(a) => enviar(aplicarAtajo(f, a as AtajoEspaciado))}
      />
      {filas.map(({ tipo, lado, etiqueta, actual }) => {
        const k = `${tipo}_${lado}`;
        const cambiar = (d: 'celular' | 'computador', v: string) => enviar(cambioEspacio(f, tipo, lado, d, v ? Number(v) : undefined, actual));
        return (
          <Campo key={k} etiqueta={etiqueta}>
            <div className="grid grid-cols-2 gap-2">
              <Campo etiqueta="Computador"><NumeroKit min={0} max={200} disabled={deshabilitado} placeholder={textoHeredado(actual, 'computador')} value={String(f[k] ?? '')} onChange={(ev) => cambiar('computador', ev.target.value)} /></Campo>
              <Campo etiqueta="Celular"><NumeroKit min={0} max={200} disabled={deshabilitado} placeholder={textoHeredado(actual, 'celular')} value={String(f[`${k}_mobile`] ?? '')} onChange={(ev) => cambiar('celular', ev.target.value)} /></Campo>
            </div>
          </Campo>
        );
      })}
    </div>
  );
}

export function EditorFondo({ valor, onCambiar }: { valor: unknown; onCambiar: (v: unknown) => void; espacio?: EspacioSeccion }) {
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
      {/* ESTILO-01: color, degradado e imagen se eligen en Estilo › Fondo (una sola opción). Aquí, lo propio del fondo común. */}
      <p className="text-[12px] leading-4 text-fg-muted">{tk('estiloUnico.fondoEnEstilo')}</p>
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
      <CasillaKit titulo="Parallax" checked={f.parallax === true} onChange={(ev) => set('parallax', ev.target.checked)} />
      {/* Relleno, margen y ancho: un solo control en Estilo › Espaciado y Estilo › Ancho (leen lo guardado aquí). */}
      <p className="text-[12px] leading-4 text-fg-muted">El relleno, el margen y el ancho se eligen en Estilo › Espaciado y Estilo › Ancho.</p>
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
