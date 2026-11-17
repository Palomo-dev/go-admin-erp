/**
 * «Métodos por sede» del kiosco (Figma 20.27.1, tarjetas «Kiosco con PIN»,
 * «Carné o etiqueta NFC» y «Foto de evidencia y letrero»), fase M1.
 *
 * Va aparte del formulario de M0 (`metodosVista.ts`): el `PUT` lleva los métodos
 * de M0 tal como antes y, además, `pin`, `carne` y `foto`. La base valida todo
 * otra vez (`fn_hr_metodos_sede_guardar`).
 */
import { diasFotoValidos, FOTO_DIAS_POR_DEFECTO } from './foto';

interface MetodoApi {
  activo: boolean;
  reglas: Record<string, unknown>;
}

export interface FormKiosco {
  pin: { activo: boolean; foto: boolean };
  carne: { activo: boolean; foto: boolean };
  foto: { dias: number | null; letrero: boolean };
}

export interface FotoSedeApi {
  dias?: number | null;
  letrero_puesto?: boolean | null;
}

export function formularioKioscoDesde(metodos: Partial<Record<string, MetodoApi>> | null | undefined, foto: FotoSedeApi | null | undefined): FormKiosco {
  const pin = metodos?.pin;
  const carne = metodos?.carne;
  const dias = Number(foto?.dias ?? FOTO_DIAS_POR_DEFECTO);
  return {
    pin: { activo: pin?.activo === true, foto: pin?.reglas?.foto !== false },
    carne: { activo: carne?.activo === true, foto: carne?.reglas?.foto !== false },
    foto: { dias: Number.isFinite(dias) ? dias : FOTO_DIAS_POR_DEFECTO, letrero: foto?.letrero_puesto === true },
  };
}

/** Cuántas tarjetas del kiosco cambiaron (se suman a «Cambios sin guardar»). */
export function cambiosKiosco(base: FormKiosco, actual: FormKiosco): number {
  return (['pin', 'carne', 'foto'] as const).filter((k) => JSON.stringify(base[k]) !== JSON.stringify(actual[k])).length;
}

export type ErrorKiosco = 'foto_dias_invalido';

export function cuerpoKiosco(f: FormKiosco):
  | { ok: true; metodos: { pin: MetodoApi; carne: MetodoApi; foto: { dias: number; letrero_puesto: boolean } } }
  | { ok: false; error: ErrorKiosco } {
  if (!diasFotoValidos(f.foto.dias)) return { ok: false, error: 'foto_dias_invalido' };
  return {
    ok: true,
    metodos: {
      pin: { activo: f.pin.activo, reglas: { foto: f.pin.foto } },
      carne: { activo: f.carne.activo, reglas: { foto: f.carne.foto } },
      foto: { dias: f.foto.dias, letrero_puesto: f.foto.letrero },
    },
  };
}

/**
 * Separa el cuerpo del `PUT /api/hrm/marcacion/metodos`: lo de M0 (lo valida
 * `cuerpoMetodos`) y lo del kiosco (lo valida esto). Sin parte de kiosco, null.
 */
export function separarCuerpo(metodos: Record<string, unknown>): { m0: Record<string, unknown>; kiosco: Record<string, unknown> | null } {
  const { pin, carne, foto, ...m0 } = metodos;
  if (pin === undefined && carne === undefined && foto === undefined) return { m0, kiosco: null };
  return { m0, kiosco: { pin, carne, foto } };
}

/** Valida la parte del kiosco que llega del navegador (forma; la base decide lo demás). */
export function kioscoDeCuerpo(k: Record<string, unknown>): { ok: true; valor: Record<string, unknown> } | { ok: false; error: 'datos_invalidos' | ErrorKiosco } {
  const out: Record<string, unknown> = {};
  for (const m of ['pin', 'carne'] as const) {
    const v = k[m] as { activo?: unknown; reglas?: { foto?: unknown } } | undefined;
    if (v === undefined) continue;
    if (!v || typeof v.activo !== 'boolean') return { ok: false, error: 'datos_invalidos' };
    out[m] = { activo: v.activo, reglas: { foto: v.reglas?.foto !== false } };
  }
  const f = k.foto as { dias?: unknown; letrero_puesto?: unknown } | undefined;
  if (f !== undefined) {
    if (!f || !diasFotoValidos(f.dias)) return { ok: false, error: 'foto_dias_invalido' };
    out.foto = { dias: f.dias, letrero_puesto: f.letrero_puesto === true };
  }
  return { ok: true, valor: out };
}
