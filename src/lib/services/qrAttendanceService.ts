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

interface NombrePerfil {
  first_name: string | null;
  last_name: string | null;
}

interface NombreSede {
  name: string | null;
}

function nombreSede(sede: NombreSede | NombreSede[] | null): string | null {
  const s = Array.isArray(sede) ? sede[0] : sede;
  return s?.name || null;
}

/** Códigos de `fn_hr_marcar` → mensaje para el empleado. */
const MENSAJES_ERROR: Record<string, string> = {
  qr_invalido: 'Código QR no válido. Escanea el código que muestra la pantalla ahora.',
  qr_vencido: 'Código QR expirado. Escanea el código que muestra la pantalla ahora.',
  qr_no_es_de_marcacion: 'Este QR no es para marcación de asistencia',
  qr_de_otra_organizacion: 'Este QR no corresponde a tu organización',
  sin_vinculo_activo: 'No tienes un vínculo laboral activo en esta organización.',
  mecanismo_no_permitido: 'Tu empresa no habilitó la marcación con QR para ti.',
  ubicacion_requiere_consentimiento: 'Este punto pide tu ubicación y aún no la has autorizado.',
  ubicacion_requerida: 'Este punto pide tu ubicación al marcar. Activa el GPS e intenta de nuevo.',
  fuera_de_rango: 'Estás fuera del rango permitido del punto de marcación.',
  marcacion_duplicada: 'Ya registraste esta marcación hace menos de un minuto.',
  sin_permiso: 'No tienes acceso a esta organización.',
  FOREIGN_ORGANIZATION: 'Este QR no corresponde a tu organización',
};

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

    const perfilCrudo = firstMember.profiles as unknown as NombrePerfil | NombrePerfil[] | null;
    const perfil = Array.isArray(perfilCrudo) ? perfilCrudo[0] : perfilCrudo;

    return {
      employment_id: employment.id,
      employee_name: perfil
        ? `${perfil.first_name ?? ''} ${perfil.last_name ?? ''}`.trim() || 'Sin nombre'
        : 'Sin nombre',
      employee_code: employment.employee_code,
      branch_id: employment.branch_id,
      branch_name: branchName,
      organization_id: firstMember.organization_id,
    };
  }

  /**
   * Registra la marcación con el QR escaneado.
   *
   * El QR se valida en el SERVIDOR (`POST /api/hrm/marcacion` → `fn_hr_marcar`,
   * ADR-002 §2): el token ya no se lee ni se compara en el navegador, la hora la
   * pone el servidor y la ubicación solo se guarda si el empleado la autorizó.
   */
  static async validateAndRecord(
    qrData: string,
    geo?: { lat: number; lng: number }
  ): Promise<QRValidationResult> {
    let payload: QRPayload;
    try {
      payload = JSON.parse(qrData);
    } catch {
      return { success: false, message: 'Código QR inválido' };
    }
    if (payload?.type !== 'attendance') {
      return { success: false, message: 'Este QR no es para marcación de asistencia' };
    }

    let respuesta: Response;
    try {
      respuesta = await fetch('/api/hrm/marcacion', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          // La organización del QR: el servidor comprueba que el usuario sea miembro activo.
          ...(Number.isInteger(payload.org) ? { 'X-Organization-Id': String(payload.org) } : {}),
        },
        body: JSON.stringify({ qr: qrData, ubicacion: geo ?? null }),
      });
    } catch {
      return { success: false, message: 'No hay conexión. Intenta de nuevo.' };
    }
    const datos = (await respuesta.json().catch(() => ({}))) as {
      evento_id?: string;
      tipo?: 'check_in' | 'check_out' | 'break_start' | 'break_end';
      hora?: string;
      code?: string;
    };
    if (!respuesta.ok) {
      return { success: false, message: MENSAJES_ERROR[datos.code ?? ''] ?? 'Error al registrar la marcación' };
    }
    const eventType = datos.tipo === 'check_out' || datos.tipo === 'break_start' ? 'check_out' : 'check_in';
    const info = await this.getEmployeeInfo().catch(() => null);
    return {
      success: true,
      message: datos.tipo === 'check_out'
        ? '¡Salida registrada correctamente!'
        : datos.tipo === 'break_start'
          ? '¡Inicio de descanso registrado!'
          : datos.tipo === 'break_end'
            ? '¡Fin de descanso registrado!'
            : '¡Entrada registrada correctamente!',
      event_type: eventType,
      event_id: datos.evento_id,
      employee_name: info?.employee_name,
      event_at: datos.hora,
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
