'use client'

import { useState, type ReactNode } from 'react'
import { ETIQUETA_LAYOUT, LAYOUTS_BOLETIN, precargaBoletin, type LayoutBoletin } from '@/lib/website/boletinPresets'

const control = 'h-8 w-full rounded-md border border-line bg-surface px-2 text-sm text-fg'

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? { ...(valor as Record<string, unknown>) } : {}
}

function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">
      <span>{etiqueta}</span>
      {children}
    </label>
  )
}

function Tipografia({
  nombre,
  prefijo,
  textos,
  deshabilitado,
  onCambiar,
}: {
  nombre: string
  prefijo: string
  textos: Record<string, unknown>
  deshabilitado?: boolean
  onCambiar: (clave: string, valor: unknown) => void
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-2">
      <p className="text-xs font-semibold text-fg">Tipografía de {nombre}</p>
      <Campo etiqueta="Tamaño">
        <select className={control} disabled={deshabilitado} value={String(textos[`${prefijo}_size`] ?? '')} onChange={(e) => onCambiar(`${prefijo}_size`, e.target.value)}>
          <option value="">Como hoy</option>
          {['sm', 'md', 'lg', 'xl', '2xl', '3xl'].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Peso">
        <select className={control} disabled={deshabilitado} value={String(textos[`${prefijo}_weight`] ?? '')} onChange={(e) => onCambiar(`${prefijo}_weight`, e.target.value)}>
          <option value="">Como hoy</option>
          {['normal', 'medium', 'semibold', 'bold'].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Fuente"><input className={control} disabled={deshabilitado} value={String(textos[`${prefijo}_font`] ?? '')} onChange={(e) => onCambiar(`${prefijo}_font`, e.target.value)} /></Campo>
      <Campo etiqueta="Color"><input type="color" disabled={deshabilitado} value={typeof textos[`${prefijo}_color`] === 'string' ? String(textos[`${prefijo}_color`]) : '#111827'} onChange={(e) => onCambiar(`${prefijo}_color`, e.target.value)} /></Campo>
    </div>
  )
}

function Miniatura({ layout }: { layout: LayoutBoletin }) {
  const foto = <span className="block h-full min-h-3 rounded-sm bg-fg/20" />
  const texto = <span className="block h-1.5 w-full rounded-sm bg-fg/40" />
  const cuerpo = (
    <span className="flex flex-1 flex-col justify-center gap-1">
      {texto}
      <span className="block h-2 w-2/3 rounded-sm bg-fg/70" />
    </span>
  )
  if (layout === 'image_left' || layout === 'split_bg') {
    return <span className="flex h-10 gap-1">{foto}{cuerpo}</span>
  }
  if (layout === 'image_right') {
    return <span className="flex h-10 gap-1">{cuerpo}{foto}</span>
  }
  if (layout === 'image_top') {
    return <span className="flex h-10 flex-col gap-1">{foto}{cuerpo}</span>
  }
  if (layout === 'image_bottom') {
    return <span className="flex h-10 flex-col gap-1">{cuerpo}{foto}</span>
  }
  if (layout === 'card_floating') {
    return <span className="flex h-10 items-center justify-center bg-fg/10"><span className="w-2/3 rounded-sm bg-surface p-1 shadow">{cuerpo}</span></span>
  }
  if (layout === 'inline_bar') {
    return <span className="flex h-10 items-center gap-1">{cuerpo}<span className="h-3 w-8 rounded-full bg-fg/50" /></span>
  }
  return <span className="flex h-10 flex-col items-center justify-center gap-1">{cuerpo}</span>
}

const PESTANAS = ['diseno', 'textos', 'formulario', 'fondo', 'popup'] as const

export function EditorBoletin({
  contenido,
  onCambiar,
  deshabilitado,
}: {
  contenido: Record<string, unknown>
  onCambiar: (v: Record<string, unknown>) => void
  deshabilitado?: boolean
}) {
  const [pestana, setPestana] = useState<(typeof PESTANAS)[number]>('diseno')
  const [ancho, setAncho] = useState<'escritorio' | 'celular'>('escritorio')
  const boletin = objeto(contenido.newsletter)
  const textos = objeto(boletin.texts)
  const form = objeto(boletin.form)
  const input = objeto(form.input)
  const boton = objeto(form.button)
  const media = objeto(boletin.media)
  const fondo = objeto(boletin.background)
  const caja = objeto(boletin.container)
  const popup = objeto(boletin.popup)
  const layout = typeof contenido.newsletter_layout === 'string' ? contenido.newsletter_layout : ''

  const setRaiz = (clave: string, valor: unknown) => {
    const siguiente = { ...contenido, [clave]: valor }
    if (valor == null || valor === '') delete siguiente[clave]
    onCambiar(siguiente)
  }
  const setBoletin = (parcial: Record<string, unknown>) => {
    const siguiente = { ...boletin, ...parcial }
    for (const [k, v] of Object.entries(siguiente)) {
      if (v == null || v === '' || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0)) delete siguiente[k]
    }
    setRaiz('newsletter', Object.keys(siguiente).length ? siguiente : undefined)
  }
  const setNivel = (grupo: string, actual: Record<string, unknown>, clave: string, valor: unknown) => {
    const siguiente = { ...actual, [clave]: valor }
    if (valor == null || valor === '' || valor === false) delete siguiente[clave]
    setBoletin({ [grupo]: Object.keys(siguiente).length ? siguiente : undefined })
  }

  const elegir = (id: LayoutBoletin) => {
    const precarga = precargaBoletin(id)
    const { form: formPrecarga, ...resto } = precarga
    onCambiar({
      ...contenido,
      newsletter_layout: id,
      newsletter: {
        ...boletin,
        ...resto,
        form: { ...form, ...(formPrecarga as Record<string, unknown> | undefined) },
      },
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-fg-secondary">Sin un preset ni estas opciones, la sección se ve como hoy y el botón no envía el correo.</p>
      <div className="flex gap-2">
        <button type="button" className={control} disabled={deshabilitado} onClick={() => setAncho('escritorio')}>Escritorio</button>
        <button type="button" className={control} disabled={deshabilitado} onClick={() => setAncho('celular')}>Celular</button>
      </div>
      <div className={`mx-auto rounded-lg border border-line bg-surface-secondary p-3 ${ancho === 'celular' ? 'w-[220px]' : 'w-full'}`}>
        <Miniatura layout={(LAYOUTS_BOLETIN as readonly string[]).includes(layout) ? layout as LayoutBoletin : 'centered'} />
        <p className="mt-2 truncate text-center text-sm font-semibold text-fg">{String(contenido.title || 'Suscríbete')}</p>
        <p className="truncate text-center text-[11px] text-fg-secondary">{String(contenido.subtitle || '')}</p>
      </div>
      <div className="flex flex-wrap gap-1">
        {PESTANAS.map((p) => (
          <button key={p} type="button" className={control} onClick={() => setPestana(p)}>
            {p === 'diseno' ? 'Diseño' : p === 'textos' ? 'Textos' : p === 'formulario' ? 'Formulario' : p === 'fondo' ? 'Fondo e imagen' : 'Popup'}
          </button>
        ))}
      </div>

      {pestana === 'diseno' && (
        <div className="grid grid-cols-2 gap-2">
          {LAYOUTS_BOLETIN.map((id) => (
            <button key={id} type="button" disabled={deshabilitado} onClick={() => elegir(id)} className={`rounded-lg border p-2 text-left ${layout === id ? 'border-fg' : 'border-line'}`}>
              <Miniatura layout={id} />
              <span className="mt-1 block text-[11px] text-fg">{ETIQUETA_LAYOUT[id]}</span>
            </button>
          ))}
          <Campo etiqueta="Alineación">
            <select className={control} disabled={deshabilitado} value={String(boletin.align ?? '')} onChange={(e) => setBoletin({ align: e.target.value || undefined })}>
              <option value="">Como hoy</option>
              <option value="left">Izquierda</option>
              <option value="center">Centro</option>
              <option value="right">Derecha</option>
            </select>
          </Campo>
        </div>
      )}

      {pestana === 'textos' && (
        <div className="flex flex-col gap-2">
          <Campo etiqueta="Etiqueta pequeña"><input className={control} disabled={deshabilitado} value={String(textos.eyebrow ?? '')} onChange={(e) => setNivel('texts', textos, 'eyebrow', e.target.value)} /></Campo>
          <Campo etiqueta="Título"><input className={control} disabled={deshabilitado} value={String(contenido.title ?? '')} onChange={(e) => setRaiz('title', e.target.value)} /></Campo>
          <Campo etiqueta="Descripción"><textarea className={control} disabled={deshabilitado} rows={2} value={String(contenido.subtitle ?? '')} onChange={(e) => setRaiz('subtitle', e.target.value)} /></Campo>
          <Campo etiqueta="Texto legal"><textarea className={control} disabled={deshabilitado} rows={2} value={String(textos.legal ?? contenido.disclaimer ?? '')} onChange={(e) => onCambiar({ ...contenido, disclaimer: e.target.value || undefined, newsletter: { ...boletin, texts: { ...textos, legal: e.target.value || undefined } } })} /></Campo>
          <Campo etiqueta="Enlace de la política"><input className={control} disabled={deshabilitado} value={String(textos.legal_href ?? '')} onChange={(e) => setNivel('texts', textos, 'legal_href', e.target.value)} /></Campo>
          <Tipografia nombre="la ceja" prefijo="eyebrow" textos={textos} deshabilitado={deshabilitado} onCambiar={(k, v) => setNivel('texts', textos, k, v)} />
          <Tipografia nombre="el título" prefijo="title" textos={textos} deshabilitado={deshabilitado} onCambiar={(k, v) => setNivel('texts', textos, k, v)} />
          <Tipografia nombre="la descripción" prefijo="description" textos={textos} deshabilitado={deshabilitado} onCambiar={(k, v) => setNivel('texts', textos, k, v)} />
          <Tipografia nombre="el texto legal" prefijo="legal" textos={textos} deshabilitado={deshabilitado} onCambiar={(k, v) => setNivel('texts', textos, k, v)} />
          <Campo etiqueta="Mensaje de éxito"><input className={control} disabled={deshabilitado} value={String(boletin.success ?? '')} onChange={(e) => setBoletin({ success: e.target.value })} /></Campo>
          <Campo etiqueta="Mensaje de error"><input className={control} disabled={deshabilitado} value={String(boletin.error ?? '')} onChange={(e) => setBoletin({ error: e.target.value })} /></Campo>
          <Campo etiqueta="Incentivo"><input className={control} disabled={deshabilitado} placeholder="10 % en tu primera compra" value={String(boletin.incentive ?? '')} onChange={(e) => setBoletin({ incentive: e.target.value })} /></Campo>
        </div>
      )}

      {pestana === 'formulario' && (
        <div className="flex flex-col gap-2">
          <label className="flex justify-between text-sm text-fg"><span>Pedir nombre</span><input type="checkbox" disabled={deshabilitado} checked={form.show_name === true} onChange={(e) => setNivel('form', form, 'show_name', e.target.checked || undefined)} /></label>
          <label className="flex justify-between text-sm text-fg"><span>Pedir teléfono o WhatsApp</span><input type="checkbox" disabled={deshabilitado} checked={form.show_phone === true} onChange={(e) => setNivel('form', form, 'show_phone', e.target.checked || undefined)} /></label>
          <label className="flex justify-between text-sm text-fg"><span>Pedir cumpleaños</span><input type="checkbox" disabled={deshabilitado} checked={form.show_birthday === true} onChange={(e) => setNivel('form', form, 'show_birthday', e.target.checked || undefined)} /></label>
          <label className="flex justify-between text-sm text-fg"><span>Casilla de datos (Ley 1581)</span><input type="checkbox" disabled={deshabilitado} checked={form.show_consent === true} onChange={(e) => setNivel('form', form, 'show_consent', e.target.checked || undefined)} /></label>
          <Campo etiqueta="Texto de la casilla"><input className={control} disabled={deshabilitado} value={String(form.consent_label ?? '')} onChange={(e) => setNivel('form', form, 'consent_label', e.target.value)} /></Campo>
          <Campo etiqueta="Enlace de la casilla"><input className={control} disabled={deshabilitado} value={String(form.consent_href ?? '')} onChange={(e) => setNivel('form', form, 'consent_href', e.target.value)} /></Campo>
          <Campo etiqueta="Disposición">
            <select className={control} disabled={deshabilitado} value={String(form.arrangement ?? '')} onChange={(e) => setNivel('form', form, 'arrangement', e.target.value)}>
              <option value="">En línea</option>
              <option value="inline">En línea</option>
              <option value="stacked">Apilados</option>
              <option value="inside">Botón dentro</option>
            </select>
          </Campo>
          <Campo etiqueta="Placeholder"><input className={control} disabled={deshabilitado} value={String(form.placeholder ?? contenido.placeholder ?? '')} onChange={(e) => onCambiar({ ...contenido, placeholder: e.target.value || undefined, newsletter: { ...boletin, form: { ...form, placeholder: e.target.value || undefined } } })} /></Campo>
          <Campo etiqueta="Estilo del campo">
            <select className={control} disabled={deshabilitado} value={String(input.style ?? '')} onChange={(e) => setBoletin({ form: { ...form, input: { ...input, style: e.target.value || undefined } } })}>
              <option value="">Contorno</option>
              <option value="outline">Contorno</option>
              <option value="filled">Relleno</option>
              <option value="underline">Subrayado</option>
            </select>
          </Campo>
          <Campo etiqueta="Forma del campo">
            <select className={control} disabled={deshabilitado} value={String(input.shape ?? '')} onChange={(e) => setBoletin({ form: { ...form, input: { ...input, shape: e.target.value || undefined } } })}>
              <option value="">Redondeado</option>
              <option value="square">Cuadrado</option>
              <option value="rounded">Redondeado</option>
              <option value="semi">Semi</option>
              <option value="pill">Píldora</option>
            </select>
          </Campo>
          <Campo etiqueta="Ancho del borde"><input className={control} type="number" min={0} max={8} disabled={deshabilitado} value={String(input.border_width ?? '')} onChange={(e) => setBoletin({ form: { ...form, input: { ...input, border_width: e.target.value ? Number(e.target.value) : undefined } } })} /></Campo>
          <Campo etiqueta="Color del borde"><input type="color" disabled={deshabilitado} value={typeof input.border_color === 'string' ? input.border_color : '#d1d5db'} onChange={(e) => setBoletin({ form: { ...form, input: { ...input, border_color: e.target.value } } })} /></Campo>
          <Campo etiqueta="Color al enfocar"><input type="color" disabled={deshabilitado} value={typeof input.focus_color === 'string' ? input.focus_color : '#111827'} onChange={(e) => setBoletin({ form: { ...form, input: { ...input, focus_color: e.target.value } } })} /></Campo>
          <Campo etiqueta="Fondo del campo"><input type="color" disabled={deshabilitado} value={typeof input.background === 'string' ? input.background : '#ffffff'} onChange={(e) => setBoletin({ form: { ...form, input: { ...input, background: e.target.value } } })} /></Campo>
          <Campo etiqueta="Color del texto"><input type="color" disabled={deshabilitado} value={typeof input.color === 'string' ? input.color : '#111827'} onChange={(e) => setBoletin({ form: { ...form, input: { ...input, color: e.target.value } } })} /></Campo>
          <Campo etiqueta="Color del placeholder"><input type="color" disabled={deshabilitado} value={typeof input.placeholder_color === 'string' ? input.placeholder_color : '#9ca3af'} onChange={(e) => setBoletin({ form: { ...form, input: { ...input, placeholder_color: e.target.value } } })} /></Campo>
          <Campo etiqueta="Tamaño del campo">
            <select className={control} disabled={deshabilitado} value={String(input.size ?? '')} onChange={(e) => setBoletin({ form: { ...form, input: { ...input, size: e.target.value || undefined } } })}>
              <option value="">Mediano</option>
              <option value="sm">Pequeño</option>
              <option value="md">Mediano</option>
              <option value="lg">Grande</option>
            </select>
          </Campo>
          <label className="flex justify-between text-sm text-fg"><span>Ícono de sobre</span><input type="checkbox" disabled={deshabilitado} checked={input.icon === true} onChange={(e) => setBoletin({ form: { ...form, input: { ...input, icon: e.target.checked || undefined } } })} /></label>
          <Campo etiqueta="Texto del botón"><input className={control} disabled={deshabilitado} value={String(boton.text ?? contenido.button_text ?? '')} onChange={(e) => onCambiar({ ...contenido, button_text: e.target.value || undefined, newsletter: { ...boletin, form: { ...form, button: { ...boton, text: e.target.value || undefined } } } })} /></Campo>
          <Campo etiqueta="Estilo del botón">
            <select className={control} disabled={deshabilitado} value={String(boton.style ?? '')} onChange={(e) => setBoletin({ form: { ...form, button: { ...boton, style: e.target.value || undefined } } })}>
              <option value="">Sólido</option>
              <option value="solid">Sólido</option>
              <option value="outline">Contorno</option>
              <option value="gradient">Degradado</option>
              <option value="icon_only">Solo ícono</option>
            </select>
          </Campo>
          <Campo etiqueta="Tamaño del botón">
            <select className={control} disabled={deshabilitado} value={String(boton.size ?? '')} onChange={(e) => setBoletin({ form: { ...form, button: { ...boton, size: e.target.value || undefined } } })}>
              <option value="">Mediano</option>
              <option value="sm">Pequeño</option>
              <option value="md">Mediano</option>
              <option value="lg">Grande</option>
            </select>
          </Campo>
          <Campo etiqueta="Forma del botón">
            <select className={control} disabled={deshabilitado} value={String(boton.shape ?? '')} onChange={(e) => setBoletin({ form: { ...form, button: { ...boton, shape: e.target.value || undefined } } })}>
              <option value="">Redondeado</option>
              <option value="square">Cuadrado</option>
              <option value="rounded">Redondeado</option>
              <option value="semi">Semi</option>
              <option value="pill">Píldora</option>
            </select>
          </Campo>
          <Campo etiqueta="Color del botón"><input type="color" disabled={deshabilitado} value={typeof boton.color === 'string' ? boton.color : '#111827'} onChange={(e) => setBoletin({ form: { ...form, button: { ...boton, color: e.target.value } } })} /></Campo>
          <Campo etiqueta="Color del texto del botón"><input type="color" disabled={deshabilitado} value={typeof boton.text_color === 'string' ? boton.text_color : '#ffffff'} onChange={(e) => setBoletin({ form: { ...form, button: { ...boton, text_color: e.target.value } } })} /></Campo>
          <Campo etiqueta="Color al pasar"><input type="color" disabled={deshabilitado} value={typeof boton.hover === 'string' ? boton.hover : '#111827'} onChange={(e) => setBoletin({ form: { ...form, button: { ...boton, hover: e.target.value } } })} /></Campo>
          <label className="flex justify-between text-sm text-fg"><span>Ícono en el botón</span><input type="checkbox" disabled={deshabilitado} checked={boton.icon === true} onChange={(e) => setBoletin({ form: { ...form, button: { ...boton, icon: e.target.checked || undefined } } })} /></label>
        </div>
      )}

      {pestana === 'fondo' && (
        <div className="flex flex-col gap-2">
          <Campo etiqueta="Imagen de escritorio"><input className={control} disabled={deshabilitado} value={String(media.desktop ?? contenido.image_url ?? '')} onChange={(e) => onCambiar({ ...contenido, image_url: e.target.value || undefined, newsletter: { ...boletin, media: { ...media, desktop: e.target.value || undefined } } })} /></Campo>
          <Campo etiqueta="Imagen de celular"><input className={control} disabled={deshabilitado} value={String(media.mobile ?? '')} onChange={(e) => setNivel('media', media, 'mobile', e.target.value)} /></Campo>
          <Campo etiqueta="Ajuste">
            <select className={control} disabled={deshabilitado} value={String(media.fit ?? '')} onChange={(e) => setNivel('media', media, 'fit', e.target.value)}>
              <option value="">Cubrir</option>
              <option value="cover">Cubrir</option>
              <option value="contain">Contener</option>
            </select>
          </Campo>
          <Campo etiqueta="Radio"><input className={control} type="number" min={0} max={48} disabled={deshabilitado} value={String(media.radius ?? '')} onChange={(e) => setNivel('media', media, 'radius', e.target.value ? Number(e.target.value) : undefined)} /></Campo>
          <Campo etiqueta="Posición">
            <select className={control} disabled={deshabilitado} value={String(media.focal ?? '')} onChange={(e) => setNivel('media', media, 'focal', e.target.value)}>
              <option value="">Centro</option>
              <option value="center">Centro</option>
              <option value="top">Arriba</option>
              <option value="bottom">Abajo</option>
              <option value="left">Izquierda</option>
              <option value="right">Derecha</option>
            </select>
          </Campo>
          <label className="flex justify-between text-sm text-fg"><span>Sombra de la imagen</span><input type="checkbox" disabled={deshabilitado} checked={media.shadow === true} onChange={(e) => setNivel('media', media, 'shadow', e.target.checked || undefined)} /></label>
          <label className="flex justify-between text-sm text-fg"><span>Ocultar imagen en celular</span><input type="checkbox" disabled={deshabilitado} checked={media.hide_mobile === true} onChange={(e) => setNivel('media', media, 'hide_mobile', e.target.checked || undefined)} /></label>
          <Campo etiqueta="Color de fondo"><input type="color" disabled={deshabilitado} value={typeof fondo.color === 'string' ? fondo.color : '#ffffff'} onChange={(e) => setNivel('background', fondo, 'color', e.target.value)} /></Campo>
          <Campo etiqueta="Degradado 1"><input type="color" disabled={deshabilitado} value={typeof fondo.gradient_1 === 'string' ? fondo.gradient_1 : '#ffffff'} onChange={(e) => setNivel('background', fondo, 'gradient_1', e.target.value)} /></Campo>
          <Campo etiqueta="Degradado 2"><input type="color" disabled={deshabilitado} value={typeof fondo.gradient_2 === 'string' ? fondo.gradient_2 : '#e5e7eb'} onChange={(e) => setNivel('background', fondo, 'gradient_2', e.target.value)} /></Campo>
          <Campo etiqueta="Degradado 3"><input type="color" disabled={deshabilitado} value={typeof fondo.gradient_3 === 'string' ? fondo.gradient_3 : '#111827'} onChange={(e) => setNivel('background', fondo, 'gradient_3', e.target.value)} /></Campo>
          <Campo etiqueta="Ángulo"><input className={control} type="number" min={0} max={360} disabled={deshabilitado} value={String(fondo.angle ?? '')} onChange={(e) => setNivel('background', fondo, 'angle', e.target.value ? Number(e.target.value) : undefined)} /></Campo>
          <Campo etiqueta="Tipo de degradado">
            <select className={control} disabled={deshabilitado} value={String(fondo.gradient_type ?? '')} onChange={(e) => setNivel('background', fondo, 'gradient_type', e.target.value)}>
              <option value="">Lineal</option>
              <option value="linear">Lineal</option>
              <option value="radial">Radial</option>
            </select>
          </Campo>
          <Campo etiqueta="Imagen de fondo"><input className={control} disabled={deshabilitado} value={String(fondo.image ?? '')} onChange={(e) => setNivel('background', fondo, 'image', e.target.value)} /></Campo>
          <Campo etiqueta="Color de la capa"><input type="color" disabled={deshabilitado} value={typeof fondo.overlay === 'string' ? fondo.overlay : '#000000'} onChange={(e) => setNivel('background', fondo, 'overlay', e.target.value)} /></Campo>
          <Campo etiqueta="Opacidad de la capa"><input className={control} type="number" min={0} max={100} disabled={deshabilitado} value={String(fondo.overlay_opacity ?? '')} onChange={(e) => setNivel('background', fondo, 'overlay_opacity', e.target.value ? Number(e.target.value) : undefined)} /></Campo>
          <label className="flex justify-between text-sm text-fg"><span>Patrón</span><input type="checkbox" disabled={deshabilitado} checked={fondo.pattern === true} onChange={(e) => setNivel('background', fondo, 'pattern', e.target.checked || undefined)} /></label>
          <Campo etiqueta="Relleno"><input className={control} type="number" min={0} max={160} disabled={deshabilitado} value={String(fondo.padding ?? '')} onChange={(e) => setNivel('background', fondo, 'padding', e.target.value ? Number(e.target.value) : undefined)} /></Campo>
          <Campo etiqueta="Ancho">
            <select className={control} disabled={deshabilitado} value={String(fondo.width ?? '')} onChange={(e) => setNivel('background', fondo, 'width', e.target.value)}>
              <option value="">Contenido</option>
              <option value="content">Contenido</option>
              <option value="full">Completo</option>
            </select>
          </Campo>
          <Campo etiqueta="Fondo del bloque"><input type="color" disabled={deshabilitado} value={typeof caja.color === 'string' ? caja.color : '#ffffff'} onChange={(e) => setNivel('container', caja, 'color', e.target.value)} /></Campo>
          <Campo etiqueta="Borde del bloque"><input type="color" disabled={deshabilitado} value={typeof caja.border === 'string' ? caja.border : '#e5e7eb'} onChange={(e) => setNivel('container', caja, 'border', e.target.value)} /></Campo>
          <Campo etiqueta="Radio del bloque"><input className={control} type="number" min={0} max={48} disabled={deshabilitado} value={String(caja.radius ?? '')} onChange={(e) => setNivel('container', caja, 'radius', e.target.value ? Number(e.target.value) : undefined)} /></Campo>
          <Campo etiqueta="Relleno del bloque"><input className={control} type="number" min={0} max={80} disabled={deshabilitado} value={String(caja.padding ?? '')} onChange={(e) => setNivel('container', caja, 'padding', e.target.value ? Number(e.target.value) : undefined)} /></Campo>
          <Campo etiqueta="Ancho máximo"><input className={control} type="number" min={280} max={1200} disabled={deshabilitado} value={String(caja.max_width ?? '')} onChange={(e) => setNivel('container', caja, 'max_width', e.target.value ? Number(e.target.value) : undefined)} /></Campo>
          <label className="flex justify-between text-sm text-fg"><span>Sombra del bloque</span><input type="checkbox" disabled={deshabilitado} checked={caja.shadow === true} onChange={(e) => setNivel('container', caja, 'shadow', e.target.checked || undefined)} /></label>
        </div>
      )}

      {pestana === 'popup' && (
        <div className="flex flex-col gap-2">
          <label className="flex justify-between text-sm text-fg"><span>Mostrar también como ventana</span><input type="checkbox" disabled={deshabilitado} checked={popup.enabled === true} onChange={(e) => setNivel('popup', popup, 'enabled', e.target.checked || undefined)} /></label>
          <Campo etiqueta="Cuándo">
            <select className={control} disabled={deshabilitado} value={String(popup.trigger ?? 'enter')} onChange={(e) => setNivel('popup', popup, 'trigger', e.target.value)}>
              <option value="enter">Al entrar</option>
              <option value="delay">Después de un tiempo</option>
              <option value="exit">Al intentar salir</option>
            </select>
          </Campo>
          <Campo etiqueta="Segundos"><input className={control} type="number" min={2} max={60} disabled={deshabilitado} value={String(popup.delay ?? '')} onChange={(e) => setNivel('popup', popup, 'delay', e.target.value ? Number(e.target.value) : undefined)} /></Campo>
          <p className="text-[12px] text-fg-secondary">Sale una vez por sesión del navegador.</p>
          <label className="flex justify-between text-sm text-fg"><span>Logos de redes</span><input type="checkbox" disabled={deshabilitado} checked={boletin.social === true} onChange={(e) => setBoletin({ social: e.target.checked || undefined })} /></label>
        </div>
      )}
    </div>
  )
}
