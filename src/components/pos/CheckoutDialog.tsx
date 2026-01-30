'use client';

import { useState, useEffect } from 'react';
import { Calculator, CreditCard, DollarSign, Receipt, Printer, CheckCircle, Banknote, User } from 'lucide-react';
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
import { PrintService, BusinessInfo, CashierInfo, BranchInfo } from '@/lib/services/printService';
import { Cart, PaymentMethod, CheckoutData, Sale, Currency, SaleItem } from './types';
import { formatCurrency } from '@/utils/Utils';
import { 
  calculateCartTaxes, 
  type OrganizationTax as TaxUtilOrganizationTax,
  type TaxCalculationItem 
} from '@/lib/utils/taxCalculations';

interface CheckoutDialogProps {
  cart: Cart;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCheckoutComplete: (sale: Sale) => void;
  organization?: {
    name?: string;
    legal_name?: string;
    nit?: string;
    tax_id?: string;
    address?: string;
    city?: string;
    phone?: string;
    email?: string;
  };
  currentUser?: {
    name?: string;
    email?: string;
  };
  branch?: {
    name?: string;
    address?: string;
    city?: string;
    phone?: string;
  };
}

interface PaymentEntry {
  id: string;
  method: string;
  amount: number;
}

export function CheckoutDialog({ cart, open, onOpenChange, onCheckoutComplete, organization, currentUser, branch }: CheckoutDialogProps) {
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
  
  // Estados para propina
  const [tipAmount, setTipAmount] = useState(0);
  const [tipPercentage, setTipPercentage] = useState<number | null>(null);
  const [serverId, setServerId] = useState<string>('');
  const [servers, setServers] = useState<{ id: string; name: string }[]>([]);
  
  // Calculados - usar totales con impuestos + propina
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const baseTotal = calculatedTotals.finalTotal > 0 ? calculatedTotals.finalTotal : cart.total;
  const cartTotal = baseTotal + tipAmount;
  const remaining = Math.max(0, cartTotal - totalPaid);
  const change = Math.max(0, totalPaid - cartTotal);
  const canComplete = totalPaid >= cartTotal;

  // Cargar métodos de pago, moneda e impuestos
  useEffect(() => {
    if (open) {
      loadPaymentData();
      loadTaxData();
      loadServers();
      // Agregar primer método de pago por defecto
      if (payments.length === 0) {
        addPayment();
      }
      // Reset propina
      setTipAmount(0);
      setTipPercentage(null);
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
  
  const loadServers = async () => {
    try {
      const members = await POSService.getOrganizationMembers();
      setServers(members.map(m => ({
        id: m.user_id,
        name: m.users?.raw_user_meta_data?.full_name || 
              m.users?.raw_user_meta_data?.name || 
              m.users?.email || 'Sin nombre'
      })));
    } catch (error) {
      console.error('Error loading servers:', error);
    }
  };
  
  const handleTipPercentage = (percentage: number) => {
    if (tipPercentage === percentage) {
      // Deseleccionar si ya está seleccionado
      setTipPercentage(null);
      setTipAmount(0);
    } else {
      setTipPercentage(percentage);
      const calculatedTip = Math.round(baseTotal * (percentage / 100));
      setTipAmount(calculatedTip);
    }
  };
  
  const handleTipAmountChange = (value: number) => {
    setTipPercentage(null);
    setTipAmount(value);
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
        tax_included: taxIncluded,
        tip_amount: tipAmount,
        tip_server_id: serverId && serverId !== '__none__' ? serverId : undefined
      };

      const sale = await POSService.checkout(checkoutData);
      setCompletedSale(sale);
      setShowReceipt(true);
      
      // NO cerrar automáticamente - el usuario debe cerrar manualmente después de imprimir
      
    } catch (error) {
      console.error('Error during checkout:', error);
      alert('Error al procesar el pago: ' + error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrint = () => {
    if (completedSale) {
      // Convertir items del carrito a formato SaleItem para impresión
      const saleItems = cart.items.map(item => ({
        id: item.id,
        sale_id: completedSale.id,
        product_id: item.product?.id || 0,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: (item as any).discount || 0,
        tax: (item as any).tax || 0,
        total: item.total,
        notes: { product_name: item.product?.name || 'Producto' },
        product_name: item.product?.name || 'Producto',
        product: item.product
      }));

      // Crear array de pagos para el ticket
      const paymentsList = payments.map(p => ({
        id: p.id,
        method: p.method,
        amount: p.amount
      }));

      // Datos del negocio para el ticket
      const businessInfo: BusinessInfo = {
        name: organization?.name || 'GO Admin ERP',
        legalName: organization?.legal_name,
        nit: organization?.nit,
        taxId: organization?.tax_id,
        address: organization?.address,
        city: organization?.city,
        phone: organization?.phone,
        email: organization?.email
      };

      // Datos del cajero
      const cashierInfo: CashierInfo = {
        name: currentUser?.name || 'Sistema POS',
        email: currentUser?.email
      };

      // Datos de la sucursal
      const branchInfo: BranchInfo = branch ? {
        name: branch.name,
        address: branch.address,
        city: branch.city,
        phone: branch.phone
      } : undefined as any;

      // Usar PrintService para generar e imprimir el ticket formateado
      PrintService.printTicket(
        completedSale,
        saleItems as any,
        cart.customer as any,
        paymentsList as any,
        businessInfo,
        cashierInfo,
        branchInfo
      );
    }
  };

  const handleCloseReceipt = () => {
    if (completedSale) {
      onCheckoutComplete(completedSale);
    }
    onOpenChange(false);
    setPayments([]);
    setShowReceipt(false);
    setCompletedSale(null);
    setTipAmount(0);
    setTipPercentage(null);
    setServerId('');
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
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto dark:bg-gray-900 dark:border-gray-800 light:bg-white light:border-gray-200 p-4 sm:p-6">
        {showReceipt && completedSale ? (
          /* Vista de recibo - RESPONSIVE */
          <div className="space-y-3 sm:space-y-4 text-center">
            <div className="p-4 sm:p-6">
              <CheckCircle className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-3 sm:mb-4 text-green-600 dark:text-green-400" />
              <h2 className="text-xl sm:text-2xl font-bold mb-2 dark:text-white light:text-gray-900">
                ¡Venta Completada!
              </h2>
              <p className="text-sm sm:text-base dark:text-gray-400 light:text-gray-600">
                Venta #{completedSale.id.slice(-8)} procesada exitosamente
              </p>
              
              <div className="bg-gray-100 dark:bg-gray-800 p-3 sm:p-4 rounded-lg mt-3 sm:mt-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm sm:text-base dark:text-gray-400 light:text-gray-600">Total:</span>
                  <span className="font-bold text-base sm:text-lg dark:text-white light:text-gray-900">
                    {formatCurrency(completedSale.total)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm sm:text-base dark:text-gray-400 light:text-gray-600">Pagado:</span>
                  <span className="text-sm sm:text-base dark:text-green-400 light:text-green-600 font-semibold">
                    {formatCurrency(totalPaid)}
                  </span>
                </div>
                {change > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm sm:text-base dark:text-gray-400 light:text-gray-600">Cambio:</span>
                    <span className="text-sm sm:text-base dark:text-blue-400 light:text-blue-600 font-semibold">
                      {formatCurrency(change)}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 mt-3 sm:mt-4">
                <Button
                  onClick={handlePrint}
                  className="flex-1 h-10 sm:h-11 dark:bg-blue-600 dark:hover:bg-blue-700 light:bg-blue-600 light:hover:bg-blue-700 text-sm sm:text-base"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir Recibo
                </Button>
                <Button
                  onClick={handleCloseReceipt}
                  variant="outline"
                  className="flex-1 h-10 sm:h-11 text-sm sm:text-base dark:border-gray-600 dark:hover:bg-gray-800"
                >
                  Cerrar
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* Vista de checkout - RESPONSIVE */
          <>
            <DialogHeader className="pb-3 sm:pb-4">
              <DialogTitle className="flex items-center gap-2 text-base sm:text-lg dark:text-white light:text-gray-900">
                <CreditCard className="h-4 w-4 sm:h-5 sm:w-5" />
                <span>Procesar Pago</span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 sm:space-y-4 md:space-y-6">
              {/* Resumen del carrito - RESPONSIVE */}
              <Card className="dark:bg-gray-800 dark:border-gray-700 light:bg-gray-50 light:border-gray-200">
                <CardHeader className="p-3 sm:p-4 pb-2 sm:pb-3">
                  <CardTitle className="text-xs sm:text-sm dark:text-white light:text-gray-900">
                    Resumen de Venta
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 sm:p-4 space-y-1.5 sm:space-y-2 max-h-[30vh] overflow-y-auto">
                  {cart.items.map((item) => (
                    <div key={item.id} className="flex justify-between items-start gap-2 text-xs sm:text-sm">
                      <div className="flex-1 min-w-0">
                        <span className="dark:text-gray-100 light:text-gray-900 line-clamp-1">{item.product.name}</span>
                        <span className="dark:text-gray-400 light:text-gray-600 ml-1">
                          x{item.quantity}
                        </span>
                      </div>
                      <span className="dark:text-gray-100 light:text-gray-900 font-medium shrink-0">
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

              {/* Métodos de pago - RESPONSIVE */}
              <Card className="dark:bg-gray-800 dark:border-gray-700 light:bg-white light:border-gray-200">
                <CardHeader className="p-3 sm:p-4 pb-2 sm:pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-xs sm:text-sm dark:text-white light:text-gray-900">
                      Métodos de Pago
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={addPayment}
                      className="h-7 sm:h-8 px-2 sm:px-3 text-xs dark:border-gray-700 dark:hover:bg-gray-800 dark:text-gray-300 light:border-gray-300 light:hover:bg-gray-50 light:text-gray-700"
                    >
                      <span className="hidden xs:inline">Agregar</span>
                      <span className="inline xs:hidden">+</span>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-3 sm:p-4 space-y-3 sm:space-y-4">
                  {payments.map((payment, index) => (
                    <div key={payment.id} className="space-y-2 sm:space-y-3 p-2 sm:p-3 border rounded-lg dark:border-gray-700 dark:bg-gray-900/30 light:border-gray-200 light:bg-gray-50/50">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs sm:text-sm dark:text-gray-200 light:text-gray-900 font-medium">
                          Pago {index + 1}
                        </Label>
                        {payments.length > 1 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removePayment(payment.id)}
                            className="h-7 px-2 text-xs dark:text-red-400 dark:hover:bg-red-500/20 light:text-red-600 light:hover:bg-red-50"
                          >
                            Eliminar
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
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

                      {/* Botones de montos rápidos solo para efectivo - RESPONSIVE */}
                      {payment.method === 'cash' && (
                        <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-1 sm:gap-2">
                          {quickAmountButtons.map((button) => (
                            <Button
                              key={button.label}
                              size="sm"
                              variant="outline"
                              onClick={() => updatePayment(payment.id, 'amount', button.value)}
                              className="h-8 sm:h-9 text-[0.7rem] sm:text-xs px-2 sm:px-3 dark:border-gray-700 dark:hover:bg-gray-800 dark:text-gray-300 light:border-gray-300 light:hover:bg-gray-100 light:text-gray-700"
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

                  {/* Sección de Propina */}
                  <div className="pt-3 border-t dark:border-gray-700 light:border-gray-200">
                    <div className="flex items-center gap-2 mb-3">
                      <Banknote className="h-4 w-4 dark:text-green-400 light:text-green-600" />
                      <Label className="text-sm font-medium dark:text-gray-200 light:text-gray-900">
                        Propina (opcional)
                      </Label>
                    </div>
                    
                    {/* Botones de porcentaje */}
                    <div className="grid grid-cols-4 gap-2 mb-3">
                      {[5, 10, 15, 20].map((pct) => (
                        <Button
                          key={pct}
                          type="button"
                          size="sm"
                          variant={tipPercentage === pct ? "default" : "outline"}
                          onClick={() => handleTipPercentage(pct)}
                          className={`h-9 text-xs ${
                            tipPercentage === pct
                              ? 'bg-green-600 hover:bg-green-700 text-white'
                              : 'dark:border-gray-600 dark:hover:bg-gray-700 light:border-gray-300 light:hover:bg-gray-100'
                          }`}
                        >
                          {pct}%
                        </Button>
                      ))}
                    </div>
                    
                    {/* Monto personalizado */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs dark:text-gray-400 light:text-gray-600">
                          Monto personalizado
                        </Label>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 dark:text-gray-400 light:text-gray-500" />
                          <Input
                            type="number"
                            min="0"
                            step="100"
                            value={tipAmount || ''}
                            onChange={(e) => handleTipAmountChange(Number(e.target.value) || 0)}
                            placeholder="0"
                            className="pl-10 dark:bg-gray-800 dark:border-gray-700 light:bg-white light:border-gray-300"
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-1">
                        <Label className="text-xs dark:text-gray-400 light:text-gray-600">
                          Mesero (opcional)
                        </Label>
                        <Select value={serverId} onValueChange={setServerId}>
                          <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700 light:bg-white light:border-gray-300">
                            <SelectValue placeholder="Seleccionar..." />
                          </SelectTrigger>
                          <SelectContent className="dark:bg-gray-900 dark:border-gray-800 light:bg-white light:border-gray-200">
                            <SelectItem value="__none__">Sin asignar</SelectItem>
                            {servers.map((server) => (
                              <SelectItem key={server.id} value={server.id}>
                                {server.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    {tipAmount > 0 && (
                      <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <div className="flex justify-between items-center text-sm">
                          <span className="dark:text-green-400 light:text-green-700">Propina:</span>
                          <span className="font-semibold dark:text-green-400 light:text-green-700">
                            {formatCurrency(tipAmount)}
                          </span>
                        </div>
                      </div>
                    )}
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

            <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isProcessing}
                className="w-full sm:w-auto h-10 sm:h-11 dark:border-gray-700 dark:hover:bg-gray-800 dark:text-gray-300 light:border-gray-300 light:hover:bg-gray-50 light:text-gray-700 text-sm sm:text-base"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCheckout}
                disabled={!canComplete || isProcessing}
                className={`
                  w-full sm:w-auto h-10 sm:h-11 text-sm sm:text-base font-semibold shadow-lg
                  ${canComplete
                    ? 'dark:bg-green-600 dark:hover:bg-green-700 light:bg-green-600 light:hover:bg-green-700'
                    : 'dark:bg-gray-700 dark:text-gray-400 light:bg-gray-400 light:text-gray-200'
                  }
                `}
              >
                <Calculator className="h-4 w-4 mr-2" />
                <span className="hidden xs:inline">{isProcessing ? 'Procesando...' : canComplete ? 'Completar Venta' : 'Falta dinero'}</span>
                <span className="inline xs:hidden">{isProcessing ? 'Procesando...' : canComplete ? 'Completar' : 'Falta $'}</span>
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
