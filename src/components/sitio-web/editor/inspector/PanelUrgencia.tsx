'use client'

import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio'
import { useTimezoneFor } from '@/lib/context/OrganizationTimezoneContext'
import { conversionDesdeColumnas, type ConversionSitio, type ContadorConversion, type UbicacionContador } from '@/lib/website/conversion'
import { ChipsOpcion, FormField } from '@/components/kit'
import { FilaInterruptor } from './PartesZonaGlobal'

const control = 'h-8 w-full rounded-md border border-line bg-surface px-2 text-sm text-fg'
const UBICACIONES: { valor: UbicacionContador; etiqueta: string }[] = [
  { valor: 'carrito', etiqueta: 'Carrito' },
  { valor: 'checkout', etiqueta: 'Pago' },
  { valor: 'producto', etiqueta: 'Producto' },
  { valor: 'topbar', etiqueta: 'Barra superior' },
  { valor: 'hero', etiqueta: 'Portada' },
  { valor: 'seccion', etiqueta: 'Sección' },
]
const LUGARES_BASE: UbicacionContador[] = ['carrito', 'checkout', 'producto']

function avisoViendo(documento: DocumentoSitio): { activo: boolean; plantilla: string } {
  const crudo = documento.shell.header.opciones.urgencia_viendo
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) {
    return { activo: false, plantilla: '{n} personas viendo' }
  }
  const o = crudo as Record<string, unknown>
  return {
    activo: o.activo === true,
    plantilla: typeof o.plantilla === 'string' && o.plantilla.trim() ? o.plantilla.slice(0, 200) : '{n} personas viendo',
  }
}

function vacio(): ConversionSitio {
  return conversionDesdeColumnas({ countdown_enabled: true, checkout_show_stock_warning: false, checkout_stock_warning_threshold: 5 })!
}

export function PanelUrgencia({
  documento,
  onCambiarDocumento,
  deshabilitado,
}: {
  documento: DocumentoSitio
  onCambiarDocumento: (cambiar: (d: DocumentoSitio) => DocumentoSitio) => void
  deshabilitado?: boolean
}) {
  const { timezone } = useTimezoneFor()
  const conversion = documento.conversion
  const contador = conversion?.contadores[0]
  const guardar = (siguiente: ConversionSitio) => {
    onCambiarDocumento((d) => ({ ...d, conversion: siguiente }))
  }
  const setContador = (parcial: Partial<ContadorConversion>) => {
    const baseConv = conversion ?? vacio()
    const base = baseConv.contadores[0]
    guardar({ ...baseConv, contadores: [{ ...base, ...parcial }] })
  }
  const vista = contador?.textoAntes || 'Oferta por tiempo limitado'
  const viendo = avisoViendo(documento)
  const escribirViendo = (activo: boolean, plantilla = viendo.plantilla) => {
    onCambiarDocumento((d) => {
      const opciones = { ...d.shell.header.opciones }
      if (activo) opciones.urgencia_viendo = { activo: true, plantilla }
      else delete opciones.urgencia_viendo
      return { ...d, shell: { ...d.shell, header: { ...d.shell.header, opciones } } }
    })
  }
  const prenderContador = (activo: boolean) => {
    const base = conversion ?? vacio()
    const actual = base.contadores[0] ?? vacio().contadores[0]
    const ubicaciones = activo && actual.ubicaciones.length === 0 ? LUGARES_BASE : actual.ubicaciones
    guardar({ ...base, contadores: [{ ...actual, activo, ubicaciones }] })
  }
  return (
    <section className="mt-4 flex flex-col gap-3 border-t border-line px-1 pt-3">
      <h3 className="text-sm font-semibold text-fg">Urgencia y contador</h3>
      <div className="rounded-lg px-3 py-2 text-center text-sm text-white" style={{ background: contador?.estilo.fondo || '#111827' }}>
        <span>{vista}</span>
        <span className="ml-2 font-mono font-bold">00:10:00</span>
        {contador?.textoDespues ? <span className="ml-2">{contador.textoDespues}</span> : null}
      </div>
      <FilaInterruptor titulo="Contador activo" ayuda="Al prenderlo, se ve en el carrito, el pago y el producto." valor={!!contador?.activo} onCambiar={prenderContador} deshabilitado={deshabilitado} />
      <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">Texto antes
        <input className={control} disabled={deshabilitado} value={contador?.textoAntes ?? ''} onChange={(e) => setContador({ textoAntes: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">Texto después
        <input className={control} disabled={deshabilitado} value={contador?.textoDespues ?? ''} onChange={(e) => setContador({ textoDespues: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">Modo
        <select className={control} disabled={deshabilitado} value={contador?.modo.tipo ?? 'diario'} onChange={(e) => {
          const tipo = e.target.value
          const zona = contador?.modo.tipo === 'fecha' || contador?.modo.tipo === 'diario' ? contador.modo.zona : timezone
          const modo: ContadorConversion['modo'] = tipo === 'fecha'
            ? { tipo: 'fecha', fin: '', zona }
            : tipo === 'promocion'
              ? { tipo: 'promocion', promotionId: '00000000-0000-4000-8000-000000000000' }
              : tipo === 'evergreen'
                ? { tipo: 'evergreen', minutos: 15 }
                : { tipo: 'diario', hora: 0, zona }
          setContador({ modo })
        }}>
          <option value="diario">Diario</option>
          <option value="fecha">Fecha</option>
          <option value="promocion">Promoción</option>
          <option value="evergreen">Por sesión</option>
        </select>
      </label>
      {contador?.modo.tipo === 'fecha' && (
        <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">Fin
          <input className={control} disabled={deshabilitado} value={contador.modo.fin} onChange={(e) => setContador({ modo: { tipo: 'fecha', fin: e.target.value, zona: contador.modo.tipo === 'fecha' ? contador.modo.zona : timezone } })} />
        </label>
      )}
      {contador?.modo.tipo === 'diario' && (
        <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">Hora de reinicio
          <input className={control} type="number" min={0} max={23} disabled={deshabilitado} value={contador.modo.hora} onChange={(e) => setContador({ modo: { tipo: 'diario', hora: Number(e.target.value) || 0, zona: contador.modo.tipo === 'diario' ? contador.modo.zona : timezone } })} />
        </label>
      )}
      {contador?.modo.tipo === 'promocion' && (
        <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">Id de promoción
          <input className={control} disabled={deshabilitado} value={contador.modo.promotionId} onChange={(e) => setContador({ modo: { tipo: 'promocion', promotionId: e.target.value } })} />
        </label>
      )}
      {contador?.modo.tipo === 'evergreen' && (
        <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">Minutos por sesión
          <input className={control} type="number" min={1} max={1440} disabled={deshabilitado} value={contador.modo.minutos} onChange={(e) => setContador({ modo: { tipo: 'evergreen', minutos: Number(e.target.value) || 15 } })} />
        </label>
      )}
      <div className="flex flex-col gap-2">
        <p className="text-[12px] text-fg-secondary">Dónde se ve</p>
        <ChipsOpcion
          multiple
          opciones={UBICACIONES}
          valor={contador?.ubicaciones ?? []}
          onValorChange={(lista) => { if (!deshabilitado) setContador({ ubicaciones: lista }) }}
        />
      </div>
      <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">Al terminar
        <select className={control} disabled={deshabilitado} value={contador?.alTerminar.tipo ?? 'ocultar'} onChange={(e) => setContador({ alTerminar: e.target.value === 'mensaje' ? { tipo: 'mensaje', texto: 'La oferta terminó' } : { tipo: 'ocultar' } })}>
          <option value="ocultar">Ocultar</option>
          <option value="mensaje">Mensaje</option>
        </select>
      </label>
      <FilaInterruptor
        titulo="Aviso de stock bajo"
        ayuda="Quedan unidades, en el carrito, el pago y el producto."
        valor={!!conversion?.urgencia.stockBajo.activo}
        deshabilitado={deshabilitado}
        onCambiar={(activo) => {
          const base = conversion ?? vacio()
          guardar({
            ...base,
            urgencia: {
              ...base.urgencia,
              stockBajo: { ...base.urgencia.stockBajo, activo, ubicaciones: activo ? ['carrito', 'checkout', 'producto'] : [] },
            },
          })
        }}
      />
      <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">Umbral
        <input className={control} type="number" min={1} max={999} disabled={deshabilitado || !conversion} value={conversion?.urgencia.stockBajo.umbral ?? 5} onChange={(e) => conversion && guardar({ ...conversion, urgencia: { ...conversion.urgencia, stockBajo: { ...conversion.urgencia.stockBajo, umbral: Number(e.target.value) || 5 } } })} />
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">Plantilla ({'{n}'})
        <input className={control} disabled={deshabilitado || !conversion} value={conversion?.urgencia.stockBajo.plantilla ?? 'Quedan {n}'} onChange={(e) => conversion && guardar({ ...conversion, urgencia: { ...conversion.urgencia, stockBajo: { ...conversion.urgencia.stockBajo, plantilla: e.target.value } } })} />
      </label>
      <FilaInterruptor
        titulo="Personas viendo"
        ayuda="Número estable por producto. No es gente en vivo."
        valor={viendo.activo}
        deshabilitado={deshabilitado}
        onCambiar={(activo) => escribirViendo(activo)}
      />
      {viendo.activo && (
        <FormField etiqueta="Texto ({n})">
          <input
            className={control}
            disabled={deshabilitado}
            value={viendo.plantilla}
            onChange={(e) => escribirViendo(true, e.target.value)}
          />
        </FormField>
      )}
      <p className="text-[12px] text-fg-secondary">La reserva del carrito sigue apagada: no hay una métrica real.</p>
    </section>
  )
}
