'use client'

import { useState, useEffect } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Trash2, Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase/config'
import { formatCurrency } from '@/utils/Utils'
import { useToast } from '@/components/ui/use-toast'

interface Producto {
  id: number
  name: string
  sku: string
  price: number
  has_lots: boolean
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

interface Lote {
  id: number
  lot_code: string
  expiry_date: string | null
  available_qty: number
}

interface TablaProductosSalidaProps {
  productos: ProductoSalida[]
  onAddProducto: (producto: ProductoSalida) => void
  onRemoveProducto: (index: number) => void
  onUpdateProducto: (index: number, producto: ProductoSalida) => void
  organizationId: number
}

export default function TablaProductosSalida({
  productos,
  onAddProducto,
  onRemoveProducto,
  onUpdateProducto,
  organizationId
}: TablaProductosSalidaProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [resultados, setResultados] = useState<Producto[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Producto | null>(null)
  const [cantidad, setCantidad] = useState(1)
  const [precio, setPrecio] = useState(0)
  const [loteSeleccionado, setLoteSeleccionado] = useState<Lote | null>(null)
  const [lotesDisponibles, setLotesDisponibles] = useState<Lote[]>([])
  const [isLoadingLots, setIsLoadingLots] = useState(false)
  const { toast } = useToast()

  const buscarProductos = async () => {
    if (!searchTerm.trim()) return
    
    setIsSearching(true)
    
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku, price, has_lots')
        .eq('organization_id', organizationId)
        .or(`name.ilike.%${searchTerm}%,sku.ilike.%${searchTerm}%,barcode.eq.${searchTerm}`)
        .order('name')
        .limit(10)
      
      if (error) throw error
      setResultados(data || [])
    } catch (error) {
      console.error('Error al buscar productos:', error)
      toast({
        title: "Error",
        description: "No se pudieron buscar los productos.",
        variant: "destructive"
      })
    } finally {
      setIsSearching(false)
    }
  }

  useEffect(() => {
    if (selectedProduct) {
      setPrecio(selectedProduct.price)
      
      if (selectedProduct.has_lots) {
        cargarLotesDisponibles(selectedProduct.id)
      }
    }
  }, [selectedProduct])

  const cargarLotesDisponibles = async (productId: number) => {
    setIsLoadingLots(true)
    
    try {
      // Consulta para obtener lotes con cantidad disponible
      const { data, error } = await supabase.rpc('get_available_lots', {
        p_product_id: productId
      })
      
      if (error) throw error
      setLotesDisponibles(data || [])
    } catch (error) {
      console.error('Error al cargar lotes:', error)
      toast({
        title: "Error",
        description: "No se pudieron cargar los lotes disponibles.",
        variant: "destructive"
      })
      setLotesDisponibles([])
    } finally {
      setIsLoadingLots(false)
    }
  }

  const handleSelectProduct = (producto: Producto) => {
    setSelectedProduct(producto)
    setCantidad(1)
    setPrecio(producto.price)
    setLoteSeleccionado(null)
  }

  const handleAddProducto = () => {
    if (!selectedProduct) return
    
    // Si el producto requiere lote pero no se ha seleccionado ninguno
    if (selectedProduct.has_lots && !loteSeleccionado) {
      toast({
        title: "Error",
        description: "Este producto requiere seleccionar un lote.",
        variant: "destructive"
      })
      return
    }
    
    const nuevoProducto: ProductoSalida = {
      id: Date.now(),
      product_id: selectedProduct.id,
      nombre: selectedProduct.name,
      sku: selectedProduct.sku,
      cantidad: cantidad,
      precio_unitario: precio,
      subtotal: cantidad * precio,
      lote_id: loteSeleccionado?.id,
      lote_codigo: loteSeleccionado?.lot_code
    }
    
    onAddProducto(nuevoProducto)
    
    // Limpiar selección
    setSelectedProduct(null)
    setCantidad(1)
    setPrecio(0)
    setLoteSeleccionado(null)
    setIsDialogOpen(false)
  }

  const handleCantidadChange = (event: React.ChangeEvent<HTMLInputElement>, index?: number) => {
    let value = event.target.value === '' ? 0 : parseFloat(event.target.value)
    if (isNaN(value)) value = 0
    
    // Regla UX: Al hacer focus, si es 0, se borra
    if (event.type === 'focus' && value === 0) {
      if (index !== undefined) {
        const target = event.target
        setTimeout(() => {
          target.value = ''
        }, 0)
      } else {
        setCantidad(0)
        event.target.value = ''
      }
      return
    }
    
    if (index !== undefined) {
      // Actualizar producto en la lista
      const producto = {...productos[index]}
      producto.cantidad = value
      producto.subtotal = value * producto.precio_unitario
      onUpdateProducto(index, producto)
    } else {
      // Actualizar cantidad del producto seleccionado
      setCantidad(value)
    }
  }

  const handleCantidadBlur = (event: React.FocusEvent<HTMLInputElement>, index?: number) => {
    let value = event.target.value === '' ? 0 : parseFloat(event.target.value)
    if (isNaN(value)) value = 0
    
    if (index !== undefined) {
      // Actualizar producto en la lista
      const producto = {...productos[index]}
      producto.cantidad = value
      producto.subtotal = value * producto.precio_unitario
      onUpdateProducto(index, producto)
    } else {
      // Actualizar cantidad del producto seleccionado
      setCantidad(value)
    }
  }

  const handlePrecioChange = (event: React.ChangeEvent<HTMLInputElement>, index?: number) => {
    let value = event.target.value === '' ? 0 : parseFloat(event.target.value)
    if (isNaN(value)) value = 0
    
    // Regla UX: Al hacer focus, si es 0, se borra
    if (event.type === 'focus' && value === 0) {
      if (index !== undefined) {
        const target = event.target
        setTimeout(() => {
          target.value = ''
        }, 0)
      } else {
        setPrecio(0)
        event.target.value = ''
      }
      return
    }
    
    if (index !== undefined) {
      // Actualizar producto en la lista
      const producto = {...productos[index]}
      producto.precio_unitario = value
      producto.subtotal = producto.cantidad * value
      onUpdateProducto(index, producto)
    } else {
      // Actualizar precio del producto seleccionado
      setPrecio(value)
    }
  }

  const handlePrecioBlur = (event: React.FocusEvent<HTMLInputElement>, index?: number) => {
    let value = event.target.value === '' ? 0 : parseFloat(event.target.value)
    if (isNaN(value)) value = 0
    
    if (index !== undefined) {
      // Actualizar producto en la lista
      const producto = {...productos[index]}
      producto.precio_unitario = value
      producto.subtotal = producto.cantidad * value
      onUpdateProducto(index, producto)
    } else {
      // Actualizar precio del producto seleccionado
      setPrecio(value)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Productos</h3>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Agregar Producto
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Agregar Producto</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex space-x-2">
                <Input 
                  placeholder="Buscar por nombre, SKU o código de barras..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1"
                />
                <Button type="button" onClick={buscarProductos} disabled={isSearching}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>

              {resultados.length > 0 && (
                <ScrollArea className="h-72 rounded-md border">
                  <div className="p-4">
                    <h4 className="mb-4 text-sm font-medium leading-none">Resultados de búsqueda</h4>
                    <div className="space-y-2">
                      {resultados.map(producto => (
                        <div 
                          key={producto.id}
                          className={`p-2 rounded cursor-pointer ${
                            selectedProduct?.id === producto.id ? 'bg-accent' : 'hover:bg-muted'
                          }`}
                          onClick={() => handleSelectProduct(producto)}
                        >
                          <div className="font-medium">{producto.name}</div>
                          <div className="text-sm text-muted-foreground">SKU: {producto.sku}</div>
                          <div className="text-sm">Precio: {formatCurrency(producto.price)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </ScrollArea>
              )}

              {selectedProduct && (
                <div className="space-y-3 pt-3 border-t">
                  <div>
                    <Label htmlFor="cantidad">Cantidad</Label>
                    <Input 
                      id="cantidad" 
                      type="number"
                      min="1"
                      value={cantidad === 0 ? '' : cantidad}
                      onChange={handleCantidadChange}
                      onFocus={(e) => handleCantidadChange(e as any)}
                      onBlur={handleCantidadBlur}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="precio">Precio Unitario</Label>
                    <Input 
                      id="precio" 
                      type="number"
                      min="0"
                      step="0.01"
                      value={precio === 0 ? '' : precio}
                      onChange={handlePrecioChange}
                      onFocus={(e) => handlePrecioChange(e as any)}
                      onBlur={handlePrecioBlur}
                    />
                  </div>
                  
                  {selectedProduct.has_lots && (
                    <div>
                      <Label htmlFor="lote">Lote</Label>
                      <select
                        id="lote"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        value={loteSeleccionado?.id || ''}
                        onChange={(e) => {
                          const selectedLotId = parseInt(e.target.value);
                          const lot = lotesDisponibles.find(l => l.id === selectedLotId);
                          setLoteSeleccionado(lot || null);
                        }}
                        disabled={isLoadingLots}
                      >
                        <option value="">Seleccionar lote</option>
                        {lotesDisponibles.map(lote => (
                          <option key={lote.id} value={lote.id}>
                            {lote.lot_code} - Disp: {lote.available_qty} {lote.expiry_date ? `(Vence: ${lote.expiry_date})` : ''}
                          </option>
                        ))}
                      </select>
                      {isLoadingLots && <p className="text-sm text-muted-foreground mt-1">Cargando lotes...</p>}
                      {!isLoadingLots && lotesDisponibles.length === 0 && (
                        <p className="text-sm text-destructive mt-1">No hay lotes disponibles para este producto</p>
                      )}
                    </div>
                  )}
                  
                  <div className="pt-3">
                    <Button 
                      type="button" 
                      onClick={handleAddProducto} 
                      disabled={cantidad <= 0 || (selectedProduct.has_lots && !loteSeleccionado)}
                    >
                      Agregar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {productos.length === 0 ? (
        <div className="text-center py-8 border rounded-lg">
          <p className="text-muted-foreground">
            No hay productos añadidos. Haz clic en "Agregar Producto" para comenzar.
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Cantidad</TableHead>
                <TableHead>Precio Unit.</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productos.map((producto, index) => (
                <TableRow key={producto.id}>
                  <TableCell className="font-medium">{producto.nombre}</TableCell>
                  <TableCell>{producto.sku}</TableCell>
                  <TableCell>{producto.lote_codigo || '-'}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="1"
                      className="w-20"
                      value={producto.cantidad === 0 ? '' : producto.cantidad}
                      onChange={(e) => handleCantidadChange(e, index)}
                      onFocus={(e) => handleCantidadChange(e as any, index)}
                      onBlur={(e) => handleCantidadBlur(e, index)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-24"
                      value={producto.precio_unitario === 0 ? '' : producto.precio_unitario}
                      onChange={(e) => handlePrecioChange(e, index)}
                      onFocus={(e) => handlePrecioChange(e as any, index)}
                      onBlur={(e) => handlePrecioBlur(e, index)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(producto.subtotal)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveProducto(index)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
