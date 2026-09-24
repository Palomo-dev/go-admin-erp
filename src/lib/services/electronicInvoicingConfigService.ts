/**
 * Estado del servicio de facturación electrónica de la organización (navegador).
 *
 * GO Admin presta la facturación electrónica: las credenciales del proveedor
 * las carga el equipo de la plataforma y viven cifradas en Vault. Este
 * servicio ya NO lee ni escribe credenciales (antes las guardaba en texto
 * plano desde el navegador); solo consulta el estado por la API, que resuelve
 * la organización desde la sesión.
 */

export type EstadoServicioFE = 'active' | 'pending_activation' | 'suspended';

export interface EstadoFacturacionElectronica {
  status: EstadoServicioFE;
  hasCredentials: boolean;
  environment: 'sandbox' | 'production' | null;
  activatedAt: string | null;
  companyNit: string | null;
  lastCheck: { at: string; ok: boolean | null; message: string | null } | null;
}

class ElectronicInvoicingConfigService {
  async getStatus(): Promise<EstadoFacturacionElectronica | null> {
    try {
      const res = await fetch('/api/factus/config', { cache: 'no-store' });
      if (!res.ok) return null;
      const json = (await res.json()) as { service?: EstadoFacturacionElectronica };
      return json.service ?? null;
    } catch {
      return null;
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch('/api/factus/auth', { method: 'POST' });
      if (response.ok) return { success: true, message: 'Conexión exitosa con Factus' };
      const data = await response.json().catch(() => ({}));
      return { success: false, message: data.error || 'Error de conexión' };
    } catch (error: unknown) {
      return { success: false, message: error instanceof Error ? error.message : 'Error de conexión' };
    }
  }
}

export const electronicInvoicingConfigService = new ElectronicInvoicingConfigService();
