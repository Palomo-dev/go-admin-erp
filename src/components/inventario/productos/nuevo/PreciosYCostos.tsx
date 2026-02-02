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

  return (
    <div className="space-y-6">
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
          <Label className="text-gray-700 dark:text-gray-300">
            Margen de Ganancia
          </Label>
          <div className="h-10 flex items-center px-3 border border-gray-300 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800/50">
            <span className={`font-semibold ${
              parseFloat(margen) > 0 
                ? 'text-green-600 dark:text-green-400' 
                : 'text-gray-500 dark:text-gray-400'
            }`}>
              {margen}%
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
