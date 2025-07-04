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

interface OrdenCompra {
  id: number
  supplier_id: number
  branch_id: number
  expected_date: string | null
  notes: string | null
  status: string
  total: number
  created_at: string
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
  const [ordenesCompra, setOrdenesCompra] = useState<OrdenCompra[]>([])
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<string>('ninguno')
  const [tiposEntrada, setTiposEntrada] = useState(['compra', 'devolucion', 'ajuste'])
  const [productos, setProductos] = useState<ProductoEntrada[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [cargandoLineas, setCargandoLineas] = useState(false)
  const { toast } = useToast()

  const [formData, setFormData] = useState({
    tipo_entrada: 'compra',
    proveedor_id: '',
    sucursal_id: '',
    referencia: '',
    fecha_orden: formatDate(new Date().toISOString(), 'yyyy-MM-dd'),
    fecha_esperada: '',
    notas: '',
    orden_compra_id: 'ninguno'
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
    
    const cargarOrdenesCompra = async () => {
      try {
        const { data, error } = await supabase
          .from('purchase_orders')
          .select('id, supplier_id, branch_id, expected_date, notes, status, total, created_at')
          .eq('organization_id', organizationId)
          .in('status', ['draft', 'pending'])
          .order('created_at', { ascending: false })
          
        if (error) throw error
        setOrdenesCompra(data || [])
      } catch (error) {
        console.error('Error al cargar órdenes de compra:', error)
      }
    }

    setIsLoading(true)
    Promise.all([cargarProveedores(), cargarSucursales(), cargarOrdenesCompra()])
      .finally(() => setIsLoading(false))
  }, [organizationId])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }))
    
    // Si se seleccionó una orden de compra, cargar sus datos
    if (name === 'orden_compra_id' && value) {
      cargarDatosOrden(value)
    }
  }
  
  const cargarDatosOrden = async (ordenId: string) => {
    setCargandoLineas(true)
    try {
      // Encontrar la orden seleccionada
      const orden = ordenesCompra.find(o => o.id.toString() === ordenId)
      if (!orden) throw new Error('Orden no encontrada')
      
      // Actualizar el formulario con los datos de la orden
      setFormData(prev => ({
        ...prev,
        tipo_entrada: 'compra',
        proveedor_id: orden.supplier_id.toString(),
        sucursal_id: orden.branch_id.toString(),
        fecha_esperada: orden.expected_date || '',
        notas: orden.notes || '',
      }))
      
      // Cargar las líneas de la orden
      const { data: lineas, error: errorLineas } = await supabase
        .from('po_items')
        .select(`
          id,
          product_id,
          quantity,
          unit_cost,
          lot_code,
          status,
          products:product_id(name, sku)
        `)
        .eq('purchase_order_id', ordenId)
        
      if (errorLineas) throw errorLineas
      
      // Transformar las líneas al formato de ProductoEntrada
      if (lineas && lineas.length > 0) {
        const productosDeOrden = lineas.map((linea, index) => ({
          id: index,
          product_id: linea.product_id,
          nombre: linea.products.name,
          sku: linea.products.sku,
          cantidad: Number(linea.quantity),
          costo_unitario: Number(linea.unit_cost),
          subtotal: Number(linea.quantity) * Number(linea.unit_cost),
          lote: linea.lot_code || '',
          fecha_vencimiento: ''
        }))
        
        setProductos(productosDeOrden)
      }
      
      toast({
        title: "Líneas de orden cargadas",
        description: "Las líneas de la orden de compra se han cargado exitosamente.",
      })
      
    } catch (error) {
      console.error('Error al cargar líneas de la orden:', error)
      toast({
        title: "Error",
        description: "No se pudieron cargar las líneas de la orden de compra.",
        variant: "destructive"
      })
    } finally {
      setCargandoLineas(false)
    }
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
      let ordenId: number | null = null;
      
      // Determinar si estamos usando una orden existente o creando una nueva
      if (formData.tipo_entrada === 'compra' && formData.orden_compra_id !== 'ninguno') {
        // Estamos procesando una orden existente
        ordenId = Number(formData.orden_compra_id);
        
        // Actualizar la orden existente
        const { error: updateOrdenError } = await supabase
          .from('purchase_orders')
          .update({
            updated_at: new Date().toISOString(),
            notes: formData.notas ? formData.notas : null,
          })
          .eq('id', ordenId);
          
        if (updateOrdenError) throw updateOrdenError;
      } else {
        // Crear nueva orden/documento de entrada
        // Determinar estados según el tipo de entrada
        const estadoOrdenCompra = formData.tipo_entrada === 'compra' ? 'pending' : 'completed';
        const estadoItems = formData.tipo_entrada === 'compra' ? 'pending' : 'received';

        // Crear la orden de compra (o documento de entrada)
        const { data: ordenData, error: ordenError } = await supabase
          .from('purchase_orders')
          .insert({
            organization_id: organizationId,
            branch_id: Number(formData.sucursal_id),
            supplier_id: formData.tipo_entrada === 'compra' 
              ? Number(formData.proveedor_id)
              : 1, // Usar ID 1 como proveedor por defecto para cumplir con NOT NULL
            notes: formData.referencia 
              ? `Referencia: ${formData.referencia}\n${formData.notas || ''}` 
              : formData.notas,
            status: estadoOrdenCompra,
            total: calcularTotal(),
            created_at: formData.fecha_orden,
            updated_at: new Date().toISOString(),
            expected_date: formData.fecha_esperada || null
          })
          .select('id')
          .single();

        if (ordenError) throw ordenError;
        ordenId = ordenData.id;
        
        // Crear los ítems de la orden (solo para nuevas órdenes)
        const itemsParaInsertar = productos.map(producto => ({
          purchase_order_id: ordenId,
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
      }

      // Crear un mapa para almacenar los IDs de los lotes creados
      const lotesCreados = new Map<string, number>();

      // Crear lotes si es necesario
      for (const producto of productos) {
        if (producto.lote) {
          const { data: loteData, error: loteError } = await supabase
            .from('lots')
            .insert({
              organization_id: organizationId,
              product_id: producto.product_id,
              branch_id: Number(formData.sucursal_id),
              lot_code: producto.lote,
              expiration_date: producto.fecha_vencimiento || null,
              created_at: new Date().toISOString()
            })
            .select('id')
            .single();

          if (loteError) throw loteError;
          
          // Guardar el ID del lote en el mapa
          lotesCreados.set(producto.product_id.toString() + '-' + producto.lote, loteData.id);
        }
      }
      
      // Si estamos procesando una orden existente, actualizar el estado de los ítems a recibidos
      if (formData.tipo_entrada === 'compra' && formData.orden_compra_id !== 'ninguno') {
        // Obtener los ítems actuales de la orden
        const { data: itemsActuales, error: itemsQueryError } = await supabase
          .from('po_items')
          .select('id, product_id, quantity, received_qty')
          .eq('purchase_order_id', ordenId || 0);
          
        if (itemsQueryError) throw itemsQueryError;
        
        // Crear un mapa de productos recibidos en esta entrada
        const productosRecibidos = new Map<number, number>();
        productos.forEach(p => {
          productosRecibidos.set(p.product_id, p.cantidad);
        });
        
        // Actualizar cada ítem con la cantidad recibida
        for (const item of itemsActuales) {
          if (productosRecibidos.has(item.product_id)) {
            const cantidadRecibida = productosRecibidos.get(item.product_id) || 0;
            const totalRecibido = (Number(item.received_qty) || 0) + cantidadRecibida;
            const estado = totalRecibido >= Number(item.quantity) ? 'received' : 'partial';
            
            await supabase
              .from('po_items')
              .update({
                received_qty: totalRecibido,
                status: estado,
                updated_at: new Date().toISOString()
              })
              .eq('id', item.id);
          }
        }
        
        // Verificar si todos los ítems están recibidos para actualizar el estado de la orden
        const { data: itemsEstado } = await supabase
          .from('po_items')
          .select('status')
          .eq('purchase_order_id', ordenId || 0);
          
        const todoRecibido = itemsEstado && itemsEstado.length > 0 && 
          itemsEstado.every(item => item.status === 'received');
        if (todoRecibido) {
          await supabase
            .from('purchase_orders')
            .update({ status: 'completed', updated_at: new Date().toISOString() })
            .eq('id', ordenId || 0);
        }
      }
      
      // Si es un ajuste o una recepción de compra, crear los movimientos de stock
      if (formData.tipo_entrada === 'ajuste' || formData.tipo_entrada === 'compra') {
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
            source_id: ordenId ? ordenId.toString() : '0',
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
        notas: '',
        orden_compra_id: 'ninguno'
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
            <>
              <div className="space-y-2">
                <Label htmlFor="orden_compra_id">Orden de Compra (opcional)</Label>
                <Select 
                  value={formData.orden_compra_id} 
                  onValueChange={(value) => handleSelectChange('orden_compra_id', value)}
                  disabled={isLoading || ordenesCompra.length === 0 || cargandoLineas}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una orden de compra" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ninguno">Ninguna (entrada manual)</SelectItem>
                    {ordenesCompra.map(orden => (
                      <SelectItem key={orden.id} value={orden.id.toString()}>
                        #{orden.id} - {formatDate(orden.created_at, 'dd/MM/yyyy')} - ${orden.total.toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cargandoLineas && (
                  <div className="flex items-center justify-center py-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-t-2 border-blue-600 mr-2"></div>
                    <span className="text-xs">Cargando líneas...</span>
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="proveedor_id">Proveedor</Label>
                <Select 
                  value={formData.proveedor_id} 
                  onValueChange={(value) => handleSelectChange('proveedor_id', value)}
                  disabled={isLoading || proveedores.length === 0 || (formData.orden_compra_id !== 'ninguno')}
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
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="sucursal_id">Sucursal</Label>
            <Select 
              value={formData.sucursal_id} 
              onValueChange={(value) => handleSelectChange('sucursal_id', value)}
              disabled={isLoading || sucursales.length === 0 || (formData.tipo_entrada === 'compra' && formData.orden_compra_id !== 'ninguno')}
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
