'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { Loader2, Save } from 'lucide-react';
import { useToast, toastSuccess, toastError } from '@/components/ui/use-toast';
import { getOrganizationId, obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { formatCurrency } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';
import { CotizacionesService, type QuotationItem } from '@/lib/services/cotizacionesService';
import { ClienteSelector } from '@/components/finanzas/facturas-venta/nueva-factura/ClienteSelector';
import { ItemsFactura } from '@/components/finanzas/facturas-venta/nueva-factura/ItemsFactura';
import { ImpuestosFactura } from '@/components/finanzas/facturas-venta/nueva-factura/ImpuestosFactura';
import { FormaPagoSelector } from '@/components/finanzas/facturas-venta/nueva-factura/FormaPagoSelector';
import type { InvoiceItem } from '@/components/finanzas/facturas-venta/nueva-factura/NuevaFacturaForm';
import { PageBackHeader } from './PageBackHeader';

interface NuevaCotizacionFormProps {
  cotizacionId?: string;
  mode?: 'create' | 'edit';
}

export function NuevaCotizacionForm({ cotizacionId, mode = 'create' }: NuevaCotizacionFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const organizationId = getOrganizationId();
  const org = obtenerOrganizacionActiva();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [serialSelections, setSerialSelections] = useState<Record<number, number[]>>({});
  const [taxIncluded, setTaxIncluded] = useState(false);
  const [appliedTaxes, setAppliedTaxes] = useState<{ [key: string]: boolean }>({});
  const [taxTotals, setTaxTotals] = useState<{ [key: string]: any }>({});
  const [subtotal, setSubtotal] = useState(0);
  const [taxTotal, setTaxTotal] = useState(0);
  const [total, setTotal] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentTerms, setPaymentTerms] = useState(30);
  const [validUntil, setValidUntil] = useState<string>(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [issueDate, setIssueDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [currency, setCurrency] = useState('COP');
  const [notes, setNotes] = useState('');
  const [termsConditions, setTermsConditions] = useState('');
  const [salespersonId, setSalespersonId] = useState<string>('none');
  const [salespeople, setSalespeople] = useState<{ id: string; name: string }[]>([]);
  const [salespersonSearch, setSalespersonSearch] = useState('');
  const [branchId, setBranchId] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (organizationId) {
      loadSalespeople();
      loadBranchId();
    }
  }, [organizationId]);

  const loadSalespeople = async () => {
    if (!organizationId) return;
    try {
      const { data, error } = await supabase
        .from('organization_members')
        .select(`
          user_id,
          is_active,
          profiles!inner(
            id,
            first_name,
            last_name
          )
        `)
        .eq('organization_id', organizationId)
        .eq('is_active', true);
      if (error) return;
      if (data) {
        setSalespeople(
          data
            .map((m: any) => {
              const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
              return {
                id: m.user_id,
                name: `${p?.first_name || ''} ${p?.last_name || ''}`.trim() || m.user_id,
              };
            })
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      }
    } catch (e) {
      console.error('Error loading salespeople:', e);
    }
  };

  const loadBranchId = async () => {
    if (!organizationId) return;
    try {
      const { data } = await supabase
        .from('branches')
        .select('id')
        .eq('organization_id', organizationId)
        .limit(1);
      if (data && data.length > 0) setBranchId(data[0].id);
    } catch (e) {
      console.error('Error loading branch:', e);
    }
  };

  const salespeopleFiltrados = useMemo(() => {
    if (salespersonSearch.trim() === '') return salespeople;
    const term = salespersonSearch.toLowerCase();
    return salespeople.filter((s) => s.name.toLowerCase().includes(term));
  }, [salespeople, salespersonSearch]);

  useEffect(() => {
    if (mode === 'edit' && cotizacionId) {
      loadCotizacionForEdit();
    }
  }, [mode, cotizacionId]);

  const loadCotizacionForEdit = async () => {
    try {
      setLoading(true);
      const cot = await CotizacionesService.getQuotationById(cotizacionId!);
      if (!cot) return;

      setCustomerId(cot.customer_id);
      setIssueDate(cot.issue_date);
      setValidUntil(cot.valid_until || '');
      setCurrency(cot.currency);
      setPaymentMethod(cot.payment_method || '');
      setPaymentTerms(cot.payment_terms || 30);
      setNotes(cot.notes || '');
      setTermsConditions(cot.terms_conditions || '');
      setSalespersonId(cot.salesperson_id || 'none');
      setTaxIncluded(cot.quotation_items?.[0]?.tax_included || false);

      if (cot.quotation_items) {
        const mappedItems: InvoiceItem[] = cot.quotation_items.map((item) => ({
          id: item.id,
          invoice_type: 'sale',
          product_id: item.product_id,
          description: item.description,
          qty: item.qty,
          unit_price: item.unit_price,
          tax_code: item.tax_code,
          tax_rate: item.tax_rate,
          tax_included: item.tax_included,
          total_line: item.total_line,
          discount_amount: item.discount_amount,
        }));
        setItems(mappedItems);
      }
    } catch (error) {
      console.error('Error loading quotation for edit:', error);
      toastError('Error', 'No se pudo cargar la cotización');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!customerId) {
      toastError('Error', 'Selecciona un cliente');
      return;
    }
    if (items.length === 0) {
      toastError('Error', 'Agrega al menos un item');
      return;
    }
    if (!organizationId || !branchId) {
      toastError('Error', 'Falta información de organización');
      return;
    }

    try {
      setSaving(true);

      const { data: userData } = await supabase.auth.getUser();
      const quotationNumber =
        mode === 'create'
          ? await CotizacionesService.generateQuotationNumber(organizationId)
          : '';

      const quotationItems: QuotationItem[] = items.map((item) => ({
        product_id: item.product_id,
        description: item.description,
        qty: item.qty,
        unit_price: item.unit_price,
        discount_amount: item.discount_amount || 0,
        tax_code: item.tax_code || null,
        tax_rate: item.tax_rate || 0,
        tax_included: item.tax_included,
        total_line: item.total_line,
      }));

      const quotationData = {
        organization_id: organizationId,
        branch_id: branchId,
        number: quotationNumber,
        customer_id: customerId,
        issue_date: issueDate,
        valid_until: validUntil || null,
        currency,
        subtotal,
        tax_total: taxTotal,
        discount_total: items.reduce((sum, i) => sum + (i.discount_amount || 0), 0),
        total,
        status: 'draft' as const,
        payment_terms: paymentTerms,
        payment_method: paymentMethod || null,
        notes: notes || null,
        terms_conditions: termsConditions || null,
        salesperson_id: salespersonId !== 'none' ? salespersonId : null,
        created_by: userData.user?.id || null,
      };

      if (mode === 'edit' && cotizacionId) {
        await CotizacionesService.updateQuotation(cotizacionId, {
          issue_date: issueDate,
          valid_until: validUntil || null,
          currency,
          subtotal,
          tax_total: taxTotal,
          discount_total: items.reduce((sum, i) => sum + (i.discount_amount || 0), 0),
          total,
          payment_terms: paymentTerms,
          payment_method: paymentMethod || null,
          notes: notes || null,
          terms_conditions: termsConditions || null,
          salesperson_id: salespersonId !== 'none' ? salespersonId : null,
        }, quotationItems);
        toastSuccess('Cotización actualizada', 'Los cambios se guardaron correctamente');
        router.push(`/app/finanzas/cotizaciones/${cotizacionId}`);
      } else {
        const created = await CotizacionesService.createQuotation(quotationData, quotationItems);
        toastSuccess('Cotización creada', `Cotización ${created.number} creada exitosamente`);
        router.push(`/app/finanzas/cotizaciones/${created.id}`);
      }
    } catch (error: any) {
      console.error('Error saving quotation:', error);
      toastError('Error', error.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <PageBackHeader title={mode === 'edit' ? 'Editar Cotización' : 'Nueva Cotización'} />

      <div className="space-y-4">
        {/* Cliente y fechas */}
        <Card className="p-4 sm:p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
            Información General
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Cliente</Label>
              <ClienteSelector selectedCustomerId={customerId} onCustomerChange={setCustomerId} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Fecha de Emisión</Label>
                <Input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Válida hasta</Label>
                <Input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Moneda</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800">
                  <SelectItem value="COP">COP - Peso Colombiano</SelectItem>
                  <SelectItem value="USD">USD - Dólar</SelectItem>
                  <SelectItem value="EUR">EUR - Euro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Vendedor</Label>
              <Select value={salespersonId} onValueChange={setSalespersonId}>
                <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800">
                  <div className="p-2 sticky top-0 bg-white dark:bg-gray-800 z-10">
                    <Input
                      placeholder="Buscar vendedor..."
                      value={salespersonSearch}
                      onChange={(e) => setSalespersonSearch(e.target.value)}
                      className="mb-2 text-sm bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div className="max-h-[200px] overflow-y-auto">
                    <SelectItem value="none">Sin asignar</SelectItem>
                    {salespeopleFiltrados.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </div>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Plazo de pago (días)</Label>
              <Input
                type="number"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(parseInt(e.target.value) || 30)}
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
          </div>
        </Card>

        {/* Items */}
        <Card className="p-4 sm:p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
            Items de la Cotización
          </h2>
          <ItemsFactura
            items={items}
            onItemsChange={setItems}
            taxIncluded={taxIncluded}
            branchId={branchId}
            serialSelections={serialSelections}
            onSerialSelectionsChange={setSerialSelections}
          />
        </Card>

        {/* Impuestos y totales */}
        <Card className="p-4 sm:p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
            Impuestos y Totales
          </h2>
          {organizationId && (
            <ImpuestosFactura
              organizationId={organizationId}
              items={items}
              taxIncluded={taxIncluded}
              onTaxIncludedChange={setTaxIncluded}
              onAppliedTaxesChange={setAppliedTaxes}
              onTaxTotalsChange={setTaxTotals}
              onSubtotalCalculated={setSubtotal}
              onTaxTotalCalculated={setTaxTotal}
              onTotalCalculated={setTotal}
              initialAppliedTaxCodes={Object.keys(appliedTaxes).filter((k) => appliedTaxes[k])}
            />
          )}
          <div className="mt-4 flex justify-end">
            <div className="w-full sm:w-72 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Subtotal:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Impuestos:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(taxTotal)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t pt-2 border-gray-200 dark:border-gray-700">
                <span className="text-gray-900 dark:text-gray-100">Total:</span>
                <span className="text-blue-600 dark:text-blue-400">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Pago */}
        <Card className="p-4 sm:p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
            Forma de Pago
          </h2>
          <FormaPagoSelector formaPago={paymentMethod} onChange={setPaymentMethod} />
        </Card>

        {/* Notas y términos */}
        <Card className="p-4 sm:p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
            Notas y Términos
          </h2>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Notas internas (no visibles en PDF)</Label>
              <RichTextEditor
                value={notes}
                onChange={setNotes}
                placeholder="Notas internas para el equipo..."
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
                minHeight={80}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Términos y condiciones (visibles en PDF)</Label>
              <RichTextEditor
                value={termsConditions}
                onChange={setTermsConditions}
                placeholder="Términos y condiciones de la cotización..."
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
                minHeight={100}
              />
            </div>
          </div>
        </Card>

        {/* Botones */}
        <div className="flex justify-end gap-3 pb-6">
          <Button variant="outline" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {mode === 'edit' ? 'Actualizar Cotización' : 'Guardar Cotización'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
