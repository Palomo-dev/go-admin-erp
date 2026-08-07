'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Download, Loader2, FileText, Edit } from 'lucide-react';
import { RangoEditForm } from './RangoEditForm';

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

interface RangosDianSectionProps {
  savedRanges: Record<string, unknown>[];
  editingRangeId: number | null;
  range: RangoData;
  fetchingRanges: boolean;
  savingRange: boolean;
  documentTypeLabels: Record<string, string>;
  onFetchRanges: () => void;
  onEditRange: (seq: Record<string, unknown>) => void;
  onRangeChange: (range: RangoData) => void;
  onSaveRange: () => void;
  onCancelEdit: () => void;
}

export function RangosDianSection({
  savedRanges,
  editingRangeId,
  range,
  fetchingRanges,
  savingRange,
  documentTypeLabels,
  onFetchRanges,
  onEditRange,
  onRangeChange,
  onSaveRange,
  onCancelEdit,
}: RangosDianSectionProps) {
  return (
    <Card>
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
        <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <Download className="h-5 w-5 text-blue-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-900">Sincronizar rangos desde Factus</p>
            <p className="text-xs text-blue-700">Consulta la API de Factus y guarda automáticamente todos los rangos.</p>
          </div>
          <Button onClick={onFetchRanges} disabled={fetchingRanges} variant="outline" size="sm">
            {fetchingRanges ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Sincronizar
          </Button>
        </div>

        {savedRanges.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Rangos configurados ({savedRanges.length}):</Label>
            <div className="space-y-2">
              {savedRanges.map((seq: Record<string, unknown>) => (
                <div
                  key={seq.id as number}
                  className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${editingRangeId === seq.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded flex-shrink-0 ${seq.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {seq.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {seq.prefix as string} - {documentTypeLabels[seq.document_type as string] || seq.document_type as string}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        ID Factus: {seq.factus_numbering_range_id} | Res: {seq.resolution_number || 'N/A'} | {seq.range_start || '?'} - {seq.range_end || '?'} | Actual: {seq.current_number}
                      </p>
                    </div>
                  </div>
                  <Button onClick={() => onEditRange(seq)} variant="ghost" size="sm" className="flex-shrink-0 ml-2">
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {editingRangeId !== null && (
          <RangoEditForm
            range={range}
            onRangeChange={onRangeChange}
            onSave={onSaveRange}
            onCancel={onCancelEdit}
            saving={savingRange}
            documentTypeLabels={documentTypeLabels}
          />
        )}

        {savedRanges.length === 0 && editingRangeId === null && (
          <div className="text-center py-8 text-gray-500">
            <FileText className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No hay rangos configurados.</p>
            <p className="text-xs">Presiona &quot;Sincronizar&quot; para obtener los rangos desde Factus automáticamente.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
