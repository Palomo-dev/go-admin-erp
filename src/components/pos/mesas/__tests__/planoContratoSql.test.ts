/**
 * Contrato entre el código y las migraciones del plano (plantilla «Café de
 * especialidad», fases F2–F4). Lee los `.sql` versionados —que son copia
 * exacta de lo aplicado por MCP— y comprueba que lo que el código manda o lee
 * existe allí: nombre y parámetros de cada RPC, cada clave del JSON de
 * `guardar_plano_sede`, los tipos de elemento del CHECK y los permisos.
 *
 * También fija el contrato que consume goadmin-websites (M3, M4 y M5).
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { TIPOS_ELEMENTO, colocarMesas, cambiosPlano, type EstadoEditor } from '../plano/planoMesasLogica';
import { COLUMNAS_ELEMENTOS, RPC_GUARDAR_PLANO, TABLA_ELEMENTOS, cuerpoGuardarPlano } from '../plano/planoGuardadoLogica';
import type { VistaMesaPlano } from '../plano/estadoMesaPlano';

const RAIZ = process.cwd();
const MIGRACIONES = {
  m1: '20261008133820_plano_elementos_fijos',
  m2: '20261008133928_plano_mesa_campos_web',
  m3: '20261008134326_plano_publico_rpc',
  m4: '20261008134614_plano_disponibilidad_por_mesa',
  m5: '20261008135016_plano_reserva_con_mesa',
  e9: '20261008140014_plano_guardar_sede',
} as const;

const sql = (k: keyof typeof MIGRACIONES) => readFileSync(join(RAIZ, 'supabase/migrations', `${MIGRACIONES[k]}.sql`), 'utf8');
const rollback = (k: keyof typeof MIGRACIONES) => join(RAIZ, 'supabase/rollbacks', `${MIGRACIONES[k]}_rollback.sql`);
const sinComentarios = (s: string) => s.replace(/--[^\n]*/g, '');

function vista(id: string): VistaMesaPlano {
  return {
    id,
    nombre: `Mesa ${id}`,
    numero: id,
    zona: 'Salón',
    estado: 'libre',
    capacidad: 4,
    comensales: 0,
    minutos: null,
    importe: 0,
    productos: 0,
    mesero: null,
    reservaHora: null,
    reservaNombre: null,
    platosListos: 0,
    abandonada: false,
    forma: 'cuadrada',
    tamano: 'm',
    x: 24,
    y: 40,
    rotacion: 0,
  };
}

/** Un guardado con todo: mesa nueva y editada, zona, elemento nuevo y existente. */
function cuerpoCompleto() {
  const base: EstadoEditor = {
    mesas: colocarMesas([vista('00000000-0000-4000-8000-0000000000aa')], ['Salón']),
    zonas: [{ nombre: 'Salón', color: '#4361EE', orden: 0, original: 'Salón' }],
    borradas: [],
    elementos: [{ id: '00000000-0000-4000-8000-0000000000bb', tipo: 'column', etiqueta: 'Columna', zona: 'Salón', x: 0, y: 0, ancho: 60, alto: 80, rotacion: 0, enSitio: true, orden: 0 }],
    elementosBorrados: [],
  };
  const actual: EstadoEditor = {
    ...base,
    mesas: [{ ...base.mesas[0], capacidad: 6 }, { ...base.mesas[0], id: 'nueva-1', nueva: true }],
    elementos: [{ ...base.elementos[0], x: 20 }, { ...base.elementos[0], id: 'nuevo-elemento-1', nuevo: true }],
  };
  return cuerpoGuardarPlano(cambiosPlano(base, actual), actual);
}

describe('las migraciones aplicadas están versionadas con su rollback', () => {
  it.each(Object.keys(MIGRACIONES) as Array<keyof typeof MIGRACIONES>)('%s: .sql aplicado y rollback', (k) => {
    expect(() => sql(k)).not.toThrow();
    expect(existsSync(rollback(k))).toBe(true);
  });
  it('ninguna migración aplicada lleva «drop» (aditivas)', () => {
    for (const k of Object.keys(MIGRACIONES) as Array<keyof typeof MIGRACIONES>) expect(sql(k)).not.toMatch(/drop/i);
  });
  it('el rollback de M5 es la definición anterior (la rama web ignoraba p_table_id)', () => {
    const r = readFileSync(rollback('m5'), 'utf8');
    expect(r).toMatch(/CREATE OR REPLACE FUNCTION public\.create_restaurant_reservation\(p_organization_id integer/);
    expect(r).not.toContain('MESA: La mesa ya no está disponible');
    expect(r).toContain('f2fcc1d4ca41e66e54b3b0b9dc66edf5');
  });
});

describe('guardar_plano_sede (E9) ↔ planoService', () => {
  const funcion = sinComentarios(sql('e9'));
  it('nombre y parámetros de la RPC', () => {
    expect(RPC_GUARDAR_PLANO).toBe('guardar_plano_sede');
    expect(funcion).toContain('create or replace function public.guardar_plano_sede(p_branch_id integer, p_cambios jsonb)');
    const servicio = readFileSync(join(RAIZ, 'src/components/pos/mesas/plano/planoService.ts'), 'utf8');
    expect(servicio).toMatch(/supabase\.rpc\(RPC_GUARDAR_PLANO, \{ p_branch_id: branchId, p_cambios: cuerpo \}\)/);
  });
  it('cada clave que manda el editor la lee la función', () => {
    const cuerpo = cuerpoCompleto();
    expect(cuerpo.mesas_nuevas).toHaveLength(1);
    expect(cuerpo.mesas_editadas).toHaveLength(1);
    expect(cuerpo.elementos.map((e) => ('id' in e ? 'id' : 'clave'))).toEqual(expect.arrayContaining(['id', 'clave']));
    for (const lista of Object.keys(cuerpo)) expect(funcion).toContain(`v_c -> '${lista}'`);
    const claves = new Set<string>();
    for (const fila of [...cuerpo.mesas_nuevas, ...cuerpo.mesas_editadas, ...cuerpo.zonas, ...cuerpo.elementos]) Object.keys(fila).forEach((c) => claves.add(c));
    for (const c of claves) expect(funcion).toMatch(new RegExp(`(p|v) ->> '${c}'`));
  });
  it('el permiso se resuelve en la base y la organización sale de la sede', () => {
    expect(funcion).toContain('auth.uid() is null');
    expect(funcion).toContain('fn_assert_acceso_org(v_org)');
    expect(funcion).toContain('app_branch_access(p_branch_id)');
    expect(funcion).toMatch(/select b\.organization_id into v_org from public\.branches b where b\.id = p_branch_id/);
    expect(funcion).not.toContain("'organization_id'");
    expect(funcion).toContain('revoke all on function public.guardar_plano_sede(integer, jsonb) from public, anon;');
  });
});

describe('restaurant_floor_elements (M1) ↔ editor', () => {
  const tabla = sql('m1');
  it('los tipos de elemento son los del CHECK', () => {
    const m = tabla.match(/check \(kind in \(([^)]*)\)\)/);
    expect(m).not.toBeNull();
    expect(m![1].split(',').map((x) => x.trim().replace(/'/g, ''))).toEqual([...TIPOS_ELEMENTO]);
  });
  it('las columnas que lee el editor existen', () => {
    expect(TABLA_ELEMENTOS).toBe('restaurant_floor_elements');
    for (const c of COLUMNAS_ELEMENTOS.split(',').map((x) => x.trim())) expect(tabla).toMatch(new RegExp(`\\n  ${c} `));
  });
  it('RLS por pertenencia y sin lectura anónima', () => {
    expect(tabla).toContain('enable row level security');
    expect(tabla).toContain('om.is_active = true');
    expect(tabla).toContain('revoke all on table public.restaurant_floor_elements from public, anon;');
  });
});

describe('contrato que consume goadmin-websites', () => {
  it('M3 · get_restaurant_floor_plan_public: solo service role y sin estado ni cuentas', () => {
    const f = sinComentarios(sql('m3'));
    expect(f).toContain('create or replace function public.get_restaurant_floor_plan_public(\n  p_organization_id integer,\n  p_branch_id integer\n)');
    for (const c of ['zones', 'tables', 'elements', 'has_layout', 'is_web_bookable', 'web_min_party', 'web_max_party']) expect(f).toContain(`'${c}'`);
    expect(f).toContain('and e.show_on_web');
    expect(f).not.toMatch(/'state'|t\.state|table_sessions|sale|server/);
    expect(f).toContain('from public, anon, authenticated;');
    expect(f).toContain('to service_role;');
  });
  it('M4 · get_restaurant_table_availability: parámetros y estados', () => {
    const f = sinComentarios(sql('m4'));
    expect(f).toMatch(
      /function public\.get_restaurant_table_availability\(\n  p_organization_id integer,\n  p_branch_id integer,\n  p_date date,\n  p_time time,\n  p_party_size integer,\n  p_validar_reglas boolean default true\n\)\nreturns table \(table_id uuid, estado text\)/,
    );
    for (const e of ['libre', 'ocupada', 'no_alcanza', 'no_web']) expect(f).toContain(`'${e}'`);
    expect(f).toContain('to service_role, authenticated;');
    // El solape sale de la función compartida con create_restaurant_reservation.
    expect(f).toContain('public.fn_mesa_libre(t.id, p_date, p_time');
  });
  it('M5 · create_restaurant_reservation: misma firma, p_table_id en la rama web y error MESA', () => {
    const f = sql('m5');
    expect(f).toContain(
      'CREATE OR REPLACE FUNCTION public.create_restaurant_reservation(p_organization_id integer, p_reservation_date date, p_reservation_time time without time zone, p_party_size integer, p_customer_name text, p_table_id uuid, p_customer_id uuid, p_duration_minutes integer, p_validar_reglas boolean, p_branch_id integer DEFAULT NULL::integer, p_customer_phone text DEFAULT NULL::text, p_customer_email text DEFAULT NULL::text, p_zone text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_special_requests text DEFAULT NULL::text, p_source text DEFAULT \'website\'::text)',
    );
    expect(f).toContain("raise exception 'MESA: La mesa ya no está disponible';");
    // El solape ya no está copiado: sale de las funciones de M4.
    expect(f).not.toContain('extract(hour from r.reservation_time)');
    expect(f).toContain('public.fn_mesa_libre(');
    expect(f).toContain('public.fn_reservas_sin_mesa_solapadas(');
  });
});
