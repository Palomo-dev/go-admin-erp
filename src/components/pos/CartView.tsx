'use client';

import { useState } from 'react';
import { Minus, Plus, Trash2, ShoppingCart, Pause, Play, CreditCard, Package, FileText, Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { POSService } from '@/lib/services/posService';
import { PrintService } from '@/lib/services/printService';
import { Cart, CartItem, Sale, SaleItem, Customer } from './types';
import { formatCurrency } from '@/utils/Utils';
import { TaxSummary } from './TaxSummary';
import { toast } from 'sonner';
import DetalleFactura from '@/components/finanzas/facturas-venta/id/DetalleFactura';

interface CartViewProps {
  cart: Cart;
  onCartUpdate: (cart: Cart) => void;
  onCheckout: (cart: Cart) => void;
  onHold: (cart: Cart, reason?: string) => void;
  className?: string;
}

export function CartView({ cart, onCartUpdate, onCheckout, onHold, className }: CartViewProps) {
  const [showHoldDialog, setShowHoldDialog] = useState(false);
  const [holdReason, setHoldReason] = useState('');
  const [taxIncluded, setTaxIncluded] = useState(false);
  
  // Estados para Hold with Debt
  const [showHoldWithDebtDialog, setShowHoldWithDebtDialog] = useState(false);
  const [holdWithDebtReason, setHoldWithDebtReason] = useState('');
  const [paymentTerms, setPaymentTerms] = useState(30);
  const [isProcessingHoldWithDebt, setIsProcessingHoldWithDebt] = useState(false);
  
  // Estados para ver factura
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceData, setInvoiceData] = useState<any>(null);
  const [isLoadingInvoice, setIsLoadingInvoice] = useState(false);

  // Actualizar cantidad de un item
  const handleQuantityChange = async (itemId: string, newQuantity: number) => {
    try {
      const updatedCart = await POSService.updateCartItemQuantity(cart.id, itemId, newQuantity);
      onCartUpdate(updatedCart);
    } catch (error) {
      console.error('Error updating item quantity:', error);
    }
  };

  // Eliminar item del carrito
  const handleRemoveItem = async (itemId: string) => {
    try {
      const updatedCart = await POSService.removeItemFromCart(cart.id, itemId);
      onCartUpdate(updatedCart);
    } catch (error) {
      console.error('Error removing item:', error);
    }
  };

  // Poner carrito en espera
  const handleHold = async () => {
    try {
      const heldCart = await POSService.holdCart(cart.id, holdReason || 'Sin motivo especificado');
      onHold(heldCart, holdReason);
      setShowHoldDialog(false);
      setHoldReason('');
    } catch (error) {
      console.error('Error holding cart:', error);
    }
  };

  // Reactivar carrito
  const handleActivate = async () => {
    try {
      const activeCart = await POSService.activateCart(cart.id);
      onCartUpdate(activeCart);
    } catch (error) {
      console.error('Error activating cart:', error);
    }
  };

  // Poner carrito en espera con deuda
  const handleHoldWithDebt = async () => {
    setIsProcessingHoldWithDebt(true);
    try {
      const result = await POSService.holdCartWithDebt({
        cartId: cart.id,
        reason: holdWithDebtReason || 'Sin motivo especificado',
        paymentTerms,
        notes: `Total adeudado: ${formatCurrency(cart.total)}`
      });
      
      // Mostrar información del resultado
      toast.success('¡Deuda registrada exitosamente!', {
        description: `Factura ${result.invoice.number} por ${formatCurrency(result.invoice.total)}`
      });
      
      // Actualizar carrito
      onCartUpdate(result.cart);
      
      // Cerrar modal y limpiar campos
      setShowHoldWithDebtDialog(false);
      setHoldWithDebtReason('');
      setPaymentTerms(30);
    } catch (error: any) {
      console.error('Error holding cart with debt:', error);
      toast.error('Error al registrar deuda', {
        description: error.message || 'No se pudo crear la factura y cuenta por cobrar'
      });
    } finally {
      setIsProcessingHoldWithDebt(false);
    }
  };

  // Ver factura asociada al carrito con deuda
  const handleViewInvoice = async () => {
    setIsLoadingInvoice(true);
    try {
      const data = await POSService.getInvoiceForCart(cart.id);
      setInvoiceData(data);
      setShowInvoiceModal(true);
    } catch (error: any) {
      console.error('Error cargando factura:', error);
      toast.error('Error al cargar factura', {
        description: error.message || 'No se pudo obtener los datos de la factura'
      });
    } finally {
      setIsLoadingInvoice(false);
    }
  };

  // Imprimir factura asociada al carrito con deuda
  const handlePrintInvoice = async () => {
    try {
      const data = await POSService.getInvoiceForCart(cart.id);
      
      // Convertir datos de invoice a formato Sale para PrintService
      const saleData: Sale = {
        id: data.invoice.number,
        organization_id: data.invoice.organization_id,
        branch_id: data.invoice.branch_id || 1, // Default branch si no existe
        customer_id: data.customer.id,
        user_id: data.invoice.created_by || 'system',
        total: parseFloat(data.invoice.total),
        subtotal: parseFloat(data.invoice.subtotal),
        tax_total: parseFloat(data.invoice.tax_total),
        discount_total: 0,
        balance: parseFloat(data.invoice.total), // Balance inicial igual al total
        status: 'completed',
        payment_status: 'pending',
        sale_date: data.invoice.created_at,
        notes: data.invoice.notes,
        created_at: data.invoice.created_at,
        updated_at: data.invoice.updated_at
      };
      
      // Convertir items de factura a formato SaleItem
      const saleItems: SaleItem[] = data.items.map(item => ({
        id: item.id,
        sale_id: data.invoice.number, // Usar número de factura como sale_id
        product_id: item.product_id,
        quantity: parseFloat(item.qty),
        unit_price: parseFloat(item.unit_price),
        total: parseFloat(item.total_line),
        discount_amount: parseFloat(item.discount_amount || '0'),
        tax_amount: parseFloat(item.tax_amount || '0'),
        created_at: item.created_at || data.invoice.created_at,
        updated_at: item.updated_at || data.invoice.updated_at,
        // Agregar propiedades personalizadas para PrintService
        name: item.description || item.products?.name || 'Producto'
      } as SaleItem & { name: string }));
      
      // Datos del cliente convertidos
      const customerData: Customer = {
        id: data.customer.id,
        organization_id: data.customer.organization_id,
        full_name: `${data.customer.first_name} ${data.customer.last_name}`.trim(),
        email: data.customer.email || undefined,
        phone: data.customer.phone || undefined,
        doc_type: data.customer.identification_type,
        doc_number: data.customer.identification_number,
        address: data.customer.address,
        city: data.customer.city,
        country: data.customer.country,
        avatar_url: data.customer.avatar_url,
        roles: [], // Default empty array
        tags: [], // Default empty array
        preferences: {}, // Default empty object
        created_at: data.customer.created_at,
        updated_at: data.customer.updated_at
      };
      
      // Imprimir usando PrintService
      PrintService.smartPrint(
        saleData,
        saleItems,
        customerData,
        [], // No tenemos datos de pagos específicos
        'Mi Empresa', // TODO: obtener nombre de la organización
        'Dirección de la empresa' // TODO: obtener dirección de la organización
      );
      
      toast.success('Factura enviada a imprimir');
      
    } catch (error: any) {
      console.error('Error imprimiendo factura:', error);
      toast.error('Error al imprimir factura', {
        description: error.message || 'No se pudo imprimir la factura'
      });
    }
  };

  // Handler para cobrar deuda - llevar al checkout
  const handlePayDebt = () => {
    toast.info('Redirigiendo al checkout...', {
      description: 'Se procesará el pago de la deuda'
    });
    // Reactivar temporalmente para checkout
    onCheckout(cart);
  };

  // Cancelar deuda y reactivar carrito
  const handleCancelDebt = async () => {
    try {
      const activeCart = await POSService.activateCart(cart.id);
      onCartUpdate(activeCart);
      toast.success('Deuda cancelada', {
        description: 'El carrito ha sido reactivado. Nota: La factura y cuenta por cobrar permanecen en el sistema.'
      });
    } catch (error: any) {
      console.error('Error cancelando deuda:', error);
      toast.error('Error al cancelar deuda', {
        description: error.message || 'No se pudo reactivar el carrito'
      });
    }
  };

  const isEmpty = cart.items.length === 0;
  const isOnHold = cart.status === 'hold';
  const isOnHoldWithDebt = cart.status === 'hold_with_debt';
  const hasCustomer = !!cart.customer_id;

  return (
    <div className={`space-y-4 ${className}`}>
      <Card className={`${
        isOnHoldWithDebt 
          ? 'dark:border-orange-500/50 light:border-orange-400/50' 
          : isOnHold 
          ? 'dark:border-yellow-500/50 light:border-yellow-400/50' 
          : 'dark:border-gray-700 light:border-gray-200'
      } dark:bg-gray-800 light:bg-white`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2 dark:text-white light:text-gray-900">
              <ShoppingCart className="h-5 w-5" />
              <span>Carrito</span>
              {isOnHold && (
                <Badge variant="outline" className="dark:border-yellow-500 dark:text-yellow-400 light:border-yellow-500 light:text-yellow-600">
                  En Espera
                </Badge>
              )}
              {isOnHoldWithDebt && (
                <Badge variant="outline" className="dark:border-orange-500 dark:text-orange-400 light:border-orange-500 light:text-orange-600">
                  <FileText className="h-3 w-3 mr-1" />
                  Con Deuda
                </Badge>
              )}
            </CardTitle>
            {isOnHold && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleActivate}
                className="dark:border-green-500 dark:text-green-400 dark:hover:bg-green-500/10 light:border-green-500 light:text-green-600 light:hover:bg-green-50"
              >
                <Play className="h-4 w-4 mr-1" />
                Reactivar
              </Button>
            )}
            {isOnHoldWithDebt && (
              <div className="text-xs dark:text-orange-400 light:text-orange-600 mt-1">
                💳 Deuda registrada - Ver en Cuentas por Cobrar
              </div>
            )}
          </div>
          {cart.customer && (
            <div className="text-sm dark:text-gray-400 light:text-gray-600">
              Cliente: <span className="font-medium dark:text-white light:text-gray-900">{cart.customer.full_name}</span>
            </div>
          )}
        </CardHeader>
        
        <CardContent className="space-y-3">
          {/* Items del carrito */}
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {isEmpty ? (
              <div className="text-center py-8 dark:text-gray-400 light:text-gray-600">
                <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>El carrito está vacío</p>
                <p className="text-sm">Busca productos para agregar</p>
              </div>
            ) : (
              cart.items.map((item) => (
                <Card key={item.id} className="dark:bg-gray-700/50 light:bg-gray-50">
                  <CardContent className="p-3">
                    {/* Layout responsive: móvil vertical, desktop horizontal */}
                    <div className="space-y-3 lg:space-y-0">
                      {/* Información del producto */}
                      <div className="flex items-start justify-between lg:items-center">
                        <div className="flex-1 min-w-0 pr-3">
                          {/* Nombre del producto con ellipsis */}
                          <h4 className="font-medium text-sm sm:text-base dark:text-white light:text-gray-900 truncate" title={item.product.name}>
                            {item.product.name}
                          </h4>
                          
                          {/* Info secundaria responsive */}
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mt-1">
                            <Badge variant="outline" className="text-xs w-fit dark:border-gray-600 light:border-gray-300 shrink-0">
                              {item.product.sku}
                            </Badge>
                            <span className="text-xs sm:text-sm dark:text-gray-400 light:text-gray-600 truncate">
                              {formatCurrency(item.unit_price)} / {item.product.unit_code}
                            </span>
                          </div>
                          
                          {/* Mostrar impuestos si existen */}
                          {item.tax_amount && item.tax_amount > 0 && (
                            <div className="text-xs dark:text-green-400 light:text-green-600 mt-1">
                              +{formatCurrency(item.tax_amount)} impuestos
                            </div>
                          )}
                        </div>
                        
                        {/* Total del item - visible en desktop */}
                        <div className="hidden lg:block text-right min-w-[80px] ml-2">
                          <div className="font-semibold text-sm dark:text-white light:text-gray-900">
                            {formatCurrency(item.total)}
                          </div>
                          {item.quantity > 1 && (
                            <div className="text-xs dark:text-gray-400 light:text-gray-600">
                              {item.quantity} × {formatCurrency(item.unit_price)}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Controles: cantidad, total (móvil) y eliminar */}
                      <div className="flex items-center justify-between gap-3">
                        {/* Control de cantidad */}
                        <div className="flex items-center">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 sm:h-8 sm:w-8 p-0 dark:border-gray-600 dark:hover:bg-gray-600 light:border-gray-300 light:hover:bg-gray-100"
                            onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                            disabled={isOnHold}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => {
                              const newQuantity = parseInt(e.target.value) || 1;
                              if (newQuantity > 0) {
                                handleQuantityChange(item.id, newQuantity);
                              }
                            }}
                            className="w-12 sm:w-16 h-7 sm:h-8 text-center text-sm dark:bg-gray-800 dark:border-gray-600 light:bg-white light:border-gray-300 mx-1"
                            disabled={isOnHold}
                          />
                          
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 sm:h-8 sm:w-8 p-0 dark:border-gray-600 dark:hover:bg-gray-600 light:border-gray-300 light:hover:bg-gray-100"
                            onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                            disabled={isOnHold}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>

                        {/* Total del item - visible en móvil */}
                        <div className="lg:hidden text-right flex-1 min-w-0">
                          <div className="font-semibold text-sm dark:text-white light:text-gray-900">
                            {formatCurrency(item.total)}
                          </div>
                          {item.quantity > 1 && (
                            <div className="text-xs dark:text-gray-400 light:text-gray-600 truncate">
                              {item.quantity} × {formatCurrency(item.unit_price)}
                            </div>
                          )}
                        </div>

                        {/* Eliminar item */}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 sm:h-8 sm:w-8 p-0 dark:text-red-400 dark:hover:bg-red-500/10 light:text-red-600 light:hover:bg-red-50 shrink-0"
                          onClick={() => handleRemoveItem(item.id)}
                          disabled={isOnHold}
                        >
                          <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {!isEmpty && (
            <>
              {/* Resumen de Impuestos y Totales */}
              <TaxSummary 
                cart={cart}
                taxIncluded={taxIncluded}
                onTaxIncludedChange={setTaxIncluded}
                className="-mx-1"
              />

              {/* Botones de acción */}
              <div className="space-y-2">
                {isOnHoldWithDebt ? (
                  // Botones específicos para carritos con deuda
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewInvoice()}
                        disabled={isLoadingInvoice}
                        className="dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-500/10 light:border-blue-500 light:text-blue-600 light:hover:bg-blue-50"
                      >
                        {isLoadingInvoice ? (
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current mr-1" />
                        ) : (
                          <FileText className="h-3 w-3 mr-1" />
                        )}
                        <span className="text-xs">{isLoadingInvoice ? 'Cargando...' : 'Ver Factura'}</span>
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePrintInvoice()}
                        className="dark:border-gray-500 dark:text-gray-400 dark:hover:bg-gray-500/10 light:border-gray-500 light:text-gray-600 light:hover:bg-gray-50"
                      >
                        <Printer className="h-3 w-3 mr-1" />
                        <span className="text-xs">Imprimir</span>
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={() => handlePayDebt()}
                        className="dark:bg-green-600 dark:hover:bg-green-700 light:bg-green-600 light:hover:bg-green-700"
                        size="sm"
                      >
                        <CreditCard className="h-3 w-3 mr-1" />
                        <span className="text-xs">Cobrar Deuda</span>
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCancelDebt()}
                        className="dark:border-red-500 dark:text-red-400 dark:hover:bg-red-500/10 light:border-red-500 light:text-red-600 light:hover:bg-red-50"
                      >
                        <X className="h-3 w-3 mr-1" />
                        <span className="text-xs">Cancelar</span>
                      </Button>
                    </div>
                  </>
                ) : (
                  // Botones normales para carritos activos/hold
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowHoldDialog(true)}
                        disabled={isOnHold || isOnHoldWithDebt}
                        className="dark:border-yellow-500 dark:text-yellow-400 dark:hover:bg-yellow-500/10 light:border-yellow-500 light:text-yellow-600 light:hover:bg-yellow-50"
                      >
                        <Pause className="h-3 w-3 mr-1" />
                        <span className="text-xs">Espera</span>
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowHoldWithDebtDialog(true)}
                        disabled={isOnHold || isOnHoldWithDebt || !hasCustomer}
                        className="dark:border-orange-500 dark:text-orange-400 dark:hover:bg-orange-500/10 light:border-orange-500 light:text-orange-600 light:hover:bg-orange-50"
                        title={!hasCustomer ? 'Necesita cliente asignado' : 'Poner en espera con deuda registrada'}
                      >
                        <FileText className="h-3 w-3 mr-1" />
                        <span className="text-xs">Deuda</span>
                      </Button>
                    </div>
                    
                    <Button
                      onClick={() => onCheckout(cart)}
                      disabled={isOnHold || isOnHoldWithDebt}
                      className="w-full dark:bg-blue-600 dark:hover:bg-blue-700 light:bg-blue-600 light:hover:bg-blue-700"
                    >
                      <CreditCard className="h-4 w-4 mr-2" />
                      Cobrar
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialog para poner en espera */}
      <Dialog open={showHoldDialog} onOpenChange={setShowHoldDialog}>
        <DialogContent className="sm:max-w-md dark:bg-gray-900 dark:border-gray-800 light:bg-white light:border-gray-200">
          <DialogHeader>
            <DialogTitle className="dark:text-white light:text-gray-900">
              Poner Carrito en Espera
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hold_reason" className="dark:text-white light:text-gray-900">
                Motivo (opcional)
              </Label>
              <Textarea
                id="hold_reason"
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                placeholder="Ej: Cliente fue a buscar dinero, esperando autorización..."
                rows={3}
                className="dark:bg-gray-800 dark:border-gray-700 light:bg-white light:border-gray-300"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowHoldDialog(false)}
              className="dark:border-gray-700 dark:hover:bg-gray-800 light:border-gray-300 light:hover:bg-gray-50"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleHold}
              className="dark:bg-yellow-600 dark:hover:bg-yellow-700 light:bg-yellow-600 light:hover:bg-yellow-700"
            >
              <Pause className="h-4 w-4 mr-2" />
              Poner en Espera
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para poner en espera con deuda */}
      <Dialog open={showHoldWithDebtDialog} onOpenChange={setShowHoldWithDebtDialog}>
        <DialogContent className="sm:max-w-md dark:bg-gray-900 dark:border-gray-800 light:bg-white light:border-gray-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 dark:text-white light:text-gray-900">
              <FileText className="h-5 w-5 text-orange-500" />
              Registrar Deuda
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Resumen del carrito */}
            <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg border border-orange-200 dark:border-orange-800">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium dark:text-orange-300 light:text-orange-700">Cliente:</span>
                <span className="text-sm dark:text-orange-200 light:text-orange-800">
                  {cart.customer?.full_name || 'Sin cliente'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium dark:text-orange-300 light:text-orange-700">Total a adeudar:</span>
                <span className="text-lg font-bold dark:text-orange-200 light:text-orange-800">
                  {formatCurrency(cart.total)}
                </span>
              </div>
            </div>

            {/* Campo de motivo */}
            <div className="space-y-2">
              <Label htmlFor="hold_with_debt_reason" className="dark:text-white light:text-gray-900">
                Motivo de la deuda <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="hold_with_debt_reason"
                value={holdWithDebtReason}
                onChange={(e) => setHoldWithDebtReason(e.target.value)}
                placeholder="Ej: Cliente no tiene efectivo, pago diferido, venta a crédito..."
                rows={3}
                className="dark:bg-gray-800 dark:border-gray-700 light:bg-white light:border-gray-300"
                required
              />
            </div>

            {/* Campo de términos de pago */}
            <div className="space-y-2">
              <Label htmlFor="payment_terms" className="dark:text-white light:text-gray-900">
                Días para vencimiento
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="payment_terms"
                  type="number"
                  min="1"
                  max="365"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(Number(e.target.value))}
                  className="w-20 dark:bg-gray-800 dark:border-gray-700 light:bg-white light:border-gray-300"
                />
                <span className="text-sm dark:text-gray-400 light:text-gray-600">días</span>
                <span className="text-xs dark:text-gray-500 light:text-gray-500 ml-2">
                  (Vence: {new Date(Date.now() + paymentTerms * 24 * 60 * 60 * 1000).toLocaleDateString()})
                </span>
              </div>
            </div>

            {/* Información importante */}
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-xs dark:text-blue-300 light:text-blue-700">
                <strong>📋 Se creará:</strong>
              </p>
              <ul className="text-xs dark:text-blue-300 light:text-blue-700 mt-1 space-y-1 ml-4">
                <li>• Factura de venta oficial</li>
                <li>• Cuenta por cobrar en el sistema</li>
                <li>• Registro en historial del cliente</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowHoldWithDebtDialog(false);
                setHoldWithDebtReason('');
                setPaymentTerms(30);
              }}
              disabled={isProcessingHoldWithDebt}
              className="dark:border-gray-700 dark:hover:bg-gray-800 light:border-gray-300 light:hover:bg-gray-50"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleHoldWithDebt}
              disabled={isProcessingHoldWithDebt || !holdWithDebtReason.trim() || !hasCustomer}
              className="dark:bg-orange-600 dark:hover:bg-orange-700 light:bg-orange-600 light:hover:bg-orange-700"
            >
              {isProcessingHoldWithDebt ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Procesando...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Registrar Deuda
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para mostrar factura */}
      <Dialog open={showInvoiceModal} onOpenChange={setShowInvoiceModal}>
        <DialogContent className="w-[90vw] max-w-none h-[90vh] overflow-y-auto dark:bg-gray-900 dark:border-gray-800 light:bg-white light:border-gray-200">
          <DialogHeader>
            <DialogTitle className="dark:text-white light:text-gray-900">
              Detalle de Factura
            </DialogTitle>
          </DialogHeader>
          
          <div className="mt-4">
            {isLoadingInvoice ? (
              <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3" />
                <span className="dark:text-white light:text-gray-900">Cargando factura...</span>
              </div>
            ) : invoiceData ? (
              <DetalleFactura factura={invoiceData.invoice} />
            ) : (
              <p className="text-center dark:text-gray-400 light:text-gray-600 p-8">
                No se pudo cargar la factura
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
