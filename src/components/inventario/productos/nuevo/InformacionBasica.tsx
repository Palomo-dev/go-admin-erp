"use client"

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/config'
import { useOrganization } from '@/lib/hooks/useOrganization'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SearchSelect } from '@/components/ui/search-select'
import { Package, Sparkles, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { STATION_LABELS, type PrinterStation } from '@/components/pos/configuracion/printersService'

interface InformacionBasicaProps {
  formData: any
  updateFormData: (field: string, value: any) => void
}

interface Category {
  id: number
  name: string
  station?: string | null
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
        .select('id, name, station')
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

      // Auto-generar SKU si está vacío
      if (!formData.sku) {
        updateFormData('sku', await generateUniqueSku())
      }
    } catch (error) {
      console.error('Error cargando datos:', error)
    } finally {
      setIsLoadingData(false)
    }
  }

  const generateUniqueSku = async (): Promise<string> => {
    if (!organization?.id) return `PROD-${Date.now().toString(36).toUpperCase()}`

    const { count } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organization.id)

    const nextNum = (count ?? 0) + 1
    const suffix = Date.now().toString(36).slice(-3).toUpperCase()
    return `PROD-${String(nextNum).padStart(3, '0')}-${suffix}`
  }

  const handleRegenerateSku = async () => {
    const newSku = await generateUniqueSku()
    updateFormData('sku', newSku)
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
          productName: formData.name,
          currentDescription: formData.description || '',
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
    <div className="space-y-6 max-w-full overflow-hidden">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 max-w-full">
        {/* SKU */}
        <div className="space-y-2">
          <Label htmlFor="sku" className="text-gray-700 dark:text-gray-300">
            SKU / Código <span className="text-red-500">*</span>
          </Label>
          <div className="flex gap-2">
            <Input
              id="sku"
              value={formData.sku}
              onChange={(e) => updateFormData('sku', e.target.value.toUpperCase())}
              placeholder="Ej: PROD-001-A1B"
              className="border-gray-300 dark:border-gray-700 dark:bg-gray-800 flex-1"
              required
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleRegenerateSku}
              title="Generar nuevo SKU"
              className="shrink-0 border-gray-300 dark:border-gray-700"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
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
            <SearchSelect
              options={categories.map((cat) => ({ value: cat.id.toString(), label: cat.name }))}
              value={formData.category_id?.toString() || 'none'}
              onValueChange={(value) => updateFormData('category_id', value === 'none' ? null : parseInt(value))}
              placeholder="Seleccionar categoría"
              searchPlaceholder="Buscar categoría..."
              emptyText="No se encontraron categorías"
              noneLabel="Sin categoría"
            />
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
            <SearchSelect
              options={units.map((unit) => ({ value: unit.code, label: unit.name, sublabel: unit.code }))}
              value={formData.unit_code || 'none'}
              onValueChange={(value) => updateFormData('unit_code', value === 'none' ? '' : value)}
              placeholder="Seleccionar unidad"
              searchPlaceholder="Buscar unidad..."
              emptyText="No se encontraron unidades"
              noneLabel="Sin unidad"
            />
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
            <SearchSelect
              options={taxes.map((tax) => ({ value: tax.id, label: tax.name, sublabel: `${tax.rate}%` }))}
              value={formData.tax_id || 'none'}
              onValueChange={(value) => updateFormData('tax_id', value === 'none' ? null : value)}
              placeholder="Seleccionar impuesto"
              searchPlaceholder="Buscar impuesto..."
              emptyText="No se encontraron impuestos"
              noneLabel="Sin impuesto"
            />
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
            <SearchSelect
              options={suppliers.map((supplier) => ({ value: supplier.id.toString(), label: supplier.name }))}
              value={formData.supplier_id?.toString() || 'none'}
              onValueChange={(value) => updateFormData('supplier_id', value === 'none' ? null : parseInt(value))}
              placeholder="Seleccionar proveedor"
              searchPlaceholder="Buscar proveedor..."
              emptyText="No se encontraron proveedores"
              noneLabel="Sin proveedor"
            />
          )}
        </div>

        {/* Estación de Cocina/Bar */}
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="station" className="text-gray-700 dark:text-gray-300">
            Estación de Cocina/Bar
          </Label>
          <Select
            value={formData.station || 'none'}
            onValueChange={(value) => updateFormData('station', value === 'none' ? null : (value as PrinterStation))}
          >
            <SelectTrigger className="border-gray-300 dark:border-gray-700 dark:bg-gray-800">
              <SelectValue placeholder="Heredar de la categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Heredar de la categoría</SelectItem>
              {Object.entries(STATION_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {(() => {
              const selectedCategory = categories.find((c) => c.id === formData.category_id)
              if (formData.station) return 'Esta estación sobreescribe la de la categoría para este producto.'
              if (selectedCategory?.station) return `Se usará la estación de la categoría: ${STATION_LABELS[selectedCategory.station as PrinterStation]}`
              return 'Sin estación definida en el producto ni en la categoría.'
            })()}
          </p>
        </div>
      </div>
    </div>
  )
}
