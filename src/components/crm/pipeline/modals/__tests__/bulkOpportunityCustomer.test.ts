/// <reference types="jest" />
/**
 * Alta masiva de oportunidades: el cliente de cada fila.
 *
 * Regresión: el diálogo insertaba `customers.full_name`, columna GENERATED
 * ALWAYS, así que ninguna fila con cliente se podía crear. Ahora el alta va
 * por `resolveLeadCustomer` (first_name/last_name) y el teléfono de la grilla
 * se valida y normaliza.
 */

const resolveLeadCustomer = jest.fn();
jest.mock('@/lib/services/crm/leadCustomer', () => {
  const real = jest.requireActual('@/lib/services/crm/leadCustomer');
  return { ...real, resolveLeadCustomer: (...a: unknown[]) => resolveLeadCustomer(...a) };
});

import { prepararClienteDeFila, resolverClienteDeFila } from '../bulkOpportunityCustomer';

const fila = (customerName: string, customerEmail = '', customerPhone = '') => ({ customerName, customerEmail, customerPhone });

/** Cliente de Supabase mínimo: la búsqueda por nombre devuelve `encontrados`. */
function clienteFalso(encontrados: Array<{ id: string }> = []) {
  const ilike = jest.fn();
  const cadena = {
    select: () => cadena,
    eq: () => cadena,
    ilike: (...a: unknown[]) => { ilike(...a); return cadena; },
    limit: async () => ({ data: encontrados, error: null }),
  };
  return { supabase: { from: () => cadena } as never, ilike };
}

describe('prepararClienteDeFila', () => {
  it('sin nombre de cliente no hay cliente', () => {
    expect(prepararClienteDeFila(fila('   ', 'a@b.co'))).toEqual({ tipo: 'ninguno' });
  });

  it('normaliza el teléfono al formato de guardado', () => {
    const r = prepararClienteDeFila(fila('Ana Gómez', '', '3001234567'));
    expect(r).toMatchObject({ tipo: 'nuevo', nombre: 'Ana Gómez', telefono: '+57 3001234567' });
  });

  it('rechaza un teléfono incompleto con el mensaje del PhoneInput', () => {
    const r = prepararClienteDeFila(fila('Ana Gómez', '', '300 12'));
    expect(r.tipo).toBe('error');
    expect(r.tipo === 'error' && r.mensaje).toMatch(/incompleto/);
  });

  it('teléfono vacío es válido (es opcional)', () => {
    expect(prepararClienteDeFila(fila('Ana Gómez', 'ana@ejemplo.co'))).toMatchObject({ tipo: 'nuevo', telefono: null });
  });
});

describe('resolverClienteDeFila', () => {
  beforeEach(() => resolveLeadCustomer.mockReset());

  it('reutiliza el cliente con el mismo nombre sin crear otro', async () => {
    const { supabase } = clienteFalso([{ id: 'c-1' }]);
    await expect(resolverClienteDeFila(supabase, 120, fila('Ana Gómez', 'ana@ejemplo.co'))).resolves.toBe('c-1');
    expect(resolveLeadCustomer).not.toHaveBeenCalled();
  });

  it('escapa % y _ en la búsqueda por nombre', async () => {
    const { supabase, ilike } = clienteFalso([{ id: 'c-1' }]);
    await resolverClienteDeFila(supabase, 120, fila('100% Café_Sur', 'x@ejemplo.co'));
    expect(ilike).toHaveBeenCalledWith('full_name', '100\\% Café\\_Sur');
  });

  it('crea el cliente por el servicio de leads, sin full_name', async () => {
    const { supabase } = clienteFalso();
    resolveLeadCustomer.mockResolvedValue({ ok: true, customerId: 'nuevo-1', createdCustomerId: 'nuevo-1' });
    await expect(resolverClienteDeFila(supabase, 120, fila('Ana Gómez', 'ana@ejemplo.co', '3001234567'))).resolves.toBe('nuevo-1');
    expect(resolveLeadCustomer).toHaveBeenCalledWith(
      { supabase, organizationId: 120 },
      { new_customer: { full_name: 'Ana Gómez', email: 'ana@ejemplo.co', phone: '+57 3001234567' } },
      null,
    );
  });

  it('con el correo ya usado, usa la ficha existente', async () => {
    const { supabase } = clienteFalso();
    resolveLeadCustomer.mockResolvedValue({
      ok: false,
      result: { status: 409, error: 'Ya existe', extra: { existing_customer: { id: 'c-9' } } },
    });
    await expect(resolverClienteDeFila(supabase, 120, fila('Ana Gómez', 'ana@ejemplo.co'))).resolves.toBe('c-9');
  });

  it('propaga el motivo legible si no se puede crear', async () => {
    const { supabase } = clienteFalso();
    resolveLeadCustomer.mockResolvedValue({
      ok: false,
      result: { status: 400, error: 'El cliente nuevo necesita al menos correo o teléfono' },
    });
    await expect(resolverClienteDeFila(supabase, 120, fila('Ana Gómez'))).rejects.toThrow(/correo o teléfono/);
  });

  it('un teléfono inválido falla antes de tocar la BD', async () => {
    const { supabase, ilike } = clienteFalso();
    await expect(resolverClienteDeFila(supabase, 120, fila('Ana Gómez', '', '12'))).rejects.toThrow();
    expect(ilike).not.toHaveBeenCalled();
  });
});
