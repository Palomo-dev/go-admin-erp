import { createSupabaseClient } from '@/lib/supabase/config';

const createClient = () => createSupabaseClient();

export interface QRValidationResult {
  success: boolean;
  message: string;
  event_type?: 'check_in' | 'check_out';
  event_id?: string;
  employee_name?: string;
  event_at?: string;
}

export interface QRPayload {
  type: string;
  device_id: string;
  token: string;
  org: number;
}

export interface EmployeeInfo {
  employment_id: string;
  employee_name: string;
  employee_code: string | null;
  branch_id: number | null;
  branch_name: string | null;
  organization_id: number;
}

export class QRAttendanceService {
  /**
   * Obtiene la información del empleado a partir del user_id autenticado
   */
  static async getEmployeeInfo(): Promise<EmployeeInfo | null> {
    const supabase = createClient();
    
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return null;

    const { data, error } = await supabase
      .from('organization_members')
      .select(`
        id,
        organization_id,
        profiles!inner(first_name, last_name),
        employments!inner(
          id,
          employee_code,
          branch_id,
          status,
          branches(name)
        )
      `)
      .eq('user_id', userData.user.id)
      .eq('employments.status', 'active')
      .limit(1);

    if (error || !data || data.length === 0) return null;

    const firstMember = data[0];

    const employment = Array.isArray(firstMember.employments) 
      ? firstMember.employments[0] 
      : firstMember.employments;

    if (!employment) return null;

    const branches = employment.branches as { name: string } | { name: string }[] | null;
    const branchName = branches 
      ? (Array.isArray(branches) ? branches[0]?.name : branches.name) 
      : null;

    return {
      employment_id: employment.id,
      employee_name: firstMember.profiles 
        ? `${(firstMember.profiles as any).first_name} ${(firstMember.profiles as any).last_name}`
        : 'Sin nombre',
      employee_code: employment.employee_code,
      branch_id: employment.branch_id,
      branch_name: branchName,
      organization_id: firstMember.organization_id,
    };
  }

  /**
   * Valida el QR escaneado y registra la marcación
   */
  static async validateAndRecord(
    qrData: string,
    geo?: { lat: number; lng: number }
  ): Promise<QRValidationResult> {
    try {
      const res = await fetch('/api/attendance/validate-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrData, geo }),
      });
      const data = await res.json();
      return data as QRValidationResult;
    } catch (error) {
      console.error('Error al validar QR:', error);
      return { success: false, message: 'Error de conexión. Intenta de nuevo.' };
    }
  }

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
      branch_name: (data.branches as any)?.name || null,
    };
  }

  /**
   * Regenera el token QR de un dispositivo
   */
  static async regenerateToken(deviceId: string): Promise<{
    token: string;
    expires_at: string;
  } | null> {
    try {
      const res = await fetch('/api/attendance/regenerate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      });
      if (!res.ok) {
        console.error('Error regenerando token:', res.status, await res.text());
        return null;
      }
      const data = await res.json();
      return { token: data.token, expires_at: data.expires_at };
    } catch (error) {
      console.error('Error de red regenerando token:', error);
      return null;
    }
  }

  /**
   * Calcula la distancia entre dos puntos geográficos (en metros)
   */
  private static calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3; // Radio de la Tierra en metros
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}

export default QRAttendanceService;
