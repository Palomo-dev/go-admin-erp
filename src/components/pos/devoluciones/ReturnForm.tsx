'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Package, CreditCard, DollarSign, Calculator, AlertTriangle, Camera } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DevolucionesService } from './devolucionesService';
import { ReturnReasonsService } from './motivos/returnReasonsService';
import { SaleForReturn, RefundData, ReturnReason, SoldSerialInfo } from './types';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { claveErrorDevolucion, codigoErrorDevolucion } from '@/lib/pos/devoluciones/procesarDevolucion';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { toast } from 'sonner';

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
  track_serial: boolean;
  available_serials: SoldSerialInfo[];
  selected_serial_ids: number[];
}

export function ReturnForm({ sale, onBack, onSuccess }: ReturnFormProps) {
  const { formatear } = useMonedaOrganizacion();
  const tErrores = useTranslations('posDevoluciones.errores');
  const t = useTranslations('posDevoluciones.formulario');
  const tComun = useTranslations('posDevoluciones.comun');
  const { formatDate } = useFormatDate();
  // Métodos de pago conocidos se traducen; uno desconocido se muestra tal cual (es un dato).
  const nombreMetodoPago = (metodo: string): string =>
    t.has(`metodosPago.${metodo}`) ? t(`metodosPago.${metodo}`) : metodo;
  // Una clave por intento: si la red corta y se vuelve a enviar, el servidor
  // devuelve la misma devolución en vez de duplicarla. Se renueva al terminar bien.
  const claveIntento = useRef<string>(crypto.randomUUID());
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
      max_returnable: item.quantity - (item.returned_quantity || 0),
      track_serial: item.product.track_serial || false,
      available_serials: item.serials || [],
      selected_serial_ids: [] as number[]
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

  const handleSerialToggle = (itemId: string, serialId: number) => {
    setReturnItems(prev => prev.map(item => {
      if (item.sale_item_id === itemId) {
        const isSelected = item.selected_serial_ids.includes(serialId);
        const newSerialIds = isSelected
          ? item.selected_serial_ids.filter(id => id !== serialId)
          : [...item.selected_serial_ids, serialId];
        const newQty = newSerialIds.length;
        return {
          ...item,
          selected_serial_ids: newSerialIds,
          return_quantity: newQty,
          refund_amount: item.unit_price * newQty,
          selected: newQty > 0
        };
      }
      return item;
    }));
  };

  const validateForm = (): boolean => {
    const selectedItems = returnItems.filter(item => item.selected && item.return_quantity > 0);
    
    if (selectedItems.length === 0) {
      toast.error(t('validacion.sinItems'));
      return false;
    }

    if (!reason.trim()) {
      toast.error(t('validacion.sinMotivoGeneral'));
      return false;
    }

    // Validar que cada item seleccionado tenga motivo
    const itemsWithoutReason = selectedItems.filter(item => !item.reason.trim());
    if (itemsWithoutReason.length > 0) {
      toast.error(t('validacion.itemsSinMotivo'));
      return false;
    }

    // Validar que items serializados tengan seriales seleccionados
    const serialItemsWithoutSerials = selectedItems.filter(
      item => item.track_serial && item.selected_serial_ids.length === 0
    );
    if (serialItemsWithoutSerials.length > 0) {
      toast.error(t('validacion.serializadosSinSerial'));
      return false;
    }

    // Validar que la cantidad coincida con los seriales seleccionados
    const serialQtyMismatch = selectedItems.filter(
      item => item.track_serial && item.selected_serial_ids.length !== item.return_quantity
    );
    if (serialQtyMismatch.length > 0) {
      toast.error(t('validacion.serialesNoCoinciden'));
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
          reason: item.reason,
          serial_number_ids: item.track_serial ? item.selected_serial_ids : undefined
        })),
        refund_method: refundMethod,
        total_refund: totalRefund,
        reason,
        notes: notes.trim() || undefined
      };

      const resultado = await DevolucionesService.procesarDevolucion(sale.id, refundData, claveIntento.current);
      claveIntento.current = crypto.randomUUID();

      // El monto lo calcula el servidor con lo cobrado en la venta.
      toast.success(
        t('exito', { monto: formatear(Number(resultado.total_refund ?? totalRefund)) })
      );

      onSuccess();

    } catch (error) {
      console.error('Error procesando devolución:', error);
      toast.error(tErrores(claveErrorDevolucion(codigoErrorDevolucion(error))));
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
                aria-label={t('volver')}
                className="dark:border-gray-600 dark:text-gray-300"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <CardTitle className="flex items-center space-x-2 dark:text-white">
                <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <span>{tComun('procesarDevolucion')}</span>
              </CardTitle>
            </div>
            <Badge variant="outline" className="dark:border-blue-500 dark:text-blue-400">
              {t('venta', { id: sale.id.slice(-8) })}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {!hasReturnableItems && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {t('sinItems')}
          </AlertDescription>
        </Alert>
      )}

      {hasReturnableItems && (
        <>
          {/* Información de la venta */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg dark:text-white">{t('infoVenta')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-sm text-gray-600 dark:text-gray-400">{tComun('cliente')}</Label>
                  <div className="dark:text-gray-200">{sale.customer?.full_name || tComun('clienteGeneral')}</div>
                </div>
                <div>
                  <Label className="text-sm text-gray-600 dark:text-gray-400">{tComun('fecha')}</Label>
                  <div className="dark:text-gray-200">{formatDate(sale.sale_date)}</div>
                </div>
                <div>
                  <Label className="text-sm text-gray-600 dark:text-gray-400">{t('totalOriginal')}</Label>
                  <div className="text-lg font-bold text-green-600 dark:text-green-400">
                    {formatear(sale.total)}
                  </div>
                </div>
                <div>
                  <Label className="text-sm text-gray-600 dark:text-gray-400">{t('metodoPago')}</Label>
                  <div className="dark:text-gray-200">
                    {sale.payment_method ? nombreMetodoPago(sale.payment_method) : t('noEspecificado')}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Selección de items */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between dark:text-white">
                <span>{t('itemsParaDevolucion')}</span>
                <Badge variant="outline" className="dark:border-green-500 dark:text-green-400">
                  {t('seleccionados', { n: selectedItemsCount })}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="dark:border-gray-700">
                    <TableHead className="w-12 dark:text-gray-300"></TableHead>
                    <TableHead className="dark:text-gray-300">{tComun('producto')}</TableHead>
                    <TableHead className="dark:text-gray-300">{tComun('precioUnitario')}</TableHead>
                    <TableHead className="dark:text-gray-300">{tComun('disponible')}</TableHead>
                    <TableHead className="dark:text-gray-300">{t('aDevolver')}</TableHead>
                    <TableHead className="dark:text-gray-300">{tComun('reembolso')}</TableHead>
                    <TableHead className="dark:text-gray-300">{tComun('motivo')}</TableHead>
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
                          <div className="font-medium">{item.product_name || tComun('productoNoEncontrado')}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {t('cantidadOriginal', { n: item.original_quantity })}
                          </div>
                          {item.track_serial && item.available_serials.length > 0 && (
                            <Badge variant="secondary" className="mt-1 text-xs">
                              {t('serializado')}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        {formatear(item.unit_price)}
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        <Badge variant="outline" className="dark:border-blue-500 dark:text-blue-400">
                          {item.max_returnable}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.track_serial && item.available_serials.length > 0 ? (
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {item.available_serials.map(serial => (
                              <label
                                key={serial.id}
                                className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 px-2 py-1 rounded"
                              >
                                <Checkbox
                                  checked={item.selected_serial_ids.includes(serial.id)}
                                  onCheckedChange={() => handleSerialToggle(item.sale_item_id, serial.id)}
                                />
                                <span className="dark:text-gray-300 font-mono">{serial.serial}</span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <Input
                            type="number"
                            min={0}
                            max={item.max_returnable}
                            value={item.return_quantity}
                            onChange={(e) => handleQuantityChange(item.sale_item_id, parseInt(e.target.value) || 0)}
                            disabled={!item.selected}
                            className="w-20 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                          />
                        )}
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        <div className="font-bold text-orange-600 dark:text-orange-400">
                          {formatear(item.refund_amount)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={item.reason}
                          onValueChange={(value) => handleReasonChange(item.sale_item_id, value)}
                          disabled={!item.selected || loadingReasons}
                        >
                          <SelectTrigger className="w-44 dark:bg-gray-700 dark:border-gray-600">
                            <SelectValue placeholder={t('seleccionarMotivo')} />
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
                                <SelectItem value="defectuoso">{t('motivosRespaldo.defectuoso')}</SelectItem>
                                <SelectItem value="incorrecto">{t('motivosRespaldo.incorrecto')}</SelectItem>
                                <SelectItem value="dañado">{t('motivosRespaldo.danado')}</SelectItem>
                                <SelectItem value="no_conforme">{t('motivosRespaldo.noConforme')}</SelectItem>
                                <SelectItem value="garantia">{t('motivosRespaldo.garantia')}</SelectItem>
                                <SelectItem value="otro">{t('motivosRespaldo.otro')}</SelectItem>
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
                <span>{t('configuracionReembolso')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label className="dark:text-gray-300">{t('metodoReembolso')}</Label>
                    <Select value={refundMethod} onValueChange={(value) => setRefundMethod(value as 'cash' | 'credit_note' | 'original_method')}>
                      <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                        <SelectItem value="cash">
                          <div className="flex items-center space-x-2">
                            <DollarSign className="h-4 w-4" />
                            <span>{t('reembolsoEfectivo')}</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="credit_note">
                          <div className="flex items-center space-x-2">
                            <CreditCard className="h-4 w-4" />
                            <span>{t('notaCredito')}</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="original_method">
                          <div className="flex items-center space-x-2">
                            <Calculator className="h-4 w-4" />
                            <span>{t('metodoOriginal')}</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="dark:text-gray-300">{t('motivoGeneral')}</Label>
                    <RichTextEditor
                      placeholder={t('motivoGeneralPlaceholder')}
                      value={reason}
                      onChange={(html) => setReason(html)}
                      className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                  </div>

                  <div>
                    <Label className="dark:text-gray-300">{t('notasAdicionales')}</Label>
                    <RichTextEditor
                      placeholder={t('notasPlaceholder')}
                      value={notes}
                      onChange={(html) => setNotes(html)}
                      className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      minHeight={60}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <Card className="dark:bg-gray-900 dark:border-gray-600">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg dark:text-white">{t('resumen')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between">
                        <span className="dark:text-gray-300">{t('itemsSeleccionados')}</span>
                        <span className="font-medium dark:text-white">{selectedItemsCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="dark:text-gray-300">{t('cantidadTotal')}</span>
                        <span className="font-medium dark:text-white">
                          {returnItems.filter(item => item.selected).reduce((sum, item) => sum + item.return_quantity, 0)}
                        </span>
                      </div>
                      <Separator className="dark:bg-gray-700" />
                      <div className="flex justify-between text-lg">
                        <span className="font-medium dark:text-white">{t('totalReembolso')}</span>
                        <span className="font-bold text-red-600 dark:text-red-400">
                          {formatear(totalRefund)}
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
                      {tComun('cancelar')}
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={loading || selectedItemsCount === 0}
                      className="flex-1 bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
                    >
                      {loading ? t('procesando') : tComun('procesarDevolucion')}
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
