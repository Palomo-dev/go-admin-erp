/**
 * Servicio de matching inteligente con algoritmo de scoring para conciliacion bancaria.
 * Fase 3 Open Finance: conciliacion automatica mejorada con IA.
 *
 * Calcula un score de similitud entre transacciones bancarias y pagos candidatos
 * basado en monto, fecha, referencia y descripcion/contraparte. Permite sugerir
 * matches y auto-aprobar los de alta confianza.
 *
 * Usa getSupabaseAdmin() para operaciones server-side (API routes / webhooks).
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';

// ==================== Tipos ====================

/** Transaccion bancaria pendiente de conciliar (campos usados por el scorer). */
export interface BankTransaction {
  id: number;
  trans_date: string;
  description: string | null;
  amount: number;
  reference: string | null;
  transaction_type: string;
}

/** Pago candidato a conciliar (campos usados por el scorer). */
export interface PaymentCandidate {
  id: string;
  amount: number;
  reference: string | null;
  payment_date: string;
  method: string;
}

/** Resultado del scoring de un match potencial. */
export interface MatchScore {
  total: number;
  amount: number;
  date: number;
  reference: number;
  description: number;
  confidence: 'high' | 'medium' | 'low';
}

/** Sugerencia de match entre una transaccion y un pago. */
export interface SuggestedMatch {
  transactionId: number;
  candidateId: string;
  candidateType: 'payment';
  score: MatchScore;
  transaction: BankTransaction;
  candidate: PaymentCandidate;
}

// ==================== Tipos internos de BD ====================

/** Fila de bank_reconciliations (campos usados). */
interface ReconciliationRow {
  id: string;
  organization_id: number;
  bank_account_id: number;
  period_start: string;
  period_end: string;
  status: string;
}

/** Fila de bank_transactions devuelta por Supabase (amount llega como string). */
interface BankTransactionRow {
  id: number;
  trans_date: string;
  description: string | null;
  amount: string | number;
  reference: string | null;
  transaction_type: string;
  status: string | null;
}

/** Fila de payments devuelta por Supabase (amount llega como string). */
interface PaymentRow {
  id: string;
  amount: string | number;
  reference: string | null;
  payment_date: string | null;
  method: string | null;
  status: string;
}

// ==================== Utilidades ====================

/** Normaliza una cadena: minusculas, sin acentos ni signos. */
function normalizeText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Convierte un valor numerico de BD (string | number) a number. */
function toNumber(value: string | number): number {
  return typeof value === 'number' ? value : parseFloat(value);
}

/** Calcula los dias de diferencia absoluta entre dos fechas. */
function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.abs(a - b) / (1000 * 60 * 60 * 24);
}

/** Tokeniza una cadena en un Set de palabras unicas. */
function tokenize(text: string): Set<string> {
  return new Set(text.split(' ').filter(Boolean));
}

// ==================== Scoring ====================

/**
 * Calcula el score de un match entre una transaccion bancaria y un pago candidato.
 *
 * - Monto: 0-40 (exacto=40, ±1%=35, ±5%=20, ±10%=10, >10%=0)
 * - Fecha: 0-30 (mismo dia=30, ±1=25, ±3=15, ±7=5, >7=0)
 * - Referencia: 0-20 (exacta=20, parcial=10, ninguna=0)
 * - Descripcion/contraparte: 0-10 (coincidencia NLP simple=10, parcial=5, ninguna=0)
 */
function calculateMatchScore(bankTx: BankTransaction, candidate: PaymentCandidate): MatchScore {
  // --- Score por monto (0-40) ---
  const txAmount = Math.abs(bankTx.amount);
  const payAmount = Math.abs(candidate.amount);
  let amountScore = 0;
  if (txAmount > 0) {
    const diffPct = (Math.abs(txAmount - payAmount) / txAmount) * 100;
    if (diffPct === 0) amountScore = 40;
    else if (diffPct <= 1) amountScore = 35;
    else if (diffPct <= 5) amountScore = 20;
    else if (diffPct <= 10) amountScore = 10;
    else amountScore = 0;
  } else if (payAmount === 0) {
    amountScore = 40; // Ambos en cero
  }

  // --- Score por fecha (0-30) ---
  const days = daysBetween(bankTx.trans_date, candidate.payment_date);
  let dateScore = 0;
  if (days === 0) dateScore = 30;
  else if (days <= 1) dateScore = 25;
  else if (days <= 3) dateScore = 15;
  else if (days <= 7) dateScore = 5;
  else dateScore = 0;

  // --- Score por referencia (0-20) ---
  const txRef = normalizeText(bankTx.reference);
  const payRef = normalizeText(candidate.reference);
  let referenceScore = 0;
  if (txRef && payRef) {
    if (txRef === payRef) referenceScore = 20;
    else if (txRef.includes(payRef) || payRef.includes(txRef)) referenceScore = 10;
    else referenceScore = 0;
  }

  // --- Score por descripcion/contraparte (0-10) ---
  // NLP simple: comparacion de tokens entre la descripcion de la transaccion
  // y la referencia + metodo del pago.
  const txDesc = normalizeText(bankTx.description);
  const payDesc = normalizeText(`${candidate.reference ?? ''} ${candidate.method ?? ''}`);
  let descriptionScore = 0;
  if (txDesc && payDesc) {
    const txTokens = tokenize(txDesc);
    const payTokens = tokenize(payDesc);
    let hits = 0;
    txTokens.forEach((tok) => {
      if (payTokens.has(tok)) hits += 1;
    });
    const overlap = txTokens.size > 0 ? hits / txTokens.size : 0;
    if (overlap >= 0.8) descriptionScore = 10;
    else if (overlap >= 0.3) descriptionScore = 5;
    else descriptionScore = 0;
  }

  const total = amountScore + dateScore + referenceScore + descriptionScore;
  const confidence: MatchScore['confidence'] =
    total > 80 ? 'high' : total >= 50 ? 'medium' : 'low';

  return {
    total,
    amount: amountScore,
    date: dateScore,
    reference: referenceScore,
    description: descriptionScore,
    confidence,
  };
}

// ==================== Servicio ====================

export class aiMatchingService {
  /**
   * Calcula el score de un match entre una transaccion bancaria y un pago candidato.
   * Metodo estatico puro (sin acceso a BD), expuesto para uso directo y testing.
   */
  static calculateMatchScore(bankTx: BankTransaction, candidate: PaymentCandidate): MatchScore {
    return calculateMatchScore(bankTx, candidate);
  }

  /**
   * Sugiere matches para todas las transacciones no conciliadas de una reconciliacion.
   * Retorna sugerencias ordenadas por score descendente (solo score > 30).
   *
   * @param reconciliationId ID (uuid) de la reconciliacion
   * @param organizationId   ID de la organizacion del usuario (verificacion de acceso)
   */
  static async suggestMatches(
    reconciliationId: string,
    organizationId: number,
  ): Promise<SuggestedMatch[]> {
    const supabase = getSupabaseAdmin();

    try {
      // 1. Obtener reconciliacion
      const { data: recon, error: reconError } = await supabase
        .from('bank_reconciliations')
        .select('id, organization_id, bank_account_id, period_start, period_end, status')
        .eq('id', reconciliationId)
        .maybeSingle<ReconciliationRow>();

      if (reconError || !recon) {
        throw new Error(
          `Reconciliacion no encontrada: ${reconError?.message ?? 'desconocido'}`,
        );
      }

      // Verificar que la reconciliacion pertenece a la organizacion del usuario
      if (recon.organization_id !== organizationId) {
        throw new Error('Reconciliacion no encontrada');
      }

      // 2. Obtener transacciones pendientes (no matched) del periodo
      const { data: txRows, error: txError } = await supabase
        .from('bank_transactions')
        .select('id, trans_date, description, amount, reference, transaction_type, status')
        .eq('organization_id', recon.organization_id)
        .eq('bank_account_id', recon.bank_account_id)
        .gte('trans_date', recon.period_start)
        .lte('trans_date', recon.period_end)
        .or('status.is.null,status.neq.matched')
        .order('trans_date', { ascending: false });

      if (txError) throw txError;

      // 3. Obtener pagos candidatos completados del periodo
      const { data: payRows, error: payError } = await supabase
        .from('payments')
        .select('id, amount, reference, payment_date, method, status')
        .eq('organization_id', recon.organization_id)
        .gte('payment_date', recon.period_start)
        .lte('payment_date', recon.period_end)
        .eq('status', 'completed')
        .order('payment_date', { ascending: false });

      if (payError) throw payError;

      const transactions: BankTransaction[] = (txRows ?? []).map((row: BankTransactionRow) => ({
        id: row.id,
        trans_date: row.trans_date,
        description: row.description,
        amount: toNumber(row.amount),
        reference: row.reference,
        transaction_type: row.transaction_type,
      }));

      const candidates: PaymentCandidate[] = (payRows ?? []).map((row: PaymentRow) => ({
        id: row.id,
        amount: toNumber(row.amount),
        reference: row.reference,
        payment_date: row.payment_date ?? new Date().toISOString(),
        method: row.method ?? 'unknown',
      }));

      // 4. Calcular score de cada combinacion y filtrar score > 30
      const suggestions: SuggestedMatch[] = [];
      for (const tx of transactions) {
        for (const cand of candidates) {
          const score = calculateMatchScore(tx, cand);
          if (score.total > 30) {
            suggestions.push({
              transactionId: tx.id,
              candidateId: cand.id,
              candidateType: 'payment',
              score,
              transaction: tx,
              candidate: cand,
            });
          }
        }
      }

      // 5. Ordenar por score descendente
      suggestions.sort((a, b) => b.score.total - a.score.total);

      return suggestions;
    } catch (error) {
      console.error('[aiMatchingService] Error en suggestMatches:', error);
      throw error;
    }
  }

  /**
   * Auto-aproba y concilia los matches de alta confianza (score > 80).
   * Registra el match en bank_reconciliation_items y marca la transaccion.
   *
   * @param reconciliationId ID (uuid) de la reconciliacion
   * @param organizationId   ID de la organizacion del usuario (verificacion de acceso)
   * @returns Estadisticas { matched, pending }
   */
  static async autoMatchHighConfidence(
    reconciliationId: string,
    organizationId: number,
  ): Promise<{ matched: number; pending: number }> {
    const supabase = getSupabaseAdmin();

    try {
      const suggestions = await this.suggestMatches(reconciliationId, organizationId);
      const highConfidence = suggestions.filter((s) => s.score.confidence === 'high');

      let matched = 0;
      const usedTransactions = new Set<number>();
      const usedPayments = new Set<string>();

      for (const sug of highConfidence) {
        // Evitar conciliar la misma transaccion o el mismo pago dos veces
        if (usedTransactions.has(sug.transactionId)) continue;
        if (usedPayments.has(sug.candidateId)) continue;

        // Insertar item de reconciliacion (espejo de BancosService.matchTransaccion)
        const { error: itemError } = await supabase
          .from('bank_reconciliation_items')
          .insert({
            reconciliation_id: reconciliationId,
            bank_transaction_id: sug.transactionId,
            match_type: 'payment',
            matched_payment_id: sug.candidateId,
            amount: sug.transaction.amount,
            is_matched: true,
            match_date: new Date().toISOString(),
            created_at: new Date().toISOString(),
          });

        if (itemError) {
          console.error('[aiMatchingService] Error insertando item:', itemError);
          continue;
        }

        // Marcar transaccion como matched
        const { error: updateError } = await supabase
          .from('bank_transactions')
          .update({ status: 'matched', updated_at: new Date().toISOString() })
          .eq('id', sug.transactionId);

        if (updateError) {
          console.error('[aiMatchingService] Error actualizando transaccion:', updateError);
          continue;
        }

        usedTransactions.add(sug.transactionId);
        usedPayments.add(sug.candidateId);
        matched += 1;
      }

      const pending = suggestions.length - matched;
      return { matched, pending };
    } catch (error) {
      console.error('[aiMatchingService] Error en autoMatchHighConfidence:', error);
      throw error;
    }
  }

  /**
   * Sugiere matches para una transaccion especifica.
   * Busca pagos candidatos completados en ±7 dias de la transaccion.
   *
   * @param transactionId ID (integer) de la transaccion bancaria
   * @param organizationId ID de la organizacion del usuario (verificacion de acceso)
   */
  static async suggestMatchesForTransaction(
    transactionId: number,
    organizationId: number,
  ): Promise<SuggestedMatch[]> {
    const supabase = getSupabaseAdmin();

    try {
      // 1. Obtener la transaccion
      const { data: txRow, error: txError } = await supabase
        .from('bank_transactions')
        .select('id, organization_id, trans_date, description, amount, reference, transaction_type, status')
        .eq('id', transactionId)
        .maybeSingle<BankTransactionRow & { organization_id: number }>();

      if (txError || !txRow) {
        throw new Error(
          `Transaccion no encontrada: ${txError?.message ?? 'desconocido'}`,
        );
      }

      // Verificar que la transaccion pertenece a la organizacion del usuario
      if (txRow.organization_id !== organizationId) {
        throw new Error('Transaccion no encontrada');
      }

      const tx: BankTransaction = {
        id: txRow.id,
        trans_date: txRow.trans_date,
        description: txRow.description,
        amount: toNumber(txRow.amount),
        reference: txRow.reference,
        transaction_type: txRow.transaction_type,
      };

      // 2. Ventana de ±7 dias
      const txDate = new Date(tx.trans_date);
      const from = new Date(txDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const to = new Date(txDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

      // 3. Pagos candidatos en la ventana
      const { data: payRows, error: payError } = await supabase
        .from('payments')
        .select('id, amount, reference, payment_date, method, status')
        .eq('organization_id', txRow.organization_id)
        .gte('payment_date', from)
        .lte('payment_date', to)
        .eq('status', 'completed')
        .order('payment_date', { ascending: false });

      if (payError) throw payError;

      const candidates: PaymentCandidate[] = (payRows ?? []).map((row: PaymentRow) => ({
        id: row.id,
        amount: toNumber(row.amount),
        reference: row.reference,
        payment_date: row.payment_date ?? new Date().toISOString(),
        method: row.method ?? 'unknown',
      }));

      // 4. Score y filtrado
      const suggestions: SuggestedMatch[] = [];
      for (const cand of candidates) {
        const score = calculateMatchScore(tx, cand);
        if (score.total > 30) {
          suggestions.push({
            transactionId: tx.id,
            candidateId: cand.id,
            candidateType: 'payment',
            score,
            transaction: tx,
            candidate: cand,
          });
        }
      }

      suggestions.sort((a, b) => b.score.total - a.score.total);
      return suggestions;
    } catch (error) {
      console.error('[aiMatchingService] Error en suggestMatchesForTransaction:', error);
      throw error;
    }
  }

  /**
   * Genera sugerencias para todas las reconciliaciones abiertas de una organizacion.
   *
   * @param organizationId ID de la organizacion
   * @param bankAccountId Filtrar por cuenta bancaria (opcional)
   */
  static async batchSuggestMatches(
    organizationId: number,
    bankAccountId?: number,
  ): Promise<{ reconciliationId: string; suggestions: SuggestedMatch[] }[]> {
    const supabase = getSupabaseAdmin();

    try {
      // 1. Reconciliaciones abiertas (draft / in_progress)
      let query = supabase
        .from('bank_reconciliations')
        .select('id, organization_id, bank_account_id, period_start, period_end, status')
        .eq('organization_id', organizationId)
        .in('status', ['draft', 'in_progress'])
        .order('created_at', { ascending: false });

      if (bankAccountId) {
        query = query.eq('bank_account_id', bankAccountId);
      }

      const { data: recs, error: recError } = await query;

      if (recError) throw recError;

      // 2. Sugerencias por reconciliacion
      const results: { reconciliationId: string; suggestions: SuggestedMatch[] }[] = [];
      for (const rec of recs ?? []) {
        const suggestions = await this.suggestMatches(rec.id, organizationId);
        results.push({ reconciliationId: rec.id, suggestions });
      }

      return results;
    } catch (error) {
      console.error('[aiMatchingService] Error en batchSuggestMatches:', error);
      throw error;
    }
  }
}
