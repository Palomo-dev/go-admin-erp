'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowLeft, Plus, Trash2, ArrowRight, Save, Loader2 } from 'lucide-react';
import { TransferenciasService } from '../TransferenciasService';
import { Branch, Product, CreateTransferData } from '../types';
import { useToast } from '@/components/ui/use-toast';

interface ItemTransferencia {
  product_id: number;
  product_name: string;
  quantity: number;
  lot_id?: number | null;
  lot_number?: string;
  stock_disponible: number;
}

export function NuevaTransferenciaForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sucursales, setSucursales] = useState<Branch[]>([]);
  const [productos, setProductos] = useState<Product[]>([]);
  
  const [origenId, setOrigenId] = useState<string>('');
  const [destinoId, setDestinoId] = useState<string>('');
  const [notas, setNotas] = useState('');
  const [items, setItems] = useState<ItemTransferencia[]>([]);
  
  const [productoSeleccionado, setProductoSeleccionado] = useState<string>('');
  const [cantidadAgregar, setCantidadAgregar] = useState<number>(1);
  const [stockDisponible, setStockDisponible] = useState<number>(0);

  useEffect(() => {
    cargarDatosIniciales();
  }, []);

  useEffect(() => {
    if (productoSeleccionado && origenId) {
      cargarStockDisponible();
    }
  }, [productoSeleccionado, origenId]);

  const cargarDatosIniciales = async () => {
    try {
      const [sucursalesData, productosData] = await Promise.all([
        TransferenciasService.obtenerSucursales(),
        TransferenciasService.obtenerProductos()
      ]);
      setSucursales(sucursalesData);
      setProductos(productosData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos iniciales',
        variant: 'destructive'
      });
    }
  };

  const cargarStockDisponible = async () => {
    if (!productoSeleccionado || !origenId) return;
    
    try {
      const stock = await TransferenciasService.obtenerStockDisponible(
        parseInt(origenId),
        parseInt(productoSeleccionado)
      );
      setStockDisponible(stock);
    } catch (error) {
      console.error('Error obteniendo stock:', error);
      setStockDisponible(0);
    }
  };

  const agregarItem = () => {
    if (!productoSeleccionado || cantidadAgregar <= 0) {
      toast({
        title: 'Error',
        description: 'Seleccione un producto y cantidad válida',
        variant: 'destructive'
      });
      return;
    }

    if (cantidadAgregar > stockDisponible) {
      toast({
        title: 'Stock insuficiente',
        description: `Solo hay ${stockDisponible} unidades disponibles`,
        variant: 'destructive'
      });
      return;
    }

    const producto = productos.find(p => p.id === parseInt(productoSeleccionado));
    if (!producto) return;

    const existente = items.find(i => i.product_id === parseInt(productoSeleccionado));
    if (existente) {
      toast({
        title: 'Producto duplicado',
        description: 'Este producto ya está en la lista',
        variant: 'destructive'
      });
      return;
    }

    setItems([...items, {
      product_id: producto.id,
      product_name: producto.name,
      quantity: cantidadAgregar,
      stock_disponible: stockDisponible
    }]);

    setProductoSeleccionado('');
    setCantidadAgregar(1);
    setStockDisponible(0);
  };

  const eliminarItem = (productId: number) => {
    setItems(items.filter(i => i.product_id !== productId));
  };

  const handleGuardar = async () => {
    if (!origenId || !destinoId) {
      toast({
        title: 'Error',
        description: 'Seleccione origen y destino',
        variant: 'destructive'
      });
      return;
    }

    if (origenId === destinoId) {
      toast({
        title: 'Error',
        description: 'El origen y destino deben ser diferentes',
        variant: 'destructive'
      });
      return;
    }

    if (items.length === 0) {
      toast({
        title: 'Error',
        description: 'Agregue al menos un producto',
        variant: 'destructive'
      });
      return;
    }

    try {
      setLoading(true);
      
      const datos: CreateTransferData = {
        origin_branch_id: parseInt(origenId),
        dest_branch_id: parseInt(destinoId),
        notes: notas,
        items: items.map(i => ({
          product_id: i.product_id,
          quantity: i.quantity,
          lot_id: i.lot_id || null
        }))
      };

      const transferencia = await TransferenciasService.crearTransferencia(datos);
      
      toast({
        title: 'Transferencia creada',
        description: `Transferencia #${transferencia.id} creada exitosamente`
      });

      router.push(`/app/inventario/transferencias/${transferencia.id}`);
    } catch (error) {
      console.error('Error creando transferencia:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear la transferencia',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const sucursalOrigen = sucursales.find(s => s.id === parseInt(origenId));
  const sucursalDestino = sucursales.find(s => s.id === parseInt(destinoId));

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Nueva Transferencia
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Crear transferencia entre sucursales
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna izquierda - Formulario */}
        <div className="lg:col-span-2 space-y-6">
          {/* Sucursales */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="dark:text-white">Sucursales</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Label className="dark:text-gray-300">Origen</Label>
                  <Select value={origenId} onValueChange={setOrigenId}>
                    <SelectTrigger className="mt-1 dark:bg-gray-900 dark:border-gray-600 dark:text-white">
                      <SelectValue placeholder="Seleccionar origen" />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-800 dark:border-gray-600">
                      {sucursales.map(s => (
                        <SelectItem 
                          key={s.id} 
                          value={s.id.toString()}
                          disabled={s.id === parseInt(destinoId)}
                        >
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <ArrowRight className="h-6 w-6 text-gray-400 mt-6" />

                <div className="flex-1">
                  <Label className="dark:text-gray-300">Destino</Label>
                  <Select value={destinoId} onValueChange={setDestinoId}>
                    <SelectTrigger className="mt-1 dark:bg-gray-900 dark:border-gray-600 dark:text-white">
                      <SelectValue placeholder="Seleccionar destino" />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-800 dark:border-gray-600">
                      {sucursales.map(s => (
                        <SelectItem 
                          key={s.id} 
                          value={s.id.toString()}
                          disabled={s.id === parseInt(origenId)}
                        >
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Agregar productos */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="dark:text-white">Productos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <Label className="dark:text-gray-300">Producto</Label>
                  <Select 
                    value={productoSeleccionado} 
                    onValueChange={setProductoSeleccionado}
                    disabled={!origenId}
                  >
                    <SelectTrigger className="mt-1 dark:bg-gray-900 dark:border-gray-600 dark:text-white">
                      <SelectValue placeholder={origenId ? "Seleccionar producto" : "Seleccione origen primero"} />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-800 dark:border-gray-600 max-h-60">
                      {productos.map(p => (
                        <SelectItem key={p.id} value={p.id.toString()}>
                          {p.sku ? `[${p.sku}] ` : ''}{p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-32">
                  <Label className="dark:text-gray-300">Cantidad</Label>
                  <Input
                    type="number"
                    min={1}
                    max={stockDisponible}
                    value={cantidadAgregar}
                    onChange={(e) => setCantidadAgregar(parseInt(e.target.value) || 0)}
                    className="mt-1 dark:bg-gray-900 dark:border-gray-600 dark:text-white"
                  />
                  {productoSeleccionado && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Disponible: {stockDisponible}
                    </p>
                  )}
                </div>

                <div className="flex items-end">
                  <Button
                    onClick={agregarItem}
                    disabled={!productoSeleccionado || cantidadAgregar <= 0}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Tabla de items */}
              {items.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow className="dark:border-gray-700">
                      <TableHead className="dark:text-gray-300">Producto</TableHead>
                      <TableHead className="dark:text-gray-300 text-center">Cantidad</TableHead>
                      <TableHead className="dark:text-gray-300 text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.product_id} className="dark:border-gray-700">
                        <TableCell className="dark:text-white">
                          {item.product_name}
                        </TableCell>
                        <TableCell className="text-center dark:text-gray-300">
                          {item.quantity}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => eliminarItem(item.product_id)}
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Notas */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="dark:text-white">Notas</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Notas adicionales sobre la transferencia..."
                className="dark:bg-gray-900 dark:border-gray-600 dark:text-white"
                rows={3}
              />
            </CardContent>
          </Card>
        </div>

        {/* Columna derecha - Resumen */}
        <div>
          <Card className="dark:bg-gray-800 dark:border-gray-700 sticky top-6">
            <CardHeader>
              <CardTitle className="dark:text-white">Resumen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Origen:</span>
                  <span className="dark:text-white font-medium">
                    {sucursalOrigen?.name || '-'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Destino:</span>
                  <span className="dark:text-white font-medium">
                    {sucursalDestino?.name || '-'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Productos:</span>
                  <span className="dark:text-white font-medium">{items.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Total unidades:</span>
                  <span className="dark:text-white font-medium">
                    {items.reduce((sum, i) => sum + i.quantity, 0)}
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t dark:border-gray-700">
                <Button
                  onClick={handleGuardar}
                  disabled={loading || items.length === 0 || !origenId || !destinoId}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Crear Transferencia
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
