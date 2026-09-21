import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { notifyCustomerDisplaySettingsChanged } from '@/lib/pos/display/posDisplay';
import {
  DEFAULT_CUSTOMER_DISPLAY_SETTINGS,
  POS_CUSTOMER_DISPLAY_KEY,
  parseCustomerDisplaySettings,
  primeCustomerDisplaySettings,
  type CustomerDisplaySettings,
} from '@/lib/pos/display/settings';

export interface PaymentMethod {
  code: string;
  name: string;
  requires_reference: boolean;
  is_active: boolean;
  is_system: boolean;
}

export interface OrganizationPaymentMethod {
  id: number;
  organization_id: number;
  payment_method_code: string;
  is_active: boolean;
  settings: Record<string, unknown>;
  payment_methods?: PaymentMethod;
}

export interface OrganizationTax {
  id: string;
  organization_id: number;
  name: string;
  rate: number;
  description?: string;
  is_default: boolean;
  is_active: boolean;
}

export interface ServiceCharge {
  id: number;
  organization_id: number;
  branch_id?: number;
  name: string;
  charge_type: 'percentage' | 'fixed';
  charge_value: number;
  min_amount?: number;
  min_guests?: number;
  applies_to: string;
  is_taxable: boolean;
  is_optional: boolean;
  is_active: boolean;
}

export interface InvoiceSequence {
  id: number;
  organization_id: number;
  branch_id: number;
  document_type: string;
  resolution_number?: string;
  resolution_date?: string;
  prefix: string;
  range_start: number;
  range_end: number;
  current_number: number;
  valid_from?: string;
  valid_until?: string;
  is_active: boolean;
  alert_threshold: number;
}

export interface SaleSequence {
  id: number;
  organization_id: number;
  branch_id: number;
  sequence_type: string;
  prefix?: string;
  current_number: number;
  padding: number;
  reset_period?: string;
  last_reset_at?: string;
  is_active: boolean;
  branches?: { name: string };
}

export interface ConfigStats {
  paymentMethods: number;
  taxes: number;
  serviceCharges: number;
  invoiceSequences: number;
  saleSequences: number;
}

export type PosCategoryDisplayMode = 'searchselect' | 'buttons' | 'images';
export type PosCategoryOrderBy = 'display_order' | 'rank' | 'name' | 'favorites';

export interface PosCategoriesDisplayConfig {
  mode: PosCategoryDisplayMode;
  orderBy: PosCategoryOrderBy;
}

const POS_CATEGORIES_DISPLAY_KEY = 'pos_categories_display';

export interface PosRequireCashSessionConfig {
  require_cash_session: boolean;
}

const POS_REQUIRE_CASH_SESSION_KEY = 'pos_require_cash_session';

export const defaultRequireCashSessionConfig: PosRequireCashSessionConfig = {
  require_cash_session: true,
};

export interface PosBlindCashCountConfig {
  blind_cash_count: boolean;
}

const POS_BLIND_CASH_COUNT_KEY = 'pos_blind_cash_count';

export const defaultBlindCashCountConfig: PosBlindCashCountConfig = {
  blind_cash_count: false,
};

/**
 * Modo de asignación de cajas en una sucursal.
 * - 'branch': una sola caja compartida por sucursal (default, comportamiento histórico).
 * - 'user':   cada cajero (miembro) abre y gestiona su propia caja dentro de la sucursal,
 *             llevando el registro individual de sus ventas y haciendo su propio cierre.
 */
export type PosCashSessionMode = 'branch' | 'user';

export interface PosCashSessionModeConfig {
  mode: PosCashSessionMode;
}

const POS_CASH_SESSION_MODE_KEY = 'pos_cash_session_mode';

export const defaultCashSessionModeConfig: PosCashSessionModeConfig = {
  mode: 'branch',
};

export const defaultCategoriesDisplayConfig: PosCategoriesDisplayConfig = {
  mode: 'searchselect',
  // Favoritas primero y luego las más vendidas, igual que los productos del POS.
  // Se puede cambiar en Configuración del POS → Categorías.
  orderBy: 'favorites',
};

export class ConfiguracionService {
  // Obtener métodos de pago de la organización
  static async getPaymentMethods(): Promise<OrganizationPaymentMethod[]> {
    const orgId = getOrganizationId();

    const { data, error } = await supabase
      .from('organization_payment_methods')
      .select(`
        id,
        organization_id,
        payment_method_code,
        is_active,
        settings,
        payment_methods!inner(code, name, requires_reference, is_active, is_system)
      `)
      .eq('organization_id', orgId)
      .order('payment_method_code');

    if (error) throw error;
    // supabase-js tipa payment_methods como arreglo aunque sea relacion a-uno
    return (data || []) as unknown as OrganizationPaymentMethod[];
  }

  // Obtener todos los métodos de pago disponibles
  static async getAllPaymentMethods(): Promise<PaymentMethod[]> {
    const { data, error } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  // Activar/desactivar método de pago
  static async togglePaymentMethod(id: number, isActive: boolean): Promise<void> {
    // `.select()` es obligatorio para saber si la fila cambió de verdad: un
    // UPDATE que RLS bloquea NO devuelve error, simplemente afecta 0 filas.
    // Sin esto el interruptor se movía en pantalla, el usuario creía haber
    // guardado y al recargar volvía atrás. Escribir métodos de pago exige el
    // permiso `billing_management` (pantalla de roles y de cargos).
    const { data, error } = await supabase
      .from('organization_payment_methods')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id');

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(
        'No se pudo cambiar el método de pago: tu cargo o rol no tiene el permiso de facturación.'
      );
    }
  }

  // Agregar método de pago a la organización
  static async addPaymentMethod(code: string): Promise<void> {
    const orgId = getOrganizationId();

    const { error } = await supabase
      .from('organization_payment_methods')
      .insert({
        organization_id: orgId,
        payment_method_code: code,
        is_active: true,
        settings: {},
      });

    if (error) throw error;
  }

  // Obtener impuestos de la organización
  static async getTaxes(): Promise<OrganizationTax[]> {
    const orgId = getOrganizationId();

    const { data, error } = await supabase
      .from('organization_taxes')
      .select('*')
      .eq('organization_id', orgId)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  // Obtener cargos de servicio
  static async getServiceCharges(): Promise<ServiceCharge[]> {
    const orgId = getOrganizationId();

    const { data, error } = await supabase
      .from('service_charges')
      .select('*')
      .eq('organization_id', orgId)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  // Activar/desactivar cargo de servicio
  static async toggleServiceCharge(id: number, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from('service_charges')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }

  // Obtener secuencias de facturación
  static async getInvoiceSequences(): Promise<InvoiceSequence[]> {
    const orgId = getOrganizationId();

    const { data, error } = await supabase
      .from('invoice_sequences')
      .select('*')
      .eq('organization_id', orgId)
      .order('prefix');

    if (error) throw error;
    return data || [];
  }

  // Obtener secuencias de ventas
  static async getSaleSequences(): Promise<SaleSequence[]> {
    const orgId = getOrganizationId();

    const { data, error } = await supabase
      .from('sale_sequences')
      .select(`
        *,
        branches(name)
      `)
      .eq('organization_id', orgId)
      .order('sequence_type');

    if (error) throw error;
    return data || [];
  }

  // Obtener estadísticas de configuración
  static async getConfigStats(): Promise<ConfigStats> {
    const orgId = getOrganizationId();

    const [paymentMethods, taxes, serviceCharges, invoiceSequences, saleSequences] = await Promise.all([
      supabase.from('organization_payment_methods').select('id', { count: 'exact' }).eq('organization_id', orgId).eq('is_active', true),
      supabase.from('organization_taxes').select('id', { count: 'exact' }).eq('organization_id', orgId).eq('is_active', true),
      supabase.from('service_charges').select('id', { count: 'exact' }).eq('organization_id', orgId).eq('is_active', true),
      supabase.from('invoice_sequences').select('id', { count: 'exact' }).eq('organization_id', orgId).eq('is_active', true),
      supabase.from('sale_sequences').select('id', { count: 'exact' }).eq('organization_id', orgId).eq('is_active', true),
    ]);

    return {
      paymentMethods: paymentMethods.count || 0,
      taxes: taxes.count || 0,
      serviceCharges: serviceCharges.count || 0,
      invoiceSequences: invoiceSequences.count || 0,
      saleSequences: saleSequences.count || 0,
    };
  }

  // Obtener configuración de visualización de categorías en el POS
  static async getCategoriesDisplayConfig(): Promise<PosCategoriesDisplayConfig> {
    const orgId = getOrganizationId();

    const { data, error } = await supabase
      .from('organization_settings')
      .select('settings')
      .eq('organization_id', orgId)
      .eq('key', POS_CATEGORIES_DISPLAY_KEY)
      .maybeSingle();

    if (error) {
      console.error('Error obteniendo configuración de categorías:', error);
      return defaultCategoriesDisplayConfig;
    }

    return { ...defaultCategoriesDisplayConfig, ...(data?.settings || {}) };
  }

  // Guardar configuración de visualización de categorías en el POS
  static async saveCategoriesDisplayConfig(config: Partial<PosCategoriesDisplayConfig>): Promise<void> {
    const orgId = getOrganizationId();
    const current = await this.getCategoriesDisplayConfig();
    const merged = { ...current, ...config };

    const { error } = await supabase
      .from('organization_settings')
      .upsert({
        organization_id: orgId,
        key: POS_CATEGORIES_DISPLAY_KEY,
        settings: merged,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'organization_id,key',
      });

    if (error) throw error;
  }

  // Obtener sucursales
  static async getBranches(): Promise<{ id: number; name: string }[]> {
    const orgId = getOrganizationId();

    const { data, error } = await supabase
      .from('branches')
      .select('id, name')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  // Obtener configuración de requerir caja abierta
  static async getRequireCashSessionConfig(): Promise<PosRequireCashSessionConfig> {
    const orgId = getOrganizationId();

    const { data, error } = await supabase
      .from('organization_settings')
      .select('settings')
      .eq('organization_id', orgId)
      .eq('key', POS_REQUIRE_CASH_SESSION_KEY)
      .maybeSingle();

    if (error) {
      console.error('Error obteniendo configuración de requerir caja:', error);
      return defaultRequireCashSessionConfig;
    }

    return { ...defaultRequireCashSessionConfig, ...(data?.settings || {}) };
  }

  // Guardar configuración de requerir caja abierta
  static async saveRequireCashSessionConfig(config: Partial<PosRequireCashSessionConfig>): Promise<void> {
    const orgId = getOrganizationId();
    const current = await this.getRequireCashSessionConfig();
    const merged = { ...current, ...config };

    const { error } = await supabase
      .from('organization_settings')
      .upsert({
        organization_id: orgId,
        key: POS_REQUIRE_CASH_SESSION_KEY,
        settings: merged,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'organization_id,key',
      });

    if (error) throw error;
  }

  // Obtener configuración de arqueo ciego
  static async getBlindCashCountConfig(): Promise<PosBlindCashCountConfig> {
    const orgId = getOrganizationId();

    const { data, error } = await supabase
      .from('organization_settings')
      .select('settings')
      .eq('organization_id', orgId)
      .eq('key', POS_BLIND_CASH_COUNT_KEY)
      .maybeSingle();

    if (error) {
      console.error('Error obteniendo configuración de arqueo ciego:', error);
      return defaultBlindCashCountConfig;
    }

    return { ...defaultBlindCashCountConfig, ...(data?.settings || {}) };
  }

  // Guardar configuración de arqueo ciego
  static async saveBlindCashCountConfig(config: Partial<PosBlindCashCountConfig>): Promise<void> {
    const orgId = getOrganizationId();
    const current = await this.getBlindCashCountConfig();
    const merged = { ...current, ...config };

    const { error } = await supabase
      .from('organization_settings')
      .upsert({
        organization_id: orgId,
        key: POS_BLIND_CASH_COUNT_KEY,
        settings: merged,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'organization_id,key',
      });

    if (error) throw error;
  }

  // Obtener configuración de modo de cajas (por sucursal vs por cajero)
  static async getCashSessionModeConfig(): Promise<PosCashSessionModeConfig> {
    const orgId = getOrganizationId();

    const { data, error } = await supabase
      .from('organization_settings')
      .select('settings')
      .eq('organization_id', orgId)
      .eq('key', POS_CASH_SESSION_MODE_KEY)
      .maybeSingle();

    if (error) {
      console.error('Error obteniendo configuración de modo de cajas:', error);
      return defaultCashSessionModeConfig;
    }

    const stored = data?.settings || {};
    // Validar que el modo sea uno de los valores permitidos
    const mode: PosCashSessionMode = stored.mode === 'user' ? 'user' : 'branch';
    return { mode };
  }

  // Guardar configuración de modo de cajas
  static async saveCashSessionModeConfig(config: Partial<PosCashSessionModeConfig>): Promise<void> {
    const orgId = getOrganizationId();
    const current = await this.getCashSessionModeConfig();
    const merged = { ...current, ...config };

    const { error } = await supabase
      .from('organization_settings')
      .upsert({
        organization_id: orgId,
        key: POS_CASH_SESSION_MODE_KEY,
        settings: merged,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'organization_id,key',
      });

    if (error) throw error;
  }

  // Fila cruda de `pos_customer_display` de la organización de la sesión.
  // PROPAGA el error de Supabase: quien guarda la usa para el merge y debe
  // abortar si no pudo leer (si continuara con {} borraría las claves de la
  // Fase 2: propina, calificación, reposo…). Sin fila: {}.
  private static async readCustomerDisplayRow(): Promise<Record<string, unknown>> {
    const orgId = getOrganizationId();

    const { data, error } = await supabase
      .from('organization_settings')
      .select('settings')
      .eq('organization_id', orgId)
      .eq('key', POS_CUSTOMER_DISPLAY_KEY)
      .maybeSingle();

    if (error) throw error;

    return data?.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
      ? (data.settings as Record<string, unknown>)
      : {};
  }

  // Obtener ajustes de la pantalla del cliente (PLAN pos-doble-pantalla §5.2).
  // Devuelve además el JSON crudo para que la UI conserve las claves que la
  // Fase 2 añadirá y que aún no edita. La CARGA de la tarjeta degrada a los
  // valores por defecto si la lectura falla (no lanza), pero lo DICE con
  // `loadFailed: true`: «no se pudo leer» no es «apagado». La tarjeta avisa y
  // no toma ese `enabled` por fiable (no lo persiste en el escritorio ni deja
  // alternarlo hasta releer con éxito). El guardado sí lanza (ver arriba).
  static async getCustomerDisplayConfig(): Promise<{ settings: CustomerDisplaySettings; raw: Record<string, unknown>; loadFailed: boolean }> {
    try {
      const raw = await this.readCustomerDisplayRow();
      return { settings: parseCustomerDisplaySettings(raw), raw, loadFailed: false };
    } catch (error) {
      console.error('Error obteniendo configuración de la pantalla del cliente:', error);
      return { settings: { ...DEFAULT_CUSTOMER_DISPLAY_SETTINGS }, raw: {}, loadFailed: true };
    }
  }

  // Guardar ajustes de la pantalla del cliente. Mismo upsert/onConflict que
  // operating_hours y el resto de claves de esta página; sin ruta de API.
  // La lectura previa va SIN catch: si falla, se lanza antes del upsert y la
  // fila no se toca (la tarjeta revierte el interruptor y avisa).
  // Las claves `undefined` del Partial se ignoran (conservan el valor de la
  // fila): un spread con undefined pisaría el `true` leído y el JSON
  // perdería la clave. Importa desde la Fase 2, cuando el Partial crece.
  static async saveCustomerDisplayConfig(config: Partial<CustomerDisplaySettings>): Promise<CustomerDisplaySettings> {
    const orgId = getOrganizationId();
    const raw = await this.readCustomerDisplayRow();
    const patch = Object.fromEntries(Object.entries(config).filter(([, value]) => value !== undefined));
    const merged = { ...raw, ...parseCustomerDisplaySettings(raw), ...patch };

    const { error } = await supabase
      .from('organization_settings')
      .upsert({
        organization_id: orgId,
        key: POS_CUSTOMER_DISPLAY_KEY,
        settings: merged,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'organization_id,key',
      });

    if (error) throw error;
    const saved = parseCustomerDisplaySettings(merged);
    // La caché de esta ventana se fija con lo recién escrito, sin releer: una
    // relectura que fallara cachearía «apagado» sobre un `true` que acaba de
    // guardarse, y la caja (misma ventana por navegación SPA) arrancaría apagada.
    primeCustomerDisplaySettings(orgId, saved);
    // Las cajas abiertas en OTRAS ventanas de este navegador releen el interruptor
    // por el evento `storage`; la de esta ventana aplica la caché con applyPosDisplaySettings() desde la tarjeta.
    notifyCustomerDisplaySettingsChanged();
    return saved;
  }
}
