"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/use-toast'
import { supabase } from '@/lib/supabase/config'
import { useOrganization } from '@/lib/hooks/useOrganization'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, Save, X } from 'lucide-react'

import InformacionBasica from './InformacionBasica'
import PreciosYCostos from './PreciosYCostos'
import Inventario from './Inventario'
import Imagenes from './Imagenes'
import Variantes from './Variantes'
import Notas from './Notas'
import Etiquetas from './Etiquetas'

interface ProductFormData {
  // Información básica
  sku: string
  barcode: string
  name: string
  description: string
  category_id: number | null
  unit_code: string
  supplier_id: number | null
  
  // Precios y costos
  price: number
  cost: number
  
  // Inventario
  stock_inicial: Array<{
    branch_id: number
    qty_on_hand: number
    min_level: number
    avg_cost: number
  }>
  
  // Impuestos
  tax_id: string | null
  
  // Imágenes
  images: Array<{
    file?: File
    url?: string
    storagePath?: string
    is_primary: boolean
  }>
  
  // Variantes
  has_variants: boolean
  variants: Array<{
    sku: string
    name: string
    price: number
    cost: number
    attributes: Record<string, string>
    stock: Array<{
      branch_id: number
      qty_on_hand: number
    }>
  }>
  
  // Notas y etiquetas
  notes: string
  tags: number[]
}

export default function NuevoProductoForm() {
  const router = useRouter()
  const { toast } = useToast()
  const { organization, branch_id } = useOrganization()
  const [isLoading, setIsLoading] = useState(false)
  
  const [formData, setFormData] = useState<ProductFormData>({
    sku: '',
    barcode: '',
    name: '',
    description: '',
    category_id: null,
    unit_code: 'UN',
    supplier_id: null,
    price: 0,
    cost: 0,
    stock_inicial: [],
    tax_id: null,
    images: [],
    has_variants: false,
    variants: [],
    notes: '',
    tags: []
  })

  const updateFormData = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const validateForm = (): boolean => {
    if (!formData.sku.trim()) {
      toast({
        title: "Error de validación",
        description: "El SKU es requerido",
        variant: "destructive"
      })
      return false
    }

    if (!formData.name.trim() || formData.name.length < 2) {
      toast({
        title: "Error de validación",
        description: "El nombre debe tener al menos 2 caracteres",
        variant: "destructive"
      })
      return false
    }

    if (formData.price < 0 || formData.cost < 0) {
      toast({
        title: "Error de validación",
        description: "Los precios y costos deben ser mayores o iguales a 0",
        variant: "destructive"
      })
      return false
    }

    return true
  }

  const handleSubmit = async () => {
    if (!validateForm()) return
    if (!organization?.id) {
      toast({
        title: "Error",
        description: "No se pudo obtener la organización",
        variant: "destructive"
      })
      return
    }

    setIsLoading(true)

    try {
      // 1. Verificar SKU único
      const { data: existingSku } = await supabase
        .from('products')
        .select('id')
        .eq('organization_id', organization.id)
        .eq('sku', formData.sku)
        .maybeSingle()

      if (existingSku) {
        toast({
          title: "SKU duplicado",
          description: "Ya existe un producto con este SKU",
          variant: "destructive"
        })
        setIsLoading(false)
        return
      }

      // 2. Crear producto principal
      const { data: product, error: productError } = await supabase
        .from('products')
        .insert({
          organization_id: organization.id,
          sku: formData.sku,
          barcode: formData.barcode || null,
          name: formData.name,
          description: formData.description || null,
          category_id: formData.category_id,
          unit_code: formData.unit_code,
          status: 'active',
          is_parent: formData.has_variants
        })
        .select('id, uuid')
        .single()

      if (productError) throw productError

      // 3. Guardar precio
      if (formData.price > 0) {
        const { error: priceError } = await supabase
          .from('product_prices')
          .insert({
            product_id: product.id,
            price: formData.price,
            effective_from: new Date().toISOString()
          })
        
        if (priceError) throw priceError
      }

      // 4. Guardar costo
      if (formData.cost > 0) {
        const { error: costError } = await supabase
          .from('product_costs')
          .insert({
            product_id: product.id,
            cost: formData.cost,
            effective_from: new Date().toISOString(),
            supplier_id: formData.supplier_id
          })
        
        if (costError) throw costError
      }

      // 5. Guardar relación con impuesto
      if (formData.tax_id) {
        const { error: taxError } = await supabase
          .from('product_tax_relations')
          .insert({
            product_id: product.id,
            tax_id: formData.tax_id
          })
        
        if (taxError) throw taxError
      }

      // 6. Guardar proveedor principal
      if (formData.supplier_id) {
        const { error: supplierError } = await supabase
          .from('product_suppliers')
          .insert({
            product_id: product.id,
            supplier_id: formData.supplier_id,
            cost: formData.cost,
            is_preferred: true
          })
        
        if (supplierError) throw supplierError
      }

      // 7. Guardar stock inicial por sucursal (SOLO si NO tiene variantes)
      // Si tiene variantes, el stock se gestiona en cada variante individual
      if (!formData.has_variants && formData.stock_inicial.length > 0) {
        const stockLevels = formData.stock_inicial.map(stock => ({
          product_id: product.id,
          branch_id: stock.branch_id,
          qty_on_hand: stock.qty_on_hand,
          min_level: stock.min_level,
          avg_cost: stock.avg_cost
        }))

        const { error: stockError } = await supabase
          .from('stock_levels')
          .insert(stockLevels)
        
        if (stockError) throw stockError

        // Crear movimientos de inventario
        const movements = formData.stock_inicial
          .filter(stock => stock.qty_on_hand > 0)
          .map(stock => ({
            organization_id: organization.id,
            branch_id: stock.branch_id,
            product_id: product.id,
            direction: 'in',
            qty: stock.qty_on_hand,
            unit_cost: stock.avg_cost,
            source: 'adjustment',
            source_id: product.id.toString(),
            note: 'Stock inicial'
          }))

        if (movements.length > 0) {
          const { error: movementError } = await supabase
            .from('stock_movements')
            .insert(movements)
          
          if (movementError) throw movementError
        }
      }

      // 8. Subir imágenes
      if (formData.images.length > 0) {
        for (let i = 0; i < formData.images.length; i++) {
          const image = formData.images[i]
          let storagePath = ''

          if (image.storagePath) {
            // Imagen IA ya guardada en storage por la API
            storagePath = image.storagePath
          } else if (image.file) {
            // Imagen subida por el usuario: subir a storage
            const fileExt = image.file.name.split('.').pop()
            const fileName = `${product.uuid}_${Date.now()}_${i}.${fileExt}`
            storagePath = `products/${organization.id}/${fileName}`

            const { error: uploadError } = await supabase.storage
              .from('product-images')
              .upload(storagePath, image.file)

            if (uploadError) throw uploadError
          } else {
            continue // Imagen sin file ni storagePath, saltar
          }

          const { error: imageError } = await supabase
            .from('product_images')
            .insert({
              product_id: product.id,
              storage_path: storagePath,
              display_order: i,
              is_primary: image.is_primary
            })

          if (imageError) throw imageError
        }
      }

      // 9. Guardar notas
      if (formData.notes.trim()) {
        const { error: notesError } = await supabase
          .from('product_notes')
          .insert({
            product_id: product.id,
            note: formData.notes
          })
        
        if (notesError) throw notesError
      }

      // 10. Guardar etiquetas
      if (formData.tags.length > 0) {
        const tagRelations = formData.tags.map(tagId => ({
          product_id: product.id,
          tag_id: tagId
        }))

        const { error: tagsError } = await supabase
          .from('product_tag_relations')
          .insert(tagRelations)
        
        if (tagsError) throw tagsError
      }

      // 11. Crear variantes si existen
      if (formData.has_variants && formData.variants.length > 0) {
        for (const variant of formData.variants) {
          const { data: variantProduct, error: variantError } = await supabase
            .from('products')
            .insert({
              organization_id: organization.id,
              sku: variant.sku,
              name: variant.name,
              parent_product_id: product.id,
              is_parent: false,
              variant_data: variant.attributes,
              status: 'active'
            })
            .select('id')
            .single()

          if (variantError) throw variantError

          // Precio de variante
          if (variant.price > 0) {
            await supabase.from('product_prices').insert({
              product_id: variantProduct.id,
              price: variant.price,
              effective_from: new Date().toISOString()
            })
          }

          // Costo de variante
          if (variant.cost > 0) {
            await supabase.from('product_costs').insert({
              product_id: variantProduct.id,
              cost: variant.cost,
              effective_from: new Date().toISOString()
            })
          }

          // Stock de variante
          if (variant.stock.length > 0) {
            const variantStockLevels = variant.stock.map(stock => ({
              product_id: variantProduct.id,
              branch_id: stock.branch_id,
              qty_on_hand: stock.qty_on_hand
            }))

            await supabase.from('stock_levels').insert(variantStockLevels)

            // Movimientos de variante
            const variantMovements = variant.stock
              .filter(stock => stock.qty_on_hand > 0)
              .map(stock => ({
                organization_id: organization.id,
                branch_id: stock.branch_id,
                product_id: variantProduct.id,
                direction: 'in',
                qty: stock.qty_on_hand,
                unit_cost: variant.cost,
                source: 'adjustment',
                source_id: variantProduct.id.toString(),
                note: `Stock inicial variante ${variant.sku}`
              }))

            if (variantMovements.length > 0) {
              await supabase.from('stock_movements').insert(variantMovements)
            }
          }
        }
      }

      toast({
        title: "✅ Producto creado",
        description: "El producto se ha creado exitosamente"
      })

      router.push(`/app/inventario/productos/${product.uuid}`)
    } catch (error: any) {
      console.error('Error creando producto:', error)
      toast({
        title: "Error al crear producto",
        description: error.message || "Ocurrió un error inesperado",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Información Básica */}
      <Card className="border-gray-200 dark:border-gray-800">
        <CardContent className="pt-6">
          <InformacionBasica 
            formData={formData}
            updateFormData={updateFormData}
          />
        </CardContent>
      </Card>

      {/* Precios y Costos */}
      <Card className="border-gray-200 dark:border-gray-800">
        <CardContent className="pt-6">
          <PreciosYCostos 
            formData={formData}
            updateFormData={updateFormData}
          />
        </CardContent>
      </Card>

      {/* Inventario */}
      <Card className="border-gray-200 dark:border-gray-800">
        <CardContent className="pt-6">
          <Inventario 
            formData={formData}
            updateFormData={updateFormData}
            hasVariants={formData.has_variants}
          />
        </CardContent>
      </Card>

      {/* Imágenes */}
      <Card className="border-gray-200 dark:border-gray-800">
        <CardContent className="pt-6">
          <Imagenes 
            formData={formData}
            updateFormData={updateFormData}
          />
        </CardContent>
      </Card>

      {/* Variantes */}
      <Card className="border-gray-200 dark:border-gray-800">
        <CardContent className="pt-6">
          <Variantes 
            formData={formData}
            updateFormData={updateFormData}
          />
        </CardContent>
      </Card>

      {/* Notas */}
      <Card className="border-gray-200 dark:border-gray-800">
        <CardContent className="pt-6">
          <Notas 
            formData={formData}
            updateFormData={updateFormData}
          />
        </CardContent>
      </Card>

      {/* Etiquetas */}
      <Card className="border-gray-200 dark:border-gray-800">
        <CardContent className="pt-6">
          <Etiquetas 
            formData={formData}
            updateFormData={updateFormData}
          />
        </CardContent>
      </Card>

      {/* Botones de acción */}
      <div className="flex justify-end gap-3 sticky bottom-0 bg-white dark:bg-gray-900 py-4 border-t border-gray-200 dark:border-gray-800">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isLoading}
          className="border-gray-300 dark:border-gray-700"
        >
          <X className="h-4 w-4 mr-2" />
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={isLoading}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Guardar Producto
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
