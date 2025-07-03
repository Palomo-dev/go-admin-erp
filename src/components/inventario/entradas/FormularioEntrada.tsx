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
import TablaProductosEntrada from './TablaProductosEntrada'

interface Proveedor {
  id: number
  name: string
}

interface Sucursal {
  id: number
  name: string
}

interface ProductoEntrada {
  id: number
  product_id: number
  nombre: string
  sku: string
  cantidad: number
  costo_unitario: number
  subtotal: number
  lote?: string
  fecha_vencimiento?: string
}

interface FormularioEntradaProps {
  organizationId: number
}

export default function FormularioEntrada({ organizationId }: FormularioEntradaProps) {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [tiposEntrada, setTiposEntrada] = useState(['compra', 'devolucion', 'ajuste'])
  const [productos, setProductos] = useState<ProductoEntrada[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const { toast } = useToast()

  const [formData, setFormData] = useState({
    tipo_entrada: 'compra',
    proveedor_id: '',
    sucursal_id: '',
    referencia: '',
    fecha_orden: formatDate(new Date().toISOString(), 'yyyy-MM-dd'),
    fecha_esperada: '',
    notas: ''
  })

  useEffect(() => {
    const cargarProveedores = async () => {
      try {
        const { data, error } = await supabase
          .from('suppliers')
          .select('id, name')
          .eq('organization_id', organizationId)
          .order('name')

        if (error) throw error
        setProveedores(data || [])
      } catch (error) {
        console.error('Error al cargar proveedores:', error)
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
    Promise.all([cargarProveedores(), cargarSucursales()])
      .finally(() => setIsLoading(false))
  }, [organizationId])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleAddProducto = (producto: ProductoEntrada) => {
    setProductos(prev => [...prev, producto])
  }

  const handleRemoveProducto = (index: number) => {
    setProductos(prev => prev.filter((_, i) => i !== index))
  }

  const handleUpdateProducto = (index: number, producto: ProductoEntrada) => {
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
        description: "Debe agregar al menos un producto a la entrada.",
        variant: "destructive"
      })
      return
    }

    setIsSaving(true)

    try {
      // Determinar el estado inicial según el tipo de entrada
      let estadoOrdenCompra = 'draft';
      let estadoItems = 'pending';
      
      if (formData.tipo_entrada === 'ajuste') {
        // Los ajustes se registran directamente como recibidos
        estadoOrdenCompra = 'received';
        estadoItems = 'received';
      }
      
      // Verificar que haya un proveedor seleccionado si es una compra
      if (formData.tipo_entrada === 'compra' && !formData.proveedor_id) {
        toast({
          title: "Error",
          description: "Debe seleccionar un proveedor para una entrada por compra.",
          variant: "destructive"
        });
        setIsSaving(false);
        return;
      }

      // Para ajustes u otros tipos, usaremos un proveedor por defecto si no se seleccionó uno
      const proveedorId = formData.proveedor_id || 1; // Usar ID 1 como proveedor por defecto si no hay uno seleccionado
      
      // Crear la orden de compra
      const { data: ordenData, error: ordenError } = await supabase
        .from('purchase_orders')
        .insert({
          organization_id: organizationId,
          branch_id: Number(formData.sucursal_id),
          supplier_id: Number(proveedorId),
          notes: formData.notas + (formData.referencia ? ` (Ref: ${formData.referencia})` : ''),
          expected_date: formData.fecha_esperada || null,
          status: estadoOrdenCompra,
          total: calcularTotal(),
          created_by: (await supabase.auth.getUser()).data.user?.id || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select('id')
        .single()

      if (ordenError) throw ordenError
      
      // Array para almacenar los IDs de lotes creados
      const lotesCreados = new Map();
      
      // Procesar cada producto
      for (const producto of productos) {
        // Si tiene código de lote y fecha de vencimiento, crear o buscar el lote
        let lotId = null;
        
        if (producto.lote) {
          // Verificar si ya existe un lote con este código para este producto
          const { data: loteExistente, error: loteError } = await supabase
            .from('lots')
            .select('id')
            .eq('product_id', producto.product_id)
            .eq('lot_code', producto.lote)
            .maybeSingle();
          
          if (loteError) throw loteError;
          
          if (loteExistente) {
            // Usar el lote existente
            lotId = loteExistente.id;
          } else {
            // Crear nuevo lote
            const { data: nuevoLote, error: nuevoLoteError } = await supabase
              .from('lots')
              .insert({
                product_id: producto.product_id,
                lot_code: producto.lote,
                expiry_date: producto.fecha_vencimiento || null,
                supplier_id: formData.tipo_entrada === 'compra' ? Number(formData.proveedor_id) : null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .select('id')
              .single();
            
            if (nuevoLoteError) throw nuevoLoteError;
            lotId = nuevoLote.id;
          }
          
          // Guardar el ID del lote para usarlo en los movimientos
          lotesCreados.set(producto.product_id.toString() + '-' + producto.lote, lotId);
        }
      }

      // Insertar los items de la orden de compra
      const itemsParaInsertar = productos.map(producto => ({
        purchase_order_id: ordenData.id,
        product_id: producto.product_id,
        quantity: producto.cantidad,
        unit_cost: producto.costo_unitario,
        lot_code: producto.lote || null,
        status: estadoItems,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

      const { error: itemsError } = await supabase
        .from('po_items')
        .insert(itemsParaInsertar);

      if (itemsError) throw itemsError;
      
      // Si es un ajuste o una recepción inmediata, crear los movimientos de stock
      if (formData.tipo_entrada === 'ajuste') {
        // Crear movimientos de stock
        const movimientosStock = productos.map(producto => {
          // Obtener el ID del lote si existe
          const lotId = producto.lote ? 
            lotesCreados.get(producto.product_id.toString() + '-' + producto.lote) : 
            null;
          
          return {
            organization_id: organizationId,
            branch_id: Number(formData.sucursal_id),
            product_id: producto.product_id,
            lot_id: lotId,
            direction: 'in', // Entrada de inventario
            qty: producto.cantidad,
            unit_cost: producto.costo_unitario,
            source: formData.tipo_entrada === 'compra' ? 'purchase' : 
                   formData.tipo_entrada === 'ajuste' ? 'adjustment' : 
                   formData.tipo_entrada === 'devolucion' ? 'return' : 'adjustment', // Mapeo de tipos en español a los valores permitidos en inglés
            source_id: ordenData.id.toString(),
            note: formData.notas || `Entrada por ${formData.tipo_entrada}`,
            created_at: new Date().toISOString()
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
        description: "La entrada de inventario se ha creado correctamente.",
      });

      // Resetear formulario
      setFormData({
        tipo_entrada: 'compra',
        proveedor_id: '',
        sucursal_id: '',
        referencia: '',
        fecha_orden: formatDate(new Date().toISOString(), 'yyyy-MM-dd'),
        fecha_esperada: '',
        notas: ''
      });
      setProductos([]);
    } catch (error: any) {
      console.error('Error al guardar la entrada:', error);
      toast({
        title: "Error",
        description: "No se pudo guardar la entrada. " + error.message,
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
            <Label htmlFor="tipo_entrada">Tipo de Entrada</Label>
            <Select 
              value={formData.tipo_entrada} 
              onValueChange={(value) => handleSelectChange('tipo_entrada', value)}
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un tipo de entrada" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="compra">Compra</SelectItem>
                <SelectItem value="devolucion">Devolución a Proveedor</SelectItem>
                <SelectItem value="ajuste">Ajuste de Inventario</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.tipo_entrada === 'compra' && (
            <div className="space-y-2">
              <Label htmlFor="proveedor_id">Proveedor</Label>
              <Select 
                value={formData.proveedor_id} 
                onValueChange={(value) => handleSelectChange('proveedor_id', value)}
                disabled={isLoading || proveedores.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un proveedor" />
                </SelectTrigger>
                <SelectContent>
                  {proveedores.map(proveedor => (
                    <SelectItem key={proveedor.id} value={proveedor.id.toString()}>
                      {proveedor.name}
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
              placeholder="PO-0001"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fecha_orden">Fecha de Orden</Label>
            <Input
              id="fecha_orden"
              name="fecha_orden"
              type="date"
              value={formData.fecha_orden}
              onChange={handleChange}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fecha_esperada">Fecha Esperada de Recepción</Label>
            <Input
              id="fecha_esperada"
              name="fecha_esperada"
              type="date"
              value={formData.fecha_esperada}
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
          placeholder="Información adicional sobre la entrada..."
          rows={3}
          disabled={isLoading}
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <TablaProductosEntrada
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
            ) : "Guardar Entrada"}
          </Button>
        </div>
      </div>
    </form>
  )
}
