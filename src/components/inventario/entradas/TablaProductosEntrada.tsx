'use client'

import { useState, useEffect } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabase/config'
import { AlertCircle, Plus, Trash } from 'lucide-react'

interface Producto {
  id: number
  name: string
  sku: string
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

interface TablaProductosEntradaProps {
  productos: ProductoEntrada[]
  onAddProducto: (producto: ProductoEntrada) => void
  onRemoveProducto: (index: number) => void
  onUpdateProducto: (index: number, producto: ProductoEntrada) => void
  organizationId: number
}

export default function TablaProductosEntrada({
  productos,
  onAddProducto,
  onRemoveProducto,
  onUpdateProducto,
  organizationId
}: TablaProductosEntradaProps) {
  const [productosDisponibles, setProductosDisponibles] = useState<Producto[]>([])
  const [isLoading, setIsLoading] = useState(false)
  
  // Estado del nuevo producto a agregar
  const [nuevoProducto, setNuevoProducto] = useState({
    product_id: '',
    cantidad: 0,
    costo_unitario: 0,
    lote: '',
    fecha_vencimiento: ''
  })

  // Cargar productos disponibles
  useEffect(() => {
    const cargarProductos = async () => {
      setIsLoading(true)
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id, name, sku')
          .eq('organization_id', organizationId)
          .eq('status', 'active')
          .order('name')
        
        if (error) throw error
        setProductosDisponibles(data || [])
      } catch (error) {
        console.error('Error al cargar productos:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    cargarProductos()
  }, [organizationId])
  
  // Manejar cambio en campos del nuevo producto
  const handleNuevoProductoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setNuevoProducto(prev => ({
      ...prev,
      [name]: name === 'cantidad' || name === 'costo_unitario' 
        ? parseFloat(value) || 0
        : value
    }))
  }

  // Manejar foco en campos numéricos (borramos el 0 al recibir foco)
  const handleNumberFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value === '0') {
      e.target.value = ''
    }
  }

  // Manejar pérdida de foco en campos numéricos (volvemos a 0 si está vacío)
  const handleNumberBlur = (e: React.FocusEvent<HTMLInputElement>, name: string) => {
    if (e.target.value === '') {
      setNuevoProducto(prev => ({
        ...prev,
        [name]: 0
      }))
    }
  }

  // Manejar foco y blur para los productos existentes (en la tabla)
  const handleExistingNumberFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value === '0') {
      e.target.value = ''
    }
  }

  const handleExistingNumberBlur = (e: React.FocusEvent<HTMLInputElement>, index: number, name: string) => {
    if (e.target.value === '') {
      const updatedProducto = { ...productos[index], [name]: 0 }
      // Recalcular subtotal
      if (name === 'cantidad' || name === 'costo_unitario') {
        updatedProducto.subtotal = updatedProducto.cantidad * updatedProducto.costo_unitario
      }
      onUpdateProducto(index, updatedProducto)
    }
  }

  // Manejar selección de producto
  const handleProductSelect = (productId: string) => {
    setNuevoProducto(prev => ({
      ...prev,
      product_id: productId
    }))
  }
  
  // Agregar un nuevo producto a la lista
  const handleAgregarProducto = () => {
    const productoSeleccionado = productosDisponibles.find(p => p.id.toString() === nuevoProducto.product_id)
    
    if (!productoSeleccionado) return
    
    // Crear el objeto producto para agregar
    const productoParaAgregar: ProductoEntrada = {
      id: Date.now(), // ID temporal para la UI
      product_id: productoSeleccionado.id,
      nombre: productoSeleccionado.name,
      sku: productoSeleccionado.sku,
      cantidad: nuevoProducto.cantidad,
      costo_unitario: nuevoProducto.costo_unitario,
      subtotal: nuevoProducto.cantidad * nuevoProducto.costo_unitario,
      lote: nuevoProducto.lote,
      fecha_vencimiento: nuevoProducto.fecha_vencimiento
    }
    
    // Agregamos el producto
    onAddProducto(productoParaAgregar)
    
    // Reseteamos el formulario
    setNuevoProducto({
      product_id: '',
      cantidad: 0,
      costo_unitario: 0,
      lote: '',
      fecha_vencimiento: ''
    })
  }
  
  // Actualizar un producto existente en la tabla
  const handleUpdateExistingProducto = (index: number, field: string, value: any) => {
    const producto = { ...productos[index] }
    
    // Actualizamos el campo correspondiente
    if (field === 'cantidad') {
      producto.cantidad = parseFloat(value) || 0
      // Recalculamos el subtotal
      producto.subtotal = producto.cantidad * producto.costo_unitario
    } else if (field === 'costo_unitario') {
      producto.costo_unitario = parseFloat(value) || 0
      // Recalculamos el subtotal
      producto.subtotal = producto.cantidad * producto.costo_unitario
    } else if (field === 'lote') {
      producto.lote = value
    } else if (field === 'fecha_vencimiento') {
      producto.fecha_vencimiento = value
    }
    
    onUpdateProducto(index, producto)
  }
  
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">Productos</h3>
      
      {/* Formulario para agregar productos */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <div className="md:col-span-2">
          <Label htmlFor="product_id">Producto</Label>
          <Select
            value={nuevoProducto.product_id}
            onValueChange={handleProductSelect}
            disabled={isLoading}
          >
            <SelectTrigger id="product_id">
              <SelectValue placeholder="Seleccionar producto..." />
            </SelectTrigger>
            <SelectContent>
              {productosDisponibles.map((producto) => (
                <SelectItem key={producto.id} value={producto.id.toString()}>
                  {producto.name} - {producto.sku}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <Label htmlFor="cantidad">Cantidad</Label>
          <Input
            id="cantidad"
            name="cantidad"
            type="number"
            value={nuevoProducto.cantidad === 0 ? "0" : nuevoProducto.cantidad}
            onChange={handleNuevoProductoChange}
            onFocus={handleNumberFocus}
            onBlur={(e) => handleNumberBlur(e, 'cantidad')}
            className="w-full"
            min="0"
            step="0.01"
          />
        </div>
        
        <div>
          <Label htmlFor="costo_unitario">Costo Unitario</Label>
          <Input
            id="costo_unitario"
            name="costo_unitario"
            type="number"
            value={nuevoProducto.costo_unitario === 0 ? "0" : nuevoProducto.costo_unitario}
            onChange={handleNuevoProductoChange}
            onFocus={handleNumberFocus}
            onBlur={(e) => handleNumberBlur(e, 'costo_unitario')}
            className="w-full"
            min="0"
            step="0.01"
          />
        </div>
        
        <div className="flex items-end">
          <Button 
            type="button" 
            onClick={handleAgregarProducto}
            disabled={!nuevoProducto.product_id || nuevoProducto.cantidad <= 0}
            className="w-full"
          >
            <Plus className="mr-2 h-4 w-4" /> Agregar
          </Button>
        </div>
      </div>
      
      {/* Campos adicionales para lote y fecha de vencimiento */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="lote">Código de Lote</Label>
          <Input
            id="lote"
            name="lote"
            value={nuevoProducto.lote}
            onChange={handleNuevoProductoChange}
            className="w-full"
            placeholder="Opcional"
          />
        </div>
        
        <div>
          <Label htmlFor="fecha_vencimiento">Fecha de Vencimiento</Label>
          <Input
            id="fecha_vencimiento"
            name="fecha_vencimiento"
            type="date"
            value={nuevoProducto.fecha_vencimiento}
            onChange={handleNuevoProductoChange}
            className="w-full"
          />
        </div>
      </div>
      
      {/* Tabla de productos agregados */}
      {productos.length > 0 ? (
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Producto</TableHead>
                <TableHead>Cantidad</TableHead>
                <TableHead>Costo Unit.</TableHead>
                <TableHead>Subtotal</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productos.map((producto, index) => (
                <TableRow key={producto.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{producto.nombre}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{producto.sku}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={producto.cantidad === 0 ? "0" : producto.cantidad}
                      onChange={(e) => handleUpdateExistingProducto(index, 'cantidad', e.target.value)}
                      onFocus={handleExistingNumberFocus}
                      onBlur={(e) => handleExistingNumberBlur(e, index, 'cantidad')}
                      className="w-24"
                      min="0"
                      step="0.01"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={producto.costo_unitario === 0 ? "0" : producto.costo_unitario}
                      onChange={(e) => handleUpdateExistingProducto(index, 'costo_unitario', e.target.value)}
                      onFocus={handleExistingNumberFocus}
                      onBlur={(e) => handleExistingNumberBlur(e, index, 'costo_unitario')}
                      className="w-24"
                      min="0"
                      step="0.01"
                    />
                  </TableCell>
                  <TableCell>${producto.subtotal.toFixed(2)}</TableCell>
                  <TableCell>{producto.lote || '—'}</TableCell>
                  <TableCell>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => onRemoveProducto(index)}
                      className="h-8 w-8 text-red-500 hover:text-red-600"
                    >
                      <Trash className="h-4 w-4" />
                      <span className="sr-only">Eliminar</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex items-center justify-center p-6 border rounded-md border-dashed">
          <div className="flex flex-col items-center text-center space-y-2">
            <AlertCircle className="h-6 w-6 text-gray-400" />
            <h3 className="font-medium">No hay productos agregados</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Selecciona un producto y agrega la cantidad para comenzar.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
