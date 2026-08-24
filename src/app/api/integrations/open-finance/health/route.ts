// ============================================================
// /api/integrations/open-finance/health
// Health check de Open Finance.
// GET - retorna el estado general de Open Finance.
// Requiere sesion autenticada (createRouteHandlerClient).
// ============================================================

import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { cronJobs } from '@/lib/services/integrations/openFinance/cronJobs';

/** Estado de variables de entorno relevantes (sin exponer valores) */
interface EnvVarStatus {
  name: string;
  isSet: boolean;
}

/** Verifica las variables de entorno de Open Finance sin exponer valores */
function getEnvVarStatuses(): EnvVarStatus[] {
  return [
    { name: 'PROMETEO_API_KEY', isSet: Boolean(process.env.PROMETEO_API_KEY) },
    { name: 'PROMETEO_SANDBOX_URL', isSet: Boolean(process.env.PROMETEO_SANDBOX_URL) },
    { name: 'BELVO_SECRET_ID', isSet: Boolean(process.env.BELVO_SECRET_ID) },
    { name: 'OPEN_FINANCE_CRON_SECRET', isSet: Boolean(process.env.OPEN_FINANCE_CRON_SECRET) },
  ];
}

// GET - estado de salud de Open Finance
export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Verificar sesion
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const status = await cronJobs.getHealthStatus();
    // Anadir estado de variables de entorno (sin valores) para el dashboard
    return NextResponse.json({
      success: true,
      data: status,
      envVars: getEnvVarStatuses(),
    });
  } catch (error) {
    console.error('[Open Finance Health] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
