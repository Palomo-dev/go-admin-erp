'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileText, Loader2, Check, Copy, Trash2, ArrowLeft, Edit, Calendar, User, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { ContabilidadService, JournalEntry } from '../ContabilidadService';
import { formatCurrency } from '@/utils/Utils';

interface AsientoDetailPageProps {
  entryId: number;
}

export function AsientoDetailPage({ entryId }: AsientoDetailPageProps) {
  const router = useRouter();
  const [asiento, setAsiento] = useState<JournalEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadAsiento();
  }, [entryId]);

  const loadAsiento = async () => {
    try {
      setIsLoading(true);
      const data = await ContabilidadService.obtenerAsiento(entryId);
      if (!data) {
        toast.error('Asiento no encontrado');
        router.push('/app/finanzas/contabilidad/asientos');
        return;
      }
      setAsiento(data);
    } catch (error) {
      console.error('Error cargando asiento:', error);
      toast.error('Error al cargar el asiento');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!asiento) return;
    try {
      setIsProcessing(true);
      await ContabilidadService.publicarAsiento(asiento.id);
      toast.success('Asiento publicado exitosamente');
      loadAsiento();
    } catch (error) {
      toast.error('Error al publicar el asiento');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDuplicate = async () => {
    if (!asiento) return;
    try {
      setIsProcessing(true);
      const newEntry = await ContabilidadService.duplicarAsiento(asiento.id);
      toast.success('Asiento duplicado exitosamente');
      router.push(`/app/finanzas/contabilidad/asientos/${newEntry.id}`);
    } catch (error) {
      toast.error('Error al duplicar el asiento');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!asiento || asiento.posted) return;
    if (!confirm('¿Estás seguro de eliminar este asiento?')) return;
    try {
      setIsProcessing(true);
      await ContabilidadService.eliminarAsiento(asiento.id);
      toast.success('Asiento eliminado exitosamente');
      router.push('/app/finanzas/contabilidad/asientos');
    } catch (error) {
      toast.error('Error al eliminar el asiento');
    } finally {
      setIsProcessing(false);
    }
  };

  const getTotalDebits = () => asiento?.lines?.reduce((sum, l) => sum + (l.debit || 0), 0) || 0;
  const getTotalCredits = () => asiento?.lines?.reduce((sum, l) => sum + (l.credit || 0), 0) || 0;

  if (isLoading) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!asiento) return null;

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/finanzas/contabilidad/asientos">
            <Button variant="ghost" size="icon" className="hover:bg-gray-100 dark:hover:bg-gray-800">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <FileText className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Asiento #{asiento.id}
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              {asiento.memo || 'Sin descripción'}
            </p>
          </div>
          {asiento.posted 
            ? <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Publicado</Badge>
            : <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">Borrador</Badge>
          }
        </div>

        <div className="flex flex-wrap gap-2">
          {!asiento.posted && (
            <Button onClick={handlePublish} disabled={isProcessing} className="bg-green-600 hover:bg-green-700">
              <Check className="h-4 w-4 mr-2" />
              Publicar
            </Button>
          )}
          <Button variant="outline" onClick={handleDuplicate} disabled={isProcessing} className="dark:border-gray-600">
            <Copy className="h-4 w-4 mr-2" />
            Duplicar
          </Button>
          {!asiento.posted && (
            <Button variant="outline" onClick={handleDelete} disabled={isProcessing} className="text-red-600 border-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminar
            </Button>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Fecha</p>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {new Date(asiento.entry_date).toLocaleDateString('es-CO', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <LinkIcon className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Origen</p>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {asiento.source || 'Manual'}
                  {asiento.source_id && <span className="text-gray-500 ml-1">#{asiento.source_id}</span>}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Creado</p>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {new Date(asiento.created_at).toLocaleString('es-CO')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Líneas */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white">Líneas del Asiento</CardTitle>
          <CardDescription className="dark:text-gray-400">
            {asiento.lines?.length || 0} líneas registradas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="dark:border-gray-700">
                <TableHead className="dark:text-gray-300">Cuenta</TableHead>
                <TableHead className="dark:text-gray-300">Descripción</TableHead>
                <TableHead className="text-right dark:text-gray-300">Débito</TableHead>
                <TableHead className="text-right dark:text-gray-300">Crédito</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {asiento.lines?.map((line) => (
                <TableRow key={line.id} className="dark:border-gray-700">
                  <TableCell>
                    <div>
                      <span className="font-mono text-sm text-gray-600 dark:text-gray-400">
                        {line.account_code}
                      </span>
                      {line.account && (
                        <span className="ml-2 text-gray-900 dark:text-white">
                          {line.account.name}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-700 dark:text-gray-300">
                    {line.description || '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-gray-900 dark:text-white">
                    {line.debit > 0 ? formatCurrency(line.debit) : '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-gray-900 dark:text-white">
                    {line.credit > 0 ? formatCurrency(line.credit) : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Separator className="my-4 dark:bg-gray-700" />

          {/* Totales */}
          <div className="flex justify-end gap-8">
            <div className="text-right">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Débitos</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(getTotalDebits())}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Créditos</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(getTotalCredits())}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500 dark:text-gray-400">Balance</p>
              <p className={`text-xl font-bold ${Math.abs(getTotalDebits() - getTotalCredits()) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                {Math.abs(getTotalDebits() - getTotalCredits()) < 0.01 ? '✓ Balanceado' : formatCurrency(Math.abs(getTotalDebits() - getTotalCredits()))}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
