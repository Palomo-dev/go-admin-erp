'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  User,
  Calendar,
  DoorOpen,
  DollarSign,
  FileText,
  Loader2,
  Receipt,
  FileCheck,
  AlertTriangle,
  Info,
  XCircle,
  CreditCard,
  RefreshCw,
  CheckCircle2,
  Plus,
  Trash2,
  ArrowLeft,
  AlertCircle,
  QrCode,
} from 'lucide-react';
import { toast } from 'sonner';
import QrPaymentDialog from '@/components/shared/QrPaymentDialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CheckoutReservation } from '@/lib/services/checkoutService';
import checkoutService from '@/lib/services/checkoutService';
import { formatCurrency, cn } from '@/utils/Utils';
import { ElectronicInvoiceToggle } from '@/components/finanzas/facturacion-electronica';
import foliosService, { type FolioItem } from '@/lib/services/foliosService';
import { TaxSummary } from '@/components/pos/TaxSummary';
import { obtenerOrganizacionActiva, getOrganizationId, getCurrentBranchId, getCurrentUserId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { POSService } from '@/lib/services/posService';
import type { Cart, CartItem } from '@/components/pos/types';

interface PaymentEntry {
  id: string;
  method: string;
  amount: number;
}

interface PaymentMethod {
  id: string;
  name: string;
  code: string;
  type: string;
  is_active: boolean;
}

interface CheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: CheckoutReservation | null;
  onConfirm: (data: CheckoutDialogData) => Promise<void>;
}

export interface CheckoutDialogData {
  reservationId: string;
  notes: string;
  generateInvoice: boolean;
  generateReceipt: boolean;
  sendToFactus: boolean;
  updateCheckoutDate: boolean;
  payments?: { method: string; amount: number }[];
  taxIncluded?: boolean;
  appliedTaxIds?: string[];
  totalPaid?: number;
  change?: number;
}

export function CheckoutDialog({
  open,
  onOpenChange,
  reservation,
  onConfirm,
}: CheckoutDialogProps) {
  const [notes, setNotes] = useState('');
  const [generateInvoice, setGenerateInvoice] = useState(false);
  const [generateReceipt, setGenerateReceipt] = useState(false);
  const [sendToFactus, setSendToFactus] = useState(false);
  const [updateCheckoutDate, setUpdateCheckoutDate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<'review' | 'payment' | 'success'>('review');
  const [folioBalance, setFolioBalance] = useState(reservation?.folio?.balance || 0);
  const [isRefreshingFolio, setIsRefreshingFolio] = useState(false);
  const [taxIncluded, setTaxIncluded] = useState(false);
  const [appliedTaxIds, setAppliedTaxIds] = useState<string[]>([]);
  const [taxTotals, setTaxTotals] = useState<{ subtotal: number; totalTaxAmount: number; finalTotal: number }>({ subtotal: 0, totalTaxAmount: 0, finalTotal: 0 });
  const [extraNightsCharge, setExtraNightsCharge] = useState(0);
  const [paymentData, setPaymentData] = useState<{
    payments: { method: string; amount: number }[];
    totalPaid: number;
    change: number;
  } | null>(null);

  // Estados de pago integrados
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cashSessionOpen, setCashSessionOpen] = useState<boolean | null>(null);
  const [pendingItems, setPendingItems] = useState<FolioItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estados para pago QR
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [qrData, setQrData] = useState<string | undefined>();
  const [qrImageUrl, setQrImageUrl] = useState<string | undefined>();
  const [qrReference, setQrReference] = useState<string>('');
  const [qrProviderLabel, setQrProviderLabel] = useState<string>('');
  const [qrExpiresAt, setQrExpiresAt] = useState<string | undefined>();
  const [qrPaymentMethod, setQrPaymentMethod] = useState<string>('');

  // Construir un Cart sintético desde la reserva para usar con TaxSummary
  const syntheticCart: Cart | null = React.useMemo(() => {
    if (!reservation) return null;
    try {
      const org = obtenerOrganizacionActiva();
      const branchId = getCurrentBranchId() || 0;
      const now = new Date().toISOString();
      const items: CartItem[] = [];

      // Item de hospedaje (incluye noches extra si se aplicaron)
      const lodgingTotal = reservation.total_estimated + extraNightsCharge;
      if (lodgingTotal > 0) {
        items.push({
          id: 'housing',
          cart_id: 'checkout',
          product_id: 0,
          product: {
            id: 0,
            organization_id: org.id,
            sku: 'HOUSING',
            name: `Hospedaje (${reservation.nights} noches)`,
            unit_code: 'night',
            status: 'active',
            created_at: now,
            updated_at: now,
            price: lodgingTotal,
          },
          quantity: 1,
          unit_price: lodgingTotal,
          total: lodgingTotal,
          created_at: now,
          updated_at: now,
        });
      }

      // Items del folio
      if (reservation.folio?.items) {
        reservation.folio.items.forEach((fi, idx) => {
          items.push({
            id: `folio-${idx}`,
            cart_id: 'checkout',
            product_id: 0,
            product: {
              id: 0,
              organization_id: org.id,
              sku: 'FOLIO',
              name: fi.description,
              unit_code: 'unit',
              status: 'active',
              created_at: now,
              updated_at: now,
              price: fi.amount,
            },
            quantity: 1,
            unit_price: fi.amount,
            total: fi.amount,
            created_at: fi.created_at || now,
            updated_at: fi.created_at || now,
          });
        });
      }

      // Item negativo por pagos ya realizados (depósitos + pagos del folio)
      const folioPayments = reservation.folio?.total_payments || 0;
      const depositTotal = (reservation.deposit_payments || []).reduce((sum, p) => sum + p.amount, 0);
      const totalAlreadyPaid = folioPayments + depositTotal;
      if (totalAlreadyPaid > 0) {
        items.push({
          id: 'payments-applied',
          cart_id: 'checkout',
          product_id: 0,
          product: {
            id: 0,
            organization_id: org.id,
            sku: 'PAYMENTS',
            name: 'Pagos aplicados',
            unit_code: 'unit',
            status: 'active',
            created_at: now,
            updated_at: now,
            price: -totalAlreadyPaid,
          },
          quantity: 1,
          unit_price: -totalAlreadyPaid,
          total: -totalAlreadyPaid,
          created_at: now,
          updated_at: now,
        });
      }

      const subtotal = items.reduce((sum, item) => sum + item.total, 0);
      return {
        id: 'checkout-synthetic',
        organization_id: org.id,
        branch_id: branchId,
        status: 'active',
        items,
        subtotal,
        tax_amount: 0,
        tax_total: 0,
        discount_amount: 0,
        discount_total: 0,
        total: subtotal,
        created_at: now,
        updated_at: now,
        tax_included: taxIncluded,
        applied_tax_ids: appliedTaxIds,
      };
    } catch {
      return null;
    }
  }, [reservation, taxIncluded, appliedTaxIds, extraNightsCharge]);

  // Validación de fechas
  const [dateWarning, setDateWarning] = useState<{
    type: 'error' | 'warning' | 'info' | null;
    title: string;
    message: string;
  }>({ type: null, title: '', message: '' });

  // Validar fechas cuando se abre el dialog
  React.useEffect(() => {
    if (!reservation || !open) {
      setDateWarning({ type: null, title: '', message: '' });
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const checkoutDate = new Date(reservation.checkout);
    checkoutDate.setHours(0, 0, 0, 0);

    const diffDays = Math.floor((checkoutDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // Check-out antes de la fecha programada
    if (diffDays > 0) {
      setDateWarning({
        type: 'warning',
        title: 'Check-out Anticipado',
        message: `La fecha programada de check-out es el ${checkoutDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })} (en ${diffDays} ${diffDays === 1 ? 'día' : 'días'}). ¿Deseas realizar el check-out anticipado? Esto podría generar cargos adicionales o ajustes en la facturación.`,
      });
    }
    // Check-out después de la fecha programada (tardío)
    else if (diffDays < 0) {
      const extraNights = Math.abs(diffDays);
      const nightlyRate = reservation.nights > 0
        ? reservation.total_estimated / reservation.nights
        : 0;
      const extraCharge = nightlyRate * extraNights;
      setExtraNightsCharge(extraCharge);
      setDateWarning({
        type: 'warning',
        title: 'Check-out Tardío',
        message: `La fecha programada de check-out era el ${checkoutDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })} (hace ${extraNights} ${extraNights === 1 ? 'día' : 'días'}). Estás realizando un check-out tardío. Se cobrarán ${extraNights} ${extraNights === 1 ? 'noche extra' : 'noches extra'} por un total aproximado de ${formatCurrency(extraCharge)}.`,
      });
      // Auto-marcar actualización de fecha para check-out tardío
      setUpdateCheckoutDate(true);
    }
    // Check-out en la fecha correcta
    else {
      setExtraNightsCharge(0);
      setDateWarning({
        type: 'info',
        title: 'Check-out en Fecha',
        message: 'El check-out se está realizando en la fecha programada.',
      });
    }

    // Verificar si hay saldo pendiente (sin sobrescribir el alert de check-out tardío)
    if (reservation.folio && reservation.folio.balance > 0) {
      setFolioBalance(reservation.folio.balance);
    } else {
      setFolioBalance(0);
    }
  }, [reservation, open]);

  // Recalcular extraNightsCharge cuando se toggle el checkbox
  React.useEffect(() => {
    if (!reservation || !open) return;
    if (!updateCheckoutDate) {
      setExtraNightsCharge(0);
      return;
    }
    // Recalcular si se vuelve a marcar
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkoutDate = new Date(reservation.checkout);
    checkoutDate.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((checkoutDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      const extraNights = Math.abs(diffDays);
      const nightlyRate = reservation.nights > 0
        ? reservation.total_estimated / reservation.nights
        : 0;
      setExtraNightsCharge(nightlyRate * extraNights);
    }
  }, [updateCheckoutDate, reservation, open]);

  // Reset cuando se cierra
  React.useEffect(() => {
    if (!open) {
      setNotes('');
      setGenerateInvoice(false);
      setGenerateReceipt(false);
      setSendToFactus(false);
      setUpdateCheckoutDate(false);
      setIsSubmitting(false);
      setTaxIncluded(false);
      setAppliedTaxIds([]);
      setTaxTotals({ subtotal: 0, totalTaxAmount: 0, finalTotal: 0 });
      setExtraNightsCharge(0);
      setPaymentData(null);
      setStep('review');
      setPayments([]);
      setErrorMsg(null);
      setPendingItems([]);
    }
  }, [open]);

  const handleConfirm = async (mode: 'paid' | 'debt' | 'normal') => {
    if (!reservation) return;

    try {
      setIsSubmitting(true);
      await onConfirm({
        reservationId: reservation.id,
        notes,
        generateInvoice,
        generateReceipt,
        sendToFactus: generateInvoice && sendToFactus,
        updateCheckoutDate,
        payments: mode === 'paid' && paymentData ? paymentData.payments : undefined,
        taxIncluded,
        appliedTaxIds,
        totalPaid: mode === 'paid' && paymentData ? paymentData.totalPaid : 0,
        change: mode === 'paid' && paymentData ? paymentData.change : 0,
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Error en checkout:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const handleOpenPayment = useCallback(async () => {
    if (!reservation) return;
    setErrorMsg(null);

    if (updateCheckoutDate) {
      try {
        const charge = await checkoutService.applyExtraNightsCharge(reservation.id);
        if (charge > 0) {
          setExtraNightsCharge(charge);
        }
        if (reservation.folio?.id) {
          const summary = await foliosService.getFolioSummary(reservation.folio.id);
          setFolioBalance(summary.balance);
        }
      } catch (error) {
        console.error('Error aplicando noches extra:', error);
      }
    }

    // Cargar items pendientes del folio
    if (reservation.folio?.id) {
      try {
        const folio = await foliosService.getFolioById(reservation.folio.id);
        const items = folio?.items || [];
        setPendingItems(items.filter(item => item.payment_status !== 'paid'));
      } catch (error) {
        console.error('Error cargando items del folio:', error);
      }
    }

    // Cargar métodos de pago
    try {
      const methods = await POSService.getPaymentMethods();
      setPaymentMethods(methods);
    } catch {
      setPaymentMethods([
        { id: 'cash', name: 'Efectivo', code: 'cash', type: 'cash', is_active: true },
        { id: 'card', name: 'Tarjeta', code: 'card', type: 'card', is_active: true },
      ]);
    }

    // Validar caja abierta
    try {
      const org = obtenerOrganizacionActiva();
      const branchId = getCurrentBranchId();
      const { data: session } = await supabase
        .from('cash_sessions')
        .select('id')
        .eq('organization_id', org.id)
        .eq('branch_id', branchId)
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setCashSessionOpen(!!session);
    } catch {
      setCashSessionOpen(null);
    }

    // Inicializar pago vacío (el usuario usa botones rápidos o escribe el monto)
    setPayments([{ id: crypto.randomUUID(), method: 'cash', amount: 0 }]);
    setStep('payment');
  }, [reservation, updateCheckoutDate]);

  const refreshFolioBalance = useCallback(async () => {
    if (!reservation?.folio?.id) return;
    setIsRefreshingFolio(true);
    try {
      const summary = await foliosService.getFolioSummary(reservation.folio.id);
      setFolioBalance(summary.balance);
    } catch (error) {
      console.error('Error refrescando folio:', error);
    } finally {
      setIsRefreshingFolio(false);
    }
  }, [reservation?.folio?.id]);

  // Totales pre-calculados (necesarios antes del early return para los calculados de pago)
  const lodgingTotal = (reservation?.total_estimated || 0) + extraNightsCharge;
  const totalToCharge = lodgingTotal + (reservation?.folio?.total_charges || 0);
  const folioPaymentsTotal = reservation?.folio?.total_payments || 0;
  const depositTotal = (reservation?.deposit_payments || []).reduce((sum, p) => sum + p.amount, 0);
  const totalPayments = folioPaymentsTotal + depositTotal;
  const grandTotal = Math.max(0, totalToCharge - totalPayments);
  const paymentTotal = taxTotals.finalTotal > 0 ? taxTotals.finalTotal : grandTotal;

  // Calculados de pago
  const folioItemsTotal = pendingItems.reduce((sum, item) => sum + Number(item.amount), 0);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(0, paymentTotal - totalPaid);
  const change = Math.max(0, totalPaid - paymentTotal);
  const canPay = cashSessionOpen !== false && totalPaid >= paymentTotal && paymentTotal > 0;

  // Generar botones de monto rápido dinámicos según el total a pagar
  const generateQuickAmounts = (amount: number): { label: string; value: number }[] => {
    if (amount <= 0) return [{ label: 'Exacto', value: 0 }];

    const buttons: { label: string; value: number }[] = [];
    const seen = new Set<number>();

    const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(amount, 1))));
    const roundUp = (val: number, step: number) => Math.ceil(val / step) * step;

    // 1. Monto exacto
    buttons.push({ label: 'Exacto', value: Math.round(amount) });
    seen.add(Math.round(amount));

    // 2. Redondeo al millar superior más cercano
    const roundSteps = magnitude >= 100000 ? [100000, 50000]
                     : magnitude >= 10000 ? [10000, 5000]
                     : magnitude >= 1000 ? [1000, 500]
                     : [100, 50];

    for (const step of roundSteps) {
      const rounded = roundUp(amount, step);
      if (!seen.has(rounded) && rounded > amount) {
        buttons.push({ label: formatQuickLabel(rounded), value: rounded });
        seen.add(rounded);
      }
    }

    // 3. Agregar múltiplos útiles por encima del monto
    const baseStep = roundSteps[0];
    for (let mult = 2; mult <= 4; mult++) {
      const val = roundUp(amount, baseStep) + baseStep * (mult - 1);
      if (!seen.has(val) && buttons.length < 6) {
        buttons.push({ label: formatQuickLabel(val), value: val });
        seen.add(val);
      }
    }

    return buttons.sort((a, b) => {
      if (a.label === 'Exacto') return -1;
      if (b.label === 'Exacto') return 1;
      return a.value - b.value;
    }).slice(0, 6);
  };

  const formatQuickLabel = (value: number): string => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(value % 1000000 === 0 ? 0 : 1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
    return value.toString();
  };

  const quickAmountButtons = generateQuickAmounts(paymentTotal);

  const addPayment = () => {
    setPayments([...payments, { id: crypto.randomUUID(), method: 'cash', amount: remaining }]);
  };

  const updatePayment = (id: string, field: 'method' | 'amount', value: string | number) => {
    setPayments(payments.map(p =>
      p.id === id
        ? { ...p, [field]: field === 'amount' ? Number(value) || 0 : value }
        : p
    ));
  };

  const removePayment = (id: string) => {
    if (payments.length > 1) {
      setPayments(payments.filter(p => p.id !== id));
    }
  };

  // Generar QR de pago según el método seleccionado (adaptado de POS para PMS)
  const handleQrPayment = async (methodCode: string) => {
    if (!reservation) return;
    try {
      const org = obtenerOrganizacionActiva();
      const branchId = getCurrentBranchId() || 0;
      const folioId = reservation.folio?.id || reservation.id;
      const reference = `PMS-${Date.now()}-${org.id}`;
      const amount = remaining > 0 ? remaining : paymentTotal;

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
        extraBody = { keyValue: `@org${org.id}` };
      } else if (methodCode === 'bancolombia_qr_wompi') {
        endpoint = '/api/integrations/bancolombia/wompi/create-qr';
        providerLabel = 'Bancolombia QR (Wompi)';
      } else if (methodCode === 'bancolombia_qr') {
        endpoint = '/api/integrations/bancolombia/create-qr';
        providerLabel = 'Bancolombia QR';
      } else {
        toast.error('Metodo QR no soportado');
        return;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: '', // Se resuelve en el backend por organization
          amount,
          currency: 'COP',
          reference,
          description: `PMS - Folio ${folioId}`,
          source: 'folio',
          sourceId: folioId.toString(),
          branchId,
          organizationId: org.id,
          ...extraBody,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        toast.error('Error al generar QR', { description: errData.error || 'Error desconocido' });
        return;
      }

      const data = await response.json();
      const session = data.qrSession;
      const qr = data.qr;

      setQrReference(reference);
      setQrProviderLabel(providerLabel);
      setQrPaymentMethod(methodCode);
      setQrData(qr.qr_image || qr.qr_string || qr.redirectURL || undefined);
      setQrImageUrl(qr.qr_image || undefined);
      setQrExpiresAt(session?.expires_at || undefined);
      setShowQrDialog(true);
    } catch (err) {
      console.error('Error en handleQrPayment:', err);
      toast.error('Error al generar QR de pago');
    }
  };

  const handlePayment = async () => {
    if (!reservation || paymentTotal <= 0) return;
    if (cashSessionOpen === false) return;
    if (totalPaid < paymentTotal) return;

    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const validPayments = payments.filter(p => p.amount > 0);
      const userId = await getCurrentUserId();
      const paymentMethod = validPayments[0]?.method || 'cash';

      // Calcular montos por concepto
      const folioItemsAmount = pendingItems.reduce((sum, item) => sum + Number(item.amount), 0);

      // 1. Pagar items del folio (consumos dentro de la habitación)
      //    Esto marca los items como paid e inserta un payment con source='folio'
      //    El hospedaje se paga después en createSaleFromFolio con source='sale'
      //    para que la factura pueda ver los pagos y actualizar su balance
      if (folioItemsAmount > 0 && reservation.folio?.id) {
        await foliosService.payFolioItems(
          reservation.folio.id,
          folioItemsAmount,
          paymentMethod,
          null,
          userId || undefined
        );
      }

      setPaymentData({
        payments: validPayments.map(p => ({ method: p.method, amount: p.amount })),
        totalPaid,
        change,
      });
      setStep('success');
    } catch (error: any) {
      console.error('Error procesando pago:', error);
      const msg = error?.message?.includes('organization_id')
        ? 'Error de configuración: falta el ID de la organización. Contacte al administrador.'
        : 'Error al procesar el pago. Intente nuevamente.';
      setErrorMsg(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!reservation) return null;

  const hasPendingBalance = folioBalance > 0 || grandTotal > 0;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-xl">
            <DoorOpen className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            Check-out - {reservation.code}
          </DialogTitle>
          <DialogDescription>
            Confirme la salida del huésped y revise los detalles del folio
          </DialogDescription>
        </DialogHeader>

        {step === 'review' && (
        <div className="space-y-4">
          {/* Alerta de Validación de Fechas */}
          {dateWarning.type && (
            <Alert
              variant={dateWarning.type === 'error' ? 'destructive' : 'default'}
              className={
                dateWarning.type === 'error'
                  ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                  : dateWarning.type === 'warning'
                  ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
                  : 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              }
            >
              {dateWarning.type === 'error' ? (
                <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              ) : dateWarning.type === 'warning' ? (
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              ) : (
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              )}
              <AlertTitle className={
                dateWarning.type === 'error'
                  ? 'text-red-800 dark:text-red-200'
                  : dateWarning.type === 'warning'
                  ? 'text-yellow-800 dark:text-yellow-200'
                  : 'text-blue-800 dark:text-blue-200'
              }>
                {dateWarning.title}
              </AlertTitle>
              <AlertDescription className={
                dateWarning.type === 'error'
                  ? 'text-red-700 dark:text-red-300'
                  : dateWarning.type === 'warning'
                  ? 'text-yellow-700 dark:text-yellow-300'
                  : 'text-blue-700 dark:text-blue-300'
              }>
                {dateWarning.message}
                {dateWarning.type === 'warning' && (dateWarning.title === 'Check-out Anticipado' || dateWarning.title === 'Check-out Tardío') && (
                  <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={updateCheckoutDate}
                      onChange={(e) => setUpdateCheckoutDate(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium">
                      {dateWarning.title === 'Check-out Tardío'
                        ? `Actualizar fecha de check-out a hoy y cobrar noches extra`
                        : 'Actualizar fecha de check-out a hoy'}
                    </span>
                  </label>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Alerta de Saldo Pendiente Total */}
          {grandTotal > 0 && (
            <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-900/20">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertTitle className="text-amber-800 dark:text-amber-200">
                Saldo Pendiente
              </AlertTitle>
              <AlertDescription className="text-amber-700 dark:text-amber-300">
                El huésped tiene un saldo pendiente de{' '}
                <span className="font-bold">{formatCurrency(grandTotal)}</span>
                . Puede pagar ahora o dejar como deuda (cuenta por cobrar).
                {depositTotal > 0 && (
                  <span className="block text-xs mt-1">
                    Incluye abonos/depósitos aplicados: {formatCurrency(depositTotal)}
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Información del Huésped */}
          <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <User className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                Información del Huésped
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Nombre</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {reservation.customer_name}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Email</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {reservation.customer_email}
                </p>
              </div>
            </div>
          </div>

          {/* Detalles de la Reserva */}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex flex-wrap items-center gap-2">
              <Calendar className="h-5 w-5" />
              Detalles de la Reserva
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500 dark:text-gray-400">Check-in</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {formatDate(reservation.checkin)}
                </p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Check-out</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {formatDate(reservation.checkout)}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <DoorOpen className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Espacios Asignados:
                </p>
              </div>
              {reservation.spaces.map((space) => (
                <div
                  key={space.id}
                  className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg flex justify-between items-center"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {space.label}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {space.space_type_name} • {space.floor_zone}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Tarifa de habitación */}
            {reservation.nights > 0 && reservation.total_estimated > 0 && (
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                    Tarifa de Habitación
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Noches</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {reservation.nights}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Tarifa/noche</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {formatCurrency(reservation.total_estimated / reservation.nights)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Total hospedaje</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {formatCurrency(reservation.total_estimated)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Detalle del Folio */}
          {reservation.folio ? (
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex flex-wrap items-center gap-2">
                <FileText className="h-5 w-5" />
                Resumen del Folio
              </h3>

              {folioBalance > 0 && (
                <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex flex-wrap items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-amber-900 dark:text-amber-100">
                      Saldo Pendiente
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                      Esta reserva tiene un saldo pendiente de{' '}
                      <span className="font-bold">
                        {formatCurrency(folioBalance)}
                      </span>
                      . Puede pagar ahora o dejar como deuda al hacer checkout.
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        onClick={handleOpenPayment}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <CreditCard className="h-4 w-4 mr-1" />
                        Pagar Folio
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={refreshFolioBalance}
                        disabled={isRefreshingFolio}
                      >
                        <RefreshCw className={cn('h-4 w-4 mr-1', isRefreshingFolio && 'animate-spin')} />
                        Actualizar
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3 bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">Total de Cargos</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {formatCurrency(reservation.folio.total_charges)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">Total Pagado</span>
                  <span className="font-semibold text-green-600 dark:text-green-400">
                    {formatCurrency(reservation.folio.total_payments)}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    Saldo Pendiente
                  </span>
                  <span
                    className={`text-xl font-bold ${
                      reservation.folio.balance > 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-green-600 dark:text-green-400'
                    }`}
                  >
                    {formatCurrency(reservation.folio.balance)}
                  </span>
                </div>
              </div>

              {reservation.folio.items.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Cargos ({reservation.folio.items.length})
                  </p>
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {reservation.folio.items.map((item, index) => {
                      const isPaid = (item as any).payment_status === 'paid';
                      const isDirectPayment = (item as any).charge_type === 'direct_payment';
                      return (
                        <div
                          key={index}
                          className={cn(
                            'flex justify-between items-center text-sm p-2 rounded border',
                            isPaid
                              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                              : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              'h-2 w-2 rounded-full',
                              isPaid ? 'bg-green-500' : 'bg-amber-400'
                            )} />
                            <span className="text-gray-700 dark:text-gray-300">
                              {item.description}
                            </span>
                            {isDirectPayment && (
                              <Badge variant="outline" className="text-[0.6rem] py-0 px-1">
                                Pago directo
                              </Badge>
                            )}
                          </div>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {formatCurrency(item.amount)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg text-center">
              <FileText className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
              <p className="text-gray-500 dark:text-gray-400">
                No hay folio asociado a esta reserva
              </p>
            </div>
          )}

          <Separator />

          {/* Total a Cobrar */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <DollarSign className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h3 className="font-semibold text-blue-900 dark:text-blue-200">
                Total a Cobrar
              </h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Hospedaje ({reservation.nights} noches)</span>
                <span className="font-medium">{formatCurrency(reservation.total_estimated)}</span>
              </div>
              {extraNightsCharge > 0 && (
                <div className="flex justify-between">
                  <span className="text-orange-600 dark:text-orange-400">Noches extra</span>
                  <span className="font-medium text-orange-600 dark:text-orange-400">{formatCurrency(extraNightsCharge)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Cargos del folio</span>
                <span className="font-medium">{formatCurrency(reservation.folio?.total_charges || 0)}</span>
              </div>
              {depositTotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Abonos/depósitos</span>
                  <span className="font-medium text-green-600">- {formatCurrency(depositTotal)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Pagos del folio</span>
                <span className="font-medium text-green-600">- {formatCurrency(folioPaymentsTotal)}</span>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between items-center">
                <span className="font-semibold text-gray-900 dark:text-gray-100">Total Pendiente</span>
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {formatCurrency(grandTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* Resumen de impuestos - reemplaza al checkbox de IVA incluido */}
          {syntheticCart && syntheticCart.items.length > 0 && (
            <TaxSummary
              cart={syntheticCart}
              taxIncluded={taxIncluded}
              onTaxIncludedChange={setTaxIncluded}
              onAppliedTaxesChange={setAppliedTaxIds}
              onTotalsChange={setTaxTotals}
            />
          )}

          <Separator />

          {/* Opciones de Documentos */}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Documentos
            </h3>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="generateInvoice"
                  checked={generateInvoice}
                  onCheckedChange={(checked) => setGenerateInvoice(checked as boolean)}
                />
                <Label
                  htmlFor="generateInvoice"
                  className="text-sm font-normal cursor-pointer flex flex-wrap items-center gap-2"
                >
                  <FileCheck className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                  Generar Factura
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="generateReceipt"
                  checked={generateReceipt}
                  onCheckedChange={(checked) => setGenerateReceipt(checked as boolean)}
                />
                <Label
                  htmlFor="generateReceipt"
                  className="text-sm font-normal cursor-pointer flex flex-wrap items-center gap-2"
                >
                  <Receipt className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                  Generar Recibo de Pago
                </Label>
              </div>
              {generateInvoice && (
                <div className="ml-6 mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <ElectronicInvoiceToggle
                    checked={sendToFactus}
                    onCheckedChange={setSendToFactus}
                    showLabel={true}
                    showTooltip={true}
                    size="md"
                  />
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Notas */}
          <div>
            <Label htmlFor="notes">Notas de Salida (Opcional)</Label>
            <RichTextEditor
              placeholder="Agregue cualquier observación sobre la salida del huésped..."
              value={notes}
              onChange={(html) => setNotes(html)}
              minHeight={60}
              className="mt-2"
            />
          </div>
        </div>
        )}

        {/* Footer según step */}
        {step === 'review' && (
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            {hasPendingBalance && (
              <Button
                onClick={() => handleConfirm('debt')}
                disabled={isSubmitting || dateWarning.type === 'error'}
                className="bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600 sm:mr-auto"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <DoorOpen className="mr-2 h-4 w-4" />
                    Check-out con Deuda
                  </>
                )}
              </Button>
            )}
            {!hasPendingBalance && (
              <Button
                onClick={() => handleConfirm('normal')}
                disabled={isSubmitting || dateWarning.type === 'error'}
                className="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <DoorOpen className="mr-2 h-4 w-4" />
                    Confirmar Check-out
                  </>
                )}
              </Button>
            )}
            {hasPendingBalance && (
              <Button
                onClick={handleOpenPayment}
                disabled={isSubmitting || dateWarning.type === 'error'}
                className="bg-green-600 hover:bg-green-700 text-white dark:bg-green-500 dark:hover:bg-green-600"
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Pagar y Check-out
              </Button>
            )}
          </DialogFooter>
        )}

        {step === 'payment' && (
          <div className="space-y-4">
            {/* Error */}
            {errorMsg && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
            )}

            {/* Resumen de conceptos a pagar */}
            <div className="space-y-2">
              {/* Hospedaje */}
              {lodgingTotal > 0 && (
                <div className="flex items-center justify-between p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-blue-400" />
                    <div>
                      <p className="text-sm font-medium">Hospedaje ({reservation.nights} noches{extraNightsCharge > 0 ? ` + ${Math.round(extraNightsCharge / (reservation.total_estimated / reservation.nights))} extra` : ''})</p>
                      <p className="text-xs text-gray-500">room_charge</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold">
                    {formatCurrency(lodgingTotal)}
                  </span>
                </div>
              )}

              {/* Items pendientes del folio */}
              {pendingItems.length > 0 && (
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {pendingItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-amber-400" />
                        <div>
                          <p className="text-sm font-medium">{item.description}</p>
                          <p className="text-xs text-gray-500">{item.source}</p>
                        </div>
                      </div>
                      <span className="text-sm font-semibold">
                        {formatCurrency(Number(item.amount))}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Desglose de impuestos */}
              {taxTotals.totalTaxAmount > 0 && (
                <div className="space-y-1.5 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">
                      Subtotal{taxIncluded ? ' (inc. impuestos)' : ''}
                    </span>
                    <span className="font-medium">{formatCurrency(taxTotals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Impuestos</span>
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      {formatCurrency(taxTotals.totalTaxAmount)}
                    </span>
                  </div>
                </div>
              )}

              {/* Total */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                <span className="font-semibold">Total a Pagar:</span>
                <span className="text-xl font-bold text-amber-600">
                  {formatCurrency(paymentTotal)}
                </span>
              </div>
            </div>

            {/* Multi-pago */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Métodos de Pago</p>
                <Button size="sm" variant="outline" onClick={addPayment} disabled={remaining <= 0}>
                  <Plus className="h-3 w-3 mr-1" />
                  Agregar
                </Button>
              </div>

              {payments.map((payment, index) => (
                <div key={payment.id} className="space-y-2 p-3 rounded-lg border dark:border-gray-700 border-gray-200">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs dark:text-gray-400 text-gray-600">
                      Pago {index + 1}
                    </Label>
                    {payments.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removePayment(payment.id)}
                        className="h-7 px-2 text-xs dark:text-red-400 dark:hover:bg-red-500/20 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Eliminar
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs dark:text-gray-400 text-gray-600">Método</Label>
                      <Select
                        value={payment.method}
                        onValueChange={(v) => updatePayment(payment.id, 'method', v)}
                      >
                        <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700 bg-white border-gray-300">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="dark:bg-gray-900 dark:border-gray-800 bg-white border-gray-200">
                          {paymentMethods.map((m) => (
                            <SelectItem key={m.id} value={m.code}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs dark:text-gray-400 text-gray-600">Monto</Label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 dark:text-gray-400 text-gray-500" />
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={payment.amount || ''}
                          onChange={(e) => updatePayment(payment.id, 'amount', e.target.value)}
                          placeholder="0.00"
                          className="pl-10 dark:bg-gray-800 dark:border-gray-700 bg-white border-gray-300"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Botones de montos rápidos solo para efectivo */}
                  {payment.method === 'cash' && (
                    <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-1 sm:gap-2">
                      {quickAmountButtons.map((button) => (
                        <Button
                          key={button.label}
                          size="sm"
                          variant="outline"
                          onClick={() => updatePayment(payment.id, 'amount', button.value)}
                          className="h-8 sm:h-9 text-[0.7rem] sm:text-xs px-2 sm:px-3 dark:border-gray-700 dark:hover:bg-gray-800 dark:text-gray-300 border-gray-300 hover:bg-gray-100 text-gray-700"
                        >
                          {button.label}
                        </Button>
                      ))}
                    </div>
                  )}

                  {/* Boton para pago QR si el metodo seleccionado es QR */}
                  {(() => {
                    const currentMethod = paymentMethods.find(m => m.code === payment.method);
                    const qrCodes = ['redeban_qr', 'breb_qr', 'bancolombia_qr_wompi', 'bancolombia_qr'];
                    if (currentMethod && qrCodes.includes(currentMethod.code)) {
                      return (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full mt-2"
                          onClick={() => handleQrPayment(currentMethod.code)}
                        >
                          <QrCode className="h-4 w-4 mr-2" />
                          Generar QR de pago
                        </Button>
                      );
                    }
                    return null;
                  })()}
                </div>
              ))}
            </div>

            {/* Resumen de totales */}
            <div className="space-y-1.5 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Total Pagado:</span>
                <span className="font-semibold text-green-600">{formatCurrency(totalPaid)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Restante:</span>
                <span className={cn('font-semibold', remaining > 0 ? 'text-amber-600' : 'text-green-600')}>
                  {formatCurrency(remaining)}
                </span>
              </div>
              {change > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Cambio:</span>
                  <span className="font-semibold text-blue-600">{formatCurrency(change)}</span>
                </div>
              )}
            </div>

            {/* Warning caja cerrada */}
            {cashSessionOpen === false && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
                No hay una caja abierta. Abre una caja para procesar pagos.
              </div>
            )}

            <DialogFooter className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setStep('review')}
                disabled={isProcessing}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver
              </Button>
              <Button
                onClick={handlePayment}
                disabled={isProcessing || paymentTotal <= 0 || !canPay}
                className="bg-green-600 hover:bg-green-700"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Pagar {formatCurrency(totalPaid)}
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'success' && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="h-16 w-16">
              <svg viewBox="0 0 52 52" className="h-full w-full text-green-500" fill="none" stroke="currentColor">
                <circle cx="26" cy="26" r="24" strokeWidth="3" className="opacity-20" />
                <path
                  d="M14 27 L22 35 L38 17"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="60"
                  className="animate-draw-check"
                  style={{ strokeDashoffset: 60 }}
                />
              </svg>
            </div>
            <p className="text-lg font-semibold text-green-600">Pago completado</p>
            <p className="text-sm text-gray-500">El pago se ha registrado correctamente</p>
            {change > 0 && (
              <p className="text-sm font-medium text-blue-600">
                Cambio: {formatCurrency(change)}
              </p>
            )}
            <Button
              onClick={() => handleConfirm('paid')}
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700 text-white mt-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Procesando check-out...
                </>
              ) : (
                <>
                  <DoorOpen className="mr-2 h-4 w-4" />
                  Confirmar Check-out
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
    <QrPaymentDialog
      open={showQrDialog}
      onClose={() => setShowQrDialog(false)}
      qrData={qrData}
      qrImageUrl={qrImageUrl}
      reference={qrReference}
      organizationId={getOrganizationId()}
      amount={remaining > 0 ? remaining : paymentTotal}
      currency="COP"
      providerLabel={qrProviderLabel}
      expiresAt={qrExpiresAt}
      onPaid={() => {
        setShowQrDialog(false);
        toast.success('Pago QR confirmado');
        // Agregar pago QR con el metodo correcto
        const qrAmount = remaining > 0 ? remaining : paymentTotal;
        setPayments(prev => [...prev, {
          id: crypto.randomUUID(),
          method: qrPaymentMethod,
          amount: qrAmount,
        }]);
      }}
    />
    </>
  );
}
