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
import { formatCurrency, cn } from '@/utils/Utils';
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

  // Anular deuda con nota de crédito
  const handleCancelDebt = async () => {
    try {
      const result = await POSService.cancelDebtWithCreditNote(cart.id);
      onCartUpdate(result.cart);
      toast.success('Deuda anulada exitosamente', {
        description: `Se creó la nota de crédito ${result.creditNote.number}. Todos los balances han sido saldados.`
      });
    } catch (error: any) {
      console.error('Error anulando deuda:', error);
      toast.error('Error al anular deuda', {
        description: error.message || 'No se pudo crear la nota de crédito'
      });
    }
  };

  const isEmpty = cart.items.length === 0;
  const isOnHold = cart.status === 'hold';
  const isOnHoldWithDebt = cart.status === 'hold_with_debt';
  const hasCustomer = !!cart.customer_id;

  return (
    <div className={`space-y-2 sm:space-y-3 ${className}`}>
      <Card className={cn(
        "shadow-lg",
        isOnHoldWithDebt 
          ? 'dark:border-orange-500/50 light:border-orange-400/50 dark:bg-gradient-to-br dark:from-gray-900 dark:to-orange-900/10' 
          : isOnHold 
          ? 'dark:border-yellow-500/50 light:border-yellow-400/50 dark:bg-gradient-to-br dark:from-gray-900 dark:to-yellow-900/10' 
          : 'dark:border-gray-800 light:border-gray-200 dark:bg-gray-900 light:bg-white'
      )}>
        <CardHeader className="p-2 sm:p-3 pb-2 shrink-0">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base dark:text-white light:text-gray-900">
                <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                <span>Carrito</span>
                {isOnHold && (
                  <Badge variant="outline" className="dark:border-yellow-600 dark:text-yellow-400 dark:bg-yellow-500/10 light:border-yellow-500 light:text-yellow-700 light:bg-yellow-50 text-xs px-1.5 py-0">
                    Espera
                  </Badge>
                )}
                {isOnHoldWithDebt && (
                  <Badge variant="outline" className="dark:border-orange-600 dark:text-orange-400 dark:bg-orange-500/10 light:border-orange-500 light:text-orange-700 light:bg-orange-50 text-xs px-1.5 py-0 flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    <span className="hidden xs:inline">Deuda</span>
                  </Badge>
                )}
              </CardTitle>
              {isOnHold && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleActivate}
                  className="h-7 sm:h-8 px-2 sm:px-3 dark:border-green-600 dark:text-green-400 dark:hover:bg-green-500/10 light:border-green-500 light:text-green-700 light:hover:bg-green-50 text-xs"
                >
                  <Play className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                  <span className="hidden xs:inline">Reactivar</span>
                </Button>
              )}
            </div>
            {isOnHoldWithDebt && (
              <div className="text-[0.7rem] sm:text-xs dark:text-orange-400 light:text-orange-600 flex items-center gap-1">
                <span>💳</span>
                <span className="hidden xs:inline">Deuda registrada - Ver en Cuentas por Cobrar</span>
                <span className="inline xs:hidden">Deuda registrada</span>
              </div>
            )}
            {cart.customer && (
              <div className="text-xs sm:text-sm dark:text-gray-400 light:text-gray-600 truncate">
                Cliente: <span className="font-medium dark:text-gray-200 light:text-gray-900">{cart.customer.full_name}</span>
              </div>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="p-2 sm:p-3 space-y-2 sm:space-y-3">
          {/* Items del carrito - COMPACTO CON MAX HEIGHT EN MÓVIL */}
          <div className="space-y-1.5 sm:space-y-2 max-h-[20vh] sm:max-h-[25vh] md:max-h-[30vh] lg:max-h-[40vh] overflow-y-auto">
            {isEmpty ? (
              <div className="flex flex-col items-center justify-center text-center py-4 sm:py-6 dark:text-gray-500 light:text-gray-500">
                <Package className="h-8 w-8 sm:h-10 sm:w-10 mx-auto mb-2 opacity-50" />
                <p className="text-xs sm:text-sm font-medium">El carrito está vacío</p>
                <p className="text-[0.65rem] sm:text-xs mt-1">Busca productos para agregar</p>
              </div>
            ) : (
              cart.items.map((item) => (
                <Card key={item.id} className="dark:bg-gray-800/50 dark:border-gray-700/50 light:bg-gray-50/50 light:border-gray-200 shadow-sm">
                  <CardContent className="p-2 sm:p-2.5">
                    {/* Layout responsive: móvil vertical, desktop horizontal */}
                    <div className="space-y-3 lg:space-y-0">
                      {/* Información del producto - RESPONSIVE */}
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0 pr-2">
                          {/* Nombre del producto con ellipsis */}
                          <h4 className="font-medium text-xs sm:text-sm dark:text-gray-100 light:text-gray-900 line-clamp-2 leading-tight" title={item.product.name}>
                            {item.product.name}
                          </h4>
                          
                          {/* Info secundaria responsive */}
                          <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 mt-1">
                            <Badge variant="outline" className="text-[0.65rem] sm:text-xs px-1 py-0 dark:border-gray-600 dark:text-gray-400 light:border-gray-400 light:text-gray-600 shrink-0">
                              {item.product.sku}
                            </Badge>
                            <span className="text-[0.65rem] sm:text-xs dark:text-gray-400 light:text-gray-600">
                              {formatCurrency(item.unit_price)} / {item.product.unit_code}
                            </span>
                          </div>
                          
                          {/* Mostrar impuestos si existen */}
                          {item.tax_amount && item.tax_amount > 0 && (
                            <div className="text-[0.65rem] sm:text-xs dark:text-green-400 light:text-green-600 mt-0.5 sm:mt-1">
                              +{formatCurrency(item.tax_amount)} impuestos
                            </div>
                          )}
                        </div>
                        
                        {/* Total del item - visible en desktop */}
                        <div className="hidden md:block text-right min-w-[70px] sm:min-w-[80px]">
                          <div className="font-semibold text-xs sm:text-sm dark:text-gray-100 light:text-gray-900">
                            {formatCurrency(item.total)}
                          </div>
                          {item.quantity > 1 && (
                            <div className="text-[0.65rem] sm:text-xs dark:text-gray-400 light:text-gray-600">
                              {item.quantity} × {formatCurrency(item.unit_price)}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Controles: cantidad, total (móvil) y eliminar - RESPONSIVE */}
                      <div className="flex items-center justify-between gap-2">
                        {/* Control de cantidad - COMPACTO */}
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 w-6 sm:h-7 sm:w-7 p-0 dark:border-gray-600 dark:hover:bg-gray-700 dark:text-gray-300 light:border-gray-300 light:hover:bg-gray-100 light:text-gray-700"
                            onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                            disabled={isOnHold}
                          >
                            <Minus className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
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
                            className="w-10 sm:w-12 h-6 sm:h-7 text-center text-xs sm:text-sm dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 light:bg-white light:border-gray-300 light:text-gray-900 px-1"
                            disabled={isOnHold}
                          />
                          
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 w-6 sm:h-7 sm:w-7 p-0 dark:border-gray-600 dark:hover:bg-gray-700 dark:text-gray-300 light:border-gray-300 light:hover:bg-gray-100 light:text-gray-700"
                            onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                            disabled={isOnHold}
                          >
                            <Plus className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                          </Button>
                        </div>

                        {/* Total del item - visible en móvil */}
                        <div className="md:hidden text-right flex-1 min-w-0">
                          <div className="font-semibold text-xs sm:text-sm dark:text-gray-100 light:text-gray-900">
                            {formatCurrency(item.total)}
                          </div>
                          {item.quantity > 1 && (
                            <div className="text-[0.65rem] sm:text-xs dark:text-gray-400 light:text-gray-600 truncate">
                              {item.quantity} × {formatCurrency(item.unit_price)}
                            </div>
                          )}
                        </div>

                        {/* Eliminar item */}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 sm:h-7 sm:w-7 p-0 dark:text-red-400 dark:hover:bg-red-500/20 light:text-red-600 light:hover:bg-red-100 shrink-0"
                          onClick={() => handleRemoveItem(item.id)}
                          disabled={isOnHold}
                          title="Eliminar item"
                        >
                          <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
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

              {/* Botones de acción - RESPONSIVE */}
              <div className="space-y-1.5 sm:space-y-2 shrink-0">
                {isOnHoldWithDebt ? (
                  // Botones específicos para carritos con deuda
                  <>
                    <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewInvoice()}
                        disabled={isLoadingInvoice}
                        className="h-8 sm:h-9 dark:border-blue-600 dark:text-blue-400 dark:hover:bg-blue-500/20 dark:bg-blue-500/10 light:border-blue-500 light:text-blue-700 light:hover:bg-blue-50 light:bg-blue-50/50 text-xs"
                      >
                        {isLoadingInvoice ? (
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current sm:mr-1" />
                        ) : (
                          <FileText className="h-3 w-3 sm:mr-1" />
                        )}
                        <span className="hidden xs:inline">{isLoadingInvoice ? 'Cargando...' : 'Ver Factura'}</span>
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePrintInvoice()}
                        className="h-8 sm:h-9 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 light:border-gray-400 light:text-gray-700 light:hover:bg-gray-100 text-xs"
                      >
                        <Printer className="h-3 w-3 sm:mr-1" />
                        <span className="hidden xs:inline">Imprimir</span>
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                      <Button
                        onClick={() => handlePayDebt()}
                        className="h-8 sm:h-9 dark:bg-green-600 dark:hover:bg-green-700 dark:text-white light:bg-green-600 light:hover:bg-green-700 light:text-white text-xs"
                        size="sm"
                      >
                        <CreditCard className="h-3 w-3 sm:mr-1" />
                        <span className="hidden xs:inline">Cobrar</span>
                        <span className="inline xs:hidden">$</span>
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCancelDebt()}
                        className="h-8 sm:h-9 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-500/20 light:border-red-500 light:text-red-700 light:hover:bg-red-50 text-xs"
                      >
                        <X className="h-3 w-3 sm:mr-1" />
                        <span className="hidden xs:inline">Anular</span>
                      </Button>
                    </div>
                  </>
                ) : (
                  // Botones normales para carritos activos/hold
                  <>
                    <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowHoldDialog(true)}
                        disabled={isOnHold || isOnHoldWithDebt}
                        className="h-8 sm:h-9 dark:border-yellow-600 dark:text-yellow-400 dark:hover:bg-yellow-500/20 dark:bg-yellow-500/10 light:border-yellow-500 light:text-yellow-700 light:hover:bg-yellow-50 light:bg-yellow-50/50 text-xs"
                      >
                        <Pause className="h-3 w-3 mr-1" />
                        <span className="text-xs">Espera</span>
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowHoldWithDebtDialog(true)}
                        disabled={isOnHold || isOnHoldWithDebt || !hasCustomer}
                        className="h-8 sm:h-9 dark:border-orange-600 dark:text-orange-400 dark:hover:bg-orange-500/20 dark:bg-orange-500/10 light:border-orange-500 light:text-orange-700 light:hover:bg-orange-50 light:bg-orange-50/50 text-xs"
                        title={!hasCustomer ? 'Necesita cliente asignado' : 'Poner en espera con deuda registrada'}
                      >
                        <FileText className="h-3 w-3 sm:mr-1" />
                        <span className="hidden xs:inline">Deuda</span>
                      </Button>
                    </div>
                    
                    <Button
                      onClick={() => onCheckout(cart)}
                      disabled={isOnHold || isOnHoldWithDebt}
                      className="w-full h-10 sm:h-11 lg:h-10 dark:bg-blue-600 dark:hover:bg-blue-700 light:bg-blue-600 light:hover:bg-blue-700 text-sm sm:text-base font-semibold shadow-lg"
                    >
                      <CreditCard className="h-4 w-4 sm:mr-2" />
                      <span className="hidden xs:inline">Cobrar</span>
                      <span className="inline xs:hidden">$</span>
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialog para poner en espera - RESPONSIVE */}
      <Dialog open={showHoldDialog} onOpenChange={setShowHoldDialog}>
        <DialogContent className="sm:max-w-md max-w-[95vw] dark:bg-gray-900 dark:border-gray-800 light:bg-white light:border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg dark:text-white light:text-gray-900">
              Poner Carrito en Espera
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-3 sm:space-y-4">
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="hold_reason" className="text-sm dark:text-gray-200 light:text-gray-900">
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
