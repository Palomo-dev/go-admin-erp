/**
 * GO Assistant — Fase 0: contrato contra la BASE VIVA (suite del TESTER).
 *
 * `goAssistantF0.test.ts` comprueba que el catálogo es coherente consigo mismo.
 * Esta suite comprueba lo otro: que los identificadores que el catálogo declara
 * EXISTEN en el proyecto Supabase `jgmgphmzusbluqhuqihj`.
 *
 * Es la misma clase de fallo que la fase vino a arreglar (código escrito contra
 * un esquema imaginado), solo que un nivel más arriba: no las columnas, sino
 * los códigos de módulo y de permiso con los que se decide si una acción se
 * ofrece o no.
 *
 * Los snapshots se leyeron con MCP el 2026-09-09:
 *   select distinct module_code from organization_modules;
 *   select code from permissions;
 *
 * Si la BD cambia, hay que actualizar el snapshot A PROPÓSITO — que es
 * exactamente la conversación que este test fuerza.
 */

import { ACTION_CATALOG, sanitizeActionFields } from '@/lib/ai/assistant/actionCatalog';
import { aiActionsService } from '@/lib/services/aiActionsService';

/** `select distinct module_code from organization_modules` (2026-09-09). */
const REAL_MODULE_CODES = new Set([
  'calendar',
  'chat',
  'clientes',
  'configuracion',
  'crm',
  'finance',
  'gym',
  'hrm',
  'integrations',
  'inventory',
  'notifications',
  'operations',
  'organizations',
  'parking',
  'pm',
  'pms_hotel',
  'pos',
  'reports',
  'roles',
  'transport',
]);

/**
 * Subconjunto de `permissions.code` relevante para el catálogo (2026-09-09).
 * Solo se listan los que el catálogo declara: si alguien añade uno nuevo, este
 * test obliga a comprobarlo contra la BD antes de darlo por bueno.
 */
const REAL_PERMISSION_CODES = new Set([
  'crm.contacts.create',
  'crm.contacts.edit',
  'crm.customers.create',
  'crm.customers.edit',
  'customer_management',
  'inventory.adjust',
  'inventory.create',
  'inventory.edit',
  'inventory.transfer',
  'inventory_management',
  'pos.create',
  'product_management',
]);

describe('GO Assistant F0 — el catálogo contra los códigos REALES de la BD', () => {
  it('todo `requiredModule` existe en organization_modules.module_code', () => {
    // El módulo de inventario se llama `inventory` en esta base, no
    // `inventario`. Con el valor equivocado, `evaluateAction` deniega
    // `module_inactive` en TODA organización que tenga módulos resueltos, y las
    // ocho acciones de inventario quedan inalcanzables en producción.
    const rotos = Object.values(ACTION_CATALOG)
      .filter((d) => d.requiredModule !== null && !REAL_MODULE_CODES.has(d.requiredModule))
      .map((d) => `${d.type} -> '${d.requiredModule}'`);

    expect(rotos).toEqual([]);
  });

  it('todo permiso declarado existe en permissions.code', () => {
    const rotos: string[] = [];
    for (const def of Object.values(ACTION_CATALOG)) {
      for (const code of def.permissions) {
        if (!REAL_PERMISSION_CODES.has(code)) rotos.push(`${def.type} -> '${code}'`);
      }
    }
    expect(rotos).toEqual([]);
  });
});

describe('GO Assistant F0 — la lista blanca filtra NOMBRES, no VALORES', () => {
  // `normalizeFields` (y el filtro gemelo de execute-action) comprueban que la
  // clave esté en el esquema, pero aceptan cualquier `value`. El ejecutor lo
  // pasa por `str()`, que es `String(v)`: un objeto acaba en la base como
  // "[object Object]" y un array como "a,b". No es una fuga de tenant, pero sí
  // datos corruptos que solo puede meter un cliente hostil (la tarjeta nunca
  // manda objetos).

  it('un objeto en un campo de texto se descarta, no se convierte', () => {
    // Arreglado con `sanitizeFieldValue`: se descarta en vez de dejar que
    // `String()` lo convierta. Si el campo era obligatorio, la acción falla
    // después con `missing_fields`, que es la respuesta honesta.
    const data = aiActionsService.normalizeFields('create_product', [
      { name: 'name', value: { toString: undefined, a: 1 } as unknown },
    ]);
    expect(data.name).toBeUndefined();
  });

  it('un array tampoco se cuela como texto separado por comas', () => {
    const data = aiActionsService.normalizeFields('create_supplier', [
      { name: 'name', value: ['a', 'b'] as unknown },
    ]);
    expect(data.name).toBeUndefined();
  });

  it('un booleano en un campo de id numérico no se rechaza', () => {
    // `intId(true)` === 1: `category_id: true` acaba apuntando a la categoría 1.
    const data = aiActionsService.normalizeFields('create_product', [
      { name: 'name', value: 'X' },
      { name: 'category_id', value: true },
    ]);
    expect(data.category_id).not.toBe(true);
  });
});

describe('GO Assistant F0 — los campos `readonly` son de solo lectura EN EL SERVIDOR', () => {
  // El fallo original: el filtro de `execute-action` solo miraba `f.name`, así
  // que un cliente podía cambiar `product_id` / `customer_id` / `branch_id`
  // entre la propuesta y la confirmación, y ejecutar sobre un registro distinto
  // del que el usuario vio en la tarjeta.
  //
  // El arreglo NO es quitar los identificadores del esquema —el usuario tiene
  // que verlos— sino que el servidor ignore lo que el cliente mande para ellos
  // y use el valor que persistió al proponer. Eso es lo que se comprueba aquí.

  it('`sanitizeActionFields` con editableOnly descarta los identificadores', () => {
    const revisado = sanitizeActionFields(
      'update_product_price',
      [
        { name: 'product_id', value: 999999 },
        { name: 'new_price', value: 1 },
      ],
      { editableOnly: true }
    );
    expect(revisado).toEqual({ new_price: 1 });
    expect(revisado.product_id).toBeUndefined();
  });

  it('sin editableOnly (propuesta del servidor) el identificador sí se acepta', () => {
    const propuesto = sanitizeActionFields('update_product_price', [
      { name: 'product_id', value: 9704 },
      { name: 'new_price', value: 20000 },
    ]);
    // `product_id` está declarado `type: 'text'` a propósito: los productos y
    // las categorías usan enteros, pero los clientes usan uuid. El ejecutor lo
    // convierte con `intId()` donde corresponde.
    expect(propuesto).toEqual({ product_id: '9704', new_price: 20000 });
  });

  it('toda acción de actualización identifica el registro con un campo readonly', () => {
    // La otra mitad del invariante: si un `update_*` dejara de marcar su
    // identificador como readonly, el filtro de arriba dejaría de protegerlo.
    const sinProteger = Object.values(ACTION_CATALOG)
      .filter((d) => d.available && d.type.startsWith('update_'))
      .filter((d) => !d.fields.some((f) => f.readonly && f.required))
      .map((d) => d.type);
    expect(sinProteger).toEqual([]);
  });
});
