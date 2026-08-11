'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Save, Loader2, Edit, Info } from 'lucide-react';

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

interface RangoEditFormProps {
  range: RangoData;
  onRangeChange: (range: RangoData) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  documentTypeLabels: Record<string, string>;
}

export function RangoEditForm({
  range,
  onRangeChange,
  onSave,
  onCancel,
  saving,
  documentTypeLabels,
}: RangoEditFormProps) {
  return (
    <div className="border border-blue-200 rounded-lg p-4 space-y-4 bg-blue-50/30 dark:border-blue-900/50 dark:bg-blue-950/20">
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
        <h4 className="text-sm font-medium flex flex-wrap items-center gap-2 min-w-0">
          <Edit className="h-4 w-4 text-blue-500 shrink-0" />
          <span className="break-words">Editando: {range.prefix} - {documentTypeLabels[range.documentType] || range.documentType}</span>
        </h4>
        <Button onClick={onCancel} variant="ghost" size="sm">Cancelar</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2 min-w-0">
          <Label htmlFor="prefix" className="flex items-center gap-1.5">
            Prefijo
            <span className="relative group">
              <Info className="h-3.5 w-3.5 text-gray-400 cursor-help" />
              <span className="absolute left-0 top-6 z-50 hidden group-hover:block w-64 p-2 bg-gray-900 text-white text-xs rounded-md shadow-lg">
                <strong>Prefijo del rango de numeración</strong><br />
                Prefijo alfanumérico de máximo 4 caracteres que identifica el rango. Ej: FE, FV, SETP.
              </span>
            </span>
          </Label>
          <Input id="prefix" value={range.prefix} onChange={(e) => onRangeChange({ ...range, prefix: e.target.value })} placeholder="Ej: FE" />
        </div>
        <div className="space-y-2 min-w-0">
          <Label htmlFor="factusRangeId" className="flex items-center gap-1.5">
            ID de Rango en Factus
            <span className="relative group">
              <Info className="h-3.5 w-3.5 text-gray-400 cursor-help" />
              <span className="absolute left-0 top-6 z-50 hidden group-hover:block w-64 p-2 bg-gray-900 text-white text-xs rounded-md shadow-lg">
                <strong>ID numérico del rango en Factus</strong><br />
                Identificador único que devuelve Factus al crear o listar rangos de numeración.
              </span>
            </span>
          </Label>
          <Input id="factusRangeId" type="number" value={range.factusNumberingRangeId?.toString() || ''} onChange={(e) => onRangeChange({ ...range, factusNumberingRangeId: e.target.value })} placeholder="Ej: 1 (obtenido de Factus)" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2 min-w-0">
          <Label htmlFor="rangeStart">Desde</Label>
          <Input id="rangeStart" type="number" value={range.rangeStart} onChange={(e) => onRangeChange({ ...range, rangeStart: Number(e.target.value) })} />
        </div>
        <div className="space-y-2 min-w-0">
          <Label htmlFor="rangeEnd">Hasta</Label>
          <Input id="rangeEnd" type="number" value={range.rangeEnd} onChange={(e) => onRangeChange({ ...range, rangeEnd: Number(e.target.value) })} />
        </div>
        <div className="space-y-2 min-w-0">
          <Label htmlFor="currentNumber">Número Actual</Label>
          <Input id="currentNumber" type="number" value={range.currentNumber} onChange={(e) => onRangeChange({ ...range, currentNumber: Number(e.target.value) })} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2 min-w-0">
          <Label htmlFor="resolutionNumber">Número de Resolución DIAN</Label>
          <Input id="resolutionNumber" value={range.resolutionNumber} onChange={(e) => onRangeChange({ ...range, resolutionNumber: e.target.value })} placeholder="Ej: 18764000000000" />
        </div>
        <div className="space-y-2 min-w-0">
          <Label htmlFor="resolutionDate">Fecha de Resolución</Label>
          <Input id="resolutionDate" type="date" value={range.resolutionDate} onChange={(e) => onRangeChange({ ...range, resolutionDate: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2 min-w-0">
          <Label htmlFor="validFrom">Válido Desde</Label>
          <Input id="validFrom" type="date" value={range.validFrom} onChange={(e) => onRangeChange({ ...range, validFrom: e.target.value })} />
        </div>
        <div className="space-y-2 min-w-0">
          <Label htmlFor="validUntil">Válido Hasta</Label>
          <Input id="validUntil" type="date" value={range.validUntil} onChange={(e) => onRangeChange({ ...range, validUntil: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2 min-w-0">
          <Label htmlFor="technicalKey">Clave Técnica</Label>
          <Input id="technicalKey" value={range.technicalKey} onChange={(e) => onRangeChange({ ...range, technicalKey: e.target.value })} placeholder="Clave técnica DIAN" />
        </div>
        <div className="space-y-2 min-w-0">
          <Label htmlFor="testSetId">Test Set ID</Label>
          <Input id="testSetId" value={range.testSetId} onChange={(e) => onRangeChange({ ...range, testSetId: e.target.value })} placeholder="ID de set de pruebas DIAN" />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Switch checked={range.isActive} onCheckedChange={(checked) => onRangeChange({ ...range, isActive: checked })} />
        <Label className="text-sm">Rango activo</Label>
      </div>

      <div className="pt-4">
        <Button onClick={onSave} disabled={saving} className="w-full sm:w-auto">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Guardar cambios
        </Button>
      </div>
    </div>
  );
}
