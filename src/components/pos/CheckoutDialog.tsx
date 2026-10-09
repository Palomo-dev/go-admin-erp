'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { FileCheck2, CheckCircle, Banknote, User, Wallet, Plus, Trash2, X, Percent, Truck, QrCode, Loader2, TriangleAlert } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { clasesBadgeTono } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POSService } from '@/lib/services/posService';
import { supabase } from '@/lib/supabase/config';
import { ilikeAnyOf } from '@/lib/utils/postgrestFilters';
import { useCommissionRate } from '@/lib/hooks/useCommissionRate';
import { PrintService, BusinessInfo, CashierInfo } from '@/lib/services/printService';
import { PrintJobsService } from '@/lib/services/printJobsService';
import { CashDrawerService } from '@/lib/services/cashDrawerService';
import { toast } from 'sonner';
import { Cart, PaymentMethod, CheckoutData, Sale, Currency } from './types';
import { cn } from '@/utils/Utils';
import { 
  calculateCartTaxes, 
  type OrganizationTax as TaxUtilOrganizationTax,
  type TaxCalculationItem 
} from '@/lib/utils/taxCalculations';
import { validateCompositeStock } from '@/lib/services/compositeStockValidation';
import { electronicInvoicingService } from '@/lib/services/electronicInvoicingService';
import { useElectronicInvoicePreference } from '@/lib/hooks/useElectronicInvoicePreference';
import { CajasService } from '@/components/pos/cajas/CajasService';
import { ConfiguracionService } from '@/components/pos/configuracion/configuracionService';
import { SerialSelectorDialog } from '@/components/pos/SerialSelectorDialog';
import { QrPaymentDialog } from '@/components/shared/QrPaymentDialog';
import { useMobileNative } from '@/hooks/useMobileNative';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { getPosDisplayEmitter } from '@/lib/pos/display/posDisplay';
import { confirmQrPaymentEntry, isQrPaymentCode, pickQrFromProviderResponse, resolveCashReceived, resolveDisplayQr, resolveQrChargeAmount, toDisplayPayment } from '@/lib/pos/display/payment';
import { computeTipAmount } from '@/lib/pos/display/tip';
import { useCustomerDisplayPresence } from '@/components/pos/display/useCustomerDisplayPresence';
import { TipFromDisplayNotice } from '@/components/pos/display/TipFromDisplayNotice';
import { applyTipToPrefilledPayment } from '@/components/pos/display/tipNotice';
import { isDesktop } from '@/lib/utils/desktop';
import { newSaleId, ticketSaleNumber } from '@/lib/offline/salesOutbox';
import { useTranslations } from 'next-intl';
import { codigoErrorCobro, detalleErrorCobro } from '@/lib/pos/erroresCobro';
import { esErrorMembresiaSinCliente } from '@/lib/pos/venta/membresias';
import { useLineasSinImpuesto } from '@/hooks/useLineasSinImpuesto';
import { AvisoSinImpuesto } from '@/components/shared/AvisoSinImpuesto';
// Lógica pura del cobro extraída LITERAL (POS-PLAN §2.6 L41–L52, paso 1):
import { cuentasDelCobro } from '@/lib/pos/venta/cobro/cuentasCobro';
import {
  ajusteAlAbrirCobro,
  casillaInicialImpuestosIncluidos,
  casillaSiElCajeroNoLaMovio,
  firmaAperturaCobro,
  impuestoIncluidoDeLinea,
  TOTALES_COBRO_VACIOS,
  totalesVisiblesDelCobro,
} from '@/lib/pos/venta/cobro/impuestosCobro';
import { camposCantidadImpresa, esMedido } from '@/lib/pos/peso/modoVenta';
import { actualizarEntradaPago, entradaDePagoNueva, pagosDelSobre, pagosParaImpresion, puedeQuitarPagos, quitarEntradaPago } from '@/lib/pos/venta/cobro/pagosCobro';
import { faltaParaEntrada, montosDeEntrada, muestraMontosRapidos } from '@/lib/pos/venta/cobro/montosRapidos';
import { PORCENTAJES_PROPINA, baseDePropina, meserosDesdeMiembros, propinaTopada, topePropina } from '@/lib/pos/venta/cobro/propinaCobro';
import { camposComisionDelSobre, comisionDeTasaResuelta, esPersonaAsignada, montoComision } from '@/lib/pos/venta/cobro/comisionCobro';
import { camposEntregaDelSobre, fleteDeTarifaElegida, opcionesDeTarifa, tarifaPorDefecto, tarifasVisiblesEnPos } from '@/lib/pos/venta/cobro/entregaCobro';
import { lineasConSerial, seleccionSerialesCompleta } from '@/lib/pos/venta/cobro/serialesCobro';
import { comprobarStockReceta, debeConfirmarStock } from '@/lib/pos/venta/cobro/stockRecetaCobro';
import { AVISO_SIN_IMPRESORA_CAJA, AVISO_VENTA_SIN_SUCURSAL, PREFIJO_ERROR_TICKET, lanzarTicketYCajon, planPostVenta } from '@/lib/pos/venta/cobro/postVentaCobro';
import { PostVenta, type EstadoRecibo } from '@/components/pos/venta/PostVenta';
// Presentación del cobro (paso 11): contenedor, zona de totales y monto del pago.
import { BotonImporte, CampoNumero, Dialogo, FilaDato, FormField, KbdButton, ListaDatos, SeccionPlegable, SegmentedControl, SelectorMetodoPago, Tarjeta, clasesBoton, repartirMetodos, useAtajos, type Atajo } from '@/components/kit';
import { Switch } from '@/components/ui/switch';
import { EntregaCobro } from '@/components/pos/venta/cobro/EntregaCobro';
import { leerEstadoFacturaElectronica, type ClienteConfigFactura, type EstadoFacturaElectronica } from '@/lib/pos/venta/cobro/facturaElectronicaCobro';
import { CobroPanel } from '@/components/pos/venta/CobroPanel';
import { ResumenCobro } from '@/components/pos/venta/cobro/ResumenCobro';
import { EditorPagoCobro } from '@/components/pos/venta/cobro/EditorPagoCobro';
import { accionAtajoMetodo, enterCompletaVenta } from '@/components/pos/venta/cobro/teclasCobro';
import { teclaAtajo } from '@/lib/pos/venta/atajos';
import { hayRafagaDelLector } from '@/hooks/useHardwareBarcodeScanner';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';

/** Botones de método visibles antes de «Otro» (Alt+1…Alt+5 por posición). */
const MAX_BOTONES_METODO = 5;
const ATAJOS_METODO = ['metodo1', 'metodo2', 'metodo3', 'metodo4', 'metodoOtro'] as const;
type SeccionCobro = 'entrega' | 'propina' | 'comision' | 'factura';
const SECCIONES_CERRADAS: Record<SeccionCobro, boolean> = { entrega: false, propina: false, comision: false, factura: false };

interface CheckoutDialogProps {
  cart: Cart;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCheckoutComplete: (sale: Sale) => void;
  onProcessPayment?: (checkoutData: CheckoutData) => Promise<Sale>;
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
  /**
   * La base rechazó el cobro con `membresia_sin_cliente` (P1): la pantalla
   * cierra el cobro y abre el selector del titular. Sin él solo se avisa.
   */
  onPedirCliente?: () => void;
  /**
   * Cobro de una mesa (Figma D10/T7 y D11): título «Cobrar Mesa 4 · Terraza»,
   * propina con el mesero de la mesa ya elegido (y la sugerida en la
   * pre-cuenta) y el post-venta «¡Mesa 4 cobrada!» con «Volver al plano». Sin
   * él, el cobro del mostrador no cambia.
   */
  contextoMesa?: {
    titulo: string;
    meseroId?: string | null;
    propinaPorcentaje?: number | null;
    propinaValor?: number | null;
    postVenta?: { titulo: string; descripcion: string; primaria: string };
  };
}

interface PaymentEntry {
  id: string;
  method: string;
  amount: number;
}

export function CheckoutDialog({ cart, open, onOpenChange, onCheckoutComplete, onProcessPayment, organization, currentUser, branch, onPedirCliente, contextoMesa }: CheckoutDialogProps) {
  const tMembresias = useTranslations('membresias');
  const { timezone } = useOrgTimezone();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showSerialSelector, setShowSerialSelector] = useState(false);
  const [serialSelections, setSerialSelections] = useState<Record<number, number[]>>({});
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [sendToFactus, setSendToFactus] = useState(false);
  const [electronicInvoiceData, setElectronicInvoiceData] = useState<{
    invoiceId: string;
    invoiceNumber: string;
    cufe: string;
    qrData: string;
    environment: 'production' | 'test';
    validationDate?: string;
  } | null>(null);
  const { alwaysEnabled: eInvoiceAlwaysEnabled } = useElectronicInvoicePreference();
  const { hapticNotification, hapticImpact } = useMobileNative();

  // Si la preferencia global está activa, forzar sendToFactus = true
  useEffect(() => {
    if (eInvoiceAlwaysEnabled) {
      setSendToFactus(true);
    }
  }, [eInvoiceAlwaysEnabled]);
  
  // Estados para manejo de impuestos
  const [organizationTaxes, setOrganizationTaxes] = useState<TaxUtilOrganizationTax[]>([]);
  const [appliedTaxes, setAppliedTaxes] = useState<{[key: string]: boolean}>({});
  const [taxIncluded, setTaxIncluded] = useState(() => casillaInicialImpuestosIncluidos(cart.items));
  // El cajero movió la casilla en este cobro: a partir de ahí manda ella,
  // no el flag que haya quedado en la línea o en el carrito.
  const [casillaMovida, setCasillaMovida] = useState(false);
  const [calculatedTotals, setCalculatedTotals] = useState({
    subtotal: 0,
    totalTaxAmount: 0,
    finalTotal: 0
  });
  // Desglose de impuestos por nombre (IVA, ICA, etc.) para el recibo
  const [taxBreakdown, setTaxBreakdown] = useState<{ name: string; amount: number }[]>([]);
  // El diálogo sigue montado al cerrar (la página lo deja con el carrito).
  // Ajustar el estado en el render, antes de pintar, suelta la casilla y el
  // total de la venta anterior. Un efecto llegaría tarde: el primer cuadro
  // seguiría marcado y el total no cuadraría con el carrito.
  const firmaApertura = firmaAperturaCobro(open, cart.id);
  const [firmaAperturaVista, setFirmaAperturaVista] = useState(firmaApertura);
  if (firmaAperturaVista !== firmaApertura) {
    setFirmaAperturaVista(firmaApertura);
    if (open) {
      const ajuste = ajusteAlAbrirCobro(cart.items);
      setTaxIncluded(ajuste.taxIncluded);
      setCasillaMovida(ajuste.casillaMovida);
      setCalculatedTotals(ajuste.calculatedTotals);
      setTaxBreakdown([]);
    }
  } else if (open) {
    const casillaDeLineas = casillaSiElCajeroNoLaMovio(taxIncluded, casillaMovida, cart.items);
    if (casillaDeLineas !== taxIncluded) {
      setTaxIncluded(casillaDeLineas);
      // El cálculo que había era del otro modo. Hasta que llegue el nuevo,
      // el total visible es el del carrito (ya recalculado con el interruptor).
      setCalculatedTotals(TOTALES_COBRO_VACIOS);
      setTaxBreakdown([]);
    }
  }
  
  // Estados para propina
  const [tipAmount, setTipAmount] = useState(0);
  const [tipPercentage, setTipPercentage] = useState<number | null>(null);
  const [serverId, setServerId] = useState<string>('');
  const [servers, setServers] = useState<{ id: string; name: string }[]>([]);

  // Estados para comisión
  const [salespersonId, setSalespersonId] = useState<string>('');
  const [commissionRate, setCommissionRate] = useState<number>(0);
  const [commissionType, setCommissionType] = useState<'salesperson' | 'intermediation_sale' | 'none'>('salesperson');
  const [commissionMethod, setCommissionMethod] = useState<'percentage' | 'fixed_amount'>('percentage');
  const { resolveRate: resolveCommissionRate } = useCommissionRate();

  // Estados para delivery
  const [deliveryType, setDeliveryType] = useState<'pickup' | 'delivery_own' | 'delivery_third_party'>('pickup');
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');
  const [deliveryCity, setDeliveryCity] = useState<string>('');
  const [deliveryContactName, setDeliveryContactName] = useState<string>('');
  const [deliveryContactPhone, setDeliveryContactPhone] = useState<string>('');
  const [deliveryInstructions, setDeliveryInstructions] = useState<string>('');

  // Estados para conductores
  const [drivers, setDrivers] = useState<Array<{ id: string; name: string; phone?: string }>>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');

  // Estados para tarifas de envío y flete
  const [shippingRates, setShippingRates] = useState<Array<{ id: string; rate_name: string; total_cost: number; currency: string }>>([]);
  const [selectedRateId, setSelectedRateId] = useState<string>('');
  const [shippingFee, setShippingFee] = useState<number>(0);

  // Estado para pago del envío (pagado/pendiente)
  const [shipmentPaymentStatus, setShipmentPaymentStatus] = useState<'paid' | 'pending'>('paid');

  // Estados para pago QR
  const [showQrDialog, setShowQrDialog] = useState(false);
  // Confirmación diferida de stock insuficiente (reemplaza window.confirm nativo)
  const [stockConfirm, setStockConfirm] = useState<{
    message: string;
    resolve: (ok: boolean) => void;
  } | null>(null);
  const [qrData, setQrData] = useState<string | undefined>();
  const [qrImageUrl, setQrImageUrl] = useState<string | undefined>();
  const [qrReference, setQrReference] = useState<string>('');
  const [qrProviderLabel, setQrProviderLabel] = useState<string>('');
  const [qrExpiresAt, setQrExpiresAt] = useState<string | undefined>();
  // El proveedor mató el código sin pago (expired/rejected/cancelled del
  // poller, HALLAZGO T): la pantalla del cliente lo retira («El código
  // venció») aunque el `expires_at` local siga en el futuro.
  const [qrDead, setQrDead] = useState(false);
  // Importe por el que se generó el QR (F2-C, C2): el de la PROPIA entrada QR
  // en pago mixto, no `remaining` (que ya descuenta esa entrada pre-rellenada).
  // Lo comparten el proveedor, el modal, la pantalla del cliente y onPaid.
  const [qrAmount, setQrAmount] = useState<number | undefined>();
  // Id de la entrada de pago desde la que se generó el QR (ronda 5, QA-2):
  // onPaid la confirma (método e importe del código) en vez de añadir otra,
  // que duplicaba el pago (25.000 → 50.000 pagados sobre 25.000).
  const [qrEntryId, setQrEntryId] = useState<string | undefined>();
  // Id de la entrada que onPaid acaba de confirmar (ronda 7, QA-2): lo fija
  // el updater de `payments` (una sola fuente, `prev`) y lo lee el updater
  // de `touchedIds`, que corre después en el mismo render (el hook de
  // `payments` se declara antes). Nunca se decide con el `payments` de la
  // clausura, que puede ir por detrás del estado real.
  // DEPENDENCIA DE ORDEN (ronda 8, QA-6): el updater de `touchedIds` lee este
  // ref DESPUÉS de que corra el de `payments` porque React procesa las colas
  // en el orden de declaración de los hooks. Si alguien declara `touchedIds`
  // antes que `payments`, el ref llega null y se marca el respaldo aunque la
  // entrada de origen exista. Lo vigila un guard estático
  // (qr-payment-f2c-r8 › «orden de hooks») que falla al invertirlos.
  const confirmedQrEntryIdRef = useRef<string | null>(null);
  // Guarda el metodo QR usado para registrar el pago correcto al confirmar
  const [qrPaymentMethod, setQrPaymentMethod] = useState<string>('');
  // Guard de en-vuelo de «Generar QR de pago» (ronda 8, F2C-R7-2): una doble
  // pulsación (doble tap en la caja táctil) hacía DOS fetch a create-qr, dos
  // cobros reales en el proveedor, y el poller del diálogo (efecto [open])
  // quedaba fijado a la PRIMERA referencia mientras el cliente pagaba la
  // segunda. El ref corta de forma síncrona (el estado llega un render
  // tarde); el estado deshabilita el botón y pinta «Generando…».
  const qrRequestInFlightRef = useRef(false);
  const [isCreatingQr, setIsCreatingQr] = useState(false);
  // Pantalla del cliente (Fase 2, Cobro·QR): «Mostrar en pantalla del cliente»,
  // marcado por defecto al generar el QR si hay pantalla conectada (indicador de F0).
  const displayPresence = useCustomerDisplayPresence();
  const displayConnectedRef = useRef(false);
  useEffect(() => {
    displayConnectedRef.current = displayPresence.connected;
  }, [displayPresence.connected]);
  const [showQrOnDisplay, setShowQrOnDisplay] = useState(false);

  // Estados para búsqueda de direcciones de clientes
  const [, setAddressSearch] = useState<string>('');
  const [addressResults, setAddressResults] = useState<Array<{ id: string; name: string; address: string; city?: string; phone?: string }>>([]);
  const [showAddressDropdown, setShowAddressDropdown] = useState<boolean>(false);

  // Comisión calculada (L45: montoComision, src/lib/pos/venta/cobro/comisionCobro.ts)
  const commissionAmount = montoComision({
    commissionRate,
    salespersonId,
    commissionMethod,
    subtotal: calculatedTotals.subtotal || cart.subtotal,
  });

  // Calculados - usar totales con impuestos + propina
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  // Base, total, cambio y «se puede completar»: cuentasDelCobro (L41,
  // src/lib/pos/venta/cobro/cuentasCobro.ts). `totalPaid` y `remaining` siguen
  // escritos aquí porque las pruebas de __tests__/pos-display leen esas dos
  // líneas del fuente; son la misma cuenta que devuelve cuentasDelCobro.
  // Con líneas por peso o medida el total a cobrar se redondea a la moneda (la línea guarda el importe exacto).
  const redondeoPeso = currency && cart.items.some((i) => esMedido(i.product)) ? currency.decimals : null;
  // Cálculo de esta apertura, o el total del carrito si ese cálculo aún está
  // en cero o —con la casilla apagada— quedó por debajo del carrito.
  const totalesCobro = totalesVisiblesDelCobro(calculatedTotals, cart, taxIncluded);
  const cuentasCobro = cuentasDelCobro({ calculatedTotals: totalesCobro, cart, tipAmount, shippingFee, totalPaid, decimalesRedondeo: redondeoPeso });
  const baseTotal = cuentasCobro.baseTotal;
  const cartTotal = cuentasCobro.cartTotal;
  const remaining = Math.max(0, cartTotal - totalPaid);
  const change = cuentasCobro.change;
  // Base de la propina (D7, paso 12): el subtotal SIN impuestos que ya calculó
  // el cobro, no `baseTotal` (con impuestos). La misma base va a la pantalla
  // del cliente (setTipBase) para que «10 %» sea la misma cifra en las dos.
  const baseTip = baseDePropina({ calculatedTotals, cart });
  const canComplete = cuentasCobro.canComplete;

  // Advertencia (no bloquea el cobro): líneas que se cobrarán sin IVA porque ni
  // el producto ni la organización tienen impuesto configurado.
  const lineasParaAviso = useMemo(
    () => cart.items.map((it) => ({
      nombre: it.product?.name ?? '',
      productId: it.product_id ?? null,
      taxRate: it.tax_rate ?? null,
      taxExcluded: it.tax_excluded ?? null,
    })),
    [cart.items],
  );
  const { sinImpuesto: lineasSinImpuesto } = useLineasSinImpuesto(
    open ? cart.organization_id : null,
    lineasParaAviso,
  );

  // Pantalla del cliente (PLAN §4.2 «Cobro» y §12 Fase 0). Mientras el
  // cobro está abierto se proyecta el estado según el ÚLTIMO medio elegido:
  // efectivo → total/recibido/cambio en vivo; tarjeta → «siga las
  // instrucciones del datáfono»; QR → el medio, sin imagen hasta F2. Al
  // confirmar la venta pasa a «Gracias» (el emisor vuelve a reposo a los 8 s)
  // y al cancelar vuelve a «Pedido». Nunca bloquea ni lanza: el emisor traga
  // sus propios errores.
  //
  // «Recibido» y «cambio» solo se muestran cuando el cajero ha editado el
  // importe de ESA entrada en efectivo (`touchedIds`, por id de entrada):
  // cada entrada se pre-rellena con el importe pendiente (la primera con el
  // total; «Agregar pago» con el resto) y, sin esta guarda, el cliente vería
  // «Recibido: $TOTAL · Cambio: $0» antes de entregar nada. Con pagos mixtos
  // el recibido es solo el efectivo tecleado (resolveCashReceived): teclear
  // la tarjeta no convierte en «recibido» un efectivo pre-rellenado.
  const saleConfirmedRef = useRef(false);
  // Intento de cobro (E-35 / BE3): el id de la venta se genera UNA vez por
  // intento, al primer «Completar venta», y se reutiliza en los reintentos.
  // Si el primer envío llegó a la base pero la respuesta se perdió (timeout,
  // red), reintentar con el mismo id hace que pos_checkout_v1 devuelva la venta
  // ya creada en vez de crear otra. Antes el navegador lo generaba dentro de
  // POSService.checkout en cada clic (y el escritorio, en cada clic también).
  const intentoCobroRef = useRef<{ id: string; creadoEn: string } | null>(null);
  // «Completar venta» en vuelo (corte síncrono de la doble pulsación).
  const cobroEnVueloRef = useRef(false);
  // Mesa: la propina sugerida en la pre-cuenta se aplica una vez por apertura.
  const propinaMesaAplicadaRef = useRef(false);
  const tCobro = useTranslations('posCobroServidor');
  const tPos = useTranslations('posCobro');
  const tAtajos = useTranslations('posVenta.atajos');
  const [touchedIds, setTouchedIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!open || showReceipt) return;
    // Fase 2 (Cobro·QR): con el QR generado se proyecta ESE medio y, si el
    // cajero lo permite, el código a pantalla completa (PLAN §4.2). Con el
    // interruptor apagado viaja sin código: la pantalla dice «Pago con QR:
    // siga las instrucciones del cajero» (PLAN §3.5).
    if (showQrDialog && qrPaymentMethod) {
      // Código muerto por el proveedor (qrDead): sin código y vencido, con
      // el interruptor en cualquier posición; la pantalla dice «El código
      // venció», nunca pinta uno que ya no sirve.
      const resolved = qrDead
        ? { qr: null, expiresAt: 0 }
        : showQrOnDisplay
          ? resolveDisplayQr({ imageUrl: qrImageUrl, data: qrData, expiresAt: qrExpiresAt })
          : { qr: null, expiresAt: null };
      getPosDisplayEmitter().setPayment(
        toDisplayPayment({
          methodCode: qrPaymentMethod,
          methodName: qrProviderLabel || null,
          total: cartTotal,
          qr: resolved.qr,
          expiresAt: resolved.expiresAt,
          // Pago mixto (C2): el importe por el que se generó ESTE código
          // (`qrAmount`, el de la propia entrada QR); la pantalla pinta
          // «Total X · Este pago Y» cuando difieren.
          amount: qrAmount ?? cartTotal,
        }),
      );
      return;
    }
    const last = payments[payments.length - 1];
    const methodCode = last?.method ?? 'cash';
    const methodName = paymentMethods.find((pm) => pm.code === methodCode)?.name ?? null;
    const received = resolveCashReceived(payments, touchedIds);
    getPosDisplayEmitter().setPayment(
      toDisplayPayment({
        methodCode,
        methodName,
        total: cartTotal,
        received,
        change: received === null ? null : change,
      }),
    );
  }, [
    open,
    showReceipt,
    payments,
    paymentMethods,
    cartTotal,
    change,
    touchedIds,
    showQrDialog,
    showQrOnDisplay,
    qrPaymentMethod,
    qrProviderLabel,
    qrImageUrl,
    qrData,
    qrExpiresAt,
    qrDead,
    qrAmount,
  ]);

  // Fase 2 (Cobro·QR): «Ya pagué» desde la pantalla del cliente. Solo avisa;
  // la confirmación sigue siendo del cajero o del webhook (poller del QR).
  useEffect(() => {
    if (!open) return;
    return getPosDisplayEmitter().onUp((msg) => {
      if (msg.t !== 'qr_paid_claim' || msg.cartId !== cart.id) return;
      toast.info(tPos('qr.clienteDiceQuePago'), {
        description: tPos('qr.clienteDiceQuePagoDesc'),
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tPos (next-intl) es estable por idioma
  }, [open, cart.id]);

  // Fase 2-B (Propina en pantalla): la base sobre la que la pantalla calcula
  // los porcentajes es la MISMA que usa handleTipPercentage (desde el paso 12,
  // D7: el subtotal SIN impuestos, `baseTip`); así «10 %» es la misma cifra en la
  // pantalla y en la caja. La fase la abre el emisor al entrar en cobro.
  useEffect(() => {
    if (!open || showReceipt) return;
    getPosDisplayEmitter().setTipBase(baseTip);
  }, [open, showReceipt, baseTip]);

  useEffect(() => {
    if (open) {
      saleConfirmedRef.current = false;
      setTouchedIds(new Set());
      // Cada apertura del cobro es un intento nuevo (otra venta u otra cuenta
      // de la mesa); los reintentos DENTRO del mismo intento reusan su id.
      intentoCobroRef.current = null;
      return;
    }
    // Cerrado sin vender: la pantalla vuelve al pedido. Tras una venta el
    // emisor ya está en «Gracias» y se deja que su temporizador lo resuelva.
    if (!saleConfirmedRef.current) getPosDisplayEmitter().setMode('order');
  }, [open]);

  // Desmontaje con el modal abierto (el cajero navega a /app/pos desde mesas
  // o nueva venta con el cobro a medias): el efecto [open] no llega a correr
  // con open=false, así que se limpia aquí. Tras una venta se respeta
  // «Gracias». El emisor ignora la llamada si la caja no está arrancada.
  const wasSaleConfirmed = () => saleConfirmedRef.current;
  useEffect(
    () => () => {
      if (!wasSaleConfirmed()) getPosDisplayEmitter().setMode('order');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al desmontar; la ref se lee en ese momento
    [],
  );

  // Cargar métodos de pago, moneda e impuestos
  useEffect(() => {
    if (open) {
      // Validar si se requiere caja abierta
      const validateCashSession = async () => {
        try {
          const config = await ConfiguracionService.getRequireCashSessionConfig();
          if (config.require_cash_session) {
            const activeSession = await CajasService.getActiveSession();
            if (!activeSession) {
              toast.error(tPos('caja.sinCaja'), {
                description: tPos('caja.sinCajaDesc'),
                duration: 5000,
              });
              onOpenChange(false);
              return;
            }
          }
        } catch (err) {
          console.warn('Error validando caja abierta:', err);
        }
      };
      validateCashSession();

      loadPaymentData();
      loadTaxData();
      loadServers();
      // La casilla arranca como las líneas del carrito, no como un
      // `cart.tax_included` que el total visible ya no está usando.
      // El ajuste en el render (firmaApertura) ya lo hizo antes de pintar;
      // aquí se repite por si el efecto corre con líneas más nuevas.
      const ajuste = ajusteAlAbrirCobro(cart.items);
      setTaxIncluded(ajuste.taxIncluded);
      setCasillaMovida(ajuste.casillaMovida);
      setCalculatedTotals(ajuste.calculatedTotals);
      setTaxBreakdown([]);
      // Agregar primer método de pago por defecto
      if (payments.length === 0) {
        addPayment();
      }
      // Reset propina
      setTipAmount(0);
      setTipPercentage(null);
      // Mesa: la propina va al mesero de la mesa (T7); el cajero puede cambiarlo.
      if (contextoMesa?.meseroId) setServerId(contextoMesa.meseroId);
      propinaMesaAplicadaRef.current = false;
      setSalespersonId('');
      setCommissionRate(0);
      setCommissionType('salesperson');
      setCommissionMethod('percentage');
      setDeliveryType('pickup');
      setDeliveryAddress('');
      setDeliveryCity('');
      setDeliveryContactName('');
      setDeliveryContactPhone('');
      setDeliveryInstructions('');
      setSelectedDriverId('');
      setAddressSearch('');
      setAddressResults([]);
      setShowAddressDropdown(false);
      setShippingRates([]);
      setSelectedRateId('');
      setShippingFee(0);
      setShipmentPaymentStatus('paid');
      loadDrivers();
    }
  }, [open]);

  // Limpiar estados de éxito/recibo cuando el dialog se cierra.
  // Sin esto, al reabrir el dialog para una nueva venta se mostraba la
  // pantalla de "Venta Completada" de la venta anterior (showReceipt/completedSale
  // persistían) y el carrito no se reiniciaba correctamente.
  useEffect(() => {
    if (!open) {
      setShowReceipt(false);
      setCompletedSale(null);
      setSendToFactus(false);
      setElectronicInvoiceData(null);
      setPayments([]);
      setSerialSelections({});
      setTipAmount(0);
      setTipPercentage(null);
      setServerId('');
      setSalespersonId('');
      setCommissionRate(0);
      setCommissionType('salesperson');
      setCommissionMethod('percentage');
      setDeliveryType('pickup');
      setDeliveryAddress('');
      setDeliveryCity('');
      setDeliveryContactName('');
      setDeliveryContactPhone('');
      setDeliveryInstructions('');
      setSelectedDriverId('');
      setAddressSearch('');
      setAddressResults([]);
      setShowAddressDropdown(false);
      setShippingRates([]);
      setSelectedRateId('');
      setShippingFee(0);
      setShipmentPaymentStatus('paid');
      // Cobro con QR (ronda 5, QA-3): si el cobro se cerró desde el padre con
      // el diálogo QR abierto, sin esto el siguiente cobro proyectaría a la
      // pantalla el código de la venta ANTERIOR con el total de la nueva.
      setShowQrDialog(false);
      setQrData(undefined);
      setQrImageUrl(undefined);
      setQrExpiresAt(undefined);
      setQrDead(false);
      setQrAmount(undefined);
      setQrEntryId(undefined);
      setQrPaymentMethod('');
      setQrReference('');
      setQrProviderLabel('');
      setShowQrOnDisplay(false);
    }
  }, [open]);

  // Auto-llenar dirección del cliente al seleccionar delivery_own
  useEffect(() => {
    if (deliveryType !== 'delivery_own') return;

    const fillCustomerData = async () => {
      let customer = cart.customer;
      if (!customer && cart.customer_id) {
        const { data: fetched } = await supabase
          .from('customers')
          .select('*')
          .eq('id', cart.customer_id)
          .single();
        if (fetched) customer = fetched as any;
      }
      if (!customer) return;

      if (!deliveryAddress && customer.address) {
        setDeliveryAddress(customer.address);
      }
      if (customer.phone && !deliveryContactPhone) {
        setDeliveryContactPhone(customer.phone);
      }
      const customerName = customer.full_name ||
        [customer.first_name, customer.last_name].filter(Boolean).join(' ');
      if (customerName && !deliveryContactName) {
        setDeliveryContactName(customerName);
      }
      if (customer.fiscal_municipality_id && !deliveryCity) {
        supabase
          .from('municipalities')
          .select('name, state_name')
          .eq('id', customer.fiscal_municipality_id)
          .single()
          .then(({ data: munData }) => {
            if (munData?.name) {
              setDeliveryCity(munData.name);
            }
          });
      }
    };

    fillCustomerData();
  }, [deliveryType, cart.customer, cart.customer_id]);

  // Cargar tarifas de envío disponibles para POS cuando es delivery
  useEffect(() => {
    if (deliveryType === 'pickup') {
      setShippingRates([]);
      setSelectedRateId('');
      setShippingFee(0);
      return;
    }

    const loadShippingRates = async () => {
      try {
        const { shippingRatesService } = await import('@/lib/services/shippingRatesService');
        const rates = await shippingRatesService.getShippingRates(cart.organization_id, {
          is_active: true,
        });
        const posRates = tarifasVisiblesEnPos(rates);

        if (posRates.length === 0) {
          setShippingRates([]);
          setSelectedRateId('');
          setShippingFee(0);
          return;
        }

        // Calcular costo para cada tarifa usando simulateShipping
        const subtotal = calculatedTotals.subtotal || cart.subtotal;
        const simulated = await shippingRatesService.simulateShipping(cart.organization_id, {
          destination_city: deliveryCity || undefined,
          weight_kg: 1,
          declared_value: subtotal,
        });

        const rateOptions = opcionesDeTarifa(simulated, posRates);

        setShippingRates(rateOptions);

        // Auto-seleccionar la más económica
        const cheapest = tarifaPorDefecto(rateOptions);
        if (cheapest) {
          setSelectedRateId(cheapest.id);
          setShippingFee(cheapest.total_cost);
        }
      } catch (error) {
        console.error('Error loading shipping rates:', error);
        setShippingRates([]);
      }
    };

    loadShippingRates();
  }, [deliveryType, deliveryCity, cart.organization_id, cart.subtotal, calculatedTotals.subtotal]);

  // Actualizar shippingFee cuando cambia selectedRateId
  useEffect(() => {
    const flete = fleteDeTarifaElegida(selectedRateId, shippingRates);
    if (flete !== null) setShippingFee(flete);
  }, [selectedRateId, shippingRates]);

  // Calcular totales con impuestos cuando cambie el carrito o configuración de impuestos.
  // El cálculo es async: si la casilla cambia a mitad, el resultado viejo no pisa al nuevo.
  useEffect(() => {
    let vivo = true;
    void calculateCartTotals(() => vivo);
    return () => { vivo = false; };
  }, [cart.items, organizationTaxes, appliedTaxes, taxIncluded, casillaMovida]);

  // La entrada que el modal pre-rellenó sigue al total. Si no, al mover
  // «Impuestos incluidos» el total cambia y el monto a cobrar se queda en
  // la cifra anterior (el cajero no la tecleó).
  useEffect(() => {
    if (!open || showReceipt) return;
    setPayments((prev) => applyTipToPrefilledPayment(prev, touchedIds, cartTotal));
  }, [open, showReceipt, cartTotal, touchedIds]);

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
  
  const loadDrivers = async () => {
    try {
      const { transportService } = await import('@/lib/services/transportService');
      const driversData = await transportService.getDrivers(cart.organization_id);
      const mapped = driversData
        .filter((d: any) => d.is_active)
        .map((d: any) => {
          const emp = d.employments;
          const firstEmp = Array.isArray(emp) ? emp[0] : emp;
          const om = firstEmp?.organization_members;
          const omObj = Array.isArray(om) ? om[0] : om;
          const profileData = omObj?.profiles;
          const profile = Array.isArray(profileData) ? profileData[0] : profileData;
          const name = profile
            ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email
            : 'Conductor';
          return { id: d.id, name, phone: profile?.phone };
        });
      setDrivers(mapped);
    } catch (error) {
      console.error('Error loading drivers:', error);
    }
  };

  const searchCustomerAddresses = async (query: string) => {
    if (query.trim().length < 3) {
      setAddressResults([]);
      setShowAddressDropdown(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('customers')
        .select(`
          id, first_name, last_name, address, phone,
          municipality:municipalities(name, state_name)
        `)
        .eq('organization_id', cart.organization_id)
        .not('address', 'is', null)
        // Entrecomillado (helper único): una coma o un paréntesis no rompen el `or`.
        .or(ilikeAnyOf(['address', 'first_name', 'last_name', 'phone'], query))
        .limit(8);
      if (error) throw error;
      const results = (data || []).map((c: any) => ({
        id: c.id,
        name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Sin nombre',
        address: c.address || '',
        city: c.municipality?.name || undefined,
        phone: c.phone || undefined,
      }));
      setAddressResults(results);
      setShowAddressDropdown(results.length > 0);
    } catch (err) {
      console.error('Error searching addresses:', err);
      setAddressResults([]);
      setShowAddressDropdown(false);
    }
  };

  const selectCustomerAddress = (addr: { id: string; name: string; address: string; city?: string; phone?: string }) => {
    setDeliveryAddress(addr.address);
    if (addr.city && !deliveryCity) setDeliveryCity(addr.city);
    if (addr.phone && !deliveryContactPhone) setDeliveryContactPhone(addr.phone);
    if (addr.name && !deliveryContactName) setDeliveryContactName(addr.name);
    setAddressSearch(addr.address);
    setShowAddressDropdown(false);
  };

  const loadServers = async () => {
    try {
      const members = await POSService.getOrganizationMembers();
      setServers(meserosDesdeMiembros(members));
    } catch (error) {
      console.error('Error loading servers:', error);
    }
  };
  
  // F2-B ronda 3 (QA-3): la ÚNICA entrada de pago pre-rellenada (no tocada
  // por el cajero) sigue al total con la propina en AMBOS sentidos: sube al
  // fijar una propina (botón, importe libre o «Aplicar» del aviso de la
  // pantalla) y BAJA al quitarla o cambiarla. Antes solo subía con «Aplicar»,
  // y al deseleccionar el porcentaje la entrada conservaba la propina:
  // totalPaid > cartTotal, «Cambio» = la propina retirada y, en tarjeta/QR,
  // un pago confirmado por encima de la venta. Una entrada TOCADA (efectivo
  // tecleado, QR confirmado por el proveedor) nunca se modifica.
  const followTipOnPrefilledPayment = (nextTipAmount: number) => {
    setPayments((prev) => applyTipToPrefilledPayment(prev, touchedIds, baseTotal + nextTipAmount + shippingFee));
  };

  // Mesa (D9 → D10): la propina elegida en la pre-cuenta llega puesta al cobro,
  // con la misma aritmética que los botones (computeTipAmount) y sobre la misma base.
  useEffect(() => {
    if (!open || !contextoMesa || propinaMesaAplicadaRef.current || payments.length === 0 || baseTip <= 0) return;
    const pct = contextoMesa.propinaPorcentaje ?? null;
    const valor = pct ? computeTipAmount(baseTip, pct) : Math.max(0, Number(contextoMesa.propinaValor) || 0);
    propinaMesaAplicadaRef.current = true;
    if (valor <= 0) return;
    setTipPercentage(pct);
    setTipAmount(valor);
    followTipOnPrefilledPayment(valor);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una vez por apertura, cuando ya hay base y pago
  }, [open, baseTip, payments.length]);

  const handleTipPercentage = (percentage: number) => {
    if (tipPercentage === percentage) {
      // Deseleccionar si ya está seleccionado
      setTipPercentage(null);
      setTipAmount(0);
      followTipOnPrefilledPayment(0);
    } else {
      setTipPercentage(percentage);
      // Misma aritmética que la pantalla del cliente y «Aplicar» (tip.ts, regla dura 7): con presets
      // arbitrarios de la organización `Math.round(base * (pct / 100))` difería en 1 (25 × 58 % → 14 / 15).
      const calculatedTip = computeTipAmount(baseTip, percentage);
      setTipAmount(calculatedTip);
      followTipOnPrefilledPayment(calculatedTip);
    }
  };

  const handleTipAmountChange = (valorTecleado: number) => {
    // D7: «otro valor» nunca pasa del 10 % de la base (antes de impuestos).
    const value = propinaTopada(valorTecleado, baseTip);
    setTipPercentage(null);
    setTipAmount(value);
    followTipOnPrefilledPayment(value);
  };

  // Generar QR de pago según el método seleccionado
  // `entryId` / `entryAmount`: la entrada de pago desde la que se pulsó
  // «Generar QR» (C2). El QR se genera por el importe de la PROPIA entrada,
  // acotado a lo que falta tras las OTRAS entradas y nunca por encima del
  // total (ronda 5, QA-1: 30.000 sobre 25.000 → 25.000; efectivo 15.000 +
  // entrada 20.000 → 10.000); si queda en 0 se cae a lo pendiente y, sin
  // nada pendiente, al total. Así lo que cobra el código es lo que ve el
  // cliente en la pantalla.
  const handleQrPayment = async (methodCode: string, entryId?: string, entryAmount?: number) => {
    // Ya hay una generación en vuelo: la segunda pulsación no hace nada
    // (F2C-R7-2). Antes del fetch y de cualquier setState.
    if (qrRequestInFlightRef.current) return;
    if (!cart.branch_id) {
      toast.error(tPos('errores.sinSucursal'));
      return;
    }
    qrRequestInFlightRef.current = true;
    setIsCreatingQr(true);
    try {
      const reference = `POS-${Date.now()}-${cart.organization_id}`;
      const othersTotal = payments.filter((p) => p.id !== entryId).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      // Sin saldo pendiente no se genera cobro (ronda 6, HALLAZGO R): con las
      // otras entradas cubriendo ya el total (o total 0), resolveQrChargeAmount
      // caería al total y el proveedor crearía un cobro REAL sobre una venta
      // ya cubierta. Se corta antes del fetch.
      if (Math.max(0, cartTotal - othersTotal) <= 0) {
        toast.error(tPos('qr.sinSaldo'));
        return;
      }
      const amount = resolveQrChargeAmount({ entryAmount, othersTotal, total: cartTotal });

      // Guardar el metodo QR para registrar el pago correcto al confirmar
      setQrPaymentMethod(methodCode);

      // Determinar endpoint según el método
      let endpoint = '';
      let providerLabel = '';
      let extraBody: Record<string, unknown> = {};

      if (methodCode === 'redeban_qr') {
        endpoint = '/api/integrations/redeban/create-qr';
        providerLabel = 'Redeban QR';
      } else if (methodCode === 'breb_qr') {
        endpoint = '/api/integrations/breb/create-qr';
        providerLabel = 'Bre-B (Mono)';
        // La llave Bre-B (a dónde llega el dinero) sale de la conexión, en el servidor.
      } else if (methodCode === 'bancolombia_qr_wompi') {
        endpoint = '/api/integrations/bancolombia/wompi/create-qr';
        providerLabel = 'Bancolombia QR (Wompi)';
        extraBody = { customerEmail: currentUser?.email || 'caja@erp.co' };
      } else if (methodCode === 'bancolombia_qr') {
        endpoint = '/api/integrations/bancolombia/create-qr';
        providerLabel = 'Bancolombia QR';
      } else if (methodCode === 'bold_link') {
        // Bold Link de pago (API Link, online)
        endpoint = '/api/integrations/bold/create-link';
        providerLabel = 'Bold Link de Pago';
        extraBody = {
          payment_methods: ['CREDIT_CARD', 'PSE', 'BOTON_BANCOLOMBIA', 'NEQUI'],
          callback_url: typeof window !== 'undefined' ? window.location.origin : '',
        };
      } else if (methodCode === 'bold_qr') {
        // Bold QR (API Integrations, datáfono)
        endpoint = '/api/integrations/bold/create-pos-payment';
        providerLabel = 'Bold QR';
        extraBody = {
          payment_method: 'PAY_BY_QR_BOLD',
          // terminal_model y terminal_serial se resuelven en el backend
        };
      } else {
        toast.error(tPos('qr.noSoportado'));
        return;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // La conexión de cobro la resuelve el servidor (organización de la sesión + sucursal).
          amount,
          currency: currency?.code || 'COP',
          reference,
          description: `POS - Venta ${cart.id || ''}`,
          source: 'pos',
          sourceId: cart.id?.toString() || '',
          branchId: cart.branch_id,
          organizationId: cart.organization_id,
          ...extraBody,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        toast.error(tPos('qr.errorGenerar'), { description: errData.error || tPos('errores.desconocido') });
        return;
      }

      const data = await response.json();

      // Bold Link de pago: la respuesta incluye payment_url en lugar de qr_data
      // Si solo hay payment_url (sin qr_data ni qr_image_url), abrir en nueva ventana
      if (data.payment_url && !data.qr_data && !data.qr_image_url) {
        window.open(data.payment_url, '_blank');
        toast.success(tPos('qr.linkAbierto'), {
          description: tPos('qr.linkAbiertoDesc'),
        });
        return;
      }

      const session = data.qrSession;
      const qr = data.qr;

      setQrReference(reference);
      setQrProviderLabel(providerLabel);
      // Qué campo trae cada proveedor (Bre-B `qr`, Redeban `qr_string` +
      // `qr_image_base64`, Wompi `qr_image`, Bancolombia `redirectURL`): lo
      // decide pickQrFromProviderResponse, el mismo mapeo que prueba la
      // pantalla del cliente; aquí no se enumeran campos.
      const picked = pickQrFromProviderResponse(qr);
      setQrData(picked.data);
      setQrImageUrl(picked.imageUrl);
      setQrExpiresAt(session?.expires_at || undefined);
      setQrDead(false);
      setQrAmount(amount);
      setQrEntryId(entryId);
      setShowQrOnDisplay(displayConnectedRef.current);
      setShowQrDialog(true);
    } catch (err) {
      console.error('Error en handleQrPayment:', err);
      toast.error(tPos('qr.errorGenerarPago'));
    } finally {
      // Siempre (éxito, retorno temprano o error): el botón vuelve a estar
      // disponible y la siguiente pulsación ya puede generar otro código.
      qrRequestInFlightRef.current = false;
      setIsCreatingQr(false);
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
      
      // Inicializar impuestos aplicados: usar los del carrito si existen, sino los predeterminados
      const cartTaxIds = cart.applied_tax_ids;
      const initialAppliedTaxes: {[key: string]: boolean} = {};
      orgTaxes.forEach((tax) => {
        initialAppliedTaxes[tax.id] = cartTaxIds
          ? cartTaxIds.includes(tax.id)
          : tax.is_default;
      });
      setAppliedTaxes(initialAppliedTaxes);
      
    } catch (error) {
      console.error('Error loading tax data:', error);
    }
  };
  
  const calculateCartTotals = async (vigente: () => boolean = () => true) => {
    if (!cart.items.length) {
      if (vigente()) setCalculatedTotals({ subtotal: 0, totalTaxAmount: 0, finalTotal: 0 });
      return;
    }

    let combinedSubtotal = 0;
    let combinedTaxAmount = 0;
    let combinedFinalTotal = 0;
    const combinedBreakdown: { [taxId: string]: { name: string; amount: number } } = {};

    // Procesar cada ítem del carrito
    for (const item of cart.items) {
      try {
        const productTaxes = await POSService.getProductTaxes(item.product_id);
        
        const incluido = impuestoIncluidoDeLinea(item, taxIncluded, casillaMovida);
        const taxItem: TaxCalculationItem = {
          quantity: item.quantity,
          unit_price: item.unit_price,
          product_id: item.product_id,
          discount_amount: item.discount_amount || 0,
          tax_rate: item.tax_rate || undefined,
          tax_included: incluido
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
            incluido
          );
        } else {
          // Usar impuestos de organización
          result = calculateCartTaxes(
            [taxItem],
            appliedTaxes,
            organizationTaxes,
            incluido
          );
        }
        
        // Acumular totales
        combinedSubtotal += result.subtotal;
        combinedTaxAmount += result.totalTaxAmount;
        combinedFinalTotal += result.finalTotal;

        // Acumular desglose por nombre de impuesto (IVA, ICA, etc.)
        result.taxBreakdown.forEach(tax => {
          if (combinedBreakdown[tax.taxId]) {
            combinedBreakdown[tax.taxId].amount += tax.taxAmount;
          } else {
            combinedBreakdown[tax.taxId] = { name: tax.name, amount: tax.taxAmount };
          }
        });
        
      } catch (error) {
        console.error('Error calculating taxes for item:', item, error);
        // En caso de error, agregar el ítem sin impuestos
        const lineTotal = item.quantity * item.unit_price;
        combinedSubtotal += lineTotal;
        combinedFinalTotal += lineTotal;
      }
    }
    
    if (!vigente()) return;
    // Actualizar estado con totales calculados
    setCalculatedTotals({
      subtotal: Math.round(combinedSubtotal * 100) / 100,
      totalTaxAmount: Math.round(combinedTaxAmount * 100) / 100,
      finalTotal: Math.round(combinedFinalTotal * 100) / 100
    });
    setTaxBreakdown(
      Object.values(combinedBreakdown).map(t => ({
        name: t.name,
        amount: Math.round(t.amount * 100) / 100
      }))
    );
  };

  // Pagos (L42): reductores puros en src/lib/pos/venta/cobro/pagosCobro.ts.
  const addPayment = () => {
    // Entrada nueva en efectivo por lo que falta (la primera, por el total).
    const newPayment: PaymentEntry = entradaDePagoNueva({
      id: crypto.randomUUID(),
      amount: remaining
    });
    setPayments([...payments, newPayment]);
  };

  const updatePayment = (id: string, field: 'method' | 'amount', value: string | number) => {
    // A partir de aquí la pantalla del cliente muestra recibido y cambio en vivo para ESTA entrada.
    if (field === 'amount') setTouchedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    setPayments(actualizarEntradaPago(payments, id, field, value));
  };

  const removePayment = (id: string) => {
    // Con una sola entrada devuelve la misma lista: React no re-renderiza.
    setPayments(quitarEntradaPago(payments, id));
  };

  // Seriales obligatorios (L48): src/lib/pos/venta/cobro/serialesCobro.ts.
  const serializedItems = lineasConSerial(cart.items);
  const hasSerialItems = serializedItems.length > 0;
  const serialSelectionsComplete = seleccionSerialesCompleta(serializedItems, serialSelections);

  // Handler que pre-llena la tasa de comisión desde vendor_commission_rates
  // al seleccionar un vendedor. El usuario puede override después.
  const handleSalespersonChange = async (value: string) => {
    setSalespersonId(value);
    if (esPersonaAsignada(value)) {
      const cambio = comisionDeTasaResuelta(await resolveCommissionRate(value));
      if (cambio) {
        setCommissionRate(cambio.commissionRate);
        setCommissionMethod(cambio.commissionMethod);
      }
    } else {
      setCommissionRate(0);
    }
  };

  const handleCheckout = async () => {
    if (!canComplete) return;

    if (!cart.branch_id) {
      toast.error(tPos('errores.sinSucursal'));
      return;
    }

    if (hasSerialItems && !serialSelectionsComplete) {
      setShowSerialSelector(true);
      return;
    }

    // Doble pulsación en el mismo instante (doble tap, Enter repetido): el
    // estado `isProcessing` llega un render tarde; el ref corta de forma
    // síncrona, igual que `qrRequestInFlightRef` en «Generar QR de pago».
    if (cobroEnVueloRef.current) return;
    cobroEnVueloRef.current = true;
    setIsProcessing(true);
    try {
      // Asegurar que los datos del cliente estén disponibles
      let customerData = cart.customer;
      if (cart.customer_id && !customerData) {
        const { supabase } = await import('@/lib/supabase/config');
        const { data: fetchedCustomer } = await supabase
          .from('customers')
          .select('*')
          .eq('id', cart.customer_id)
          .single();
        if (fetchedCustomer) {
          customerData = fetchedCustomer as any;
        }
      }

      // Validar stock de ingredientes para productos compuestos
      const branchId = cart.branch_id;
      if (branchId && cart.items.length > 0) {
        // L49 (src/lib/pos/venta/cobro/stockRecetaCobro.ts): Desktop sin red
        // no bloquea la venta; en el navegador un fallo corta como siempre.
        const stockCheck = await comprobarStockReceta(
          cart.items.map(item => ({ product_id: item.product_id, quantity: item.quantity })),
          branchId,
          { validar: validateCompositeStock, esDesktop: isDesktop },
        );
        if (debeConfirmarStock(stockCheck)) {
          // Reemplazo de window.confirm por un diálogo controlado (`Dialogo` del kit).
          // Se pausa el flujo con una promesa que se resuelve al confirmar/cancelar.
          const proceed = await new Promise<boolean>((resolve) => {
            setStockConfirm({ message: stockCheck.message, resolve });
          });
          if (!proceed) {
            setIsProcessing(false);
            return;
          }
        }
      }

      // Crear cart actualizado con totales calculados con impuestos
      const updatedItems = cart.items.map(item => {
        // Calcular proporción de impuestos para este item
        const itemSubtotal = item.quantity * item.unit_price;
        const taxProportion = totalesCobro.subtotal > 0 
          ? itemSubtotal / totalesCobro.subtotal 
          : 0;
        const itemTaxAmount = totalesCobro.totalTaxAmount * taxProportion;
        const itemTaxRate = itemSubtotal > 0 ? (itemTaxAmount / itemSubtotal) * 100 : 0;
        const incluido = impuestoIncluidoDeLinea(item, taxIncluded, casillaMovida);

        return {
          ...item,
          tax_included: incluido,
          total: incluido ? itemSubtotal : itemSubtotal + itemTaxAmount,
          tax_amount: itemTaxAmount,
          tax_rate: itemTaxRate
        };
      });

      const updatedCart: Cart = {
        ...cart,
        items: updatedItems,
        subtotal: totalesCobro.subtotal,
        tax_total: totalesCobro.totalTaxAmount,
        tax_amount: totalesCobro.totalTaxAmount, // Alias for compatibility
        total: totalesCobro.finalTotal
      };

      if (!intentoCobroRef.current) {
        intentoCobroRef.current = { id: newSaleId(), creadoEn: new Date().toISOString() };
      }
      const intento = intentoCobroRef.current;

      const checkoutData: CheckoutData = {
        cart: updatedCart,
        payments: pagosDelSobre(payments),
        change,
        total_paid: totalPaid,
        tax_included: taxIncluded,
        tip_amount: tipAmount,
        tip_server_id: esPersonaAsignada(serverId) ? serverId : undefined,
        tax_breakdown: taxBreakdown.length > 0 ? taxBreakdown : undefined,
        // L45: salesperson_id, commission_rate, commission_type, commission_method, commission_amount.
        ...camposComisionDelSobre({ salespersonId, commissionRate, commissionType, commissionMethod, commissionAmount }),
        // L46: delivery_type, delivery_info, driver_id, shipping_fee.
        ...camposEntregaDelSobre({
          deliveryType,
          deliveryAddress,
          deliveryCity,
          deliveryContactName,
          deliveryContactPhone,
          deliveryInstructions,
          selectedDriverId,
          shippingFee,
        }),
        serial_selections: hasSerialItems && serialSelectionsComplete ? serialSelections : undefined,
        // Id y fecha del intento de cobro, generados una vez y reutilizados en
        // los reintentos (navegador y escritorio). Con red la venta se inserta
        // con ese id; sin red (escritorio) va al outbox con el mismo id. En un
        // cobro de mesa o de deuda es la llave de idempotencia de los pagos.
        saleId: intento.id,
        createdAt: intento.creadoEn,
        attemptId: intento.id,
      };

      const sale = onProcessPayment
        ? await onProcessPayment(checkoutData)
        : await POSService.checkout(checkoutData);
      // L51/L52 (src/lib/pos/venta/cobro/postVentaCobro.ts): qué se hace tras
      // la venta en cada caso; el orden sigue siendo el de este bloque.
      const postVenta = planPostVenta({
        sale,
        branchId: cart.branch_id,
        payments,
        deliveryType,
        deliveryAddress,
        sendToFactus,
      });
      const isPendingSync = postVenta.pendienteSincronizar;
      if (isPendingSync) {
        toast.warning(tPos('postVenta.avisos.ventaSinRed', { numero: sale.receipt_number_local ?? '' }));
      }
      setCompletedSale(sale);
      setShowReceipt(true);
      saleConfirmedRef.current = true;
      // `saleId` (Fase 4): la pantalla puede pedir calificación durante
      // «Gracias» y la caja la registra contra ESTA venta (feedback.ts).
      // Con la venta en el outbox del escritorio (`pending_sync`) todavía NO
      // hay fila en `sales`, y `pos_display_feedback.sale_id` es una FK: el
      // insert fallaría con 23503 y la calificación se perdería. Va como
      // anónima, que es un caso ya contemplado (ventana de 2 minutos).
      getPosDisplayEmitter().setMode('thanks', { total: cartTotal, saleId: postVenta.saleIdPantalla });

      // Haptic feedback de venta exitosa (no-op en web)
      hapticNotification('success');
      hapticImpact('medium');

      // Ticket físico automático (sin impresora de caja: aviso) y cajón con
      // efectivo, en ese orden y best-effort: lanzarTicketYCajon.
      setEstadoRecibo(postVenta.ticket === 'encolar' ? 'enviando' : null);
      setDetalleRecibo(null);
      lanzarTicketYCajon(postVenta, {
        encolarTicket: () => PrintJobsService.enqueueSaleTicket(cart.branch_id, {
          saleId: sale.id,
          // Offline: número local + «Pendiente de sincronizar» en el papel.
          saleNumber: ticketSaleNumber(sale),
          customerName: customerData?.full_name,
          customerDocType: customerData?.doc_type,
          customerDocNumber: customerData?.doc_number,
          customerPhone: customerData?.phone,
          customerEmail: customerData?.email,
          customerAddress: customerData?.address,
          createdAt: new Date().toISOString(),
          subtotal: calculatedTotals.subtotal,
          taxTotal: calculatedTotals.totalTaxAmount,
          tipAmount: (sale as any).tip_amount || 0,
          deliveryFee: (sale as any).delivery_fee || 0,
          total: cartTotal,
          items: updatedCart.items.map((item) => ({
            productName: (item as any).name || item.product?.name || 'Producto',
            quantity: item.quantity,
            ...camposCantidadImpresa(item.product),
            unitPrice: item.unit_price,
            total: item.total,
            taxAmount: item.tax_amount,
            discountAmount: item.discount_amount,
            variantData: (item as any).product?.variant_data || null,
            modifiers: item.modifiers?.map(m => ({ name: m.name, extraPrice: m.extraPrice })) || null,
            // Solo la nota PARA EL CLIENTE; la de cocina (`notes`) nunca va al ticket.
            note: item.customer_note || null,
          })),
          payments: pagosParaImpresion(payments, paymentMethods),
          businessName: organization?.name,
          businessNit: organization?.nit || organization?.tax_id,
          businessPhone: organization?.phone,
          businessAddress: organization?.address,
          businessEmail: organization?.email,
          businessCity: (organization as any)?.city,
          businessFiscalResponsibilities: (organization as any)?.fiscal_responsibilities || null,
          businessLogoUrl: (organization as any)?.logo_url || undefined,
          branchName: branch?.name,
          branchAddress: branch?.address,
          branchPhone: branch?.phone,
          cashierName: currentUser?.name,
          // El recibido y el cambio se calculan aqui y antes no viajaban al
          // ticket fisico: el cliente veia el vuelto en pantalla pero no en
          // el papel.
          totalPaid,
          changeAmount: change > 0 ? change : undefined,
          deliveryInfo: deliveryType !== 'pickup' && deliveryAddress ? {
            type: deliveryType === 'delivery_own' ? 'Domicilio propio' : 'Domicilio',
            address: deliveryAddress,
            driverName: selectedDriverId ? drivers.find(d => d.id === selectedDriverId)?.name : undefined,
            contactName: deliveryContactName || customerData?.full_name || undefined,
            contactPhone: deliveryContactPhone || customerData?.phone || undefined,
            city: deliveryCity || undefined,
            instructions: deliveryInstructions || undefined,
          } : undefined,
        }),
        abrirCajon: () => CashDrawerService.open(cart.branch_id),
        // Los avisos del recibo se ven en la post-venta (sin badge «Nuevo», H6), no como toast.
        avisarAdvertencia: (mensaje) => {
          if (mensaje === AVISO_SIN_IMPRESORA_CAJA) setEstadoRecibo('sinImpresora');
          else if (mensaje === AVISO_VENTA_SIN_SUCURSAL) setEstadoRecibo('sinSucursal');
          else toast.warning(mensaje);
        },
        avisarError: (mensaje) => {
          setEstadoRecibo('error');
          setDetalleRecibo(mensaje.startsWith(PREFIJO_ERROR_TICKET) ? mensaje.slice(PREFIJO_ERROR_TICKET.length) : mensaje);
        },
        alEncolar: (enqueued) => {
          if (enqueued > 0) setEstadoRecibo('enviado');
        },
      });

      // Crear shipment si es delivery propio
      // Sin red no hay venta en la BD todavía: el envío no puede crearse.
      if (postVenta.envio === 'avisar_sin_red') {
        toast.warning(tPos('postVenta.avisos.envioSinRed'));
      }
      if (postVenta.envio === 'hacer') {
        try {
          const { deliveryIntegrationService } = await import('@/lib/services/deliveryIntegrationService');
          await deliveryIntegrationService.createShipmentFromPOSSale({
            saleId: sale.id,
            organizationId: cart.organization_id,
            branchId: cart.branch_id,
            customerId: cart.customer_id,
            customerName: customerData?.full_name,
            customerPhone: customerData?.phone,
            total: cartTotal,
            shippingFee: shippingFee > 0 ? shippingFee : undefined,
            shippingRateId: selectedRateId || undefined,
            itemsCount: cart.items.length,
            driverId: selectedDriverId || undefined,
            paymentStatus: shipmentPaymentStatus,
            deliveryInfo: {
              address: deliveryAddress,
              city: deliveryCity,
              contact_name: deliveryContactName || customerData?.full_name || '',
              contact_phone: deliveryContactPhone || customerData?.phone || '',
              instructions: deliveryInstructions,
            },
            saleItems: cart.items.map((item) => {
              const product = item.product as any;
              const variantData = product?.variant_data
                ? Object.fromEntries(Object.entries(product.variant_data as Record<string, string>).filter(([, v]) => !!v))
                : undefined;
              const notes: Record<string, unknown> = {};
              if (item.modifiers && item.modifiers.length > 0) {
                notes.modifiers = item.modifiers;
              }
              if (variantData && Object.keys(variantData).length > 0) {
                notes.variant_data = variantData;
              }
              if (product?.name) {
                notes.product_name = product.name;
              }
              if (item.discount_amount && item.discount_amount > 0) {
                notes.discount_amount = item.discount_amount;
              }
              if (item.tax_amount && item.tax_amount > 0) {
                notes.tax_amount = item.tax_amount;
                notes.tax_rate = item.tax_rate || 0;
              }
              if (item.tax_excluded !== undefined) {
                notes.tax_excluded = item.tax_excluded;
              }
              if (product?.image) {
                notes.product_image = product.image;
              }
              return {
                description: product?.name || item.product?.name || 'Producto',
                qty: item.quantity,
                unit_value: item.unit_price,
                total_value: item.total,
                product_id: item.product_id,
                sku: item.product?.sku,
                sale_item_id: item.id,
                notes: Object.keys(notes).length > 0 ? JSON.stringify(notes) : undefined,
              };
            }),
          });
        } catch (shipmentError) {
          console.error('Error creando shipment:', shipmentError);
        }
      }

      // Enviar a Factus (factura electrónica) si el toggle está activado
      if (postVenta.factura === 'avisar_sin_red') {
        toast.warning(tPos('postVenta.avisos.facturaSinRed'));
      }
      if (postVenta.factura === 'hacer') {
        try {
          // Buscar la invoice_sales creada durante el checkout
          const { data: invoiceSale } = await supabase
            .from('invoice_sales')
            .select('id, number')
            .eq('sale_id', sale.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (invoiceSale?.id) {
            toast.info(tPos('postVenta.avisos.enviandoFactura'));
            const result = await electronicInvoicingService.sendToFactus(invoiceSale.id, cart.organization_id);
            if (result.success) {
              toast.success(tPos('postVenta.avisos.facturaEnviada'), {
                description: tPos('postVenta.avisos.facturaEnviadaDesc', { numero: invoiceSale.number }),
              });

              // Consultar el job de DIAN para obtener CUFE y QR
              try {
                const { data: eJob } = await supabase
                  .from('electronic_invoicing_jobs')
                  .select('cufe, qr_code, status, processed_at, response_payload')
                  .eq('invoice_id', invoiceSale.id)
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle();

                if (eJob?.cufe) {
                  // Guardar datos para impresión manual desde el recibo
                  setElectronicInvoiceData({
                    invoiceId: invoiceSale.id,
                    invoiceNumber: invoiceSale.number,
                    cufe: eJob.cufe,
                    qrData: eJob.qr_code || '',
                    environment: 'test',
                    validationDate: eJob.processed_at,
                  });

                  // Encolar impresión física de la factura electrónica
                  if (cart.branch_id) {
                    const envConfig = await supabase
                      .from('electronic_invoicing_config')
                      .select('environment')
                      .eq('organization_id', cart.organization_id)
                      .maybeSingle();

                    PrintJobsService.enqueueElectronicInvoice(cart.branch_id, {
                      invoiceId: invoiceSale.id,
                      invoiceNumber: invoiceSale.number,
                      cufe: eJob.cufe,
                      qrData: eJob.qr_code || '',
                      environment: envConfig.data?.environment === 'production' ? 'production' : 'test',
                      validationDate: eJob.processed_at || undefined,
                      createdAt: new Date().toISOString(),
                      total: cartTotal,
                      subtotal: calculatedTotals.subtotal,
                      taxTotal: calculatedTotals.totalTaxAmount,
                      taxIncluded: taxIncluded,
                      taxLines: taxBreakdown.length > 0 ? taxBreakdown : null,
                      items: updatedCart.items.map((item) => ({
                        productName: (item as any).name || item.product?.name || 'Producto',
                        quantity: item.quantity,
                        ...camposCantidadImpresa(item.product),
                        unitPrice: item.unit_price,
                        total: item.total,
                        taxAmount: item.tax_amount,
                        discountAmount: item.discount_amount,
                        variantData: (item as any).product?.variant_data || null,
                        modifiers: item.modifiers?.map(m => ({ name: m.name, extraPrice: m.extraPrice })) || null,
                        note: item.customer_note || null,
                      })),
                      payments: pagosParaImpresion(payments, paymentMethods),
                      customerName: customerData?.full_name,
                      customerDocType: customerData?.doc_type,
                      customerDocNumber: customerData?.doc_number,
                      customerPhone: customerData?.phone,
                      customerAddress: customerData?.address,
                      businessName: organization?.name,
                      businessNit: organization?.nit || organization?.tax_id,
                      businessPhone: organization?.phone,
                      businessAddress: organization?.address,
                      businessEmail: organization?.email,
                      businessCity: (organization as any)?.city,
                      businessFiscalResponsibilities: (organization as any)?.fiscal_responsibilities || null,
                      businessLogoUrl: (organization as any)?.logo_url || undefined,
                      branchName: branch?.name,
                      branchAddress: branch?.address,
                      branchPhone: branch?.phone,
                      cashierName: currentUser?.name,
                      totalPaid,
                      changeAmount: change > 0 ? change : undefined,
                    }).then(({ enqueued }) => {
                      if (enqueued > 0) {
                        toast.success(tPos('postVenta.avisos.facturaImpresora'), {
                          description: tPos('postVenta.avisos.facturaImpresoraDesc'),
                        });
                      }
                    }).catch((err) => {
                      console.error('Error encolando impresión factura electrónica:', err);
                    });
                  }
                }
              } catch (queryErr) {
                console.warn('No se pudo consultar el CUFE para impresión:', queryErr);
              }
            } else {
              toast.error(tPos('postVenta.avisos.errorFactura'), {
                description: result.error || tPos('postVenta.avisos.errorFacturaDesc'),
              });
            }
          } else {
            toast.warning(tPos('postVenta.avisos.facturaNoEncontrada'));
          }
        } catch (factusError: any) {
          console.error('Error sending to Factus:', factusError);
          toast.error(tPos('postVenta.avisos.errorFactura'), { description: factusError.message || tPos('errores.desconocido') });
        }
      }

      // NO cerrar automáticamente - el usuario debe cerrar manualmente después de imprimir
      
    } catch (error: any) {
      console.error('Error during checkout:', error);
      // Haptic feedback de error (no-op en web)
      hapticNotification('error');
      hapticImpact('heavy');
      // P1: una membresía sin cliente titular; la base no guardó nada.
      if (esErrorMembresiaSinCliente(error)) {
        toast.error(tMembresias('errores.membresia_sin_cliente'));
        onPedirCliente?.();
        return;
      }
      // Rechazos del servidor con código estable (precio, descuento, línea…)
      // se muestran traducidos; el resto, como llegan.
      const codigo = codigoErrorCobro(error);
      const errorMsg = codigo
        ? tCobro(`errores.${codigo}`, { detalle: detalleErrorCobro(error) })
        : error?.message || error?.details || (typeof error === 'string' ? error : tPos('errores.desconocido'));
      // Antes un alert() nativo; el carrito NO se toca: se puede reintentar
      // (mismo intento de cobro, intentoCobroRef).
      toast.error(tPos('errores.titulo'), { description: errorMsg });
    } finally {
      cobroEnVueloRef.current = false;
      setIsProcessing(false);
    }
  };

  const handlePrint = async () => {
    if (completedSale) {
      // Asegurar datos del cliente para impresión
      let printCustomerData = cart.customer;
      if (cart.customer_id && !printCustomerData) {
        try {
          const { supabase } = await import('@/lib/supabase/config');
          const { data: fetched } = await supabase
            .from('customers')
            .select('*')
            .eq('id', cart.customer_id)
            .single();
          if (fetched) printCustomerData = fetched as any;
        } catch {
          console.warn('No se pudo obtener datos del cliente para impresión');
        }
      }
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
        notes: {
          product_name: item.product?.name || 'Producto',
          ...(item.modifiers && item.modifiers.length > 0 ? { modifiers: item.modifiers } : {}),
          ...(item.customer_note ? { customer_note: item.customer_note } : {}),
        },
        product_name: item.product?.name || 'Producto',
        product: item.product
      }));

      // Crear array de pagos para el ticket
      const paymentsList = payments.map(p => ({
        id: p.id,
        method: p.method,
        amount: p.amount
      }));

      // Datos del negocio y sucursal desde la BD (nombre, logo, NIT, teléfono, correo, dirección)
      const { business, branch: branchInfo } = await PrintService.getBusinessAndBranch(completedSale.organization_id);
      const businessInfo: BusinessInfo = business || {
        name: organization?.name || 'Mi Empresa',
        logoUrl: (organization as any)?.logo_url
      };

      // Datos del cajero (quien facturó en el POS)
      let cashierName = currentUser?.name;
      let cashierEmail = currentUser?.email;
      if (!cashierName) {
        try {
          const { data: authData } = await supabase.auth.getUser();
          const authUser = authData?.user;
          if (authUser) {
            cashierEmail = cashierEmail || authUser.email;
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
      }
      const cashierInfo: CashierInfo = {
        name: cashierName || 'Sistema POS',
        email: cashierEmail
      };

      // Venta con impuestos calculados y marca de IVA incluido / origen POS
      const saleForPrint = {
        ...completedSale,
        subtotal: calculatedTotals.subtotal || completedSale.subtotal,
        tax_total: calculatedTotals.totalTaxAmount || completedSale.tax_total,
        delivery_fee: shippingFee > 0 ? shippingFee : completedSale.delivery_fee,
        tip_amount: tipAmount > 0 ? tipAmount : completedSale.tip_amount,
        total: cartTotal,
        tax_included: taxIncluded,
        // Lo lee `toSalePayload` para imprimir la linea de CAMBIO.
        change_amount: change > 0 ? change : undefined,
        _source: 'pos',
      } as any;

      // Usar PrintService para generar e imprimir el ticket formateado
      const deliveryInfo = deliveryType !== 'pickup' && deliveryAddress ? {
        type: deliveryType === 'delivery_own' ? 'Envío propio' : 'Envío tercero',
        address: deliveryAddress,
        driverName: selectedDriverId ? drivers.find(d => d.id === selectedDriverId)?.name : undefined,
        contactName: deliveryContactName || printCustomerData?.full_name || undefined,
        contactPhone: deliveryContactPhone || printCustomerData?.phone || undefined,
        city: deliveryCity || undefined,
        instructions: deliveryInstructions || undefined,
      } : undefined;

      PrintService.printTicket(
        saleForPrint,
        saleItems as any,
        printCustomerData as any,
        paymentsList as any,
        businessInfo,
        cashierInfo,
        branchInfo as any,
        taxBreakdown.length > 0 ? taxBreakdown : undefined,
        deliveryInfo,
        timezone,
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
    setSendToFactus(false);
    setElectronicInvoiceData(null);
    setTipAmount(0);
    setTipPercentage(null);
    setServerId('');
    setSalespersonId('');
    setCommissionRate(0);
    setCommissionType('salesperson');
    setCommissionMethod('percentage');
  };

  // Paso 11 del rediseño (POS-PLAN §4): el render pasa a CobroPanel (kit
  // PanelAdaptable, 1120) con la zona de totales a la izquierda y los pagos a
  // la derecha. El estado y los handlers de arriba NO cambian.
  // El pago que se edita (selector de método, monto, «Exacto»): el que el
  // cajero tocó en la lista o, si no, el último (el que acaba de agregar).
  const [pagoActivoId, setPagoActivoId] = useState<string | null>(null);
  const [menuOtroMetodo, setMenuOtroMetodo] = useState(false);
  const pagoActivo = payments.find((p) => p.id === pagoActivoId) ?? payments[payments.length - 1];
  const agregarPago = () => {
    setPagoActivoId(null);
    addPayment();
  };
  const metodosCobro = paymentMethods.map((m) => ({ codigo: m.id, nombre: m.name }));
  const { visibles: metodosVisibles, resto: metodosOtro } = repartirMetodos(metodosCobro, MAX_BOTONES_METODO);
  const nombreMetodo = (codigo: string) => paymentMethods.find((m) => m.id === codigo)?.name ?? codigo;
  const elegirMetodo = (codigo: string) => {
    if (pagoActivo) updatePayment(pagoActivo.id, 'method', codigo);
  };
  // «Exacto» y billetes rápidos (L43, D8): sobre LO QUE FALTA para el pago que
  // se edita (el total menos las otras entradas), src/lib/pos/venta/cobro/montosRapidos.ts.
  const montosPagoActivo = montosDeEntrada(pagoActivo ? faltaParaEntrada(payments, pagoActivo.id, cartTotal) : 0);
  const ponerExacto = () => {
    if (pagoActivo) updatePayment(pagoActivo.id, 'amount', montosPagoActivo.exacto);
  };
  const monedaOrganizacion = useMonedaOrganizacion();
  const monedaCobro = useMemo(() => monedaOrganizacion.paraDocumento(currency?.code), [monedaOrganizacion, currency?.code]);
  const formatearCobro = useMemo(() => crearFormateadorMoneda(monedaCobro), [monedaCobro]);
  const cobroEditable = open && !showReceipt && !showQrDialog && !showSerialSelector && !stockConfirm;

  // Recibo automático (paso 13): lo que pasó al encolarlo, para el aviso de la post-venta.
  const [estadoRecibo, setEstadoRecibo] = useState<EstadoRecibo | null>(null);
  const [detalleRecibo, setDetalleRecibo] = useState<string | null>(null);
  useEffect(() => {
    if (open) return;
    setEstadoRecibo(null);
    setDetalleRecibo(null);
  }, [open]);

  // Secciones plegables (paso 12): cerradas al abrir el cobro, con resumen.
  const [seccionesAbiertas, setSeccionesAbiertas] = useState<Record<SeccionCobro, boolean>>(SECCIONES_CERRADAS);
  const abrirSeccion = (seccion: SeccionCobro, abierta: boolean) => setSeccionesAbiertas((prev) => ({ ...prev, [seccion]: abierta }));
  useEffect(() => {
    if (!open) setSeccionesAbiertas(SECCIONES_CERRADAS);
  }, [open]);
  // Factura electrónica «no configurada» (E-30): la sección se deshabilita con
  // el motivo. Sin respuesta (sin red) no se bloquea nada.
  const [estadoFactura, setEstadoFactura] = useState<EstadoFacturaElectronica | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    leerEstadoFacturaElectronica(supabase as unknown as ClienteConfigFactura, cart.organization_id).then((estado) => {
      if (!cancelado) setEstadoFactura(estado);
    });
    return () => {
      cancelado = true;
    };
  }, [open, cart.organization_id]);
  const facturaDisponible = estadoFactura === null || estadoFactura === 'activa';
  const motivoFactura =
    estadoFactura === 'noConfigurada'
      ? tPos('factura.motivoNoConfigurada')
      : estadoFactura === 'pendiente'
        ? tPos('factura.motivoPendiente')
        : estadoFactura === 'suspendida'
          ? tPos('factura.motivoSuspendida')
          : undefined;
  const resumenFactura = sendToFactus
    ? eInvoiceAlwaysEnabled
      ? tPos('factura.activadaGlobal')
      : tPos('factura.activada')
    : tPos('factura.desactivada');
  const resumenEntrega =
    deliveryType === 'pickup'
      ? tPos('entrega.resumen.recoger')
      : tPos(deliveryType === 'delivery_own' ? 'entrega.resumen.propio' : 'entrega.resumen.tercero', { flete: formatearCobro(shippingFee) });
  const nombreMesero = servers.find((s) => s.id === serverId)?.name ?? tPos('propina.sinMesero');
  const resumenPropina =
    tipAmount > 0
      ? tipPercentage !== null
        ? tPos('propina.resumenPct', { pct: tipPercentage, monto: formatearCobro(tipAmount), mesero: nombreMesero })
        : tPos('propina.resumen', { monto: formatearCobro(tipAmount), mesero: nombreMesero })
      : tPos('propina.resumenNinguna');
  const resumenComision = esPersonaAsignada(salespersonId)
    ? tPos('comision.resumen', {
        vendedor: servers.find((s) => s.id === salespersonId)?.name ?? '',
        tasa: commissionMethod === 'percentage' ? tPos('comision.tasaPct', { tasa: commissionRate }) : formatearCobro(commissionRate),
        monto: formatearCobro(commissionAmount),
      })
    : tPos('comision.resumenNinguna');

  // Atajos del cobro (mapa canónico src/lib/pos/venta/atajos.ts): solo con el
  // cobro abierto y sin otro diálogo encima. Esc lo maneja el propio panel.
  const atajosCobro: Atajo[] = [
    ...ATAJOS_METODO.map((id, posicion) => ({
      tecla: teclaAtajo(id),
      descripcion: tAtajos(id),
      permitirEnCampo: true,
      cuando: () => !isProcessing && !!pagoActivo && accionAtajoMetodo(posicion, metodosVisibles, metodosOtro.length > 0) !== null,
      accion: () => {
        const accion = accionAtajoMetodo(posicion, metodosVisibles, metodosOtro.length > 0);
        if (accion?.tipo === 'elegir') elegirMetodo(accion.codigo);
        if (accion?.tipo === 'otro') setMenuOtroMetodo(true);
      },
    })),
    {
      tecla: teclaAtajo('exacto'),
      descripcion: tAtajos('exacto'),
      permitirEnCampo: true,
      cuando: () => !isProcessing && !!pagoActivo,
      accion: ponerExacto,
    },
    // Alt+D / Alt+P / Alt+F abren o cierran su sección (la comisión no lleva atajo, D13).
    { tecla: teclaAtajo('entrega'), descripcion: tAtajos('entrega'), permitirEnCampo: true, accion: () => abrirSeccion('entrega', !seccionesAbiertas.entrega) },
    { tecla: teclaAtajo('propina'), descripcion: tAtajos('propina'), permitirEnCampo: true, accion: () => abrirSeccion('propina', !seccionesAbiertas.propina) },
    {
      tecla: teclaAtajo('facturaElectronica'),
      descripcion: tAtajos('facturaElectronica'),
      permitirEnCampo: true,
      cuando: () => facturaDisponible,
      accion: () => abrirSeccion('factura', !seccionesAbiertas.factura),
    },
    {
      // Enter completa SOLO con el pago cubierto y sin un control con foco que use Enter.
      tecla: teclaAtajo('completarVenta'),
      descripcion: tAtajos('completarVenta'),
      permitirEnCampo: true,
      cuando: () => canComplete && !isProcessing && enterCompletaVenta(typeof document === 'undefined' ? null : document.activeElement),
      accion: () => {
        void handleCheckout();
      },
    },
  ];
  useAtajos(atajosCobro, { activo: cobroEditable, hayRafaga: hayRafagaDelLector });

  // Cerrar el panel (×, Esc): tras la venta pasa por handleCloseReceipt, que
  // entrega la venta a la pantalla (onCheckoutComplete); sin venta, cancela.
  const alCerrarPanel = (abierto: boolean) => {
    if (abierto) return;
    if (showReceipt) handleCloseReceipt();
    else onOpenChange(false);
  };
  // Imprimir la factura electrónica desde la post-venta (solo con CUFE): el
  // mismo payload y el mismo generador de siempre (PrintService / @printing).
  const handleImprimirFactura = () => {
    if (!electronicInvoiceData) return;
    import('@printing').then(() => {
                    const payload = {
                      invoiceId: electronicInvoiceData.invoiceId,
                      invoiceNumber: electronicInvoiceData.invoiceNumber,
                      cufe: electronicInvoiceData.cufe,
                      qrData: electronicInvoiceData.qrData,
                      environment: electronicInvoiceData.environment,
                      validationDate: electronicInvoiceData.validationDate,
                      createdAt: new Date().toISOString(),
                      items: cart.items.map((item) => ({
                        productName: (item as any).name || item.product?.name || 'Producto',
                        quantity: item.quantity,
                        ...camposCantidadImpresa(item.product),
                        unitPrice: item.unit_price,
                        total: item.total,
                        taxAmount: item.tax_amount,
                        discountAmount: item.discount_amount,
                        variantData: (item as any).product?.variant_data || null,
                        modifiers: item.modifiers?.map(m => ({ name: m.name, extraPrice: m.extraPrice })) || null,
                      })),
                      total: cartTotal,
                      subtotal: calculatedTotals.subtotal,
                      taxTotal: calculatedTotals.totalTaxAmount,
                      taxIncluded: taxIncluded,
                      taxLines: taxBreakdown.length > 0 ? taxBreakdown : null,
                      payments: pagosParaImpresion(payments, paymentMethods),
                      businessName: organization?.name,
                      businessNit: organization?.nit || organization?.tax_id,
                      businessPhone: organization?.phone,
                      businessAddress: organization?.address,
                      businessEmail: organization?.email,
                      businessCity: (organization as any)?.city,
                      businessFiscalResponsibilities: (organization as any)?.fiscal_responsibilities || null,
                      businessLogoUrl: (organization as any)?.logo_url || undefined,
                      branchName: branch?.name,
                      branchAddress: branch?.address,
                      branchPhone: branch?.phone,
                      cashierName: currentUser?.name,
                      totalPaid,
                      changeAmount: change > 0 ? change : undefined,
                      timezone,
                    } as any;
                    PrintService.printElectronicInvoice(payload);
    });
  };

  // Al abrir, el foco va al monto (no a la «×»): se teclea el efectivo y
  // «Enter» completa si está cubierto.
  const enfocarMonto = (evento: Event) => {
    const campo = typeof document === 'undefined' ? null : document.querySelector<HTMLInputElement>('input[data-cobro-monto]');
    if (!campo) return;
    evento.preventDefault();
    campo.focus();
    campo.select();
  };
  // El primer pago se agrega en un efecto (al abrir aún no hay campo): el foco
  // inicial se pone cuando aparece, una vez por apertura.
  const focoInicialRef = useRef(false);
  useEffect(() => {
    if (!open) {
      focoInicialRef.current = false;
      return;
    }
    if (showReceipt || focoInicialRef.current || payments.length === 0) return;
    const campo = document.querySelector<HTMLInputElement>('input[data-cobro-monto]');
    if (!campo) return;
    focoInicialRef.current = true;
    campo.focus();
    campo.select();
  }, [open, showReceipt, payments.length]);

  // Monto del pago que se edita. Un pago QR no pasa del total (`max`).
  const editorDePago = (payment: PaymentEntry) => (
    <EditorPagoCobro
      id={`amount-${payment.id}`}
      etiqueta={tPos('pagos.monto', { n: payments.indexOf(payment) + 1 })}
      valor={payment.amount}
      max={isQrPaymentCode(payment.method) ? cartTotal : undefined}
      moneda={monedaCobro}
      deshabilitado={isProcessing}
      onValorChange={(value) => updatePayment(payment.id, 'amount', value)}
      onExacto={ponerExacto}
      billetes={muestraMontosRapidos(payment.method) ? montosPagoActivo.billetes : []}
      onBillete={(value) => updatePayment(payment.id, 'amount', value)}
    />
  );

  if (!open) return null;
  const conRecibo = showReceipt && !!completedSale;
  const impuestosCobro = taxBreakdown.length > 0
    ? taxBreakdown.map((b) => ({ nombre: b.name, tarifa: organizationTaxes.find((o) => o.name === b.name)?.rate ?? null, importe: b.amount }))
    : (totalesCobro.totalTaxAmount || cart.tax_total) > 0
      ? [{ nombre: tPos('resumen.impuestos'), importe: totalesCobro.totalTaxAmount || cart.tax_total }]
      : [];
  return (
    <>
    <CobroPanel
      abierto={open}
      onAbiertoChange={alCerrarPanel}
      titulo={conRecibo ? tPos('postVenta.panel') : contextoMesa?.titulo ?? tPos('titulo')}
      descripcion={conRecibo ? undefined : tPos('descripcion', { productos: cart.items.length, monto: formatearCobro(cart.total) })}
      ocupado={isProcessing}
      onFocoAlAbrir={enfocarMonto}
      resumen={conRecibo ? undefined : (
        <ResumenCobro
          moneda={monedaCobro}
          totalAPagar={cartTotal}
          lineas={cart.items.map((item) => ({ id: item.id, nombre: item.product?.name ?? '', cantidad: item.quantity, total: item.total }))}
          descuentos={cart.discount_total}
          subtotal={totalesCobro.subtotal || cart.subtotal}
          impuestosIncluidos={taxIncluded}
          impuestos={impuestosCobro}
          propina={tipAmount}
          flete={shippingFee}
          pagado={totalPaid}
          falta={remaining}
          cambio={change}
        />
      )}
      pie={conRecibo ? undefined : (
        <>
          <KbdButton
            variante="secundario"
            tamano="lg"
            icono={X}
            atajo={teclaAtajo('cancelarCobro')}
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
            className="w-full sm:w-auto"
          >
            {tPos('pie.cancelar')}
          </KbdButton>
          <BotonImporte
            etiqueta={tPos('pie.completar')}
            importe={formatearCobro(cartTotal)}
            atajo={teclaAtajo('completarVenta')}
            estado={isProcessing ? 'procesando' : canComplete ? 'listo' : 'falta'}
            motivo={tPos('pie.falta', { monto: formatearCobro(remaining) })}
            etiquetaProcesando={tPos('pie.procesando')}
            icono={CheckCircle}
            onClick={handleCheckout}
            className="sm:flex-1"
          />
        </>
      )}
    >
        {conRecibo && completedSale ? (
          /* Post-venta (paso 13): ResultadoOperacion del kit; imprimir y entregar la venta siguen aquí */
          <PostVenta
            moneda={monedaCobro}
            total={cartTotal}
            pagado={totalPaid}
            cambio={change}
            numeroVenta={`#${completedSale.id.slice(-8)}`}
            numeroLocal={completedSale.receipt_number_local ?? null}
            pendienteSincronizar={!!completedSale.pending_sync}
            estadoRecibo={estadoRecibo}
            detalleRecibo={detalleRecibo}
            conFactura={!!electronicInvoiceData}
            onNuevaVenta={handleCloseReceipt}
            onReimprimir={handlePrint}
            onFactura={handleImprimirFactura}
            onCerrar={handleCloseReceipt}
            activo={open && !showQrDialog && !showSerialSelector && !stockConfirm}
            membresias={completedSale.membresias}
            titular={cart.customer?.full_name ?? null}
            textos={contextoMesa?.postVenta}
          />
        ) : (
          <>
            {/* Arriba de la zona de pagos: advertencia, no bloquea el cobro. */}
            <AvisoSinImpuesto lineas={lineasSinImpuesto} accion="cobrar" />

            {/* Pagos: siempre abierto (POS-UX-V2 D4) */}
            <Tarjeta
              id="cobro-pagos"
              titulo={tPos('pagos.titulo')}
              icono={Wallet}
              accion={
                <KbdButton variante="secundario" tamano="sm" icono={Plus} onClick={agregarPago} disabled={isProcessing}>
                  {tPos('pagos.agregar')}
                </KbdButton>
              }
            >
              {/* Mismo espaciado de siempre entre los bloques de pagos (sin reindentar: hay pruebas que leen este tramo). */}
              <div className="flex flex-col gap-3">
              <SelectorMetodoPago
                metodos={metodosCobro}
                valor={pagoActivo?.method ?? null}
                onValorChange={elegirMetodo}
                maxBotones={MAX_BOTONES_METODO}
                atajos
                menuAbierto={menuOtroMetodo}
                onMenuAbiertoChange={setMenuOtroMetodo}
                deshabilitado={isProcessing || !pagoActivo}
                etiqueta={pagoActivo ? tPos('pagos.metodoDe', { n: payments.indexOf(pagoActivo) + 1 }) : undefined}
              />

              {pagoActivo && editorDePago(pagoActivo)}

              <ul aria-label={tPos('pagos.lista')} className="flex flex-col gap-2">
                {payments.map((payment, index) => {
                  const activo = payment.id === pagoActivo?.id;
                  return (
                    <li
                      key={payment.id}
                      className={cn(
                        'flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2',
                        activo ? 'border-line-brand bg-brand-tint' : 'border-line bg-subtle',
                      )}
                    >
                      <button
                        type="button"
                        aria-pressed={activo}
                        aria-label={tPos('pagos.editar', { n: index + 1, metodo: nombreMetodo(payment.method), monto: formatearCobro(payment.amount) })}
                        onClick={() => setPagoActivoId(payment.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        <span className={clasesBadgeTono('neutro', 'suave', 'sm')}>{tPos('pagos.pago', { n: index + 1 })}</span>
                        <span className="min-w-0 truncate text-sm font-medium text-fg">{nombreMetodo(payment.method)}</span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-fg">{formatearCobro(payment.amount)}</span>
                      </button>

                      {/* Boton para pago QR si el metodo es QR */}
                      {(() => {
                        const currentMethod = paymentMethods.find(m => m.id === payment.method);
                        const qrCodes = ['redeban_qr', 'breb_qr', 'bancolombia_qr_wompi', 'bancolombia_qr'];
                        if (currentMethod && qrCodes.includes(currentMethod.code)) {
                          // Ronda 6 (HALLAZGO R): con las OTRAS entradas cubriendo el total no hay nada que cobrar por QR.
                          const othersCoverTotal = payments.filter((p) => p.id !== payment.id).reduce((sum, p) => sum + (Number(p.amount) || 0), 0) >= cartTotal;
                          return (
                            <button
                              type="button"
                              className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
                              disabled={othersCoverTotal || isCreatingQr}
                              aria-busy={isCreatingQr}
                              onClick={() => handleQrPayment(currentMethod.code, payment.id, payment.amount)}
                            >
                              {isCreatingQr ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <QrCode aria-hidden="true" className="size-4" strokeWidth={1.5} />}
                              {isCreatingQr ? tPos('pagos.generandoQr') : tPos('pagos.generarQr')}
                            </button>
                          );
                        }
                        return null;
                      })()}

                      {puedeQuitarPagos(payments) && (
                        <button
                          type="button"
                          disabled={isProcessing}
                          aria-label={tPos('pagos.eliminarAria', { n: index + 1 })}
                          onClick={() => removePayment(payment.id)}
                          className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'hover:text-danger-text' })}
                        >
                          <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                          <span className="hidden sm:inline">{tPos('pagos.eliminar')}</span>
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* C4 «Impuestos incluidos en precios» (Figma `247:70185`).
                  La casilla arranca como las líneas y, si el cajero la mueve, manda ella. */}
              <div className="flex w-fit items-center gap-2 px-1 py-1 text-sm text-fg-secondary">
                <Checkbox
                  id="cobro-impuestos-incluidos"
                  checked={taxIncluded}
                  onCheckedChange={(v) => {
                    setCasillaMovida(true);
                    setTaxIncluded(v === true);
                  }}
                />
                <label htmlFor="cobro-impuestos-incluidos" className="flex cursor-pointer items-center gap-2 hover:text-fg">
                  <Percent aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
                  {tPos('pagos.impuestosIncluidos')}
                </label>
              </div>
              </div>
            </Tarjeta>

            {/* Secciones plegables (paso 12): cerradas, con resumen y atajo */}
            <SeccionPlegable
              id="cobro-entrega"
              titulo={tPos('entrega.titulo')}
              icono={Truck}
              atajo={teclaAtajo('entrega')}
              resumen={resumenEntrega}
              abierta={seccionesAbiertas.entrega}
              onAbiertaChange={(v) => abrirSeccion('entrega', v)}
            >
              <EntregaCobro
                tipo={deliveryType}
                onTipo={setDeliveryType}
                conductores={drivers}
                conductorId={selectedDriverId}
                onConductor={setSelectedDriverId}
                direccionDelCliente={!!cart.customer?.address}
                direccion={deliveryAddress}
                onDireccion={(texto) => {
                  setDeliveryAddress(texto);
                  setAddressSearch(texto);
                  searchCustomerAddresses(texto);
                }}
                resultados={addressResults}
                mostrarResultados={showAddressDropdown}
                onFocoDireccion={() => { if (addressResults.length > 0) setShowAddressDropdown(true); }}
                onSalirDireccion={() => setTimeout(() => setShowAddressDropdown(false), 200)}
                onElegirDireccion={selectCustomerAddress}
                ciudad={deliveryCity}
                onCiudad={setDeliveryCity}
                telefono={deliveryContactPhone}
                onTelefono={setDeliveryContactPhone}
                contacto={deliveryContactName}
                onContacto={setDeliveryContactName}
                instrucciones={deliveryInstructions}
                onInstrucciones={setDeliveryInstructions}
                tarifas={shippingRates}
                tarifaId={selectedRateId}
                onTarifa={setSelectedRateId}
                pagoEnvio={shipmentPaymentStatus}
                onPagoEnvio={setShipmentPaymentStatus}
                formatear={formatearCobro}
              />
            </SeccionPlegable>

            <SeccionPlegable
              id="cobro-propina"
              titulo={tPos('propina.titulo')}
              icono={Banknote}
              atajo={teclaAtajo('propina')}
              resumen={resumenPropina}
              abierta={seccionesAbiertas.propina}
              onAbiertaChange={(v) => abrirSeccion('propina', v)}
            >
              <div className="flex flex-col gap-3">
                    {/* Propina elegida en la pantalla del cliente (F2-B): aviso no bloqueante; nada se aplica solo */}
                    <TipFromDisplayNotice
                      open={open && !showReceipt}
                      currency={currency?.code || 'COP'}
                      cashierMovedOn={tipAmount > 0 || touchedIds.size > 0}
                      onApply={(selection) => {
                        setTipPercentage(selection.percent);
                        setTipAmount(selection.amount);
                        // F2-B ronda 2: el total sube con la propina; la ÚNICA entrada de
                        // pago pre-rellenada (no tocada por el cajero) sigue al total nuevo
                        // (misma regla que la pre-carga) para no dejar «Falta dinero» en
                        // tarjeta/QR, donde nadie teclea. Una entrada TOCADA nunca se
                        // modifica; la ajustada sigue sin marcarse como tocada.
                        // Ronda 3 (QA-1, dinero): una entrada QR YA COBRADA por el proveedor
                        // (onPaid la marca en `touchedIds`) no se reescribe: la propina
                        // queda como «Falta dinero» y se cobra aparte, que es la verdad.
                        followTipOnPrefilledPayment(selection.amount);
                      }}
                    />

                    {/* Botones de porcentaje */}
                    <div role="group" aria-label={tPos('propina.porcentajes')} className="grid grid-cols-2 gap-2">
                      {PORCENTAJES_PROPINA.map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          aria-pressed={tipPercentage === pct}
                          onClick={() => handleTipPercentage(pct)}
                          className={clasesBoton({
                            variante: tipPercentage === pct ? 'tinte' : 'secundario',
                            tamano: 'lg',
                            anchoCompleto: true,
                            className: cn('flex-col gap-0 text-sm font-semibold', tipPercentage === pct && 'ring-1 ring-brand'),
                          })}
                        >
                          {tPos('propina.pct', { pct })}
                          <span className="text-xs font-normal tabular-nums text-fg-secondary">{formatearCobro(computeTipAmount(baseTip, pct))}</span>
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {/* Figma `247:71734`. El campo sigue siendo `Input`: «otro valor» se topa al
                          escribir y `CampoNumero` no refleja un valor corregido desde fuera mientras
                          tiene el foco. */}
                      <FormField etiqueta={tPos('propina.otroValor')} ayuda={tPos('propina.tope', { monto: formatearCobro(topePropina(baseTip)) })}>
                        <Input
                          id="cobro-propina-otro"
                          type="number"
                          inputMode="numeric"
                          min="0"
                          max={topePropina(baseTip)}
                          step="100"
                          value={tipAmount || ''}
                          onChange={(e) => handleTipAmountChange(Number(e.target.value) || 0)}
                          placeholder="0"
                        />
                      </FormField>
                      <FormField etiqueta={tPos('propina.mesero')} id="cobro-propina-mesero">
                        {(campo) => (
                          <Select value={serverId} onValueChange={setServerId}>
                            <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']}>
                              <SelectValue placeholder={tPos('propina.meseroPlaceholder')} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">{tPos('sinAsignar')}</SelectItem>
                              {servers.map((server) => (
                                <SelectItem key={server.id} value={server.id}>
                                  {server.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </FormField>
                    </div>

                    {/* Figma `247:71750`: fila «Propina» al pie de la sección, con la base debajo. */}
                    <ListaDatos etiqueta={tPos('propina.titulo')}>
                      <FilaDato
                        etiqueta={tPos('resumen.propina')}
                        valor={formatearCobro(tipAmount)}
                        tono="fuerte"
                        descripcion={tPos('propina.base', { monto: formatearCobro(baseTip) })}
                      />
                    </ListaDatos>
              </div>
            </SeccionPlegable>

            <SeccionPlegable
              id="cobro-comision"
              titulo={tPos('comision.titulo')}
              icono={User}
              resumen={resumenComision}
              abierta={seccionesAbiertas.comision}
              onAbiertaChange={(v) => abrirSeccion('comision', v)}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField etiqueta={tPos('comision.vendedor')} id="cobro-comision-vendedor">
                  {(campo) => (
                    <Select value={salespersonId} onValueChange={handleSalespersonChange}>
                      <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']}>
                        <SelectValue placeholder={tPos('comision.placeholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">{tPos('sinAsignar')}</SelectItem>
                        {servers.map((server) => (
                          <SelectItem key={server.id} value={server.id}>
                            {server.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
                <div className="flex flex-col gap-1">
                  <span id="cobro-comision-tipo" className="text-sm font-medium text-fg">
                    {tPos('comision.valor')}
                  </span>
                  <div className="flex gap-2">
                    <SegmentedControl
                      etiqueta={tPos('comision.tipo')}
                      valor={commissionMethod}
                      tamano="sm"
                      onValorChange={setCommissionMethod}
                      opciones={[
                        { valor: 'percentage' as const, etiqueta: tPos('comision.porcentaje') },
                        { valor: 'fixed_amount' as const, etiqueta: tPos('comision.monto') },
                      ]}
                    />
                    <CampoNumero
                      valor={commissionRate || null}
                      onValorChange={(n) => setCommissionRate(n ?? 0)}
                      minimo={0}
                      maximo={commissionMethod === 'percentage' ? 100 : undefined}
                      sufijo={commissionMethod === 'percentage' ? '%' : undefined}
                      placeholder="0"
                      aria-labelledby="cobro-comision-tipo"
                      className="min-w-0 flex-1"
                    />
                  </div>
                </div>
              </div>
            </SeccionPlegable>

            <SeccionPlegable
              id="cobro-factura"
              titulo={tPos('factura.titulo')}
              icono={FileCheck2}
              atajo={teclaAtajo('facturaElectronica')}
              resumen={facturaDisponible ? resumenFactura : undefined}
              deshabilitada={!facturaDisponible}
              motivo={motivoFactura}
              abierta={seccionesAbiertas.factura}
              onAbiertaChange={(v) => abrirSeccion('factura', v)}
            >
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="cobro-factura-enviar" className="text-sm text-fg">
                  {tPos('factura.enviar')}
                </label>
                <Switch
                  id="cobro-factura-enviar"
                  checked={sendToFactus}
                  onCheckedChange={setSendToFactus}
                  disabled={eInvoiceAlwaysEnabled}
                />
              </div>
              {eInvoiceAlwaysEnabled && <p className="mt-2 text-xs text-fg-muted">{tPos('factura.global')}</p>}
            </SeccionPlegable>
          </>
        )}
    </CobroPanel>
      <QrPaymentDialog
        open={showQrDialog}
        onClose={() => setShowQrDialog(false)}
        qrData={qrData}
        qrImageUrl={qrImageUrl}
        reference={qrReference}
        organizationId={cart.organization_id}
        amount={qrAmount ?? (remaining > 0 ? remaining : cartTotal)}
        currency={currency?.code || 'COP'}
        providerLabel={qrProviderLabel}
        expiresAt={qrExpiresAt}
        onTerminal={() => setQrDead(true)}
        extraControl={
          displayPresence.emitting ? (
            <div className="flex items-center gap-2 text-sm text-fg">
              <Checkbox id="cobro-qr-en-pantalla" checked={showQrOnDisplay} onCheckedChange={(v) => setShowQrOnDisplay(v === true)} />
              <label htmlFor="cobro-qr-en-pantalla" className="cursor-pointer">
                {tPos('qr.mostrarEnPantalla')}
              </label>
              {!displayPresence.connected && <span className="text-xs text-fg-muted">{tPos('qr.sinPantalla')}</span>}
            </div>
          ) : null
        }
        onPaid={() => {
          setShowQrDialog(false);
          toast.success(tPos('qr.confirmado'));
          // Pantalla del cliente (F2-C, C1): con el pago confirmado la fase
          // de propina queda decidida (equivale a «Omitir» si seguía
          // pendiente); al reproyectar el medio sin código la pantalla pasa a
          // Cobro/Gracias y nunca vuelve a preguntar la propina al cliente
          // que ya pagó. Sin fase pendiente no hace nada.
          getPosDisplayEmitter().skipTip();
          // Confirmar la entrada QR desde la que se generó el código
          // (`qrEntryId`) con el metodo correcto (redeban_qr, breb_qr, etc) y
          // el importe que cobró ESE código (C2). Antes se AÑADÍA una entrada
          // nueva sin retirar la original y el pago quedaba duplicado
          // (25.000 → 50.000 pagados; ronda 5, QA-2). El append queda solo
          // como respaldo si la entrada ya no existe (el cajero la quitó).
          const qrPaymentAmount = qrAmount ?? (remaining > 0 ? remaining : cartTotal);
          const newPayment: PaymentEntry = {
            id: crypto.randomUUID(),
            method: qrPaymentMethod || 'redeban_qr',
            amount: qrPaymentAmount,
          };
          // Una sola decisión (confirmQrPaymentEntry, ronda 7 · QA-2): la lista
          // nueva y el id confirmado salen del MISMO `prev`; el id queda en el
          // ref para el updater de `touchedIds`. Idempotente si StrictMode
          // ejecuta el updater dos veces.
          confirmedQrEntryIdRef.current = null;
          setPayments(prev => {
            const confirmed = confirmQrPaymentEntry({ payments: prev, qrEntryId, method: qrPaymentMethod, amount: qrPaymentAmount, fallback: newPayment });
            confirmedQrEntryIdRef.current = confirmed.confirmedId;
            return confirmed.payments;
          });
          // La entrada confirmada por el proveedor queda INTOCABLE (ronda 6,
          // HALLAZGO P): sin esto seguía siendo «la única entrada pre-rellenada»
          // y un «Aplicar» posterior del aviso de propina (applyTipToPrefilledPayment)
          // la reescribía a total + propina: la venta registraba un pago QR
          // por más de lo que cobró el proveedor. Marcada como tocada, la
          // propina queda en «Falta dinero» y el cajero la cobra por otro
          // medio. resolveCashReceived solo mira efectivo: «recibido/cambio»
          // no cambia. Se marca la entrada de origen si existe; si el cajero
          // la quitó, la añadida como respaldo: lo decidió el updater de
          // `payments` (ref), nunca el `payments` de la clausura.
          setTouchedIds(prev => {
            const confirmedQrEntryId = confirmedQrEntryIdRef.current ?? newPayment.id;
            return prev.has(confirmedQrEntryId) ? prev : new Set(prev).add(confirmedQrEntryId);
          });
        }}
      />
      {hasSerialItems && (
        <SerialSelectorDialog
          open={showSerialSelector}
          onOpenChange={setShowSerialSelector}
          items={cart.items}
          organizationId={cart.organization_id}
          branchId={cart.branch_id}
          onConfirm={(selections) => {
            setSerialSelections(selections);
            setShowSerialSelector(false);
          }}
        />
      )}
      {/* Figma `183:2712`: stock insuficiente de ingredientes. Cerrar sin elegir (Esc, «×», clic fuera) cancela. */}
      <Dialogo
        abierto={!!stockConfirm}
        onAbiertoChange={(abierto) => {
          if (!abierto && stockConfirm) {
            stockConfirm.resolve(false);
            setStockConfirm(null);
          }
        }}
        titulo={tPos('stock.titulo')}
        icono={TriangleAlert}
        ancho={440}
        textoCancelar={tPos('stock.cancelar')}
        primario={{
          etiqueta: tPos('stock.continuar'),
          onClick: () => {
            stockConfirm?.resolve(true);
            setStockConfirm(null);
          },
        }}
      >
        <p className="whitespace-pre-line text-sm text-fg">
          {stockConfirm?.message}
          {'\n\n'}
          {tPos('stock.pregunta')}
        </p>
      </Dialogo>
    </>
  );
}
