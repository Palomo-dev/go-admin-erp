'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Check, CheckCircle, ChefHat, FileText, Pause, Send, ShoppingCart } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { CampoNumero, CartTag, Dialogo, DialogoMotivo, EmptyState, FilaDato, FormField, ListaDatos, PanelAdaptable, useAtajos } from '@/components/kit';
import { Textarea } from '@/components/ui/textarea';
import { AccionesCarrito } from '@/components/pos/venta/AccionesCarrito';
import { DialogoDescuento } from '@/components/pos/venta/DialogoDescuento';
import { hayRafagaDelLector } from '@/hooks/useHardwareBarcodeScanner';
import { teclaAtajo } from '@/lib/pos/venta/atajos';
import { todayInTz } from '@/lib/utils/dateCore';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { sumarDiasCalendario } from '@/lib/utils/taskReminderDates';
import { POSService } from '@/lib/services/posService';
import { PrintService } from '@/lib/services/printService';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import KitchenService from '@/lib/services/kitchenService';
import { supabase } from '@/lib/supabase/config';
import { Cart, CartItem, Sale, SaleItem, Customer, Payment } from './types';
import { cn } from '@/utils/Utils';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { TaxSummary, type TaxSummaryTotals } from './TaxSummary';
import { useLineasSinImpuesto } from '@/hooks/useLineasSinImpuesto';
import { getPosDisplayEmitter } from '@/lib/pos/display/posDisplay';
import { toast } from 'sonner';
// El detalle nuevo lee la factura del servidor y registra pagos por el pago único
// (el viejo `id/DetalleFactura` escribía desde el navegador y se retiró).
import { DetalleFacturaVenta } from '@/components/finanzas/facturas-venta/detalle/DetalleFacturaVenta';
import type { KitchenTicket } from '@/lib/services/kitchenService';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { mensajeErrorCobro } from '@/lib/pos/erroresCobro';
import { aplicarNotaALinea, type CambioNotaLinea } from '@/lib/pos/cocina/lineasCarrito';
import type { DestinoNota } from '@/components/pos/cocina/ChipsNotasRapidas';
import { lineasParaAviso } from '@/lib/pos/venta/lineasSinImpuesto';
import { estadoBotonCobrar, puedeConfirmarDeuda, puedeRegistrarDeuda } from '@/lib/pos/venta/requisitosCarrito';
// `CartProduct` y `requiresPreparation` se movieron literales a lineaCarrito.ts (paso 6): las usa también la línea.
import { requiresPreparation, type CartProduct } from '@/lib/pos/venta/lineaCarrito';
import { LineasCarrito } from '@/components/pos/venta/carrito/LineasCarrito';

type KitchenTicketStatus = KitchenTicket['status'];

/**
 * Formas mínimas de lo que devuelve POSService.getInvoiceForCart (el servicio
 * lo tipa como `any`): solo los campos que se leen aquí. Los importes de
 * `invoice_items` son `numeric` y pueden llegar como string.
 */
interface InvoiceItemRow {
  id: string;
  product_id?: number;
  qty: string | number;
  unit_price: string | number;
  total_line: string | number;
  discount_amount?: string | number | null;
  tax_amount?: string | number | null;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
  products?: { name: string; sku?: string } | null;
}

/** Fila de `payments` de la factura (select *): solo lo que el ticket necesita para pintar «Pagos». */
interface InvoicePaymentRow {
  id: string;
  method?: string;
  payment_method?: string;
  amount: string | number;
  status?: string;
  payment_date?: string;
  created_at?: string;
  updated_at?: string;
}

/** Lo que PrintService lee de cada línea además de `SaleItem` (nombre y producto para el ticket). */
type PrintableSaleItem = SaleItem & {
  name: string;
  product_name: string;
  product?: { name: string; sku?: string };
};

/** Mensaje legible de un error de Supabase o de una excepción cualquiera. */
function errorMessage(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return undefined;
}

interface CartViewProps {
  cart: Cart;
  onCartUpdate: (cart: Cart) => void;
  onCheckout: (cart: Cart) => void;
  onHold: (cart: Cart, reason?: string) => void;
  onSendComanda?: (cart: Cart) => Promise<void>;
  className?: string;
  cashSessionActive?: boolean;
  /**
   * false apaga los atajos del carrito (la página lo hace con el cobro
   * abierto). Por defecto encendidos: los de la línea solo disparan con el
   * foco dentro de una línea.
   */
  atajosActivos?: boolean;
  /**
   * La organización exige caja para cobrar (`pos_require_cash_session`, D4).
   * Por defecto sí: sin caja el botón es «Abrir caja para cobrar · F9».
   */
  requiereCaja?: boolean;
  /** «Abrir caja para cobrar · F9»: abre el diálogo de apertura (lo monta la página). */
  onAbrirCaja?: () => void;
}

export function CartView({ cart, onCartUpdate, onCheckout, onHold, onSendComanda, className, cashSessionActive = true, atajosActivos = true, requiereCaja = true, onAbrirCaja }: CartViewProps) {
  const { timezone } = useOrgTimezone();
  // «Descuento · D» (paso 10): diálogo con la pestaña «A un producto».
  const [showDiscountDialog, setShowDiscountDialog] = useState(false);
  const onDescuento = () => setShowDiscountDialog(true);
  const moneda = useMonedaOrganizacion();
  const { formatear } = moneda;
  const [showHoldDialog, setShowHoldDialog] = useState(false);
  const [holdReason, setHoldReason] = useState('');
  const [taxIncluded, setTaxIncluded] = useState(cart.tax_included ?? false);

  // Sincronizar taxIncluded cuando cambian los items del carrito
  useEffect(() => {
    if (cart.items.length > 0 && cart.items.every(item => item.tax_included)) {
      setTaxIncluded(true);
    } else if (cart.items.length > 0 && !cart.items.some(item => item.tax_included)) {
      setTaxIncluded(false);
    }
  }, [cart.items]);

  // Sincronizar el flag con el carrito (memoria + storage) para que persista y el diálogo de pago lo refleje
  const handleTaxIncludedChange = async (value: boolean) => {
    setTaxIncluded(value);
    try {
      const recalculatedCart = await POSService.updateCartTaxSettings(cart.id, { tax_included: value });
      onCartUpdate(recalculatedCart);
    } catch (err) {
      console.error('Error persistiendo tax_included:', err);
    }
  };

  const handleAppliedTaxesChange = (taxIds: string[]) => {
    onCartUpdate({ ...cart, applied_tax_ids: taxIds });
    POSService.updateCartTaxSettings(cart.id, { applied_tax_ids: taxIds }).catch(err =>
      console.error('Error persistiendo applied_tax_ids:', err)
    );
  };

  // Totales que ve el cajero (TaxSummary, con `tax_excluded` por línea y el
  // override de organization_taxes) → pantalla del cliente (PLAN §8: la
  // pantalla repite lo que el recibo repetirá).
  //
  // Al cambiar de carrito (cobro que lo elimina y activa el siguiente) este
  // callback cambia de identidad y TaxSummary reenvía sus totales VIEJOS
  // antes de recalcular: sin la comprobación de `cartId` la pantalla
  // mostraba el total de la venta anterior sobre el carrito nuevo. Con
  // subtotal 0 (impuestos aún sin cargar, o carrito a $0) se retira el
  // override y la pantalla usa los totales del propio carrito.
  //
  // Además del id, TaxSummary etiqueta los totales con la FIRMA de las líneas
  // con las que los calculó (`linesSignature`, Fase 2): el emisor descarta un
  // reenvío de totales viejos cuando las líneas ya cambiaron (misma id, otra
  // firma), en vez de mostrarlos durante los cientos de ms del recálculo.
  // Líneas que se cobrarán sin IVA porque ni el producto ni la organización
  // tienen impuesto configurado (misma regla que resolveLineTax en el cobro).
  // (L30: la forma de las líneas vive en src/lib/pos/venta/lineasSinImpuesto.ts.)
  const lineasAviso = useMemo(() => lineasParaAviso(cart.items), [cart.items]);
  const { indices: indicesSinImpuesto } = useLineasSinImpuesto(cart.organization_id, lineasAviso);

  const cartId = cart.id;
  const cartDiscountTotal = cart.discount_total;
  const handleTotalsChange = useCallback(
    (totals: TaxSummaryTotals) => {
      if (totals.cartId !== cartId) return;
      if (!(totals.subtotal > 0)) {
        getPosDisplayEmitter().setTotals(cartId, null);
        return;
      }
      getPosDisplayEmitter().setTotals(
        cartId,
        {
          discountTotal: cartDiscountTotal,
          taxTotal: totals.totalTaxAmount,
          total: totals.finalTotal,
        },
        totals.linesSignature,
      );
    },
    [cartId, cartDiscountTotal],
  );
  
  // Estados para Hold with Debt
  const [showHoldWithDebtDialog, setShowHoldWithDebtDialog] = useState(false);
  const [holdWithDebtReason, setHoldWithDebtReason] = useState('');
  const [paymentTerms, setPaymentTerms] = useState(30);
  const [isProcessingHoldWithDebt, setIsProcessingHoldWithDebt] = useState(false);
  
  // Estados para ver factura
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceData, setInvoiceData] = useState<Awaited<ReturnType<typeof POSService.getInvoiceForCart>> | null>(null);
  const [isLoadingInvoice, setIsLoadingInvoice] = useState(false);

  // Estado para envío de comanda
  const [isSendingComanda, setIsSendingComanda] = useState(false);

  // «Anular» la deuda pide motivo (el servidor lo exige, ≥ 3 caracteres) y confirma (H10).
  const [showCancelDebtDialog, setShowCancelDebtDialog] = useState(false);
  const [isCancellingDebt, setIsCancellingDebt] = useState(false);
  const [cancelDebtError, setCancelDebtError] = useState<string | null>(null);
  const tCarrito = useTranslations('posVenta.carrito');
  const tAtajosCarrito = useTranslations('posVenta.atajos');

  // Estado para edición de notas por item
  const [editingNotesItemId, setEditingNotesItemId] = useState<string | null>(null);
  const [itemNotesValue, setItemNotesValue] = useState('');
  const [noteDestino, setNoteDestino] = useState<DestinoNota>('cocina');
  const [noteAlergia, setNoteAlergia] = useState(false);
  const tNotas = useTranslations('posNotasLinea');
  const tCobro = useTranslations('posCobroServidor');

  // Estado para descuentos frecuentes por item
  const [frequentDiscountsMap, setFrequentDiscountsMap] = useState<Record<number, number[]>>({});
  const [editingDiscountItemId, setEditingDiscountItemId] = useState<string | null>(null);
  const [discountInputValue, setDiscountInputValue] = useState('');

  // Cargar descuentos frecuentes automáticamente para todos los items del carrito
  useEffect(() => {
    const productIds = cart.items
      .map(item => item.product_id)
      .filter(id => id && !frequentDiscountsMap[id]);
    if (productIds.length === 0) return;
    productIds.forEach(async (productId) => {
      try {
        const discounts = await POSService.getFrequentDiscounts(productId, cart.organization_id);
        setFrequentDiscountsMap(prev => ({ ...prev, [productId]: discounts }));
      } catch (error) {
        console.error('Error loading frequent discounts for product', productId, error);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.items.map(i => i.product_id).join(',')]);

  // Estado del kitchen ticket en tiempo real
  const [kitchenStatus, setKitchenStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!cart.kitchen_ticket_id) {
      setKitchenStatus(null);
      return;
    }

    // Cargar estado inicial
    KitchenService.getKitchenTickets().then(tickets => {
      const ticket = tickets.find(t => t.id === cart.kitchen_ticket_id);
      if (ticket) setKitchenStatus(ticket.status);
    }).catch(() => {});

    // Suscribirse a cambios en tiempo real del ticket específico
    const channel = supabase
      .channel(`kitchen_ticket_${cart.kitchen_ticket_id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'kitchen_tickets',
          filter: `id=eq.${cart.kitchen_ticket_id}`
        },
        (payload: { new?: Partial<Pick<KitchenTicket, 'status'>> }) => {
          if (payload.new?.status) {
            setKitchenStatus(payload.new.status);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [cart.kitchen_ticket_id, cart.branch_id]);

  // Detectar si hay items que requieren preparación
  const hasPreparationItems = cart.items.some(item => requiresPreparation(item.product as CartProduct | undefined));

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

  // Toggle impuesto por ítem (excluir/incluir en esta transacción).
  // Se guarda con la línea (N1): antes vivía solo en pantalla y se perdía con
  // la siguiente operación del servicio o al recargar. Misma semántica: no
  // recalcula el carrito (ver POS-CARRITO-LINEAS-NOTAS.md §7).
  const handleToggleTax = async (itemId: string) => {
    const item = cart.items.find(i => i.id === itemId);
    if (!item) return;
    const newValue = !item.tax_excluded;
    onCartUpdate({ ...cart, items: cart.items.map(i => (i.id === itemId ? { ...i, tax_excluded: newValue } : i)) });
    try {
      onCartUpdate(await POSService.updateCartItemTaxExcluded(cart.id, itemId, newValue));
    } catch (err) {
      console.error('Error guardando tax_excluded del item:', err);
      toast.error(tNotas('errorExcluirImpuesto'));
    }
  };

  // Toggle impuesto incluido en el precio para un item especifico
  const handleToggleItemTaxIncluded = async (itemId: string) => {
    const item = cart.items.find(i => i.id === itemId);
    if (!item) return;
    const newValue = !item.tax_included;
    const updatedItems = cart.items.map(i =>
      i.id === itemId ? { ...i, tax_included: newValue } : i
    );
    onCartUpdate({ ...cart, items: updatedItems });
    try {
      const recalculatedCart = await POSService.updateItemTaxIncluded(cart.id, itemId, newValue);
      onCartUpdate(recalculatedCart);
    } catch (err) {
      console.error('Error actualizando tax_included del item:', err);
    }
  };

  // Guardar la nota de un item del carrito (cocina o cliente, y si es alergia).
  // Se guarda con la línea en el carrito persistido (N1).
  const handleSaveNotes = async (itemId: string) => {
    const cambio: CambioNotaLinea = noteDestino === 'cliente'
      ? { cliente: itemNotesValue }
      : { cocina: itemNotesValue, alergia: noteAlergia };
    onCartUpdate({ ...cart, items: cart.items.map(i => (i.id === itemId ? aplicarNotaALinea(i, cambio) : i)) });
    setEditingNotesItemId(null);
    setItemNotesValue('');
    try {
      onCartUpdate(await POSService.updateCartItemNote(cart.id, itemId, cambio));
    } catch (err) {
      console.error('Error guardando la nota del item:', err);
      toast.error(tNotas('errorNota'));
    }
  };

  // Iniciar edición de notas de un item
  const handleStartEditNotes = (itemId: string, destino: DestinoNota = 'cocina') => {
    const item = cart.items.find(i => i.id === itemId);
    setEditingNotesItemId(itemId);
    setNoteDestino(destino);
    setNoteAlergia(item?.is_allergy === true);
    setItemNotesValue((destino === 'cliente' ? item?.customer_note : item?.notes) || '');
  };

  const handleCambiarDestinoNota = (itemId: string, destino: DestinoNota) => {
    if (destino === noteDestino) return;
    handleStartEditNotes(itemId, destino);
  };

  // Cargar descuentos frecuentes de un producto
  const handleLoadFrequentDiscounts = async (productId: number) => {
    if (frequentDiscountsMap[productId]) return;
    try {
      const discounts = await POSService.getFrequentDiscounts(productId, cart.organization_id);
      setFrequentDiscountsMap(prev => ({ ...prev, [productId]: discounts }));
    } catch (error) {
      console.error('Error loading frequent discounts:', error);
    }
  };

  // Aplicar descuento a un item del carrito
  const handleApplyDiscount = async (itemId: string, discountAmount: number) => {
    try {
      const updatedCart = await POSService.updateCartItemDiscount(cart.id, itemId, discountAmount);
      onCartUpdate(updatedCart);
      setEditingDiscountItemId(null);
      setDiscountInputValue('');
    } catch (error) {
      console.error('Error applying discount:', error);
      toast.error(tCarrito('errorDescuento'), { description: mensajeErrorCobro(error, tCobro, tCarrito('errorDescuento')) });
    }
  };

  // Iniciar edición de descuento
  const handleStartEditDiscount = (itemId: string, currentDiscount?: number) => {
    setEditingDiscountItemId(itemId);
    setDiscountInputValue(currentDiscount ? String(currentDiscount) : '');
  };

  // Abrir el editor de descuento de una línea («+ Agregar descuento», su
  // etiqueta «-$X» o la tecla D): lo mismo que hacían el enlace y la etiqueta.
  const handleOpenDiscount = (item: CartItem) => {
    handleStartEditDiscount(item.id, item.discount_amount);
    handleLoadFrequentDiscounts(item.product_id);
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
      // Marcar kitchen_ticket como entregado si existe
      if (cart.kitchen_ticket_id) {
        await KitchenService.markTicketAsDelivered(cart.kitchen_ticket_id);
      }

      const result = await POSService.holdCartWithDebt({
        cartId: cart.id,
        reason: holdWithDebtReason || 'Sin motivo especificado',
        paymentTerms,
        notes: `Total adeudado: ${formatear(cart.total)}`
      });
      
      // Mostrar información del resultado
      toast.success(tCarrito('deudaRegistrada'), {
        description: tCarrito('deudaRegistradaDescripcion', { numero: String(result.invoice.number), total: formatear(result.invoice.total) }),
      });

      // Pantalla del cliente: la venta a crédito ya se facturó → «Gracias»
      // con el total de la FACTURA (el mismo que el toast de arriba): con
      // líneas «excluir impuesto» u override de organization_taxes,
      // invoice.total (calculateCartTaxesComplete) difiere de cart.total y
      // la pantalla debe repetir la cifra del recibo (PLAN §4.3). Number()
      // porque el total viene de la fila de invoice_sales (numeric → puede
      // llegar como string); si no es un número finito el emisor cae al
      // total proyectado. A los 8 s el emisor pasa a reposo (un carrito con
      // deuda no se proyecta como pedido pendiente). El emisor nunca lanza.
      getPosDisplayEmitter().setMode('thanks', { total: Number(result.invoice.total) || cart.total });

      // Actualizar carrito
      onCartUpdate(result.cart);
      
      // Cerrar modal y limpiar campos
      setShowHoldWithDebtDialog(false);
      setHoldWithDebtReason('');
      setPaymentTerms(30);
    } catch (error: unknown) {
      console.error('Error holding cart with debt:', error);
      toast.error(tCarrito('errorDeuda'), {
        description: mensajeErrorCobro(error, tCobro, tCarrito('errorDeudaDescripcion'))
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
    } catch (error: unknown) {
      console.error('Error cargando factura:', error);
      toast.error(tCarrito('errorFactura'), {
        description: errorMessage(error) || tCarrito('errorFacturaDescripcion')
      });
    } finally {
      setIsLoadingInvoice(false);
    }
  };

  // Imprimir factura asociada al carrito con deuda
  const handlePrintInvoice = async () => {
    try {
      const data = await POSService.getInvoiceForCart(cart.id);

      // Obtener datos del negocio y sucursal desde la BD
      const { business, branch: branchInfo } = await PrintService.getBusinessAndBranch(data.invoice.organization_id);

      // Obtener datos del cajero
      let cashierName: string | undefined;
      let cashierEmail: string | undefined;
      try {
        const { data: authData } = await supabase.auth.getUser();
        const authUser = authData?.user;
        if (authUser) {
          cashierEmail = authUser.email;
          const { data: profile } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', authUser.id)
            .maybeSingle();
          const fullName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();
          if (fullName) cashierName = fullName;
        }
      } catch (e) {
        console.warn('No se pudo obtener el cajero:', e);
      }

      // Convertir datos de invoice a formato Sale para PrintService
      const saleData: Sale = {
        id: data.invoice.number,
        organization_id: data.invoice.organization_id,
        branch_id: data.invoice.branch_id || 1,
        customer_id: data.customer?.id,
        user_id: data.invoice.created_by || 'system',
        total: parseFloat(data.invoice.total),
        subtotal: parseFloat(data.invoice.subtotal),
        tax_total: parseFloat(data.invoice.tax_total),
        discount_total: (data.items as InvoiceItemRow[]).reduce((sum, item) => sum + parseFloat(String(item.discount_amount || '0')), 0),
        balance: parseFloat(data.invoice.balance || data.invoice.total),
        tax_included: data.invoice.tax_included,
        status: 'completed',
        payment_status: parseFloat(data.invoice.balance || data.invoice.total) > 0 ? 'partial' : 'paid',
        sale_date: data.invoice.created_at,
        notes: data.invoice.notes,
        created_at: data.invoice.created_at,
        updated_at: data.invoice.updated_at,
      };

      // Convertir items de factura a formato SaleItem
      const saleItems: PrintableSaleItem[] = (data.items as InvoiceItemRow[]).map((item) => ({
        id: item.id,
        sale_id: data.invoice.number,
        product_id: item.product_id,
        quantity: parseFloat(String(item.qty)),
        unit_price: parseFloat(String(item.unit_price)),
        total: parseFloat(String(item.total_line)),
        discount_amount: parseFloat(String(item.discount_amount || '0')),
        tax_amount: parseFloat(String(item.tax_amount || '0')),
        created_at: item.created_at || data.invoice.created_at,
        updated_at: item.updated_at || data.invoice.updated_at,
        name: item.description || item.products?.name || 'Producto',
        product_name: item.description || item.products?.name || 'Producto',
        product: item.products ? { name: item.products.name, sku: item.products.sku } : undefined,
      }));

      // Datos del cliente
      const customerData: Customer | undefined = data.customer ? {
        id: data.customer.id,
        organization_id: data.customer.organization_id,
        full_name: data.customer.full_name || `${data.customer.first_name || ''} ${data.customer.last_name || ''}`.trim(),
        email: data.customer.email || undefined,
        phone: data.customer.phone || undefined,
        doc_type: data.customer.identification_type,
        doc_number: data.customer.identification_number,
        address: data.customer.address,
        country: data.customer.country,
        avatar_url: data.customer.avatar_url,
        roles: [],
        tags: [],
        preferences: {},
        created_at: data.customer.created_at,
        updated_at: data.customer.updated_at
      } : undefined;

      // Pagos asociados a la factura
      // El ticket solo lee `method` y `amount`; el resto son los campos de la fila de `payments`.
      const payments: Payment[] = ((data.invoice.pagos || []) as InvoicePaymentRow[]).map((p) => ({
        id: p.id,
        organization_id: data.invoice.organization_id,
        reference_type: 'invoice',
        reference_id: data.invoice.id,
        amount: parseFloat(String(p.amount)),
        method: (p.method || p.payment_method || 'other') as Payment['method'],
        status: (p.status || 'completed') as Payment['status'],
        payment_date: p.payment_date || p.created_at || data.invoice.created_at,
        created_at: p.created_at || data.invoice.created_at,
        updated_at: p.updated_at || data.invoice.updated_at,
      }));

      // Imprimir usando PrintService.printTicket con datos completos
      PrintService.printTicket(
        saleData,
        saleItems,
        customerData,
        payments,
        business,
        { name: cashierName || 'Sistema POS', email: cashierEmail },
        branchInfo,
        undefined,
        undefined,
        timezone,
      );

      toast.success(tCarrito('facturaImpresa'));

    } catch (error: unknown) {
      console.error('Error imprimiendo factura:', error);
      toast.error(tCarrito('errorImprimir'), {
        description: errorMessage(error) || tCarrito('errorImprimirDescripcion')
      });
    }
  };

  // Handler para cobrar deuda - llevar al checkout
  const handlePayDebt = () => {
    // Reactivar temporalmente para checkout (el cobro de la deuda no exige caja).
    onCheckout(cart);
  };

  // Enviar comanda a cocina
  const handleSendComanda = async () => {
    if (!onSendComanda || isSendingComanda) return;
    setIsSendingComanda(true);
    try {
      await onSendComanda(cart);
    } catch (error: unknown) {
      console.error('Error enviando comanda:', error);
      toast.error(tCarrito('errorCocina'), { description: errorMessage(error) || tCarrito('errorCocinaDescripcion') });
    } finally {
      setIsSendingComanda(false);
    }
  };

  // Anular deuda con nota de crédito: una RPC con permiso `pos.void` en el
  // servidor y el motivo del cajero (≥ 3 caracteres, lo exige la RPC).
  const handleCancelDebt = async (motivo: string) => {
    setIsCancellingDebt(true);
    setCancelDebtError(null);
    try {
      const result = await POSService.cancelDebtWithCreditNote(cart.id, motivo);
      onCartUpdate(result.cart);
      setShowCancelDebtDialog(false);
      toast.success(tCarrito('deudaAnulada'), {
        description: tCarrito('deudaAnuladaDescripcion', { numero: String(result.creditNote.number ?? '') }),
      });
      if (result.avisos?.includes('factura_electronica_sin_nota_credito_dian')) {
        toast.warning(tCarrito('avisoNotaCreditoDian'), { duration: 10000 });
      }
    } catch (error: unknown) {
      console.error('Error anulando deuda:', error);
      setCancelDebtError(mensajeErrorCobro(error, tCobro, tCarrito('errorAnularDescripcion')));
    } finally {
      setIsCancellingDebt(false);
    }
  };

  const isEmpty = cart.items.length === 0;
  const isOnHold = cart.status === 'hold';
  const isOnHoldWithDebt = cart.status === 'hold_with_debt';
  const hasCustomer = !!cart.customer_id;
  const modo = isOnHoldWithDebt ? 'deuda' : isOnHold ? 'espera' : 'activo';
  // L35 + D4: sin caja «Abrir caja para cobrar · F9» si la organización la exige.
  const estadoCobrar = estadoBotonCobrar({ caja: cashSessionActive, config: { requiereCaja }, carrito: cart });
  const puedeDeuda = puedeRegistrarDeuda(cart);
  const cobrar = () => {
    if (estadoCobrar === 'listo') onCheckout(cart);
    else if (estadoCobrar === 'sin-caja') onAbrirCaja?.();
  };

  // Atajos del carrito (POS-UX-V2 §3): F4 cobrar, F6 espera/reactivar, F7
  // deuda, F8 cocina, D descuento. Apagados con el cobro abierto.
  useAtajos(
    [
      {
        tecla: teclaAtajo('cobrar'),
        descripcion: tAtajosCarrito('cobrar'),
        cuando: () => !isEmpty,
        accion: () => (isOnHoldWithDebt ? handlePayDebt() : cobrar()),
      },
      {
        tecla: teclaAtajo('espera'),
        descripcion: tAtajosCarrito('espera'),
        cuando: () => !isEmpty && !isOnHoldWithDebt,
        accion: () => (isOnHold ? void handleActivate() : setShowHoldDialog(true)),
      },
      { tecla: teclaAtajo('deuda'), descripcion: tAtajosCarrito('deuda'), cuando: () => puedeDeuda, accion: () => setShowHoldWithDebtDialog(true) },
      {
        tecla: teclaAtajo('cocina'),
        descripcion: tAtajosCarrito('cocina'),
        cuando: () => !isEmpty && !isOnHold && !isOnHoldWithDebt && hasPreparationItems && !!onSendComanda,
        accion: () => void handleSendComanda(),
      },
      {
        tecla: teclaAtajo('lineaDescuento'),
        descripcion: tAtajosCarrito('lineaDescuento'),
        // Con el foco en una línea, D es el descuento de esa línea (lo registra LineasCarrito).
        cuando: () => !isEmpty && modo === 'activo' && !!onDescuento && !document.activeElement?.closest('[data-linea-carrito]'),
        accion: onDescuento,
      },
    ],
    { activo: atajosActivos, hayRafaga: hayRafagaDelLector },
  );

  const vencimiento = formatPlainDate(sumarDiasCalendario(todayInTz(timezone), Math.max(0, Number(paymentTerms) || 0)));

  return (
    <section
      aria-label={tCarrito('titulo')}
      className={cn(
        'flex flex-col gap-3 rounded-xl border bg-surface p-3',
        isOnHoldWithDebt ? 'border-line-warning' : isOnHold ? 'border-line-warning' : 'border-line',
        className,
      )}
    >
      <header className="flex flex-wrap items-center gap-2">
        <ShoppingCart aria-hidden="true" className="size-4 text-fg-secondary" strokeWidth={1.5} />
        <h2 className="text-sm font-semibold text-fg">{tCarrito('titulo')}</h2>
        {/* Figma `906:115576-80`: «Carrito · N productos» y, a la derecha, «Cliente: X». */}
        {!isEmpty && (
          <span className="text-sm text-fg-secondary" data-carrito-conteo="">
            <span aria-hidden="true">· </span>
            {tCarrito('nProductos', { n: cart.items.length })}
          </span>
        )}
        {isOnHold && (
          <CartTag tono="advertencia" icono={Pause}>
            {tCarrito('estadoEspera')}
          </CartTag>
        )}
        {isOnHoldWithDebt && (
          <CartTag tono="advertencia" icono={FileText} titulo={tCarrito('deudaRegistradaAviso')}>
            {tCarrito('estadoDeuda')}
          </CartTag>
        )}
        {cart.kitchen_ticket_id && kitchenStatus && (() => {
          const iconos: Record<KitchenTicketStatus, LucideIcon> = { new: Send, preparing: ChefHat, ready: CheckCircle, delivered: Check };
          const clave = (['new', 'preparing', 'ready', 'delivered'] as const).includes(kitchenStatus as KitchenTicketStatus)
            ? (kitchenStatus as KitchenTicketStatus)
            : 'new';
          return (
            <CartTag tono={clave === 'ready' ? 'exito' : 'informacion'} icono={iconos[clave]}>
              {tCarrito(`cocina.${clave}`)}
            </CartTag>
          );
        })()}
        {cart.customer?.full_name && (
          <span className="ml-auto min-w-0 max-w-full truncate text-xs text-fg-secondary">
            {tCarrito('clienteDe', { nombre: cart.customer.full_name })}
          </span>
        )}
      </header>
      {isOnHoldWithDebt && <p className="-mt-1 text-xs text-warning-text">{tCarrito('deudaRegistradaAviso')}</p>}

      {isEmpty ? (
        <EmptyState variante="empty" icono={ShoppingCart} titulo={tCarrito('vacioTitulo')} descripcion={tCarrito('vacioDescripcion')} />
      ) : (
        // Paso 6 (POS-PLAN): las líneas se pintan con `CartLine` del kit. Los
        // handlers son los mismos de siempre; nada se calcula en la línea.
        <div className="min-h-0 flex-1 overflow-y-auto" data-carrito-lineas="">
          <LineasCarrito
            cartId={cart.id}
            branchId={cart.branch_id}
            items={cart.items}
            moneda={moneda}
            formatear={formatear}
            bloqueada={isOnHold || isOnHoldWithDebt}
            indicesSinImpuesto={indicesSinImpuesto}
            estadoTicket={cart.kitchen_ticket_id && kitchenStatus ? kitchenStatus : null}
            descuentosFrecuentes={frequentDiscountsMap}
            atajosActivos={atajosActivos}
            onCantidad={handleQuantityChange}
            onQuitar={handleRemoveItem}
            onExcluirImpuesto={handleToggleTax}
            onIncluido={handleToggleItemTaxIncluded}
            nota={{ itemId: editingNotesItemId, destino: noteDestino, alergia: noteAlergia, texto: itemNotesValue }}
            onNotaAbrir={handleStartEditNotes}
            onNotaDestino={handleCambiarDestinoNota}
            onNotaAlergia={setNoteAlergia}
            onNotaTexto={setItemNotesValue}
            onNotaGuardar={handleSaveNotes}
            onNotaCancelar={() => { setEditingNotesItemId(null); setItemNotesValue(''); }}
            descuento={{ itemId: editingDiscountItemId, texto: discountInputValue }}
            onDescuentoAbrir={handleOpenDiscount}
            onDescuentoTexto={setDiscountInputValue}
            onDescuentoAplicar={handleApplyDiscount}
            onDescuentoCancelar={() => { setEditingDiscountItemId(null); setDiscountInputValue(''); }}
          />
        </div>
      )}

      {!isEmpty && (
        <div className="flex shrink-0 flex-col gap-3 border-t border-line pt-3">
          {/* Resumen de impuestos y totales: el cálculo es de TaxSummary; el dibujo, ResumenTotales del kit. */}
          <TaxSummary
            cart={cart}
            taxIncluded={taxIncluded}
            onTaxIncludedChange={handleTaxIncludedChange}
            onAppliedTaxesChange={handleAppliedTaxesChange}
            onTotalsChange={handleTotalsChange}
          />
          <AccionesCarrito
            modo={modo}
            total={formatear(cart.total)}
            estadoCobrar={estadoCobrar}
            onCobrar={cobrar}
            onAbrirCaja={onAbrirCaja}
            onDescuento={onDescuento}
            onEspera={() => setShowHoldDialog(true)}
            onReactivar={() => void handleActivate()}
            puedeDeuda={puedeDeuda}
            motivoDeuda={!hasCustomer ? tCarrito('deudaSinCliente') : undefined}
            onDeuda={() => setShowHoldWithDebtDialog(true)}
            conCocina={hasPreparationItems && !!onSendComanda}
            enviandoCocina={isSendingComanda}
            onCocina={() => void handleSendComanda()}
            cargandoFactura={isLoadingInvoice}
            onVerFactura={() => void handleViewInvoice()}
            onImprimir={() => void handlePrintInvoice()}
            onCobrarDeuda={handlePayDebt}
            onAnular={() => {
              setCancelDebtError(null);
              setShowCancelDebtDialog(true);
            }}
          />
        </div>
      )}

      {/* Descuento · D: pestaña «A un producto» (paso 10) */}
      <DialogoDescuento
        abierto={showDiscountDialog}
        onAbiertoChange={setShowDiscountDialog}
        items={cart.items}
        formatear={formatear}
        frecuentes={frequentDiscountsMap}
        onCargarFrecuentes={(productId) => void handleLoadFrequentDiscounts(productId)}
        onAplicar={handleApplyDiscount}
      />

      {/* Poner en espera */}
      <Dialogo
        abierto={showHoldDialog}
        onAbiertoChange={setShowHoldDialog}
        titulo={tCarrito('esperaTitulo')}
        icono={Pause}
        ancho={440}
        primario={{ etiqueta: tCarrito('esperaConfirmar'), onClick: () => void handleHold() }}
      >
        <FormField etiqueta={tCarrito('esperaMotivo')} ayuda={tCarrito('opcional')}>
            <Textarea value={holdReason} onChange={(e) => setHoldReason(e.target.value)} placeholder={tCarrito('esperaPlaceholder')} rows={3} />
        </FormField>
      </Dialogo>

      {/* Registrar deuda */}
      <Dialogo
        abierto={showHoldWithDebtDialog}
        onAbiertoChange={(abierto) => {
          if (isProcessingHoldWithDebt) return;
          setShowHoldWithDebtDialog(abierto);
          if (!abierto) {
            setHoldWithDebtReason('');
            setPaymentTerms(30);
          }
        }}
        titulo={tCarrito('deudaTitulo')}
        descripcion={tCarrito('deudaDescripcion')}
        icono={FileText}
        ancho={520}
        primario={{
          etiqueta: tCarrito('deudaConfirmar'),
          onClick: () => void handleHoldWithDebt(),
          cargando: isProcessingHoldWithDebt,
          deshabilitada: !puedeConfirmarDeuda(cart, holdWithDebtReason),
          motivo: !puedeConfirmarDeuda(cart, holdWithDebtReason) ? tCarrito('deudaMotivoRequerido') : undefined,
        }}
      >
        <ListaDatos etiqueta={tCarrito('deudaTitulo')}>
          <FilaDato etiqueta={tCarrito('cliente')} valor={cart.customer?.full_name || tCarrito('sinCliente')} />
          <FilaDato etiqueta={tCarrito('totalAdeudar')} valor={formatear(cart.total)} tono="fuerte" tamano="lg" />
        </ListaDatos>
        <FormField etiqueta={tCarrito('deudaMotivo')} obligatorio>
            <Textarea
              value={holdWithDebtReason}
              onChange={(e) => setHoldWithDebtReason(e.target.value)}
              placeholder={tCarrito('deudaPlaceholder')}
              rows={3}
            />
        </FormField>
        <FormField etiqueta={tCarrito('deudaDias')} ayuda={tCarrito('deudaVence', { fecha: vencimiento })}>
            <CampoNumero
              valor={paymentTerms}
              onValorChange={(n) => setPaymentTerms(n ?? 0)}
              decimales={0}
              minimo={1}
              maximo={365}
              sufijo={tCarrito('dias')}
              className="w-40"
            />
        </FormField>
        <div className="rounded-lg border border-line bg-subtle p-3 text-xs text-fg-secondary">
          <p className="font-medium text-fg">{tCarrito('deudaSeCreara')}</p>
          <ul className="mt-1 list-disc pl-4">
            <li>{tCarrito('deudaFactura')}</li>
            <li>{tCarrito('deudaCartera')}</li>
            <li>{tCarrito('deudaHistorial')}</li>
          </ul>
        </div>
      </Dialogo>

      {/* Anular la deuda: motivo obligatorio y confirmación (H10) */}
      <DialogoMotivo
        abierto={showCancelDebtDialog}
        onAbiertoChange={(abierto) => !isCancellingDebt && setShowCancelDebtDialog(abierto)}
        titulo={tCarrito('anularTitulo')}
        descripcion={tCarrito('anularDescripcion')}
        textoConfirmar={tCarrito('anularConfirmar')}
        consecuencias={[tCarrito('anularNotaCredito'), tCarrito('anularPagos'), tCarrito('anularStock')]}
        onConfirmar={handleCancelDebt}
        cargando={isCancellingDebt}
        error={cancelDebtError}
      />

      {/* Detalle de la factura del carrito con deuda */}
      <PanelAdaptable abierto={showInvoiceModal} onAbiertoChange={setShowInvoiceModal} titulo={tCarrito('detalleFactura')} icono={FileText} ancho={1120}>
        {isLoadingInvoice ? (
          <div className="flex flex-col gap-3 p-4" role="status" aria-label={tCarrito('cargandoFactura')}>
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : invoiceData ? (
          <DetalleFacturaVenta id={String(invoiceData.invoice.id)} />
        ) : (
          <EmptyState variante="error" compacto titulo={tCarrito('errorFactura')} descripcion={tCarrito('errorFacturaDescripcion')} />
        )}
      </PanelAdaptable>
    </section>
  );
}
