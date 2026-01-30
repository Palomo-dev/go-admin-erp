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
      .single();

    if (error || !data) return null;

    const employment = Array.isArray(data.employments) 
      ? data.employments[0] 
      : data.employments;

    if (!employment) return null;

    const branches = employment.branches as { name: string } | { name: string }[] | null;
    const branchName = branches 
      ? (Array.isArray(branches) ? branches[0]?.name : branches.name) 
      : null;

    return {
      employment_id: employment.id,
      employee_name: data.profiles 
        ? `${(data.profiles as any).first_name} ${(data.profiles as any).last_name}`
        : 'Sin nombre',
      employee_code: employment.employee_code,
      branch_id: employment.branch_id,
      branch_name: branchName,
      organization_id: data.organization_id,
    };
  }

  /**
   * Valida el QR escaneado y registra la marcación
   */
  static async validateAndRecord(
    qrData: string,
    geo?: { lat: number; lng: number }
  ): Promise<QRValidationResult> {
    const supabase = createClient();

    // 1. Parsear el QR
    let payload: QRPayload;
    try {
      payload = JSON.parse(qrData);
    } catch {
      return { success: false, message: 'Código QR inválido' };
    }

    if (payload.type !== 'attendance') {
      return { success: false, message: 'Este QR no es para marcación de asistencia' };
    }

    // 2. Obtener información del empleado autenticado
    const employeeInfo = await this.getEmployeeInfo();
    if (!employeeInfo) {
      return { success: false, message: 'No se encontró información del empleado. Verifica que estés autenticado.' };
    }

    // Verificar que el empleado pertenezca a la misma organización del QR
    if (employeeInfo.organization_id !== payload.org) {
      return { success: false, message: 'Este QR no corresponde a tu organización' };
    }

    // 3. Validar el dispositivo y token
    const { data: device, error: deviceError } = await supabase
      .from('time_clocks')
      .select('*')
      .eq('id', payload.device_id)
      .eq('organization_id', payload.org)
      .eq('is_active', true)
      .single();

    if (deviceError || !device) {
      return { success: false, message: 'Dispositivo de marcación no encontrado o inactivo' };
    }

    // 4. Validar token
    if (device.current_qr_token !== payload.token) {
      return { success: false, message: 'Código QR no válido. Solicita un nuevo código.' };
    }

    // 5. Verificar expiración
    if (device.qr_token_expires_at) {
      const expiresAt = new Date(device.qr_token_expires_at);
      if (expiresAt < new Date()) {
        return { success: false, message: 'Código QR expirado. Solicita un nuevo código.' };
      }
    }

    // 6. Determinar tipo de evento (check_in o check_out)
    const today = new Date().toISOString().split('T')[0];
    const { data: todayEvents } = await supabase
      .from('attendance_events')
      .select('id, event_type, event_at')
      .eq('employment_id', employeeInfo.employment_id)
      .gte('event_at', `${today}T00:00:00`)
      .lte('event_at', `${today}T23:59:59`)
      .order('event_at', { ascending: false });

    const lastEvent = todayEvents?.[0];
    let eventType: 'check_in' | 'check_out';

    if (!lastEvent || lastEvent.event_type === 'check_out') {
      eventType = 'check_in';
    } else {
      eventType = 'check_out';
    }

    // 7. Validar geo si es requerido
    let geoValidated: boolean | null = null;
    if (device.require_geo_validation && device.geo_fence) {
      if (!geo) {
        return { success: false, message: 'Se requiere ubicación GPS para marcar en este dispositivo' };
      }
      
      const distance = this.calculateDistance(
        geo.lat,
        geo.lng,
        device.geo_fence.lat,
        device.geo_fence.lng
      );
      
      geoValidated = distance <= device.geo_fence.radius;
      
      if (!geoValidated) {
        return { 
          success: false, 
          message: `Estás fuera del rango permitido (${Math.round(distance)}m de ${device.geo_fence.radius}m)` 
        };
      }
    }

    // 8. Registrar el evento
    const eventAt = new Date().toISOString();
    const { data: newEvent, error: insertError } = await supabase
      .from('attendance_events')
      .insert({
        organization_id: payload.org,
        branch_id: device.branch_id || employeeInfo.branch_id,
        employment_id: employeeInfo.employment_id,
        event_type: eventType,
        event_at: eventAt,
        source: 'qr',
        time_clock_id: device.id,
        geo: geo || null,
        geo_validated: geoValidated,
        is_manual_entry: false,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error al registrar marcación:', insertError);
      return { success: false, message: 'Error al registrar la marcación' };
    }

    return {
      success: true,
      message: eventType === 'check_in' 
        ? '¡Entrada registrada correctamente!' 
        : '¡Salida registrada correctamente!',
      event_type: eventType,
      event_id: newEvent.id,
      employee_name: employeeInfo.employee_name,
      event_at: eventAt,
    };
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
