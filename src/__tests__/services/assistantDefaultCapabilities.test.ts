import { getAssistantCapabilities } from '@/lib/ai/assistant/capabilities';
import type { ServerOrgContext } from '@/lib/utils/orgContext';

function context(settings: unknown = null, failed: string | null = null): ServerOrgContext {
  const client = {
    from: (table: string) => {
      const result = { data: table === 'ai_assistant_settings' ? settings : [{ module_code: 'inventory' }], error: failed === table ? { message: 'unavailable' } : null };
      const query = { select: () => query, eq: () => query, maybeSingle: async () => result, then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve) };
      return query;
    },
    rpc: async () => ({ data: ['crm.customers.create'], error: failed === 'permissions' ? { message: 'unavailable' } : null }),
  };
  return { organizationId: 123, userId: 'user', roleId: 2, isSuperAdmin: false, supabase: client } as unknown as ServerOrgContext;
}

it('organizaciones sin configuración tienen todas las capacidades con permisos de sesión', async () => {
  const actual = await getAssistantCapabilities(context());
  expect(actual.level).toBe('write_full');
  expect(actual.permissions.has('crm.customers.create')).toBe(true);
});

it.each(['ai_assistant_settings', 'organization_modules', 'permissions'])('fallo de lectura %s no habilita escrituras, tampoco a un admin', async (failed) => {
  expect((await getAssistantCapabilities(context(null, failed))).level).toBe('off');
});

it('una restricción posterior explícita del administrador se respeta', async () => {
  expect((await getAssistantCapabilities(context({ capability_level: 'read' }))).level).toBe('read');
});
