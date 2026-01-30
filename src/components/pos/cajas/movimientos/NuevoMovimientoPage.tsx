'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, TrendingDown, Save, RefreshCw, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { formatCurrency, cn } from '@/utils/Utils';
import { CajasService } from '../CajasService';
import type { CashSession, CreateCashMovementData } from '../types';
import { toast } from 'sonner';

interface NuevoMovimientoPageProps {
  sessionUuid: string;
}

const INCOME_CONCEPTS = ['Cambio de efectivo', 'Depósito bancario', 'Préstamo interno', 'Fondo adicional', 'Otro ingreso'];
const EXPENSE_CONCEPTS = ['Compra de insumos', 'Pago a proveedor', 'Retiro para depósito', 'Gasto operativo', 'Devolución cliente', 'Otro egreso'];

export function NuevoMovimientoPage({ sessionUuid }: NuevoMovimientoPageProps) {
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

  useEffect(() => {
    if (organization?.id && sessionUuid) {
      loadSession();
    }
  }, [organization, sessionUuid]);

  const loadSession = async () => {
    setIsLoading(true);
    try {
      const sessionData = await CajasService.getSessionByUuid(sessionUuid);
      setSession(sessionData);
    } catch (error: any) {
      console.error('Error loading session:', error);
      toast.error('Error al cargar datos de la sesión');
    } finally {
      setIsLoading(false);
    }
  };

  const concepts = type === 'in' ? INCOME_CONCEPTS : EXPENSE_CONCEPTS;
  const finalConcept = concept === 'otro' ? customConcept : concept;
  const amountValue = parseFloat(amount) || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    if (!finalConcept) { toast.error('Por favor ingrese un concepto'); return; }
    if (amountValue <= 0) { toast.error('Por favor ingrese un monto válido'); return; }

    setIsSaving(true);
    try {
      const data: CreateCashMovementData = { type, concept: finalConcept, amount: amountValue, notes: notes || undefined };
      await CajasService.addMovementToSessionByUuid(sessionUuid, data);
      toast.success('Movimiento registrado', { description: `${type === 'in' ? 'Ingreso' : 'Egreso'}: ${formatCurrency(amountValue)}` });
      router.push(`/app/pos/cajas/${sessionUuid}`);
    } catch (error: any) {
      console.error('Error creating movement:', error);
      toast.error('Error al registrar movimiento', { description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  if (orgLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <div className="container mx-auto max-w-2xl flex justify-center items-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-3 text-lg dark:text-gray-300">Cargando...</span>
        </div>
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
              <h2 className="text-lg font-semibold mb-2 dark:text-white">{!session ? 'Sesión no encontrada' : 'Sesión cerrada'}</h2>
              <p className="text-gray-500 dark:text-gray-400 mb-4">{!session ? 'La sesión de caja solicitada no existe.' : 'No se pueden registrar movimientos en una sesión cerrada.'}</p>
              <Link href="/app/pos/cajas"><Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" />Volver a Cajas</Button></Link>
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
          <Link href={`/app/pos/cajas/${sessionUuid}`}><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
          <div>
            <h1 className="text-2xl font-bold dark:text-white">Nuevo Movimiento</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Sesión #{session.id} - Registrar ingreso o egreso</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader><CardTitle className="text-lg dark:text-white">Tipo de Movimiento</CardTitle></CardHeader>
            <CardContent>
              <RadioGroup value={type} onValueChange={(v: string) => { setType(v as 'in' | 'out'); setConcept(''); }} className="grid grid-cols-2 gap-4">
                <div>
                  <RadioGroupItem value="in" id="in" className="peer sr-only" />
                  <Label htmlFor="in" className={cn("flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-green-500 cursor-pointer", type === 'in' && "border-green-500 bg-green-50 dark:bg-green-900/20")}>
                    <TrendingUp className={cn("mb-3 h-6 w-6", type === 'in' ? "text-green-600" : "text-gray-400")} />
                    <span className="font-semibold">Ingreso</span>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem value="out" id="out" className="peer sr-only" />
                  <Label htmlFor="out" className={cn("flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-red-500 cursor-pointer", type === 'out' && "border-red-500 bg-red-50 dark:bg-red-900/20")}>
                    <TrendingDown className={cn("mb-3 h-6 w-6", type === 'out' ? "text-red-600" : "text-gray-400")} />
                    <span className="font-semibold">Egreso</span>
                  </Label>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader><CardTitle className="text-lg dark:text-white">Detalles</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Concepto</Label>
                <Select value={concept} onValueChange={setConcept}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar concepto" /></SelectTrigger>
                  <SelectContent>
                    {concepts.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                    <SelectItem value="otro">Otro (especificar)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {concept === 'otro' && (
                <div className="space-y-2">
                  <Label>Especificar concepto</Label>
                  <Input value={customConcept} onChange={(e) => setCustomConcept(e.target.value)} placeholder="Ingrese el concepto..." />
                </div>
              )}
              <div className="space-y-2">
                <Label>Monto</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <Input type="number" min="0" step="100" value={amount} onChange={(e) => setAmount(e.target.value)} className="pl-8" placeholder="0" />
                </div>
                {amountValue > 0 && (<p className={cn("text-sm mt-1", type === 'in' ? "text-green-600" : "text-red-600")}>{type === 'in' ? '+' : '-'}{formatCurrency(amountValue)}</p>)}
              </div>
              <div className="space-y-2">
                <Label>Notas (opcional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones adicionales..." />
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Link href={`/app/pos/cajas/${sessionUuid}`} className="flex-1"><Button type="button" variant="outline" className="w-full">Cancelar</Button></Link>
            <Button type="submit" className="flex-1" disabled={isSaving || !finalConcept || amountValue <= 0}>
              {isSaving ? (<><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Guardando...</>) : (<><Save className="h-4 w-4 mr-2" />Guardar Movimiento</>)}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
