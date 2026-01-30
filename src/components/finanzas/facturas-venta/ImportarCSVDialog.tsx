'use client';

import { useState, useCallback } from 'react';
import Papa from 'papaparse';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  Upload, 
  FileSpreadsheet, 
  AlertCircle, 
  CheckCircle, 
  Loader2,
  Download,
  X
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchIdWithFallback, getCurrentUserId } from '@/lib/hooks/useOrganization';

interface ImportarCSVDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

interface CSVRow {
  numero_factura?: string;
  cliente_id?: string;
  cliente_nombre?: string;
  fecha_emision?: string;
  fecha_vencimiento?: string;
  moneda?: string;
  subtotal?: string;
  impuestos?: string;
  total?: string;
  notas?: string;
  item_descripcion?: string;
  item_cantidad?: string;
  item_precio?: string;
  item_impuesto?: string;
}

interface ParsedInvoice {
  number: string;
  customer_id?: string;
  issue_date: string;
  due_date: string;
  currency: string;
  subtotal: number;
  tax_total: number;
  total: number;
  notes?: string;
  items: {
    description: string;
    qty: number;
    unit_price: number;
    tax_rate: number;
    total_line: number;
  }[];
}

export function ImportarCSVDialog({ isOpen, onClose, onImportComplete }: ImportarCSVDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedInvoice[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const { toast } = useToast();

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        toast({
          title: 'Archivo inválido',
          description: 'Por favor seleccione un archivo CSV',
          variant: 'destructive',
        });
        return;
      }
      setFile(selectedFile);
      parseCSV(selectedFile);
    }
  }, []);

  const parseCSV = (csvFile: File) => {
    setIsParsing(true);
    setErrors([]);
    setParsedData([]);

    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const invoiceMap = new Map<string, ParsedInvoice>();
        const parseErrors: string[] = [];

        results.data.forEach((row: any, index: number) => {
          try {
            const invoiceNumber = row.numero_factura?.trim();
            if (!invoiceNumber) {
              parseErrors.push(`Fila ${index + 2}: Número de factura vacío`);
              return;
            }

            if (!invoiceMap.has(invoiceNumber)) {
              invoiceMap.set(invoiceNumber, {
                number: invoiceNumber,
                customer_id: row.cliente_id?.trim() || undefined,
                issue_date: row.fecha_emision || new Date().toISOString().split('T')[0],
                due_date: row.fecha_vencimiento || new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
                currency: row.moneda?.trim() || 'COP',
                subtotal: parseFloat(row.subtotal) || 0,
                tax_total: parseFloat(row.impuestos) || 0,
                total: parseFloat(row.total) || 0,
                notes: row.notas?.trim(),
                items: []
              });
            }

            // Agregar item si existe
            if (row.item_descripcion) {
              const invoice = invoiceMap.get(invoiceNumber)!;
              const qty = parseFloat(row.item_cantidad) || 1;
              const unitPrice = parseFloat(row.item_precio) || 0;
              const taxRate = parseFloat(row.item_impuesto) || 0;
              const totalLine = qty * unitPrice * (1 + taxRate / 100);

              invoice.items.push({
                description: row.item_descripcion.trim(),
                qty,
                unit_price: unitPrice,
                tax_rate: taxRate,
                total_line: totalLine
              });
            }
          } catch (err) {
            parseErrors.push(`Fila ${index + 2}: Error al procesar datos`);
          }
        });

        setParsedData(Array.from(invoiceMap.values()));
        setErrors(parseErrors);
        setIsParsing(false);
      },
      error: (error) => {
        setErrors([`Error al leer archivo: ${error.message}`]);
        setIsParsing(false);
      }
    });
  };

  const handleImport = async () => {
    if (parsedData.length === 0) {
      toast({
        title: 'Sin datos',
        description: 'No hay facturas válidas para importar',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    setImportProgress(0);

    const organizationId = getOrganizationId();
    const branchId = getCurrentBranchIdWithFallback();
    const userId = await getCurrentUserId();
    
    let imported = 0;
    let failed = 0;

    for (let i = 0; i < parsedData.length; i++) {
      const invoice = parsedData[i];
      
      try {
        // Crear factura
        const { data: invoiceData, error: invoiceError } = await supabase
          .from('invoice_sales')
          .insert({
            organization_id: organizationId,
            branch_id: branchId,
            customer_id: invoice.customer_id || null,
            number: invoice.number,
            issue_date: invoice.issue_date,
            due_date: invoice.due_date,
            currency: invoice.currency,
            subtotal: invoice.subtotal,
            tax_total: invoice.tax_total,
            total: invoice.total,
            balance: invoice.total,
            status: 'draft',
            notes: invoice.notes,
            created_by: userId
          })
          .select()
          .single();

        if (invoiceError) throw invoiceError;

        // Crear items
        if (invoice.items.length > 0 && invoiceData) {
          const itemsToInsert = invoice.items.map(item => ({
            invoice_sales_id: invoiceData.id,
            invoice_id: invoiceData.id,
            invoice_type: 'sale',
            description: item.description,
            qty: item.qty,
            unit_price: item.unit_price,
            tax_rate: item.tax_rate,
            tax_included: false,
            total_line: item.total_line
          }));

          const { error: itemsError } = await supabase
            .from('invoice_items')
            .insert(itemsToInsert);

          if (itemsError) {
            console.error('Error insertando items:', itemsError);
          }
        }

        imported++;
      } catch (error) {
        console.error(`Error importando factura ${invoice.number}:`, error);
        failed++;
      }

      setImportProgress(Math.round(((i + 1) / parsedData.length) * 100));
    }

    setIsLoading(false);

    toast({
      title: 'Importación completada',
      description: `${imported} facturas importadas${failed > 0 ? `, ${failed} con errores` : ''}`,
      variant: failed > 0 ? 'destructive' : 'default',
    });

    if (imported > 0) {
      onImportComplete();
    }
  };

  const downloadTemplate = () => {
    const template = `numero_factura,cliente_id,fecha_emision,fecha_vencimiento,moneda,subtotal,impuestos,total,notas,item_descripcion,item_cantidad,item_precio,item_impuesto
FACT-001,,2024-01-15,2024-02-15,COP,100000,19000,119000,Factura de ejemplo,Producto 1,2,50000,19
FACT-001,,2024-01-15,2024-02-15,COP,100000,19000,119000,,Servicio 1,1,0,19
FACT-002,,2024-01-16,2024-02-16,COP,50000,9500,59500,Segunda factura,Producto 2,1,50000,19`;

    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'plantilla_facturas.csv';
    link.click();
  };

  const resetDialog = () => {
    setFile(null);
    setParsedData([]);
    setErrors([]);
    setImportProgress(0);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { resetDialog(); onClose(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto dark:bg-gray-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-blue-600" />
            Importar Facturas desde CSV
          </DialogTitle>
          <DialogDescription>
            Suba un archivo CSV con los datos de las facturas a importar
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Botón para descargar plantilla */}
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Descargar Plantilla
            </Button>
          </div>

          {/* Selector de archivo */}
          <div className="space-y-2">
            <Label>Archivo CSV</Label>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="dark:bg-gray-700 dark:border-gray-600"
              />
              {file && (
                <Button variant="ghost" size="icon" onClick={resetDialog}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Estado de parsing */}
          {isParsing && (
            <div className="flex items-center gap-2 text-blue-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Procesando archivo...
            </div>
          )}

          {/* Errores de parsing */}
          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-medium mb-1">Errores encontrados:</div>
                <ul className="list-disc list-inside text-sm max-h-32 overflow-y-auto">
                  {errors.slice(0, 10).map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                  {errors.length > 10 && (
                    <li>... y {errors.length - 10} errores más</li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Vista previa de datos */}
          {parsedData.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Vista previa ({parsedData.length} facturas)</Label>
                <Badge variant="outline" className="text-green-600">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Listo para importar
                </Badge>
              </div>
              <div className="border rounded-lg overflow-hidden dark:border-gray-700">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 dark:bg-gray-700">
                    <tr>
                      <th className="px-3 py-2 text-left">Número</th>
                      <th className="px-3 py-2 text-left">Fecha</th>
                      <th className="px-3 py-2 text-left">Items</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="dark:bg-gray-800">
                    {parsedData.slice(0, 5).map((invoice, i) => (
                      <tr key={i} className="border-t dark:border-gray-700">
                        <td className="px-3 py-2">{invoice.number}</td>
                        <td className="px-3 py-2">{invoice.issue_date}</td>
                        <td className="px-3 py-2">{invoice.items.length}</td>
                        <td className="px-3 py-2 text-right">${invoice.total.toLocaleString()}</td>
                      </tr>
                    ))}
                    {parsedData.length > 5 && (
                      <tr className="border-t dark:border-gray-700">
                        <td colSpan={4} className="px-3 py-2 text-center text-gray-500">
                          ... y {parsedData.length - 5} facturas más
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Barra de progreso */}
          {isLoading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Importando facturas...</span>
                <span>{importProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all" 
                  style={{ width: `${importProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetDialog(); onClose(); }} disabled={isLoading}>
            Cancelar
          </Button>
          <Button 
            onClick={handleImport} 
            disabled={isLoading || parsedData.length === 0 || isParsing}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Importar {parsedData.length > 0 ? `(${parsedData.length})` : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
