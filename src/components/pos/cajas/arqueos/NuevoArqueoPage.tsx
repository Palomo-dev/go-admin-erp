'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Calculator,
  Save,
  RefreshCw,
  DollarSign,
  AlertCircle,
  CheckCircle,
  CreditCard,
  Banknote,
  Smartphone,
  Wallet,
  EyeOff,
} from 'lucide-react';
import { PageHeaderSkeleton, DetailSkeleton } from '@/components/common/PageSkeletons';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
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
import { diferenciaEfectivo } from '@/lib/pos/cajas/arqueo';
import { ConfiguracionService } from '@/components/pos/configuracion/configuracionService';
import { useBlindCloseMode } from '../useBlindCloseMode';
import type { CashSession, CashSummary, CashDenominations, CreateCashCountData } from '../types';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

interface NuevoArqueoPageProps {
  sessionUuid: string;
}

// Denominaciones colombianas
const BILL_DENOMINATIONS = [100000, 50000, 20000, 10000, 5000, 2000, 1000];
const COIN_DENOMINATIONS = [1000, 500, 200, 100, 50];

export function NuevoArqueoPage({ sessionUuid }: NuevoArqueoPageProps) {
  const t = useTranslations('cajas.detalle');
  const router = useRouter();
  const { organization, isLoading: orgLoading } = useOrganization();
  const [session, setSession] = useState<CashSession | null>(null);
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { isBlindMode, isOrgAdmin, showExpected } = useBlindCloseMode();
  const [paymentMethods, setPaymentMethods] = useState<{ code: string; name: string }[]>([]);

  // Form state
  const [countType, setCountType] = useState<'opening' | 'partial' | 'closing'>('partial');
  const [notes, setNotes] = useState('');
  const [bills, setBills] = useState<Record<string, number>>({});
  const [coins, setCoins] = useState<Record<string, number>>({});
  const [methodCounts, setMethodCounts] = useState<Record<string, number>>({});

  const loadPaymentMethods = useCallback(async () => {
    try {
      const methods = await ConfiguracionService.getPaymentMethods();
      const activeMethods = methods
        .filter(m => m.is_active)
        .map(m => ({ code: m.payment_method_code, name: m.payment_methods?.name || m.payment_method_code }));
      setPaymentMethods(activeMethods);
    } catch (err) {
      console.warn('Error loading payment methods:', err);
    }
  }, []);

  const loadSessionData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [sessionData, summaryData] = await Promise.all([
        CajasService.getSessionByUuid(sessionUuid),
        CajasService.getCashSummaryByUuid(sessionUuid),
      ]);
      setSession(sessionData);
      setSummary(summaryData);
      await loadPaymentMethods();
    } catch (error: unknown) {
      console.error('Error loading session:', error);
      toast.error(t('comun.errorCargar'));
    } finally {
      setIsLoading(false);
    }
  }, [sessionUuid, t, loadPaymentMethods]);

  useEffect(() => {
    if (organization?.id && sessionUuid) {
      loadSessionData();
    }
  }, [organization, sessionUuid, loadSessionData]);

  const handleBillChange = (denomination: number, quantity: string) => {
    const qty = parseInt(quantity) || 0;
    setBills(prev => ({ ...prev, [denomination.toString()]: qty }));
  };

  const handleCoinChange = (denomination: number, quantity: string) => {
    const qty = parseInt(quantity) || 0;
    setCoins(prev => ({ ...prev, [denomination.toString()]: qty }));
  };

  const handleMethodCountChange = (method: string, value: string) => {
    const amount = parseFloat(value) || 0;
    setMethodCounts(prev => ({ ...prev, [method]: amount }));
  };

  const calculateCashTotal = () => {
    let total = 0;
    Object.entries(bills).forEach(([denom, qty]) => {
      total += parseInt(denom) * qty;
    });
    Object.entries(coins).forEach(([denom, qty]) => {
      total += parseInt(denom) * qty;
    });
    return total;
  };

  const calculateMethodTotal = () => {
    return Object.values(methodCounts).reduce((sum, val) => sum + val, 0);
  };

  const countedAmount = calculateCashTotal() + calculateMethodTotal();
  const cashTotal = calculateCashTotal();
  // El esperado del resumen es SOLO efectivo: la diferencia es efectivo contra
  // efectivo (antes restaba el esperado de efectivo a efectivo + tarjeta + …).
  const expectedAmount = summary?.expected_amount || 0;
  const difference = diferenciaEfectivo(cashTotal, expectedAmount);

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

      // Solo lo contado: el esperado y la diferencia los calcula el servidor.
      const data: CreateCashCountData = {
        count_type: countType,
        counted_amount: cashTotal,
        counted_by_method: methodCounts,
        denominations: Object.keys(denominations).length > 0 ? denominations : undefined,
        notes: notes || undefined
      };

      const guardado = await CajasService.createCashCountByUuid(sessionUuid, data);
      const diferenciaServidor = guardado.difference != null ? Number(guardado.difference) : difference;
      
      toast.success(t('arqueo.toastExito'), {
        description: showExpected
          ? t('arqueo.toastDiferencia', { monto: formatCurrency(diferenciaServidor) })
          : t('arqueo.toastRegistrado')
      });
      
      router.push(`/app/pos/cajas/${sessionUuid}`);
    } catch (error: unknown) {
      console.error('Error creating cash count:', error);
      toast.error(t('arqueo.toastError'), {
        description: error instanceof Error ? error.message : undefined
      });
    } finally {
      setIsSaving(false);
    }
  };

  const clearDenominations = () => {
    setBills({});
    setCoins({});
    setMethodCounts({});
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
        <div className="container mx-auto max-w-4xl">
          <Card className="dark:bg-gray-800">
            <CardContent className="p-6 text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
              <h2 className="text-lg font-semibold mb-2 dark:text-white">
                {!session ? t('comun.sesionNoEncontrada') : t('comun.sesionCerrada')}
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {!session
                  ? t('comun.sesionNoExiste')
                  : t('arqueo.sesionCerrada')
                }
              </p>
              <Link href="/app/pos/cajas">
                <Button variant="outline">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t('comun.volverCajas')}
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const getMethodIcon = (code: string) => {
    switch (code) {
      case 'cash': return <Wallet className="h-4 w-4 text-green-600 dark:text-green-400" />;
      case 'card': return <CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
      case 'transfer': return <Banknote className="h-4 w-4 text-purple-600 dark:text-purple-400" />;
      case 'nequi': case 'daviplata': return <Smartphone className="h-4 w-4 text-orange-600 dark:text-orange-400" />;
      default: return <DollarSign className="h-4 w-4 text-gray-600 dark:text-gray-400" />;
    }
  };

  const getMethodLabel = (code: string) => {
    switch (code) {
      case 'cash': return t('arqueo.metodos.cash');
      case 'card': return t('arqueo.metodos.card');
      case 'transfer': return t('arqueo.metodos.transfer');
      case 'credit': return t('arqueo.metodos.credit');
      default: return code.charAt(0).toUpperCase() + code.slice(1);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href={`/app/pos/cajas/${sessionUuid}`}>
            <Button variant="ghost" size="icon" aria-label={t('comun.volver')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold dark:text-white">{t('arqueo.titulo')}</h1>
              {isBlindMode && !isOrgAdmin && (
                <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 flex items-center gap-1">
                  <EyeOff className="h-3 w-3" />
                  {t('comun.cierreCiego')}
                </Badge>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('arqueo.subtitulo', { id: session.id })}
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
                  <CardTitle className="text-lg dark:text-white">{t('arqueo.tipoTitulo')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={countType} onValueChange={(v) => setCountType(v as 'opening' | 'partial' | 'closing')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="opening">{t('comun.tipoArqueo.opening')}</SelectItem>
                      <SelectItem value="partial">{t('comun.tipoArqueo.partial')}</SelectItem>
                      <SelectItem value="closing">{t('comun.tipoArqueo.closing')}</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {/* Desglose de Billetes */}
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-green-600 dark:text-green-400" />
                    {t('arqueo.billetes')}
                  </CardTitle>
                  <Button type="button" variant="ghost" size="sm" onClick={clearDenominations}>
                    {t('arqueo.limpiar')}
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
                  <CardTitle className="text-lg dark:text-white">{t('arqueo.monedas')}</CardTitle>
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
                  {cashTotal > 0 && (
                    <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">{t('arqueo.totalEfectivo')}</span>
                      <span className="font-bold text-green-600 dark:text-green-400">{formatCurrency(cashTotal)}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Conteo por otros métodos de pago */}
              {paymentMethods.filter(m => m.code !== 'cash').length > 0 && (
                <Card className="dark:bg-gray-800 dark:border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-lg dark:text-white">{t('arqueo.otros.titulo')}</CardTitle>
                    <CardDescription className="text-gray-500 dark:text-gray-400">
                      {t('arqueo.otros.descripcion')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {paymentMethods.filter(m => m.code !== 'cash').map((method) => (
                      <div key={method.code} className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                        <div className="flex-shrink-0 p-2 bg-gray-100 dark:bg-gray-700 rounded-full">
                          {getMethodIcon(method.code)}
                        </div>
                        <div className="flex-1">
                          <Label className="text-sm font-medium dark:text-white text-gray-900">
                            {method.name || getMethodLabel(method.code)}
                          </Label>
                          {showExpected && summary?.income_by_method && summary.income_by_method[method.code] != null && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {t('arqueo.otros.esperado', { monto: formatCurrency(summary.income_by_method[method.code]) })}
                            </p>
                          )}
                        </div>
                        <div className="w-40">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={methodCounts[method.code] || ''}
                            onChange={(e) => handleMethodCountChange(method.code, e.target.value)}
                            className="text-right"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    ))}
                    {calculateMethodTotal() > 0 && (
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex justify-between items-center">
                        <span className="text-sm text-gray-600 dark:text-gray-400">{t('arqueo.otros.total')}</span>
                        <span className="font-bold text-blue-600 dark:text-blue-400">{formatCurrency(calculateMethodTotal())}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Notas */}
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader>
                  <CardTitle className="text-lg dark:text-white">{t('arqueo.notas')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <RichTextEditor
                    value={notes}
                    onChange={(html) => setNotes(html)}
                    placeholder={t('arqueo.notasPlaceholder')}
                    minHeight={100}
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
                    {t('arqueo.resumen.titulo')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    {showExpected && (
                      <div className="flex justify-between py-2 border-b dark:border-gray-700">
                        <span className="text-gray-600 dark:text-gray-400">{t('arqueo.resumen.montoEsperado')}</span>
                        <span className="font-medium dark:text-white">{formatCurrency(expectedAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between py-2 border-b dark:border-gray-700">
                      <span className="text-gray-600 dark:text-gray-400">{t('arqueo.resumen.efectivoContado')}</span>
                      <span className="font-medium dark:text-white">{formatCurrency(cashTotal)}</span>
                    </div>
                    {paymentMethods.filter(m => m.code !== 'cash').length > 0 && (
                      <div className="flex justify-between py-2 border-b dark:border-gray-700">
                        <span className="text-gray-600 dark:text-gray-400">{t('arqueo.resumen.otrosMetodos')}</span>
                        <span className="font-medium dark:text-white">{formatCurrency(calculateMethodTotal())}</span>
                      </div>
                    )}
                    <div className="flex justify-between py-2 border-b dark:border-gray-700">
                      <span className="text-gray-600 dark:text-gray-400">{t('arqueo.resumen.totalContado')}</span>
                      <span className="font-bold text-xl text-blue-600 dark:text-blue-400">
                        {formatCurrency(countedAmount)}
                      </span>
                    </div>

                    {showExpected && (
                      <>
                        <Separator />
                        <div className="flex justify-between items-center py-2">
                          <span className="font-semibold dark:text-white">{t('arqueo.resumen.diferencia')}</span>
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

                        {difference !== 0 && (
                          <div className={cn(
                            "p-3 rounded-lg",
                            difference > 0 
                              ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                              : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
                          )}>
                            <p className="text-sm">
                              {difference > 0 
                                ? t('arqueo.resumen.sobrante', { monto: formatCurrency(difference) })
                                : t('arqueo.resumen.faltante', { monto: formatCurrency(Math.abs(difference)) })
                              }
                            </p>
                          </div>
                        )}
                      </>
                    )}

                    {!showExpected && (
                      <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg flex items-center gap-2">
                        <EyeOff className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0" />
                        <p className="text-sm text-purple-700 dark:text-purple-400">
                          {t('comun.cierreCiegoActivo')}
                        </p>
                      </div>
                    )}
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={isSaving || countedAmount === 0}
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        {t('comun.guardando')}
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        {t('arqueo.resumen.guardar')}
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
