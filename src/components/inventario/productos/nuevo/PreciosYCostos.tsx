"use client"

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { DollarSign } from 'lucide-react'
import { formatCurrency } from '@/utils/Utils'

interface PreciosYCostosProps {
  formData: any
  updateFormData: (field: string, value: any) => void
}

export default function PreciosYCostos({ formData, updateFormData }: PreciosYCostosProps) {
  const handleNumberChange = (field: string, value: string) => {
    const numValue = parseFloat(value) || 0
    updateFormData(field, numValue)
  }

  const margen = formData.price > 0 && formData.cost > 0
    ? ((formData.price - formData.cost) / formData.price * 100).toFixed(2)
    : '0.00'

  const handleMargenChange = (value: string) => {
    const margenValue = parseFloat(value) || 0
    if (formData.price > 0 && margenValue >= 0 && margenValue < 100) {
      const calculatedCost = formData.price * (1 - margenValue / 100)
      updateFormData('cost', parseFloat(calculatedCost.toFixed(2)))
    }
  }

  return (
    <div className="space-y-6 max-w-full overflow-hidden">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
          <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Precios y Costos
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Información financiera del producto
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6 max-w-full">
        {/* Precio de Venta */}
        <div className="space-y-2">
          <Label htmlFor="price" className="text-gray-700 dark:text-gray-300">
            Precio de Venta <span className="text-red-500">*</span>
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
              $
            </span>
            <Input
              id="price"
              type="number"
              min="0"
              step="0.01"
              value={formData.price}
              onChange={(e) => handleNumberChange('price', e.target.value)}
              className="pl-7 border-gray-300 dark:border-gray-700 dark:bg-gray-800"
              required
            />
          </div>
          {formData.price > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {formatCurrency(formData.price)}
            </p>
          )}
        </div>

        {/* Precio de Comparación */}
        <div className="space-y-2">
          <Label htmlFor="compare_price" className="text-gray-700 dark:text-gray-300">
            Precio de Comparación
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
              $
            </span>
            <Input
              id="compare_price"
              type="number"
              min="0"
              step="0.01"
              value={formData.compare_price || ''}
              onChange={(e) => handleNumberChange('compare_price', e.target.value)}
              className="pl-7 border-gray-300 dark:border-gray-700 dark:bg-gray-800"
              placeholder="Precio anterior"
            />
          </div>
          {formData.compare_price > 0 && formData.price > 0 && formData.compare_price > formData.price && (
            <p className="text-xs text-red-500 dark:text-red-400 font-medium">
              -{Math.round((1 - formData.price / formData.compare_price) * 100)}% descuento
            </p>
          )}
        </div>

        {/* Costo de Adquisición */}
        <div className="space-y-2">
          <Label htmlFor="cost" className="text-gray-700 dark:text-gray-300">
            Costo de Adquisición
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
              $
            </span>
            <Input
              id="cost"
              type="number"
              min="0"
              step="0.01"
              value={formData.cost}
              onChange={(e) => handleNumberChange('cost', e.target.value)}
              className="pl-7 border-gray-300 dark:border-gray-700 dark:bg-gray-800"
            />
          </div>
          {formData.cost > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {formatCurrency(formData.cost)}
            </p>
          )}
        </div>

        {/* Margen de Ganancia */}
        <div className="space-y-2">
          <Label htmlFor="margen" className="text-gray-700 dark:text-gray-300">
            Margen de Ganancia
          </Label>
          <div className="relative">
            <Input
              id="margen"
              type="number"
              min="0"
              max="99.99"
              step="0.01"
              value={formData.price > 0 && formData.cost > 0 ? parseFloat(margen).toFixed(2) : ''}
              onChange={(e) => handleMargenChange(e.target.value)}
              className="pr-8 border-gray-300 dark:border-gray-700 dark:bg-gray-800"
              placeholder="0.00"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
              %
            </span>
          </div>
          {formData.price > 0 && formData.cost > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Utilidad: {formatCurrency(formData.price - formData.cost)}
            </p>
          )}
        </div>
      </div>

      {/* Información adicional */}
      <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-800 dark:text-blue-300">
          <strong>Nota:</strong> El precio de venta y costo se guardarán en el historial de precios. 
          Podrás modificarlos posteriormente y mantener un registro de cambios.
        </p>
      </div>
    </div>
  )
}
