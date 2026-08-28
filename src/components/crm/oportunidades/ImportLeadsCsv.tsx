'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Upload,
  Download,
  Loader2,
  CheckCircle,
  XCircle,
  FileSpreadsheet,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

interface ImportLeadsCsvProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /** Pipeline por defecto para las oportunidades creadas (opcional) */
  defaultPipelineId?: string;
  /** Etapa por defecto para las oportunidades creadas (opcional) */
  defaultStageId?: string;
}

interface LeadRow {
  name: string;
  email: string;
  phone: string;
  company: string;
  source: string;
  rowIndex: number;
}

interface ImportResult {
  total: number;
  success: number;
  errors: number;
  errorDetails: { row: number; name: string; error: string }[];
}

const TEMPLATE_CSV = `name,email,phone,company,source
Juan Perez,juan@example.com,+57 300 123 4567,Acme SA,web
Maria Lopez,maria@example.com,+57 301 987 6543,TechCo,referral`;

const HEADER_ALIASES: Record<string, string[]> = {
  name: ['nombre', 'name', 'nombre completo', 'full_name'],
  email: ['correo', 'email', 'correo electronico', 'correo electrónico'],
  phone: ['telefono', 'teléfono', 'phone', 'celular', 'movil', 'móvil'],
  company: ['empresa', 'company', 'compania', 'compañía'],
  source: ['origen', 'source', 'fuente', 'canal'],
};

const VALID_SOURCES = ['whatsapp', 'email', 'phone', 'web', 'referral', 'other'];

function normalizeHeader(header: string): string {
  const normalized = header.trim().toLowerCase();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(normalized)) return field;
  }
  return normalized;
}

function normalizeSource(source: string): string {
  const normalized = source.trim().toLowerCase();
  if (VALID_SOURCES.includes(normalized)) return normalized;
  if (normalized === '') return 'other';
  // Mapeos comunes
  if (normalized.includes('whats')) return 'whatsapp';
  if (normalized.includes('correo') || normalized.includes('mail')) return 'email';
  if (normalized.includes('telef') || normalized.includes('llamada')) return 'phone';
  if (normalized.includes('web') || normalized.includes('pagina') || normalized.includes('página')) return 'web';
  if (normalized.includes('refer') || normalized.includes('recomend')) return 'referral';
  return 'other';
}

/**
 * Parsea una linea CSV respetando comillas y comas dentro de comillas.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseCsvText(text: string): LeadRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return [];

  const headerCells = parseCsvLine(lines[0]).map(normalizeHeader);
  const nameIdx = headerCells.indexOf('name');
  const emailIdx = headerCells.indexOf('email');
  const phoneIdx = headerCells.indexOf('phone');
  const companyIdx = headerCells.indexOf('company');
  const sourceIdx = headerCells.indexOf('source');

  const rows: LeadRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    rows.push({
      name: nameIdx >= 0 ? (cells[nameIdx] || '').trim() : '',
      email: emailIdx >= 0 ? (cells[emailIdx] || '').trim() : '',
      phone: phoneIdx >= 0 ? (cells[phoneIdx] || '').trim() : '',
      company: companyIdx >= 0 ? (cells[companyIdx] || '').trim() : '',
      source: sourceIdx >= 0 ? normalizeSource(cells[sourceIdx] || '') : 'other',
      rowIndex: i,
    });
  }

  return rows;
}

export function ImportLeadsCsv({
  open,
  onOpenChange,
  onSuccess,
  defaultPipelineId,
  defaultStageId,
}: ImportLeadsCsvProps) {
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setRows([]);
    setFileName('');
    setProgress(0);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setFileName(file.name);
      setResult(null);

      try {
        const text = await file.text();
        const parsed = parseCsvText(text);
        if (parsed.length === 0) {
          toast({
            title: 'Archivo vacío',
            description: 'El CSV no contiene filas válidas con la columna "name".',
            variant: 'destructive',
          });
          setRows([]);
          return;
        }
        setRows(parsed);
      } catch {
        toast({
          title: 'Error',
          description: 'No se pudo leer el archivo CSV.',
          variant: 'destructive',
        });
        setRows([]);
      }
    },
    []
  );

  const handleDownloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla_leads.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (rows.length === 0) return;

    const orgId = getOrganizationId();
    if (!orgId) {
      toast({
        title: 'Error',
        description: 'No se pudo determinar la organización activa.',
        variant: 'destructive',
      });
      return;
    }

    setIsImporting(true);
    setProgress(0);
    setResult(null);

    let success = 0;
    let errors = 0;
    const errorDetails: { row: number; name: string; error: string }[] = [];

    // Obtener pipeline y etapa por defecto si no se proporcionaron
    let pipelineId = defaultPipelineId;
    let stageId = defaultStageId;

    if (!pipelineId) {
      const { data: pipeline } = await supabase
        .from('pipelines')
        .select('id')
        .eq('organization_id', orgId)
        .order('is_default', { ascending: false })
        .limit(1)
        .single();
      pipelineId = pipeline?.id;
    }

    if (pipelineId && !stageId) {
      const { data: stage } = await supabase
        .from('stages')
        .select('id')
        .eq('pipeline_id', pipelineId)
        .order('position')
        .limit(1)
        .single();
      stageId = stage?.id;
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (!row.name) {
          throw new Error('El nombre es obligatorio');
        }

        // 1. Crear customer con metadata de lead
        const { data: customer, error: customerError } = await supabase
          .from('customers')
          .insert({
            organization_id: orgId,
            full_name: row.name,
            email: row.email || null,
            phone: row.phone || null,
            company_name: row.company || null,
            metadata: {
              recordType: 'lead',
              source: row.source,
            },
          })
          .select('id')
          .single();

        if (customerError || !customer) {
          throw new Error(customerError?.message || 'Error creando cliente');
        }

        // 2. Crear opportunity vinculada (recordType='lead' en metadata)
        if (pipelineId && stageId) {
          const { error: oppError } = await supabase.from('opportunities').insert({
            organization_id: orgId,
            pipeline_id: pipelineId,
            stage_id: stageId,
            customer_id: customer.id,
            name: `Lead - ${row.name}`,
            amount: 0,
            currency: 'COP',
            status: 'open',
            metadata: {
              recordType: 'lead',
              source: row.source,
              company: row.company || null,
            },
          });

          if (oppError) {
            // El customer se creo pero la opportunity fallo: reportar como warning
            errorDetails.push({
              row: row.rowIndex,
              name: row.name,
              error: `Cliente creado, pero oportunidad falló: ${oppError.message}`,
            });
            errors++;
          } else {
            success++;
          }
        } else {
          // Sin pipeline configurado: el customer se creo como lead
          success++;
        }
      } catch (err) {
        errors++;
        errorDetails.push({
          row: row.rowIndex,
          name: row.name || '(sin nombre)',
          error: err instanceof Error ? err.message : 'Error desconocido',
        });
      }

      setProgress(Math.round(((i + 1) / rows.length) * 100));
    }

    setResult({ total: rows.length, success, errors, errorDetails });
    setIsImporting(false);

    toast({
      title: 'Importación completada',
      description: `${success} leads importados, ${errors} errores.`,
      variant: errors > 0 ? 'warning' : 'success',
    });

    if (success > 0 && onSuccess) {
      onSuccess();
    }
  };

  const handleClose = () => {
    if (!isImporting) {
      resetState();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && handleClose()}>
      <DialogContent className="sm:max-w-2xl bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
            <Upload className="h-5 w-5" />
            Importar prospectos (Leads) desde CSV
          </DialogTitle>
          <DialogDescription className="text-gray-500 dark:text-gray-400">
            Columnas esperadas: name, email, phone, company, source. Se creará un
            cliente y una oportunidad por cada fila.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto">
          {/* Selector de archivo + plantilla */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Label htmlFor="csvFile" className="text-gray-700 dark:text-gray-300 mb-1.5 block">
                Archivo CSV
              </Label>
              <Input
                ref={fileInputRef}
                id="csvFile"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                disabled={isImporting}
                className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
              />
              {fileName && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                  <FileSpreadsheet className="h-3 w-3" />
                  {fileName} - {rows.length} fila(s)
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadTemplate}
              disabled={isImporting}
              className="self-end border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
            >
              <Download className="h-4 w-4 mr-1" />
              Descargar plantilla
            </Button>
          </div>

          {/* Preview de filas */}
          {rows.length > 0 && !result && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                Vista previa ({rows.length} filas)
              </div>
              <div className="max-h-48 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Nombre</TableHead>
                      <TableHead className="text-xs">Email</TableHead>
                      <TableHead className="text-xs">Teléfono</TableHead>
                      <TableHead className="text-xs">Empresa</TableHead>
                      <TableHead className="text-xs">Origen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 50).map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs text-gray-700 dark:text-gray-300">
                          {row.name || <span className="text-red-500">(vacío)</span>}
                        </TableCell>
                        <TableCell className="text-xs text-gray-600 dark:text-gray-400">
                          {row.email}
                        </TableCell>
                        <TableCell className="text-xs text-gray-600 dark:text-gray-400">
                          {row.phone}
                        </TableCell>
                        <TableCell className="text-xs text-gray-600 dark:text-gray-400">
                          {row.company}
                        </TableCell>
                        <TableCell className="text-xs text-gray-600 dark:text-gray-400">
                          {row.source}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {rows.length > 50 && (
                  <p className="text-xs text-gray-400 px-3 py-2 bg-gray-50 dark:bg-gray-800">
                    Mostrando primeras 50 filas de {rows.length}...
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Barra de progreso */}
          {isImporting && (
            <div className="space-y-2">
              <Progress value={progress} indicatorClassName="bg-blue-500" />
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                Importando... {progress}%
              </p>
            </div>
          )}

          {/* Reporte de resultados */}
          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-center">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {result.total}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
                </div>
                <div className="rounded-lg border border-green-200 dark:border-green-800 p-3 text-center bg-green-50 dark:bg-green-900/20">
                  <p className="text-2xl font-bold text-green-700 dark:text-green-300 flex items-center justify-center gap-1">
                    <CheckCircle className="h-5 w-5" />
                    {result.success}
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400">Exitosos</p>
                </div>
                <div className="rounded-lg border border-red-200 dark:border-red-800 p-3 text-center bg-red-50 dark:bg-red-900/20">
                  <p className="text-2xl font-bold text-red-700 dark:text-red-300 flex items-center justify-center gap-1">
                    <XCircle className="h-5 w-5" />
                    {result.errors}
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400">Errores</p>
                </div>
              </div>

              {result.errorDetails.length > 0 && (
                <div className="border border-red-200 dark:border-red-800 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                  <div className="bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm font-medium text-red-700 dark:text-red-300">
                    Detalle de errores
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {result.errorDetails.map((detail, idx) => (
                      <div
                        key={idx}
                        className="px-3 py-2 text-xs flex items-start gap-2"
                      >
                        <XCircle className="h-3 w-3 text-red-500 mt-0.5 shrink-0" />
                        <div>
                          <span className="font-medium text-gray-700 dark:text-gray-300">
                            Fila {detail.row} - {detail.name}:
                          </span>{' '}
                          <span className="text-gray-500 dark:text-gray-400">
                            {detail.error}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isImporting}
            className="border-gray-200 dark:border-gray-700"
          >
            {result ? 'Cerrar' : 'Cancelar'}
          </Button>
          {rows.length > 0 && !result && (
            <Button
              onClick={handleImport}
              disabled={isImporting || rows.length === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-1" />
                  Importar {rows.length} lead(s)
                </>
              )}
            </Button>
          )}
          {result && (
            <Button
              onClick={resetState}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Importar otro archivo
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
