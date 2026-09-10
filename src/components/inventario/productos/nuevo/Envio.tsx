"use client"

import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Truck, ChevronDown } from 'lucide-react'

/** Sólo los campos que esta sección lee. El formulario pasa un objeto mayor y eso está bien. */
interface EnvioFormData {
  product_type?: string
  weight_kg?: number | null
  length_cm?: number | null
  width_cm?: number | null
  height_cm?: number | null
}

type CampoEnvio = 'weight_kg' | 'length_cm' | 'width_cm' | 'height_cm'

interface EnvioProps {
  formData: EnvioFormData
  updateFormData: (field: CampoEnvio, value: number | null) => void
}

/**
 * Peso y dimensiones del producto.
 *
 * Se captura aquí porque el precio de una guía de transportadora depende del peso
 * real y del volumétrico. Hoy el POS cotiza con 1 kg fijo para todo, así que un
 * producto sin estos datos se seguirá cotizando mal hasta que se rellenen.
 *
 * Colapsable y cerrada por defecto: la inmensa mayoría de los productos existentes
 * no la tienen rellena y no queremos alargar un formulario que ya es largo.
 */
export default function Envio({ formData, updateFormData }: EnvioProps) {
  const [isOpen, setIsOpen] = useState(false)

  const esServicio = formData.product_type === 'service'

  // Un número o null; nunca NaN, que rompería el insert.
  const parseNumero = (valor: string): number | null => {
    if (valor.trim() === '') return null
    const n = Number(valor)
    return Number.isFinite(n) && n >= 0 ? n : null
  }

  const { weight_kg, length_cm, width_cm, height_cm } = formData
  const tieneLasTres =
    typeof length_cm === 'number' && typeof width_cm === 'number' && typeof height_cm === 'number'
  const volumenCm3 = tieneLasTres ? length_cm * width_cm * height_cm : null

  const campos: Array<{
    id: CampoEnvio
    label: string
    unidad: string
    placeholder: string
    valor: number | null | undefined
  }> = [
    { id: 'weight_kg', label: 'Peso', unidad: 'kg', placeholder: '0.5', valor: weight_kg },
    { id: 'length_cm', label: 'Largo', unidad: 'cm', placeholder: '30', valor: length_cm },
    { id: 'width_cm', label: 'Ancho', unidad: 'cm', placeholder: '20', valor: width_cm },
    { id: 'height_cm', label: 'Alto', unidad: 'cm', placeholder: '15', valor: height_cm },
  ]

  if (esServicio) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Truck className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Los servicios no se envían, así que no llevan peso ni dimensiones.</span>
      </div>
    )
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-left">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Envío
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Peso y dimensiones, opcionales
            </p>
          </div>
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="pt-4">
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Las transportadoras cobran por el mayor entre el peso real y el volumétrico. Sin
          estos datos, la cotización de envío usa un valor por defecto y el precio que se le
          muestra al cliente puede no cubrir el costo real de la guía.
        </p>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {campos.map(({ id, label, unidad, placeholder, valor }) => (
            <div key={id}>
              <Label htmlFor={id}>
                {label} <span className="text-gray-400">({unidad})</span>
              </Label>
              <Input
                id={id}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder={placeholder}
                value={valor ?? ''}
                onChange={(e) => updateFormData(id, parseNumero(e.target.value))}
                className="mt-1"
              />
            </div>
          ))}
        </div>

        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
          {volumenCm3 !== null ? (
            <>
              Volumen: <span className="font-medium">{volumenCm3.toLocaleString('es-CO')} cm³</span>.
              Cada transportadora aplica su propio factor volumétrico, configurable en la
              tarifa de envío.
            </>
          ) : (
            'Completa largo, ancho y alto para ver el volumen del paquete.'
          )}
        </p>
      </CollapsibleContent>
    </Collapsible>
  )
}
