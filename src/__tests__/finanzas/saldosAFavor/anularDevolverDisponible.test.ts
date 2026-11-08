/**
 * Saldos a favor · anular un anticipo (2026-11-07). La base ahora responde
 * `saldo_usado` (con hint) si el anticipo ya se aplicó en parte, y
 * `pago_en_caja_cerrada` si el efectivo entró en una caja cerrada. La pantalla
 * puede tener la fila vieja (la regla local decía «anulable»): el código del
 * servidor tiene que traducirse en los 4 idiomas y ofrecer «Devolver el
 * disponible» igual que el bloqueo local.
 */
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 120, getCurrentBranchId: () => 7 }));

import * as fs from 'fs';
import * as path from 'path';
import { ErrorPeticionSaldoFavor } from '@/components/finanzas/saldos-a-favor/saldosAFavorService';
import { anularOfreceDevolver, ERRORES_ANULAR_CON_DEVOLUCION, textoErrorSaldo } from '@/components/finanzas/saldos-a-favor/textosSaldo';
import { codigoErrorSaldoFavor, estadoHttpErrorSaldoFavor } from '@/lib/finanzas/saldosAFavor/contrato';
import es from '../../../../messages/es.json';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import pt from '../../../../messages/pt.json';

const IDIOMAS = { es, en, fr, pt } as const;

describe('anular un anticipo: errores que llevan a devolver', () => {
  test('saldo_usado, pago_en_caja_cerrada y saldo_no_anulable ofrecen «Devolver»; los demás no', () => {
    for (const c of ERRORES_ANULAR_CON_DEVOLUCION) expect(anularOfreceDevolver(new ErrorPeticionSaldoFavor(c, 409))).toBe(true);
    expect(anularOfreceDevolver(new ErrorPeticionSaldoFavor('sin_permiso', 403))).toBe(false);
    expect(anularOfreceDevolver(new ErrorPeticionSaldoFavor('motivo_obligatorio', 422))).toBe(false);
    expect(anularOfreceDevolver(new Error('saldo_usado'))).toBe(false);
  });

  test('el mensaje de la RPC (con hint) se vuelve el código estable y 409', () => {
    for (const c of ['saldo_usado', 'pago_en_caja_cerrada'] as const) {
      expect(codigoErrorSaldoFavor(c)).toBe(c);
      expect(estadoHttpErrorSaldoFavor(c)).toBe(409);
    }
  });

  test.each(Object.keys(IDIOMAS) as (keyof typeof IDIOMAS)[])('%s: mensajes claros que dicen qué hacer', (idioma) => {
    const s = IDIOMAS[idioma].finanzasDocumentosR3.saldos as unknown as Record<string, Record<string, string>> & { anular: Record<string, string> };
    const t = Object.assign((k: string) => k.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown>)?.[p], s) as string, {
      has: (k: string) => typeof k.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown>)?.[p], s) === 'string',
    });
    const usado = textoErrorSaldo(t, new ErrorPeticionSaldoFavor('saldo_usado', 409));
    const caja = textoErrorSaldo(t, new ErrorPeticionSaldoFavor('pago_en_caja_cerrada', 409));
    expect(usado).not.toBe(s.errores.error_desconocido);
    expect(caja).not.toBe(s.errores.error_desconocido);
    expect(usado).not.toBe(caja);
    // El botón se llama igual que lo que el mensaje pide.
    expect(s.anular.devolverEnSuLugar.length).toBeGreaterThan(0);
    if (idioma !== 'es') expect(usado).not.toBe(es.finanzasDocumentosR3.saldos.errores.saldo_usado);
  });

  test('el diálogo de anular muestra «Devolver el disponible» también tras el error del servidor', () => {
    const fuente = fs.readFileSync(path.resolve(__dirname, '../../../components/finanzas/saldos-a-favor/ListadoSaldosAFavor.tsx'), 'utf-8');
    expect(fuente).toMatch(/setAnularPideDevolver\(anularOfreceDevolver\(e\)\)/);
    expect(fuente).toMatch(/\(bloqueoAnular \|\| anularPideDevolver\) && anular && accionesSaldo\(anular, permisosSaldo\)\.devolver/);
    expect(es.finanzasDocumentosR3.saldos.anular.devolverEnSuLugar).toBe('Devolver el disponible');
  });
});
