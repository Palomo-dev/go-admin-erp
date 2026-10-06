import { supabase } from '@/lib/supabase/config';
import { mesaDelPedido, tipoEntregaEfectivo } from '@/lib/pos/pedidosWeb/tipoEntrega';
import { getOrganizationId, getCurrentBranchId, getBranchFilter, getCurrentUserId } from '@/lib/hooks/useOrganization';
import { isRealtimePublished } from '@/components/crm/shared/realtimeTables';
import { isDesktop } from '@/lib/utils/desktop';
import {
  applyOutboxSalesToSummary,
  enqueueCashMovement,
  enqueueCashSessionClose,
  enqueueCashSessionOpen,
  getLocalCashSessionById,
  getLocalOpenCashSession,
  isCashSessionClosedLocally,
  listPendingOutboxMovements,
  outboxSalesDeltas,
  removeLocalCashSession,
  shouldOperateCashOffline,
} from '@/lib/offline/cashOutbox';
import type {
  CashSession,
  CashMovement,
  CashSummary,
  OpenCashSessionData,
  CloseCashSessionData,
  CashMovementData,
  CashCount,
  CreateCashCountData,
  CreateCashMovementData,
  SessionPaymentDetail,
  SessionMovementType,
  CashHistoryFilters
} from './types';
import { diferenciasHistorial, enriquecerSesiones, exportacionHistorial, paginaHistorial } from '@/lib/pos/cajas/historialConsulta';
import { parametrosArqueo } from '@/lib/pos/cajas/arqueo';
import { claveDeConcepto } from '@/lib/pos/cajas/conceptos';
import { RPC_MOVIMIENTO_CAJA, codigoErrorMovimiento, movimientoDeRpc, parametrosMovimiento, type DatosMovimientoCaja } from '@/lib/pos/cajas/movimientoRpc';
import type { ResumenCaja, ResumenCompacto } from '@/lib/pos/cajas/resumenServidor';
import {
  alcanceApertura,
  claveTraduccionError,
  codigoCajaYaAbierta,
  sucursalDeApertura,
  type CodigoCajaYaAbierta,
} from '@/lib/pos/cajas/alcance';

/**
 * Error de cajas que la UI muestra. `message` sigue en español (lo leen logs y
 * otros consumidores); `codigo` es estable y la UI lo traduce con
 * `cajas.errores.<codigo>`, con respaldo al `message` si no hay traducción.
 * Los códigos de `POST /api/pos/cajas/[id]/cerrar` llegan tal cual.
 */
export class ErrorCaja extends Error {
  readonly codigo: string;
  constructor(codigo: string, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorCaja';
    this.codigo = codigo;
  }
}

/**
 * Clave de traducción (`cajas.errores.<clave>`, en camelCase) del error lanzado
 * por `CajasService`, o `null` si no trae código: `caja_ya_cerrada` → `cajaYaCerrada`.
 */
export function claveErrorCaja(error: unknown): string | null {
  if (!(error instanceof ErrorCaja) || !error.codigo) return null;
  return claveTraduccionError(error.codigo);
}

/** Mensaje en español (logs y respaldo) de cada caja ya abierta; la UI traduce el código. */
const MENSAJE_CAJA_YA_ABIERTA: Record<CodigoCajaYaAbierta, string> = {
  caja_global_abierta: 'Ya hay una caja global abierta. Ciérrala antes de abrir otra.',
  caja_propia_abierta: 'Ya tienes una caja abierta en esta sucursal. Ciérrala antes de abrir otra.',
  caja_sucursal_abierta: 'Ya hay una caja abierta en esta sucursal. Ciérrala antes de abrir otra.',
};

interface InvoiceSaleRef { id: string; number: string | null; customer_id: string | null; sale_id: string | null }
interface InvoicePurchaseRef { id: string; number_ext: string | null; supplier_id: string | null }
interface SaleRef { id: string; table_session_id: string | null; customer_id: string | null; include_in_cash_register: boolean | null }
interface ArRef { id: string; invoice_id: string | null; customer_id: string | null }
interface ApRef { id: string; invoice_id: string | null; supplier_id: string | null }
interface CustomerRef { id: string; full_name: string | null; company_name: string | null }
interface SupplierRef { id: string; name: string | null }

export class CajasService {
  // Se leen en tiempo de llamada (no en import) para reflejar la organización/sucursal activa
  private static get organizationId(): number | null {
    return getOrganizationId();
  }
  private static get branchId(): number | null {
    return getCurrentBranchId();
  }

  /**
   * Modo de asignación de cajas configurado por la organización.
   * - 'branch': una sola caja compartida por sucursal (default).
   * - 'user':   cada cajero gestiona su propia caja dentro de la sucursal.
   * Cacheado en memoria por 30s para no consultar organization_settings en cada llamada.
   */
  private static cashModeCache: { orgId: number | null; mode: 'branch' | 'user'; expiresAt: number } | null = null;

  static async getCashSessionMode(): Promise<'branch' | 'user'> {
    const orgId = this.organizationId;
    if (!orgId) return 'branch';

    const now = Date.now();
    if (this.cashModeCache && this.cashModeCache.orgId === orgId && this.cashModeCache.expiresAt > now) {
      return this.cashModeCache.mode;
    }

    try {
      const { ConfiguracionService } = await import('@/components/pos/configuracion/configuracionService');
      const config = await ConfiguracionService.getCashSessionModeConfig();
      const mode = config.mode;
      this.cashModeCache = { orgId, mode, expiresAt: now + 30_000 };
      return mode;
    } catch (error) {
      console.warn('Error leyendo modo de cajas, usando default (branch):', error);
      return 'branch';
    }
  }

  /** Invalida el cache del modo de cajas (útil tras cambiar la configuración). */
  static invalidateCashSessionModeCache(): void {
    this.cashModeCache = null;
  }

  /**
   * Obtiene la sesión de caja activa para la sucursal actual.
   *
   * - Modo 'branch' (default): busca primero una caja de la sucursal; si no hay,
   *   busca una caja global (branch_id = null). No filtra por usuario: la caja es
   *   de la sucursal y todos los usuarios la comparten.
   * - Modo 'user': cada cajero gestiona su propia caja. Busca la caja abierta del
   *   usuario actual dentro de la sucursal actual (filtra por opened_by). No cae
   *   a caja global ni a cajas de otros cajeros.
   */
  static async getActiveSession(): Promise<CashSession | null> {
    try {
      if (!this.organizationId) {
        return null;
      }

      const mode = await this.getCashSessionMode();

      // Desktop sin red (fase 4F): estado local de caja + réplica.
      if (shouldOperateCashOffline()) {
        return this.getActiveSessionOffline(mode);
      }

      return this.findActiveSessionRemote(mode);
    } catch (error) {
      console.error('Error getting active session:', error);
      throw error;
    }
  }

  /**
   * Búsqueda de la caja abierta en Supabase (o en la réplica local cuando el
   * Desktop no tiene red: los GET a `cash_sessions` se resuelven allí).
   */
  private static async findActiveSessionRemote(mode: 'branch' | 'user'): Promise<CashSession | null> {
    {
      // Modo 'user': la caja activa es la del usuario actual en la sucursal actual
      if (mode === 'user' && this.branchId) {
        const userId = await getCurrentUserId();
        if (!userId) {
          return null;
        }
        const { data: userSession, error: userError } = await supabase
          .from('cash_sessions')
          .select('*')
          .eq('organization_id', this.organizationId)
          .eq('branch_id', this.branchId)
          .eq('opened_by', userId)
          .eq('status', 'open')
          .order('opened_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (userError && userError.code !== 'PGRST116') {
          throw userError;
        }
        if (userSession) {
          return this.enrichSession(userSession);
        }
        return null;
      }

      // Modo 'branch': 1. Buscar caja abierta de la sucursal actual
      if (this.branchId) {
        const { data: branchSession, error: branchError } = await supabase
          .from('cash_sessions')
          .select('*')
          .eq('organization_id', this.organizationId)
          .eq('branch_id', this.branchId)
          .eq('status', 'open')
          .order('opened_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (branchError && branchError.code !== 'PGRST116') {
          throw branchError;
        }

        if (branchSession) {
          return this.enrichSession(branchSession);
        }
      }

      // Modo 'branch': 2. Buscar caja global (branch_id = null)
      const { data: globalSession, error: globalError } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('organization_id', this.organizationId)
        .is('branch_id', null)
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (globalError && globalError.code !== 'PGRST116') {
        throw globalError;
      }

      if (globalSession) {
        return this.enrichSession(globalSession);
      }

      return null;
    }
  }

  /**
   * Fase 4F — caja activa sin red, en este orden:
   *  1. La réplica local (`cash_sessions` replicada en 4C), salvo que esa
   *     sesión ya se haya cerrado sin red (cierre en el outbox).
   *  2. El estado local (`cashOutbox`): sesiones abiertas sin red (id negativo)
   *     o ya sincronizadas pero que la réplica aún no conoce. Si la réplica
   *     ya conoce una sesión sincronizada, manda la réplica y el estado local
   *     sobra.
   */
  private static async getActiveSessionOffline(mode: 'branch' | 'user'): Promise<CashSession | null> {
    const organizationId = this.organizationId as number;
    let remote: CashSession | null = null;
    try {
      remote = await this.findActiveSessionRemote(mode);
    } catch (error) {
      console.warn('[CajasService] Sin red y sin réplica de cash_sessions; se usa el estado local:', error);
    }
    if (remote && !(await isCashSessionClosedLocally(organizationId, remote.uuid))) {
      return remote;
    }
    const userId = mode === 'user' ? await getCurrentUserId() : null;
    const local = await getLocalOpenCashSession({ organizationId, branchId: this.branchId, mode, userId });
    if (!local) return null;
    if (local.id > 0) {
      // Apertura ya sincronizada: si la réplica la conoce, ella decide.
      try {
        const { data } = await supabase.from('cash_sessions').select('id, status').eq('organization_id', organizationId).eq('id', local.id).maybeSingle();
        if (data) {
          await removeLocalCashSession(organizationId, local.uuid);
          return data.status === 'open' ? { ...local, pending_sync: false } : null;
        }
      } catch {
        // réplica no disponible: se confía en el estado local
      }
    }
    return local;
  }

  /**
   * Enriquece una sesión con nombres de cajero y sucursal
   */
  private static async enrichSession(session: CashSession): Promise<CashSession> {
    // Obtener nombre del cajero
    if (session?.opened_by) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', session.opened_by)
        .single();
      if (profileData) {
        // Sin nombre queda vacío: la pantalla pone su respaldo traducido («Cajero», «—»).
        session.opened_by_name = `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() || undefined;
      }
    }

    // Obtener nombre de la sucursal
    if (session?.branch_id) {
      const { data: branchData } = await supabase
        .from('branches')
        .select('name')
        .eq('id', session.branch_id)
        .single();
      if (branchData) {
        session.branch_name = branchData.name;
      }
    } else {
      // Caja global: la pantalla la pinta por `branch_id === null` («Todas las sucursales» traducido).
      session.branch_name = undefined;
    }

    return session;
  }

  /**
   * Cuenta cuántas cajas abiertas hay en la organización (todas las sucursales)
   */
  static async getOpenSessionsCount(): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('cash_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', this.organizationId)
        .eq('status', 'open');

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error counting open sessions:', error);
      return 0;
    }
  }

  /**
   * Obtiene todas las sesiones de caja abiertas en la organización
   */
  static async getActiveSessions(): Promise<CashSession[]> {
    try {
      if (!this.organizationId) {
        return [];
      }
      const { data, error } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('organization_id', this.organizationId)
        .eq('status', 'open')
        .order('opened_at', { ascending: false });

      if (error) throw error;

      return await this.enrichSessions((data || []) as CashSession[]);
    } catch (error) {
      console.error('Error getting active sessions:', error);
      throw error;
    }
  }

  /** Nombres de quien abrió, de quien cerró y de la sucursal (módulo compartido con el servidor). */
  private static async enrichSessions(sessions: CashSession[]): Promise<CashSession[]> {
    return enriquecerSesiones(supabase, sessions);
  }

  /**
   * Historial de cajas. Con red lo lee el SERVIDOR (`GET /api/pos/cajas/historial`),
   * que aplica la máscara del cierre ciego: sin `pos.cajas.ver_esperado` no
   * llegan `final_amount` ni `difference`, ni se filtra u ordena por ellos.
   * Sin red (Desktop) se consulta la réplica local con el mismo módulo; ahí la
   * pantalla oculta las cifras como antes (los datos ya están en el equipo).
   */
  private static async historialServidor<T>(vista: 'pagina' | 'diferencias' | 'exportar', filters: CashHistoryFilters, page = 1, pageSize = 10): Promise<T> {
    const q = new URLSearchParams({ vista, pagina: String(page), tamano: String(pageSize) });
    const sucursal = filters.branchId ?? getBranchFilter();
    if (sucursal) q.set('sucursal', String(sucursal));
    if (filters.status) q.set('status', filters.status);
    if (filters.desde) q.set('desde', filters.desde);
    if (filters.hasta) q.set('hasta', filters.hasta);
    if (filters.busqueda) q.set('busqueda', filters.busqueda);
    if (filters.resultado) q.set('resultado', filters.resultado);
    if (filters.orden) {
      q.set('orden', filters.orden.campo);
      q.set('dir', filters.orden.direccion);
    }
    const headers: Record<string, string> = {};
    if (this.organizationId) headers['x-organization-id'] = String(this.organizationId);
    const response = await fetch(`/api/pos/cajas/historial?${q.toString()}`, { credentials: 'same-origin', cache: 'no-store', headers });
    const body = (await response.json().catch(() => null)) as (T & { codigo?: string; error?: string }) | null;
    if (!response.ok || !body) throw new ErrorCaja(body?.codigo || 'lectura_fallida', body?.error || 'No se pudo leer el historial de cajas');
    return body;
  }

  /** Opciones del módulo compartido para la réplica local (sin red). */
  private static opcionesLocales(filters: CashHistoryFilters) {
    return { organizationId: Number(this.organizationId), sucursalId: filters.branchId ?? getBranchFilter() ?? null, verImportes: true };
  }

  /**
   * Historial de sesiones con paginación, filtros y orden en el servidor.
   */
  static async getSessionHistoryPaginated(
    page: number = 1,
    pageSize: number = 10,
    filters: CashHistoryFilters = {}
  ): Promise<{ data: CashSession[]; total: number }> {
    try {
      if (!this.organizationId) return { data: [], total: 0 };
      if (shouldOperateCashOffline()) return await paginaHistorial(supabase, filters, this.opcionesLocales(filters), page, pageSize);
      const r = await this.historialServidor<{ data: CashSession[]; total: number }>('pagina', filters, page, pageSize);
      return { data: r.data, total: r.total };
    } catch (error) {
      console.error('Error getting paginated session history:', error);
      throw error;
    }
  }

  /**
   * Diferencias de todas las sesiones que cumplen los filtros (para la franja
   * de cifras del historial). Con cierre ciego sin permiso, lista vacía.
   */
  static async getSessionHistoryDifferences(filters: CashHistoryFilters = {}): Promise<Array<number | null>> {
    if (!this.organizationId) return [];
    if (shouldOperateCashOffline()) return diferenciasHistorial(supabase, filters, this.opcionesLocales(filters));
    const r = await this.historialServidor<{ diferencias: Array<number | null> }>('diferencias', filters);
    return r.diferencias;
  }

  /** Todas las sesiones que cumplen los filtros, con nombres (para «Exportar»). Tope: 5.000. */
  static async getSessionHistoryForExport(filters: CashHistoryFilters = {}): Promise<CashSession[]> {
    if (!this.organizationId) return [];
    if (shouldOperateCashOffline()) return exportacionHistorial(supabase, filters, this.opcionesLocales(filters));
    const r = await this.historialServidor<{ data: CashSession[] }>('exportar', filters);
    return r.data;
  }

  /**
   * Abre una nueva sesión de caja
   * scope: 'branch' (default) = caja de la sucursal actual, 'global' = caja para todas las sucursales
   *
   * En modo 'user', se ignora el alcance 'global' (no aplica) y se valida que el
   * cajero no tenga ya una caja abierta en la sucursal actual, permitiendo que
   * otros cajeros tengan sus propias cajas simultáneamente.
   */
  static async openSession(data: OpenCashSessionData): Promise<CashSession> {
    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        throw new ErrorCaja('no_autenticado', 'Usuario no autenticado');
      }

      const mode = await this.getCashSessionMode();

      // En modo 'user' el alcance siempre es la sucursal actual (no hay caja global)
      const scope = alcanceApertura(mode, data.scope);
      const targetBranchId = sucursalDeApertura(scope, this.branchId);

      if (scope === 'branch' && !this.branchId) {
        throw new ErrorCaja('sin_sucursal', 'No se pudo obtener la sucursal. Seleccione una sucursal.');
      }

      // Verificar que no haya ya una caja abierta para el mismo alcance
      let checkQuery = supabase
        .from('cash_sessions')
        .select('id, uuid')
        .eq('organization_id', this.organizationId)
        .eq('status', 'open');

      if (scope === 'global') {
        checkQuery = checkQuery.is('branch_id', null);
      } else {
        checkQuery = checkQuery.eq('branch_id', this.branchId);
        // En modo 'user' la unicidad es por cajero dentro de la sucursal
        if (mode === 'user') {
          checkQuery = checkQuery.eq('opened_by', userId);
        }
      }

      const offline = shouldOperateCashOffline();
      const codigoAbierta = codigoCajaYaAbierta(mode, scope);
      const alreadyOpen = new ErrorCaja(codigoAbierta, MENSAJE_CAJA_YA_ABIERTA[codigoAbierta]);

      // Sin red el GET se resuelve en la réplica local; una sesión cerrada sin
      // red sigue `open` allí hasta sincronizar, así que se descarta aparte.
      const { data: existingSession } = await checkQuery.maybeSingle();

      if (existingSession && !(offline && (await isCashSessionClosedLocally(this.organizationId as number, String(existingSession.uuid))))) {
        throw alreadyOpen;
      }

      if (offline) {
        // Fase 4F: apertura sin red → outbox + estado local, id negativo hasta sincronizar.
        const localOpen = await getLocalOpenCashSession({
          organizationId: this.organizationId as number,
          branchId: scope === 'global' ? null : this.branchId,
          mode,
          userId,
        });
        if (localOpen && (scope === 'global' ? localOpen.branch_id === null : localOpen.branch_id === this.branchId)) {
          throw alreadyOpen;
        }
        const session = await enqueueCashSessionOpen({
          organizationId: this.organizationId as number,
          branchId: targetBranchId,
          openedBy: userId,
          initialAmount: data.initial_amount,
          notes: data.notes || 'Apertura de caja',
        });
        console.log('Sesión de caja abierta sin red (pendiente de sincronizar):', session.id);
        return session;
      }

      const { data: session, error } = await supabase
        .from('cash_sessions')
        .insert({
          organization_id: this.organizationId,
          branch_id: targetBranchId,
          opened_by: userId,
          initial_amount: data.initial_amount,
          notes: data.notes || 'Apertura de caja',
          status: 'open'
        })
        .select()
        .single();

      // 23505: la base ya tiene una caja abierta en este alcance (índice
      // `ux_cash_sessions_abierta_por_alcance`, por modo). Pasa cuando otra
      // pestaña u otro cajero abrió entre la comprobación y el insert.
      if (error && (error as { code?: string }).code === '23505') throw alreadyOpen;
      if (error) throw error;

      console.log('Sesión de caja abierta:', session.id);
      return session;
    } catch (error) {
      console.error('Error opening cash session:', error);
      throw error;
    }
  }

  /**
   * Cierra una sesión de caja.
   *
   * - Con red, siempre por `POST /api/pos/cajas/[id]/cerrar` (la propia y la
   *   de otro cajero): el servidor decide el permiso y calcula la diferencia.
   * - Sin red (Desktop), solo la caja activa de quien cierra: va al outbox con
   *   el esperado calculado en local, que es lo único que ve las ventas sin
   *   sincronizar.
   */
  static async closeSession(data: CloseCashSessionData, target?: Pick<CashSession, 'id' | 'uuid'>): Promise<CashSession> {
    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        throw new ErrorCaja('no_autenticado', 'Usuario no autenticado');
      }

      const activeSession = await this.getActiveSession();
      if (target && target.id !== activeSession?.id) {
        return await this.closeOtherSession(target.id, data);
      }
      if (!activeSession) {
        throw new ErrorCaja('sin_caja_abierta', 'No hay sesión de caja abierta');
      }

      if (shouldOperateCashOffline()) {
        // Calcular la diferencia en local: sin red el servidor no ve las
        // ventas del outbox. Al sincronizar se guarda este cálculo.
        const summary = await this.getCashSummary(activeSession.id);
        const difference = data.final_amount - summary.expected_amount;
        // Fase 4F: cierre sin red → outbox con el resumen calculado sobre
        // réplica + ventas/movimientos locales; la sesión queda cerrada en local.
        const closed = await enqueueCashSessionClose({
          session: activeSession,
          closedBy: userId,
          finalAmount: data.final_amount,
          difference,
          notes: data.notes || activeSession.notes || null,
          summary,
          summaryPartial: this.lastSummaryWasPartial,
          countedByMethod: data.counted_by_method,
          denominations: data.denominations,
        });
        console.log('Sesión de caja cerrada sin red (pendiente de sincronizar):', closed.id);
        return closed;
      }

      // Con red, también la caja propia se cierra en el servidor: allí se
      // calcula el esperado y la diferencia (antes los mandaba el navegador).
      const session = await this.closeOnServer(activeSession.id, data);

      // Si esta sesión nació sin red, su estado local ya sobra.
      if (isDesktop() && activeSession.uuid) {
        removeLocalCashSession(activeSession.organization_id, activeSession.uuid).catch(() => {});
      }

      console.log('Sesión de caja cerrada:', session.id);
      return session;
    } catch (error) {
      console.error('Error closing cash session:', error);
      throw error;
    }
  }

  /**
   * Cierre de una caja que no es la activa de quien cierra: necesita red (la
   * caja ajena no está en el outbox local).
   */
  private static async closeOtherSession(sessionId: number, data: CloseCashSessionData): Promise<CashSession> {
    if (sessionId < 0 || shouldOperateCashOffline()) {
      throw new ErrorCaja('cierre_ajeno_sin_red', 'Sin conexión solo puedes cerrar tu propia caja. Vuelve a intentarlo cuando haya red.');
    }
    return this.closeOnServer(sessionId, data);
  }

  /**
   * `POST /api/pos/cajas/[id]/cerrar`: el servidor decide si esta persona
   * puede cerrarla (quien la abrió o `pos.cajas.cerrar_ajenas`, nunca el
   * nombre del rol) y cierra en una transacción (`pos_caja_cerrar`): arqueo de
   * cierre con el conteo por método, esperado y diferencia del servidor. El
   * navegador solo manda lo contado.
   */
  private static async closeOnServer(sessionId: number, data: CloseCashSessionData): Promise<CashSession> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.organizationId) headers['x-organization-id'] = String(this.organizationId);

    const response = await fetch(`/api/pos/cajas/${sessionId}/cerrar`, {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify({
        final_amount: data.final_amount,
        notes: data.notes ?? null,
        ...(data.counted_by_method ? { counted_by_method: data.counted_by_method } : {}),
        ...(data.denominations ? { denominations: data.denominations } : {}),
      }),
    });
    const body = (await response.json().catch(() => null)) as { session?: CashSession; error?: string; codigo?: string } | null;
    if (!response.ok || !body?.session) {
      throw new ErrorCaja(body?.codigo || 'cierre_fallido', body?.error || 'No se pudo cerrar la caja');
    }
    return body.session;
  }

  /**
   * Registra un movimiento de caja (ingreso o egreso)
   */
  static async addMovement(data: CashMovementData): Promise<CashMovement> {
    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        throw new ErrorCaja('no_autenticado', 'Usuario no autenticado');
      }

      const activeSession = await this.getActiveSession();
      if (!activeSession) {
        throw new ErrorCaja('sin_caja_abierta', 'No hay sesión de caja abierta');
      }

      if (shouldOperateCashOffline()) {
        // Fase 4F: movimiento sin red → outbox (uuid del cliente, id negativo).
        const movement = await enqueueCashMovement({
          session: activeSession,
          type: data.type,
          concept: data.concept,
          amount: data.amount,
          userId,
          notes: data.notes ?? null,
          conceptCode: data.concept_code ?? null,
          reference: data.reference ?? null,
        });
        console.log('Movimiento registrado sin red (pendiente de sincronizar):', movement.id);
        return movement;
      }

      const movement = await this.registrarMovimiento(activeSession.id, data);
      console.log('Movimiento registrado:', movement.id);
      return movement;
    } catch (error) {
      console.error('Error adding cash movement:', error);
      throw error;
    }
  }

  /**
   * Obtiene los movimientos de una sesión de caja
   */
  static async getSessionMovements(sessionId: number): Promise<CashMovement[]> {
    try {
      // Fase 4F (Desktop): los movimientos hechos sin red viven en el outbox
      // hasta sincronizar; se suman a los de Supabase/réplica.
      const pendingLocal = isDesktop() ? await this.pendingOutboxMovements(sessionId) : [];
      if (sessionId < 0) return pendingLocal;

      const { data, error } = await supabase
        .from('cash_movements')
        .select('*')
        .eq('cash_session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) {
        if (shouldOperateCashOffline()) {
          console.warn('[CajasService] Sin red y sin réplica de cash_movements; solo movimientos locales:', error);
          return pendingLocal;
        }
        throw error;
      }

      const remote = (data || []) as CashMovement[];
      if (pendingLocal.length === 0) return remote;
      const known = new Set(remote.map((m) => m.uuid).filter(Boolean));
      return [...remote, ...pendingLocal.filter((m) => !m.uuid || !known.has(m.uuid))].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    } catch (error) {
      console.error('Error getting session movements:', error);
      throw error;
    }
  }

  /** Movimientos del outbox de caja de una sesión (por id local o real, y por uuid si se conoce). */
  private static async pendingOutboxMovements(sessionId: number): Promise<CashMovement[]> {
    try {
      const local = this.organizationId ? await getLocalCashSessionById(this.organizationId, sessionId) : null;
      return await listPendingOutboxMovements({ id: sessionId, uuid: local?.session.uuid ?? null });
    } catch (error) {
      console.warn('[CajasService] No se pudo leer el outbox de caja:', error);
      return [];
    }
  }

  /**
   * Fase 4F: true si el último `getCashSummary` sin red no pudo leer la
   * réplica de `payments` y solo cuenta el outbox. Se guarda en el cierre.
   */
  private static lastSummaryWasPartial = false;

  /**
   * Calcula el resumen de efectivo para una sesión.
   *
   * Desktop (fase 4F): las consultas a `payments`/`returns`/`folio_items` sin
   * red se resuelven en la réplica local; a eso se suman las ventas del
   * outbox (aún sin `payments`) y los movimientos del outbox, con las mismas
   * reglas de alcance (sucursal, fechas, cajero en modo `user`).
   */
  static async getCashSummary(sessionId: number): Promise<CashSummary> {
    try {
      this.lastSummaryWasPartial = false;
      const offline = shouldOperateCashOffline();
      const session = await this.getSessionById(sessionId);
      const movements = await this.getSessionMovements(sessionId);

      // En modo 'user' el resumen solo incluye los pagos/devoluciones del cajero
      // que abrió esta caja, para no mezclar ventas de otros cajeros de la sucursal.
      const cashMode = await this.getCashSessionMode();
      const filterByCashier = cashMode === 'user' && !!session.opened_by;

      // Calcular pagos en efectivo del período (ventas vs compras a proveedores)
      let cashPaymentsQuery = supabase
        .from('payments')
        .select('amount, source, change_amount')
        .eq('organization_id', this.organizationId)
        .eq('method', 'cash')
        .eq('status', 'completed')
        .gte('created_at', session.opened_at)
        .lte('created_at', session.closed_at || new Date().toISOString());
      if (session.branch_id) {
        cashPaymentsQuery = cashPaymentsQuery.eq('branch_id', session.branch_id);
      }
      if (filterByCashier) {
        cashPaymentsQuery = cashPaymentsQuery.eq('created_by', session.opened_by);
      }
      const cashPaymentsRes = await cashPaymentsQuery;
      const paymentsError = cashPaymentsRes.error;
      let cashPayments = cashPaymentsRes.data;

      if (paymentsError) {
        if (!offline) throw paymentsError;
        console.warn('[CajasService] Sin red y sin réplica de payments; el resumen solo cuenta el outbox:', paymentsError);
        this.lastSummaryWasPartial = true;
        cashPayments = [];
      }

      const PURCHASE_SOURCES = ['invoice_purchase', 'account_payable'];
      const AR_SOURCE = 'account_receivable';
      // Sumar vuelto total entregado en ventas (no en compras ni abonos)
      const changeTotal = (cashPayments || [])
        .filter(p => !PURCHASE_SOURCES.includes(p.source) && p.source !== AR_SOURCE)
        .reduce((sum, payment) => sum + Number(payment.change_amount || 0), 0);
      // salesCash = efectivo de ventas (sin abonos a cuentas por cobrar) - vuelto
      const salesCashPayments = (cashPayments || [])
        .filter(p => !PURCHASE_SOURCES.includes(p.source) && p.source !== AR_SOURCE);
      const salesCash = salesCashPayments
        .reduce((sum, payment) => sum + Number(payment.amount), 0) - changeTotal;
      // Recibos de caja en efectivo (abonos a cuentas por cobrar)
      const cashReceiptsCash = (cashPayments || [])
        .filter(p => p.source === AR_SOURCE)
        .reduce((sum, payment) => sum + Number(payment.amount), 0);
      const purchasesCash = (cashPayments || [])
        .filter(p => PURCHASE_SOURCES.includes(p.source))
        .reduce((sum, payment) => sum + Number(payment.amount), 0);

      // Devoluciones procesadas en el período, solo las heredadas (sin
      // refund_method): las de procesar_devolucion en efectivo ya son una
      // salida en cash_movements y las de saldo a favor no sacan efectivo.
      // Misma regla que pos_caja_esperado en el servidor.
      let returnsQuery = supabase
        .from('returns')
        .select('total_refund')
        .eq('organization_id', this.organizationId)
        .eq('status', 'processed')
        .is('refund_method', null)
        .gte('created_at', session.opened_at)
        .lte('created_at', session.closed_at || new Date().toISOString());
      if (session.branch_id) {
        returnsQuery = returnsQuery.eq('branch_id', session.branch_id);
      }
      if (filterByCashier) {
        returnsQuery = returnsQuery.eq('user_id', session.opened_by);
      }
      const { data: returnsData, error: returnsError } = await returnsQuery;

      if (returnsError) {
        console.warn('Error consultando devoluciones:', returnsError);
      }
      const returnsTotal = (returnsData || []).reduce((sum, r) => sum + Number(r.total_refund), 0);

      // Consultar consumos de habitaciones (folio_items) asociados a esta sesi\u00f3n de caja
      const { data: folioItems, error: folioError } = await supabase
        .from('folio_items')
        .select('amount')
        .eq('cash_session_id', sessionId);

      if (folioError) {
        console.warn('Error consultando folio_items de la sesi\u00f3n:', folioError);
      }
      const folioConsumptionsTotal = (folioItems || []).reduce((sum, item) => sum + Number(item.amount), 0);

      // Calcular movimientos manuales de caja
      const cashIn = movements
        .filter(m => m.type === 'in')
        .reduce((sum, m) => sum + Number(m.amount), 0);

      const cashOut = movements
        .filter(m => m.type === 'out')
        .reduce((sum, m) => sum + Number(m.amount), 0);

      const expectedAmount = Number(session.initial_amount) + salesCash + cashReceiptsCash + cashIn - cashOut - purchasesCash - returnsTotal;

      // Obtener pagos agrupados por metodo, separando ingresos (ventas) de egresos (compras)
      let allPaymentsQuery = supabase
        .from('payments')
        .select('method, amount, source')
        .eq('organization_id', this.organizationId)
        .eq('status', 'completed')
        .gte('created_at', session.opened_at)
        .lte('created_at', session.closed_at || new Date().toISOString());
      if (session.branch_id) {
        allPaymentsQuery = allPaymentsQuery.eq('branch_id', session.branch_id);
      }
      if (filterByCashier) {
        allPaymentsQuery = allPaymentsQuery.eq('created_by', session.opened_by);
      }
      const allPaymentsRes = await allPaymentsQuery;
      const allPaymentsError = allPaymentsRes.error;
      let allPayments = allPaymentsRes.data;

      if (allPaymentsError) {
        if (!offline) throw allPaymentsError;
        this.lastSummaryWasPartial = true;
        allPayments = [];
      }

      const EXPENSE_SOURCES = ['invoice_purchase', 'account_payable'];
      // Sources que corresponden a ventas (POS, mesa o factura de venta)
      const SALES_SOURCES = ['invoice_sales', 'sale'];

      const incomeByMethod: Record<string, number> = {};
      const expenseByMethod: Record<string, number> = {};
      const cashReceiptsByMethod: Record<string, number> = {};
      const purchasesByMethod: Record<string, number> = {};
      const salesByMethod: Record<string, number> = {};
      (allPayments || []).forEach(p => {
        const method = p.method || 'other';
        if (EXPENSE_SOURCES.includes(p.source)) {
          expenseByMethod[method] = (expenseByMethod[method] || 0) + Number(p.amount);
          purchasesByMethod[method] = (purchasesByMethod[method] || 0) + Number(p.amount);
        } else {
          incomeByMethod[method] = (incomeByMethod[method] || 0) + Number(p.amount);
        }
        if (p.source === AR_SOURCE) {
          cashReceiptsByMethod[method] = (cashReceiptsByMethod[method] || 0) + Number(p.amount);
        }
        // Ventas (POS/mesa/factura) agrupadas por método, sin abonos ni compras
        if (SALES_SOURCES.includes(p.source)) {
          salesByMethod[method] = (salesByMethod[method] || 0) + Number(p.amount);
        }
      });

      // Total de ventas (todos los métodos) restando el vuelto entregado en efectivo
      const salesTotal = Object.entries(salesByMethod).reduce(
        (sum, [, amount]) => sum + amount,
        0,
      ) - changeTotal;

      const summary: CashSummary = {
        initial_amount: Number(session.initial_amount),
        sales_cash: salesCash,
        cash_in: cashIn,
        cash_out: cashOut,
        expected_amount: expectedAmount,
        counted_amount: session.final_amount ? Number(session.final_amount) : undefined,
        difference: session.difference ? Number(session.difference) : undefined,
        change_total: changeTotal,
        returns_total: returnsTotal,
        folio_consumptions_total: folioConsumptionsTotal,
        cash_receipts_total: cashReceiptsCash,
        cash_receipts_by_method: cashReceiptsByMethod,
        purchases_total: Object.values(purchasesByMethod).reduce((sum, v) => sum + v, 0),
        purchases_by_method: purchasesByMethod,
        payments_by_method: incomeByMethod,
        income_by_method: incomeByMethod,
        expense_by_method: expenseByMethod,
        sales_total: salesTotal,
        sales_by_method: salesByMethod,
        sales_cash_count: salesCashPayments.length,
        cash_in_count: movements.filter(m => m.type === 'in').length,
        cash_out_count: movements.filter(m => m.type === 'out').length,
      };

      if (!isDesktop()) return summary;

      // Fase 4F: ventas del outbox (4B) que aún no tienen `payments` en Supabase.
      try {
        const { listOutboxSales } = await import('@/lib/offline/salesOutbox');
        const pendingSales = await listOutboxSales(['pending', 'syncing', 'needs_review']);
        return applyOutboxSalesToSummary(summary, outboxSalesDeltas(session, pendingSales, { filterByCashier }));
      } catch (outboxError) {
        console.warn('[CajasService] No se pudo leer el outbox de ventas para el resumen:', outboxError);
        return summary;
      }
    } catch (error) {
      console.error('Error calculating cash summary:', error);
      throw error;
    }
  }

  /**
   * Resumen completo de una caja (sesión, esperado, movimientos, arqueos,
   * ventas del turno y permisos) leído del servidor con la máscara del cierre
   * ciego ya aplicada (`GET /api/pos/cajas/[id]/resumen`). `idOUuid` es el
   * número de la caja o su uuid.
   *
   * Desktop sin red: el servidor no está; se arma con el cálculo local de
   * siempre (`getCashSummary` sobre réplica + outbox) y `sinRed: true`. La
   * visibilidad la decide entonces la pantalla con `useBlindCloseMode`.
   */
  static async getResumen(
    idOUuid: string | number,
    opciones: { ventas?: boolean; sesionLocal?: CashSession } = {},
  ): Promise<ResumenCaja & { sinRed?: boolean }> {
    const local = opciones.sesionLocal;
    if (shouldOperateCashOffline() || (local && local.id < 0)) {
      return this.resumenSinRed(local ?? (await this.getSessionById(Number(idOUuid))));
    }
    const headers: Record<string, string> = {};
    if (this.organizationId) headers['x-organization-id'] = String(this.organizationId);
    const qs = opciones.ventas === false ? '?ventas=0' : '';
    const response = await fetch(`/api/pos/cajas/${encodeURIComponent(String(idOUuid))}/resumen${qs}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers,
    });
    const body = (await response.json().catch(() => null)) as (ResumenCaja & { error?: string; codigo?: string }) | null;
    if (!response.ok || !body || !('sesion' in body)) {
      throw new ErrorCaja(body?.codigo || 'lectura_fallida', body?.error || 'No se pudo leer la caja');
    }
    return body;
  }

  /**
   * Cifras de varias cajas abiertas en una petición (`GET /api/pos/cajas/resumenes`).
   * Sin red: el cálculo local de cada una.
   */
  static async getResumenes(ids: number[]): Promise<Map<number, ResumenCompacto>> {
    const mapa = new Map<number, ResumenCompacto>();
    const reales = ids.filter((id) => id > 0);
    if (shouldOperateCashOffline() || reales.length === 0) {
      const calculados = await Promise.allSettled(ids.map((id) => this.getCashSummary(id)));
      calculados.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          mapa.set(ids[i], {
            sales_cash: r.value.sales_cash,
            sales_cash_count: r.value.sales_cash_count ?? 0,
            expected_amount: r.value.expected_amount,
            cash_in: r.value.cash_in,
            cash_out: r.value.cash_out,
            cash_in_count: r.value.cash_in_count ?? 0,
            cash_out_count: r.value.cash_out_count ?? 0,
          });
        }
      });
      return mapa;
    }
    const headers: Record<string, string> = {};
    if (this.organizationId) headers['x-organization-id'] = String(this.organizationId);
    const response = await fetch(`/api/pos/cajas/resumenes?ids=${reales.join(',')}`, { credentials: 'same-origin', cache: 'no-store', headers });
    const body = (await response.json().catch(() => null)) as { resumenes?: Record<string, ResumenCompacto>; codigo?: string; error?: string } | null;
    if (!response.ok || !body?.resumenes) throw new ErrorCaja(body?.codigo || 'lectura_fallida', body?.error || 'No se pudieron leer las cajas');
    for (const [id, r] of Object.entries(body.resumenes)) mapa.set(Number(id), r);
    return mapa;
  }

  /** Resumen sin red (Desktop): mismo contrato que el del servidor, con el cálculo local. */
  private static async resumenSinRed(session: CashSession): Promise<ResumenCaja & { sinRed: true }> {
    const [summary, movements, mode] = await Promise.all([
      this.getCashSummary(session.id),
      this.getSessionMovements(session.id),
      this.getCashSessionMode(),
    ]);
    const userId = await getCurrentUserId();
    const porMetodo: Record<string, number> = { ...(summary.income_by_method ?? {}) };
    porMetodo.cash = summary.expected_amount;
    return {
      sinRed: true,
      modo: mode,
      sesion: {
        id: session.id,
        uuid: session.uuid,
        organization_id: session.organization_id,
        branch_id: session.branch_id,
        branch_name: session.branch_name ?? null,
        opened_by: session.opened_by,
        opened_by_name: session.opened_by_name ?? null,
        opened_at: session.opened_at,
        initial_amount: Number(session.initial_amount),
        closed_at: session.closed_at ?? null,
        closed_by: session.closed_by ?? null,
        closed_by_name: session.closed_by_name ?? null,
        final_amount: session.final_amount ?? null,
        difference: session.difference ?? null,
        status: session.status,
        notes: session.notes ?? null,
      },
      esperado: {
        session_id: session.id,
        status: session.status,
        efectivo_esperado: summary.expected_amount,
        por_metodo: porMetodo,
        detalle: {
          inicial: summary.initial_amount,
          ventas_efectivo: summary.sales_cash,
          vuelto: summary.change_total,
          abonos_efectivo: summary.cash_receipts_by_method?.cash ?? 0,
          entradas: summary.cash_in,
          salidas: summary.cash_out,
          compras_efectivo: summary.purchases_by_method?.cash ?? 0,
          devoluciones: summary.returns_total,
        },
        por_cajero: mode === 'user',
        hasta: session.closed_at ?? null,
        oculto: false,
      },
      movimientos: movements.map((m) => ({
        id: m.id,
        uuid: m.uuid ?? null,
        type: m.type,
        concept: m.concept,
        concept_code: m.concept_code ?? null,
        clave_concepto: claveDeConcepto(m),
        reference: m.reference ?? null,
        amount: Number(m.amount),
        notes: m.notes ?? null,
        created_at: m.created_at,
        user_id: m.user_id,
        user_name: m.user_name ?? null,
      })),
      arqueos: [],
      ventas: { cantidad: 0, total: 0, filas: [], truncadas: false },
      permisos: {
        cerrarCajasAjenas: false,
        verEsperadoEnCierreCiego: false,
        esPropia: session.opened_by === userId,
        puedeCerrar: session.status === 'open' && session.opened_by === userId,
      },
      cierreCiego: false,
      verImportes: true,
    };
  }

  /**
   * Obtiene una sesión por ID numérico
   */
  static async getSessionById(sessionId: number): Promise<CashSession> {
    try {
      // Fase 4F: id local negativo = sesión abierta sin red (aún sin fila en Supabase).
      if (sessionId < 0) {
        const local = this.organizationId ? await getLocalCashSessionById(this.organizationId, sessionId) : null;
        if (!local) throw new Error(`La sesión de caja local ${sessionId} ya no existe en este equipo`);
        return local.session;
      }

      const { data, error } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Error getting session by ID:', error);
      throw error;
    }
  }

  /**
   * Obtiene una sesión por UUID
   */
  static async getSessionByUuid(uuid: string): Promise<CashSession> {
    try {
      const { data, error } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('uuid', uuid)
        .single();

      if (error) throw error;

      const session = data as CashSession;

      // Obtener nombre del cajero
      if (session?.opened_by) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', session.opened_by)
          .single();
        if (profileData) {
          // Sin nombre queda vacío: la pantalla pone su respaldo traducido («Cajero», «—»).
          session.opened_by_name = `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() || undefined;
        }
      }

      // Obtener nombre de la sucursal
      if (session?.branch_id) {
        const { data: branchData } = await supabase
          .from('branches')
          .select('name')
          .eq('id', session.branch_id)
          .single();
        if (branchData) {
          session.branch_name = branchData.name;
        }
      }

      return session;
    } catch (error) {
      console.error('Error getting session by UUID:', error);
      throw error;
    }
  }

  // ===============================
  // ARQUEOS DE CAJA
  // ===============================

  /**
   * Obtiene los arqueos de una sesión de caja
   */
  static async getSessionCounts(sessionId: number): Promise<CashCount[]> {
    try {
      const { data, error } = await supabase
        .from('cash_counts')
        .select('*')
        .eq('cash_session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error getting session counts:', error);
      throw error;
    }
  }

  /**
   * Crea un arqueo de caja.
   *
   * Va por `pos_caja_registrar_arqueo`: el esperado lo calcula el servidor y
   * `difference` la calcula Postgres (columna GENERATED; mandarla en el insert
   * daba 428C9 y ningún arqueo se había podido guardar). Efectivo contra
   * efectivo; cada otro método contra su esperado en `method_breakdown`.
   */
  static async createCashCount(sessionId: number, data: CreateCashCountData): Promise<CashCount> {
    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        throw new ErrorCaja('no_autenticado', 'Usuario no autenticado');
      }

      const { data: count, error } = await supabase.rpc(
        'pos_caja_registrar_arqueo',
        parametrosArqueo(sessionId, data),
      );

      if (error) throw error;

      return count as CashCount;
    } catch (error) {
      console.error('Error creating cash count:', error);
      throw error;
    }
  }

  /**
   * Registra un movimiento en una sesión específica
   */
  static async addMovementToSession(sessionId: number, data: CreateCashMovementData): Promise<CashMovement> {
    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        throw new ErrorCaja('no_autenticado', 'Usuario no autenticado');
      }

      // La RPC exige caja abierta de la organización (antes solo lo comprobaba la pantalla).
      const movement = await this.registrarMovimiento(sessionId, data);
      console.log('Movimiento registrado en sesión:', movement.id);
      return movement;
    } catch (error) {
      console.error('Error adding movement to session:', error);
      throw error;
    }
  }

  /**
   * Escribe el movimiento por `pos_caja_registrar_movimiento` (caja abierta,
   * autor = sesión, idempotente por uuid). Ya no hay INSERT directo en
   * `cash_movements` desde el navegador (fase 2 de la RLS de cajas).
   */
  private static async registrarMovimiento(sessionId: number, data: CreateCashMovementData | CashMovementData): Promise<CashMovement> {
    const { data: fila, error } = await supabase.rpc(RPC_MOVIMIENTO_CAJA, parametrosMovimiento(sessionId, data as DatosMovimientoCaja));
    if (error) {
      const codigo = codigoErrorMovimiento(error);
      throw new ErrorCaja(codigo, (error as { message?: string }).message || 'No se pudo registrar el movimiento');
    }
    return movimientoDeRpc<CashMovement>(fila);
  }

  /**
   * Crea arqueo por UUID de sesión
   */
  static async createCashCountByUuid(uuid: string, data: CreateCashCountData): Promise<CashCount> {
    const session = await this.getSessionByUuid(uuid);
    return this.createCashCount(session.id, data);
  }

  /**
   * Origen web por factura: las facturas de ventas `source='web'` (pedido web
   * cobrado en la caja, E4) devuelven número de pedido, tipo de entrega y mesa;
   * la UI los traduce. Si la consulta falla, las facturas quedan sin origen web.
   */
  private static async origenWebDeFacturas(facturas: InvoiceSaleRef[]): Promise<Map<string, NonNullable<SessionPaymentDetail['pedidoWeb']>>> {
    const salida = new Map<string, NonNullable<SessionPaymentDetail['pedidoWeb']>>();
    const ventaIds = Array.from(new Set(facturas.map((f) => f.sale_id).filter((x): x is string => !!x)));
    if (ventaIds.length === 0) return salida;
    try {
      const { data: ventas } = await supabase
        .from('sales')
        .select('id, source, web_order_id')
        .eq('organization_id', this.organizationId)
        .in('id', ventaIds)
        .eq('source', 'web');
      const pedidoIds = Array.from(new Set(((ventas ?? []) as Array<{ web_order_id: string | null }>).map((v) => v.web_order_id).filter((x): x is string => !!x)));
      if (pedidoIds.length === 0) return salida;
      const { data: pedidos } = await supabase
        .from('web_orders')
        .select('id, order_number, delivery_type, internal_notes')
        .eq('organization_id', this.organizationId)
        .in('id', pedidoIds);
      const porPedido = new Map(((pedidos ?? []) as Array<{ id: string; order_number: string; delivery_type: string | null; internal_notes: string | null }>).map((p) => [p.id, p]));
      const porVenta = new Map(((ventas ?? []) as Array<{ id: string; web_order_id: string | null }>).map((v) => [v.id, v.web_order_id ? porPedido.get(v.web_order_id) : undefined]));
      for (const f of facturas) {
        const pedido = f.sale_id ? porVenta.get(f.sale_id) : undefined;
        if (!pedido) continue;
        salida.set(f.id, { numero: pedido.order_number, entrega: tipoEntregaEfectivo(pedido), mesa: mesaDelPedido(pedido) });
      }
    } catch (err) {
      console.warn('No se pudo leer el origen web de las facturas de la caja:', err);
    }
    return salida;
  }

  /**
   * Obtiene el detalle de cada pago (movimiento) realizado durante la sesion:
   * ventas POS, ventas de mesa, facturas de venta y facturas de compra pagadas.
   */
  static async getSessionPaymentsDetail(sessionId: number): Promise<SessionPaymentDetail[]> {
    try {
      const session = await this.getSessionById(sessionId);

      // En modo 'user' solo se incluyen los pagos registrados por el cajero de esta caja
      const detailCashMode = await this.getCashSessionMode();
      const detailFilterByCashier = detailCashMode === 'user' && !!session.opened_by;

      let paymentsQuery = supabase
        .from('payments')
        .select('id, amount, method, source, source_id, created_at, reference')
        .eq('organization_id', this.organizationId)
        .eq('branch_id', session.branch_id)
        .eq('status', 'completed')
        .gte('created_at', session.opened_at)
        .lte('created_at', session.closed_at || new Date().toISOString());
      if (detailFilterByCashier) {
        paymentsQuery = paymentsQuery.eq('created_by', session.opened_by);
      }
      const { data: payments, error } = await paymentsQuery
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (!payments || payments.length === 0) return [];

      const invoiceSaleIds = payments.filter(p => p.source === 'invoice_sales').map(p => p.source_id);
      const invoicePurchaseIds = payments.filter(p => p.source === 'invoice_purchase').map(p => p.source_id);
      const saleIds = payments.filter(p => p.source === 'sale').map(p => p.source_id);
      const arIds = payments.filter(p => p.source === 'account_receivable').map(p => p.source_id);
      const apIds = payments.filter(p => p.source === 'account_payable').map(p => p.source_id);

      const [invoiceSalesRes, invoicePurchaseRes, salesRes, arRes, apRes] = await Promise.all([
        invoiceSaleIds.length
          ? supabase.from('invoice_sales').select('id, number, customer_id, sale_id').in('id', invoiceSaleIds)
          : Promise.resolve({ data: [] as InvoiceSaleRef[] }),
        invoicePurchaseIds.length
          ? supabase.from('invoice_purchase').select('id, number_ext, supplier_id').in('id', invoicePurchaseIds)
          : Promise.resolve({ data: [] as InvoicePurchaseRef[] }),
        saleIds.length
          ? supabase.from('sales').select('id, table_session_id, customer_id, include_in_cash_register').in('id', saleIds)
          : Promise.resolve({ data: [] as SaleRef[] }),
        arIds.length
          ? supabase.from('accounts_receivable').select('id, invoice_id, customer_id').in('id', arIds)
          : Promise.resolve({ data: [] as ArRef[] }),
        apIds.length
          ? supabase.from('accounts_payable').select('id, invoice_id, supplier_id').in('id', apIds)
          : Promise.resolve({ data: [] as ApRef[] }),
      ]);

      const invoiceSalesRows = (invoiceSalesRes.data || []) as InvoiceSaleRef[];
      const invoicePurchaseRows = (invoicePurchaseRes.data || []) as InvoicePurchaseRef[];
      const salesRows = (salesRes.data || []) as SaleRef[];
      const arRows = (arRes.data || []) as ArRef[];
      const apRows = (apRes.data || []) as ApRef[];
      const invoiceSalesMap = new Map(invoiceSalesRows.map((i) => [i.id, i]));
      const invoicePurchaseMap = new Map(invoicePurchaseRows.map((i) => [i.id, i]));
      const salesMap = new Map(salesRows.map((s) => [s.id, s]));
      const arMap = new Map(arRows.map((a) => [a.id, a]));
      const apMap = new Map(apRows.map((a) => [a.id, a]));

      // Excluir payments de ventas/facturas que no entran en caja (include_in_cash_register=false).
      // Esto incluye ventas web, reservas, CRM y facturas marcadas como "no incluir en caja".
      const excludedSaleIds = new Set(
        salesRows
          .filter((s) => s.include_in_cash_register === false)
          .map((s) => s.id)
      );
      // Para invoices de venta, verificar si su sale_id está excluido
      const excludedInvoiceIds = new Set(
        invoiceSalesRows
          .filter((i) => i.sale_id && excludedSaleIds.has(i.sale_id))
          .map((i) => i.id)
      );
      // Si una invoice no tiene sale_id pero proviene de una sale excluida,
      // no podemos saberlo directamente. Sin embargo, las invoices creadas desde
      // finanzas (source='invoice') con include_in_cash_register=false ya tienen
      // su sale_id en la invoice, así que el filtro anterior las cubre.

      // Filtrar payments que no deben aparecer en caja
      const filteredPayments = payments.filter(p => {
        if (p.source === 'sale' && excludedSaleIds.has(p.source_id)) return false;
        if (p.source === 'invoice_sales' && excludedInvoiceIds.has(p.source_id)) return false;
        return true;
      });

      // Origen web de las facturas cobradas (pedido web cobrado en caja, E4):
      // número, tipo de entrega y mesa; la UI lo traduce.
      const origenWebPorFactura = await this.origenWebDeFacturas(invoiceSalesRows);

      const customerIds = new Set<string>();
      invoiceSalesRows.forEach((i) => i.customer_id && customerIds.add(i.customer_id));
      salesRows.forEach((s) => s.customer_id && customerIds.add(s.customer_id));
      arRows.forEach((a) => a.customer_id && customerIds.add(a.customer_id));

      const supplierIds = new Set<string>();
      invoicePurchaseRows.forEach((i) => i.supplier_id && supplierIds.add(i.supplier_id));
      apRows.forEach((a) => a.supplier_id && supplierIds.add(a.supplier_id));

      const [customersRes, suppliersRes] = await Promise.all([
        customerIds.size
          ? supabase.from('customers').select('id, full_name, company_name').in('id', Array.from(customerIds))
          : Promise.resolve({ data: [] as CustomerRef[] }),
        supplierIds.size
          ? supabase.from('suppliers').select('id, name').in('id', Array.from(supplierIds))
          : Promise.resolve({ data: [] as SupplierRef[] }),
      ]);

      const customersMap = new Map(((customersRes.data || []) as CustomerRef[]).map((c) => [c.id, c.company_name || c.full_name || undefined]));
      const suppliersMap = new Map(((suppliersRes.data || []) as SupplierRef[]).map((s) => [s.id, s.name || undefined]));

      const details: SessionPaymentDetail[] = filteredPayments.map(p => {
        let type: SessionMovementType = 'otro';
        let direction: 'in' | 'out' = 'in';
        let label = 'Movimiento';
        let reference: string | undefined;
        let counterparty: string | undefined;

        if (p.source === 'invoice_sales') {
          const inv = invoiceSalesMap.get(p.source_id);
          type = 'venta_factura';
          direction = 'in';
          label = 'Factura de Venta';
          reference = inv?.number ?? undefined;
          counterparty = inv?.customer_id ? customersMap.get(inv.customer_id) : undefined;
        } else if (p.source === 'invoice_purchase') {
          const inv = invoicePurchaseMap.get(p.source_id);
          type = 'compra_factura';
          direction = 'out';
          label = 'Factura de Compra';
          reference = inv?.number_ext ?? undefined;
          counterparty = inv?.supplier_id ? suppliersMap.get(inv.supplier_id) : undefined;
        } else if (p.source === 'sale') {
          const sale = salesMap.get(p.source_id);
          const esMesa = !!sale?.table_session_id;
          type = esMesa ? 'venta_mesa' : 'venta_pos';
          direction = 'in';
          label = esMesa ? 'Venta de Mesa' : 'Venta POS';
          reference = p.source_id?.slice(0, 8);
          counterparty = sale?.customer_id ? customersMap.get(sale.customer_id) : undefined;
        } else if (p.source === 'account_receivable') {
          const ar = arMap.get(p.source_id);
          type = 'cuenta_por_cobrar';
          direction = 'in';
          label = 'Cuenta por Cobrar';
          counterparty = ar?.customer_id ? customersMap.get(ar.customer_id) : undefined;
        } else if (p.source === 'account_payable') {
          const ap = apMap.get(p.source_id);
          type = 'cuenta_por_pagar';
          direction = 'out';
          label = 'Cuenta por Pagar';
          counterparty = ap?.supplier_id ? suppliersMap.get(ap.supplier_id) : undefined;
        }

        const pedidoWeb = p.source === 'invoice_sales' ? origenWebPorFactura.get(p.source_id) : undefined;
        return {
          id: p.id,
          type,
          direction,
          label,
          ...(pedidoWeb ? { pedidoWeb } : {}),
          reference,
          counterparty,
          method: p.method || 'other',
          amount: Number(p.amount),
          created_at: p.created_at,
        };
      });

      return details;
    } catch (error) {
      console.error('Error getting session payments detail:', error);
      throw error;
    }
  }

  /**
   * Suscripción realtime a cambios en cash_sessions y cash_movements.
   * Sigue el mismo patrón que KitchenService.subscribeToKitchenTickets.
   * Notifica al consumidor para que recargue con sus propios filtros/servicio.
   * Retorna una función de cleanup que elimina el canal.
   */
  static subscribeToCashSessions(
    organizationId: number,
    onChange: () => void,
    options?: { includeMovements?: boolean }
  ): () => void {
    // `cash_sessions` y `cash_movements` no están en la publicación
    // `supabase_realtime`: abrir canales consume conexiones del pool sin
    // recibir eventos. Si se publican, agregarlas a REALTIME_PUBLISHED_TABLES.
    if (!isRealtimePublished('cash_sessions')) return () => {};

    const includeMovements = options?.includeMovements ?? true;
    const channelName = `cash_sessions_changes_${organizationId}_${Date.now()}`;

    let channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cash_sessions',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => onChange()
      );

    if (includeMovements) {
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cash_movements',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => onChange()
      );
    }

    channel.subscribe();

    // Retornar función de cleanup que elimina el canal
    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (err) {
        console.warn('Error removing cash_sessions channel:', err);
      }
    };
  }
}
