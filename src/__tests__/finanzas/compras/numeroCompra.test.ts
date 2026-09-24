// ============================================================================
// L13 · Número de la factura de compra.
//
// La sugerencia `COMP-AAAA-NNNN` sigue igual (D11: se ofrece con un botón; el
// campo pide el número del proveedor). El duplicado por proveedor lo valida la
// base (`fn_factura_compra_guardar`, `DUPLICATE_INVOICE`), con el número
// normalizado igual que aquí.
// ============================================================================

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

import { sugerirNumeroCompra, normalizarNumeroCompra } from '@/lib/services/compras/logica';

describe('L13 · número sugerido', () => {
  test('primera del año', () => {
    expect(sugerirNumeroCompra([], 2026)).toBe('COMP-2026-0001');
  });
  test('siguiente al mayor del año, no al último creado', () => {
    expect(sugerirNumeroCompra(['COMP-2026-0007', 'COMP-2026-0003', 'COMP-2025-0099', 'FV-1', null], 2026)).toBe('COMP-2026-0008');
  });
  test('los números del proveedor no cuentan', () => {
    expect(sugerirNumeroCompra(['A-123', 'FE-9981'], 2026)).toBe('COMP-2026-0001');
  });
  test('normalización para detectar duplicados', () => {
    expect(normalizarNumeroCompra('  fe-001 ')).toBe('FE-001');
    expect(normalizarNumeroCompra(null)).toBe('');
  });
});
