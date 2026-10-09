'use client';

import { useState, useEffect, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, Package, CreditCard, DollarSign, Calculator, AlertTriangle, Camera, Receipt } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CampoNumero, FilaDato, ListaDatos, Tarjeta } from '@/components/kit';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DevolucionesService } from './devolucionesService';
import { ReturnReasonsService } from './motivos/returnReasonsService';
import { SaleForReturn, RefundData, ReturnReason, SoldSerialInfo } from './types';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { claveErrorDevolucion, codigoErrorDevolucion, montoReembolsoLinea } from '@/lib/pos/devoluciones/procesarDevolucion';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { toast } from 'sonner';
import { decimalesCantidad, esMedido, esPorPeso, redondearCantidadProducto, unidadVisible } from '@/lib/pos/peso/modoVenta';

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
  /** Total cobrado de la línea (con descuento e impuesto), no el precio de lista. */
  total_cobrado: number;
  refund_amount: number;
  reason: string;
  selected: boolean;
  max_returnable: number; // cantidad - ya devuelto
  track_serial: boolean;
  available_serials: SoldSerialInfo[];
  selected_serial_ids: number[];
  /** Decimales de la cantidad (0 por unidad; 3 en kg) y unidad visible («kg»). */
  decimales: number;
  /** Por peso o medida: se devuelve todo lo vendido de una vez (en gramos los decimales son 0). */
  medido: boolean;
  unidad: string | null;
  /** Producto por peso: «Reingresa» al inventario (por defecto no). */
  por_peso: boolean;
  restock: boolean;
}

export function ReturnForm({ sale, onBack, onSuccess }: ReturnFormProps) {
  const { formatear } = useMonedaOrganizacion();
  const tErrores = useTranslations('posDevoluciones.errores');
  const t = useTranslations('posDevoluciones.formulario');
  const tComun = useTranslations('posDevoluciones.comun');
  const { formatDate } = useFormatDate();
  const localeIntl = useLocale();
  const formatoDecimal = (n: number, item: { decimales: number }) =>
    new Intl.NumberFormat(localeIntl, { minimumFractionDigits: item.decimales, maximumFractionDigits: item.decimales }).format(n);
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
      total_cobrado: item.total,
      refund_amount: 0,
      reason: '',
      selected: false,
      max_returnable: item.quantity - (item.returned_quantity || 0),
      track_serial: item.product.track_serial || false,
      available_serials: item.serials || [],
      selected_serial_ids: [] as number[],
      decimales: esMedido(item.product) ? decimalesCantidad(item.product) : 0,
      medido: esMedido(item.product),
      unidad: unidadVisible(item.product),
      por_peso: esPorPeso(item.product),
      restock: false,
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
          // Por peso o medida se propone devolver todo lo disponible (0,735 kg), no «1».
          return_quantity: selected ? (item.medido ? item.max_returnable : Math.min(1, item.max_returnable)) : 0,
          refund_amount: selected
            ? montoReembolsoLinea(item.total_cobrado, item.original_quantity, item.medido ? item.max_returnable : Math.min(1, item.max_returnable))
            : 0
        };
      }
      return item;
    }));
  };

  const handleQuantityChange = (itemId: string, quantity: number) => {
    setReturnItems(prev => prev.map(item => {
      if (item.sale_item_id === itemId) {
        const validQuantity = Math.max(0, Math.min(redondearCantidadProducto(quantity, item.decimales), item.max_returnable));
        return {
          ...item,
          return_quantity: validQuantity,
          refund_amount: montoReembolsoLinea(item.total_cobrado, item.original_quantity, validQuantity),
          selected: validQuantity > 0
        };
      }
      return item;
    }));
  };

  // Producto por peso: «Reingresa» (por defecto no vuelve al inventario).
  const handleRestock = (itemId: string, restock: boolean) => {
    setReturnItems(prev => prev.map(item => (item.sale_item_id === itemId ? { ...item, restock } : item)));
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
          refund_amount: montoReembolsoLinea(item.total_cobrado, item.original_quantity, newQty),
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
          serial_number_ids: item.track_serial ? item.selected_serial_ids : undefined,
          ...(item.por_peso ? { restock: item.restock } : {}),
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
          <Tarjeta titulo={t('infoVenta')} icono={Receipt}>
            <ListaDatos etiqueta={t('infoVenta')}>
              <FilaDato etiqueta={tComun('cliente')} valor={sale.customer?.full_name || tComun('clienteGeneral')} />
              <FilaDato etiqueta={tComun('fecha')} valor={formatDate(sale.sale_date)} />
              <FilaDato etiqueta={t('totalOriginal')} valor={formatear(sale.total)} tono="fuerte" />
              <FilaDato etiqueta={t('metodoPago')} valor={sale.payment_method ? nombreMetodoPago(sale.payment_method) : t('noEspecificado')} />
            </ListaDatos>
          </Tarjeta>

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
                            {item.unidad
                              ? t('cantidadOriginalUnidad', { cantidad: formatoDecimal(item.original_quantity, item), unidad: item.unidad })
                              : t('cantidadOriginal', { n: item.original_quantity })}
                          </div>
                          {item.por_peso && (
                            <label className="mt-1 inline-flex cursor-pointer items-center gap-2 text-xs text-fg-secondary">
                              <Checkbox
                                checked={item.restock}
                                disabled={!item.selected}
                                onCheckedChange={(checked) => handleRestock(item.sale_item_id, checked === true)}
                                aria-label={t('reingresaDe', { producto: item.product_name })}
                              />
                              {t('reingresa')}
                            </label>
                          )}
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
                          {item.unidad ? `${formatoDecimal(item.max_returnable, item)} ${item.unidad}` : item.max_returnable}
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
                          <CampoNumero
                            valor={item.return_quantity}
                            onValorChange={(v) => handleQuantityChange(item.sale_item_id, v ?? 0)}
                            minimo={0}
                            maximo={item.max_returnable}
                            decimales={item.decimales}
                            sufijo={item.unidad ?? undefined}
                            disabled={!item.selected}
                            tamano="sm"
                            className="w-20"
                            aria-label={t('aDevolver')}
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
                  <Tarjeta titulo={t('resumen')}>
                    <ListaDatos etiqueta={t('resumen')}>
                      <FilaDato etiqueta={t('itemsSeleccionados')} valor={selectedItemsCount} />
                      <FilaDato
                        etiqueta={t('cantidadTotal')}
                        valor={returnItems.filter(item => item.selected).reduce((sum, item) => sum + item.return_quantity, 0)}
                      />
                      <FilaDato etiqueta={t('totalReembolso')} valor={formatear(totalRefund)} tono="fuerte" tamano="lg" separadorAntes />
                    </ListaDatos>
                  </Tarjeta>

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
