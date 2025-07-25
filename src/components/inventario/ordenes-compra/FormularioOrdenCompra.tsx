'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { 
  OrdenCompraFormData, 
  ItemOrdenCompraFormData
} from './types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { 
  AlertCircle,
  Plus, 
  Trash2, 
  Save,
  ArrowLeft
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatCurrency } from '@/utils/Utils';

interface FormularioOrdenCompraProps {
  readonly ordenId?: number;
  readonly esEdicion?: boolean;
}

export function FormularioOrdenCompra({ ordenId, esEdicion = false }: FormularioOrdenCompraProps) {
  const [formData, setFormData] = useState<OrdenCompraFormData>({
    branch_id: 0,
    supplier_id: 0,
    expected_date: null,
    notes: null,
    items: []
  });
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [proveedores, setProveedores] = useState<{ id: number; name: string }[]>([]);
  const [sucursales, setSucursales] = useState<{ id: number; name: string }[]>([]);
  const [productos, setProductos] = useState<{ id: number; name: string; sku: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  const router = useRouter();
  const { organization } = useOrganization();
  
  // Cargar datos iniciales
  useEffect(() => {
    if (organization?.id) {
      setIsLoading(true);
      Promise.all([
        cargarProveedores(),
        cargarSucursales(),
        cargarProductos()
      ])
      .then(() => {
        // Si es modo edición, cargar datos de la orden
        if (esEdicion && ordenId) {
          cargarDatosOrden(ordenId);
        } else {
          // Para nueva orden, establecer sucursal predeterminada
          if (organization.branch_id) {
            setFormData(prev => ({
              ...prev,
              branch_id: organization.branch_id
            }));
          }
          setIsLoading(false);
        }
      })
      .catch(err => {
        console.error('Error al cargar datos iniciales:', err);
        setError('Error al cargar datos iniciales');
        setIsLoading(false);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id, esEdicion, ordenId]);

  // Cargar proveedores
  const cargarProveedores = async () => {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, name')
        .eq('organization_id', organization?.id)
        .order('name');
        
      if (error) throw error;
      setProveedores(data || []);
    } catch (err) {
      console.error('Error al cargar proveedores:', err);
      throw err;
    }
  };
  
  // Cargar sucursales
  const cargarSucursales = async () => {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .eq('organization_id', organization?.id)
        .eq('is_active', true)
        .order('name');
        
      if (error) throw error;
      setSucursales(data || []);
    } catch (err) {
      console.error('Error al cargar sucursales:', err);
      throw err;
    }
  };
  
  // Cargar productos
  const cargarProductos = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku')
        .eq('organization_id', organization?.id)
        // No filtramos por is_active ya que no existe este campo en la tabla products
        .order('name');
        
      if (error) throw error;
      setProductos(data || []);
    } catch (err) {
      console.error('Error al cargar productos:', err);
      throw err;
    }
  };
  
  // Cargar datos de la orden para edición
  const cargarDatosOrden = async (id: number) => {
    try {
      // Cargar datos de la orden
      const { data: ordenData, error: ordenError } = await supabase
        .from('purchase_orders')
        .select('branch_id, supplier_id, expected_date, notes, total, status')
        .eq('id', id)
        .single();
        
      if (ordenError) throw ordenError;
      
      if (!ordenData) {
        throw new Error('No se encontró la orden de compra');
      }
      
      // Cargar items de la orden
      const { data: itemsData, error: itemsError } = await supabase
        .from('po_items')
        .select(`
          id, product_id, quantity, unit_cost, status,
          products(id, name, sku)
        `)
        .eq('purchase_order_id', id);
      
      if (itemsError) throw itemsError;
      
      // Formatear items para el formulario
      const items: ItemOrdenCompraFormData[] = itemsData?.map(item => {
        // Aseguramos que products sea tratado como un objeto con tipos correctos
        const producto = item.products as unknown as { id: number, name: string, sku: string };
        return {
          product_id: item.product_id,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          product_name: producto.name,
          product_sku: producto.sku,
          subtotal: item.quantity * item.unit_cost
        };
      }) || [];
      
      // Actualizar estado del formulario
      setFormData({
        branch_id: ordenData.branch_id,
        supplier_id: ordenData.supplier_id,
        expected_date: ordenData.expected_date,
        notes: ordenData.notes,
        items: items
      });
    } catch (err: unknown) {
      console.error('Error al cargar datos de la orden:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar datos de la orden');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Manejar cambios en el formulario
  const handleInputChange = (field: keyof Omit<OrdenCompraFormData, 'items'>, value: string | number | Date | null) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };
  
  // Manejar cambios en los items
  const handleItemChange = (index: number, field: keyof ItemOrdenCompraFormData, value: string | number) => {
    setFormData(prev => {
      const newItems = [...prev.items];
      newItems[index] = {
        ...newItems[index],
        [field]: value
      };
      
      // Recalcular subtotal si cambia cantidad o costo
      if (field === 'quantity' || field === 'unit_cost') {
        const quantity = Number(field === 'quantity' ? value : newItems[index].quantity || 0);
        const unitCost = Number(field === 'unit_cost' ? value : newItems[index].unit_cost || 0);
        newItems[index].subtotal = quantity * unitCost;
      }
      
      // Si cambia el producto, actualizar nombre y sku
      if (field === 'product_id') {
        const producto = productos.find(p => p.id === value);
        if (producto) {
          newItems[index].product_name = producto.name;
          newItems[index].product_sku = producto.sku;
        }
      }
      
      return { ...prev, items: newItems };
    });
  };
  
  // Agregar un nuevo item
  const agregarItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          product_id: 0,
          quantity: 1,
          unit_cost: 0,
          subtotal: 0
        }
      ]
    }));
  };
  
  // Eliminar un item
  const eliminarItem = (index: number) => {
    setFormData(prev => {
      const newItems = [...prev.items];
      newItems.splice(index, 1);
      return { ...prev, items: newItems };
    });
  };
  
  // Calcular total de la orden
  const calcularTotal = (): number => {
    return formData.items.reduce((total, item) => total + (item.subtotal || 0), 0);
  };
  
  // Renderizar input para cantidades numéricas
  // Siguiendo regla UX: Al hacer focus, el valor 0 debe desaparecer
  const renderQuantityInput = (item: ItemOrdenCompraFormData, index: number) => {
    return (
      <Input
        type="number"
        value={item.quantity}
        min={1}
        onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value) || 0)}
        onFocus={(e) => {
          if (e.target.value === '0') e.target.value = '';
        }}
        onBlur={(e) => {
          if (e.target.value === '') handleItemChange(index, 'quantity', 0);
        }}
        className="w-24"
      />
    );
  };
  
  // Renderizar input para precio unitario
  // Siguiendo regla UX: Al hacer focus, el valor 0 debe desaparecer
  const renderUnitCostInput = (item: ItemOrdenCompraFormData, index: number) => {
    return (
      <Input
        type="number"
        value={item.unit_cost}
        min={0}
        step={0.01}
        onChange={(e) => handleItemChange(index, 'unit_cost', parseFloat(e.target.value) || 0)}
        onFocus={(e) => {
          if (e.target.value === '0') e.target.value = '';
        }}
        onBlur={(e) => {
          if (e.target.value === '') handleItemChange(index, 'unit_cost', 0);
        }}
        className="w-24"
      />
    );
  };
  
  // Validar formulario
  const validarFormulario = () => {
    if (!formData.supplier_id) {
      setError('Debe seleccionar un proveedor');
      return false;
    }
    
    if (!formData.branch_id) {
      setError('Debe seleccionar una sucursal');
      return false;
    }
    
    if (formData.items.length === 0) {
      setError('Debe agregar al menos un producto');
      return false;
    }
    
    for (let i = 0; i < formData.items.length; i++) {
      const item = formData.items[i];
      if (!item.product_id) {
        setError(`Debe seleccionar un producto en el ítem ${i + 1}`);
        return false;
      }
      
      if (!item.quantity || item.quantity <= 0) {
        setError(`La cantidad debe ser mayor a 0 en el ítem ${i + 1}`);
        return false;
      }
      
      if (!item.unit_cost || item.unit_cost < 0) {
        setError(`El costo unitario debe ser mayor o igual a 0 en el ítem ${i + 1}`);
        return false;
      }
    }
    
    return true;
  };
  
  // Guardar orden de compra
  const guardarOrden = async () => {
    setError(null);
    setSuccessMessage(null);
    
    if (!validarFormulario()) {
      return;
    }
    
    setIsSaving(true);
    
    try {
      // Datos para insertar/actualizar
      const ordenData = {
        organization_id: organization?.id,
        branch_id: formData.branch_id,
        supplier_id: formData.supplier_id,
        status: 'draft', // Siempre se guarda como borrador
        total: calcularTotal(),
        expected_date: formData.expected_date,
        notes: formData.notes,
        updated_at: new Date().toISOString(),
        created_by: localStorage.getItem('userId') || null
      };
      
      // Usamos el ordenId que se pasa como prop al componente
      let idOrdenActual = ordenId;
      
      // Si es edición y tenemos un ID válido, actualizar orden existente
      if (esEdicion && idOrdenActual) {
        const { error: updateError } = await supabase
          .from('purchase_orders')
          .update(ordenData)
          .eq('id', idOrdenActual);
          
        if (updateError) throw updateError;
      } else {
        // Crear nueva orden
        const { data: nuevaOrden, error: createError } = await supabase
          .from('purchase_orders')
          .insert({
            ...ordenData,
            created_at: new Date().toISOString()
          })
          .select('id')
          .single();
          
        if (createError) throw createError;
        // Guardamos la referencia al ID de la nueva orden para redireccionar
        idOrdenActual = nuevaOrden.id;
      }
      
      // Manejar items
      if (esEdicion) {
        // En edición, eliminar items antiguos y crear nuevos
        const { error: deleteError } = await supabase
          .from('po_items')
          .delete()
          .eq('purchase_order_id', idOrdenActual);
          
        if (deleteError) throw deleteError;
      }
      
      // Crear nuevos items
      const itemsData = formData.items.map(item => ({
        purchase_order_id: idOrdenActual,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        status: 'pending'
      }));
      
      const { error: itemsError } = await supabase
        .from('po_items')
        .insert(itemsData);
        
      if (itemsError) throw itemsError;
      
      // Mostrar mensaje de éxito y redireccionar
      setSuccessMessage(esEdicion 
        ? 'Orden de compra actualizada correctamente' 
        : 'Orden de compra creada correctamente'
      );
      
      // Redireccionar después de un breve delay
      setTimeout(() => {
        router.push(`/app/inventario/ordenes-compra/${idOrdenActual}`);
      }, 1500);
      
    } catch (err: unknown) {
      console.error('Error al guardar orden de compra:', err);
      setError(err instanceof Error ? err.message : 'Error al guardar orden de compra');
    } finally {
      setIsSaving(false);
    }
  };



  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {successMessage && (
        <Alert variant="success" className="bg-green-50 dark:bg-green-900 border-green-500 text-green-700 dark:text-green-200">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Éxito</AlertTitle>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}
      
      {isLoading ? (
        <div className="flex justify-center items-center py-10">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          {/* Datos generales de la orden */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Información General</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <span className="text-sm font-medium">Proveedor</span>
                  <Select 
                    value={formData.supplier_id ? formData.supplier_id.toString() : ''} 
                    onValueChange={value => handleInputChange('supplier_id', parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione un proveedor" />
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
                
                <div className="space-y-2">
                  <span className="text-sm font-medium">Sucursal</span>
                  <Select 
                    value={formData.branch_id ? formData.branch_id.toString() : ''} 
                    onValueChange={value => handleInputChange('branch_id', parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione una sucursal" />
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
                
                <div className="space-y-2">
                  <span className="text-sm font-medium">Fecha Esperada</span>
                  <DatePicker 
                    date={formData.expected_date ? new Date(formData.expected_date) : undefined} 
                    onSelect={(date) => handleInputChange('expected_date', date ? date.toISOString() : null)}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <span className="text-sm font-medium">Notas</span>
                <Textarea 
                  placeholder="Escriba notas o instrucciones adicionales..." 
                  value={formData.notes || ''} 
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
          
          {/* Productos/Items */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Productos</CardTitle>
              <Button onClick={agregarItem} variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Agregar Producto
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="w-[150px] text-right">Cantidad</TableHead>
                      <TableHead className="w-[150px] text-right">Costo Unitario</TableHead>
                      <TableHead className="w-[150px] text-right">Subtotal</TableHead>
                      <TableHead className="w-[80px] text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formData.items.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                          No hay productos en la orden. Haga clic en &quot;Agregar Producto&quot; para comenzar.
                        </TableCell>
                      </TableRow>
                    )}
                    
                    {formData.items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="align-middle">
                          <Select 
                            value={item.product_id ? item.product_id.toString() : ''} 
                            onValueChange={value => handleItemChange(index, 'product_id', parseInt(value))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccione un producto" />
                            </SelectTrigger>
                            <SelectContent className="max-h-60 overflow-y-auto">
                              {productos.map(producto => (
                                <SelectItem key={producto.id} value={producto.id.toString()}>
                                  {producto.name} ({producto.sku})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {item.product_sku && (
                            <div className="text-xs text-muted-foreground mt-1">
                              SKU: {item.product_sku}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right align-middle">
                          {renderQuantityInput(item, index)}
                        </TableCell>
                        <TableCell className="text-right align-middle">
                          {renderUnitCostInput(item, index)}
                        </TableCell>
                        <TableCell className="text-right font-medium align-middle">
                          {formatCurrency(item.subtotal || 0)}
                        </TableCell>
                        <TableCell className="text-right align-middle">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => eliminarItem(index)}
                            title="Eliminar producto"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between border-t p-4">
              <div className="text-lg font-bold">
                Total: {formatCurrency(calcularTotal())}
              </div>
            </CardFooter>
          </Card>
          
          {/* Botones de acción */}
          <div className="flex justify-between">
            <Button 
              variant="outline" 
              onClick={() => router.push('/app/inventario/ordenes-compra')}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Volver
            </Button>
            
            <div className="flex space-x-2">
              <Button 
                variant="default" 
                onClick={guardarOrden} 
                disabled={isSaving}
              >
                {isSaving ? (
                  <Spinner className="h-4 w-4 mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                {esEdicion ? 'Actualizar' : 'Guardar'} Orden
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
