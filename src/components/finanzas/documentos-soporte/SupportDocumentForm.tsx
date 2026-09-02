'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SearchSelect } from '@/components/ui/search-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  Save,
  Send,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/utils/Utils';
import { ProviderSelector, type ProviderData } from './ProviderSelector';
import { ItemsFactura } from '@/components/finanzas/facturas-venta/nueva-factura/ItemsFactura';
import { ImpuestosFactura } from '@/components/finanzas/facturas-venta/nueva-factura/ImpuestosFactura';
import { FormaPagoSelector } from '@/components/finanzas/facturas-venta/nueva-factura/FormaPagoSelector';
import type { InvoiceItem } from '@/components/finanzas/facturas-venta/nueva-factura/NuevaFacturaForm';

// Re-exportar InvoiceItem para compatibilidad
export type { InvoiceItem };

const PAYMENT_FORMS = [
  { value: '1', label: 'Contado' },
  { value: '2', label: 'Crédito' },
];

/**
 * Genera el siguiente código de referencia secuencial para documentos soporte.
 * Sigue el mismo patrón que generateInvoiceNumber (invoiceUtils.ts) pero consulta
 * support_documents con prefijo 'DS' para evitar duplicados por organización.
 */
async function generateSupportDocumentReference(
  organizationId: number,
  prefix: string = 'DS'
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('support_documents')
      .select('reference_code')
      .eq('organization_id', organizationId)
      .like('reference_code', `${prefix}-%`);

    if (error) throw error;

    const existing = new Set<string>();
    let maxNumber = 0;
    const numberRegex = new RegExp(`${prefix}\\s*-\\s*(\\d{1,7})(?:\\D|$)`, 'i');

    for (const row of data || []) {
      if (!row.reference_code) continue;
      existing.add(row.reference_code.trim().toUpperCase());
      const match = row.reference_code.match(numberRegex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNumber) maxNumber = num;
      }
    }

    let nextNumber = maxNumber + 1;
    let formatted = `${prefix}-${nextNumber.toString().padStart(4, '0')}`;
    while (existing.has(formatted)) {
      nextNumber += 1;
      formatted = `${prefix}-${nextNumber.toString().padStart(4, '0')}`;
    }
    return formatted;
  } catch (error) {
    console.error('Error generando referencia DS:', error);
    return `${prefix}-${Date.now()}`;
  }
}

interface OrganizationCurrency {
  currency_code: string;
  is_base: boolean;
  currencies?: {
    code: string;
    name: string;
    symbol: string;
  };
}

interface InvoicePurchaseOption {
  id: string;
  number_ext: string;
  supplier_id: number;
  issue_date: string | null;
  total: number | null;
  currency: string | null;
  supplier?: { name: string; nit: string | null } | null;
}

export function SupportDocumentForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [organizationId, setOrganizationId] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Datos generales
  const [referenceCode, setReferenceCode] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [createdTime, setCreatedTime] = useState(new Date().toTimeString().substring(0, 8));
  const [observation, setObservation] = useState('');
  const [paymentForm, setPaymentForm] = useState('1');
  const [paymentMethodCode, setPaymentMethodCode] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState('COP');
  const [invoicePurchaseId, setInvoicePurchaseId] = useState<string>('');

  // Proveedor
  const [provider, setProvider] = useState<ProviderData>({
    identification_document_code: '31',
    identification: '',
    names: '',
    address: '',
    country_code: 'CO',
  });

  // Items (usa el tipo InvoiceItem de factura-venta)
  const [items, setItems] = useState<InvoiceItem[]>([
    {
      id: `item-${Date.now()}`,
      description: '',
      qty: 1,
      unit_price: 0,
      tax_code: null,
      tax_rate: 0,
      tax_included: false,
      total_line: 0,
      discount_amount: 0,
    },
  ]);

  // Impuestos (patrón de factura-venta)
  const [taxIncluded, setTaxIncluded] = useState<boolean>(false);
  const [appliedTaxes, setAppliedTaxes] = useState<{ [key: string]: boolean }>({});
  const [appliedTaxTotals, setAppliedTaxTotals] = useState<{ [key: string]: any }>({});
  const [subtotal, setSubtotal] = useState<number>(0);
  const [taxTotal, setTaxTotal] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);

  // Seriales (no se usan en documentos soporte pero ItemsFactura los requiere)
  const [serialSelections, setSerialSelections] = useState<Record<number, number[]>>({});

  // Monedas y facturas de compra
  const [orgCurrencies, setOrgCurrencies] = useState<OrganizationCurrency[]>([]);
  const [invoicePurchaseOptions, setInvoicePurchaseOptions] = useState<InvoicePurchaseOption[]>([]);
  const [loadingCurrencies, setLoadingCurrencies] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  useEffect(() => {
    const orgId = getOrganizationId();
    setOrganizationId(orgId);
  }, []);

  // Generar referencia secuencial al cargar
  useEffect(() => {
    if (organizationId && !referenceCode) {
      generateSupportDocumentReference(organizationId, 'DS').then(setReferenceCode);
    }
  }, [organizationId, referenceCode]);

  // Cargar monedas de la organización
  const loadCurrencies = useCallback(async () => {
    if (!organizationId) return;
    setLoadingCurrencies(true);
    try {
      const { data: orgCurrencies, error } = await supabase
        .from('organization_currencies')
        .select('currency_code, is_base')
        .eq('organization_id', organizationId)
        .order('is_base', { ascending: false });

      if (error) throw error;

      if (!orgCurrencies || orgCurrencies.length === 0) {
        setOrgCurrencies([{ currency_code: 'COP', is_base: true, currencies: { code: 'COP', name: 'Peso Colombiano', symbol: '$' } }]);
        return;
      }

      const codes = orgCurrencies.map((oc) => oc.currency_code);
      const { data: currencies } = await supabase
        .from('currencies')
        .select('code, name, symbol')
        .in('code', codes);

      const combined = orgCurrencies.map((oc) => ({
        ...oc,
        currencies: currencies?.find((c) => c.code === oc.currency_code),
      }));
      setOrgCurrencies(combined);

      // Seleccionar moneda base por defecto
      const base = combined.find((c) => c.is_base);
      if (base) setCurrency(base.currency_code);
    } catch (err) {
      console.error('Error cargando monedas:', err);
      setOrgCurrencies([{ currency_code: 'COP', is_base: true, currencies: { code: 'COP', name: 'Peso Colombiano', symbol: '$' } }]);
    } finally {
      setLoadingCurrencies(false);
    }
  }, [organizationId]);

  // Cargar facturas de compra para el SearchSelect
  const loadInvoicePurchases = useCallback(async () => {
    if (!organizationId) return;
    setLoadingInvoices(true);
    try {
      const { data, error } = await supabase
        .from('invoice_purchase')
        .select(`
          id, number_ext, supplier_id, issue_date, total, currency,
          supplier:suppliers(name, nit)
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setInvoicePurchaseOptions((data || []) as unknown as InvoicePurchaseOption[]);
    } catch (err) {
      console.error('Error cargando facturas de compra:', err);
    } finally {
      setLoadingInvoices(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (organizationId) {
      loadCurrencies();
      loadInvoicePurchases();
    }
  }, [organizationId, loadCurrencies, loadInvoicePurchases]);

  // Opciones para SearchSelect de factura de compra
  const invoicePurchaseSearchOptions = useMemo(
    () =>
      invoicePurchaseOptions.map((inv) => ({
        value: inv.id,
        label: `${inv.number_ext}${inv.supplier?.name ? ` — ${inv.supplier.name}` : ''}`,
        sublabel: `${inv.issue_date ? new Date(inv.issue_date).toLocaleDateString() : 'S/F'} · ${formatCurrency(Number(inv.total || 0))} ${inv.currency || ''}`,
      })),
    [invoicePurchaseOptions]
  );

  const handleItemsChange = useCallback((newItems: InvoiceItem[]) => {
    setItems(newItems);
  }, []);

  const handleTaxIncludedChange = useCallback((value: boolean) => {
    setTaxIncluded(value);
    setItems((prev) => prev.map((item) => ({ ...item, tax_included: value })));
  }, []);

  const validate = (): string | null => {
    if (!provider.identification) return 'Debe seleccionar un proveedor';
    if (!provider.names) return 'Debe seleccionar un proveedor';
    if (!provider.address) return 'El proveedor debe tener dirección (requerido por DIAN)';
    if (items.length === 0) return 'Debe agregar al menos un item';
    for (const item of items) {
      if (!item.description) return 'Todos los items deben tener una descripción';
      if (Number(item.qty) <= 0) return 'Las cantidades deben ser mayores a 0';
      if (Number(item.unit_price) < 0) return 'Los precios no pueden ser negativos';
    }
    if (paymentForm === '2' && !dueDate) return 'Debe ingresar fecha de vencimiento para pago a crédito';
    if (!paymentMethodCode) return 'Debe seleccionar un método de pago';
    return null;
  };

  const saveDraft = async (sendToDian = false) => {
    const validationError = validate();
    if (validationError) {
      toast({ title: 'Validación', description: validationError, variant: 'destructive' });
      return;
    }

    if (sendToDian) {
      setIsSending(true);
    } else {
      setIsSaving(true);
    }

    try {
      // Totales seguros recalculados desde los items (fuente de verdad)
      const safeSubtotal = Number(subtotal.toFixed(2));
      const safeTaxTotal = Number(taxTotal.toFixed(2));
      const safeTotal = Number(total.toFixed(2));

      // 1. Guardar documento soporte en BD
      const { data: sd, error: sdError } = await supabase
        .from('support_documents')
        .insert({
          organization_id: organizationId,
          reference_code: referenceCode,
          issue_date: new Date(issueDate).toISOString(),
          created_time: createdTime,
          observation,
          payment_details: [
            {
              payment_form: paymentForm,
              payment_method_code: paymentMethodCode,
              amount: safeTotal.toFixed(2),
              ...(paymentForm === '2' && dueDate ? { due_date: dueDate } : {}),
            },
          ],
          cash_rounding_amount: 0,
          provider,
          subtotal: safeSubtotal,
          tax_total: safeTaxTotal,
          total: safeTotal,
          currency,
          tax_included: taxIncluded,
          status: 'draft',
          supplier_id: provider.supplier_id || null,
          invoice_purchase_id: invoicePurchaseId || null,
        })
        .select()
        .single();

      if (sdError || !sd) {
        throw new Error(sdError?.message || 'Error guardando documento soporte');
      }

      // 2. Guardar items en invoice_items (mapear InvoiceItem → campos de BD)
      const itemsToInsert = items.map((item, index) => ({
        invoice_id: sd.id,
        invoice_type: 'support_document',
        support_document_id: sd.id,
        invoice_sales_id: null,
        invoice_purchase_id: null,
        product_id: item.product_id || null,
        description: item.description,
        qty: Number(item.qty),
        unit_price: Number(item.unit_price),
        tax_code: item.tax_code || '01',
        tax_rate: Number(item.tax_rate || 0),
        total_line:
          Number(item.qty) * Number(item.unit_price) - (Number(item.discount_amount) || 0),
        discount_amount: Number(item.discount_amount) || 0,
        tax_included: taxIncluded,
        code_reference: item.product_id ? `PROD-${item.product_id}` : `ITEM-${index + 1}`,
        is_excluded: Number(item.tax_rate || 0) === 0 ? 1 : 0,
        note: '',
      }));

      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(itemsToInsert);

      if (itemsError) {
        throw new Error(`Error guardando items: ${itemsError.message}`);
      }

      if (sendToDian) {
        // 3. Enviar a Factus
        const res = await fetch('/api/factus/support-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organizationId,
            supportDocumentId: sd.id,
          }),
        });

        const result = await res.json();
        if (!res.ok) {
          throw new Error(result.error || 'Error enviando a Factus');
        }

        toast({
          title: 'Documento enviado a DIAN',
          description: `Ref: ${sd.reference_code} — ${result.data?.is_validated ? 'Validado' : 'En proceso'}`,
        });
      } else {
        toast({
          title: 'Borrador guardado',
          description: `Documento soporte ${sd.reference_code} guardado correctamente`,
        });
      }

      router.push(`/app/finanzas/documentos-soporte/${sd.id}`);
    } catch (error: any) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Error inesperado',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
      setIsSending(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/app/finanzas/documentos-soporte"
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Nuevo Documento Soporte
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Para compras a proveedores no responsables de IVA
          </p>
        </div>
      </div>

      {/* Datos generales */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg">Datos Generales</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Código de referencia *</Label>
            <Input
              value={referenceCode}
              onChange={(e) => setReferenceCode(e.target.value)}
              placeholder="DS-0001"
            />
            <p className="text-[10px] text-gray-500 dark:text-gray-400">
              Auto-generado secuencial por organización
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fecha de emisión *</Label>
            <Input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Hora de creación</Label>
            <Input
              type="time"
              step="1"
              value={createdTime}
              onChange={(e) => setCreatedTime(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Moneda *</Label>
            <Select value={currency} onValueChange={setCurrency} disabled={loadingCurrencies}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar moneda" />
              </SelectTrigger>
              <SelectContent>
                {orgCurrencies.length === 0 ? (
                  <SelectItem value="_empty" disabled>
                    {loadingCurrencies ? 'Cargando...' : 'Sin monedas configuradas'}
                  </SelectItem>
                ) : (
                  orgCurrencies.map((oc) => (
                    <SelectItem key={oc.currency_code} value={oc.currency_code}>
                      {oc.currencies?.name || oc.currency_code}
                      {oc.is_base && ' (base)'}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Forma de pago *</Label>
            <Select value={paymentForm} onValueChange={setPaymentForm}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_FORMS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {paymentForm === '2' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha de vencimiento *</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label className="text-xs">Método de pago *</Label>
            <FormaPagoSelector formaPago={paymentMethodCode} onChange={setPaymentMethodCode} />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label className="text-xs">Observaciones</Label>
            <Textarea
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              placeholder="Observaciones del documento (máx 500 caracteres)"
              maxLength={500}
              rows={2}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label className="text-xs">Factura de compra relacionada (opcional)</Label>
            <SearchSelect
              options={invoicePurchaseSearchOptions}
              value={invoicePurchaseId}
              onValueChange={(v) => setInvoicePurchaseId(v === 'none' ? '' : v)}
              placeholder="Seleccionar factura de compra..."
              searchPlaceholder="Buscar por número o proveedor..."
              emptyText={loadingInvoices ? 'Cargando facturas...' : 'No se encontraron facturas'}
              noneLabel="Sin factura de compra"
            />
          </div>
        </CardContent>
      </Card>

      {/* Proveedor */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg">Proveedor</CardTitle>
        </CardHeader>
        <CardContent>
          <ProviderSelector value={provider} onChange={setProvider} />
        </CardContent>
      </Card>

      {/* Items (reutiliza ItemsFactura de factura-venta) */}
      <div className="
        border border-gray-200 dark:border-gray-700
        bg-white dark:bg-gray-800
        p-3 sm:p-4
        rounded-lg
        space-y-3
      ">
        <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">
          Items del Documento Soporte
        </h3>
        <ItemsFactura
          items={items}
          onItemsChange={handleItemsChange}
          taxIncluded={taxIncluded}
          organizationId={organizationId ? Number(organizationId) : undefined}
          serialSelections={serialSelections}
          onSerialSelectionsChange={setSerialSelections}
        />
      </div>

      {/* Impuestos y Totales (reutiliza ImpuestosFactura de factura-venta) */}
      <ImpuestosFactura
        organizationId={organizationId}
        items={items}
        taxIncluded={taxIncluded}
        onTaxIncludedChange={handleTaxIncludedChange}
        onAppliedTaxesChange={setAppliedTaxes}
        onTaxTotalsChange={setAppliedTaxTotals}
        onSubtotalCalculated={setSubtotal}
        onTaxTotalCalculated={setTaxTotal}
        onTotalCalculated={setTotal}
      />

      {/* Acciones */}
      <div className="flex flex-col sm:flex-row gap-3 justify-end">
        <Link href="/app/finanzas/documentos-soporte">
          <Button variant="outline" className="w-full sm:w-auto">
            Cancelar
          </Button>
        </Link>
        <Button
          variant="outline"
          onClick={() => saveDraft(false)}
          disabled={isSaving || isSending}
          className="w-full sm:w-auto"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Guardar borrador
        </Button>
        <Button
          onClick={() => saveDraft(true)}
          disabled={isSaving || isSending}
          className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700"
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          Guardar y enviar a DIAN
        </Button>
      </div>
    </div>
  );
}

export default SupportDocumentForm;
