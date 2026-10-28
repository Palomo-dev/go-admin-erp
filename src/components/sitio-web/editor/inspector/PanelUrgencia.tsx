'use client'

import { useCallback, useEffect, useState } from 'react'
import { Tag } from 'lucide-react'
import { SelectKit, NumeroKit, CasillaKit } from './controlesKit'
import { CampoFecha, SelectorEntidad } from '@/components/kit'
import { CampoHora } from '@/components/kit/CampoHora'
import { supabase } from '@/lib/supabase/config'
import { getOrganizationId } from '@/lib/hooks/useOrganization'
import { partirFin, unirFin } from './finContador'
import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio'
import { useTimezoneFor } from '@/lib/context/OrganizationTimezoneContext'
import { conversionDesdeColumnas, type ConversionSitio, type ContadorConversion, type UbicacionContador } from '@/lib/website/conversion'

const control = 'h-8 w-full rounded-md border border-line bg-surface px-2 text-sm text-fg'
const UBICACIONES: UbicacionContador[] = ['topbar', 'carrito', 'checkout', 'producto', 'hero', 'seccion']
const NOMBRE_UBICACION: Record<UbicacionContador, string> = {
  topbar: 'Barra superior',
  carrito: 'Carrito',
  checkout: 'Pago',
  producto: 'Ficha de producto',
  hero: 'Portada',
  seccion: 'Sección',
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
  return (
    <section className="mt-4 flex flex-col gap-3 border-t border-line px-1 pt-3">
      <h3 className="text-sm font-semibold text-fg">Urgencia y contador</h3>
      <div className="rounded-lg px-3 py-2 text-center text-sm text-white" style={{ background: contador?.estilo.fondo || '#111827' }}>
        <span>{vista}</span>
        <span className="ml-2 font-mono font-bold">00:10:00</span>
        {contador?.textoDespues ? <span className="ml-2">{contador.textoDespues}</span> : null}
      </div>
      <CasillaKit titulo="Contador activo" disabled={deshabilitado} checked={!!contador?.activo} onChange={(e) => {
          if (!conversion) guardar({ ...vacio(), contadores: [{ ...vacio().contadores[0], activo: e.target.checked }] })
          else setContador({ activo: e.target.checked })
        }} />
      <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">Texto antes
        <input className={control} disabled={deshabilitado} value={contador?.textoAntes ?? ''} onChange={(e) => setContador({ textoAntes: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">Texto después
        <input className={control} disabled={deshabilitado} value={contador?.textoDespues ?? ''} onChange={(e) => setContador({ textoDespues: e.target.value })} />
      </label>
      <div role="group" aria-label="Modo" className="flex flex-col gap-1 text-[12px] text-fg-secondary">Modo
        <SelectKit className={control} disabled={deshabilitado} value={contador?.modo.tipo ?? 'diario'} onChange={(e) => {
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
        </SelectKit>
      </div>
      {contador?.modo.tipo === 'fecha' && (
        <FinContador fin={contador.modo.fin} zona={contador.modo.zona || timezone} deshabilitado={deshabilitado} onCambiar={(fin) => setContador({ modo: { tipo: 'fecha', fin, zona: contador.modo.tipo === 'fecha' && contador.modo.zona ? contador.modo.zona : timezone } })} />
      )}
      {contador?.modo.tipo === 'diario' && (
        <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">Hora de reinicio
          <NumeroKit min={0} max={23} disabled={deshabilitado} value={contador.modo.hora} onChange={(e) => setContador({ modo: { tipo: 'diario', hora: Number(e.target.value) || 0, zona: contador.modo.tipo === 'diario' ? contador.modo.zona : timezone } })} />
        </label>
      )}
      {contador?.modo.tipo === 'promocion' && (
        <SelectorPromocion promotionId={contador.modo.promotionId} deshabilitado={deshabilitado} onCambiar={(promotionId) => setContador({ modo: { tipo: 'promocion', promotionId } })} />
      )}
      {contador?.modo.tipo === 'evergreen' && (
        <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">Minutos por sesión
          <NumeroKit min={1} max={1440} disabled={deshabilitado} value={contador.modo.minutos} onChange={(e) => setContador({ modo: { tipo: 'evergreen', minutos: Number(e.target.value) || 15 } })} />
        </label>
      )}
      <fieldset className="flex flex-col gap-1 text-[12px] text-fg-secondary">
        <legend>Dónde se ve</legend>
        {UBICACIONES.map((u) => (
          <CasillaKit
            key={u}
            titulo={NOMBRE_UBICACION[u]}
            disabled={deshabilitado}
            checked={!!contador?.ubicaciones.includes(u)}
            onChange={(e) => {
              const actuales = new Set(contador?.ubicaciones ?? [])
              if (e.target.checked) actuales.add(u)
              else actuales.delete(u)
              setContador({ ubicaciones: [...actuales] })
            }}
          />
        ))}
      </fieldset>
      <div role="group" aria-label="Al terminar" className="flex flex-col gap-1 text-[12px] text-fg-secondary">Al terminar
        <SelectKit className={control} disabled={deshabilitado} value={contador?.alTerminar.tipo ?? 'ocultar'} onChange={(e) => setContador({ alTerminar: e.target.value === 'mensaje' ? { tipo: 'mensaje', texto: 'La oferta terminó' } : { tipo: 'ocultar' } })}>
          <option value="ocultar">Ocultar</option>
          <option value="mensaje">Mensaje</option>
        </SelectKit>
      </div>
      <CasillaKit titulo="Aviso de stock bajo" disabled={deshabilitado} checked={!!conversion?.urgencia.stockBajo.activo} onChange={(e) => {
          const base = conversion ?? vacio()
          guardar({ ...base, urgencia: { ...base.urgencia, stockBajo: { ...base.urgencia.stockBajo, activo: e.target.checked, ubicaciones: e.target.checked ? ['checkout'] : [] } } })
        }} />
      <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">Umbral
        <NumeroKit min={1} max={999} disabled={deshabilitado || !conversion} value={conversion?.urgencia.stockBajo.umbral ?? 5} onChange={(e) => conversion && guardar({ ...conversion, urgencia: { ...conversion.urgencia, stockBajo: { ...conversion.urgencia.stockBajo, umbral: Number(e.target.value) || 5 } } })} />
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">Plantilla ({'{n}'})
        <input className={control} disabled={deshabilitado || !conversion} value={conversion?.urgencia.stockBajo.plantilla ?? 'Quedan {n}'} onChange={(e) => conversion && guardar({ ...conversion, urgencia: { ...conversion.urgencia, stockBajo: { ...conversion.urgencia.stockBajo, plantilla: e.target.value } } })} />
      </label>
      <CasillaKit titulo="Reserva en carrito" disabled checked={false} onChange={() => undefined} />
      <p className="text-[12px] text-fg-secondary">La reserva y «personas viendo» siguen apagadas: no hay una métrica real y no se inventan números.</p>
    </section>
  )
}

function FinContador({ fin, zona, deshabilitado, onCambiar }: { fin: string; zona: string; deshabilitado?: boolean; onCambiar: (fin: string) => void }) {
  const { dia, hora, seg } = partirFin(fin, zona)
  return (
    <div role="group" aria-label="Fin" className="flex flex-col gap-1 text-[12px] text-fg-secondary">Fin ({zona})
      <div className="grid grid-cols-2 gap-2">
        <CampoFecha tamano="sm" valor={dia || null} disabled={deshabilitado} onValorChange={(d) => onCambiar(unirFin(d, hora, zona, seg))} />
        <CampoHora tamano="sm" valor={hora || null} disabled={deshabilitado || !dia} onValorChange={(h) => onCambiar(unirFin(dia, h, zona, seg))} />
      </div>
    </div>
  )
}

type Promocion = { id: string; name: string | null; end_date: string | null; is_active: boolean | null; applies_to_web: boolean | null }
const SIN_PROMOCION = '00000000-0000-4000-8000-000000000000'

function SelectorPromocion({ promotionId, deshabilitado, onCambiar }: { promotionId: string; deshabilitado?: boolean; onCambiar: (id: string) => void }) {
  const buscar = useCallback(async (texto: string, senal: AbortSignal) => {
    let q = supabase
      .from('promotions')
      .select('id, name, end_date, is_active, applies_to_web')
      .eq('organization_id', getOrganizationId())
      .order('name')
      .limit(20)
      .abortSignal(senal)
    const limpio = texto.trim().replace(/[%,()]/g, '')
    if (limpio) q = q.ilike('name', `%${limpio}%`)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as Promocion[]
  }, [])
  const elegida = !!promotionId && promotionId !== SIN_PROMOCION
  const [actual, setActual] = useState<Promocion | null>(null)
  useEffect(() => {
    if (!elegida || actual?.id === promotionId) return
    let vivo = true
    supabase.from('promotions').select('id, name, end_date, is_active, applies_to_web').eq('organization_id', getOrganizationId()).eq('id', promotionId).maybeSingle()
      .then(({ data }) => { if (vivo && data) setActual(data as Promocion) })
    return () => { vivo = false }
  }, [elegida, promotionId, actual?.id])
  const valor: Promocion | null = !elegida ? null : actual?.id === promotionId ? actual : { id: promotionId, name: null, end_date: null, is_active: null, applies_to_web: null }
  return (
    <SelectorEntidad<Promocion>
      layout="campo"
      etiqueta="Promoción"
      icono={Tag}
      valor={valor}
      deshabilitado={deshabilitado}
      aOpcion={(p) => ({
        id: p.id,
        titulo: p.name ?? p.id,
        subtitulo: p.is_active === null ? undefined : [p.end_date ? `Termina ${p.end_date}` : 'Sin fecha fin', p.is_active && p.applies_to_web ? null : 'No activa en la web'].filter(Boolean).join(' · '),
      })}
      buscar={buscar}
      onCambiar={(p) => { setActual(p); onCambiar(p.id) }}
      textos={{ placeholder: 'Elegir promoción', buscar: 'Buscar promoción', titulo: 'Promoción', vacio: 'Sin promociones', sinResultados: 'Ninguna promoción con ese nombre' }}
    />
  )
}
