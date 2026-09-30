'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {FileText, Check, Copy, Trash2, ArrowLeft, Undo2, Loader2} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ContabilidadService, JournalEntry, EstadoReversion } from '../ContabilidadService';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { DetailSkeleton } from '@/components/common/PageSkeletons';
import { OrigenCompraAsiento } from './OrigenCompraAsiento';
import { DatosAsiento } from './DatosAsiento';

interface AsientoDetailPageProps {
  entryId: number;
}

export function AsientoDetailPage({ entryId }: AsientoDetailPageProps) {
  const router = useRouter();
  // Los importes contables se llevan en la moneda base de la organizacion.
  const { formatear } = useMonedaOrganizacion();
  const [asiento, setAsiento] = useState<JournalEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [reversion, setReversion] = useState<EstadoReversion>({ revertidoPor: null, reversionDe: null });
  const [puedeRevertir, setPuedeRevertir] = useState(false);
  const [dialogoRevertir, setDialogoRevertir] = useState(false);
  const [motivo, setMotivo] = useState('');
  const tl = useTranslations('asientoContable.lineas');
  const [centros, setCentros] = useState<Map<string, { code: string; name: string }>>(new Map());

  useEffect(() => {
    loadAsiento();
    ContabilidadService.puedeRevertir().then(setPuedeRevertir).catch(() => setPuedeRevertir(false));
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
      const idsCentros = [...new Set((data.lines ?? []).map((l) => l.cost_center_id).filter((id): id is string => !!id))];
      const [estadoReversion, nombresCentros] = await Promise.all([
        ContabilidadService.obtenerReversion(data),
        ContabilidadService.centrosDeCosto(idsCentros).catch(() => new Map<string, { code: string; name: string }>()),
      ]);
      setReversion(estadoReversion);
      setCentros(nombresCentros);
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
      toast.error(error instanceof Error ? error.message : 'Error al publicar el asiento');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDuplicate = async () => {
    if (!asiento) return;
    try {
      setIsProcessing(true);
      const newEntry = await ContabilidadService.duplicarAsiento(asiento.id);
      toast.success('Asiento duplicado como borrador');
      router.push(`/app/finanzas/contabilidad/asientos/${newEntry.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al duplicar el asiento');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!asiento || asiento.posted) return;
    if (!confirm('¿Descartar este borrador? Un borrador nunca se publicó y no deja rastro contable.')) return;
    try {
      setIsProcessing(true);
      await ContabilidadService.eliminarAsiento(asiento.id);
      toast.success('Borrador descartado');
      router.push('/app/finanzas/contabilidad/asientos');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al descartar el borrador');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRevertir = async () => {
    if (!asiento) return;
    try {
      setIsProcessing(true);
      const contraAsiento = await ContabilidadService.revertirAsiento(asiento.id, motivo.trim());
      toast.success(`Asiento revertido con el contra-asiento #${contraAsiento}`);
      setDialogoRevertir(false);
      setMotivo('');
      loadAsiento();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al revertir el asiento');
    } finally {
      setIsProcessing(false);
    }
  };

  // Solo los manuales publicados se revierten directo; los automáticos, anulando su documento.
  const esManual = asiento?.source === 'manual';
  const esContraAsiento = asiento?.source === 'reversal';
  const revertible = !!asiento?.posted && esManual && !reversion.revertidoPor;

  const getTotalDebits = () => asiento?.lines?.reduce((sum, l) => sum + (l.debit || 0), 0) || 0;
  const getTotalCredits = () => asiento?.lines?.reduce((sum, l) => sum + (l.credit || 0), 0) || 0;

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <DetailSkeleton />
      </div>
    );
  }

  if (!asiento) return null;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
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
          {reversion.revertidoPor && (
            <Link href={`/app/finanzas/contabilidad/asientos/${reversion.revertidoPor}`}>
              <Badge variant="outline" className="border-red-300 text-red-700 dark:border-red-700 dark:text-red-400">
                Revertido por #{reversion.revertidoPor}
              </Badge>
            </Link>
          )}
          {reversion.reversionDe && (
            <Link href={`/app/finanzas/contabilidad/asientos/${reversion.reversionDe}`}>
              <Badge variant="outline" className="border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-300">
                Reversión de #{reversion.reversionDe}
              </Badge>
            </Link>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {!asiento.posted && (
            <Button onClick={handlePublish} disabled={isProcessing} className="bg-green-600 hover:bg-green-700">
              <Check className="h-4 w-4 mr-2" />
              Publicar
            </Button>
          )}
          {revertible && puedeRevertir && (
            <Button variant="outline" onClick={() => setDialogoRevertir(true)} disabled={isProcessing} className="text-red-600 border-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
              <Undo2 className="h-4 w-4 mr-2" />
              Revertir
            </Button>
          )}
          {!esContraAsiento && (
            <Button variant="outline" onClick={handleDuplicate} disabled={isProcessing} className="dark:border-gray-600">
              <Copy className="h-4 w-4 mr-2" />
              Duplicar
            </Button>
          )}
          {!asiento.posted && (
            <Button variant="outline" onClick={handleDelete} disabled={isProcessing} className="text-red-600 border-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
              <Trash2 className="h-4 w-4 mr-2" />
              Descartar borrador
            </Button>
          )}
        </div>
      </div>

      {asiento.source === 'invoice_purchase' && asiento.source_id && <OrigenCompraAsiento facturaId={asiento.source_id} />}

      {asiento.posted && !esManual && !esContraAsiento && !reversion.revertidoPor && asiento.source !== 'invoice_purchase' && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Este asiento es automático: no se edita ni se borra. Para revertirlo, anula el documento que lo originó.
        </p>
      )}

      <Dialog open={dialogoRevertir} onOpenChange={(abierto) => { setDialogoRevertir(abierto); if (!abierto) setMotivo(''); }}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">Revertir asiento #{asiento.id}</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              Se registra un contra-asiento con los débitos y créditos invertidos. El asiento original no se modifica.
              Si su periodo está cerrado, el contra-asiento queda con la fecha de hoy.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo-reversion" className="text-gray-700 dark:text-gray-300">Motivo *</Label>
            <Textarea
              id="motivo-reversion"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Por qué se revierte este asiento"
              className="dark:bg-gray-900 dark:border-gray-600"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogoRevertir(false)} className="dark:border-gray-600">
              Cancelar
            </Button>
            <Button onClick={handleRevertir} disabled={isProcessing || motivo.trim().length < 5} className="bg-red-600 hover:bg-red-700">
              {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Revertir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Líneas */}
      <Card className="dark:bg-gray-800 dark:border-gray-700 lg:col-span-2">
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
                {centros.size > 0 && <TableHead className="dark:text-gray-300">{tl('centroCosto')}</TableHead>}
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
                  {centros.size > 0 && (
                    <TableCell className="text-gray-700 dark:text-gray-300">
                      {line.cost_center_id && centros.get(line.cost_center_id)
                        ? `${centros.get(line.cost_center_id)?.code} · ${centros.get(line.cost_center_id)?.name}`
                        : '-'}
                    </TableCell>
                  )}
                  <TableCell className="text-right font-mono text-gray-900 dark:text-white">
                    {line.debit > 0 ? formatear(line.debit) : '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-gray-900 dark:text-white">
                    {line.credit > 0 ? formatear(line.credit) : '-'}
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
                {formatear(getTotalDebits())}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Créditos</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {formatear(getTotalCredits())}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500 dark:text-gray-400">Balance</p>
              <p className={`text-xl font-bold ${Math.abs(getTotalDebits() - getTotalCredits()) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                {Math.abs(getTotalDebits() - getTotalCredits()) < 0.01 ? '✓ Balanceado' : formatear(Math.abs(getTotalDebits() - getTotalCredits()))}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      <DatosAsiento asiento={asiento} />
      </div>
    </div>
  );
}
