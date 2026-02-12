"use client"

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/config'
import { useOrganization } from '@/lib/hooks/useOrganization'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Package, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface InformacionBasicaProps {
  formData: any
  updateFormData: (field: string, value: any) => void
}

interface Category {
  id: number
  name: string
}

interface Supplier {
  id: number
  name: string
}

interface Tax {
  id: string
  name: string
  rate: number
}

interface Unit {
  code: string
  name: string
}

export default function InformacionBasica({ formData, updateFormData }: InformacionBasicaProps) {
  const { organization } = useOrganization()
  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [taxes, setTaxes] = useState<Tax[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [isImprovingDescription, setIsImprovingDescription] = useState(false)

  useEffect(() => {
    if (organization?.id) {
      loadData()
    }
  }, [organization?.id])

  const loadData = async () => {
    if (!organization?.id) return

    setIsLoadingData(true)
    try {
      // Cargar categorías
      const { data: categoriesData } = await supabase
        .from('categories')
        .select('id, name')
        .eq('organization_id', organization.id)
        .order('name')

      if (categoriesData) setCategories(categoriesData)

      // Cargar proveedores
      const { data: suppliersData } = await supabase
        .from('suppliers')
        .select('id, name')
        .eq('organization_id', organization.id)
        .order('name')

      if (suppliersData) setSuppliers(suppliersData)

      // Cargar impuestos
      const { data: taxesData } = await supabase
        .from('organization_taxes')
        .select('id, name, rate')
        .eq('organization_id', organization.id)
        .eq('is_active', true)
        .order('name')

      if (taxesData) setTaxes(taxesData)

      // Cargar unidades
      const { data: unitsData } = await supabase
        .from('units')
        .select('code, name')
        .order('name')

      if (unitsData) setUnits(unitsData.map(u => ({ code: u.code.trim(), name: u.name })))
    } catch (error) {
      console.error('Error cargando datos:', error)
    } finally {
      setIsLoadingData(false)
    }
  }

  const handleImproveDescription = async () => {
    if (!formData.name.trim()) {
      return
    }

    setIsImprovingDescription(true)
    try {
      const response = await fetch('/api/ai-assistant/improve-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: formData.description || formData.name,
          context: `Producto: ${formData.name}`,
          type: 'product_description'
        })
      })

      if (response.ok) {
        const data = await response.json()
        updateFormData('description', data.improvedText)
      }
    } catch (error) {
      console.error('Error mejorando descripción:', error)
    } finally {
      setIsImprovingDescription(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
          <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Información Básica
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Datos principales del producto
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* SKU */}
        <div className="space-y-2">
          <Label htmlFor="sku" className="text-gray-700 dark:text-gray-300">
            SKU / Código <span className="text-red-500">*</span>
          </Label>
          <Input
            id="sku"
            value={formData.sku}
            onChange={(e) => updateFormData('sku', e.target.value.toUpperCase())}
            placeholder="Ej: PROD-001"
            className="border-gray-300 dark:border-gray-700 dark:bg-gray-800"
            required
          />
        </div>

        {/* Código de Barras */}
        <div className="space-y-2">
          <Label htmlFor="barcode" className="text-gray-700 dark:text-gray-300">
            Código de Barras
          </Label>
          <Input
            id="barcode"
            value={formData.barcode}
            onChange={(e) => updateFormData('barcode', e.target.value)}
            placeholder="Ej: 7501234567890"
            className="border-gray-300 dark:border-gray-700 dark:bg-gray-800"
          />
        </div>

        {/* Nombre */}
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="name" className="text-gray-700 dark:text-gray-300">
            Nombre del Producto <span className="text-red-500">*</span>
          </Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => updateFormData('name', e.target.value)}
            placeholder="Ej: Camiseta Polo Azul"
            className="border-gray-300 dark:border-gray-700 dark:bg-gray-800"
            required
          />
        </div>

        {/* Descripción */}
        <div className="space-y-2 md:col-span-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="description" className="text-gray-700 dark:text-gray-300">
              Descripción
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleImproveDescription}
              disabled={isImprovingDescription || !formData.name.trim()}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              {isImprovingDescription ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Mejorando...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-1" />
                  Mejorar con IA
                </>
              )}
            </Button>
          </div>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => updateFormData('description', e.target.value)}
            placeholder="Descripción detallada del producto..."
            rows={4}
            className="border-gray-300 dark:border-gray-700 dark:bg-gray-800 resize-none"
          />
        </div>

        {/* Categoría */}
        <div className="space-y-2">
          <Label htmlFor="category" className="text-gray-700 dark:text-gray-300">
            Categoría
          </Label>
          {isLoadingData ? (
            <div className="flex items-center justify-center h-10 border border-gray-300 dark:border-gray-700 rounded-md">
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            </div>
          ) : (
            <Select
              value={formData.category_id?.toString() || 'none'}
              onValueChange={(value) => updateFormData('category_id', value === 'none' ? null : parseInt(value))}
            >
              <SelectTrigger className="border-gray-300 dark:border-gray-700 dark:bg-gray-800">
                <SelectValue placeholder="Seleccionar categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin categoría</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id.toString()}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Unidad de Medida */}
        <div className="space-y-2">
          <Label htmlFor="unit_code" className="text-gray-700 dark:text-gray-300">
            Unidad de Medida
          </Label>
          {isLoadingData ? (
            <div className="flex items-center justify-center h-10 border border-gray-300 dark:border-gray-700 rounded-md">
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            </div>
          ) : (
            <Select
              value={formData.unit_code}
              onValueChange={(value) => updateFormData('unit_code', value)}
            >
              <SelectTrigger className="border-gray-300 dark:border-gray-700 dark:bg-gray-800">
                <SelectValue placeholder="Seleccionar unidad" />
              </SelectTrigger>
              <SelectContent>
                {units.map((unit) => (
                  <SelectItem key={unit.code} value={unit.code}>
                    {unit.name} ({unit.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Impuesto */}
        <div className="space-y-2">
          <Label htmlFor="tax" className="text-gray-700 dark:text-gray-300">
            Impuesto
          </Label>
          {isLoadingData ? (
            <div className="flex items-center justify-center h-10 border border-gray-300 dark:border-gray-700 rounded-md">
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            </div>
          ) : (
            <Select
              value={formData.tax_id || 'none'}
              onValueChange={(value) => updateFormData('tax_id', value === 'none' ? null : value)}
            >
              <SelectTrigger className="border-gray-300 dark:border-gray-700 dark:bg-gray-800">
                <SelectValue placeholder="Seleccionar impuesto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin impuesto</SelectItem>
                {taxes.map((tax) => (
                  <SelectItem key={tax.id} value={tax.id}>
                    {tax.name} ({tax.rate}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Proveedor Principal */}
        <div className="space-y-2">
          <Label htmlFor="supplier" className="text-gray-700 dark:text-gray-300">
            Proveedor Principal
          </Label>
          {isLoadingData ? (
            <div className="flex items-center justify-center h-10 border border-gray-300 dark:border-gray-700 rounded-md">
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            </div>
          ) : (
            <Select
              value={formData.supplier_id?.toString() || 'none'}
              onValueChange={(value) => updateFormData('supplier_id', value === 'none' ? null : parseInt(value))}
            >
              <SelectTrigger className="border-gray-300 dark:border-gray-700 dark:bg-gray-800">
                <SelectValue placeholder="Seleccionar proveedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin proveedor</SelectItem>
                {suppliers.map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id.toString()}>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
    </div>
  )
}
