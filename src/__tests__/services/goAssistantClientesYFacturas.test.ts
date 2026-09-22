/**
 * GO Assistant — clientes con el formulario del módulo y facturas de compra
 * desde la foto.
 *
 * 1. `customerPayload.ts` es la ÚNICA traducción "lo que dice el usuario" →
 *    fila de `customers`. La usan `ClientForm` y el asistente: si divergen,
 *    estos tests lo cantan.
 * 2. `registrar_factura_compra` cierra F4: la RPC se probó contra la base real
 *    (proveedor nuevo por NIT, IVA, CxP, stock, duplicado, anulación con
 *    asientos espejo que netean a cero). Aquí, lo que vive en Node.
 */

import fs from 'fs';
import path from 'path';
import {
  buildCustomerInsert,
  customerValuesFromAction,
  inferCustomerType,
  nitCheckDigit,
  normalizeDocumentType,
  splitFullName,
} from '@/lib/services/customers/customerPayload';
import { ACTION_CATALOG, sanitizeActionFields } from '@/lib/ai/assistant/actionCatalog';
import { registrarFacturaCompra, mapFacturaError } from '@/lib/ai/agent/tools/facturas';
import { getRegistry, resetRegistry } from '@/lib/ai/agent/toolRegistry';
import { applyUndo } from '@/lib/ai/assistant/undoService';
import type { ToolContext } from '@/lib/ai/agent/types';

const SRC = path.join(process.cwd(), 'src');
const leer = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8');

beforeEach(() => resetRegistry());

describe('clientes — una sola traducción para el formulario y el asistente', () => {
  it('ClientForm y el ejecutor del asistente usan buildCustomerInsert; ninguno arma la fila a mano', () => {
    const form = leer('components/clientes/new/ClientForm.tsx');
    const exec = leer('lib/services/aiActionsService.ts');
    expect(form).toContain('buildCustomerInsert(');
    expect(exec).toContain('buildCustomerInsert(');
    expect(exec).toContain('customerValuesFromAction(');
    // El insert de creación ya no arma la fila a mano: el mapeo manual solo
    // sobrevive en el modo edición (una aparición), no en creación.
    expect(form.match(/first_name: customerType === 'company'/g)?.length ?? 0).toBe(1);
  });

  it('reparte el nombre como en Colombia: dos nombres y dos apellidos', () => {
    expect(splitFullName('Juan Camilo Gallego Palomo')).toEqual({ firstName: 'Juan Camilo', lastName: 'Gallego Palomo' });
    expect(splitFullName('David Zapata')).toEqual({ firstName: 'David', lastName: 'Zapata' });
    expect(splitFullName('Nicolás')).toEqual({ firstName: 'Nicolás', lastName: '' });
  });

  it('normaliza el tipo de documento a los códigos del formulario', () => {
    expect(normalizeDocumentType('CC', 'person')).toBe('cc');
    expect(normalizeDocumentType('Cédula', 'person')).toBe('cc');
    expect(normalizeDocumentType('NIT', 'company')).toBe('nit');
    expect(normalizeDocumentType('PASSPORT', 'person')).toBe('passport');
    // Una empresa con "cédula" es un error de dictado.
    expect(normalizeDocumentType('cc', 'company')).toBe('nit');
    expect(normalizeDocumentType('', 'person')).toBe('');
  });

  it('el DV del NIT se calcula como la DIAN', () => {
    expect(nitCheckDigit('900123456')).toBe(8);
    expect(nitCheckDigit('800197268')).toBe(4);
    expect(nitCheckDigit('')).toBeNull();
  });

  it('identifica empresa por lo que dice el usuario, por el NIT o por la razón social', () => {
    expect(inferCustomerType({ customerType: 'company' })).toBe('company');
    expect(inferCustomerType({ documentType: 'NIT', fullName: 'x' })).toBe('company');
    expect(inferCustomerType({ companyName: 'Acme', fullName: null })).toBe('company');
    expect(inferCustomerType({ fullName: 'Comercializadora Andina S.A.S.' })).toBe('company');
    expect(inferCustomerType({ fullName: 'David Zapata', companyName: 'Acme' })).toBe('person');
  });

  it('"Distribuidora El Roble es la empresa" → empresa, con la razón social en company_name', () => {
    const v = customerValuesFromAction({ customer_type: 'company', full_name: 'Distribuidora El Roble', phone: '3000000000', current_software: 'otro software' });
    expect(v.customerType).toBe('company');
    expect(v.companyName).toBe('Distribuidora El Roble');
    const row = buildCustomerInsert(v, { organizationId: 125, branchId: 7 });
    // Como siempre hizo el formulario: razón social en first_name para que `full_name` la muestre.
    expect(row).toMatchObject({
      organization_id: 125,
      branch_id: 7,
      customer_type: 'company',
      first_name: 'Distribuidora El Roble',
      last_name: '',
      company_name: 'Distribuidora El Roble',
      phone: '3000000000',
      current_software: 'otro software',
      roles: ['cliente', 'huesped'],
      fiscal_responsibilities: ['R-99-PN'],
      parent_customer_id: null,
    });
  });

  it('una persona con NIT dictado sin DV recibe el DV calculado', () => {
    const v = customerValuesFromAction({ full_name: 'Empresa Dos Ltda', doc_type: 'NIT', doc_number: '900.123.456' });
    expect(v.customerType).toBe('company');
    expect(v.documentType).toBe('nit');
    expect(v.documentNumber).toBe('900123456');
    expect(v.dv).toBe('8');
  });

  it('el catálogo declara customer_type y los códigos de documento del formulario; el saneado acepta "NIT"', () => {
    const def = ACTION_CATALOG.create_customer;
    expect(def.fields.find((f) => f.name === 'customer_type')?.options?.map((o) => o.value)).toEqual(['person', 'company']);
    expect(def.fields.find((f) => f.name === 'doc_type')?.options?.map((o) => o.value)).toContain('nit');
    const clean = sanitizeActionFields('create_customer', [
      { name: 'doc_type', value: 'NIT' },
      { name: 'customer_type', value: 'Company' },
    ]);
    expect(clean).toEqual({ doc_type: 'nit', customer_type: 'company' });
  });

  it('la tarjeta ofrece el formulario del módulo solo para crear cliente, y execute-action acepta el cierre externo', () => {
    const card = leer('components/app-layout/Header/ActionConfirmationForm.tsx');
    expect(card).toContain("['create_customer']");
    const dialog = leer('components/app-layout/Header/assistant/CustomerFormDialog.tsx');
    expect(dialog).toContain("from '@/components/clientes/new/ClientForm'");
    const route = leer('app/api/ai-assistant/execute-action/route.ts');
    expect(route).toContain("EXTERNAL_ALLOWED: Record<string, string> = { create_customer: 'customer' }");
    // El cierre externo comprueba que el cliente exista en la organización antes de dar por hecha la acción.
    expect(route).toMatch(/from\('customers'\)[\s\S]*?eq\('organization_id', ctx\.organizationId\)/);
  });
});

function ctxWith(client: unknown, branchId: number | null = 7): ToolContext {
  return {
    organizationId: 125,
    branchId,
    userId: '00000000-0000-0000-0000-000000000001',
    supabase: client as ToolContext['supabase'],
    capabilities: { level: 'write_full', enabledTools: null, permissions: new Set(['inventory.create']), isAdmin: false, activeModules: new Set(['inventory']), undoWindowMinutes: 15, bulkMaxRows: 500 },
    locale: 'es-CO',
    currency: 'COP',
    channel: 'text',
    conversationId: null,
  };
}

describe('registrar_factura_compra', () => {
  it('está registrada, es high/write_full y no va por voz', () => {
    expect(getRegistry().has('registrar_factura_compra')).toBe(true);
    expect(registrarFacturaCompra.risk).toBe('high');
    expect(registrarFacturaCompra.minLevel).toBe('write_full');
    expect(registrarFacturaCompra.availableInVoice).toBe(false);
  });

  it('exige número, líneas válidas y un proveedor (id o nombre)', () => {
    const items = [{ description: 'x', qty: 1, unit_price: 100 }];
    expect(registrarFacturaCompra.parseArgs({ number_ext: 'F1', items })).toBeNull();
    expect(registrarFacturaCompra.parseArgs({ number_ext: 'F1', supplier_id: 3, items: [] })).toBeNull();
    expect(registrarFacturaCompra.parseArgs({ number_ext: 'F1', supplier_id: 3, items: [{ description: 'x', qty: 0, unit_price: 1 }] })).toBeNull();
    const ok = registrarFacturaCompra.parseArgs({
      number_ext: ' F-001 ',
      supplier: { name: 'Proveedor', nit: '900.123.456', dv: '8' },
      issue_date: '2026-09-20',
      due_date: 'mañana',
      payment_method: 'credit',
      items: [{ product_id: 5, description: 'Camisa', qty: 2, unit_price: 10000, tax_rate: 19 }],
    });
    expect(ok).toMatchObject({
      number_ext: 'F-001',
      supplier: { name: 'Proveedor', nit: '900.123.456', dv: '8' },
      issue_date: '2026-09-20',
      payment_method: 'credit',
      tax_included: false,
      receive_stock: true,
    });
    expect(ok!.due_date).toBeUndefined();
  });

  it('execute() manda la organización del contexto, la moneda de la organización y enlaza el adjunto', async () => {
    const rpc: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const updates: Array<{ tabla: string; datos: Record<string, unknown> }> = [];
    const client = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        rpc.push({ fn, args });
        return {
          data: {
            invoice_id: 'a1b2c3d4-0000-4000-8000-000000000001', number_ext: 'F-001', supplier_id: 9, proveedor: 'Proveedor',
            proveedor_nuevo: true, total: 23800, lineas: 1, lineas_con_stock: 1, accounts_payable_id: 'ap-1',
            stock_lines: [{ product_id: 5, quantity: 2 }],
          },
          error: null,
        };
      },
      from: (tabla: string) => ({
        update: (datos: Record<string, unknown>) => ({ eq: () => ({ eq: async () => { updates.push({ tabla, datos }); return { error: null }; } }) }),
      }),
    };
    const res = await registrarFacturaCompra.execute(ctxWith(client), {
      attachment_id: '11111111-2222-4333-8444-555555555555',
      number_ext: 'F-001',
      supplier: { name: 'Proveedor', nit: '900123456' },
      tax_included: false,
      receive_stock: true,
      items: [{ product_id: 5, description: 'Camisa', qty: 2, unit_price: 10000, tax_rate: 19 }],
    });
    expect(res.ok).toBe(true);
    expect(rpc[0].fn).toBe('assistant_register_purchase_invoice');
    expect(rpc[0].args.p_organization_id).toBe(125);
    expect((rpc[0].args.p_payload as { currency: string }).currency).toBe('COP');
    expect(updates[0]).toMatchObject({ tabla: 'ai_attachments', datos: { linked_entity_type: 'invoice_purchase' } });
    expect(res.undo).toMatchObject({ kind: 'void_purchase_invoice', payload: { invoice_id: 'a1b2c3d4-0000-4000-8000-000000000001', branch_id: 7 } });
    expect(res.message).toContain('proveedor nuevo');
  });

  it.each([
    ['DUPLICATE_INVOICE:F-001', 'duplicate'],
    ['SUPPLIER_REQUIRED', 'missing_fields'],
    ['PRODUCT_NOT_IN_ORG', 'not_found'],
    ['Could not find the function public.assistant_register_purchase_invoice', 'not_deployed'],
  ])('%s → %s', (msg, code) => {
    expect(mapFacturaError(msg)?.errorCode).toBe(code);
  });

  it('deshacer anula por RPC; con pagos, remite a Finanzas', async () => {
    const conPagos = { rpc: async () => ({ data: null, error: { message: 'VOID_HAS_PAYMENTS' } }) };
    const r1 = await applyUndo({ supabase: conPagos as never, organizationId: 125, userId: 'u' }, { kind: 'void_purchase_invoice', payload: { invoice_id: 'a1b2c3d4-0000-4000-8000-000000000001' } });
    expect(r1.ok).toBe(false);
    expect(r1.errorCode).toBe('has_payments');

    const ok = { rpc: async () => ({ data: { number_ext: 'F-001', salidas_stock: 1, asientos_revertidos: 2 }, error: null }) };
    const r2 = await applyUndo({ supabase: ok as never, organizationId: 125, userId: 'u' }, { kind: 'void_purchase_invoice', payload: { invoice_id: 'a1b2c3d4-0000-4000-8000-000000000001' } });
    expect(r2.ok).toBe(true);
    expect(r2.message).toContain('2 asientos revertidos');
  });
});
