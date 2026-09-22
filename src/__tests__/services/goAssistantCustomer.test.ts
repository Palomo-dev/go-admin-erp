import type { SupabaseClient } from '@supabase/supabase-js';
import { ACTION_CATALOG, sanitizeActionFields } from '@/lib/ai/assistant/actionCatalog';
import { aiActionsService } from '@/lib/services/aiActionsService';

describe('GO Assistant: crear cliente con contacto y empresa separados', () => {
  const single = jest.fn();
  const select = jest.fn(() => ({ single }));
  const insert = jest.fn<{ select: typeof select }, [Record<string, unknown>]>(() => ({ select }));
  const from = jest.fn(() => ({ insert }));
  const ctx = {
    supabase: { from } as unknown as SupabaseClient,
    organizationId: 120,
    branchId: 3,
    userId: 'usuario-prueba',
  };
  const execute = (args: Record<string, unknown>) =>
    aiActionsService.executeAction('create_customer', args, ctx);

  beforeEach(() => {
    jest.clearAllMocks();
    single.mockResolvedValue({ data: { id: 'cliente-prueba', full_name: 'Ana Pérez' }, error: null });
  });

  it('conserva los campos explícitos al filtrar los argumentos de la propuesta', () => {
    const args = { full_name: 'Ana Pérez', company_name: 'Empresa de prueba', current_software: 'Software de prueba', notes: 'Solicita una llamada' };
    expect(sanitizeActionFields('create_customer', Object.entries(args).map(([name, value]) => ({ name, value })))).toEqual(args);
    expect(ACTION_CATALOG.create_customer.description).toContain('No mezcles');
  });

  it('guarda empresa, software y notas sin mezclarlos con el nombre del contacto', async () => {
    const result = await execute({ full_name: ' Ana   Pérez ', company_name: ' Empresa de prueba ', current_software: ' Software de prueba ', notes: ' Solicita una llamada ' });
    expect(result.success).toBe(true);
    expect(from).toHaveBeenCalledWith('customers');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ first_name: 'Ana', last_name: 'Pérez', company_name: 'Empresa de prueba', current_software: 'Software de prueba', notes: 'Solicita una llamada' }));
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('no inventa empresa, software ni notas cuando no se proporcionan', async () => {
    await execute({ full_name: 'Ana' });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ first_name: 'Ana', last_name: '', company_name: null, current_software: null, notes: null }));
  });

  it('toma organización y sucursal exclusivamente del contexto y no escribe campos generados', async () => {
    await execute({ full_name: 'Ana Pérez', organization_id: 999, branch_id: 999, doc_type: 'CC', doc_number: '123456', userRole: 'admin' });
    const payload = insert.mock.calls[0][0];
    // El tipo de documento se guarda con el código del formulario de clientes ('cc', minúsculas), no como lo dictó el modelo.
    expect(payload).toEqual(expect.objectContaining({ organization_id: 120, branch_id: 3, identification_type: 'cc', identification_number: '123456' }));
    for (const key of ['full_name', 'doc_type', 'doc_number', 'userRole']) expect(payload).not.toHaveProperty(key);
  });

  it('solo una empresa (sin persona) se crea como empresa; sin ningún nombre, se rechaza antes de escribir', async () => {
    await execute({ company_name: 'Empresa de prueba' });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ customer_type: 'company', first_name: 'Empresa de prueba', last_name: '', company_name: 'Empresa de prueba' }));
    jest.clearAllMocks();
    expect(await execute({})).toMatchObject({ success: false, errorCode: 'missing_fields' });
    expect(insert).not.toHaveBeenCalled();
  });

  it.each(['   ', {}, true])('rechaza un nombre inválido (%p) antes de escribir', async (full_name) => {
    expect(await execute({ full_name })).toMatchObject({ success: false, errorCode: 'missing_fields' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('descarta objetos y booleanos en los campos opcionales', async () => {
    await execute({ full_name: 'Ana', company_name: { name: 'otro' }, current_software: true, notes: [] });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ company_name: null, current_software: null, notes: null }));
  });

  it('propaga el rechazo de duplicados sin reportar creación exitosa', async () => {
    single.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate email' } });
    expect(await execute({ full_name: 'Ana' })).toMatchObject({ success: false, errorCode: 'duplicate' });
  });
});
