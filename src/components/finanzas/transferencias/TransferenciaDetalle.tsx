'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Calendar,
  User,
  FileText,
  Building2,
  Download,
  Loader2,
  XCircle,
  Hash,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/components/ui/use-toast';
import { formatCurrency, formatDate } from '@/utils/Utils';
import { transferenciasService, BankTransfer } from '@/lib/services/transferenciasService';

interface TransferenciaDetalleProps {
  id: string;
}

const statusColors: Record<string, string> = {
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const statusLabels: Record<string, string> = {
  completed: 'Completada',
  pending: 'Pendiente',
  cancelled: 'Anulada',
};

export function TransferenciaDetalle({ id }: TransferenciaDetalleProps) {
  const router = useRouter();
  const [transfer, setTransfer] = useState<BankTransfer | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadTransfer = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await transferenciasService.getTransferById(id);
      setTransfer(data);
    } catch (error) {
      console.error('Error loading transfer:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el detalle de la transferencia',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadTransfer();
  }, [loadTransfer]);

  const handleCancel = async () => {
    if (!transfer) return;
    if (!confirm('¿Está seguro de anular esta transferencia? Se revertirán los saldos.')) return;

    const reason = prompt('Motivo de la anulación:');
    try {
      const result = await transferenciasService.cancelTransfer(transfer.id, reason || undefined);
      if (result.success) {
        toast({ title: 'Éxito', description: 'Transferencia anulada correctamente' });
        router.push('/app/finanzas/transferencias');
      } else {
        toast({ title: 'Error', description: result.error, variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Error al anular', variant: 'destructive' });
    }
  };

  const handleExport = () => {
    if (!transfer) return;
    
    const content = `
COMPROBANTE DE TRANSFERENCIA
=============================
ID: ${transfer.id}
Fecha: ${formatDate(transfer.transfer_date)}

CUENTA ORIGEN
Banco: ${transfer.from_account?.bank_name || 'N/A'}
Cuenta: ${transfer.from_account?.name || 'N/A'}

CUENTA DESTINO
Banco: ${transfer.to_account?.bank_name || 'N/A'}
Cuenta: ${transfer.to_account?.name || 'N/A'}

MONTO: ${formatCurrency(transfer.amount)}

Referencia: ${transfer.reference || 'N/A'}
Estado: ${statusLabels[transfer.status]}
Notas: ${transfer.notes || 'N/A'}
    `.trim();

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transferencia_${transfer.id.slice(0, 8)}.txt`;
    a.click();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!transfer) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Transferencia no encontrada
        </h2>
        <Link href="/app/finanzas/transferencias">
          <Button className="mt-4">Volver al listado</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/finanzas/transferencias">
            <Button variant="ghost" size="icon" className="hover:bg-gray-100 dark:hover:bg-gray-800">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <ArrowLeftRight className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Transferencia
              </h1>
              <Badge className={statusColors[transfer.status]}>
                {statusLabels[transfer.status]}
              </Badge>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {formatDate(transfer.transfer_date)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExport} className="dark:border-gray-700">
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          {transfer.status === 'completed' && (
            <Button variant="destructive" onClick={handleCancel}>
              <XCircle className="h-4 w-4 mr-2" />
              Anular
            </Button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Transfer Flow */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                <ArrowLeftRight className="h-5 w-5" />
                Detalle de la Transferencia
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                {/* From Account */}
                <div className="flex-1 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                    <span className="text-sm font-medium text-red-600 dark:text-red-400">ORIGEN</span>
                  </div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {transfer.from_account?.name}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {transfer.from_account?.bank_name || 'Sin banco'}
                  </p>
                </div>

                {/* Arrow */}
                <div className="flex-shrink-0">
                  <ArrowRight className="h-8 w-8 text-blue-500" />
                </div>

                {/* To Account */}
                <div className="flex-1 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-medium text-green-600 dark:text-green-400">DESTINO</span>
                  </div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {transfer.to_account?.name}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {transfer.to_account?.bank_name || 'Sin banco'}
                  </p>
                </div>
              </div>

              <div className="mt-6 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Monto Transferido</p>
                <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">
                  {formatCurrency(transfer.amount)}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Additional Details */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                <FileText className="h-5 w-5" />
                Información Adicional
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Fecha de Transferencia</p>
                  <p className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {formatDate(transfer.transfer_date)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Referencia</p>
                  <p className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    <Hash className="h-4 w-4" />
                    {transfer.reference || 'Sin referencia'}
                  </p>
                </div>
              </div>

              {transfer.notes && (
                <>
                  <Separator className="dark:bg-gray-700" />
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Notas</p>
                    <p className="text-gray-900 dark:text-white whitespace-pre-wrap">
                      {transfer.notes}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Side Panel */}
        <div className="space-y-6">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                <User className="h-5 w-5" />
                Registro
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">ID de Transferencia</p>
                <p className="font-mono text-xs text-gray-900 dark:text-white">
                  {transfer.id}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Creado el</p>
                <p className="text-gray-900 dark:text-white">
                  {formatDate(transfer.created_at)}
                </p>
              </div>
              {transfer.created_by && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Creado por</p>
                  <p className="text-gray-900 dark:text-white">
                    {transfer.created_by.slice(0, 8)}...
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <CardContent className="pt-6">
              <p className="text-blue-100 text-sm">Monto de Transferencia</p>
              <p className="text-3xl font-bold mt-1">
                {formatCurrency(transfer.amount)}
              </p>
              <p className="text-blue-100 text-sm mt-2">
                {formatDate(transfer.transfer_date)}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
