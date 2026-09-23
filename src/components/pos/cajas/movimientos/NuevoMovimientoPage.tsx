'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, TrendingDown, Save, RefreshCw, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { PageHeaderSkeleton, DetailSkeleton } from '@/components/common/PageSkeletons';
import { formatCurrency, cn } from '@/utils/Utils';
import { CajasService } from '../CajasService';
import type { CashSession, CreateCashMovementData } from '../types';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

interface NuevoMovimientoPageProps {
  sessionUuid: string;
}

// `valor` es lo que se guarda en cash_movements.concept (se conserva en español,
// como hasta ahora); `clave` es la etiqueta traducida que ve el usuario.
const INCOME_CONCEPTS = [
  { valor: 'Cambio de efectivo', clave: 'cambioEfectivo' },
  { valor: 'Depósito bancario', clave: 'depositoBancario' },
  { valor: 'Préstamo interno', clave: 'prestamoInterno' },
  { valor: 'Fondo adicional', clave: 'fondoAdicional' },
  { valor: 'Otro ingreso', clave: 'otroIngreso' },
];
const EXPENSE_CONCEPTS = [
  { valor: 'Compra de insumos', clave: 'compraInsumos' },
  { valor: 'Pago a proveedor', clave: 'pagoProveedor' },
  { valor: 'Retiro para depósito', clave: 'retiroDeposito' },
  { valor: 'Gasto operativo', clave: 'gastoOperativo' },
  { valor: 'Devolución cliente', clave: 'devolucionCliente' },
  { valor: 'Otro egreso', clave: 'otroEgreso' },
];

export function NuevoMovimientoPage({ sessionUuid }: NuevoMovimientoPageProps) {
  const t = useTranslations('cajas.detalle');
  const router = useRouter();
  const { organization, isLoading: orgLoading } = useOrganization();
  const [session, setSession] = useState<CashSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [type, setType] = useState<'in' | 'out'>('in');
  const [concept, setConcept] = useState('');
  const [customConcept, setCustomConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  const loadSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const sessionData = await CajasService.getSessionByUuid(sessionUuid);
      setSession(sessionData);
    } catch (error: unknown) {
      console.error('Error loading session:', error);
      toast.error(t('comun.errorCargar'));
    } finally {
      setIsLoading(false);
    }
  }, [sessionUuid, t]);

  useEffect(() => {
    if (organization?.id && sessionUuid) {
      loadSession();
    }
  }, [organization, sessionUuid, loadSession]);

  const concepts = type === 'in' ? INCOME_CONCEPTS : EXPENSE_CONCEPTS;
  const finalConcept = concept === 'otro' ? customConcept : concept;
  const amountValue = parseFloat(amount) || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    if (!finalConcept) { toast.error(t('movimiento.toastConcepto')); return; }
    if (amountValue <= 0) { toast.error(t('movimiento.toastMonto')); return; }

    setIsSaving(true);
    try {
      const data: CreateCashMovementData = { type, concept: finalConcept, amount: amountValue, notes: notes || undefined };
      await CajasService.addMovementToSessionByUuid(sessionUuid, data);
      toast.success(t('movimiento.toastRegistrado'), {
        description: type === 'in'
          ? t('movimiento.toastIngreso', { monto: formatCurrency(amountValue) })
          : t('movimiento.toastEgreso', { monto: formatCurrency(amountValue) }),
      });
      router.push(`/app/pos/cajas/${sessionUuid}`);
    } catch (error: unknown) {
      console.error('Error creating movement:', error);
      toast.error(t('movimiento.toastError'), { description: error instanceof Error ? error.message : undefined });
    } finally {
      setIsSaving(false);
    }
  };

  if (orgLoading || isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <DetailSkeleton />
      </div>
    );
  }

  if (!session || session.status !== 'open') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <div className="container mx-auto max-w-2xl">
          <Card className="dark:bg-gray-800">
            <CardContent className="p-6 text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
              <h2 className="text-lg font-semibold mb-2 dark:text-white">{!session ? t('comun.sesionNoEncontrada') : t('comun.sesionCerrada')}</h2>
              <p className="text-gray-500 dark:text-gray-400 mb-4">{!session ? t('comun.sesionNoExiste') : t('movimiento.sesionCerrada')}</p>
              <Link href="/app/pos/cajas"><Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" />{t('comun.volverCajas')}</Button></Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="container mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-4">
          <Link href={`/app/pos/cajas/${sessionUuid}`}><Button variant="ghost" size="icon" aria-label={t('comun.volver')}><ArrowLeft className="h-5 w-5" /></Button></Link>
          <div>
            <h1 className="text-2xl font-bold dark:text-white">{t('movimiento.titulo')}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('movimiento.subtitulo', { id: session.id })}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader><CardTitle className="text-lg dark:text-white">{t('movimiento.tipoTitulo')}</CardTitle></CardHeader>
            <CardContent>
              <RadioGroup value={type} onValueChange={(v: string) => { setType(v as 'in' | 'out'); setConcept(''); }} className="grid grid-cols-2 gap-4">
                <div>
                  <RadioGroupItem value="in" id="in" className="peer sr-only" />
                  <Label htmlFor="in" className={cn("flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-green-500 cursor-pointer", type === 'in' && "border-green-500 bg-green-50 dark:bg-green-900/20")}>
                    <TrendingUp className={cn("mb-3 h-6 w-6", type === 'in' ? "text-green-600" : "text-gray-400")} />
                    <span className="font-semibold">{t('movimiento.ingreso')}</span>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem value="out" id="out" className="peer sr-only" />
                  <Label htmlFor="out" className={cn("flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-red-500 cursor-pointer", type === 'out' && "border-red-500 bg-red-50 dark:bg-red-900/20")}>
                    <TrendingDown className={cn("mb-3 h-6 w-6", type === 'out' ? "text-red-600" : "text-gray-400")} />
                    <span className="font-semibold">{t('movimiento.egreso')}</span>
                  </Label>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader><CardTitle className="text-lg dark:text-white">{t('movimiento.detalles')}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t('movimiento.concepto')}</Label>
                <Select value={concept} onValueChange={setConcept}>
                  <SelectTrigger><SelectValue placeholder={t('movimiento.seleccionarConcepto')} /></SelectTrigger>
                  <SelectContent>
                    {concepts.map((c) => (<SelectItem key={c.valor} value={c.valor}>{t(`movimiento.conceptos.${c.clave}`)}</SelectItem>))}
                    <SelectItem value="otro">{t('movimiento.otro')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {concept === 'otro' && (
                <div className="space-y-2">
                  <Label>{t('movimiento.especificar')}</Label>
                  <Input value={customConcept} onChange={(e) => setCustomConcept(e.target.value)} placeholder={t('movimiento.conceptoPlaceholder')} />
                </div>
              )}
              <div className="space-y-2">
                <Label>{t('movimiento.monto')}</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <Input type="number" min="0" step="100" value={amount} onChange={(e) => setAmount(e.target.value)} className="pl-8" placeholder="0" />
                </div>
                {amountValue > 0 && (<p className={cn("text-sm mt-1", type === 'in' ? "text-green-600" : "text-red-600")}>{type === 'in' ? '+' : '-'}{formatCurrency(amountValue)}</p>)}
              </div>
              <div className="space-y-2">
                <Label>{t('movimiento.notas')}</Label>
                <RichTextEditor value={notes} onChange={(html) => setNotes(html)} placeholder={t('movimiento.notasPlaceholder')} />
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Link href={`/app/pos/cajas/${sessionUuid}`} className="flex-1"><Button type="button" variant="outline" className="w-full">{t('movimiento.cancelar')}</Button></Link>
            <Button type="submit" className="flex-1" disabled={isSaving || !finalConcept || amountValue <= 0}>
              {isSaving ? (<><RefreshCw className="h-4 w-4 mr-2 animate-spin" />{t('comun.guardando')}</>) : (<><Save className="h-4 w-4 mr-2" />{t('movimiento.guardar')}</>)}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
