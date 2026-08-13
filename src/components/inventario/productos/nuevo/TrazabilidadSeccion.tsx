'use client'

import { useMemo, useState } from 'react'
import { Barcode, ShieldCheck, Sparkles, Eye, X } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface TrazabilidadSeccionProps {
  formData: any
  updateFormData: (field: string, value: any) => void
}

export default function TrazabilidadSeccion({ formData, updateFormData }: TrazabilidadSeccionProps) {
  const trackSerial = formData.track_serial ?? false
  const autoGenerate = formData.auto_generate_serial ?? false
  const serialPattern = formData.serial_pattern ?? ''
  const warrantyMonths = formData.warranty_months ?? ''
  const [literalText, setLiteralText] = useState('')

  const VARIABLES = [
    { token: '{SEQ}', desc: 'Consecutivo' },
    { token: '{YYYY}', desc: 'Año (4 dígitos)' },
    { token: '{YY}', desc: 'Año (2 dígitos)' },
    { token: '{MM}', desc: 'Mes' },
    { token: '{DD}', desc: 'Día' },
  ]

  const tokens = useMemo(() => {
    if (!serialPattern) return []
    const regex = /(\{[A-Z]+\})/g
    return serialPattern.split(regex).filter(p => p !== '')
  }, [serialPattern])

  const addToken = (token: string) => {
    updateFormData('serial_pattern', (serialPattern || '') + token)
  }

  const addLiteral = () => {
    if (!literalText.trim()) return
    updateFormData('serial_pattern', (serialPattern || '') + literalText)
    setLiteralText('')
  }

  const removeTokenAt = (index: number) => {
    const regex = /(\{[A-Z]+\})/g
    const parts = (serialPattern || '').split(regex).filter(p => p !== '')
    parts.splice(index, 1)
    updateFormData('serial_pattern', parts.join('') || null)
  }

  const preview = useMemo(() => {
    if (!serialPattern) return 'Ej: SN-000001'
    const now = new Date()
    const yy = String(now.getFullYear()).slice(2)
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    return serialPattern
      .replace('{SEQ}', '000001')
      .replace('{YYYY}', String(now.getFullYear()))
      .replace('{YY}', yy)
      .replace('{MM}', mm)
      .replace('{DD}', dd)
  }, [serialPattern])

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <Barcode className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Trazabilidad de Seriales
        </h3>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 -mt-3">
        Configura el seguimiento de números de serie para este producto.
      </p>

      {/* Checkbox track_serial */}
      <div className="flex items-start space-x-3 pt-2">
        <Checkbox
          id="track_serial"
          checked={trackSerial}
          onCheckedChange={(checked) => updateFormData('track_serial', checked === true)}
        />
        <div className="space-y-1">
          <Label htmlFor="track_serial" className="text-sm font-medium cursor-pointer">
            Requiere número de serial
          </Label>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Al activar, cada unidad de este producto deberá tener un número de serie único.
          </p>
        </div>
      </div>

      {/* Campos condicionales */}
      {trackSerial && (
        <div className="space-y-4 pl-6 border-l-2 border-blue-100 dark:border-blue-900/50 ml-3">
          {/* Meses de garantía */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="warranty_months" className="text-sm font-medium flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
                Meses de garantía
              </Label>
              <Input
                id="warranty_months"
                type="number"
                min={0}
                placeholder="Ej: 12"
                value={warrantyMonths}
                onChange={(e) => {
                  const val = e.target.value
                  updateFormData('warranty_months', val === '' ? null : parseInt(val, 10))
                }}
                className="max-w-[180px]"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Duración de la garantía en meses desde la compra.
              </p>
            </div>
          </div>

          {/* Auto-generar seriales */}
          <div className="flex items-start space-x-3 pt-1">
            <Checkbox
              id="auto_generate_serial"
              checked={autoGenerate}
              onCheckedChange={(checked) => updateFormData('auto_generate_serial', checked === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="auto_generate_serial" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Auto-generar seriales
              </Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Genera números de serie automáticamente al recibir stock según el patrón definido.
              </p>
            </div>
          </div>

          {/* Patrón de serial con badges clicables */}
          {autoGenerate && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                Patrón de serial
              </Label>

              {/* Área de badges */}
              <div className="flex flex-wrap items-center gap-1.5 min-h-[42px] p-2 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800/50">
                {tokens.length === 0 ? (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    Haz clic en las variables o escribe texto para construir el patrón...
                  </span>
                ) : (
                  tokens.map((token, index) => {
                    const isVariable = /^\{[A-Z]+\}$/.test(token)
                    return (
                      <Badge
                        key={index}
                        variant="secondary"
                        className={`gap-1 py-1 px-2 ${isVariable
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                          : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}
                      >
                        <span className="font-mono text-xs">{token}</span>
                        <button
                          type="button"
                          onClick={() => removeTokenAt(index)}
                          className="ml-0.5 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    )
                  })
                )}
              </div>

              {/* Input para texto fijo */}
              <div className="flex gap-2">
                <Input
                  placeholder="Texto fijo (ej: -, SN, _)"
                  value={literalText}
                  onChange={(e) => setLiteralText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addLiteral()
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addLiteral}
                  disabled={!literalText.trim()}
                >
                  Agregar
                </Button>
              </div>

              {/* Botones de variables clicables */}
              <div className="flex flex-wrap gap-2">
                {VARIABLES.map((v) => (
                  <Button
                    key={v.token}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addToken(v.token)}
                    title={`Agregar ${v.desc}`}
                    className="gap-1.5 h-8"
                  >
                    <code className="text-blue-600 dark:text-blue-400 text-xs">{v.token}</code>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{v.desc}</span>
                  </Button>
                ))}
              </div>

              {/* Vista previa */}
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <Eye className="h-3.5 w-3.5" />
                <span>Vista previa: </span>
                <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-blue-600 dark:text-blue-400 font-mono">
                  {preview}
                </code>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
