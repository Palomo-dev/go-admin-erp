'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabase/config'
import { useToast } from '@/components/ui/use-toast'
import { Barcode, UploadCloud, Trash, Save } from 'lucide-react'

interface EscaneoMasivoProps {
  organizationId: number
}

interface ProductoEscaneado {
  id: string  // ID temporal para la UI
  sku: string
  nombre: string
  product_id: number
  cantidad: number
  lote: string
  fecha_vencimiento: string
}

interface Sucursal {
  id: number
  name: string
}

export default function EscaneoMasivo({ organizationId }: EscaneoMasivoProps) {
  const [codigoEscaneado, setCodigoEscaneado] = useState('')
  const [productosEscaneados, setProductosEscaneados] = useState<ProductoEscaneado[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [sucursalSeleccionada, setSucursalSeleccionada] = useState<string>('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  useEffect(() => {
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
    
    cargarSucursales()
  }, [organizationId])
  
  // Auto-focus en el input de escaneo cuando se activa el modo escaneo
  useEffect(() => {
    if (isScanning && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isScanning])

  const buscarProducto = async (codigo: string) => {
    setIsLoading(true)
    try {
      // Intentar buscar por SKU o código de barras
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku')
        .eq('organization_id', organizationId)
        .or(`sku.eq.${codigo},barcode.eq.${codigo}`)
        .single()
      
      if (error) throw error
      
      if (data) {
        // Verificar si ya existe este producto en la lista
        const productoExistente = productosEscaneados.find(p => p.product_id === data.id)
        
        if (productoExistente) {
          // Incrementar cantidad si ya existe
          setProductosEscaneados(prevProductos => 
            prevProductos.map(p => 
              p.product_id === data.id 
                ? { ...p, cantidad: p.cantidad + 1 }
                : p
            )
          )
        } else {
          // Agregar nuevo producto
          setProductosEscaneados(prevProductos => [
            ...prevProductos,
            {
              id: Date.now().toString(),
              product_id: data.id,
              sku: data.sku,
              nombre: data.name,
              cantidad: 1,
              lote: '',
              fecha_vencimiento: ''
            }
          ])
        }
        
        // Mostrar confirmación
        toast({
          title: "Producto escaneado",
          description: data.name,
        })
        
        // Limpiar input para el siguiente escaneo
        setCodigoEscaneado('')
      } else {
        throw new Error('Producto no encontrado')
      }
    } catch (error) {
      console.error('Error al buscar producto:', error)
      toast({
        title: "Producto no encontrado",
        description: `No se encontró un producto con el código ${codigo}`,
        variant: "destructive",
      })
      setCodigoEscaneado('')
    } finally {
      setIsLoading(false)
      if (inputRef.current) {
        inputRef.current.focus()
      }
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCodigoEscaneado(e.target.value)
  }
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (codigoEscaneado) {
      buscarProducto(codigoEscaneado)
    }
  }
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // La mayoría de los escáneres envían un "Enter" después del código
    if (e.key === 'Enter' && codigoEscaneado) {
      e.preventDefault()
      buscarProducto(codigoEscaneado)
    }
  }
  
  const handleStartScanning = () => {
    setIsScanning(true)
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
      }
    }, 100)
  }
  
  const handleStopScanning = () => {
    setIsScanning(false)
  }

  const handleRemoveProducto = (id: string) => {
    setProductosEscaneados(prevProductos => prevProductos.filter(p => p.id !== id))
  }
  
  const handleUpdateProducto = (id: string, field: string, value: any) => {
    setProductosEscaneados(prevProductos => 
      prevProductos.map(p => 
        p.id === id ? { ...p, [field]: field === 'cantidad' ? parseFloat(value) || 0 : value } : p
      )
    )
  }

  // Manejar foco en campos numéricos (borramos el 0 al recibir foco)
  const handleNumberFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value === '0') {
      e.target.value = ''
    }
  }

  // Manejar pérdida de foco en campos numéricos (volvemos a 0 si está vacío)
  const handleNumberBlur = (e: React.FocusEvent<HTMLInputElement>, id: string, field: string) => {
    if (e.target.value === '') {
      handleUpdateProducto(id, field, 0)
    }
  }
  
  const handleGuardarEntrada = async () => {
    if (productosEscaneados.length === 0) {
      toast({
        title: "Error",
        description: "No hay productos escaneados para guardar",
        variant: "destructive"
      })
      return
    }
    
    if (!sucursalSeleccionada) {
      toast({
        title: "Error",
        description: "Selecciona una sucursal para la entrada",
        variant: "destructive"
      })
      return
    }
    
    setIsSaving(true)
    
    try {
      // Crear la entrada de inventario (purchase_order) como un ajuste
      const { data: ordenData, error: ordenError } = await supabase
        .from('purchase_orders')
        .insert({
          organization_id: organizationId,
          branch_id: parseInt(sucursalSeleccionada),
          reference_number: `ESC-${Date.now().toString().substr(-6)}`, // Generar referencia única
          order_date: new Date().toISOString(),
          status: 'received', // Marcar como recibido directamente ya que es un escaneo
          notes: 'Entrada por escaneo masivo',
          total_amount: 0, // No tenemos costos en escaneo
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select('id')
        .single()
      
      if (ordenError) throw ordenError
      
      // Insertar los items de la entrada
      const itemsParaInsertar = productosEscaneados.map(producto => ({
        purchase_order_id: ordenData.id,
        product_id: producto.product_id,
        quantity: producto.cantidad,
        unit_cost: 0, // No tenemos costo en escaneo masivo
        lot_code: producto.lote || null,
        status: 'received',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }))
      
      const { error: itemsError } = await supabase
        .from('po_items')
        .insert(itemsParaInsertar)
      
      if (itemsError) throw itemsError
      
      // Crear movimientos de stock
      const movimientosStock = productosEscaneados.map(producto => ({
        organization_id: organizationId,
        branch_id: parseInt(sucursalSeleccionada),
        product_id: producto.product_id,
        direction: 'in',
        qty: producto.cantidad,
        unit_cost: 0,
        source: 'adjustment',
        source_id: ordenData.id.toString(),
        note: 'Entrada por escaneo masivo',
        created_at: new Date().toISOString()
      }))
      
      const { error: movimientosError } = await supabase
        .from('stock_movements')
        .insert(movimientosStock)
      
      if (movimientosError) throw movimientosError
      
      toast({
        title: "Éxito",
        description: `Se han guardado ${productosEscaneados.length} productos en el inventario`,
      })
      
      // Resetear el formulario
      setProductosEscaneados([])
      setIsScanning(false)
    } catch (error: any) {
      console.error('Error al guardar la entrada:', error)
      toast({
        title: "Error",
        description: `No se pudo guardar la entrada: ${error.message}`,
        variant: "destructive"
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Escaneo Masivo de Productos</h3>
        <div className="space-y-1">
          <Label htmlFor="sucursal">Sucursal</Label>
          <Select 
            value={sucursalSeleccionada} 
            onValueChange={setSucursalSeleccionada}
          >
            <SelectTrigger id="sucursal" className="w-[200px]">
              <SelectValue placeholder="Seleccionar sucursal" />
            </SelectTrigger>
            <SelectContent>
              {sucursales.map((sucursal) => (
                <SelectItem key={sucursal.id} value={sucursal.id.toString()}>
                  {sucursal.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isScanning ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-end space-x-4">
                <div className="flex-1">
                  <Label htmlFor="codigo">Código del producto</Label>
                  <Input
                    id="codigo"
                    ref={inputRef}
                    value={codigoEscaneado}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Escanea o escribe el código..."
                    className="w-full"
                    autoComplete="off"
                    disabled={isLoading}
                  />
                </div>
                <Button 
                  type="submit" 
                  disabled={!codigoEscaneado || isLoading}
                  className="mb-0.5"
                >
                  {isLoading ? "Buscando..." : "Agregar"}
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleStopScanning}
                  className="mb-0.5"
                >
                  Detener Escaneo
                </Button>
              </div>
              
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Escanea el código de barras del producto o ingrésalo manualmente y presiona Enter.
              </p>
            </form>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Barcode className="h-16 w-16 text-gray-400" />
              <h3 className="text-xl font-medium">Listo para escanear</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-md">
                Haz clic en el botón para comenzar a escanear productos. 
                Asegúrate de tener un lector de códigos de barras conectado.
              </p>
              <Button onClick={handleStartScanning}>
                <Barcode className="mr-2 h-4 w-4" />
                Comenzar Escaneo
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {productosEscaneados.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Productos Escaneados ({productosEscaneados.length})</h3>
            <Button onClick={handleGuardarEntrada} disabled={isSaving}>
              {isSaving ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Guardar Entrada
                </>
              )}
            </Button>
          </div>
          
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Producto</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Fecha Venc.</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productosEscaneados.map((producto) => (
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
                        onChange={(e) => handleUpdateProducto(producto.id, 'cantidad', e.target.value)}
                        onFocus={handleNumberFocus}
                        onBlur={(e) => handleNumberBlur(e, producto.id, 'cantidad')}
                        className="w-20"
                        min="1"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={producto.lote}
                        onChange={(e) => handleUpdateProducto(producto.id, 'lote', e.target.value)}
                        className="w-32"
                        placeholder="Opcional"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="date"
                        value={producto.fecha_vencimiento}
                        onChange={(e) => handleUpdateProducto(producto.id, 'fecha_vencimiento', e.target.value)}
                        className="w-40"
                      />
                    </TableCell>
                    <TableCell>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleRemoveProducto(producto.id)}
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
        </div>
      )}
    </div>
  )
}
