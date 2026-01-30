'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  AlertTriangle, 
  CheckCircle2, 
  Loader2,
  X
} from 'lucide-react';
import { RouteInput, transportRoutesService } from '@/lib/services/transportRoutesService';

interface ImportRoutesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number;
  onImportComplete: () => void;
}

interface ParsedRoute {
  name: string;
  code: string;
  route_type: 'passenger' | 'cargo' | 'mixed';
  origin_stop_code?: string;
  destination_stop_code?: string;
  estimated_distance_km?: number;
  estimated_duration_minutes?: number;
  base_fare?: number;
  base_shipping_fee?: number;
  currency?: string;
  isValid: boolean;
  errors: string[];
  origin_stop_id?: string;
  destination_stop_id?: string;
}

export function ImportRoutesDialog({
  open,
  onOpenChange,
  organizationId,
  onImportComplete,
}: ImportRoutesDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedRoutes, setParsedRoutes] = useState<ParsedRoute[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResults, setImportResults] = useState<{ success: number; failed: number } | null>(null);

  const resetState = () => {
    setParsedRoutes([]);
    setImportResults(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const downloadTemplate = () => {
    const headers = [
      'name',
      'code',
      'route_type',
      'origin_stop_code',
      'destination_stop_code',
      'estimated_distance_km',
      'estimated_duration_minutes',
      'base_fare',
      'base_shipping_fee',
      'currency'
    ];
    
    const exampleRow = [
      'Bogotá - Medellín',
      'BOG-MDE',
      'passenger',
      'TERM-BOG',
      'TERM-MDE',
      '450.5',
      '480',
      '85000',
      '15000',
      'COP'
    ];

    const csvContent = [headers.join(','), exampleRow.join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'plantilla_rutas.csv';
    link.click();
  };

  const parseCSV = (text: string): string[][] => {
    const lines = text.split('\n').filter(line => line.trim());
    return lines.map(line => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setIsProcessing(true);
    setParsedRoutes([]);
    setImportResults(null);

    try {
      const text = await selectedFile.text();
      const rows = parseCSV(text);
      
      if (rows.length < 2) {
        setParsedRoutes([]);
        return;
      }

      const headers = rows[0].map(h => h.toLowerCase().trim());
      const dataRows = rows.slice(1);

      // Get stops for code mapping
      const stops = await transportRoutesService.getStops(organizationId);
      const stopCodeMap = new Map(stops.map(s => [s.code?.toUpperCase(), s.id]));

      const parsed: ParsedRoute[] = dataRows.map(row => {
        const getValue = (key: string) => {
          const idx = headers.indexOf(key);
          return idx >= 0 ? row[idx]?.trim() || '' : '';
        };

        const errors: string[] = [];
        const name = getValue('name');
        const code = getValue('code');
        const routeType = getValue('route_type') as 'passenger' | 'cargo' | 'mixed';
        const originCode = getValue('origin_stop_code')?.toUpperCase();
        const destCode = getValue('destination_stop_code')?.toUpperCase();

        if (!name) errors.push('Nombre requerido');
        if (!code) errors.push('Código requerido');
        if (!['passenger', 'cargo', 'mixed'].includes(routeType)) {
          errors.push('Tipo inválido (passenger/cargo/mixed)');
        }

        const originStopId = originCode ? stopCodeMap.get(originCode) : undefined;
        const destStopId = destCode ? stopCodeMap.get(destCode) : undefined;

        if (originCode && !originStopId) {
          errors.push(`Parada origen "${originCode}" no encontrada`);
        }
        if (destCode && !destStopId) {
          errors.push(`Parada destino "${destCode}" no encontrada`);
        }

        const distanceStr = getValue('estimated_distance_km');
        const durationStr = getValue('estimated_duration_minutes');
        const fareStr = getValue('base_fare');
        const shippingStr = getValue('base_shipping_fee');

        return {
          name,
          code: code.toUpperCase(),
          route_type: routeType || 'passenger',
          origin_stop_code: originCode,
          destination_stop_code: destCode,
          origin_stop_id: originStopId,
          destination_stop_id: destStopId,
          estimated_distance_km: distanceStr ? parseFloat(distanceStr) : undefined,
          estimated_duration_minutes: durationStr ? parseInt(durationStr) : undefined,
          base_fare: fareStr ? parseFloat(fareStr) : undefined,
          base_shipping_fee: shippingStr ? parseFloat(shippingStr) : undefined,
          currency: getValue('currency') || 'COP',
          isValid: errors.length === 0,
          errors,
        };
      });

      setParsedRoutes(parsed);
    } catch (error) {
      console.error('Error parsing CSV:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImport = async () => {
    const validRoutes = parsedRoutes.filter(r => r.isValid);
    if (validRoutes.length === 0) return;

    setIsImporting(true);
    let success = 0;
    let failed = 0;

    for (const route of validRoutes) {
      try {
        const input: RouteInput = {
          name: route.name,
          code: route.code,
          route_type: route.route_type,
          origin_stop_id: route.origin_stop_id,
          destination_stop_id: route.destination_stop_id,
          estimated_distance_km: route.estimated_distance_km,
          estimated_duration_minutes: route.estimated_duration_minutes,
          base_fare: route.base_fare,
          base_shipping_fee: route.base_shipping_fee,
          currency: route.currency,
          is_active: true,
        };

        await transportRoutesService.createRoute(organizationId, input);
        success++;
      } catch (error) {
        console.error('Error importing route:', error);
        failed++;
      }
    }

    setImportResults({ success, failed });
    setIsImporting(false);

    if (success > 0) {
      onImportComplete();
    }
  };

  const validCount = parsedRoutes.filter(r => r.isValid).length;
  const invalidCount = parsedRoutes.filter(r => !r.isValid).length;

  const getRouteTypeBadge = (type: string) => {
    switch (type) {
      case 'passenger':
        return <Badge className="bg-blue-100 text-blue-800">Pasajeros</Badge>;
      case 'cargo':
        return <Badge className="bg-orange-100 text-orange-800">Carga</Badge>;
      case 'mixed':
        return <Badge className="bg-purple-100 text-purple-800">Mixto</Badge>;
      default:
        return <Badge variant="secondary">{type}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-blue-600" />
            Importar Rutas
          </DialogTitle>
          <DialogDescription>
            Importa rutas de transporte desde un archivo CSV
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Descargar Plantilla
            </Button>
            
            <div className="flex-1">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="cursor-pointer"
              />
            </div>
          </div>

          {isProcessing && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <span className="ml-2">Procesando archivo...</span>
            </div>
          )}

          {parsedRoutes.length > 0 && !isProcessing && (
            <>
              <div className="flex items-center gap-4">
                <Badge variant="default" className="bg-green-100 text-green-800">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {validCount} válidas
                </Badge>
                {invalidCount > 0 && (
                  <Badge variant="destructive">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {invalidCount} con errores
                  </Badge>
                )}
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">Estado</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Origen → Destino</TableHead>
                      <TableHead>Errores</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRoutes.slice(0, 20).map((route, idx) => (
                      <TableRow key={idx} className={!route.isValid ? 'bg-red-50 dark:bg-red-900/10' : ''}>
                        <TableCell>
                          {route.isValid ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <X className="h-4 w-4 text-red-500" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{route.name}</TableCell>
                        <TableCell>{route.code}</TableCell>
                        <TableCell>{getRouteTypeBadge(route.route_type)}</TableCell>
                        <TableCell className="text-sm">
                          {route.origin_stop_code || '-'} → {route.destination_stop_code || '-'}
                        </TableCell>
                        <TableCell>
                          {route.errors.length > 0 && (
                            <span className="text-xs text-red-500">{route.errors.join(', ')}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {parsedRoutes.length > 20 && (
                  <div className="px-4 py-2 text-sm text-gray-500 border-t">
                    Mostrando 20 de {parsedRoutes.length} registros
                  </div>
                )}
              </div>
            </>
          )}

          {importResults && (
            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200">
              <h4 className="font-medium text-blue-900 dark:text-blue-100">Resultado de la importación</h4>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                {importResults.success} rutas importadas correctamente
                {importResults.failed > 0 && `, ${importResults.failed} fallidas`}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cerrar
          </Button>
          {!importResults && (
            <Button
              onClick={handleImport}
              disabled={isImporting || validCount === 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isImporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Importar {validCount} rutas
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
