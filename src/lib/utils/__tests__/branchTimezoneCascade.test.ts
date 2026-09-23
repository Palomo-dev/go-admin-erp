// ============================================================
// Fase A3 — la cascada del cliente y la de la base dicen lo mismo.
//
// El bug de la ronda 2 fue justamente que discrepaban: la venta de una
// sucursal en otro huso se formateaba con la zona de la organización. Aquí
// se fija el contrato con los mismos datos dobles para ambas.
// ============================================================

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  resolveTimezoneCascade,
  resolveTimezoneForBranch,
  buildBranchTimezoneOptions,
  isUsableTimezone,
  INHERIT_TIMEZONE_VALUE,
} from '@/lib/utils/branchTimezoneCascade';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { DEFAULT_TIMEZONE } from '@/lib/utils/timezone';

const SQL = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations',
    '20260923200000_zona_horaria_por_sucursal.sql'),
  'utf8',
);

/**
 * Réplica en TypeScript del cuerpo REAL de `fn_timezone_for(p_org, p_branch)`,
 * transcrita de la migración (y comprobada contra `pg_proc.prosrc` del
 * proyecto el 2026-09-23). NO es un `coalesce` de niveles válidos:
 *
 *   1. si la sucursal trae algo, v_tz es eso —válido o no—;
 *   2. la organización SOLO se consulta si v_tz sigue null o en blanco;
 *   3. al final, si `now() at time zone v_tz` falla, devuelve el default.
 *
 * De ahí que una zona rota en la sucursal NO deje pasar a la organización:
 * devuelve 'America/Bogota'. El primer doble de este archivo hacía
 * `limpio(branch) ?? limpio(org) ?? default`, que es otra cosa, y por eso
 * daba por buena una discrepancia real entre cliente y base.
 */
function fnTimezoneForDoble(branchTz: string | null, orgTz: string | null): string {
  const presente = (v: string | null) => {
    const t = (v ?? '').trim();
    return t.length > 0 ? t : null;
  };
  // Pasos 1 y 2: quién aporta el valor (aunque sea ilegible).
  const vTz = presente(branchTz) ?? presente(orgTz);
  if (vTz === null) return 'America/Bogota';
  // Paso 4: `now() at time zone v_tz` — si no se reconoce, el default.
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: vTz });
  } catch {
    return 'America/Bogota';
  }
  return vTz;
}

describe('el doble sigue siendo fiel al SQL que está en el repositorio', () => {
  // Si alguien reescribe fn_timezone_for como un coalesce de niveles válidos,
  // estas tres aserciones caen y hay que revisar el doble Y el cliente.
  it('la organizacion solo se consulta si la sucursal no aporto nada', () => {
    const sinEspacios = SQL.replace(/\s+/g, ' ');
    expect(sinEspacios).toContain("if v_tz is null or btrim(v_tz) = '' then begin select o.timezone into v_tz");
  });

  it('una zona que Postgres no reconoce devuelve el default, no el nivel siguiente', () => {
    const sinEspacios = SQL.replace(/\s+/g, ' ');
    expect(sinEspacios).toContain(
      "v_prueba := (now() at time zone v_tz)::date; exception when others then return 'America/Bogota';",
    );
  });

  it('la sucursal es el primer nivel', () => {
    const iSucursal = SQL.indexOf('select b.timezone into v_tz');
    const iOrg = SQL.indexOf('select o.timezone into v_tz');
    expect(iSucursal).toBeGreaterThan(-1);
    expect(iOrg).toBeGreaterThan(iSucursal);
  });
});

// Datos dobles: una organización en Bogotá con una sucursal en Madrid.
const ORG_BOGOTA = 'America/Bogota';
const SUCURSAL_MADRID = 4102;
const SUCURSAL_BOGOTA = 4101;
const MAPA: Record<number, string | null> = {
  [SUCURSAL_BOGOTA]: null,
  [SUCURSAL_MADRID]: 'Europe/Madrid',
};

describe('cascada sucursal → organización → fallback', () => {
  it('la sucursal con zona propia manda sobre la organización', () => {
    const r = resolveTimezoneForBranch(SUCURSAL_MADRID, MAPA, ORG_BOGOTA);
    expect(r.timezone).toBe('Europe/Madrid');
    expect(r.source).toBe('branch');
  });

  it('sin override, la sucursal hereda la zona de la organización', () => {
    const r = resolveTimezoneForBranch(SUCURSAL_BOGOTA, MAPA, ORG_BOGOTA);
    expect(r.timezone).toBe(ORG_BOGOTA);
    expect(r.source).toBe('organization');
  });

  it('organización sin zona y sucursal sin override → America/Bogota', () => {
    const r = resolveTimezoneForBranch(SUCURSAL_BOGOTA, MAPA, null);
    expect(r.timezone).toBe(DEFAULT_TIMEZONE);
    expect(r.source).toBe('fallback');
  });

  it('una zona inválida CORTA la cascada y cae al default, como la base', () => {
    // Antes esto devolvía 'Europe/Madrid' y `fn_timezone_for` devolvía
    // 'America/Bogota': el mismo dato con dos días distintos según quién
    // lo calculara. Manda la base (ADR-001: un solo modo de fallo).
    const r = resolveTimezoneCascade({
      branchTimezone: 'Marte/Olympus',
      organizationTimezone: 'Europe/Madrid',
    });
    expect(r.timezone).toBe(DEFAULT_TIMEZONE);
    expect(r.source).toBe('fallback');
    expect(r.invalid).toEqual(['Marte/Olympus']);
  });

  it('una organización con zona rota tampoco «hereda» del default por error', () => {
    const r = resolveTimezoneCascade({
      branchTimezone: null,
      organizationTimezone: 'Marte/Olympus',
    });
    expect(r.timezone).toBe(DEFAULT_TIMEZONE);
    expect(r.source).toBe('fallback');
    expect(r.invalid).toEqual(['Marte/Olympus']);
  });

  it('si todos los niveles son inválidos, el fallback nunca es una zona rota', () => {
    const r = resolveTimezoneCascade({ branchTimezone: 'X', organizationTimezone: 'Y' });
    expect(r.timezone).toBe(DEFAULT_TIMEZONE);
    expect(isUsableTimezone(r.timezone)).toBe(true);
  });

  it('cadena vacía o con espacios equivale a heredar, no a zona inválida', () => {
    const r = resolveTimezoneCascade({ branchTimezone: '   ', organizationTimezone: ORG_BOGOTA });
    expect(r.timezone).toBe(ORG_BOGOTA);
    expect(r.invalid).toEqual([]);
  });

  it('una sucursal desconocida hereda en vez de romper', () => {
    expect(resolveTimezoneForBranch(999999, MAPA, ORG_BOGOTA).timezone).toBe(ORG_BOGOTA);
    expect(resolveTimezoneForBranch(null, MAPA, ORG_BOGOTA).timezone).toBe(ORG_BOGOTA);
    expect(resolveTimezoneForBranch(undefined, MAPA, ORG_BOGOTA).timezone).toBe(ORG_BOGOTA);
  });
});

describe('contrato con fn_timezone_for de la base', () => {
  const casos: Array<[string | null, string | null]> = [
    ['Europe/Madrid', ORG_BOGOTA],
    [null, ORG_BOGOTA],
    ['', ORG_BOGOTA],
    ['  ', 'America/Mexico_City'],
    [null, null],
    ['Marte/Olympus', 'Europe/Madrid'],
    ['Marte/Olympus', null],
    ['America/Santiago', 'Europe/Madrid'],
  ];

  it.each(casos)('branch=%s org=%s resuelven igual en cliente y base', (branchTz, orgTz) => {
    const cliente = resolveTimezoneCascade({
      branchTimezone: branchTz,
      organizationTimezone: orgTz,
    }).timezone;
    expect(cliente).toBe(fnTimezoneForDoble(branchTz, orgTz));
  });
});

describe('la zona sale del dato, no del selector de la barra superior', () => {
  // 2026-01-15 23:30 en Bogotá = 2026-01-16 05:30 en Madrid: el día cambia.
  const instante = '2026-01-16T04:30:00.000Z';

  it('una venta de la sucursal de Madrid se muestra en hora de Madrid', () => {
    const zonaDelDato = resolveTimezoneForBranch(SUCURSAL_MADRID, MAPA, ORG_BOGOTA).timezone;
    const textoMadrid = formatDateTimeInTz(instante, zonaDelDato);
    const textoBogota = formatDateTimeInTz(instante, ORG_BOGOTA);
    expect(zonaDelDato).toBe('Europe/Madrid');
    expect(textoMadrid).not.toBe(textoBogota);
    expect(textoMadrid).toContain('16/01/2026');
    expect(textoBogota).toContain('15/01/2026');
  });

  it('la sucursal seleccionada en la barra no cambia cómo se ve el dato', () => {
    // «Seleccionada» Bogotá; el dato sigue siendo de Madrid.
    const seleccionadaEnLaBarra = SUCURSAL_BOGOTA;
    const branchIdDelDato = SUCURSAL_MADRID;
    expect(resolveTimezoneForBranch(branchIdDelDato, MAPA, ORG_BOGOTA).timezone).toBe('Europe/Madrid');
    expect(resolveTimezoneForBranch(seleccionadaEnLaBarra, MAPA, ORG_BOGOTA).timezone).toBe(ORG_BOGOTA);
  });
});

describe('selector de la ficha de sucursal', () => {
  const catalogo = [
    { value: 'America/Bogota', label: 'Bogotá (GMT-5)' },
    { value: 'Europe/Madrid', label: 'Madrid (GMT+1)' },
  ];

  it('la primera opción es «heredar» y su valor vacío es el NULL de la BD', () => {
    const opciones = buildBranchTimezoneOptions(ORG_BOGOTA, catalogo);
    expect(opciones[0].value).toBe(INHERIT_TIMEZONE_VALUE);
    expect(INHERIT_TIMEZONE_VALUE).toBe('');
    expect(opciones[0].label).toBe('Heredar de la organización (America/Bogota)');
  });

  it('la etiqueta de «heredar» dice qué zona se aplicaría', () => {
    const opciones = buildBranchTimezoneOptions('Europe/Madrid', catalogo);
    expect(opciones[0].label).toContain('Europe/Madrid');
    expect(opciones).toHaveLength(catalogo.length + 1);
  });
});
