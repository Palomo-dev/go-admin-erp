/**
 * Datos mínimos de la empresa (acceso v3, fase 7; docs/design/AUTH-ACCESO-V2.md
 * §13 y Figma sección 18 fila 9, nodo 1170:744210): NIT, ciudad y dirección.
 *
 * Una sola regla para la tarjeta «Completa los datos de tu empresa» del Inicio
 * y para la activación de la facturación electrónica, que los exige. El NIT
 * vive en `organizations.nit` y, en organizaciones antiguas, en `tax_id`.
 *
 * Isomórfico (sin imports de servidor ni de navegador).
 */

export type DatoEmpresa = 'nit' | 'ciudad' | 'direccion';

export interface OrganizacionDatosEmpresa {
  nit?: string | null;
  tax_id?: string | null;
  city?: string | null;
  address?: string | null;
}

/** Columnas que hay que leer de `organizations` para decidir. */
export const COLUMNAS_DATOS_EMPRESA = 'nit, tax_id, city, address';

const vacio = (v: string | null | undefined) => !v || !v.trim();

/** Qué falta, en el orden en que se nombra («el NIT, la ciudad y la dirección»). */
export function datosEmpresaFaltantes(org: OrganizacionDatosEmpresa | null | undefined): DatoEmpresa[] {
  if (!org) return [];
  const faltan: DatoEmpresa[] = [];
  if (vacio(org.nit) && vacio(org.tax_id)) faltan.push('nit');
  if (vacio(org.city)) faltan.push('ciudad');
  if (vacio(org.address)) faltan.push('direccion');
  return faltan;
}
