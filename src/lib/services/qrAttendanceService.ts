import { createSupabaseClient } from '@/lib/supabase/config';

const createClient = () => createSupabaseClient();

interface NombreSede {
  name: string | null;
}

function nombreSede(sede: NombreSede | NombreSede[] | null): string | null {
  const s = Array.isArray(sede) ? sede[0] : sede;
  return s?.name || null;
}

/**
 * Pantalla del QR de la sede (`/qr-display`). La marcación ya no pasa por aquí:
 * va por `POST /api/hrm/marcacion` y el token se valida en la base.
 */
export class QRAttendanceService {
  /**
   * Obtiene el dispositivo por ID (para la pantalla de QR)
   */
  static async getDeviceById(deviceId: string): Promise<{
    id: string;
    name: string;
    organization_id: number;
    branch_name: string | null;
    current_qr_token: string | null;
    qr_token_expires_at: string | null;
    is_active: boolean;
  } | null> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('time_clocks')
      .select(`
        id,
        name,
        organization_id,
        current_qr_token,
        qr_token_expires_at,
        is_active,
        branches(name)
      `)
      .eq('id', deviceId)
      .single();

    if (error || !data) return null;

    return {
      ...data,
      branch_name: nombreSede(data.branches as unknown as NombreSede | NombreSede[] | null),
    };
  }

  /**
   * Regenera el token QR de un dispositivo
   */
  static async regenerateToken(deviceId: string): Promise<{
    token: string;
    expires_at: string;
  } | null> {
    const supabase = createClient();

    const token = `QR-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    const { data, error } = await supabase
      .from('time_clocks')
      .update({
        current_qr_token: token,
        qr_token_expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', deviceId)
      .select('current_qr_token, qr_token_expires_at')
      .single();

    if (error || !data) return null;

    return {
      token: data.current_qr_token!,
      expires_at: data.qr_token_expires_at!,
    };
  }
}

export default QRAttendanceService;
