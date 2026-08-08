'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useElectronicInvoicePreference } from '@/lib/hooks/useElectronicInvoicePreference';
import { electronicInvoicingConfigService } from '@/lib/services/electronicInvoicingConfigService';
import { CredencialesFactusSection } from './sections/CredencialesFactusSection';
import { RangosDianSection } from './sections/RangosDianSection';

const DOCUMENT_TYPE_MAP: Record<string, string> = {
  'Factura de Venta': 'invoice',
  'Nota Crédito': 'credit_note',
  'Nota Débito': 'debit_note',
  'Nota de Ajuste Documento Soporte': 'adjustment_note',
  'Documento Soporte': 'support_document',
};

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
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
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

  const [config, setConfig] = useState({
    provider: 'factus',
    environment: 'sandbox' as 'sandbox' | 'production',
    clientId: '', clientSecret: '', username: '', password: '', isActive: true,
  });

  useEffect(() => {
    async function loadConfig() {
      if (!orgId) return;
      const existing = await electronicInvoicingConfigService.getConfig(orgId);
      if (existing) {
        setConfig({
          provider: existing.provider, environment: existing.environment,
          clientId: existing.client_id || '', clientSecret: existing.client_secret || '',
          username: existing.username || '', password: existing.password || '',
          isActive: existing.is_active,
        });
      }
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

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);
    const result = await electronicInvoicingConfigService.saveConfig({
      organization_id: orgId, provider: config.provider, environment: config.environment,
      client_id: config.clientId, client_secret: config.clientSecret,
      username: config.username, password: config.password, is_active: config.isActive,
    });
    setSaving(false);
    if (result.success) {
      toast({ title: 'Configuración guardada', description: 'Las credenciales se guardaron correctamente.' });
    } else {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    }
  };

  const handleTest = async () => {
    if (!orgId) return;
    setTesting(true);
    const result = await electronicInvoicingConfigService.testConnection(orgId);
    setTesting(false);
    toast({ title: result.success ? 'Conexión exitosa' : 'Error de conexión', description: result.message, variant: result.success ? 'default' : 'destructive' });
  };

  const handleFetchRanges = async () => {
    setFetchingRanges(true);
    try {
      const res = await fetch('/api/factus/numbering-ranges');
      const json = await res.json();
      if (json.success && json.data) {
        const ranges = json.data;
        if (ranges.length === 0) {
          toast({ title: 'Sin rangos', description: 'No hay rangos de numeración configurados en Factus.', variant: 'destructive' });
        } else {
          const { supabase } = await import('@/lib/supabase/config');
          const branchId = typeof window !== 'undefined' ? parseInt(localStorage.getItem('currentBranchId') || '2', 10) : 2;
          let saved = 0; let updated = 0;
          for (const fr of ranges) {
            const docType = DOCUMENT_TYPE_MAP[fr.document] || 'invoice';
            const data = {
              organization_id: orgId, branch_id: branchId, document_type: docType,
              prefix: fr.prefix || '', range_start: fr.from || 0, range_end: fr.to || 0,
              current_number: fr.current || 0, resolution_number: fr.resolution_number || null,
              resolution_date: fr.start_date || null, valid_from: fr.start_date || null,
              valid_until: fr.end_date || null, technical_key: fr.technical_key || null,
              factus_numbering_range_id: fr.id, is_active: !fr.is_expired, updated_at: new Date().toISOString(),
            };
            const { data: existing } = await supabase.from('invoice_sequences').select('id').eq('organization_id', orgId).eq('factus_numbering_range_id', fr.id).maybeSingle();
            if (existing) {
              await supabase.from('invoice_sequences').update(data).eq('id', existing.id);
              updated++;
            } else {
              await supabase.from('invoice_sequences').insert({ ...data, created_at: new Date().toISOString() });
              saved++;
            }
          }
          const { data: allSeqs } = await supabase.from('invoice_sequences').select('*').eq('organization_id', orgId).order('document_type');
          if (allSeqs) setSavedRanges(allSeqs);
          toast({ title: 'Rangos sincronizados', description: `${saved} nuevo(s), ${updated} actualizado(s). Total: ${ranges.length} rangos.` });
        }
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
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <CredencialesFactusSection
        config={config}
        onConfigChange={setConfig}
        onSave={handleSave}
        onTest={handleTest}
        saving={saving}
        testing={testing}
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
          <p>• Las credenciales se almacenan en la base de datos de la organización.</p>
          <p>• El ambiente <strong>sandbox</strong> es para pruebas, no envía a DIAN real.</p>
          <p>• El ambiente <strong>producción</strong> envía facturas reales a DIAN.</p>
          <p>• Si no hay configuración por organización, se usan las variables de entorno (.env).</p>
        </CardContent>
      </Card>
    </div>
  );
}
