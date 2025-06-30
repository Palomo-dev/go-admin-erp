"use client"

import { useEffect, useState } from 'react'
import { UseFormReturn } from 'react-hook-form'
import { supabase } from '@/lib/supabase/config'
import { AlertCircle, Loader2 } from 'lucide-react'

import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'

interface InformacionBasicaProps {
  form: UseFormReturn<any>
}

export default function InformacionBasica({ form }: InformacionBasicaProps) {
  const [categorias, setCategorias] = useState<any[]>([])
  const [unidades, setUnidades] = useState<any[]>([])
  const [proveedores, setProveedores] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string>('')
  
  // Estados para validación de SKU y código de barras
  const [skuExistente, setSkuExistente] = useState(false)
  const [validandoSku, setValidandoSku] = useState(false)
  const [barcodeExistente, setBarcodeExistente] = useState(false)
  const [validandoBarcode, setValidandoBarcode] = useState(false)

  // Obtener la organización activa del localStorage o usar ID 2 como respaldo
  const getOrganizacionActiva = () => {
    if (typeof window !== 'undefined') {
      try {
        const orgData = localStorage.getItem('organizacionActiva')
        return orgData ? JSON.parse(orgData) : { id: 2 } // Usar ID 2 como valor por defecto
      } catch (err) {
        console.error('Error al obtener organización del localStorage:', err)
        return { id: 2 } // Valor de respaldo si hay error
      }
    }
    return { id: 2 } // Valor de respaldo para SSR
  }

  const organizacion = getOrganizacionActiva()
  const organization_id = organizacion?.id

  // Función para validar si un SKU ya existe en la base de datos
  const validarSkuExistente = async (sku: string) => {
    if (!sku || sku.trim() === '') {
      setSkuExistente(false);
      return;
    }
    
    setValidandoSku(true);
    
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id')
        .eq('sku', sku)
        .single();
        
      if (error && error.code === 'PGRST116') {
        // No se encontró ningún producto con ese SKU (es válido)
        setSkuExistente(false);
      } else if (data) {
        // Se encontró un producto con ese SKU (ya existe)
        setSkuExistente(true);
      }
    } catch (error) {
      console.error('Error al validar SKU:', error);
    } finally {
      setValidandoSku(false);
    }
  };
  
  // Función para validar si un código de barras ya existe en la base de datos
  const validarBarcodeExistente = async (barcode: string) => {
    if (!barcode || barcode.trim() === '') {
      setBarcodeExistente(false);
      return;
    }
    
    setValidandoBarcode(true);
    
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id')
        .eq('barcode', barcode)
        .single();
        
      if (error && error.code === 'PGRST116') {
        // No se encontró ningún producto con ese código de barras (es válido)
        setBarcodeExistente(false);
      } else if (data) {
        // Se encontró un producto con ese código de barras (ya existe)
        setBarcodeExistente(true);
      }
    } catch (error) {
      console.error('Error al validar código de barras:', error);
    } finally {
      setValidandoBarcode(false);
    }
  };

  // Efecto para cargar los datos iniciales
  useEffect(() => {
    const cargarDatos = async () => {
      setIsLoading(true)
      setError('')
      try {
        // Cargar categorías
        if (organization_id) {
          // Eliminado console.log para reducir ruido
          const { data: categoriasData, error: categoriasError } = await supabase
            .from('categories')
            .select('id, name')
            .eq('organization_id', organization_id)
            .order('name')
          
          if (categoriasError) {
            console.error('Error al cargar categorías:', categoriasError)
            throw new Error('Error al cargar categorías: ' + categoriasError.message)
          }
          
          // Eliminado console.log para reducir ruido
          setCategorias(categoriasData || [])
        } else {
          // Eliminado console.log para reducir ruido
          const { data: categoriasData } = await supabase
            .from('categories')
            .select('id, name')
            .eq('organization_id', 2)
            .order('name')
          
          setCategorias(categoriasData || [])
        }

        // Cargar unidades
        const { data: unidadesData } = await supabase
          .from('units')
          .select('code, name')
          .order('name')
        
        setUnidades(unidadesData || [])

        // Cargar proveedores
        if (organization_id) {
          const { data: proveedoresData } = await supabase
            .from('suppliers')
            .select('id, name')
            .eq('organization_id', organization_id)
            .order('name')
          
          setProveedores(proveedoresData || [])
        }
      } catch (error: any) {
        console.error('Error al cargar datos:', error)
        setError(error?.message || 'Error al cargar los datos. Por favor, intenta de nuevo.')
      } finally {
        setIsLoading(false)
      }
    }

    cargarDatos()
  }, [organization_id])

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Información Básica</h3>
      
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="sku"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Código SKU</FormLabel>
              <div className="relative">
                <FormControl>
                  <Input 
                    placeholder="SKU001" 
                    {...field} 
                    className={skuExistente ? "border-red-500 pr-10" : ""}
                    onChange={(e) => {
                      field.onChange(e);
                      validarSkuExistente(e.target.value);
                    }}
                  />
                </FormControl>
                {validandoSku && (
                  <div className="absolute right-3 top-2.5">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
              {skuExistente ? (
                <div className="text-sm font-medium text-destructive mt-1 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  Este SKU ya está en uso. Por favor, elige otro.
                </div>
              ) : (
                <FormDescription>
                  Código único para identificar el producto
                </FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="barcode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Código de Barras</FormLabel>
              <div className="relative">
                <FormControl>
                  <Input 
                    placeholder="7891234567890" 
                    {...field} 
                    className={barcodeExistente ? "border-red-500 pr-10" : ""}
                    onChange={(e) => {
                      field.onChange(e);
                      // Solo validar si hay contenido (es opcional)
                      if (e.target.value.trim()) {
                        validarBarcodeExistente(e.target.value);
                      } else {
                        setBarcodeExistente(false);
                      }
                    }}
                  />
                </FormControl>
                {validandoBarcode && (
                  <div className="absolute right-3 top-2.5">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
              {barcodeExistente ? (
                <div className="text-sm font-medium text-destructive mt-1 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  Este código de barras ya está en uso. Por favor, elige otro.
                </div>
              ) : (
                <FormDescription>
                  Código de barras (opcional)
                </FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Nombre del Producto</FormLabel>
            <FormControl>
              <Input placeholder="Nombre del producto" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Descripción</FormLabel>
            <FormControl>
              <Textarea 
                placeholder="Descripción detallada del producto" 
                className="resize-none" 
                rows={3}
                {...field} 
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FormField
          control={form.control}
          name="category_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Categoría</FormLabel>
              <Select 
                disabled={isLoading} 
                onValueChange={(value) => field.onChange(parseInt(value))}
                value={field.value?.toString() || ""}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {categorias.length > 0 ? (
                    categorias.map((categoria) => (
                      <SelectItem key={categoria.id} value={categoria.id.toString()}>
                        {categoria.name}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="p-2 text-sm text-center text-muted-foreground">
                      No hay categorías disponibles
                    </div>
                  )}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="unit_code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Unidad</FormLabel>
              <FormControl>
                {isLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select 
                    disabled={unidades.length === 0} 
                    value={field.value} 
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona una unidad" />
                    </SelectTrigger>
                    <SelectContent>
                      {unidades.map(unidad => (
                        <SelectItem key={unidad.code} value={unidad.code}>
                          {unidad.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="supplier_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Proveedor</FormLabel>
              <Select 
                disabled={isLoading}
                onValueChange={(value) => field.onChange(parseInt(value))}
                value={field.value?.toString() || ""}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {proveedores.map((proveedor) => (
                    <SelectItem key={proveedor.id} value={proveedor.id.toString()}>
                      {proveedor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  )
}
