'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, PlusCircle, Trash2, Upload, FileText } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { opportunitiesService } from '@/components/crm/oportunidades/opportunitiesService';
import type { Pipeline, Stage } from '@/components/crm/oportunidades/types';

interface BulkCreateOpportunitiesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  pipelineId?: string;
  onSuccess?: () => void;
}

interface BulkRow {
  name: string;
  amount: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
}

export default function BulkCreateOpportunitiesDialog({
  isOpen,
  onClose,
  pipelineId,
  onSuccess,
}: BulkCreateOpportunitiesDialogProps) {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState(pipelineId || '');
  const [selectedStageId, setSelectedStageId] = useState('');
  const [currency, setCurrency] = useState('COP');
  const [rows, setRows] = useState<BulkRow[]>([
    { name: '', amount: '', customerName: '', customerEmail: '', customerPhone: '' },
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadData();
      setSelectedPipelineId(pipelineId || '');
    }
  }, [isOpen, pipelineId]);

  useEffect(() => {
    if (selectedPipelineId) {
      loadStages(selectedPipelineId);
    }
  }, [selectedPipelineId]);

  const loadData = async () => {
    setIsLoadingData(true);
    try {
      const data = await opportunitiesService.getPipelines();
      setPipelines(data);
      if (data.length > 0 && !selectedPipelineId) {
        const defaultP = data.find((p) => p.is_default) || data[0];
        setSelectedPipelineId(defaultP.id);
      }
    } catch {
      // silencioso
    } finally {
      setIsLoadingData(false);
    }
  };

  const loadStages = async (pid: string) => {
    try {
      const data = await opportunitiesService.getStages(pid);
      setStages(data);
      if (data.length > 0) {
        const first = data.sort((a, b) => a.position - b.position)[0];
        setSelectedStageId(first.id);
      }
    } catch {
      // silencioso
    }
  };

  const addRow = () => {
    setRows([...rows, { name: '', amount: '', customerName: '', customerEmail: '', customerPhone: '' }]);
  };

  const removeRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof BulkRow, value: string) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: value };
    setRows(updated);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length > 1) {
      e.preventDefault();
      const pastedRows: BulkRow[] = lines.map((line) => {
        const cols = line.split('\t');
        return {
          name: cols[0]?.trim() || '',
          amount: cols[1]?.trim() || '',
          customerName: cols[2]?.trim() || '',
          customerEmail: cols[3]?.trim() || '',
          customerPhone: cols[4]?.trim() || '',
        };
      });
      setRows(pastedRows);
    }
  };

  const validRows = rows.filter((r) => r.name.trim());

  const handleCreate = async () => {
    if (!selectedPipelineId || !selectedStageId) {
      toast({ title: 'Error', description: 'Selecciona pipeline y etapa', variant: 'destructive' });
      return;
    }
    if (validRows.length === 0) {
      toast({ title: 'Error', description: 'Agrega al menos una oportunidad con nombre', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    let created = 0;
    let failed = 0;

    try {
      for (const row of validRows) {
        try {
          let customerId: string | undefined;

          // Crear cliente si hay nombre de cliente
          if (row.customerName.trim()) {
            const { supabase } = await import('@/lib/supabase/config');
            const { getOrganizationId } = await import('@/lib/hooks/useOrganization');
            const { data: existing } = await supabase
              .from('customers')
              .select('id')
              .eq('organization_id', getOrganizationId())
              .ilike('full_name', row.customerName.trim())
              .limit(1);

            if (existing && existing.length > 0) {
              customerId = existing[0].id;
            } else {
              const { data: newCustomer } = await supabase
                .from('customers')
                .insert({
                  organization_id: getOrganizationId(),
                  full_name: row.customerName.trim(),
                  email: row.customerEmail.trim() || null,
                  phone: row.customerPhone.trim() || null,
                })
                .select('id')
                .single();
              if (newCustomer) customerId = newCustomer.id;
            }
          }

          await opportunitiesService.createOpportunity({
            pipeline_id: selectedPipelineId,
            stage_id: selectedStageId,
            customer_id: customerId,
            name: row.name.trim(),
            amount: parseFloat(row.amount) || 0,
            currency,
          });
          created++;
        } catch {
          failed++;
        }
      }

      if (created > 0) {
        toast({
          title: 'Oportunidades creadas',
          description: `${created} creadas${failed > 0 ? `, ${failed} fallidas` : ''}`,
        });
      }
      if (failed > 0 && created === 0) {
        toast({ title: 'Error', description: `No se pudieron crear ${failed} oportunidades`, variant: 'destructive' });
      }

      if (created > 0) {
        onSuccess?.();
        onClose();
        setRows([{ name: '', amount: '', customerName: '', customerEmail: '', customerPhone: '' }]);
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Error inesperado', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    onClose();
    setRows([{ name: '', amount: '', customerName: '', customerEmail: '', customerPhone: '' }]);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-3xl w-[92vw] max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 p-0">
        <DialogHeader className="p-5 pb-3 border-b border-gray-200 dark:border-gray-700">
          <DialogTitle className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Upload className="h-5 w-5 text-blue-600" />
            Crear Oportunidades Masivas
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500 dark:text-gray-400">
            Crea múltiples oportunidades a la vez. Pega desde Excel/Sheets (tabulado) o agrega filas manualmente.
          </DialogDescription>
        </DialogHeader>

        <div className="p-5 space-y-4">
          {/* Configuracion general */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-sm text-gray-700 dark:text-gray-300 mb-1.5 block">Pipeline *</Label>
              <Select value={selectedPipelineId} onValueChange={(v) => { setSelectedPipelineId(v); setSelectedStageId(''); }}>
                <SelectTrigger className="bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {pipelines.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm text-gray-700 dark:text-gray-300 mb-1.5 block">Etapa inicial *</Label>
              <Select value={selectedStageId} onValueChange={setSelectedStageId}>
                <SelectTrigger className="bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({Math.round(Number(s.probability) * 100)}%)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm text-gray-700 dark:text-gray-300 mb-1.5 block">Moneda</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COP">COP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tabla de oportunidades */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="grid grid-cols-[1fr_100px_1fr_1fr_1fr_40px] gap-2 p-2 bg-gray-50 dark:bg-gray-800 text-xs font-medium text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <div>Nombre *</div>
              <div>Monto</div>
              <div>Cliente</div>
              <div>Email</div>
              <div>Teléfono</div>
              <div></div>
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              {rows.map((row, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[1fr_100px_1fr_1fr_1fr_40px] gap-2 p-2 border-b border-gray-100 dark:border-gray-800 items-center"
                >
                  <Input
                    value={row.name}
                    onChange={(e) => updateRow(index, 'name', e.target.value)}
                    onPaste={handlePaste}
                    placeholder="Nombre oportunidad"
                    className="h-8 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700"
                  />
                  <Input
                    type="number"
                    value={row.amount}
                    onChange={(e) => updateRow(index, 'amount', e.target.value)}
                    placeholder="0"
                    className="h-8 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700"
                  />
                  <Input
                    value={row.customerName}
                    onChange={(e) => updateRow(index, 'customerName', e.target.value)}
                    placeholder="Nombre cliente"
                    className="h-8 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700"
                  />
                  <Input
                    value={row.customerEmail}
                    onChange={(e) => updateRow(index, 'customerEmail', e.target.value)}
                    placeholder="email@..."
                    className="h-8 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700"
                  />
                  <Input
                    value={row.customerPhone}
                    onChange={(e) => updateRow(index, 'customerPhone', e.target.value)}
                    placeholder="Teléfono"
                    className="h-8 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRow(index)}
                    disabled={rows.length === 1}
                    className="h-8 w-8 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <button
              onClick={addRow}
              className="w-full p-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center justify-center gap-1.5 font-medium"
            >
              <PlusCircle className="h-4 w-4" />
              Agregar fila
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <FileText className="h-3.5 w-3.5" />
            <span>Tip: pega datos desde Excel (Ctrl+V) en la primera fila — se expanden automáticamente. Columnas: Nombre, Monto, Cliente, Email, Teléfono.</span>
          </div>

          <div className="text-sm text-gray-600 dark:text-gray-400">
            <strong>{validRows.length}</strong> oportunidad(es) válida(s) para crear
          </div>
        </div>

        <div className="flex justify-end gap-3 p-5 pt-3 border-t border-gray-200 dark:border-gray-700">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isSaving}
            className="border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleCreate}
            disabled={isSaving || validRows.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSaving ? 'Creando...' : `Crear ${validRows.length} oportunidad(es)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
