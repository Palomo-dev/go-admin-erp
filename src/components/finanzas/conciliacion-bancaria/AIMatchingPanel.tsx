'use client';

/**
 * Panel de sugerencias de matching con IA para conciliacion bancaria.
 * Fase 3 Open Finance.
 *
 * Carga sugerencias desde el endpoint de suggest-matches, las muestra
 * ordenadas por score con badge de confianza y permite aceptar/rechazar
 * cada sugerencia. Incluye accion de auto-conciliar alta confianza.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Sparkles, Check, X, RefreshCw, Zap,
  DollarSign, Calendar, FileText, MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ConciliacionService } from './ConciliacionService';
import { formatCurrency } from '@/utils/Utils';

// ==================== Tipos ====================

/** Score de un match sugerido. */
interface MatchScore {
  total: number;
  amount: number;
  date: number;
  reference: number;
  description: number;
  confidence: 'high' | 'medium' | 'low';
}

/** Transaccion bancaria de la sugerencia. */
interface BankTransaction {
  id: number;
  trans_date: string;
  description: string | null;
  amount: number;
  reference: string | null;
  transaction_type: string;
}

/** Pago candidato de la sugerencia. */
interface PaymentCandidate {
  id: string;
  amount: number;
  reference: string | null;
  payment_date: string;
  method: string;
}

/** Sugerencia de match retornada por la API. */
interface SuggestedMatch {
  transactionId: number;
  candidateId: string;
  candidateType: 'payment';
  score: MatchScore;
  transaction: BankTransaction;
  candidate: PaymentCandidate;
}

interface AIMatchingPanelProps {
  reconciliationId: string;
  onMatchComplete: () => void;
}

// ==================== Componente ====================

export function AIMatchingPanel({ reconciliationId, onMatchComplete }: AIMatchingPanelProps) {
  const [suggestions, setSuggestions] = useState<SuggestedMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAutoMatching, setIsAutoMatching] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Carga sugerencias desde la API
  const loadSuggestions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch(
        `/api/integrations/open-finance/suggest-matches?reconciliationId=${encodeURIComponent(reconciliationId)}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { data: SuggestedMatch[] };
      setSuggestions(json.data ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar sugerencias';
      console.error('[AIMatchingPanel] Error cargando sugerencias:', err);
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [reconciliationId]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  // Aceptar un match: concilia via ConciliacionService
  const handleAccept = async (suggestion: SuggestedMatch) => {
    try {
      setActionInProgress(suggestion.transactionId);
      await ConciliacionService.matchTransaccion(
        reconciliationId,
        suggestion.transactionId,
        'payment',
        suggestion.candidateId,
      );
      toast.success('Match aceptado y conciliado');
      // Remover de la lista local
      setSuggestions((prev) => prev.filter((s) => s.transactionId !== suggestion.transactionId));
      onMatchComplete();
    } catch (err) {
      console.error('[AIMatchingPanel] Error aceptando match:', err);
      toast.error('Error al aceptar el match');
    } finally {
      setActionInProgress(null);
    }
  };

  // Rechazar un match: solo se remueve de la lista local
  const handleReject = (suggestion: SuggestedMatch) => {
    setSuggestions((prev) => prev.filter((s) => s.transactionId !== suggestion.transactionId));
    toast.info('Sugerencia rechazada');
  };

  // Auto-conciliar matches de alta confianza
  const handleAutoMatch = async () => {
    try {
      setIsAutoMatching(true);
      const res = await fetch(
        '/api/integrations/open-finance/suggest-matches',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reconciliationId }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { data: { matched: number; pending: number } };
      toast.success(`${json.data.matched} matches auto-conciliados`);
      // Recargar sugerencias y refrescar transacciones
      await loadSuggestions();
      onMatchComplete();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al auto-conciliar';
      console.error('[AIMatchingPanel] Error auto-conciliando:', err);
      toast.error(message);
    } finally {
      setIsAutoMatching(false);
    }
  };

  // Formatea fecha corta
  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  // Color del badge segun score total
  const getScoreBadge = (score: number) => {
    if (score > 80) {
      return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">{score} - Alta</Badge>;
    }
    if (score >= 50) {
      return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">{score} - Media</Badge>;
    }
    return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">{score} - Baja</Badge>;
  };

  // ==================== Render ====================

  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            <CardTitle className="text-gray-900 dark:text-white">Sugerencias IA</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            <CardTitle className="text-gray-900 dark:text-white">Sugerencias IA</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <X className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
            <Button variant="outline" onClick={loadSuggestions} className="dark:border-gray-600">
              <RefreshCw className="h-4 w-4 mr-2" />
              Reintentar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              <CardTitle className="text-gray-900 dark:text-white">Sugerencias IA</CardTitle>
            </div>
            <CardDescription className="dark:text-gray-400">
              {suggestions.length} sugerencia(s) encontrada(s)
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadSuggestions}
              className="dark:border-gray-600"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Actualizar
            </Button>
            <Button
              size="sm"
              onClick={handleAutoMatch}
              disabled={isAutoMatching || suggestions.length === 0}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Zap className="h-4 w-4 mr-2" />
              {isAutoMatching ? 'Conciliando...' : 'Auto-conciliar alta confianza'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {suggestions.length === 0 ? (
          <div className="text-center py-8">
            <Check className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              No hay sugerencias pendientes
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {suggestions.map((sug) => (
              <div
                key={`${sug.transactionId}-${sug.candidateId}`}
                className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700"
              >
                {/* Fila superior: score y acciones */}
                <div className="flex items-center justify-between mb-3">
                  {getScoreBadge(sug.score.total)}
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleAccept(sug)}
                      disabled={actionInProgress === sug.transactionId}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Aceptar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReject(sug)}
                      disabled={actionInProgress === sug.transactionId}
                      className="dark:border-gray-600"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Rechazar
                    </Button>
                  </div>
                </div>

                {/* Detalle: transaccion y pago candidato */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Transaccion bancaria */}
                  <div className="p-3 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                      Transaccion bancaria
                    </p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {sug.transaction.description || 'Sin descripcion'}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Calendar className="h-3 w-3 text-gray-400" />
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(sug.transaction.trans_date)}
                      </span>
                    </div>
                    <p className={`text-sm font-semibold mt-1 ${
                      sug.transaction.transaction_type === 'credit'
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}>
                      {formatCurrency(Math.abs(sug.transaction.amount))}
                    </p>
                  </div>

                  {/* Pago candidato */}
                  <div className="p-3 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                      Pago candidato
                    </p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {sug.candidate.reference || 'Sin referencia'}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Calendar className="h-3 w-3 text-gray-400" />
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(sug.candidate.payment_date)}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-green-600 dark:text-green-400 mt-1">
                      {formatCurrency(Math.abs(sug.candidate.amount))}
                    </p>
                  </div>
                </div>

                {/* Desglose del score */}
                <div className="grid grid-cols-4 gap-2 mt-3">
                  <ScoreDetail icon={<DollarSign className="h-3 w-3" />} label="Monto" value={sug.score.amount} max={40} />
                  <ScoreDetail icon={<Calendar className="h-3 w-3" />} label="Fecha" value={sug.score.date} max={30} />
                  <ScoreDetail icon={<FileText className="h-3 w-3" />} label="Ref." value={sug.score.reference} max={20} />
                  <ScoreDetail icon={<MessageSquare className="h-3 w-3" />} label="Desc." value={sug.score.description} max={10} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ==================== Subcomponente ====================

/** Muestra el detalle de un componente del score con barra de progreso. */
function ScoreDetail({
  icon,
  label,
  value,
  max,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  max: number;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-purple-500 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 tabular-nums">
          {value}/{max}
        </span>
      </div>
    </div>
  );
}
