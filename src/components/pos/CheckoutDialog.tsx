'use client';

import { useState, useEffect } from 'react';
import { Calculator, CreditCard, DollarSign, Receipt, Printer, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { POSService } from '@/lib/services/posService';
import { Cart, PaymentMethod, CheckoutData, Sale, Currency } from './types';
import { formatCurrency } from '@/utils/Utils';
import { 
  calculateCartTaxes, 
  type OrganizationTax as TaxUtilOrganizationTax,
  type TaxCalculationItem 
} from '@/lib/utils/taxCalculations';

// 🚀 SISTEMA AUTOMÁTICO DE TRIGGERS
import systemEventManager from '@/lib/utils/eventTriggerUtils';

interface CheckoutDialogProps {
  cart: Cart;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCheckoutComplete: (sale: Sale) => void;
}

interface PaymentEntry {
  id: string;
  method: string;
  amount: number;
}

export function CheckoutDialog({ cart, open, onOpenChange, onCheckoutComplete }: CheckoutDialogProps) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  
  // Estados para manejo de impuestos
  const [organizationTaxes, setOrganizationTaxes] = useState<TaxUtilOrganizationTax[]>([]);
  const [appliedTaxes, setAppliedTaxes] = useState<{[key: string]: boolean}>({});
  const [taxIncluded, setTaxIncluded] = useState(false);
  const [calculatedTotals, setCalculatedTotals] = useState({
    subtotal: 0,
    totalTaxAmount: 0,
    finalTotal: 0
  });
  
  // Calculados - usar totales con impuestos
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const cartTotal = calculatedTotals.finalTotal > 0 ? calculatedTotals.finalTotal : cart.total;
  const remaining = Math.max(0, cartTotal - totalPaid);
  const change = Math.max(0, totalPaid - cartTotal);
  const canComplete = totalPaid >= cartTotal;

  // Cargar métodos de pago, moneda e impuestos
  useEffect(() => {
    if (open) {
      loadPaymentData();
      loadTaxData();
      // Agregar primer método de pago por defecto
      if (payments.length === 0) {
        addPayment();
      }
    }
  }, [open]);
  
  // Calcular totales con impuestos cuando cambie el carrito o configuración de impuestos
  useEffect(() => {
    calculateCartTotals();
  }, [cart.items, organizationTaxes, appliedTaxes, taxIncluded]);

  const loadPaymentData = async () => {
    try {
      const [methods, baseCurrency] = await Promise.all([
        POSService.getPaymentMethods(),
        POSService.getBaseCurrency()
      ]);
      
      setPaymentMethods(methods);
      setCurrency(baseCurrency);
    } catch (error) {
      console.error('Error loading payment data:', error);
    }
  };
  
  const loadTaxData = async () => {
    try {
      const taxes = await POSService.getOrganizationTaxes();
      const orgTaxes: TaxUtilOrganizationTax[] = taxes.map(tax => ({
        id: tax.id,
        name: tax.name,
        rate: parseFloat(tax.rate.toString()),
        is_default: tax.is_default,
        is_active: tax.is_active
      }));
      
      setOrganizationTaxes(orgTaxes);
      
      // Inicializar impuestos aplicados con los predeterminados
      const initialAppliedTaxes: {[key: string]: boolean} = {};
      orgTaxes.forEach((tax) => {
        initialAppliedTaxes[tax.id] = tax.is_default;
      });
      setAppliedTaxes(initialAppliedTaxes);
      
    } catch (error) {
      console.error('Error loading tax data:', error);
    }
  };
  
  const calculateCartTotals = async () => {
    if (!cart.items.length || !organizationTaxes.length) {
      setCalculatedTotals({ subtotal: 0, totalTaxAmount: 0, finalTotal: 0 });
      return;
    }

    let combinedSubtotal = 0;
    let combinedTaxAmount = 0;
    let combinedFinalTotal = 0;

    // Procesar cada ítem del carrito
    for (const item of cart.items) {
      try {
        const productTaxes = await POSService.getProductTaxes(item.product_id);
        
        const taxItem: TaxCalculationItem = {
          quantity: item.quantity,
          unit_price: item.unit_price,
          product_id: item.product_id
        };
        
        let result;
        
        if (productTaxes.length > 0) {
          // Usar impuestos específicos del producto
          const productAppliedTaxes: {[key: string]: boolean} = {};
          const productOrgTaxes: TaxUtilOrganizationTax[] = [];
          
          productTaxes.forEach(relation => {
            if (relation.organization_taxes && relation.organization_taxes.is_active) {
              productAppliedTaxes[relation.organization_taxes.id] = true;
              productOrgTaxes.push({
                id: relation.organization_taxes.id,
                name: relation.organization_taxes.name,
                rate: parseFloat(relation.organization_taxes.rate.toString()),
                is_default: relation.organization_taxes.is_default,
                is_active: relation.organization_taxes.is_active
              });
            }
          });
          
          result = calculateCartTaxes(
            [taxItem],
            productAppliedTaxes,
            productOrgTaxes,
            taxIncluded
          );
        } else {
          // Usar impuestos de organización
          result = calculateCartTaxes(
            [taxItem],
            appliedTaxes,
            organizationTaxes,
            taxIncluded
          );
        }
        
        // Acumular totales
        combinedSubtotal += result.subtotal;
        combinedTaxAmount += result.totalTaxAmount;
        combinedFinalTotal += result.finalTotal;
        
      } catch (error) {
        console.error('Error calculating taxes for item:', item, error);
        // En caso de error, agregar el ítem sin impuestos
        const lineTotal = item.quantity * item.unit_price;
        combinedSubtotal += lineTotal;
        combinedFinalTotal += lineTotal;
      }
    }
    
    // Actualizar estado con totales calculados
    setCalculatedTotals({
      subtotal: Math.round(combinedSubtotal * 100) / 100,
      totalTaxAmount: Math.round(combinedTaxAmount * 100) / 100,
      finalTotal: Math.round(combinedFinalTotal * 100) / 100
    });
  };

  const addPayment = () => {
    const newPayment: PaymentEntry = {
      id: crypto.randomUUID(),
      method: 'cash',
      amount: remaining
    };
    setPayments([...payments, newPayment]);
  };

  const updatePayment = (id: string, field: 'method' | 'amount', value: string | number) => {
    setPayments(payments.map(payment =>
      payment.id === id
        ? { ...payment, [field]: field === 'amount' ? Number(value) || 0 : value }
        : payment
    ));
  };

  const removePayment = (id: string) => {
    if (payments.length > 1) {
      setPayments(payments.filter(payment => payment.id !== id));
    }
  };

  const handleCheckout = async () => {
    if (!canComplete) return;

    setIsProcessing(true);
    try {
      // Crear cart actualizado con totales calculados con impuestos
      const updatedItems = cart.items.map(item => {
        // Calcular proporción de impuestos para este item
        const itemSubtotal = item.quantity * item.unit_price;
        const taxProportion = calculatedTotals.subtotal > 0 
          ? itemSubtotal / calculatedTotals.subtotal 
          : 0;
        const itemTaxAmount = calculatedTotals.totalTaxAmount * taxProportion;
        const itemTaxRate = itemSubtotal > 0 ? (itemTaxAmount / itemSubtotal) * 100 : 0;

        return {
          ...item,
          total: itemSubtotal + itemTaxAmount,
          tax_amount: itemTaxAmount,
          tax_rate: itemTaxRate
        };
      });

      const updatedCart: Cart = {
        ...cart,
        items: updatedItems,
        subtotal: calculatedTotals.subtotal,
        tax_total: calculatedTotals.totalTaxAmount,
        tax_amount: calculatedTotals.totalTaxAmount, // Alias for compatibility
        total: calculatedTotals.finalTotal
      };

      const checkoutData: CheckoutData = {
        cart: updatedCart,
        payments: payments.map(p => ({ method: p.method, amount: p.amount })),
        change,
        total_paid: totalPaid,
        tax_included: taxIncluded
      };

      const sale = await POSService.checkout(checkoutData);
      setCompletedSale(sale);
      setShowReceipt(true);
      
      // 🚀 DISPARAR TRIGGER AUTOMÁTICO DE FACTURA CREADA
      try {
        console.log('🎯 Disparando trigger automático para factura creada:', sale.id);
        
        // Preparar datos del evento para triggers
        const eventData = {
          invoice_id: sale.id?.toString() || 'N/A',
          customer_name: updatedCart.customer?.full_name || 'Cliente',
          customer_email: updatedCart.customer?.email || 'no-email@example.com',
          amount: sale.total || updatedCart.total,
          currency: 'COP', // TODO: obtener de configuración
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 días
          order_date: new Date().toISOString().split('T')[0],
          subtotal: sale.subtotal || updatedCart.subtotal,
          tax_total: sale.tax_total || (updatedCart.total - updatedCart.subtotal),
          // Datos adicionales para las plantillas
          company_name: 'GO Admin ERP',
          payment_method: payments[0]?.method || 'efectivo',
          // Agregar productos para imágenes automáticas
          products: updatedCart.items.map(item => ({
            name: item.product?.name || 'Producto',
            sku: item.product?.sku || `SKU-${item.product_id}`,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total: item.total
          }))
        };
        
        // Disparar evento automáticamente
        await systemEventManager.onInvoiceCreated(
          eventData, 
          updatedCart.organization_id || 2 // Fallback a organización 2
        );
        
        console.log('✅ Trigger automático ejecutado exitosamente');
        
      } catch (triggerError) {
        // Error en triggers no debe afectar el checkout
        console.error('⚠️ Error ejecutando triggers automáticos:', triggerError);
        console.warn('💡 El checkout fue exitoso, pero los triggers automáticos fallaron');
      }
      
      // Resetear el dialog después de un momento
      setTimeout(() => {
        onCheckoutComplete(sale);
        onOpenChange(false);
        setPayments([]);
        setShowReceipt(false);
        setCompletedSale(null);
      }, 3000);
      
    } catch (error) {
      console.error('Error during checkout:', error);
      alert('Error al procesar el pago: ' + error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrint = () => {
    if (completedSale) {
      // Implementar impresión del ticket
      window.print();
    }
  };

  const quickAmountButtons = [
    { label: '10k', value: 10000 },
    { label: '20k', value: 20000 },
    { label: '50k', value: 50000 },
    { label: '100k', value: 100000 },
    { label: 'Exacto', value: cart.total }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto dark:bg-gray-900 dark:border-gray-800 light:bg-white light:border-gray-200">
        {showReceipt && completedSale ? (
          /* Vista de recibo */
          <div className="space-y-4 text-center">
            <div className="p-6">
              <CheckCircle className="h-16 w-16 mx-auto mb-4 text-green-600 dark:text-green-400" />
              <h2 className="text-2xl font-bold mb-2 dark:text-white light:text-gray-900">
                ¡Venta Completada!
              </h2>
              <p className="dark:text-gray-400 light:text-gray-600">
                Venta #{completedSale.id.slice(-8)} procesada exitosamente
              </p>
              
              <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg mt-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="dark:text-gray-400 light:text-gray-600">Total:</span>
                  <span className="font-bold text-lg dark:text-white light:text-gray-900">
                    {formatCurrency(completedSale.total)}
                  </span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="dark:text-gray-400 light:text-gray-600">Pagado:</span>
                  <span className="dark:text-green-400 light:text-green-600">
                    {formatCurrency(totalPaid)}
                  </span>
                </div>
                {change > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="dark:text-gray-400 light:text-gray-600">Cambio:</span>
                    <span className="dark:text-blue-400 light:text-blue-600">
                      {formatCurrency(change)}
                    </span>
                  </div>
                )}
              </div>

              <Button
                onClick={handlePrint}
                className="mt-4 dark:bg-blue-600 dark:hover:bg-blue-700 light:bg-blue-600 light:hover:bg-blue-700"
              >
                <Printer className="h-4 w-4 mr-2" />
                Imprimir Recibo
              </Button>
            </div>
          </div>
        ) : (
          /* Vista de checkout */
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center space-x-2 dark:text-white light:text-gray-900">
                <CreditCard className="h-5 w-5" />
                <span>Procesar Pago</span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              {/* Resumen del carrito */}
              <Card className="dark:bg-gray-800 dark:border-gray-700 light:bg-gray-50 light:border-gray-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm dark:text-white light:text-gray-900">
                    Resumen de Venta
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {cart.items.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <div className="flex-1">
                        <span className="dark:text-white light:text-gray-900">{item.product.name}</span>
                        <span className="dark:text-gray-400 light:text-gray-600 ml-2">
                          x{item.quantity}
                        </span>
                      </div>
                      <span className="dark:text-white light:text-gray-900">
                        {formatCurrency(item.total)}
                      </span>
                    </div>
                  ))}
                  
                  <Separator className="dark:border-gray-700 light:border-gray-200" />
                  
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="dark:text-gray-400 light:text-gray-600">Subtotal:</span>
                      <span className="dark:text-white light:text-gray-900">
                        {formatCurrency(cart.subtotal)}
                      </span>
                    </div>
                    
                    {cart.tax_total > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="dark:text-gray-400 light:text-gray-600">Impuestos:</span>
                        <span className="dark:text-white light:text-gray-900">
                          {formatCurrency(cart.tax_total)}
                        </span>
                      </div>
                    )}
                    
                    {cart.discount_total > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="dark:text-gray-400 light:text-gray-600">Descuentos:</span>
                        <span className="dark:text-green-400 light:text-green-600">
                          -{formatCurrency(cart.discount_total)}
                        </span>
                      </div>
                    )}
                    
                    <div className="flex justify-between text-lg font-semibold pt-1">
                      <span className="dark:text-white light:text-gray-900">Total:</span>
                      <span className="dark:text-blue-400 light:text-blue-600">
                        {formatCurrency(cart.total)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Métodos de pago */}
              <Card className="dark:bg-gray-800 dark:border-gray-700 light:bg-white light:border-gray-200">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm dark:text-white light:text-gray-900">
                      Métodos de Pago
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={addPayment}
                      className="dark:border-gray-700 dark:hover:bg-gray-800 light:border-gray-300 light:hover:bg-gray-50"
                    >
                      Agregar Pago
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {payments.map((payment, index) => (
                    <div key={payment.id} className="space-y-3 p-3 border rounded-lg dark:border-gray-700 light:border-gray-200">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm dark:text-white light:text-gray-900">
                          Pago {index + 1}
                        </Label>
                        {payments.length > 1 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removePayment(payment.id)}
                            className="dark:text-red-400 dark:hover:bg-red-500/10 light:text-red-600 light:hover:bg-red-50"
                          >
                            Eliminar
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor={`method-${payment.id}`} className="text-xs dark:text-gray-400 light:text-gray-600">
                            Método
                          </Label>
                          <Select
                            value={payment.method}
                            onValueChange={(value) => updatePayment(payment.id, 'method', value)}
                          >
                            <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700 light:bg-white light:border-gray-300">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="dark:bg-gray-900 dark:border-gray-800 light:bg-white light:border-gray-200">
                              {paymentMethods.map((method) => (
                                <SelectItem key={method.id} value={method.id}>
                                  {method.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`amount-${payment.id}`} className="text-xs dark:text-gray-400 light:text-gray-600">
                            Monto
                          </Label>
                          <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 dark:text-gray-400 light:text-gray-500" />
                            <Input
                              id={`amount-${payment.id}`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={payment.amount}
                              onChange={(e) => updatePayment(payment.id, 'amount', e.target.value)}
                              className="pl-10 dark:bg-gray-800 dark:border-gray-700 light:bg-white light:border-gray-300"
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Botones de montos rápidos solo para efectivo */}
                      {payment.method === 'cash' && (
                        <div className="flex flex-wrap gap-2">
                          {quickAmountButtons.map((button) => (
                            <Button
                              key={button.label}
                              size="sm"
                              variant="outline"
                              onClick={() => updatePayment(payment.id, 'amount', button.value)}
                              className="text-xs dark:border-gray-700 dark:hover:bg-gray-800 light:border-gray-300 light:hover:bg-gray-50"
                            >
                              {button.label}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Toggle impuestos incluidos */}
                  <div className="pt-2 pb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={taxIncluded}
                        onChange={(e) => setTaxIncluded(e.target.checked)}
                        className="h-3 w-3"
                      />
                      <span className="text-xs dark:text-gray-300 light:text-gray-700">
                        Impuestos incluidos en precios
                      </span>
                    </label>
                  </div>

                  {/* Resumen de pagos con impuestos */}
                  <div className="pt-4 space-y-2">
                    {/* Subtotal */}
                    <div className="flex justify-between text-sm">
                      <span className="dark:text-gray-400 light:text-gray-600">Subtotal:</span>
                      <div className="text-right">
                        <span className="dark:text-white light:text-gray-900">
                          {formatCurrency(calculatedTotals.subtotal)}
                        </span>
                        {taxIncluded && (
                          <div className="text-xs dark:text-gray-500 light:text-gray-500">
                            (base imponible)
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Impuestos */}
                    {calculatedTotals.totalTaxAmount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="dark:text-gray-400 light:text-gray-600">Impuestos:</span>
                        <span className="dark:text-blue-400 light:text-blue-600">
                          {formatCurrency(calculatedTotals.totalTaxAmount)}
                        </span>
                      </div>
                    )}

                    {/* Separador */}
                    <Separator className="dark:bg-gray-700 light:bg-gray-200" />

                    {/* Total a pagar */}
                    <div className="flex justify-between text-base font-semibold">
                      <span className="dark:text-gray-300 light:text-gray-700">Total a pagar:</span>
                      <span className="dark:text-white light:text-gray-900">
                        {formatCurrency(cartTotal)}
                      </span>
                    </div>

                    <div className="flex justify-between text-sm">
                      <span className="dark:text-gray-400 light:text-gray-600">Total pagado:</span>
                      <span className={totalPaid >= cartTotal ? 'dark:text-green-400 light:text-green-600' : 'dark:text-yellow-400 light:text-yellow-600'}>
                        {formatCurrency(totalPaid)}
                      </span>
                    </div>
                    {remaining > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="dark:text-gray-400 light:text-gray-600">Falta:</span>
                        <span className="dark:text-red-400 light:text-red-600">
                          {formatCurrency(remaining)}
                        </span>
                      </div>
                    )}
                    {change > 0 && (
                      <div className="flex justify-between text-lg font-semibold">
                        <span className="dark:text-white light:text-gray-900">Cambio:</span>
                        <span className="dark:text-blue-400 light:text-blue-600">
                          {formatCurrency(change)}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isProcessing}
                className="dark:border-gray-700 dark:hover:bg-gray-800 light:border-gray-300 light:hover:bg-gray-50"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCheckout}
                disabled={!canComplete || isProcessing}
                className={`
                  ${canComplete
                    ? 'dark:bg-green-600 dark:hover:bg-green-700 light:bg-green-600 light:hover:bg-green-700'
                    : 'dark:bg-gray-600 light:bg-gray-400'
                  }
                `}
              >
                <Calculator className="h-4 w-4 mr-2" />
                {isProcessing ? 'Procesando...' : canComplete ? 'Completar Venta' : 'Falta dinero'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
