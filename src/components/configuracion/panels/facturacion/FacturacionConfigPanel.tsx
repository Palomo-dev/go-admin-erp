'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { PageHeaderSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useElectronicInvoicePreference } from '@/lib/hooks/useElectronicInvoicePreference';
import { electronicInvoicingConfigService, type EstadoFacturacionElectronica } from '@/lib/services/electronicInvoicingConfigService';
import { CredencialesFactusSection } from './sections/CredencialesFactusSection';
import { RangosDianSection } from './sections/RangosDianSection';

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  invoice: 'Factura de Venta',
  credit_note: 'Nota Crédito',
  debit_note: 'Nota Débito',
  adjustment_note: 'Nota de Ajuste',
  support_document: 'Documento Soporte',
};

interface RangoData {
  id: number | null;
  documentType: string;
  prefix: string;
  rangeStart: number;
  rangeEnd: number;
  currentNumber: number;
  resolutionNumber: string;
  resolutionDate: string;
  validFrom: string;
  validUntil: string;
  technicalKey: string;
  testSetId: string;
  factusNumberingRangeId: string | number;
  isActive: boolean;
}

export function FacturacionConfigPanel() {
  const { toast } = useToast();
  const orgId = getOrganizationId();
  const [loading, setLoading] = useState(true);
  const [servicio, setServicio] = useState<EstadoFacturacionElectronica | null>(null);
  const [savingRange, setSavingRange] = useState(false);
  const [fetchingRanges, setFetchingRanges] = useState(false);
  const [savedRanges, setSavedRanges] = useState<Record<string, unknown>[]>([]);
  const [editingRangeId, setEditingRangeId] = useState<number | null>(null);
  const { alwaysEnabled: eInvoiceAlwaysEnabled, savePreference: saveEInvoicePreference, loading: loadingEInvoicePref } = useElectronicInvoicePreference();
  const [savingEInvoiceToggle, setSavingEInvoiceToggle] = useState(false);

  const [range, setRange] = useState<RangoData>({
    id: null, documentType: 'invoice', prefix: 'FE', rangeStart: 1, rangeEnd: 1000,
    currentNumber: 1, resolutionNumber: '', resolutionDate: '', validFrom: '', validUntil: '',
    technicalKey: '', testSetId: '', factusNumberingRangeId: '', isActive: true,
  });

  useEffect(() => {
    async function loadConfig() {
      if (!orgId) return;
      // Estado del servicio, sin credenciales: las gestiona la plataforma.
      setServicio(await electronicInvoicingConfigService.getStatus());
      const { supabase } = await import('@/lib/supabase/config');
      const { data: seqs } = await supabase.from('invoice_sequences').select('*').eq('organization_id', orgId).order('document_type');
      if (seqs && seqs.length > 0) {
        setSavedRanges(seqs);
        const invoiceSeq = seqs.find((s) => s.document_type === 'invoice') || seqs[0];
        setRange({
          id: invoiceSeq.id, documentType: invoiceSeq.document_type || 'invoice',
          prefix: invoiceSeq.prefix || 'FE', rangeStart: invoiceSeq.range_start || 1,
          rangeEnd: invoiceSeq.range_end || 1000, currentNumber: invoiceSeq.current_number || 1,
          resolutionNumber: invoiceSeq.resolution_number || '', resolutionDate: invoiceSeq.resolution_date || '',
          validFrom: invoiceSeq.valid_from || '', validUntil: invoiceSeq.valid_until || '',
          technicalKey: invoiceSeq.technical_key || '', testSetId: invoiceSeq.test_set_id || '',
          factusNumberingRangeId: invoiceSeq.factus_numbering_range_id || '', isActive: invoiceSeq.is_active,
        });
      }
      setLoading(false);
    }
    loadConfig();
  }, [orgId]);

  /**
   * Sincroniza los rangos de la cuenta de Factus DE LA ORGANIZACIÓN en el
   * servidor (antes: desde el navegador, con la cuenta de la plataforma y la
   * sucursal «2» de respaldo). Sucursal: la activa; sin ella, se pide ir a la
   * pantalla de configuración, que deja elegirla.
   */
  const handleFetchRanges = async () => {
    const sucursalActiva = typeof window !== 'undefined' ? Number.parseInt(localStorage.getItem('currentBranchId') || '', 10) : NaN;
    if (!Number.isInteger(sucursalActiva) || sucursalActiva <= 0) {
      toast({ title: 'Seleccione una sucursal', description: 'Elija la sucursal en Configuración › Facturación electrónica › Servicio.', variant: 'destructive' });
      return;
    }
    setFetchingRanges(true);
    try {
      const res = await fetch('/api/factus/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sincronizar_rangos', branchId: sucursalActiva }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        const { supabase } = await import('@/lib/supabase/config');
        const { data: allSeqs } = await supabase.from('invoice_sequences').select('*').eq('organization_id', orgId).order('document_type');
        if (allSeqs) setSavedRanges(allSeqs);
        toast({ title: 'Rangos sincronizados', description: `${json.importados ?? 0} importado(s), ${json.desactivados ?? 0} desactivado(s).` });
      } else {
        toast({ title: 'Error', description: json.error || 'No se pudieron obtener los rangos.', variant: 'destructive' });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
    setFetchingRanges(false);
  };

  const handleEditRange = (seq: Record<string, unknown>) => {
    setEditingRangeId(seq.id as number);
    setRange({
      id: seq.id as number, documentType: (seq.document_type as string) || 'invoice', prefix: (seq.prefix as string) || '',
      rangeStart: (seq.range_start as number) || 0, rangeEnd: (seq.range_end as number) || 0, currentNumber: (seq.current_number as number) || 0,
      resolutionNumber: (seq.resolution_number as string) || '', resolutionDate: (seq.resolution_date as string) || '',
      validFrom: (seq.valid_from as string) || '', validUntil: (seq.valid_until as string) || '',
      technicalKey: (seq.technical_key as string) || '', testSetId: (seq.test_set_id as string) || '',
      factusNumberingRangeId: (seq.factus_numbering_range_id as string) || '', isActive: seq.is_active as boolean,
    });
  };

  const handleSaveRange = async () => {
    if (!orgId) return;
    setSavingRange(true);
    const { supabase } = await import('@/lib/supabase/config');
    const branchId = typeof window !== 'undefined' ? parseInt(localStorage.getItem('currentBranchId') || '2', 10) : 2;
    const data = {
      organization_id: orgId, branch_id: branchId, document_type: range.documentType,
      prefix: range.prefix, range_start: Number(range.rangeStart), range_end: Number(range.rangeEnd),
      current_number: Number(range.currentNumber), resolution_number: range.resolutionNumber || null,
      resolution_date: range.resolutionDate || null, valid_from: range.validFrom || null,
      valid_until: range.validUntil || null, technical_key: range.technicalKey || null,
      test_set_id: range.testSetId || null,
      factus_numbering_range_id: range.factusNumberingRangeId ? Number(range.factusNumberingRangeId) : null,
      is_active: range.isActive, updated_at: new Date().toISOString(),
    };
    let error;
    if (range.id) {
      ({ error } = await supabase.from('invoice_sequences').update(data).eq('id', range.id));
    } else {
      ({ error } = await supabase.from('invoice_sequences').insert({ ...data, created_at: new Date().toISOString() }).select().single());
    }
    setSavingRange(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Rango guardado', description: `Rango ${range.prefix} guardado correctamente.` });
      setEditingRangeId(null);
      const { data: allSeqs } = await supabase.from('invoice_sequences').select('*').eq('organization_id', orgId).order('document_type');
      if (allSeqs) setSavedRanges(allSeqs);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <PageHeaderSkeleton />
        <CardListSkeleton cards={3} columns="1" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <CredencialesFactusSection
        servicio={servicio}
        cargando={loading}
        eInvoiceAlwaysEnabled={eInvoiceAlwaysEnabled}
        savingEInvoiceToggle={savingEInvoiceToggle}
        loadingEInvoicePref={loadingEInvoicePref}
        onEInvoiceToggle={async (checked) => {
          setSavingEInvoiceToggle(true);
          const result = await saveEInvoicePreference(checked);
          setSavingEInvoiceToggle(false);
          toast({
            title: result.success ? 'Preferencia guardada' : 'Error',
            description: result.success ? (checked ? 'Factura electrónica activada globalmente' : 'Factura electrónica desactivada globalmente') : result.error || 'No se pudo guardar',
            variant: result.success ? 'default' : 'destructive',
          });
        }}
      />

      <RangosDianSection
        savedRanges={savedRanges}
        editingRangeId={editingRangeId}
        range={range}
        fetchingRanges={fetchingRanges}
        savingRange={savingRange}
        documentTypeLabels={DOCUMENT_TYPE_LABELS}
        onFetchRanges={handleFetchRanges}
        onEditRange={handleEditRange}
        onRangeChange={setRange}
        onSaveRange={handleSaveRange}
        onCancelEdit={() => setEditingRangeId(null)}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Información</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-gray-500 space-y-1">
          <p>• GO Admin presta la facturación electrónica: el equipo de GO Admin gestiona las credenciales del proveedor.</p>
          <p>• El ambiente de <strong>pruebas</strong> no envía documentos reales a la DIAN.</p>
          <p>• En <strong>producción</strong> los documentos se envían a la DIAN con el NIT de la organización.</p>
        </CardContent>
      </Card>
    </div>
  );
}
