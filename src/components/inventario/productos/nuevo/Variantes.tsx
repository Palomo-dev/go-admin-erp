"use client"

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/config'
import { useOrganization } from '@/lib/hooks/useOrganization'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GitBranch, Plus, Trash2, ChevronDown, ChevronUp, X, Tags } from 'lucide-react'

interface VariantesProps {
  formData: any
  updateFormData: (field: string, value: any) => void
}

interface Branch {
  id: number
  name: string
}

interface VariantTypeOption {
  id: number
  name: string
}

interface VariantValueOption {
  id: number
  variant_type_id: number
  value: string
}

export default function Variantes({ formData, updateFormData }: VariantesProps) {
  const { organization } = useOrganization()
  const [selectedAttributeTypes, setSelectedAttributeTypes] = useState<string[]>([])
  const [availableTypes, setAvailableTypes] = useState<VariantTypeOption[]>([])
  const [availableValues, setAvailableValues] = useState<VariantValueOption[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [expandedVariants, setExpandedVariants] = useState<number[]>([])
  const [customAttrName, setCustomAttrName] = useState('')

  useEffect(() => {
    if (organization?.id) {
      loadBranches()
      loadVariantTypesAndValues()
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

  const loadVariantTypesAndValues = async () => {
    if (!organization?.id) return
    try {
      // Leer tipos del catálogo (variant_types)
      const { data: catalogTypes } = await supabase
        .from('variant_types')
        .select('id, name')
        .eq('organization_id', organization.id)
        .order('name')

      // Leer tipos y valores reales desde variant_data de productos existentes
      const { data: products } = await supabase
        .from('products')
        .select('variant_data')
        .eq('organization_id', organization.id)
        .not('variant_data', 'is', null)
        .not('parent_product_id', 'is', null)

      // Combinar tipos: catálogo + tipos reales de variant_data
      const typeNamesSet = new Set<string>()
      const realValues: VariantValueOption[] = []
      let syntheticId = 1000

      ;(catalogTypes || []).forEach(t => typeNamesSet.add(t.name))
      ;(products || []).forEach(p => {
        if (p.variant_data && typeof p.variant_data === 'object') {
          Object.entries(p.variant_data).forEach(([key, val]) => {
            if (key.trim()) typeNamesSet.add(key.trim())
          })
        }
      })

      // Generar lista de tipos combinada
      const combinedTypes: VariantTypeOption[] = Array.from(typeNamesSet)
        .sort()
        .map((name, idx) => {
          const catalogEntry = (catalogTypes || []).find(t => t.name === name)
          return { id: catalogEntry?.id || (syntheticId + idx), name }
        })
      setAvailableTypes(combinedTypes)

      // Generar valores reales desde variant_data
      const valuesByType: Record<string, Set<string>> = {}
      ;(products || []).forEach(p => {
        if (p.variant_data && typeof p.variant_data === 'object') {
          Object.entries(p.variant_data).forEach(([key, val]) => {
            if (!key.trim() || !val || !String(val).trim()) return
            if (!valuesByType[key.trim()]) valuesByType[key.trim()] = new Set()
            valuesByType[key.trim()].add(String(val).trim())
          })
        }
      })

      // Convertir a VariantValueOption[]
      const allValues: VariantValueOption[] = []
      combinedTypes.forEach(type => {
        const vals = valuesByType[type.name]
        if (vals) {
          vals.forEach(v => {
            allValues.push({ id: syntheticId++, variant_type_id: type.id, value: v })
          })
        }
      })

      // También agregar valores del catálogo (variant_values)
      if (catalogTypes && catalogTypes.length > 0) {
        const { data: catalogValues } = await supabase
          .from('variant_values')
          .select('id, variant_type_id, value')
          .in('variant_type_id', catalogTypes.map(t => t.id))
          .order('display_order')
        if (catalogValues) {
          catalogValues.forEach(cv => {
            // Evitar duplicados
            const exists = allValues.some(av => av.variant_type_id === cv.variant_type_id && av.value === cv.value)
            if (!exists) allValues.push(cv)
          })
        }
      }

      setAvailableValues(allValues)
    } catch (error) {
      console.error('Error cargando tipos de variantes:', error)
    }
  }

  const addAttributeType = (typeName: string) => {
    if (!typeName.trim() || selectedAttributeTypes.includes(typeName)) return
    setSelectedAttributeTypes([...selectedAttributeTypes, typeName])
  }

  // Crea (o reutiliza) un tipo de variante en el catálogo y devuelve su id
  const createTypeInCatalog = async (name: string): Promise<number | null> => {
    if (!organization?.id) return null
    const clean = name.trim()
    if (!clean) return null
    const { data: existing } = await supabase
      .from('variant_types')
      .select('id')
      .eq('organization_id', organization.id)
      .ilike('name', clean)
      .maybeSingle()
    if (existing) return existing.id
    const { data: created } = await supabase
      .from('variant_types')
      .insert({ organization_id: organization.id, name: clean })
      .select('id')
      .single()
    return created?.id || null
  }

  // Agrega un atributo personalizado y lo guarda en el catálogo para reutilizarlo
  const addCustomAttributeType = async (typeName: string) => {
    const clean = typeName.trim()
    if (!clean) return
    addAttributeType(clean)
    await createTypeInCatalog(clean)
    await loadVariantTypesAndValues()
  }

  // Guarda un valor de variante en el catálogo (variant_values) para reutilizarlo
  const createValueInCatalog = async (typeName: string, value: string) => {
    const clean = value.trim()
    if (!clean) return
    const typeId = await createTypeInCatalog(typeName)
    if (!typeId) return
    const { data: existing } = await supabase
      .from('variant_values')
      .select('id')
      .eq('variant_type_id', typeId)
      .ilike('value', clean)
      .maybeSingle()
    if (!existing) {
      await supabase
        .from('variant_values')
        .insert({ variant_type_id: typeId, value: clean, display_order: 0 })
    }
    await loadVariantTypesAndValues()
  }

  const removeAttributeType = (typeName: string) => {
    setSelectedAttributeTypes(selectedAttributeTypes.filter(t => t !== typeName))
    // Limpiar el atributo de las variantes existentes
    const updatedVariants = formData.variants.map((v: any) => {
      const newAttrs = { ...v.attributes }
      delete newAttrs[typeName]
      return { ...v, attributes: newAttrs }
    })
    updateFormData('variants', updatedVariants)
  }

  const getValuesForType = (typeName: string): string[] => {
    const type = availableTypes.find(t => t.name === typeName)
    if (!type) return []
    return availableValues
      .filter(v => v.variant_type_id === type.id)
      .map(v => v.value)
  }

  const toggleVariants = (enabled: boolean) => {
    updateFormData('has_variants', enabled)
    if (!enabled) {
      updateFormData('variants', [])
    }
  }

  const addVariant = () => {
    const varNum = formData.variants.length + 1
    const suffix = Date.now().toString(36).slice(-2).toUpperCase()
    const newVariant = {
      sku: `${formData.sku}-V${varNum}${suffix}`,
      barcode: '',
      name: `${formData.name} - Variante ${varNum}`,
      price: formData.price,
      cost: formData.cost,
      attributes: {} as Record<string, string>,
      stock: branches.map(branch => ({
        branch_id: branch.id,
        branch_name: branch.name,
        qty_on_hand: 0
      }))
    }
    // Pre-llenar atributos seleccionados con valor vacío
    selectedAttributeTypes.forEach(attr => {
      newVariant.attributes[attr] = ''
    })
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
    const newVariants = formData.variants.map((v: any, i: number) => {
      if (i !== variantIndex) return v
      return {
        ...v,
        stock: v.stock.map((s: any, j: number) => {
          if (j !== branchIndex) return s
          return { ...s, qty_on_hand: qty }
        })
      }
    })
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
          {/* Selector de tipos de atributos */}
          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3">
            <div className="flex items-center gap-2">
              <Tags className="h-4 w-4 text-indigo-500" />
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Tipos de Atributos
              </Label>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Selecciona o crea los atributos que diferencian tus variantes (ej: Color, Talla, Material, Estilo)
            </p>

            {/* Atributos seleccionados */}
            {selectedAttributeTypes.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedAttributeTypes.map(attr => (
                  <Badge
                    key={attr}
                    variant="secondary"
                    className="flex items-center gap-1 px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                  >
                    {attr}
                    <button
                      type="button"
                      onClick={() => removeAttributeType(attr)}
                      className="ml-1 hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Agregar desde tipos existentes o personalizado */}
            <div className="flex gap-2">
              {availableTypes.length > 0 && (
                <Select
                  value=""
                  onValueChange={(val) => { if (val) addAttributeType(val) }}
                >
                  <SelectTrigger className="flex-1 border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-sm">
                    <SelectValue placeholder="Agregar tipo existente..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTypes
                      .filter(t => !selectedAttributeTypes.includes(t.name))
                      .map(t => (
                        <SelectItem key={t.id} value={t.name}>
                          {t.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
              <div className="flex gap-1">
                <Input
                  value={customAttrName}
                  onChange={(e) => setCustomAttrName(e.target.value)}
                  placeholder="Nuevo atributo..."
                  className="w-40 text-sm border-gray-300 dark:border-gray-700 dark:bg-gray-800"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addCustomAttributeType(customAttrName)
                      setCustomAttrName('')
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    addCustomAttributeType(customAttrName)
                    setCustomAttrName('')
                  }}
                  disabled={!customAttrName.trim()}
                  className="shrink-0"
                  title="Crear atributo y guardarlo en el catálogo"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

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
                              Código de Barras
                            </Label>
                            <Input
                              value={variant.barcode || ''}
                              onChange={(e) => updateVariant(index, 'barcode', e.target.value)}
                              placeholder={formData.barcode ? `Hereda: ${formData.barcode}` : 'Ej: 7501234567890'}
                              className="border-gray-300 dark:border-gray-700 dark:bg-gray-800"
                            />
                            {!variant.barcode && formData.barcode && (
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                Usará el código del producto padre si se deja vacío
                              </p>
                            )}
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

                        {/* Atributos dinámicos */}
                        {selectedAttributeTypes.length > 0 && (
                          <div className="space-y-2">
                            <Label className="text-gray-700 dark:text-gray-300">
                              Atributos de la Variante
                            </Label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {selectedAttributeTypes.map((attrType) => {
                                const suggestions = getValuesForType(attrType)
                                return (
                                  <div key={attrType} className="space-y-2">
                                    <Label className="text-sm text-gray-600 dark:text-gray-400">
                                      {attrType}
                                    </Label>
                                    <div className="flex gap-1">
                                      <Input
                                        value={variant.attributes[attrType] || ''}
                                        onChange={(e) => updateVariantAttribute(index, attrType, e.target.value)}
                                        placeholder={`Ingrese ${attrType.toLowerCase()}...`}
                                        className="border-gray-300 dark:border-gray-700 dark:bg-gray-800"
                                        list={`suggestions-${index}-${attrType}`}
                                      />
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="shrink-0 h-9 w-9"
                                        title="Guardar este valor en el catálogo"
                                        disabled={!variant.attributes[attrType]?.trim()}
                                        onClick={() => createValueInCatalog(attrType, variant.attributes[attrType] || '')}
                                      >
                                        <Plus className="h-4 w-4" />
                                      </Button>
                                    </div>
                                    {suggestions.length > 0 && (
                                      <>
                                        <datalist id={`suggestions-${index}-${attrType}`}>
                                          {suggestions.map(s => (
                                            <option key={s} value={s} />
                                          ))}
                                        </datalist>
                                        <div className="flex flex-wrap gap-1">
                                          {suggestions.map(s => (
                                            <button
                                              key={s}
                                              type="button"
                                              onClick={() => updateVariantAttribute(index, attrType, s)}
                                              className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                                                variant.attributes[attrType] === s
                                                  ? 'bg-indigo-100 border-indigo-300 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-600 dark:text-indigo-300'
                                                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700'
                                              }`}
                                            >
                                              {s}
                                            </button>
                                          ))}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

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
