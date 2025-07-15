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
  // Definir el tipo de movimientos de stock
  type StockMovementSource = 'purchase' | 'adjustment' | 'return'
  
  // Handlers para implementar la regla UX de inputs numéricos
  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value === '0') {
      e.target.value = '';
    }
  };
  
  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value === '') {
      e.target.value = '0';
    }
  };
  const tiposEntrada = ['compra', 'devolucion', 'ajuste']
  const [productos, setProductos] = useState<ProductoEntrada[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errorCargaSucursales, setErrorCargaSucursales] = useState(false)
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
        setErrorCargaSucursales(false);
        const { data, error } = await supabase
          .from('branches')
          .select('id, name')
          .eq('organization_id', organizationId)
          .order('name')

        if (error) throw error
        
        const sucursalesDisponibles = data || [];
        setSucursales(sucursalesDisponibles)
        
        // Si no hay sucursales disponibles, mostrar un mensaje de error
        if (sucursalesDisponibles.length === 0) {
          toast({
            title: "Advertencia",
            description: "No hay sucursales disponibles. Debe crear al menos una sucursal para registrar entradas.",
            variant: "destructive"
          });
          setErrorCargaSucursales(true);
        }
      } catch (error) {
        console.error('Error al cargar sucursales:', error)
        setErrorCargaSucursales(true);
        toast({
          title: "Error",
          description: "No se pudieron cargar las sucursales. Por favor intente nuevamente.",
          variant: "destructive"
        });
      }
    }
    
    const cargarOrdenesCompra = async () => {
      try {
        const { data, error } = await supabase
          .from('purchase_orders')
          .select('id, supplier_id, branch_id, expected_date, notes, status, total, created_at')
          .eq('organization_id', organizationId)
          .in('status', ['draft', 'sent'])
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
  }, [organizationId, toast])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }))
    
    if (name === 'orden_compra_id' && value !== 'ninguno') {
      cargarDatosOrden(value)
    } else if (name === 'orden_compra_id' && value === 'ninguno') {
      // Resetear datos vinculados a la orden
      setFormData(prev => ({
        ...prev,
        proveedor_id: '',
        sucursal_id: '',
        fecha_esperada: '',
        notas: ''
      }))
      setProductos([])
    }
  }

  const cargarDatosOrden = async (ordenId: string) => {
    setCargandoLineas(true)
    
    try {
      // Cargar datos de la orden
      const { data: ordenData, error: ordenError } = await supabase
        .from('purchase_orders')
        .select('supplier_id, branch_id, expected_date, notes')
        .eq('id', ordenId)
        .single()
        
      if (ordenError) throw ordenError
      
      if (ordenData) {
        setFormData(prev => ({
          ...prev,
          proveedor_id: ordenData.supplier_id?.toString() || '',
          sucursal_id: ordenData.branch_id?.toString() || '',
          fecha_esperada: ordenData.expected_date || '',
          notas: ordenData.notes || ''
        }))
      }
      
      // Cargar líneas de la orden
      const { data: itemsData, error: itemsError } = await supabase
        .from('po_items')
        .select(`
          id, product_id, quantity, unit_cost, lot_code,
          products(id, name, sku)
        `)
        .eq('purchase_order_id', ordenId)
      
      if (itemsError) throw itemsError
      
      if (itemsData) {
        // Definir el tipo del producto para evitar any
        interface ProductItem {
          id: number;
          name: string;
          sku: string;
        }
        
        const productosFormateados = itemsData.map(item => {
          // Aplicar tipo explícito para evitar any
          const producto = item.products as unknown as ProductItem;
          
          return {
            id: item.id,
            product_id: item.product_id,
            nombre: producto.name,
            sku: producto.sku,
            cantidad: Number(item.quantity),
            costo_unitario: Number(item.unit_cost),
            subtotal: Number(item.quantity) * Number(item.unit_cost),
            lote: item.lot_code || ''
          }
        })
        
        setProductos(productosFormateados)
      }
      
    } catch (error) {
      console.error('Error al cargar datos de la orden:', error)
      toast({
        title: "Error",
        description: "No se pudieron cargar los datos de la orden seleccionada.",
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

  const handleUpdateProducto = (index: number, productoActualizado: ProductoEntrada) => {
    setProductos(prev => {
      const nuevosProductos = [...prev];
      nuevosProductos[index] = {
        ...productoActualizado,
        // Recalcular subtotal para asegurar consistencia
        subtotal: productoActualizado.cantidad * productoActualizado.costo_unitario
      };
      return nuevosProductos;
    });
  }
  
  // Implementación de la regla UX para inputs numéricos se hace directamente en los campos Input

  const calcularTotal = () => {
    return productos.reduce((total, producto) => total + producto.subtotal, 0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Verificar si hay sucursales disponibles
    if (sucursales.length === 0 || errorCargaSucursales) {
      toast({
        title: "Error",
        description: "No hay sucursales disponibles. Debe crear al menos una sucursal para registrar entradas.",
        variant: "destructive"
      })
      return
    }
    
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
        // Determinar estados según el tipo de entrada (usando valores permitidos por la restricción CHECK)
        // purchase_orders permite: 'draft', 'sent', 'partial', 'received', 'closed', 'cancelled'
        // po_items permite: 'pending', 'partial', 'received'
        const estadoOrdenCompra = formData.tipo_entrada === 'compra' ? 'draft' : 'received';
        const estadoItems = formData.tipo_entrada === 'compra' ? 'pending' : 'received';

        // Validar que exista una sucursal seleccionada
        if (!formData.sucursal_id) {
          toast({
            title: "Error",
            description: "Debe seleccionar una sucursal para la entrada.",
            variant: "destructive"
          });
          setIsSaving(false);
          return;
        }
        
        // Verificar que la sucursal exista en la lista de sucursales
        const sucursalExiste = sucursales.some(s => s.id.toString() === formData.sucursal_id);
        if (!sucursalExiste) {
          toast({
            title: "Error",
            description: "La sucursal seleccionada no es válida. Por favor seleccione otra.",
            variant: "destructive"
          });
          setIsSaving(false);
          return;
        }
        
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
          // Para po_items solo se permite: 'pending', 'partial', 'received'
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
              // Removido organization_id ya que no existe en la tabla lots
              product_id: producto.product_id,
              // Removido branch_id ya que no existe en la tabla lots
              lot_code: producto.lote,
              // Removido expiry_date ya que puede no existir en la tabla
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
          .select('id, product_id, quantity')
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
            // Como no existe received_qty, usamos un campo de control en el estado
            const estado = cantidadRecibida >= Number(item.quantity) ? 'received' : 'partial';
            
            await supabase
              .from('po_items')
              .update({
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
            .update({ status: 'received', updated_at: new Date().toISOString() })
            .eq('id', ordenId || 0);
        }
      }
      
      // Si es un ajuste o una recepción de compra, crear los movimientos de stock
      if (formData.tipo_entrada === 'ajuste' || formData.tipo_entrada === 'compra') {
        // Validar que exista una sucursal seleccionada para los movimientos de stock
        if (!formData.sucursal_id) {
          toast({
            title: "Error",
            description: "Debe seleccionar una sucursal para registrar movimientos de inventario.",
            variant: "destructive"
          });
          setIsSaving(false);
          return;
        }
        
        // Verificar que la sucursal exista en la lista de sucursales
        const sucursalExiste = sucursales.some(s => s.id.toString() === formData.sucursal_id);
        if (!sucursalExiste) {
          toast({
            title: "Error",
            description: "La sucursal seleccionada no es válida. Por favor seleccione otra.",
            variant: "destructive"
          });
          setIsSaving(false);
          return;
        }

        // Definir un tipo específico para los movimientos de stock
        interface StockMovementInsert {
          organization_id: number; // Agregado para cumplir con la política RLS
          branch_id: number;
          product_id: number;
          lot_id: number | null;
          direction: 'in' | 'out';
          qty: number;
          unit_cost: number;
          source: StockMovementSource;
          source_id: string;
          note: string;
          created_at: string;
        }

        // Crear movimientos de stock con el tipo específico
        const movimientosStock: StockMovementInsert[] = productos.map(producto => {
          // Obtener el ID del lote si existe
          const lotId = producto.lote ? 
            lotesCreados.get(producto.product_id.toString() + '-' + producto.lote) || null : 
            null;
          
          return {
            organization_id: organizationId, // Agregado para cumplir con la política RLS
            branch_id: Number(formData.sucursal_id),
            product_id: producto.product_id,
            lot_id: lotId,
            direction: 'in', // Entrada de inventario
            qty: producto.cantidad,
            unit_cost: producto.costo_unitario,
            source: (formData.tipo_entrada === 'compra' ? 'purchase' : 
                   formData.tipo_entrada === 'ajuste' ? 'adjustment' : 
                   formData.tipo_entrada === 'devolucion' ? 'return' : 'adjustment') as StockMovementSource,
            source_id: ordenId ? ordenId.toString() : '0',
            note: formData.notas || `Entrada por ${formData.tipo_entrada}`,
            created_at: new Date().toISOString()
          };
        });
        
        // Insertar los movimientos de stock
        const { error: movimientosError } = await supabase
          .from('stock_movements')
          .insert(movimientosStock);
        
        if (movimientosError) {
          console.error('Error en inserción de stock_movements:', movimientosError);
          toast({
            title: "Error en movimientos de stock",
            description: `${movimientosError.message}. Verifique que tiene permisos para esta operación.`,
            variant: "destructive"
          });
          throw movimientosError;
        }
      }

      toast({
        title: "Éxito",
        description: "La entrada de inventario se ha creado correctamente.",
        variant: "default"
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
    } catch (error) {
      // Tipificar el error para acceder a sus propiedades
      const supabaseError = error as { message?: string; code?: string };
      console.error('Error al guardar la entrada:', error);
      // Mostrar detalles más específicos del error
      let errorMessage = "No se pudo guardar la entrada de inventario.";
      
      // Si es un error de Supabase con detalles
      if (supabaseError && supabaseError.message) {
        if (supabaseError.code === '42501') {
          errorMessage = `Error de permisos: ${supabaseError.message}. Verifique que esté usando la organización correcta.`;
        } else {
          errorMessage = `${supabaseError.message}`;
        }
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      setIsSaving(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Banner de advertencia cuando no hay sucursales disponibles */}
      {(sucursales.length === 0 || errorCargaSucursales) && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4" role="alert">
          <div className="flex items-center">
            <svg className="w-6 h-6 mr-2" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
            </svg>
            <div>
              <p className="font-bold">No hay sucursales disponibles</p>
              <p className="text-sm">Debe crear al menos una sucursal para registrar entradas de inventario.</p>
            </div>
          </div>
        </div>
      )}
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
                {tiposEntrada.map(tipo => (
                  <SelectItem key={tipo} value={tipo}>
                    {tipo.charAt(0).toUpperCase() + tipo.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {formData.tipo_entrada === 'compra' && (
            <div className="space-y-2">
              <Label htmlFor="orden_compra_id">Orden de Compra</Label>
              <Select 
                value={formData.orden_compra_id} 
                onValueChange={(value) => handleSelectChange('orden_compra_id', value)}
                disabled={isLoading || ordenesCompra.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una orden existente o crea una nueva" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguno">-- Nueva Orden --</SelectItem>
                  {ordenesCompra.map((orden: OrdenCompra) => (
                    <SelectItem key={orden.id} value={orden.id.toString()}>
                      {`OC-${orden.id} (${formatDate(orden.created_at)})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          {(formData.tipo_entrada === 'compra' && formData.orden_compra_id === 'ninguno') && (
            <>
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
              type="text"
              pattern="[0-9]*"
              inputMode="numeric"
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
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
          <Button 
            type="submit" 
            disabled={isSaving || isLoading || sucursales.length === 0 || errorCargaSucursales} 
          >
            {isSaving ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Guardando...
              </>
            ) : (sucursales.length === 0 || errorCargaSucursales) ? "No hay sucursales disponibles" : "Guardar Entrada"}
          </Button>
        </div>
      </div>
    </form>
  );
}
