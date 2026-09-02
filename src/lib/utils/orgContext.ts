import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ServerOrgContext {
  userId: string;
  organizationId: number;
  organizationName: string;
  roleId: number;
  roleName: string;
  isSuperAdmin: boolean;
  supabase: SupabaseClient;
}

export class OrgContextError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'OrgContextError';
  }
}

export async function getServerOrgContext(): Promise<ServerOrgContext> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user }, error: sessionError } = await supabase.auth.getUser();
  if (sessionError || !user) {
    throw new OrgContextError('No hay sesión activa', 401);
  }

  // Obtener la membresía activa del usuario.
  // Usamos .limit(1).maybeSingle() en lugar de .single() porque un usuario
  // puede pertenecer a múltiples organizaciones activas simultáneamente.
  // .single() lanza error PGRST116 cuando hay más de un resultado;
  // .limit(1).maybeSingle() toma la primera membresía activa sin error.
  // Si en el futuro se requiere multi-org, el JWT puede incluir organization_id
  // para filtrar explícitamente por la org seleccionada.
  const { data: membership, error: memberError } = await supabase
    .from('organization_members')
    .select(`
      organization_id,
      is_super_admin,
      role_id,
      organizations(name),
      roles!inner(name)
    `)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memberError || !membership) {
    throw new OrgContextError('El usuario no pertenece a ninguna organización', 403);
  }

  const roleName = (membership.roles as { name: string }).name;

  return {
    userId: user.id,
    organizationId: membership.organization_id,
    organizationName: (membership.organizations as { name: string }).name,
    roleId: membership.role_id,
    roleName,
    isSuperAdmin: membership.is_super_admin ?? false,
    supabase,
  };
}

export async function resolveOrgFromExternal(
  identifier: string,
  identifierType: 'phone' | 'call_sid' | 'domain' | 'message_id'
): Promise<{ organizationId: number; serviceClient: SupabaseClient }> {
  const serviceClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const tableMap = {
    phone: { table: 'phone_numbers', column: 'e164' },
    call_sid: { table: 'calls', column: 'provider_call_sid' },
    domain: { table: 'email_domains', column: 'domain' },
    message_id: { table: 'email_messages', column: 'provider_message_id' },
  } as const;

  const { table, column } = tableMap[identifierType];

  const { data, error } = await serviceClient
    .from(table)
    .select('organization_id')
    .eq(column, identifier)
    .single();

  if (error || !data) {
    throw new OrgContextError(
      `No se pudo resolver la organización desde ${identifierType}: ${identifier}`,
      404
    );
  }

  return { organizationId: data.organization_id, serviceClient };
}
