'use client';

import React, { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import categoryService, { type CategoryImportRow } from '@/lib/services/categoryService';
import * as XLSX from 'xlsx';
import { Upload, Download, Loader2, CheckCircle, XCircle, FileSpreadsheet } from 'lucide-react';

interface ImportCategoriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const TEMPLATE_CSV = `Nombre,Categoría Padre,Slug,Color,Descripción,Activa,Estación,Requiere Preparación
Bebidas,,bebidas,#3b82f6,Bebidas generales,Sí,Bebidas,No
Gaseosas,Bebidas,,#ef4444,Gaseosas y refrescos,Sí,Bebidas,No
Cervezas,Bebidas,,#f59e0b,Cervezas nacionales e importadas,Sí,Bebidas,Sí`;

const HEADER_ALIASES: Record<string, string[]> = {
  name: ['nombre', 'name'],
  parent_name: ['categoria padre', 'categoría padre', 'parent_name', 'padre'],
  slug: ['slug'],
  color: ['color'],
  icon: ['icono', 'icon'],
  description: ['descripcion', 'descripción', 'description'],
  is_active: ['activa', 'activo', 'is_active', 'active'],
  display_order: ['orden', 'display_order', 'order'],
  station: ['estacion', 'estación', 'station'],
  requires_preparation: ['requiere preparacion', 'requiere preparación', 'requires_preparation'],
  meta_title: ['meta titulo', 'meta título', 'meta_title'],
  meta_description: ['meta descripcion', 'meta descripción', 'meta_description'],
};

function normalizeHeader(header: string): string {
  const normalized = header.trim().toLowerCase();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(normalized)) return field;
  }
  return normalized;
}

function parseBoolean(val: string): boolean {
  const v = val.trim().toLowerCase();
  return v === 'sí' || v === 'si' || v === 'true' || v === '1' || v === 'yes';
}

function parseCsvText(text: string): CategoryImportRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return [];

  const parseLine = (line: string): string[] => {
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
  };

  const headerCells = parseLine(lines[0]).map(normalizeHeader);
  const rows: CategoryImportRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    const row: Record<string, string> = {};
    headerCells.forEach((h, idx) => {
      row[h] = (cells[idx] || '').trim();
    });
    rows.push({
      name: row.name || undefined,
      parent_name: row.parent_name || undefined,
      slug: row.slug || undefined,
      color: row.color || undefined,
      icon: row.icon || undefined,
      description: row.description || undefined,
      is_active: row.is_active !== undefined ? parseBoolean(row.is_active) : undefined,
      display_order: row.display_order ? parseInt(row.display_order, 10) : undefined,
      station: row.station || undefined,
      requires_preparation: row.requires_preparation !== undefined ? parseBoolean(row.requires_preparation) : undefined,
      meta_title: row.meta_title || undefined,
      meta_description: row.meta_description || undefined,
    });
  }

  return rows;
}

function parseXlsxRows(rows: Record<string, unknown>[]): CategoryImportRow[] {
  return rows.map(r => {
    const normalized: Record<string, unknown> = {};
    Object.entries(r).forEach(([key, value]) => {
      normalized[normalizeHeader(key)] = value;
    });
    const str = (v: unknown): string | undefined => {
      if (v === undefined || v === null) return undefined;
      const s = String(v).trim();
      return s === '' ? undefined : s;
    };
    return {
      name: str(normalized.name),
      parent_name: str(normalized.parent_name),
      slug: str(normalized.slug),
      color: str(normalized.color),
      icon: str(normalized.icon),
      description: str(normalized.description),
      is_active: normalized.is_active !== undefined ? parseBoolean(String(normalized.is_active)) : undefined,
      display_order: normalized.display_order !== undefined ? parseInt(String(normalized.display_order), 10) : undefined,
      station: str(normalized.station),
      requires_preparation: normalized.requires_preparation !== undefined ? parseBoolean(String(normalized.requires_preparation)) : undefined,
      meta_title: str(normalized.meta_title),
      meta_description: str(normalized.meta_description),
    };
  });
}

export function ImportCategoriesDialog({ open, onOpenChange, onSuccess }: ImportCategoriesDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<CategoryImportRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: { row: number; error: string }[] } | null>(null);

  const handleDownloadTemplate = () => {
    const blob = new Blob(['\ufeff' + TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla_categorias.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setResult(null);

    try {
      let parsedRows: CategoryImportRow[] = [];
      if (file.name.toLowerCase().endsWith('.csv')) {
        const text = await file.text();
        parsedRows = parseCsvText(text);
      } else if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
        parsedRows = parseXlsxRows(jsonRows);
      } else {
        toast({ title: 'Formato no soportado', description: 'Use .csv o .xlsx', variant: 'destructive' });
        return;
      }
      setRows(parsedRows);
    } catch {
      toast({ title: 'Error al leer el archivo', variant: 'destructive' });
    }
  };

  const handleImport = async () => {
    const orgId = getOrganizationId();
    if (!orgId) {
      toast({ title: 'Error', description: 'No hay organización activa', variant: 'destructive' });
      return;
    }

    setIsImporting(true);
    try {
      const res = await categoryService.importCategories(orgId, rows);
      setResult(res);
      if (res.success > 0) {
        toast({ title: 'Importación completada', description: `${res.success} categorías importadas` });
        onSuccess();
        if (res.errors.length === 0) {
          onOpenChange(false);
          handleClear();
        }
      } else {
        toast({ title: 'No se importaron categorías', description: 'Revise los errores', variant: 'destructive' });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      toast({ title: 'Error de importación', description: message, variant: 'destructive' });
    } finally {
      setIsImporting(false);
    }
  };

  const handleClear = () => {
    setRows([]);
    setFileName('');
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const validRows = rows.filter(r => r.name && r.name.trim() !== '');
  const invalidRows = rows.filter(r => !r.name || r.name.trim() === '');

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) handleClear(); }}>
      <DialogContent className="dark:bg-gray-800 dark:border-gray-700 max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="dark:text-gray-100 flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar Categorías
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            Cargue categorías desde un archivo CSV o Excel. Use la plantilla para asegurar el formato correcto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleDownloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Descargar plantilla
            </Button>
            {rows.length > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
                Limpiar
              </Button>
            )}
          </div>

          <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center">
            <FileSpreadsheet className="h-10 w-10 mx-auto text-gray-400 mb-2" />
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
              id="import-categories-file"
            />
            <label htmlFor="import-categories-file" className="cursor-pointer text-blue-600 dark:text-blue-400 hover:underline">
              {fileName || 'Seleccionar archivo (.csv o .xlsx)'}
            </label>
          </div>

          {rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <CheckCircle className="h-4 w-4" />
                  {validRows.length} válidas
                </span>
                {invalidRows.length > 0 && (
                  <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                    <XCircle className="h-4 w-4" />
                    {invalidRows.length} inválidas
                  </span>
                )}
                <span className="text-gray-500 dark:text-gray-400">{rows.length} total</span>
              </div>

              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                    <tr>
                      <th className="px-2 py-1 text-left text-gray-600 dark:text-gray-300">Estado</th>
                      <th className="px-2 py-1 text-left text-gray-600 dark:text-gray-300">Nombre</th>
                      <th className="px-2 py-1 text-left text-gray-600 dark:text-gray-300">Categoría Padre</th>
                      <th className="px-2 py-1 text-left text-gray-600 dark:text-gray-300">Color</th>
                      <th className="px-2 py-1 text-left text-gray-600 dark:text-gray-300">Estación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => {
                      const isValid = row.name && row.name.trim() !== '';
                      return (
                        <tr key={idx} className="border-t border-gray-100 dark:border-gray-700">
                          <td className="px-2 py-1">
                            {isValid ? (
                              <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-red-500" />
                            )}
                          </td>
                          <td className="px-2 py-1 text-gray-800 dark:text-gray-200">{row.name || <span className="text-red-500">—</span>}</td>
                          <td className="px-2 py-1 text-gray-600 dark:text-gray-400">{row.parent_name || '—'}</td>
                          <td className="px-2 py-1">
                            {row.color ? (
                              <span className="inline-flex items-center gap-1">
                                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: row.color }} />
                                {row.color}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-2 py-1 text-gray-600 dark:text-gray-400">{row.station || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result && (
            <div className="rounded-lg p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                {result.success} categorías importadas correctamente
              </p>
              {result.errors.length > 0 && (
                <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-xs text-red-600 dark:text-red-400">
                      Fila {err.row}: {err.error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="dark:border-gray-600 dark:text-gray-300">
            Cancelar
          </Button>
          <Button
            onClick={handleImport}
            disabled={validRows.length === 0 || isImporting}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Importar ({validRows.length})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
