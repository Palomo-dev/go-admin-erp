"use client"

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/config'
import { useOrganization } from '@/lib/hooks/useOrganization'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Card } from '@/components/ui/card'
import { GitBranch, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'

interface VariantesProps {
  formData: any
  updateFormData: (field: string, value: any) => void
}

interface Branch {
  id: number
  name: string
}

export default function Variantes({ formData, updateFormData }: VariantesProps) {
  const { organization } = useOrganization()
  const [attributeTypes, setAttributeTypes] = useState<string[]>(['Color', 'Talla'])
  const [branches, setBranches] = useState<Branch[]>([])
  const [expandedVariants, setExpandedVariants] = useState<number[]>([])

  useEffect(() => {
    if (organization?.id) {
      loadBranches()
    }
  }, [organization?.id])

  const loadBranches = async () => {
    if (!organization?.id) return

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
    }
  }

  const toggleVariants = (enabled: boolean) => {
    updateFormData('has_variants', enabled)
    if (!enabled) {
      updateFormData('variants', [])
    }
  }

  const addVariant = () => {
    const newVariant = {
      sku: `${formData.sku}-VAR${formData.variants.length + 1}`,
      name: `${formData.name} - Variante ${formData.variants.length + 1}`,
      price: formData.price,
      cost: formData.cost,
      attributes: {},
      stock: branches.map(branch => ({
        branch_id: branch.id,
        branch_name: branch.name,
        qty_on_hand: 0
      }))
    }
    updateFormData('variants', [...formData.variants, newVariant])
    setExpandedVariants([...expandedVariants, formData.variants.length])
  }

  const removeVariant = (index: number) => {
    const newVariants = formData.variants.filter((_: any, i: number) => i !== index)
    updateFormData('variants', newVariants)
    setExpandedVariants(expandedVariants.filter(i => i !== index))
  }

  const updateVariant = (index: number, field: string, value: any) => {
    const newVariants = [...formData.variants]
    newVariants[index] = { ...newVariants[index], [field]: value }
    updateFormData('variants', newVariants)
  }

  const updateVariantAttribute = (variantIndex: number, attrName: string, value: string) => {
    const newVariants = [...formData.variants]
    newVariants[variantIndex].attributes = {
      ...newVariants[variantIndex].attributes,
      [attrName]: value
    }
    updateFormData('variants', newVariants)
  }

  const updateVariantStock = (variantIndex: number, branchIndex: number, qty: number) => {
    const newVariants = [...formData.variants]
    newVariants[variantIndex].stock[branchIndex].qty_on_hand = qty
    updateFormData('variants', newVariants)
  }

  const toggleExpandVariant = (index: number) => {
    if (expandedVariants.includes(index)) {
      setExpandedVariants(expandedVariants.filter(i => i !== index))
    } else {
      setExpandedVariants([...expandedVariants, index])
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/20 rounded-lg">
            <GitBranch className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Variantes del Producto
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Tallas, colores u otras variaciones
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Label htmlFor="has_variants" className="text-gray-700 dark:text-gray-300">
            Tiene variantes
          </Label>
          <Switch
            id="has_variants"
            checked={formData.has_variants}
            onCheckedChange={toggleVariants}
          />
        </div>
      </div>

      {!formData.has_variants ? (
        <div className="text-center py-8 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <GitBranch className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Este producto no tiene variantes
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Activa el switch para crear variantes como tallas, colores, etc.
          </p>
        </div>
      ) : (
        <>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={addVariant}
              disabled={branches.length === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Agregar Variante
            </Button>
          </div>

          {formData.variants.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                No hay variantes configuradas
              </p>
              <Button
                type="button"
                onClick={addVariant}
                disabled={branches.length === 0}
                variant="outline"
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                Crear Primera Variante
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {formData.variants.map((variant: any, index: number) => {
                const isExpanded = expandedVariants.includes(index)
                return (
                  <Card key={index} className="p-4 border-gray-200 dark:border-gray-700">
                    {/* Header de la variante */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleExpandVariant(index)}
                          className="h-8 w-8"
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                        <div>
                          <h4 className="font-medium text-gray-900 dark:text-white">
                            Variante {index + 1}: {variant.name || 'Sin nombre'}
                          </h4>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            SKU: {variant.sku}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeVariant(index)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {isExpanded && (
                      <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        {/* Información básica */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-gray-700 dark:text-gray-300">
                              SKU de Variante <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              value={variant.sku}
                              onChange={(e) => updateVariant(index, 'sku', e.target.value)}
                              className="border-gray-300 dark:border-gray-700 dark:bg-gray-800"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label className="text-gray-700 dark:text-gray-300">
                              Nombre de Variante <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              value={variant.name}
                              onChange={(e) => updateVariant(index, 'name', e.target.value)}
                              className="border-gray-300 dark:border-gray-700 dark:bg-gray-800"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label className="text-gray-700 dark:text-gray-300">
                              Precio
                            </Label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                                $
                              </span>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={variant.price}
                                onChange={(e) => updateVariant(index, 'price', parseFloat(e.target.value) || 0)}
                                className="pl-7 border-gray-300 dark:border-gray-700 dark:bg-gray-800"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-gray-700 dark:text-gray-300">
                              Costo
                            </Label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                                $
                              </span>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={variant.cost}
                                onChange={(e) => updateVariant(index, 'cost', parseFloat(e.target.value) || 0)}
                                className="pl-7 border-gray-300 dark:border-gray-700 dark:bg-gray-800"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Atributos */}
                        <div className="space-y-2">
                          <Label className="text-gray-700 dark:text-gray-300">
                            Atributos de la Variante
                          </Label>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {attributeTypes.map((attrType) => (
                              <div key={attrType} className="space-y-2">
                                <Label className="text-sm text-gray-600 dark:text-gray-400">
                                  {attrType}
                                </Label>
                                <Input
                                  value={variant.attributes[attrType] || ''}
                                  onChange={(e) => updateVariantAttribute(index, attrType, e.target.value)}
                                  placeholder={`Ej: ${attrType === 'Color' ? 'Azul' : 'M'}`}
                                  className="border-gray-300 dark:border-gray-700 dark:bg-gray-800"
                                />
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Stock por sucursal */}
                        <div className="space-y-2">
                          <Label className="text-gray-700 dark:text-gray-300">
                            Stock por Sucursal
                          </Label>
                          {branches.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              No hay sucursales disponibles
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {variant.stock.map((stockItem: any, branchIndex: number) => (
                                <div
                                  key={branchIndex}
                                  className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700"
                                >
                                  <div className="flex-1">
                                    <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                      {stockItem.branch_name}
                                    </Label>
                                  </div>
                                  <div className="w-24">
                                    <Input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={stockItem.qty_on_hand}
                                      onChange={(e) => updateVariantStock(index, branchIndex, parseFloat(e.target.value) || 0)}
                                      className="text-center border-gray-300 dark:border-gray-700 dark:bg-gray-800"
                                      placeholder="0"
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Información adicional */}
      <div className="mt-4 p-4 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800 rounded-lg">
        <p className="text-sm text-indigo-800 dark:text-indigo-300">
          <strong>Nota:</strong> Las variantes se crearán como productos independientes vinculados al producto principal. 
          Cada variante puede tener su propio precio, costo y stock por sucursal. El stock se gestionará de forma independiente para cada variante en cada sucursal.
        </p>
      </div>
    </div>
  )
}
