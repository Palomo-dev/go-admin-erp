/// <reference types="jest" />
/**
 * F2 r3 — `objectionService.addOpportunityObjection`: el tope de la nota
 * (`NOTES_MAX` = 280, el mismo `maxLength` del picker) se aplica EN EL
 * SERVICIO. Hasta la ronda 2 solo lo imponía el `<Input maxLength>`: por la
 * API entraban 281 caracteres y se guardaban. Ahora: 281 → `ObjectionValidationError`
 * (400, mensaje con el tope) sin tocar la BD; 280 (tras recortar) → se inserta.
 *
 * Supabase simulado mínimo: `from().select().eq().eq().maybeSingle()` sirve
 * las filas de la org 120 y `insert().select().single()` registra la escritura.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { NOTES_MAX, ObjectionValidationError, addOpportunityObjection } from '../objectionService';

type Row = Record<string, unknown>;
const ROWS: Record<string, Row[]> = {
  opportunities: [{ id: 'op-1', organization_id: 120 }],
  objections: [{ id: 'ob-1', organization_id: 120 }],
};

interface Write { table: string; op: string; row: Row | null }
const writes: Write[] = [];

function fakeSupabase(): SupabaseClient {
  const from = (table: string) => {
    const preds: ((r: Row) => boolean)[] = [];
    let write: Write | null = null;
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = (col: string, value: unknown) => { preds.push((r) => r[col] === value); return chain; };
    chain.maybeSingle = () => chain;
    chain.single = () => chain;
    chain.insert = (row: Row) => { write = { table, op: 'insert', row }; return chain; };
    chain.update = (row: Row) => { write = { table, op: 'update', row }; return chain; };
    chain.then = (resolve: (v: unknown) => void) => {
      if (write) { writes.push(write); resolve({ data: { id: 'oo-new', ...(write.row ?? {}) }, error: null }); return; }
      resolve({ data: (ROWS[table] ?? []).find((r) => preds.every((p) => p(r))) ?? null, error: null });
    };
    return chain;
  };
  return { from } as unknown as SupabaseClient;
}

beforeEach(() => { writes.length = 0; });

describe('addOpportunityObjection — tope de la nota', () => {
  it('NOTES_MAX es 280 (el mismo maxLength del picker)', () => {
    expect(NOTES_MAX).toBe(280);
  });

  it('281 caracteres → ObjectionValidationError con statusCode 400 y el tope en el mensaje; nada se escribe', async () => {
    const notes = 'x'.repeat(281);
    const call = addOpportunityObjection(120, 'op-1', 'ob-1', { notes }, fakeSupabase());
    await expect(call).rejects.toBeInstanceOf(ObjectionValidationError);
    await expect(call).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('280') });
    expect(writes).toEqual([]);
  });

  it('280 caracteres se guardan tal cual; 281 con espacios alrededor se recortan a 280 y pasan', async () => {
    const notes = 'y'.repeat(280);
    await addOpportunityObjection(120, 'op-1', 'ob-1', { notes }, fakeSupabase());
    expect(writes[0]).toMatchObject({ table: 'opportunity_objections', op: 'insert', row: { notes, organization_id: 120 } });
    writes.length = 0;
    await addOpportunityObjection(120, 'op-1', 'ob-1', { notes: ` ${notes} ` }, fakeSupabase());
    expect(writes[0].row).toMatchObject({ notes });
  });

  it('la longitud se mide en caracteres, no en bytes: 280 letras con tilde pasan', async () => {
    const notes = 'é'.repeat(280);
    await addOpportunityObjection(120, 'op-1', 'ob-1', { notes }, fakeSupabase());
    expect(writes[0].row).toMatchObject({ notes });
  });

  it('el tope se comprueba ANTES de consultar la oportunidad: con 281 ni siquiera se lee', async () => {
    const reads: string[] = [];
    const spy = { from: (table: string) => { reads.push(table); return fakeSupabase().from(table); } } as unknown as SupabaseClient;
    await expect(addOpportunityObjection(120, 'op-1', 'ob-1', { notes: 'z'.repeat(281) }, spy)).rejects.toBeInstanceOf(ObjectionValidationError);
    expect(reads).toEqual([]);
  });
});
