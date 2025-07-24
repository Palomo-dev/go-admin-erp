'use client';

import { useState, useEffect } from 'react';
import { Search, Calendar, User, CreditCard, RefreshCw, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DevolucionesService } from './devolucionesService';
import { SaleForReturn, SaleSearchFilters } from './types';
import { formatCurrency } from '@/utils/Utils';
import { cn } from '@/utils/Utils';

interface TicketSearchProps {
  onSaleSelect: (sale: SaleForReturn) => void;
}

export function TicketSearch({ onSaleSelect }: TicketSearchProps) {
  const [sales, setSales] = useState<SaleForReturn[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSale, setSelectedSale] = useState<SaleForReturn | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [filters, setFilters] = useState<SaleSearchFilters>({
    search: '',
    status: '',
    limit: 20,
    page: 1
  });
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    buscarVentas();
  }, [filters.page]);

  const buscarVentas = async () => {
    setLoading(true);
    try {
      const response = await DevolucionesService.buscarVentas(filters);
      setSales(response.data);
      setTotalPages(response.totalPages);
      setTotal(response.total);
    } catch (error) {
      console.error('Error buscando ventas:', error);
      setSales([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setFilters(prev => ({ ...prev, page: 1 }));
    buscarVentas();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const verDetalles = async (sale: SaleForReturn) => {
    try {
      setLoading(true);
      const detalles = await DevolucionesService.obtenerDetalleVenta(sale.id);
      setSelectedSale(detalles);
      setShowDetails(true);
    } catch (error) {
      console.error('Error obteniendo detalles:', error);
    } finally {
      setLoading(false);
    }
  };

  const seleccionarVenta = (sale: SaleForReturn) => {
    onSaleSelect(sale);
    setShowDetails(false);
  };

  const getStatusBadge = (status: string, paymentStatus: string) => {
    if (status === 'paid' && paymentStatus === 'paid') {
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Pagado</Badge>;
    }
    if (paymentStatus === 'partial') {
      return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Parcial</Badge>;
    }
    return <Badge variant="secondary">Pendiente</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* Filtros de búsqueda */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center space-x-2 text-lg dark:text-white">
            <Search className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <span>Buscar Ticket Original</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar por # venta, cliente, teléfono..."
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  onKeyPress={handleKeyPress}
                  className="pl-10 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
            </div>
            <div>
              <Input
                type="date"
                placeholder="Fecha desde"
                value={filters.dateFrom || ''}
                onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
            <div className="flex space-x-2">
              <Button 
                onClick={handleSearch}
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
              >
                {loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                Buscar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resultados */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center justify-between dark:text-white">
            <div className="flex items-center space-x-2">
              <CreditCard className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <span>Ventas Encontradas</span>
            </div>
            <Badge variant="outline" className="dark:border-blue-500 dark:text-blue-400">
              {total} resultados
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center space-x-4">
                  <Skeleton className="h-12 w-12 rounded dark:bg-gray-700" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-[250px] dark:bg-gray-700" />
                    <Skeleton className="h-4 w-[200px] dark:bg-gray-700" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow className="dark:border-gray-700">
                      <TableHead className="dark:text-gray-300">Fecha</TableHead>
                      <TableHead className="dark:text-gray-300">Cliente</TableHead>
                      <TableHead className="dark:text-gray-300">Total</TableHead>
                      <TableHead className="dark:text-gray-300">Estado</TableHead>
                      <TableHead className="dark:text-gray-300">Items</TableHead>
                      <TableHead className="dark:text-gray-300">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sales.map((sale) => (
                      <TableRow 
                        key={sale.id}
                        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 dark:border-gray-700"
                      >
                        <TableCell className="dark:text-gray-300">
                          <div className="flex items-center space-x-2">
                            <Calendar className="h-4 w-4 text-gray-400" />
                            <span>{new Date(sale.sale_date).toLocaleDateString()}</span>
                          </div>
                        </TableCell>
                        <TableCell className="dark:text-gray-300">
                          <div className="flex items-center space-x-2">
                            <User className="h-4 w-4 text-gray-400" />
                            <div>
                              <div className="font-medium">
                                {sale.customer?.full_name || 'Cliente General'}
                              </div>
                              {sale.customer?.phone && (
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                  {sale.customer.phone}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="dark:text-gray-300">
                          <div className="text-lg font-bold text-green-600 dark:text-green-400">
                            {formatCurrency(sale.total)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(sale.status, sale.payment_status)}
                        </TableCell>
                        <TableCell className="dark:text-gray-300">
                          <Badge variant="outline" className="dark:border-gray-500">
                            {sale.items.length} items
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => verDetalles(sale)}
                              className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => seleccionarVenta(sale)}
                              className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
                            >
                              Seleccionar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              {/* Paginación */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Página {filters.page} de {totalPages}
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setFilters(prev => ({ ...prev, page: Math.max(1, prev.page! - 1) }))}
                      disabled={filters.page === 1}
                      className="dark:border-gray-600 dark:text-gray-300"
                    >
                      Anterior
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setFilters(prev => ({ ...prev, page: Math.min(totalPages, prev.page! + 1) }))}
                      disabled={filters.page === totalPages}
                      className="dark:border-gray-600 dark:text-gray-300"
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialog de detalles */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-[98vw] w-[98vw] h-[98vh] max-h-[98vh] overflow-hidden dark:bg-gray-800 dark:border-gray-700 p-0">
          <div className="flex flex-col h-full">
            {/* Header fijo */}
            <DialogHeader className="px-8 py-6 pb-4 border-b dark:border-gray-700">
              <DialogTitle className="dark:text-white text-xl">Detalles de la Venta</DialogTitle>
              {selectedSale && (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  ID: {selectedSale.id.slice(-8).toUpperCase()} • {new Date(selectedSale.sale_date).toLocaleString()}
                </div>
              )}
            </DialogHeader>
            
            {/* Contenido con scroll */}
            <ScrollArea className="flex-1 px-8">
              {selectedSale && (
                <div className="space-y-8 py-6">
                  {/* Información de la venta en cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <Card className="dark:bg-gray-700 dark:border-gray-600">
                      <CardContent className="p-4">
                        <div className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">
                          Cliente
                        </div>
                        <div className="text-sm font-medium dark:text-gray-200 truncate">
                          {selectedSale.customer?.full_name || 'Cliente General'}
                        </div>
                        {selectedSale.customer?.phone && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Tel: {selectedSale.customer.phone}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    
                    <Card className="dark:bg-gray-700 dark:border-gray-600">
                      <CardContent className="p-4">
                        <div className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">
                          Subtotal
                        </div>
                        <div className="text-lg font-bold dark:text-gray-200">
                          {formatCurrency(selectedSale.subtotal)}
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card className="dark:bg-gray-700 dark:border-gray-600">
                      <CardContent className="p-4">
                        <div className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">
                          Total
                        </div>
                        <div className="text-lg font-bold text-green-600 dark:text-green-400">
                          {formatCurrency(selectedSale.total)}
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card className="dark:bg-gray-700 dark:border-gray-600">
                      <CardContent className="p-4">
                        <div className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">
                          Estado
                        </div>
                        <div className="mt-1">
                          {getStatusBadge(selectedSale.status, selectedSale.payment_status)}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Información de pago */}
                  {selectedSale.payments && selectedSale.payments.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-lg dark:text-white mb-3">Información de Pago</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {selectedSale.payments.map((payment, index) => (
                          <Card key={payment.id || index} className="dark:bg-gray-700 dark:border-gray-600">
                            <CardContent className="p-3">
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-medium dark:text-gray-300">
                                  {payment.method}
                                </span>
                                <span className="text-sm font-bold dark:text-gray-200">
                                  {formatCurrency(payment.amount)}
                                </span>
                              </div>
                              {payment.reference && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  Ref: {payment.reference}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tabla de productos mejorada */}
                  <div>
                    <h4 className="font-semibold text-lg dark:text-white mb-3">
                      Items de la Venta ({selectedSale.items.length})
                    </h4>
                    <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                            <TableHead className="dark:text-gray-300 font-semibold">Producto</TableHead>
                            <TableHead className="dark:text-gray-300 font-semibold text-center">Cantidad</TableHead>
                            <TableHead className="dark:text-gray-300 font-semibold text-right">Precio Unit.</TableHead>
                            <TableHead className="dark:text-gray-300 font-semibold text-right">Total</TableHead>
                            <TableHead className="dark:text-gray-300 font-semibold text-center">Devuelto</TableHead>
                            <TableHead className="dark:text-gray-300 font-semibold text-center">Disponible</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedSale.items.map((item) => {
                            const availableQty = item.quantity - (item.returned_quantity || 0);
                            return (
                              <TableRow key={item.id} className="dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                                <TableCell className="dark:text-gray-300">
                                  <div className="flex items-center space-x-3">
                                    {item.product.image && (
                                      <img 
                                        src={item.product.image} 
                                        alt={item.product.name}
                                        className="w-10 h-10 rounded object-cover"
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                      />
                                    )}
                                    <div>
                                      <div className="font-medium text-sm">{item.product.name}</div>
                                      <div className="text-xs text-gray-500 dark:text-gray-400">
                                        SKU: {item.product.sku}
                                      </div>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="dark:text-gray-300 text-center font-medium">
                                  {item.quantity}
                                </TableCell>
                                <TableCell className="dark:text-gray-300 text-right font-medium">
                                  {formatCurrency(item.unit_price)}
                                </TableCell>
                                <TableCell className="dark:text-gray-300 text-right font-semibold">
                                  {formatCurrency(item.total)}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge 
                                    variant={item.returned_quantity ? "destructive" : "secondary"}
                                    className={cn(
                                      "text-xs",
                                      item.returned_quantity && item.returned_quantity > 0
                                        ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                        : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                                    )}
                                  >
                                    {item.returned_quantity || 0}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge 
                                    variant={availableQty > 0 ? "default" : "secondary"}
                                    className={cn(
                                      "text-xs",
                                      availableQty > 0
                                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                        : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                                    )}
                                  >
                                    {availableQty}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              )}
            </ScrollArea>
            
            {/* Footer con botones fijo */}
            <div className="border-t dark:border-gray-700 px-8 py-6 pt-4 bg-gray-50 dark:bg-gray-900">
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedSale && (
                    <span>{selectedSale.items.length} productos • Total: {formatCurrency(selectedSale.total)}</span>
                  )}
                </div>
                <div className="flex space-x-3">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowDetails(false)}
                    className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Cerrar
                  </Button>
                  <Button 
                    onClick={() => seleccionarVenta(selectedSale!)}
                    className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
                  >
                    Procesar Devolución
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
