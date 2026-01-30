'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Package, CreditCard, DollarSign, MessageSquare, Calculator, AlertTriangle, Camera } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DevolucionesService } from './devolucionesService';
import { ReturnReasonsService } from './motivos/returnReasonsService';
import { SaleForReturn, RefundData, SaleItemForReturn, ReturnReason } from './types';
import { formatCurrency, cn } from '@/utils/Utils';
import { toast } from 'sonner';

// Función para traducir métodos de pago
const translatePaymentMethod = (method: string): string => {
  const translations: Record<string, string> = {
    'cash': 'Efectivo',
    'card': 'Tarjeta',
    'credit': 'Crédito',
    'debit': 'Débito',
    'transfer': 'Transferencia',
    'check': 'Cheque',
    'credit_note': 'Nota de Crédito',
    'original_method': 'Método original'
  };
  return translations[method] || method;
};

interface ReturnFormProps {
  sale: SaleForReturn;
  onBack: () => void;
  onSuccess: () => void;
}

interface ReturnItemData {
  sale_item_id: string;
  product_id: number;
  product_name: string;
  original_quantity: number;
  return_quantity: number;
  unit_price: number;
  refund_amount: number;
  reason: string;
  selected: boolean;
  max_returnable: number; // cantidad - ya devuelto
}

export function ReturnForm({ sale, onBack, onSuccess }: ReturnFormProps) {
  const [loading, setLoading] = useState(false);
  const [returnItems, setReturnItems] = useState<ReturnItemData[]>([]);
  const [refundMethod, setRefundMethod] = useState<'cash' | 'credit_note' | 'original_method'>('cash');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [totalRefund, setTotalRefund] = useState(0);
  const [returnReasons, setReturnReasons] = useState<ReturnReason[]>([]);
  const [loadingReasons, setLoadingReasons] = useState(true);

  // Cargar motivos de devolución
  useEffect(() => {
    const loadReasons = async () => {
      try {
        const reasons = await ReturnReasonsService.getActive();
        setReturnReasons(reasons);
      } catch (error) {
        console.error('Error loading return reasons:', error);
      } finally {
        setLoadingReasons(false);
      }
    };
    loadReasons();
  }, []);

  useEffect(() => {
    // Inicializar items disponibles para devolución
    const items = sale.items.map(item => ({
      sale_item_id: item.id,
      product_id: item.product_id,
      product_name: item.product.name,
      original_quantity: item.quantity,
      return_quantity: 0,
      unit_price: item.unit_price,
      refund_amount: 0,
      reason: '',
      selected: false,
      max_returnable: item.quantity - (item.returned_quantity || 0)
    })).filter(item => item.max_returnable > 0); // Solo items que se pueden devolver

    setReturnItems(items);
  }, [sale]);

  useEffect(() => {
    // Calcular total de reembolso
    const total = returnItems
      .filter(item => item.selected)
      .reduce((sum, item) => sum + item.refund_amount, 0);
    setTotalRefund(total);
  }, [returnItems]);

  const handleItemSelection = (itemId: string, selected: boolean) => {
    setReturnItems(prev => prev.map(item => {
      if (item.sale_item_id === itemId) {
        return {
          ...item,
          selected,
          return_quantity: selected ? Math.min(1, item.max_returnable) : 0,
          refund_amount: selected ? item.unit_price * Math.min(1, item.max_returnable) : 0
        };
      }
      return item;
    }));
  };

  const handleQuantityChange = (itemId: string, quantity: number) => {
    setReturnItems(prev => prev.map(item => {
      if (item.sale_item_id === itemId) {
        const validQuantity = Math.max(0, Math.min(quantity, item.max_returnable));
        return {
          ...item,
          return_quantity: validQuantity,
          refund_amount: item.unit_price * validQuantity,
          selected: validQuantity > 0
        };
      }
      return item;
    }));
  };

  const handleReasonChange = (itemId: string, itemReason: string) => {
    setReturnItems(prev => prev.map(item => {
      if (item.sale_item_id === itemId) {
        return { ...item, reason: itemReason };
      }
      return item;
    }));
  };

  const validateForm = (): boolean => {
    const selectedItems = returnItems.filter(item => item.selected && item.return_quantity > 0);
    
    if (selectedItems.length === 0) {
      toast.error('Debe seleccionar al menos un item para devolver');
      return false;
    }

    if (!reason.trim()) {
      toast.error('Debe especificar el motivo general de la devolución');
      return false;
    }

    // Validar que cada item seleccionado tenga motivo
    const itemsWithoutReason = selectedItems.filter(item => !item.reason.trim());
    if (itemsWithoutReason.length > 0) {
      toast.error('Todos los items seleccionados deben tener un motivo específico');
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const selectedItems = returnItems.filter(item => item.selected && item.return_quantity > 0);
      
      const refundData: RefundData = {
        type: selectedItems.length === sale.items.length ? 'full' : 'partial',
        items: selectedItems.map(item => ({
          sale_item_id: item.sale_item_id,
          product_id: item.product_id,
          return_quantity: item.return_quantity,
          refund_amount: item.refund_amount,
          reason: item.reason
        })),
        refund_method: refundMethod,
        total_refund: totalRefund,
        reason,
        notes: notes.trim() || undefined
      };

      await DevolucionesService.procesarDevolucion(sale.id, refundData);
      
      toast.success(
        `Devolución procesada exitosamente. Reembolso: ${formatCurrency(totalRefund)}`
      );
      
      onSuccess();
      
    } catch (error) {
      console.error('Error procesando devolución:', error);
      toast.error('Error al procesar la devolución');
    } finally {
      setLoading(false);
    }
  };

  const selectedItemsCount = returnItems.filter(item => item.selected).length;
  const hasReturnableItems = returnItems.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="outline"
                size="sm"
                onClick={onBack}
                className="dark:border-gray-600 dark:text-gray-300"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <CardTitle className="flex items-center space-x-2 dark:text-white">
                <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <span>Procesar Devolución</span>
              </CardTitle>
            </div>
            <Badge variant="outline" className="dark:border-blue-500 dark:text-blue-400">
              Venta: {sale.id.slice(-8)}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {!hasReturnableItems && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            No hay items disponibles para devolución en esta venta. Todos los productos ya fueron devueltos previamente.
          </AlertDescription>
        </Alert>
      )}

      {hasReturnableItems && (
        <>
          {/* Información de la venta */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg dark:text-white">Información de la Venta</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-sm text-gray-600 dark:text-gray-400">Cliente</Label>
                  <div className="dark:text-gray-200">{sale.customer?.full_name || 'Cliente General'}</div>
                </div>
                <div>
                  <Label className="text-sm text-gray-600 dark:text-gray-400">Fecha</Label>
                  <div className="dark:text-gray-200">{new Date(sale.sale_date).toLocaleDateString()}</div>
                </div>
                <div>
                  <Label className="text-sm text-gray-600 dark:text-gray-400">Total Original</Label>
                  <div className="text-lg font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(sale.total)}
                  </div>
                </div>
                <div>
                  <Label className="text-sm text-gray-600 dark:text-gray-400">Método de Pago</Label>
                  <div className="dark:text-gray-200">
                    {sale.payment_method ? translatePaymentMethod(sale.payment_method) : 'No especificado'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Selección de items */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between dark:text-white">
                <span>Items para Devolución</span>
                <Badge variant="outline" className="dark:border-green-500 dark:text-green-400">
                  {selectedItemsCount} seleccionados
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="dark:border-gray-700">
                    <TableHead className="w-12 dark:text-gray-300"></TableHead>
                    <TableHead className="dark:text-gray-300">Producto</TableHead>
                    <TableHead className="dark:text-gray-300">Precio Unit.</TableHead>
                    <TableHead className="dark:text-gray-300">Disponible</TableHead>
                    <TableHead className="dark:text-gray-300">A Devolver</TableHead>
                    <TableHead className="dark:text-gray-300">Reembolso</TableHead>
                    <TableHead className="dark:text-gray-300">Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returnItems.map((item) => (
                    <TableRow key={item.sale_item_id} className="dark:border-gray-700">
                      <TableCell>
                        <Checkbox
                          checked={item.selected}
                          onCheckedChange={(checked) => 
                            handleItemSelection(item.sale_item_id, checked as boolean)
                          }
                        />
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        <div>
                          <div className="font-medium">{item.product_name}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            Cantidad original: {item.original_quantity}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        {formatCurrency(item.unit_price)}
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        <Badge variant="outline" className="dark:border-blue-500 dark:text-blue-400">
                          {item.max_returnable}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          max={item.max_returnable}
                          value={item.return_quantity}
                          onChange={(e) => handleQuantityChange(item.sale_item_id, parseInt(e.target.value) || 0)}
                          disabled={!item.selected}
                          className="w-20 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        <div className="font-bold text-orange-600 dark:text-orange-400">
                          {formatCurrency(item.refund_amount)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={item.reason}
                          onValueChange={(value) => handleReasonChange(item.sale_item_id, value)}
                          disabled={!item.selected || loadingReasons}
                        >
                          <SelectTrigger className="w-44 dark:bg-gray-700 dark:border-gray-600">
                            <SelectValue placeholder="Seleccionar" />
                          </SelectTrigger>
                          <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                            {returnReasons.length > 0 ? (
                              returnReasons.map((reasonOption) => (
                                <SelectItem key={reasonOption.id} value={reasonOption.code}>
                                  <div className="flex items-center gap-2">
                                    <span>{reasonOption.name}</span>
                                    {reasonOption.requires_photo && (
                                      <Camera className="h-3 w-3 text-blue-500" />
                                    )}
                                  </div>
                                </SelectItem>
                              ))
                            ) : (
                              <>
                                <SelectItem value="defectuoso">Producto defectuoso</SelectItem>
                                <SelectItem value="incorrecto">Producto incorrecto</SelectItem>
                                <SelectItem value="dañado">Producto dañado</SelectItem>
                                <SelectItem value="no_conforme">No conforme</SelectItem>
                                <SelectItem value="garantia">Garantía</SelectItem>
                                <SelectItem value="otro">Otro motivo</SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Configuración de reembolso */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center space-x-2 dark:text-white">
                <CreditCard className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <span>Configuración del Reembolso</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label className="dark:text-gray-300">Método de Reembolso</Label>
                    <Select value={refundMethod} onValueChange={(value: any) => setRefundMethod(value)}>
                      <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                        <SelectItem value="cash">
                          <div className="flex items-center space-x-2">
                            <DollarSign className="h-4 w-4" />
                            <span>Reembolso en Efectivo</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="credit_note">
                          <div className="flex items-center space-x-2">
                            <CreditCard className="h-4 w-4" />
                            <span>Nota de Crédito</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="original_method">
                          <div className="flex items-center space-x-2">
                            <Calculator className="h-4 w-4" />
                            <span>Método Original</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="dark:text-gray-300">Motivo General *</Label>
                    <Textarea
                      placeholder="Describir el motivo general de la devolución..."
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      rows={3}
                    />
                  </div>

                  <div>
                    <Label className="dark:text-gray-300">Notas Adicionales</Label>
                    <Textarea
                      placeholder="Notas adicionales (opcional)..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      rows={2}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <Card className="dark:bg-gray-900 dark:border-gray-600">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg dark:text-white">Resumen</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between">
                        <span className="dark:text-gray-300">Items seleccionados:</span>
                        <span className="font-medium dark:text-white">{selectedItemsCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="dark:text-gray-300">Cantidad total:</span>
                        <span className="font-medium dark:text-white">
                          {returnItems.filter(item => item.selected).reduce((sum, item) => sum + item.return_quantity, 0)}
                        </span>
                      </div>
                      <Separator className="dark:bg-gray-700" />
                      <div className="flex justify-between text-lg">
                        <span className="font-medium dark:text-white">Total Reembolso:</span>
                        <span className="font-bold text-red-600 dark:text-red-400">
                          {formatCurrency(totalRefund)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex space-x-3">
                    <Button
                      variant="outline"
                      onClick={onBack}
                      className="flex-1 dark:border-gray-600 dark:text-gray-300"
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={loading || selectedItemsCount === 0}
                      className="flex-1 bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
                    >
                      {loading ? 'Procesando...' : 'Procesar Devolución'}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
