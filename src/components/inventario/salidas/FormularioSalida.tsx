'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase/config'
import { useToast } from '@/components/ui/use-toast'
import { formatDate } from '@/utils/Utils'
import TablaProductosSalida from './TablaProductosSalida'

interface Cliente {
  id: number
  full_name: string
}

interface Sucursal {
  id: number
  name: string
}

interface ProductoSalida {
  id: number
  product_id: number
  nombre: string
  sku: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  lote_id?: number
  lote_codigo?: string
}

interface FormularioSalidaProps {
  readonly organizationId: number
}

export default function FormularioSalida({ organizationId }: FormularioSalidaProps) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [productos, setProductos] = useState<ProductoSalida[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const { toast } = useToast()

  const [formData, setFormData] = useState({
    tipo_salida: 'venta',
    cliente_id: '',
    sucursal_id: '',
    referencia: '',
    fecha: formatDate(new Date().toISOString(), 'yyyy-MM-dd'),
    notas: ''
  })

  useEffect(() => {
    const cargarClientes = async () => {
      try {
        const { data, error } = await supabase
          .from('customers')
          .select('id, full_name')
          .eq('organization_id', organizationId)
          .order('full_name')

        if (error) throw error
        setClientes(data || [])
      } catch (error) {
        console.error('Error al cargar clientes:', error)
      }
    }

    const cargarSucursales = async () => {
      try {
        const { data, error } = await supabase
          .from('branches')
          .select('id, name')
          .eq('organization_id', organizationId)
          .order('name')

        if (error) throw error
        setSucursales(data || [])
      } catch (error) {
        console.error('Error al cargar sucursales:', error)
      }
    }

    setIsLoading(true)
    Promise.all([cargarClientes(), cargarSucursales()])
      .finally(() => setIsLoading(false))
  }, [organizationId])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleAddProducto = (producto: ProductoSalida) => {
    setProductos(prev => [...prev, producto])
  }

  const handleRemoveProducto = (index: number) => {
    setProductos(prev => prev.filter((_, i) => i !== index))
  }

  const handleUpdateProducto = (index: number, producto: ProductoSalida) => {
    setProductos(prev => {
      const nuevosProductos = [...prev]
      nuevosProductos[index] = producto
      return nuevosProductos
    })
  }

  const calcularTotal = () => {
    return productos.reduce((total, producto) => total + producto.subtotal, 0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (productos.length === 0) {
      toast({
        title: "Error",
        description: "Debe agregar al menos un producto a la salida.",
        variant: "destructive"
      })
      return
    }

    setIsSaving(true)

    try {
      // Obtener el usuario actual (requerido para user_id)
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('No se pudo obtener la información del usuario');
      }

      // Determinar el estado inicial según el tipo de salida
      let estadoInicial = 'draft';
      if (formData.tipo_salida === 'ajuste') {
        // Los ajustes se registran directamente como completados
        estadoInicial = 'completed';
      }
      
      // Crear la venta/salida usando la tabla real 'sales'
      const { data: salidaData, error: salidaError } = await supabase
        .from('sales')
        .insert({
          organization_id: organizationId,
          branch_id: Number(formData.sucursal_id),
          customer_id: formData.tipo_salida === 'venta' ? Number(formData.cliente_id) : null,
          user_id: user.id, // Campo requerido (NOT NULL)
          total: calcularTotal(),
          status: estadoInicial,
          sale_date: formData.fecha,
          notes: formData.notas
          // created_at y updated_at son automáticos en Supabase
        })
        .select('id')
        .single()

      if (salidaError) throw salidaError

      // Insertar los items usando la tabla real 'sale_items'
      const itemsParaInsertar = productos.map(producto => ({
        sale_id: salidaData.id,
        product_id: Number(producto.product_id), // Asegurar tipo correcto
        quantity: Number(producto.cantidad), // Asegurar tipo correcto
        unit_price: Number(producto.precio_unitario), // Asegurar tipo correcto
        total: Number(producto.cantidad) * Number(producto.precio_unitario) // Campo requerido (NOT NULL)
        // created_at y updated_at son automáticos en Supabase
        // lot_id no está en sale_items según la estructura real
      }));

      const { error: itemsError } = await supabase
        .from('sale_items')
        .insert(itemsParaInsertar);

      if (itemsError) throw itemsError;
      
      // Si es un ajuste o una salida inmediata, crear los movimientos de stock
      if (formData.tipo_salida === 'ajuste') {
        // Registrar movimientos de stock para cada producto
        const movimientosStock = productos.map(producto => {
          // Validar campos requeridos antes de la inserción
          if (!producto.product_id || !producto.cantidad) {
            throw new Error(`Producto inválido: falta product_id o cantidad`);
          }
          
          return {
            organization_id: Number(organizationId), // Asegurar que sea number
            branch_id: Number(formData.sucursal_id), // Asegurar que sea number
            product_id: Number(producto.product_id), // Asegurar que sea number
            lot_id: producto.lote_id ? Number(producto.lote_id) : null, // Asegurar tipo correcto
            direction: 'out', // Salida de inventario
            qty: Number(producto.cantidad), // Asegurar que sea numeric
            unit_cost: Number(producto.precio_unitario) || null, // Permitir null si no hay precio
            source: 'ajuste', // Valor fijo para evitar problemas con formData
            source_id: salidaData.id.toString(),
            note: formData.notas || `Salida por ajuste`
            // created_at es automático en Supabase
          };
        });
        
        // Insertar los movimientos de stock
        const { error: movimientosError } = await supabase
          .from('stock_movements')
          .insert(movimientosStock);
        
        if (movimientosError) throw movimientosError;
      }

      toast({
        title: "Éxito",
        description: "La salida de inventario se ha creado correctamente.",
      });

      // Resetear formulario
      setFormData({
        tipo_salida: 'venta',
        cliente_id: '',
        sucursal_id: '',
        referencia: '',
        fecha: formatDate(new Date().toISOString(), 'yyyy-MM-dd'),
        notas: ''
      });
      setProductos([]);
    } catch (error: unknown) {
    console.error('Error completo al guardar la salida:', error);
    
    // Mejorar el manejo de errores para debugging
    let errorMessage = 'Error desconocido';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      console.error('Error.message:', error.message);
      console.error('Error.stack:', error.stack);
    } else if (typeof error === 'object' && error !== null) {
      console.error('Error como objeto:', JSON.stringify(error, null, 2));
      // Si es un error de Supabase
      const errorObj = error as Record<string, unknown>;
      if ('message' in errorObj && typeof errorObj.message === 'string') {
        errorMessage = errorObj.message;
      } else if ('error' in errorObj && typeof errorObj.error === 'string') {
        errorMessage = errorObj.error;
      } else if ('details' in errorObj && typeof errorObj.details === 'string') {
        errorMessage = errorObj.details;
      }
    }
    
    toast({
      title: "Error",
      description: `No se pudo guardar la salida: ${errorMessage}`,
      variant: "destructive"
    });
  } finally {
    setIsSaving(false);
  }
}

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tipo_salida">Tipo de Salida</Label>
            <Select 
              value={formData.tipo_salida} 
              onValueChange={(value) => handleSelectChange('tipo_salida', value)}
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un tipo de salida" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="venta">Venta</SelectItem>
                <SelectItem value="devolucion">Devolución de Cliente</SelectItem>
                <SelectItem value="ajuste">Ajuste de Inventario</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.tipo_salida === 'venta' && (
            <div className="space-y-2">
              <Label htmlFor="cliente_id">Cliente</Label>
              <Select 
                value={formData.cliente_id} 
                onValueChange={(value) => handleSelectChange('cliente_id', value)}
                disabled={isLoading || clientes.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map(cliente => (
                    <SelectItem key={cliente.id} value={cliente.id.toString()}>
                      {cliente.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="sucursal_id">Sucursal</Label>
            <Select 
              value={formData.sucursal_id} 
              onValueChange={(value) => handleSelectChange('sucursal_id', value)}
              disabled={isLoading || sucursales.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una sucursal" />
              </SelectTrigger>
              <SelectContent>
                {sucursales.map(sucursal => (
                  <SelectItem key={sucursal.id} value={sucursal.id.toString()}>
                    {sucursal.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="referencia">Número de Referencia</Label>
            <Input
              id="referencia"
              name="referencia"
              value={formData.referencia}
              onChange={handleChange}
              placeholder="SO-0001"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fecha">Fecha</Label>
            <Input
              id="fecha"
              name="fecha"
              type="date"
              value={formData.fecha}
              onChange={handleChange}
              disabled={isLoading}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notas">Notas</Label>
        <Textarea
          id="notas"
          name="notas"
          value={formData.notas}
          onChange={handleChange}
          placeholder="Información adicional sobre la salida..."
          rows={3}
          disabled={isLoading}
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <TablaProductosSalida
            productos={productos}
            onAddProducto={handleAddProducto}
            onRemoveProducto={handleRemoveProducto}
            onUpdateProducto={handleUpdateProducto}
            organizationId={organizationId}
          />
        </CardContent>
      </Card>

      <div className="flex justify-between items-center">
        <div className="text-lg font-bold">
          Total: ${calcularTotal().toFixed(2)}
        </div>
        <div className="flex gap-4">
          <Button type="button" variant="outline">
            Cancelar
          </Button>
          <Button type="submit" disabled={isLoading || isSaving || productos.length === 0}>
            {isSaving ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Guardando...
              </>
            ) : (
              'Guardar Salida'
            )}
          </Button>
        </div>
      </div>
    </form>
  )
}
