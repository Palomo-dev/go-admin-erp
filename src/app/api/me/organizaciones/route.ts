/**
 * GET /api/me/organizaciones — las organizaciones de la persona, para el
 * selector del header (Figma `02 Componentes` › OrgPickerPanel / OrgRow).
 *
 * Cada fila lleva lo que el panel pinta: nombre, logo, rol, plan y estado
 * (activa / en prueba / suspendida). Antes el selector solo mostraba nombre y
 * rol, y el plan de otra organización no se podía leer desde el navegador: la
 * RLS de `subscriptions` solo deja ver las de la organización activa.
 *
 * Las membresías se leen con la sesión del usuario (RLS). Las suscripciones, con
 * el cliente de servicio, pero SOLO de las organizaciones de esas membresías:
 * nunca de un id que venga del cliente. El rol se devuelve como texto para
 * mostrarlo; no decide ningún permiso (regla 6).
 */
import { NextResponse } from 'next/server';
import { getServerUserClient } from '@/lib/supabase/server-user';
import { getServiceClient } from '@/lib/supabase/server-service';

export const dynamic = 'force-dynamic';

type EstadoOrg = 'activa' | 'prueba' | 'suspendida';

interface MembresiaFila {
  organization_id: number;
  organizations: { id: number; name: string; logo_url: string | null; status: string | null; subdomain: string | null } | null;
  roles: { name: string | null } | null;
}

interface SuscripcionFila {
  organization_id: number;
  status: string | null;
  created_at: string;
  plans: { name: string | null; code: string | null } | null;
}

export async function GET() {
  const supabase = await getServerUserClient();
  const {
    data: { user },
    error: errorSesion,
  } = await supabase.auth.getUser();
  if (errorSesion || !user) {
    return NextResponse.json({ error: 'No hay sesión activa' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id, organizations:organizations (id, name, logo_url, status, subdomain), roles:roles (name)')
    .eq('user_id', user.id)
    .eq('is_active', true);

  if (error) {
    console.error('[api/me/organizaciones] membresías', error.message);
    return NextResponse.json({ error: 'No se pudieron leer las organizaciones' }, { status: 500 });
  }

  const membresias = ((data ?? []) as unknown as MembresiaFila[]).filter((m) => m.organizations);
  const ids = membresias.map((m) => m.organization_id);

  const suscripciones = new Map<number, SuscripcionFila>();
  if (ids.length > 0) {
    const { data: subs, error: errorSubs } = await getServiceClient()
      .from('subscriptions')
      .select('organization_id, status, created_at, plans(name, code)')
      .in('organization_id', ids)
      .order('created_at', { ascending: false });
    if (errorSubs) console.warn('[api/me/organizaciones] suscripciones', errorSubs.message);
    // La más reciente de cada organización (vienen ordenadas de más nueva a más vieja).
    for (const s of (subs ?? []) as unknown as SuscripcionFila[]) {
      if (!suscripciones.has(s.organization_id)) suscripciones.set(s.organization_id, s);
    }
  }

  const organizaciones = membresias
    .map((m) => {
      const org = m.organizations!;
      const sub = suscripciones.get(org.id);
      const plan = Array.isArray(sub?.plans) ? sub?.plans[0] : sub?.plans;
      const estado: EstadoOrg =
        org.status === 'suspended' || sub?.status === 'past_due' || sub?.status === 'unpaid' || sub?.status === 'canceled'
          ? 'suspendida'
          : sub?.status === 'trialing'
            ? 'prueba'
            : 'activa';
      return {
        id: org.id,
        nombre: org.name,
        logoUrl: org.logo_url,
        subdominio: org.subdomain,
        rol: m.roles?.name ?? null,
        plan: plan?.name ?? null,
        estado,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return NextResponse.json({ organizaciones }, { headers: { 'Cache-Control': 'private, no-store' } });
}
