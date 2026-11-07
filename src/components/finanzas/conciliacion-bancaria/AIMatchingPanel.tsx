'use client';

/**
 * Pestaña «Sugerencias» del detalle de conciliación (Figma `2329:130286`), con
 * el kit. Fase 3 de Open Finance; la lógica y los servicios no cambian:
 *
 * - Carga las sugerencias de `GET /api/integrations/open-finance/suggest-matches`
 *   (ordenadas por puntaje, con su desglose monto · fecha · referencia · descripción).
 * - «Aceptar» concilia con `ConciliacionService.matchTransaccion(…, 'payment', …)`.
 * - «Rechazar» solo la quita de la lista local.
 * - «Auto-conciliar alta confianza» = `POST` al mismo endpoint.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Check, RefreshCw, X, Zap } from 'lucide-react';
import { DataTable, StatusBadge, clasesBoton, type ColumnaTabla, type EstadoTabla } from '@/components/kit';
import { ConciliacionService } from './ConciliacionService';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatMoneda } from '@/lib/utils/moneda';
import { esEntradaBancaria } from '@/lib/finanzas/movimientoBancario';

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
  /** Moneda de la cuenta conciliada; sin ella, la base de la organizacion. */
  monedaCuenta?: string | null;
}

/** Confianza por puntaje (la regla de siempre: > 80 alta, ≥ 50 media, el resto baja). */
function confianza(total: number): { clave: 'alta' | 'media' | 'baja'; tono: 'exito' | 'advertencia' | 'peligro' } {
  if (total > 80) return { clave: 'alta', tono: 'exito' };
  if (total >= 50) return { clave: 'media', tono: 'advertencia' };
  return { clave: 'baja', tono: 'peligro' };
}

// ==================== Componente ====================

export function AIMatchingPanel({ reconciliationId, onMatchComplete, monedaCuenta }: AIMatchingPanelProps) {
  const t = useTranslations('finanzasTesoreriaR3.conciliacion.sugerencias');
  // Movimiento bancario: en la moneda de la cuenta. Pago candidato: el dato
  // no trae moneda, va en la base.
  const { formatear, paraDocumento } = useMonedaOrganizacion();
  const { formatDate } = useFormatDate();
  const [suggestions, setSuggestions] = useState<SuggestedMatch[]>([]);
  const [estado, setEstado] = useState<EstadoTabla>('cargando');
  const [isAutoMatching, setIsAutoMatching] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Carga sugerencias desde la API
  const loadSuggestions = useCallback(async () => {
    try {
      setEstado('cargando');
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
      setEstado('listo');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('errorCargar');
      console.error('[AIMatchingPanel] Error cargando sugerencias:', err);
      setError(message);
      setEstado('error');
    }
  }, [reconciliationId, t]);

  useEffect(() => {
    void loadSuggestions();
  }, [loadSuggestions]);

  // Aceptar un match: concilia via ConciliacionService
  const handleAccept = async (suggestion: SuggestedMatch) => {
    try {
      setActionInProgress(suggestion.transactionId);
      await ConciliacionService.matchTransaccion(reconciliationId, suggestion.transactionId, 'payment', suggestion.candidateId);
      toast.success(t('aceptada'));
      setSuggestions((prev) => prev.filter((s) => s.transactionId !== suggestion.transactionId));
      onMatchComplete();
    } catch (err) {
      console.error('[AIMatchingPanel] Error aceptando match:', err);
      toast.error(t('errorAceptar'));
    } finally {
      setActionInProgress(null);
    }
  };

  // Rechazar un match: solo se remueve de la lista local
  const handleReject = (suggestion: SuggestedMatch) => {
    setSuggestions((prev) => prev.filter((s) => s.transactionId !== suggestion.transactionId));
    toast.info(t('rechazada'));
  };

  // Auto-conciliar matches de alta confianza
  const handleAutoMatch = async () => {
    try {
      setIsAutoMatching(true);
      const res = await fetch('/api/integrations/open-finance/suggest-matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reconciliationId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { data: { matched: number; pending: number } };
      toast.success(t('autoConciliadas', { n: json.data.matched }));
      await loadSuggestions();
      onMatchComplete();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('errorAuto');
      console.error('[AIMatchingPanel] Error auto-conciliando:', err);
      toast.error(message);
    } finally {
      setIsAutoMatching(false);
    }
  };

  const valorBanco = (s: SuggestedMatch) => {
    const v = formatMoneda(Math.abs(s.transaction.amount), paraDocumento(monedaCuenta));
    return esEntradaBancaria(s.transaction) ? v : `(${v})`;
  };
  const desglose = (s: SuggestedMatch) =>
    t('desglose', { monto: s.score.amount, fecha: s.score.date, referencia: s.score.reference, descripcion: s.score.description });

  const columnas: ColumnaTabla<SuggestedMatch>[] = [
    {
      id: 'banco',
      encabezado: t('columnas.banco'),
      celda: (s) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">
            {formatDate(s.transaction.trans_date)} · {s.transaction.description || t('sinDescripcion')}
          </p>
          {s.transaction.reference && <p className="truncate text-xs text-fg-secondary">{s.transaction.reference}</p>}
        </div>
      ),
    },
    {
      id: 'candidato',
      encabezado: t('columnas.candidato'),
      celda: (s) => (
        <div className="min-w-0">
          <p className="truncate text-fg">{s.candidate.reference || t('sinReferencia')}</p>
          <p className="truncate text-xs text-fg-secondary">
            {formatDate(s.candidate.payment_date)} · {s.candidate.method} · {formatear(Math.abs(s.candidate.amount))}
          </p>
        </div>
      ),
    },
    { id: 'valor', encabezado: t('columnas.valor'), variante: 'importe', celda: valorBanco },
    {
      id: 'confianza',
      encabezado: t('columnas.confianza'),
      celda: (s) => {
        const c = confianza(s.score.total);
        return (
          <span title={desglose(s)}>
            <StatusBadge estado={c.clave} etiqueta={t('confianzaPuntos', { nivel: t(`niveles.${c.clave}`), puntos: s.score.total })} tono={c.tono} />
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-fg-secondary">{estado === 'listo' ? t('encontradas', { n: suggestions.length }) : t('descripcion')}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void loadSuggestions()} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            {t('actualizar')}
          </button>
          <button
            type="button"
            onClick={() => void handleAutoMatch()}
            disabled={isAutoMatching || suggestions.length === 0}
            className={clasesBoton({ variante: 'primario', tamano: 'sm' })}
          >
            <Zap className="h-4 w-4" aria-hidden />
            {isAutoMatching ? t('conciliando') : t('autoConciliar')}
          </button>
        </div>
      </div>

      <DataTable<SuggestedMatch>
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={suggestions}
        obtenerId={(s) => `${s.transactionId}-${s.candidateId}`}
        estado={estado}
        onReintentar={() => void loadSuggestions()}
        error={error ? { descripcion: error } : undefined}
        vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion'), compacto: true }}
        accionesRapidas={(s) => (
          <>
            <button
              type="button"
              onClick={() => void handleAccept(s)}
              disabled={actionInProgress === s.transactionId}
              aria-label={t('aceptarAria', { banco: s.transaction.description ?? '' })}
              className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'text-brand' })}
            >
              <Check className="h-4 w-4" aria-hidden />
              {t('aceptar')}
            </button>
            <button
              type="button"
              onClick={() => handleReject(s)}
              aria-label={t('rechazarAria', { banco: s.transaction.description ?? '' })}
              className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
            >
              <X className="h-4 w-4" aria-hidden />
              {t('rechazar')}
            </button>
          </>
        )}
        tarjetaMovil={(s) => {
          const c = confianza(s.score.total);
          return (
            <div className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-fg">{s.transaction.description || t('sinDescripcion')}</p>
                  <p className="text-xs text-fg-secondary">
                    {formatDate(s.transaction.trans_date)} · {s.candidate.reference || t('sinReferencia')}
                  </p>
                </div>
                <span className="font-semibold tabular-nums text-fg">{valorBanco(s)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <StatusBadge estado={c.clave} etiqueta={t('confianzaPuntos', { nivel: t(`niveles.${c.clave}`), puntos: s.score.total })} tono={c.tono} />
                <div className="flex gap-1">
                  <button type="button" onClick={() => void handleAccept(s)} disabled={actionInProgress === s.transactionId} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                    {t('aceptar')}
                  </button>
                  <button type="button" onClick={() => handleReject(s)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
                    {t('rechazar')}
                  </button>
                </div>
              </div>
              <p className="text-xs text-fg-tertiary">{desglose(s)}</p>
            </div>
          );
        }}
      />

      <p className="text-xs text-fg-secondary">{t('regla')}</p>
    </div>
  );
}
