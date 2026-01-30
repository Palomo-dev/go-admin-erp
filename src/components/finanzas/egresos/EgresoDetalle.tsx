'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  MinusCircle,
  Calendar,
  User,
  FileText,
  Wallet,
  Download,
  Loader2,
  XCircle,
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/components/ui/use-toast';
import { formatCurrency, formatDate } from '@/utils/Utils';
import { movimientosService, UnifiedMovement } from '@/lib/services/movimientosService';

interface EgresoDetalleProps {
  id: string; // UUID
}

export function EgresoDetalle({ id }: EgresoDetalleProps) {
  const router = useRouter();
  const [movement, setMovement] = useState<UnifiedMovement | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadMovement = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await movimientosService.getMovementByUuid(id);
      setMovement(data);
    } catch (error) {
      console.error('Error loading movement:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el detalle del egreso',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadMovement();
  }, [loadMovement]);

  const handleCancel = async () => {
    if (!movement) return;
    if (!confirm('¿Está seguro de anular este egreso?')) return;

    const reason = prompt('Motivo de la anulación:');
    try {
      const result = await movimientosService.cancelMovement(movement.id, reason || undefined);
      if (result.success) {
        toast({ title: 'Éxito', description: 'Egreso anulado correctamente' });
        router.push('/app/finanzas/egresos');
      } else {
        toast({ title: 'Error', description: result.error, variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Error al anular', variant: 'destructive' });
    }
  };

  const handleDuplicate = async () => {
    if (!movement) return;
    try {
      const result = await movimientosService.duplicateMovement(movement.id, '');
      if (result.success) {
        toast({ title: 'Éxito', description: 'Egreso duplicado correctamente' });
        router.push(`/app/finanzas/egresos/${result.id}`);
      } else {
        toast({ title: 'Error', description: result.error, variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Error al duplicar', variant: 'destructive' });
    }
  };

  const handleExport = () => {
    if (!movement) return;
    
    const content = `
COMPROBANTE DE EGRESO
======================
ID: #${movement.id}
Fecha: ${formatDate(movement.created_at)}
Concepto: ${movement.concept}
Monto: ${formatCurrency(movement.amount)}
Notas: ${movement.notes || 'N/A'}
    `.trim();

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `egreso_${movement.id}.txt`;
    a.click();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!movement) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Egreso no encontrado
        </h2>
        <Link href="/app/finanzas/egresos">
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
          <Link href="/app/finanzas/egresos">
            <Button variant="ghost" size="icon" className="hover:bg-gray-100 dark:hover:bg-gray-800">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-xl">
            <MinusCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Egreso #{movement.id}
              </h1>
              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                Confirmado
              </Badge>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {formatDate(movement.created_at)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExport} className="dark:border-gray-700">
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button variant="outline" onClick={handleDuplicate} className="dark:border-gray-700">
            <Copy className="h-4 w-4 mr-2" />
            Duplicar
          </Button>
          <Button variant="destructive" onClick={handleCancel}>
            <XCircle className="h-4 w-4 mr-2" />
            Anular
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                <FileText className="h-5 w-5" />
                Información del Movimiento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Concepto</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {movement.concept}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Monto</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {formatCurrency(movement.amount)}
                  </p>
                </div>
              </div>
              
              <Separator className="dark:bg-gray-700" />
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Fecha de Registro</p>
                  <p className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {formatDate(movement.created_at)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Origen</p>
                  <p className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    {movement.source === 'cash' ? 'Caja' : 'Banco'}
                  </p>
                </div>
              </div>

              {movement.notes && (
                <>
                  <Separator className="dark:bg-gray-700" />
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Notas</p>
                    <p className="text-gray-900 dark:text-white whitespace-pre-wrap">
                      {movement.notes}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Source Info */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                <Wallet className="h-5 w-5" />
                {movement.source === 'cash' ? 'Movimiento de Caja' : 'Transacción Bancaria'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Fuente</p>
                  <Badge
                    className={
                      movement.source === 'cash'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    }
                  >
                    {movement.source === 'cash' ? 'Caja' : 'Banco'}
                  </Badge>
                </div>
                {movement.bank_account_name && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Cuenta Bancaria</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {movement.bank_account_name}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Side Panel */}
        <div className="space-y-6">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                <FileText className="h-5 w-5" />
                Identificador
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-900 dark:text-white font-mono text-sm">
                {movement.uuid}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white">
            <CardContent className="pt-6">
              <p className="text-red-100 text-sm">Monto Total</p>
              <p className="text-3xl font-bold mt-1">
                {formatCurrency(movement.amount)}
              </p>
              <p className="text-red-100 text-sm mt-2">
                Egreso registrado el {formatDate(movement.created_at)}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
