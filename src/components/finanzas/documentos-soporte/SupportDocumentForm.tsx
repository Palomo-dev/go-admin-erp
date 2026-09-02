'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Send,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { ProviderSelector, type ProviderData } from './ProviderSelector';

interface ItemRow {
  id: string;
  code_reference: string;
  name: string;
  quantity: string;
  discount_rate: string;
  price: string;
  tax_rate: string;
  unit_measure_code: string;
  standard_code: string;
  is_excluded: boolean;
}

const TAX_RATES = [
  { value: '0', label: '0% (Excluido)' },
  { value: '5', label: '5%' },
  { value: '19', label: '19%' },
];

const PAYMENT_FORMS = [
  { value: '1', label: 'Contado' },
  { value: '2', label: 'Crédito' },
];

const PAYMENT_METHODS = [
  { value: '10', label: 'Efectivo' },
  { value: '42', label: 'Consignación bancaria' },
  { value: '47', label: 'Transferencia débito' },
  { value: '48', label: 'Tarjeta crédito' },
  { value: '49', label: 'Tarjeta débito' },
  { value: '20', label: 'Cheque' },
];

function generateReferenceCode(): string {
  const date = new Date();
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `DS-${ymd}-${rand}`;
}

function newItem(): ItemRow {
  return {
    id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    code_reference: '',
    name: '',
    quantity: '1.00',
    discount_rate: '0',
    price: '0',
    tax_rate: '0',
    unit_measure_code: '94',
    standard_code: '999',
    is_excluded: true,
  };
}

export function SupportDocumentForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [organizationId, setOrganizationId] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Datos generales
  const [referenceCode, setReferenceCode] = useState(generateReferenceCode());
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [createdTime, setCreatedTime] = useState(new Date().toTimeString().substring(0, 8));
  const [observation, setObservation] = useState('');
  const [paymentForm, setPaymentForm] = useState('1');
  const [paymentMethodCode, setPaymentMethodCode] = useState('10');
  const [dueDate, setDueDate] = useState('');
  const [invoicePurchaseId, setInvoicePurchaseId] = useState('');

  // Proveedor
  const [provider, setProvider] = useState<ProviderData>({
    identification_document_code: '31',
    identification: '',
    names: '',
    address: '',
    country_code: 'CO',
  });

  // Items
  const [items, setItems] = useState<ItemRow[]>([newItem()]);

  React.useEffect(() => {
    const orgId = getOrganizationId();
    setOrganizationId(orgId);
  }, []);

  const addItem = () => setItems((prev) => [...prev, newItem()]);

  const removeItem = (id: string) =>
    setItems((prev) => (prev.length > 1 ? prev.filter((i) => i.id !== id) : prev));

  const updateItem = (id: string, field: keyof ItemRow, value: string | boolean) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)));

  // Cálculos
  const subtotal = items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.price) || 0;
    const discount = Number(item.discount_rate) || 0;
    return sum + qty * price * (1 - discount / 100);
  }, 0);

  const taxTotal = items.reduce((sum, item) => {
    if (item.is_excluded) return sum;
    const qty = Number(item.quantity) || 0;
    const price = Number(item.price) || 0;
    const discount = Number(item.discount_rate) || 0;
    const net = qty * price * (1 - discount / 100);
    return sum + net * (Number(item.tax_rate) / 100);
  }, 0);

  const total = subtotal + taxTotal;

  const validate = (): string | null => {
    if (!provider.identification) return 'Debe ingresar la identificación del proveedor';
    if (!provider.names) return 'Debe ingresar el nombre del proveedor';
    if (!provider.address) return 'Debe ingresar la dirección del proveedor';
    if (items.length === 0) return 'Debe agregar al menos un item';
    for (const item of items) {
      if (!item.name) return 'Todos los items deben tener un nombre';
      if (Number(item.quantity) <= 0) return 'Las cantidades deben ser mayores a 0';
      if (Number(item.price) < 0) return 'Los precios no pueden ser negativos';
    }
    if (paymentForm === '2' && !dueDate) return 'Debe ingresar fecha de vencimiento para pago a crédito';
    return null;
  };

  const buildPayload = () => ({
    reference_code: referenceCode,
    issue_date: new Date(issueDate).toISOString(),
    created_time: createdTime,
    observation,
    payment_details: [
      {
        payment_form: paymentForm,
        payment_method_code: paymentMethodCode,
        amount: total.toFixed(2),
        ...(paymentForm === '2' && dueDate ? { due_date: dueDate } : {}),
      },
    ],
    cash_rounding_amount: 0,
    provider,
    subtotal: Number(subtotal.toFixed(2)),
    tax_total: Number(taxTotal.toFixed(2)),
    total: Number(total.toFixed(2)),
    ...(invoicePurchaseId ? { invoice_purchase_id: invoicePurchaseId } : {}),
    ...(provider.supplier_id ? { supplier_id: provider.supplier_id } : {}),
  });

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
      // 1. Guardar documento soporte en BD
      const payload = buildPayload();
      const { data: sd, error: sdError } = await supabase
        .from('support_documents')
        .insert({
          organization_id: organizationId,
          reference_code: payload.reference_code,
          issue_date: payload.issue_date,
          created_time: payload.created_time,
          observation: payload.observation,
          payment_details: payload.payment_details,
          cash_rounding_amount: payload.cash_rounding_amount,
          provider: payload.provider,
          subtotal: payload.subtotal,
          tax_total: payload.tax_total,
          total: payload.total,
          status: 'draft',
          supplier_id: payload.supplier_id || null,
          invoice_purchase_id: payload.invoice_purchase_id || null,
        })
        .select()
        .single();

      if (sdError || !sd) {
        throw new Error(sdError?.message || 'Error guardando documento soporte');
      }

      // 2. Guardar items en invoice_items
      const itemsToInsert = items.map((item, index) => ({
        invoice_id: sd.id, // referenciado para compatibilidad
        invoice_type: 'support_document',
        support_document_id: sd.id,
        description: item.name,
        qty: Number(item.quantity),
        unit_price: Number(item.price),
        tax_code: '01',
        tax_rate: Number(item.tax_rate),
        total_line:
          Number(item.quantity) *
          Number(item.price) *
          (1 - (Number(item.discount_rate) || 0) / 100),
        discount_rate: Number(item.discount_rate) || 0,
        discount_amount: 0,
        tax_included: false,
        code_reference: item.code_reference || `ITEM-${index + 1}`,
        is_excluded: item.is_excluded ? 1 : 0,
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
              placeholder="DS-2026-0001"
            />
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
          <div className="space-y-1.5">
            <Label className="text-xs">Método de pago *</Label>
            <Select value={paymentMethodCode} onValueChange={setPaymentMethodCode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
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
            <Input
              value={invoicePurchaseId}
              onChange={(e) => setInvoicePurchaseId(e.target.value)}
              placeholder="UUID de factura de compra (opcional)"
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

      {/* Items */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Items del Documento</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="h-4 w-4 mr-2" />
            Agregar item
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-12 gap-2 items-end p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <div className="col-span-12 sm:col-span-2 space-y-1">
                <Label className="text-xs">Código ref.</Label>
                <Input
                  value={item.code_reference}
                  onChange={(e) => updateItem(item.id, 'code_reference', e.target.value)}
                  placeholder="001"
                />
              </div>
              <div className="col-span-12 sm:col-span-4 space-y-1">
                <Label className="text-xs">Descripción *</Label>
                <Input
                  value={item.name}
                  onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                  placeholder="Producto o servicio"
                />
              </div>
              <div className="col-span-6 sm:col-span-1 space-y-1">
                <Label className="text-xs">Cantidad</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={item.quantity}
                  onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                />
              </div>
              <div className="col-span-6 sm:col-span-2 space-y-1">
                <Label className="text-xs">Precio unit.</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={item.price}
                  onChange={(e) => updateItem(item.id, 'price', e.target.value)}
                />
              </div>
              <div className="col-span-6 sm:col-span-1 space-y-1">
                <Label className="text-xs">% Desc.</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={item.discount_rate}
                  onChange={(e) => updateItem(item.id, 'discount_rate', e.target.value)}
                />
              </div>
              <div className="col-span-6 sm:col-span-1 space-y-1">
                <Label className="text-xs">% IVA</Label>
                <Select
                  value={item.tax_rate}
                  onValueChange={(v) => updateItem(item.id, 'tax_rate', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TAX_RATES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12 sm:col-span-1 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeItem(item.id)}
                  disabled={items.length === 1}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          {/* Totales */}
          <div className="flex justify-end mt-4">
            <div className="w-full sm:w-64 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Subtotal:</span>
                <span className="font-medium">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">IVA:</span>
                <span className="font-medium">${taxTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base font-bold border-t pt-2 dark:border-gray-700">
                <span>Total:</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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

