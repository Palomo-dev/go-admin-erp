/**
 * Preferencia de impuestos del POS: el último «Impuestos incluidos» y los
 * impuestos elegidos en el selector se recuerdan por organización y sucursal,
 * y cada carrito NUEVO arranca con ellos. Solo la cambia una acción del cajero
 * (el interruptor o el selector), nunca la carga inicial de un carrito.
 *
 * Vive en el navegador (por equipo): es una comodidad del puesto de caja, no
 * un dato del negocio. Si el almacenamiento no está disponible, el POS se
 * comporta como siempre (impuestos predeterminados y sin incluir).
 */
export interface PreferenciaImpuestos {
  incluidos?: boolean;
  impuestos?: string[];
}

const clave = (organizationId: number, branchId: number) => `pos:impuestos:${organizationId}:${branchId}`;

function valida(org: unknown, sede: unknown): org is number {
  return typeof org === 'number' && org > 0 && typeof sede === 'number' && sede > 0;
}

export function leerPreferenciaImpuestos(organizationId: number | undefined, branchId: number | undefined): PreferenciaImpuestos | null {
  if (!valida(organizationId, branchId)) return null;
  try {
    const crudo = window.localStorage.getItem(clave(organizationId, branchId as number));
    if (!crudo) return null;
    const dato = JSON.parse(crudo) as unknown;
    if (typeof dato !== 'object' || dato === null) return null;
    const { incluidos, impuestos } = dato as Record<string, unknown>;
    return {
      ...(typeof incluidos === 'boolean' ? { incluidos } : {}),
      ...(Array.isArray(impuestos) && impuestos.every((i) => typeof i === 'string') ? { impuestos: impuestos as string[] } : {}),
    };
  } catch {
    return null;
  }
}

export function guardarPreferenciaImpuestos(
  organizationId: number | undefined,
  branchId: number | undefined,
  cambio: PreferenciaImpuestos,
): void {
  if (!valida(organizationId, branchId)) return;
  try {
    const actual = leerPreferenciaImpuestos(organizationId, branchId) ?? {};
    window.localStorage.setItem(clave(organizationId, branchId as number), JSON.stringify({ ...actual, ...cambio }));
  } catch {
    /* sin almacenamiento: el POS sigue con los predeterminados */
  }
}

/**
 * Impuestos con los que arranca un carrito sin selección propia: los de la
 * preferencia que sigan existiendo en la organización. `null` = no hay
 * preferencia aplicable (se usan los predeterminados de siempre).
 */
export function impuestosDePreferencia(
  preferencia: PreferenciaImpuestos | null,
  idsOrganizacion: string[],
): string[] | null {
  if (!preferencia?.impuestos) return null;
  const existentes = new Set(idsOrganizacion);
  return preferencia.impuestos.filter((id) => existentes.has(id));
}
