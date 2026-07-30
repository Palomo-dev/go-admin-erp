'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { Save, TestTube, Loader2, ArrowLeft, ShieldCheck, FileText, Info, Download, Edit, Check } from 'lucide-react';
import Link from 'next/link';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useElectronicInvoicePreference } from '@/lib/hooks/useElectronicInvoicePreference';
import { electronicInvoicingConfigService } from '@/lib/services/electronicInvoicingConfigService';
import { Zap, Loader2 as Loader2Icon } from 'lucide-react';

export default function ConfiguracionFacturacionElectronicaPage() {
  const { toast } = useToast();
  const orgId = getOrganizationId();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [savingRange, setSavingRange] = useState(false);
  const [fetchingRanges, setFetchingRanges] = useState(false);
  const [factusRanges, setFactusRanges] = useState<any[]>([]);
  const [savedRanges, setSavedRanges] = useState<any[]>([]);
  const [editingRangeId, setEditingRangeId] = useState<number | null>(null);
  const [municipalities, setMunicipalities] = useState<{id: string, name: string, code: string}[]>([]);
  const { alwaysEnabled: eInvoiceAlwaysEnabled, savePreference: saveEInvoicePreference, loading: loadingEInvoicePref } = useElectronicInvoicePreference();
  const [savingEInvoiceToggle, setSavingEInvoiceToggle] = useState(false);

  const DOCUMENT_TYPE_MAP: Record<string, string> = {
    'Factura de Venta': 'invoice',
    'Nota Crédito': 'credit_note',
    'Nota Débito': 'debit_note',
    'Nota de Ajuste Documento Soporte': 'adjustment_note',
    'Documento Soporte': 'support_document',
  };

  const DOCUMENT_TYPE_LABELS: Record<string, string> = {
    'invoice': 'Factura de Venta',
    'credit_note': 'Nota Crédito',
    'debit_note': 'Nota Débito',
    'adjustment_note': 'Nota de Ajuste',
    'support_document': 'Documento Soporte',
  };

  const [range, setRange] = useState({
    id: null as number | null,
    documentType: 'invoice' as string,
    prefix: 'FE',
    rangeStart: 1,
    rangeEnd: 1000,
    currentNumber: 1,
    resolutionNumber: '',
    resolutionDate: '',
    validFrom: '',
    validUntil: '',
    technicalKey: '',
    testSetId: '',
    factusNumberingRangeId: '' as string | number,
    isActive: true,
  });

  const [config, setConfig] = useState({
    provider: 'factus',
    environment: 'sandbox' as 'sandbox' | 'production',
    clientId: '',
    clientSecret: '',
    username: '',
    password: '',
    isActive: true,
  });

  useEffect(() => {
    async function loadConfig() {
      if (!orgId) return;
      const existing = await electronicInvoicingConfigService.getConfig(orgId);
      if (existing) {
        setConfig({
          provider: existing.provider,
          environment: existing.environment,
          clientId: existing.client_id || '',
          clientSecret: existing.client_secret || '',
          username: existing.username || '',
          password: existing.password || '',
          isActive: existing.is_active,
        });
      }

      const { supabase } = await import('@/lib/supabase/config');
      const { data: seqs } = await supabase
        .from('invoice_sequences')
        .select('*')
        .eq('organization_id', orgId)
        .order('document_type');

      if (seqs && seqs.length > 0) {
        setSavedRanges(seqs);
        const invoiceSeq = seqs.find(s => s.document_type === 'invoice') || seqs[0];
        setRange({
          id: invoiceSeq.id,
          documentType: invoiceSeq.document_type || 'invoice',
          prefix: invoiceSeq.prefix || 'FE',
          rangeStart: invoiceSeq.range_start || 1,
          rangeEnd: invoiceSeq.range_end || 1000,
          currentNumber: invoiceSeq.current_number || 1,
          resolutionNumber: invoiceSeq.resolution_number || '',
          resolutionDate: invoiceSeq.resolution_date || '',
          validFrom: invoiceSeq.valid_from || '',
          validUntil: invoiceSeq.valid_until || '',
          technicalKey: invoiceSeq.technical_key || '',
          testSetId: invoiceSeq.test_set_id || '',
          factusNumberingRangeId: invoiceSeq.factus_numbering_range_id || '',
          isActive: invoiceSeq.is_active,
        });
      }

      const { data: munis } = await supabase
        .from('municipalities')
        .select('id, name, code')
        .order('name')
        .limit(200);
      if (munis) setMunicipalities(munis);

      setLoading(false);
    }
    loadConfig();
  }, [orgId]);

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);
    const result = await electronicInvoicingConfigService.saveConfig({
      organization_id: orgId,
      provider: config.provider,
      environment: config.environment,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      username: config.username,
      password: config.password,
      is_active: config.isActive,
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
    toast({
      title: result.success ? 'Conexión exitosa' : 'Error de conexión',
      description: result.message,
      variant: result.success ? 'default' : 'destructive',
    });
  };

  const handleFetchRanges = async () => {
    setFetchingRanges(true);
    try {
      const res = await fetch('/api/factus/numbering-ranges');
      const json = await res.json();
      if (json.success && json.data) {
        const ranges = json.data;
        setFactusRanges(ranges);
        if (ranges.length === 0) {
          toast({ title: 'Sin rangos', description: 'No hay rangos de numeración configurados en Factus.', variant: 'destructive' });
        } else {
          // Guardar todos los rangos en BD automáticamente
          const { supabase } = await import('@/lib/supabase/config');
          const branchId = typeof window !== 'undefined' ? parseInt(localStorage.getItem('currentBranchId') || '2', 10) : 2;
          let saved = 0;
          let updated = 0;

          for (const fr of ranges) {
            const docType = DOCUMENT_TYPE_MAP[fr.document] || 'invoice';
            const data = {
              organization_id: orgId,
              branch_id: branchId,
              document_type: docType,
              prefix: fr.prefix || '',
              range_start: fr.from || 0,
              range_end: fr.to || 0,
              current_number: fr.current || 0,
              resolution_number: fr.resolution_number || null,
              resolution_date: fr.start_date || null,
              valid_from: fr.start_date || null,
              valid_until: fr.end_date || null,
              technical_key: fr.technical_key || null,
              factus_numbering_range_id: fr.id,
              is_active: !fr.is_expired,
              updated_at: new Date().toISOString(),
            };

            // Upsert por factus_numbering_range_id + organization_id
            const { data: existing } = await supabase
              .from('invoice_sequences')
              .select('id')
              .eq('organization_id', orgId)
              .eq('factus_numbering_range_id', fr.id)
              .maybeSingle();

            if (existing) {
              await supabase.from('invoice_sequences').update(data).eq('id', existing.id);
              updated++;
            } else {
              await supabase.from('invoice_sequences').insert({ ...data, created_at: new Date().toISOString() });
              saved++;
            }
          }

          // Recargar rangos guardados
          const { data: allSeqs } = await supabase
            .from('invoice_sequences')
            .select('*')
            .eq('organization_id', orgId)
            .order('document_type');
          if (allSeqs) setSavedRanges(allSeqs);

          toast({ title: 'Rangos sincronizados', description: `${saved} nuevo(s), ${updated} actualizado(s). Total: ${ranges.length} rangos.` });
        }
      } else {
        toast({ title: 'Error', description: json.error || 'No se pudieron obtener los rangos.', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setFetchingRanges(false);
  };

  const handleEditRange = (seq: any) => {
    setEditingRangeId(seq.id);
    setRange({
      id: seq.id,
      documentType: seq.document_type || 'invoice',
      prefix: seq.prefix || '',
      rangeStart: seq.range_start || 0,
      rangeEnd: seq.range_end || 0,
      currentNumber: seq.current_number || 0,
      resolutionNumber: seq.resolution_number || '',
      resolutionDate: seq.resolution_date || '',
      validFrom: seq.valid_from || '',
      validUntil: seq.valid_until || '',
      technicalKey: seq.technical_key || '',
      testSetId: seq.test_set_id || '',
      factusNumberingRangeId: seq.factus_numbering_range_id || '',
      isActive: seq.is_active,
    });
  };

  const handleSaveRange = async () => {
    if (!orgId) return;
    setSavingRange(true);
    const { supabase } = await import('@/lib/supabase/config');
    const branchId = typeof window !== 'undefined' ? parseInt(localStorage.getItem('currentBranchId') || '2', 10) : 2;

    const data = {
      organization_id: orgId,
      branch_id: branchId,
      document_type: range.documentType,
      prefix: range.prefix,
      range_start: Number(range.rangeStart),
      range_end: Number(range.rangeEnd),
      current_number: Number(range.currentNumber),
      resolution_number: range.resolutionNumber || null,
      resolution_date: range.resolutionDate || null,
      valid_from: range.validFrom || null,
      valid_until: range.validUntil || null,
      technical_key: range.technicalKey || null,
      test_set_id: range.testSetId || null,
      factus_numbering_range_id: range.factusNumberingRangeId ? Number(range.factusNumberingRangeId) : null,
      is_active: range.isActive,
      updated_at: new Date().toISOString(),
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
      toast({ title: 'Rango guardado', description: `Rango ${range.prefix} (${DOCUMENT_TYPE_LABELS[range.documentType] || range.documentType}) guardado correctamente.` });
      setEditingRangeId(null);
      // Recargar rangos
      const { data: allSeqs } = await supabase
        .from('invoice_sequences')
        .select('*')
        .eq('organization_id', orgId)
        .order('document_type');
      if (allSeqs) setSavedRanges(allSeqs);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-2xl">
      <div className="mb-6">
        <Link href="/app/finanzas/facturacion-electronica" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-2">
          <ArrowLeft className="h-4 w-4" />
          Volver a facturación electrónica
        </Link>
        <h1 className="text-2xl font-bold">Configuración de Facturación Electrónica</h1>
        <p className="text-sm text-gray-500 mt-1">Configure las credenciales de Factus para enviar facturas a DIAN.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-500" />
            Credenciales de Factus
          </CardTitle>
          <CardDescription>
            Las credenciales se obtienen desde el panel de Factus. Use el ambiente sandbox para pruebas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="environment">Ambiente</Label>
              <Select
                value={config.environment}
                onValueChange={(v) => setConfig({ ...config, environment: v as 'sandbox' | 'production' })}
              >
                <SelectTrigger id="environment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Sandbox (Pruebas)</SelectItem>
                  <SelectItem value="production">Producción</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="provider">Proveedor</Label>
              <Select
                value={config.provider}
                onValueChange={(v) => setConfig({ ...config, provider: v })}
              >
                <SelectTrigger id="provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="factus">Factus</SelectItem>
                  <SelectItem value="carvajal">Carvajal</SelectItem>
                  <SelectItem value="siigo">Siigo</SelectItem>
                  <SelectItem value="alegra">Alegra</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="clientId">Client ID</Label>
            <Input
              id="clientId"
              value={config.clientId}
              onChange={(e) => setConfig({ ...config, clientId: e.target.value })}
              placeholder="Ej: a2443431-24c0-4e4b-8289-dd7913d7d5a0"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="clientSecret">Client Secret</Label>
            <Input
              id="clientSecret"
              type="password"
              value={config.clientSecret}
              onChange={(e) => setConfig({ ...config, clientSecret: e.target.value })}
              placeholder="Client Secret de Factus"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">Usuario / Email</Label>
            <Input
              id="username"
              value={config.username}
              onChange={(e) => setConfig({ ...config, username: e.target.value })}
              placeholder="Ej: sandboxv2@factus.com.co"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              value={config.password}
              onChange={(e) => setConfig({ ...config, password: e.target.value })}
              placeholder="Contraseña de Factus"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Switch
              checked={config.isActive}
              onCheckedChange={(checked) => setConfig({ ...config, isActive: checked })}
            />
            <Label className="text-sm">Configuración activa</Label>
          </div>

          {/* Toggle Global: Facturar siempre como electrónica */}
          <div className="flex items-center justify-between gap-3 pt-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-blue-600 flex-shrink-0" />
              <div>
                <Label className="text-sm font-medium">Facturar siempre como electrónica</Label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Activa automáticamente el toggle de factura electrónica en POS, pre-cuenta y nuevas facturas</p>
              </div>
            </div>
            <Switch
              checked={eInvoiceAlwaysEnabled}
              disabled={savingEInvoiceToggle || loadingEInvoicePref}
              onCheckedChange={async (checked) => {
                setSavingEInvoiceToggle(true);
                const result = await saveEInvoicePreference(checked);
                setSavingEInvoiceToggle(false);
                toast({
                  title: result.success ? 'Preferencia guardada' : 'Error',
                  description: result.success
                    ? checked
                      ? 'Factura electrónica activada globalmente'
                      : 'Factura electrónica desactivada globalmente'
                    : result.error || 'No se pudo guardar',
                  variant: result.success ? 'default' : 'destructive',
                });
              }}
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Guardar
            </Button>
            <Button onClick={handleTest} disabled={testing} variant="outline" className="flex-1">
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <TestTube className="h-4 w-4 mr-2" />}
              Probar conexión
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            Rangos de Numeración DIAN
          </CardTitle>
          <CardDescription>
            Rangos de numeración para facturas, notas crédito, notas débito y documentos soporte.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Botón obtener rangos de Factus */}
          <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <Download className="h-5 w-5 text-blue-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900">Sincronizar rangos desde Factus</p>
              <p className="text-xs text-blue-700">Consulta la API de Factus y guarda automáticamente todos los rangos (facturas, notas crédito, débito, etc.).</p>
            </div>
            <Button onClick={handleFetchRanges} disabled={fetchingRanges} variant="outline" size="sm">
              {fetchingRanges ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Sincronizar
            </Button>
          </div>

          {/* Lista de rangos guardados */}
          {savedRanges.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Rangos configurados ({savedRanges.length}):</Label>
              <div className="space-y-2">
                {savedRanges.map((seq) => (
                  <div
                    key={seq.id}
                    className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${editingRangeId === seq.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded flex-shrink-0 ${seq.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {seq.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {seq.prefix} - {DOCUMENT_TYPE_LABELS[seq.document_type] || seq.document_type}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          ID Factus: {seq.factus_numbering_range_id} | Res: {seq.resolution_number || 'N/A'} | {seq.range_start || '?'} - {seq.range_end || '?'} | Actual: {seq.current_number}
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={() => handleEditRange(seq)}
                      variant="ghost"
                      size="sm"
                      className="flex-shrink-0 ml-2"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Formulario de edición (solo visible cuando se edita un rango) */}
          {editingRangeId !== null && (
            <div className="border border-blue-200 rounded-lg p-4 space-y-4 bg-blue-50/30">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Edit className="h-4 w-4 text-blue-500" />
                  Editando: {range.prefix} - {DOCUMENT_TYPE_LABELS[range.documentType] || range.documentType}
                </h4>
                <Button onClick={() => setEditingRangeId(null)} variant="ghost" size="sm">
                  Cancelar
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="prefix" className="flex items-center gap-1.5">
                    Prefijo
                    <span className="relative group">
                      <Info className="h-3.5 w-3.5 text-gray-400 cursor-help" />
                      <span className="absolute left-0 top-6 z-50 hidden group-hover:block w-64 p-2 bg-gray-900 text-white text-xs rounded-md shadow-lg">
                        <strong>Prefijo del rango de numeración</strong><br/>
                        Prefijo alfanumérico de máximo 4 caracteres que identifica el rango. Ej: FE, FV, SETP.<br/>
                        <strong>Cómo se obtiene:</strong> Lo define la DIAN en la resolución o se asigna al crear el rango en Factus.<br/>
                        <strong>Para qué sirve:</strong> Se antepone al consecutivo de cada factura (ej: FE-0001).
                      </span>
                    </span>
                  </Label>
                  <Input
                    id="prefix"
                    value={range.prefix}
                    onChange={(e) => setRange({ ...range, prefix: e.target.value })}
                    placeholder="Ej: FE"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="factusRangeId" className="flex items-center gap-1.5">
                    ID de Rango en Factus
                    <span className="relative group">
                      <Info className="h-3.5 w-3.5 text-gray-400 cursor-help" />
                      <span className="absolute left-0 top-6 z-50 hidden group-hover:block w-64 p-2 bg-gray-900 text-white text-xs rounded-md shadow-lg">
                        <strong>ID numérico del rango en Factus</strong><br/>
                        Es el identificador único que devuelve Factus al crear o listar rangos de numeración.<br/>
                        <strong>Cómo se obtiene:</strong> Consultando el endpoint GET /v2/numbering-ranges de la API de Factus, o al crear un rango con POST /v2/numbering-ranges.<br/>
                        <strong>Para qué sirve:</strong> Al enviar una factura a Factus, este ID le indica qué rango usar para asignar el consecutivo.
                      </span>
                    </span>
                  </Label>
                  <Input
                    id="factusRangeId"
                    type="number"
                    value={range.factusNumberingRangeId?.toString() || ''}
                    onChange={(e) => setRange({ ...range, factusNumberingRangeId: e.target.value })}
                    placeholder="Ej: 1 (obtenido de Factus)"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rangeStart">Desde</Label>
                  <Input
                    id="rangeStart"
                    type="number"
                    value={range.rangeStart}
                    onChange={(e) => setRange({ ...range, rangeStart: Number(e.target.value) })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rangeEnd">Hasta</Label>
                  <Input
                    id="rangeEnd"
                    type="number"
                    value={range.rangeEnd}
                    onChange={(e) => setRange({ ...range, rangeEnd: Number(e.target.value) })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="currentNumber">Número Actual</Label>
                  <Input
                    id="currentNumber"
                    type="number"
                    value={range.currentNumber}
                    onChange={(e) => setRange({ ...range, currentNumber: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="resolutionNumber" className="flex items-center gap-1.5">
                    Número de Resolución DIAN
                    <span className="relative group">
                      <Info className="h-3.5 w-3.5 text-gray-400 cursor-help" />
                      <span className="absolute left-0 top-6 z-50 hidden group-hover:block w-64 p-2 bg-gray-900 text-white text-xs rounded-md shadow-lg">
                        <strong>Número de Resolución DIAN</strong><br/>
                        Es el número del documento (Formato 1876) que la DIAN te entrega al autorizar tu rango de facturación.<br/><br/>
                        <strong>Cómo se obtiene - Paso a paso:</strong><br/>
                        1. Entra a www.dian.gov.co → sección "Transaccional" → "Usuario Registrado"<br/>
                        2. Ingresa al sistema MUISCA con tu usuario y contraseña<br/>
                        3. En el menú principal busca "Numeración de Facturación"<br/>
                        4. Selecciona "Solicitar Numeración de Facturación"<br/>
                        5. Verifica tu RUT (nombre, dirección, responsabilidad para facturar)<br/>
                        6. Selecciona "Autorizar Rango"<br/>
                        7. Diligencia: prefijo (ej: FE), tipo de facturación (Factura electrónica), rango desde/hasta<br/>
                        8. Al confirmar, la DIAN genera el Formato 1876 con el número de resolución<br/>
                        9. Ese número (ej: 18764000000000) es el que pones en este campo
                      </span>
                    </span>
                  </Label>
                  <Input
                    id="resolutionNumber"
                    value={range.resolutionNumber}
                    onChange={(e) => setRange({ ...range, resolutionNumber: e.target.value })}
                    placeholder="Ej: 18764000000000"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="resolutionDate">Fecha de Resolución</Label>
                  <Input
                    id="resolutionDate"
                    type="date"
                    value={range.resolutionDate}
                    onChange={(e) => setRange({ ...range, resolutionDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="validFrom">Válido Desde</Label>
                  <Input
                    id="validFrom"
                    type="date"
                    value={range.validFrom}
                    onChange={(e) => setRange({ ...range, validFrom: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="validUntil">Válido Hasta</Label>
                  <Input
                    id="validUntil"
                    type="date"
                    value={range.validUntil}
                    onChange={(e) => setRange({ ...range, validUntil: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="technicalKey" className="flex items-center gap-1.5">
                    Clave Técnica
                    <span className="relative group">
                      <Info className="h-3.5 w-3.5 text-gray-400 cursor-help" />
                      <span className="absolute left-0 top-6 z-50 hidden group-hover:block w-64 p-2 bg-gray-900 text-white text-xs rounded-md shadow-lg">
                        <strong>Clave Técnica</strong><br/>
                        Es una clave alfanumérica que la DIAN asocia al rango para validar la autenticidad de los documentos.<br/><br/>
                        <strong>Cómo se obtiene - 2 formas:</strong><br/><br/>
                        1. <strong>Automáticamente vía Factus (la más fácil):</strong> Al crear el rango en Factus con POST /v2/numbering-ranges, enviando solo document, prefix, resolution_number y current, Factus le pide la clave técnica a la DIAN automáticamente y la devuelve en el campo technical_key de la respuesta. No tienes que hacer nada manual.<br/><br/>
                        2. <strong>Manualmente desde la DIAN:</strong> En el portal de habilitación de factura electrónica, al configurar tu software y asociar los prefijos, la DIAN muestra la clave técnica asociada a cada rango.
                      </span>
                    </span>
                  </Label>
                  <Input
                    id="technicalKey"
                    value={range.technicalKey}
                    onChange={(e) => setRange({ ...range, technicalKey: e.target.value })}
                    placeholder="Clave técnica DIAN"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="testSetId" className="flex items-center gap-1.5">
                    Test Set ID
                    <span className="relative group">
                      <Info className="h-3.5 w-3.5 text-gray-400 cursor-help" />
                      <span className="absolute left-0 top-6 z-50 hidden group-hover:block w-64 p-2 bg-gray-900 text-white text-xs rounded-md shadow-lg">
                        <strong>ID del Set de Pruebas de la DIAN</strong><br/>
                        Es un código único que entrega la DIAN para enviar documentos de prueba antes de facturar oficialmente.<br/>
                        <strong>Cómo se obtiene:</strong> En el portal de la DIAN durante el proceso de habilitación de facturación electrónica, en la sección de set de pruebas.<br/>
                        <strong>Para qué sirve:</strong> Solo se usa en ambiente de pruebas (sandbox). Permite validar que el sistema genera documentos XML válidos antes de salir a producción.
                      </span>
                    </span>
                  </Label>
                  <Input
                    id="testSetId"
                    value={range.testSetId}
                    onChange={(e) => setRange({ ...range, testSetId: e.target.value })}
                    placeholder="ID de set de pruebas DIAN"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Switch
                  checked={range.isActive}
                  onCheckedChange={(checked) => setRange({ ...range, isActive: checked })}
                />
                <Label className="text-sm">Rango activo</Label>
              </div>

              <div className="pt-4">
                <Button onClick={handleSaveRange} disabled={savingRange} className="w-full sm:w-auto">
                  {savingRange ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Guardar cambios
                </Button>
              </div>
            </div>
          )}

          {savedRanges.length === 0 && editingRangeId === null && (
            <div className="text-center py-8 text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No hay rangos configurados.</p>
              <p className="text-xs">Presiona "Sincronizar" para obtener los rangos desde Factus automáticamente.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
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
