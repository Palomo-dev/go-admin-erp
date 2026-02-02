"use client"

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/config'
import { useOrganization } from '@/lib/hooks/useOrganization'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Warehouse, Plus, Trash2, Loader2 } from 'lucide-react'

interface InventarioProps {
  formData: any
  updateFormData: (field: string, value: any) => void
  hasVariants?: boolean
}

interface Branch {
  id: number
  name: string
}

export default function Inventario({ formData, updateFormData, hasVariants = false }: InventarioProps) {
  const { organization } = useOrganization()
  const [branches, setBranches] = useState<Branch[]>([])
  const [isLoadingBranches, setIsLoadingBranches] = useState(true)

  useEffect(() => {
    if (organization?.id) {
      loadBranches()
    }
  }, [organization?.id])

  const loadBranches = async () => {
    if (!organization?.id) return

    setIsLoadingBranches(true)
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .eq('organization_id', organization.id)
        .eq('is_active', true)
        .order('name')

      if (error) throw error
      if (data) setBranches(data)
    } catch (error) {
      console.error('Error cargando sucursales:', error)
    } finally {
      setIsLoadingBranches(false)
    }
  }

  const addStockEntry = () => {
    const newStock = {
      branch_id: branches[0]?.id || 0,
      qty_on_hand: 0,
      min_level: 0,
      avg_cost: formData.cost || 0
    }
    updateFormData('stock_inicial', [...formData.stock_inicial, newStock])
  }

  const removeStockEntry = (index: number) => {
    const newStock = formData.stock_inicial.filter((_: any, i: number) => i !== index)
    updateFormData('stock_inicial', newStock)
  }

  const updateStockEntry = (index: number, field: string, value: any) => {
    const newStock = [...formData.stock_inicial]
    newStock[index] = { ...newStock[index], [field]: value }
    updateFormData('stock_inicial', newStock)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
            <Warehouse className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Inventario Inicial
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Stock inicial por sucursal
            </p>
          </div>
        </div>
        <Button
          type="button"
          onClick={addStockEntry}
          disabled={isLoadingBranches || branches.length === 0}
          className="bg-blue-600 hover:bg-blue-700 text-white"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          Agregar Sucursal
        </Button>
      </div>

      {/* Mensaje cuando hay variantes */}
      {hasVariants && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="p-1.5 bg-amber-100 dark:bg-amber-900/20 rounded">
              <Warehouse className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-amber-900 dark:text-amber-200 mb-1">
                Producto con Variantes
              </h4>
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Este producto tiene variantes activas. El stock se gestiona <strong>individualmente para cada variante</strong> en la sección de Variantes.
                El producto padre no tiene stock propio, el stock total será la suma de todas las variantes.
              </p>
            </div>
          </div>
        </div>
      )}

      {isLoadingBranches ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : hasVariants ? (
        <div className="text-center py-8 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <Warehouse className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500 dark:text-gray-400 mb-2 font-medium">
            Stock gestionado por variantes
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            El inventario de este producto se gestiona en cada variante individual.
            Ve a la sección "Variantes del Producto" para configurar el stock.
          </p>
        </div>
      ) : branches.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400">
            No hay sucursales disponibles. Crea una sucursal primero.
          </p>
        </div>
      ) : formData.stock_inicial.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            No hay stock inicial configurado
          </p>
          <Button
            type="button"
            onClick={addStockEntry}
            variant="outline"
            size="sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            Agregar Stock Inicial
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {formData.stock_inicial.map((stock: any, index: number) => (
            <div
              key={index}
              className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
            >
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Sucursal */}
                <div className="space-y-2">
                  <Label className="text-gray-700 dark:text-gray-300">
                    Sucursal <span className="text-red-500">*</span>
                  </Label>
                  <select
                    value={stock.branch_id}
                    onChange={(e) => updateStockEntry(index, 'branch_id', parseInt(e.target.value))}
                    className="w-full h-10 px-3 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Cantidad Inicial */}
                <div className="space-y-2">
                  <Label className="text-gray-700 dark:text-gray-300">
                    Cantidad Inicial
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={stock.qty_on_hand}
                    onChange={(e) => updateStockEntry(index, 'qty_on_hand', parseFloat(e.target.value) || 0)}
                    className="border-gray-300 dark:border-gray-700 dark:bg-gray-800"
                  />
                </div>

                {/* Stock Mínimo */}
                <div className="space-y-2">
                  <Label className="text-gray-700 dark:text-gray-300">
                    Stock Mínimo
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={stock.min_level}
                    onChange={(e) => updateStockEntry(index, 'min_level', parseFloat(e.target.value) || 0)}
                    className="border-gray-300 dark:border-gray-700 dark:bg-gray-800"
                  />
                </div>

                {/* Costo Promedio */}
                <div className="space-y-2">
                  <Label className="text-gray-700 dark:text-gray-300">
                    Costo Promedio
                  </Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                        $
                      </span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={stock.avg_cost}
                        onChange={(e) => updateStockEntry(index, 'avg_cost', parseFloat(e.target.value) || 0)}
                        className="pl-7 border-gray-300 dark:border-gray-700 dark:bg-gray-800"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeStockEntry(index)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Información adicional */}
      <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800 rounded-lg">
        <p className="text-sm text-purple-800 dark:text-purple-300">
          <strong>Nota:</strong> El stock inicial se registrará como un movimiento de entrada tipo "ajuste". 
          El costo promedio se utilizará para calcular el valor del inventario.
        </p>
      </div>
    </div>
  )
}
