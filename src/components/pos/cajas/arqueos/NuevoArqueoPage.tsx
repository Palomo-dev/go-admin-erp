'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Calculator,
  Save,
  RefreshCw,
  DollarSign,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { formatCurrency, cn } from '@/utils/Utils';
import { CajasService } from '../CajasService';
import type { CashSession, CashSummary, CashDenominations, CreateCashCountData } from '../types';
import { toast } from 'sonner';

interface NuevoArqueoPageProps {
  sessionUuid: string;
}

// Denominaciones colombianas
const BILL_DENOMINATIONS = [100000, 50000, 20000, 10000, 5000, 2000, 1000];
const COIN_DENOMINATIONS = [1000, 500, 200, 100, 50];

export function NuevoArqueoPage({ sessionUuid }: NuevoArqueoPageProps) {
  const router = useRouter();
  const { organization, isLoading: orgLoading } = useOrganization();
  const [session, setSession] = useState<CashSession | null>(null);
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [countType, setCountType] = useState<'opening' | 'partial' | 'closing'>('partial');
  const [notes, setNotes] = useState('');
  const [bills, setBills] = useState<Record<string, number>>({});
  const [coins, setCoins] = useState<Record<string, number>>({});

  useEffect(() => {
    if (organization?.id && sessionUuid) {
      loadSessionData();
    }
  }, [organization, sessionUuid]);

  const loadSessionData = async () => {
    setIsLoading(true);
    try {
      const [sessionData, summaryData] = await Promise.all([
        CajasService.getSessionByUuid(sessionUuid),
        CajasService.getCashSummaryByUuid(sessionUuid)
      ]);
      setSession(sessionData);
      setSummary(summaryData);
    } catch (error: any) {
      console.error('Error loading session:', error);
      toast.error('Error al cargar datos de la sesión');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBillChange = (denomination: number, quantity: string) => {
    const qty = parseInt(quantity) || 0;
    setBills(prev => ({ ...prev, [denomination.toString()]: qty }));
  };

  const handleCoinChange = (denomination: number, quantity: string) => {
    const qty = parseInt(quantity) || 0;
    setCoins(prev => ({ ...prev, [denomination.toString()]: qty }));
  };

  const calculateTotal = () => {
    let total = 0;
    Object.entries(bills).forEach(([denom, qty]) => {
      total += parseInt(denom) * qty;
    });
    Object.entries(coins).forEach(([denom, qty]) => {
      total += parseInt(denom) * qty;
    });
    return total;
  };

  const countedAmount = calculateTotal();
  const expectedAmount = summary?.expected_amount || 0;
  const difference = countedAmount - expectedAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    setIsSaving(true);
    try {
      const denominations: CashDenominations = {};
      
      // Solo incluir denominaciones con cantidad > 0
      const filteredBills: Record<string, number> = {};
      Object.entries(bills).forEach(([denom, qty]) => {
        if (qty > 0) filteredBills[denom] = qty;
      });
      if (Object.keys(filteredBills).length > 0) {
        denominations.bills = filteredBills;
      }

      const filteredCoins: Record<string, number> = {};
      Object.entries(coins).forEach(([denom, qty]) => {
        if (qty > 0) filteredCoins[denom] = qty;
      });
      if (Object.keys(filteredCoins).length > 0) {
        denominations.coins = filteredCoins;
      }

      const data: CreateCashCountData = {
        count_type: countType,
        counted_amount: countedAmount,
        expected_amount: expectedAmount,
        denominations: Object.keys(denominations).length > 0 ? denominations : undefined,
        notes: notes || undefined
      };

      await CajasService.createCashCountByUuid(sessionUuid, data);
      
      toast.success('Arqueo registrado exitosamente', {
        description: `Diferencia: ${formatCurrency(difference)}`
      });
      
      router.push(`/app/pos/cajas/${sessionUuid}`);
    } catch (error: any) {
      console.error('Error creating cash count:', error);
      toast.error('Error al registrar arqueo', {
        description: error.message
      });
    } finally {
      setIsSaving(false);
    }
  };

  const clearDenominations = () => {
    setBills({});
    setCoins({});
  };

  if (orgLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <div className="container mx-auto max-w-4xl">
          <div className="flex justify-center items-center h-64">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-3 text-lg dark:text-gray-300">Cargando...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!session || session.status !== 'open') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <div className="container mx-auto max-w-4xl">
          <Card className="dark:bg-gray-800">
            <CardContent className="p-6 text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
              <h2 className="text-lg font-semibold mb-2 dark:text-white">
                {!session ? 'Sesión no encontrada' : 'Sesión cerrada'}
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {!session 
                  ? 'La sesión de caja solicitada no existe.'
                  : 'No se pueden registrar arqueos en una sesión cerrada.'
                }
              </p>
              <Link href="/app/pos/cajas">
                <Button variant="outline">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Volver a Cajas
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="container mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href={`/app/pos/cajas/${sessionUuid}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold dark:text-white">Nuevo Arqueo</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Sesión #{session.id} - Registrar conteo de caja
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Formulario Principal */}
            <div className="lg:col-span-2 space-y-6">
              {/* Tipo de Arqueo */}
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader>
                  <CardTitle className="text-lg dark:text-white">Tipo de Arqueo</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={countType} onValueChange={(v) => setCountType(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="opening">Apertura</SelectItem>
                      <SelectItem value="partial">Parcial</SelectItem>
                      <SelectItem value="closing">Cierre</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {/* Desglose de Billetes */}
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg dark:text-white">Billetes</CardTitle>
                  <Button type="button" variant="ghost" size="sm" onClick={clearDenominations}>
                    Limpiar
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {BILL_DENOMINATIONS.map((denom) => (
                      <div key={denom} className="space-y-1">
                        <Label className="text-xs text-gray-500 dark:text-gray-400">
                          {formatCurrency(denom)}
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            value={bills[denom.toString()] || ''}
                            onChange={(e) => handleBillChange(denom, e.target.value)}
                            className="text-center"
                            placeholder="0"
                          />
                        </div>
                        {(bills[denom.toString()] || 0) > 0 && (
                          <p className="text-xs text-green-600 dark:text-green-400 text-right">
                            = {formatCurrency(denom * (bills[denom.toString()] || 0))}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Desglose de Monedas */}
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader>
                  <CardTitle className="text-lg dark:text-white">Monedas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                    {COIN_DENOMINATIONS.map((denom) => (
                      <div key={denom} className="space-y-1">
                        <Label className="text-xs text-gray-500 dark:text-gray-400">
                          {formatCurrency(denom)}
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            value={coins[denom.toString()] || ''}
                            onChange={(e) => handleCoinChange(denom, e.target.value)}
                            className="text-center"
                            placeholder="0"
                          />
                        </div>
                        {(coins[denom.toString()] || 0) > 0 && (
                          <p className="text-xs text-green-600 dark:text-green-400 text-right">
                            = {formatCurrency(denom * (coins[denom.toString()] || 0))}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Notas */}
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader>
                  <CardTitle className="text-lg dark:text-white">Notas</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Observaciones del arqueo..."
                    className="min-h-[100px]"
                  />
                </CardContent>
              </Card>
            </div>

            {/* Resumen */}
            <div className="space-y-6">
              <Card className="dark:bg-gray-800 dark:border-gray-700 sticky top-4">
                <CardHeader>
                  <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                    <Calculator className="h-5 w-5" />
                    Resumen
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between py-2 border-b dark:border-gray-700">
                      <span className="text-gray-600 dark:text-gray-400">Monto Esperado</span>
                      <span className="font-medium dark:text-white">{formatCurrency(expectedAmount)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b dark:border-gray-700">
                      <span className="text-gray-600 dark:text-gray-400">Monto Contado</span>
                      <span className="font-bold text-xl text-blue-600 dark:text-blue-400">
                        {formatCurrency(countedAmount)}
                      </span>
                    </div>
                    <Separator />
                    <div className="flex justify-between items-center py-2">
                      <span className="font-semibold dark:text-white">Diferencia</span>
                      <div className="flex items-center gap-2">
                        {difference >= 0 ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-red-500" />
                        )}
                        <span className={cn(
                          "font-bold text-xl",
                          difference >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                        )}>
                          {formatCurrency(difference)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {difference !== 0 && (
                    <div className={cn(
                      "p-3 rounded-lg",
                      difference > 0 
                        ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                        : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
                    )}>
                      <p className="text-sm">
                        {difference > 0 
                          ? `Sobrante de ${formatCurrency(difference)}`
                          : `Faltante de ${formatCurrency(Math.abs(difference))}`
                        }
                      </p>
                    </div>
                  )}

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={isSaving || countedAmount === 0}
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Guardar Arqueo
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
