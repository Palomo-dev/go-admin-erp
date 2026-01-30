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
import { CustomerAddressInput, customerAddressesService } from '@/lib/services/customerAddressesService';

interface ImportAddressesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number;
  onImportComplete: () => void;
}

interface ParsedAddress {
  customer_email: string;
  label: string;
  recipient_name?: string;
  recipient_phone?: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  department?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  delivery_instructions?: string;
  is_default?: boolean;
  isValid: boolean;
  errors: string[];
  customer_id?: string;
}

export function ImportAddressesDialog({
  open,
  onOpenChange,
  organizationId,
  onImportComplete,
}: ImportAddressesDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedAddresses, setParsedAddresses] = useState<ParsedAddress[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResults, setImportResults] = useState<{ success: number; failed: number } | null>(null);

  const resetState = () => {
    setParsedAddresses([]);
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
      'customer_email',
      'label',
      'recipient_name',
      'recipient_phone',
      'address_line1',
      'address_line2',
      'city',
      'department',
      'postal_code',
      'latitude',
      'longitude',
      'delivery_instructions',
      'is_default'
    ];
    
    const exampleRow = [
      'cliente@email.com',
      'Casa',
      'Juan Pérez',
      '+57 300 1234567',
      'Calle 123 # 45-67',
      'Apto 101',
      'Bogotá',
      'Cundinamarca',
      '110111',
      '4.7110',
      '-74.0721',
      'Llamar antes de entregar',
      'true'
    ];

    const csvContent = [headers.join(','), exampleRow.join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'plantilla_direcciones.csv';
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
    setParsedAddresses([]);
    setImportResults(null);

    try {
      const text = await selectedFile.text();
      const rows = parseCSV(text);
      
      if (rows.length < 2) {
        setParsedAddresses([]);
        return;
      }

      const headers = rows[0].map(h => h.toLowerCase().trim());
      const dataRows = rows.slice(1);

      const customerEmailsSet = new Set<string>();
      dataRows.forEach(row => {
        const emailIdx = headers.indexOf('customer_email');
        if (emailIdx >= 0 && row[emailIdx]) {
          customerEmailsSet.add(row[emailIdx].toLowerCase().trim());
        }
      });

      const customerMap = new Map<string, string>();
      const customerEmails = Array.from(customerEmailsSet);
      for (const email of customerEmails) {
        try {
          const customers = await customerAddressesService.searchCustomers(organizationId, email);
          const match = customers.find(c => c.email?.toLowerCase() === email);
          if (match) {
            customerMap.set(email, match.id);
          }
        } catch (error) {
          console.error('Error searching customer:', error);
        }
      }

      const parsed: ParsedAddress[] = dataRows.map(row => {
        const getValue = (key: string) => {
          const idx = headers.indexOf(key);
          return idx >= 0 ? row[idx]?.trim() || '' : '';
        };

        const email = getValue('customer_email').toLowerCase();
        const errors: string[] = [];

        if (!email) errors.push('Email requerido');
        if (!getValue('label')) errors.push('Etiqueta requerida');
        if (!getValue('address_line1')) errors.push('Dirección requerida');
        if (!getValue('city')) errors.push('Ciudad requerida');

        const customerId = customerMap.get(email);
        if (email && !customerId) {
          errors.push('Cliente no encontrado');
        }

        const lat = getValue('latitude');
        const lng = getValue('longitude');

        return {
          customer_email: email,
          customer_id: customerId,
          label: getValue('label') || 'Principal',
          recipient_name: getValue('recipient_name'),
          recipient_phone: getValue('recipient_phone'),
          address_line1: getValue('address_line1'),
          address_line2: getValue('address_line2'),
          city: getValue('city'),
          department: getValue('department'),
          postal_code: getValue('postal_code'),
          latitude: lat ? parseFloat(lat) : undefined,
          longitude: lng ? parseFloat(lng) : undefined,
          delivery_instructions: getValue('delivery_instructions'),
          is_default: getValue('is_default').toLowerCase() === 'true',
          isValid: errors.length === 0,
          errors,
        };
      });

      setParsedAddresses(parsed);
    } catch (error) {
      console.error('Error parsing CSV:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImport = async () => {
    const validAddresses = parsedAddresses.filter(a => a.isValid);
    if (validAddresses.length === 0) return;

    setIsImporting(true);
    let success = 0;
    let failed = 0;

    for (const address of validAddresses) {
      try {
        const input: CustomerAddressInput = {
          customer_id: address.customer_id!,
          label: address.label,
          recipient_name: address.recipient_name,
          recipient_phone: address.recipient_phone,
          address_line1: address.address_line1,
          address_line2: address.address_line2,
          city: address.city,
          department: address.department,
          postal_code: address.postal_code,
          latitude: address.latitude,
          longitude: address.longitude,
          delivery_instructions: address.delivery_instructions,
          is_default: address.is_default,
        };

        await customerAddressesService.createAddress(organizationId, input);
        success++;
      } catch (error) {
        console.error('Error importing address:', error);
        failed++;
      }
    }

    setImportResults({ success, failed });
    setIsImporting(false);

    if (success > 0) {
      onImportComplete();
    }
  };

  const validCount = parsedAddresses.filter(a => a.isValid).length;
  const invalidCount = parsedAddresses.filter(a => !a.isValid).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-blue-600" />
            Importar Direcciones
          </DialogTitle>
          <DialogDescription>
            Importa direcciones de clientes desde un archivo CSV
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

          {parsedAddresses.length > 0 && !isProcessing && (
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
                      <TableHead>Cliente</TableHead>
                      <TableHead>Etiqueta</TableHead>
                      <TableHead>Dirección</TableHead>
                      <TableHead>Ciudad</TableHead>
                      <TableHead>Errores</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedAddresses.slice(0, 20).map((address, idx) => (
                      <TableRow key={idx} className={!address.isValid ? 'bg-red-50 dark:bg-red-900/10' : ''}>
                        <TableCell>
                          {address.isValid ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <X className="h-4 w-4 text-red-500" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{address.customer_email}</TableCell>
                        <TableCell>{address.label}</TableCell>
                        <TableCell className="max-w-xs truncate">{address.address_line1}</TableCell>
                        <TableCell>{address.city}</TableCell>
                        <TableCell>
                          {address.errors.length > 0 && (
                            <span className="text-xs text-red-500">{address.errors.join(', ')}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {parsedAddresses.length > 20 && (
                  <div className="px-4 py-2 text-sm text-gray-500 border-t">
                    Mostrando 20 de {parsedAddresses.length} registros
                  </div>
                )}
              </div>
            </>
          )}

          {importResults && (
            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200">
              <h4 className="font-medium text-blue-900 dark:text-blue-100">Resultado de la importación</h4>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                {importResults.success} direcciones importadas correctamente
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
              Importar {validCount} direcciones
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
