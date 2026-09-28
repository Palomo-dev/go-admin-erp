// ============================================================
// Fase A3 — contratos que no se pueden romper sin darse cuenta.
//
// El entorno de Jest es `node` y el repo no trae @testing-library/react, así
// que estos contratos se fijan sobre el CÓDIGO FUENTE. Son deliberadamente
// literales: cada uno corresponde a una mutación que, aplicada, hace que un
// test de aquí falle.
// ============================================================

import { readFileSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..', '..', '..', '..');
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8');

const CONTEXTO = leer('src/lib/context/OrganizationTimezoneContext.tsx');
const CAMPO = leer('src/components/branches/BranchTimezoneField.tsx');
const FORMULARIO = leer('src/components/branches/BranchForm.tsx');
const SERVICIO_SUCURSALES = leer('src/lib/services/branchService.ts');
const AJUSTES_ORG = leer('src/components/calendario/configuracion/useCalendarSettings.ts');
const PAGINA_SUCURSALES = leer('src/app/app/organizacion/sucursales/page.tsx');
const ESCRITOR = leer('src/lib/services/timezoneSettingsService.ts');
const RUTA = leer('src/app/api/organization/timezone/route.ts');
const TARJETA_ORG = leer('src/components/organization/OrganizationTimezoneCard.tsx');
const PANEL_GENERAL = leer('src/components/configuracion/panels/general/GeneralConfigPanel.tsx');
const REGISTRO_CONFIG = leer('src/components/configuracion/config/configModulesRegistry.ts');

describe('la firma vieja de useFormatDate sigue valiendo', () => {
  it('el parámetro de sucursal es OPCIONAL (83 archivos llaman sin argumentos)', () => {
    expect(CONTEXTO).toContain('export function useFormatDate(branchId?: number | null)');
    // Un parámetro obligatorio rompería a todos los llamadores actuales.
    expect(CONTEXTO).not.toMatch(/export function useFormatDate\(branchId: /);
  });

  it('sigue devolviendo las mismas funciones que antes de la fase A3', () => {
    for (const fn of ['formatDate', 'formatDateTime', 'formatTime', 'formatPlain', 'getToday', 'toDate', 'toInstant']) {
      expect(CONTEXTO).toContain(`  const ${fn} = useCallback(`);
    }
  });

  it('useOrgTimezone sigue existiendo y devolviendo la zona de la organización', () => {
    expect(CONTEXTO).toContain('export function useOrgTimezone()');
  });
});

describe('la zona sale del dato, no del selector de la barra superior', () => {
  it('el contexto resuelve por cascada y no importa el BranchContext', () => {
    expect(CONTEXTO).toContain('resolveTimezoneForBranch');
    // Importar useBranch/selectedBranchId aquí sería justamente el bug.
    expect(CONTEXTO).not.toContain('useBranch');
    expect(CONTEXTO).not.toContain('selectedBranchId');
  });

  it('queda escrito en el código de dónde sale el branchId', () => {
    expect(CONTEXTO).toContain('NUNCA el del selector de sucursal de la barra');
  });

  it('useFormatDate delega en useTimezoneFor (no lee la zona de la org a pelo)', () => {
    expect(CONTEXTO).toContain('export function useTimezoneFor(');
    expect(CONTEXTO).toMatch(/export function useFormatDate\([^)]*\) \{\s*\n\s*const \{ timezone \} = useTimezoneFor\(branchId\);/);
  });
});

describe('el selector de la sucursal ofrece «heredar» por defecto', () => {
  it('usa el constructor de opciones compartido, con «heredar» primero', () => {
    expect(CAMPO).toContain('buildBranchTimezoneOptions');
    expect(CAMPO).toContain('INHERIT_TIMEZONE_VALUE');
  });

  it('elegir «heredar» guarda NULL, no la cadena vacía', () => {
    expect(CAMPO).toContain('onChange(e.target.value === INHERIT_TIMEZONE_VALUE ? null : e.target.value)');
  });

  it('es accesible: label asociada y aria-describedby con la zona efectiva', () => {
    expect(CAMPO).toContain('htmlFor={selectId}');
    expect(CAMPO).toContain('id={selectId}');
    expect(CAMPO).toContain('aria-describedby={helpId}');
    expect(CAMPO).toContain('id={helpId}');
  });

  it('dice cuál se aplica y de dónde viene', () => {
    expect(CAMPO).toContain('propia de la sucursal');
    expect(CAMPO).toContain('heredada de la organización');
  });

  it('está montado en la ficha de sucursal', () => {
    expect(FORMULARIO).toContain('<BranchTimezoneField');
    expect(FORMULARIO).toContain('timezone: initialData.timezone ?? null');
  });
});

describe('guardar invalida el caché en los dos niveles', () => {
  it('el único escritor invalida organización Y sucursales, y avisa', () => {
    expect(ESCRITOR).toContain('invalidateTimezoneCache');
    expect(ESCRITOR).toContain('invalidateBranchTimezoneCache');
    expect(ESCRITOR).toContain('notifyTimezonesUpdated()');
  });

  it('no invalida nada si el servidor rechazó la escritura', () => {
    // El `throw` va ANTES de las invalidaciones: si se movieran detrás, un 403
    // dejaría la pantalla creyendo que la zona cambió.
    const iThrow = ESCRITOR.indexOf('throw new Error(mensaje)');
    const iInvalida = ESCRITOR.indexOf('invalidateTimezoneCache(orgId)');
    expect(iThrow).toBeGreaterThan(-1);
    expect(iInvalida).toBeGreaterThan(iThrow);
  });

  it('las dos pantallas que guardan una zona pasan por ese escritor', () => {
    expect(AJUSTES_ORG).toContain('guardarZonaOrganizacion');
    expect(SERVICIO_SUCURSALES).toContain('guardarZonaSucursal');
  });

  it('ninguna pantalla vuelve a escribir la zona contra PostgREST', () => {
    for (const fuente of [AJUSTES_ORG, TARJETA_ORG]) {
      expect(fuente).not.toMatch(/\.update\(\s*\{\s*timezone/);
    }
  });

  it('el contexto escucha el evento para recargar', () => {
    expect(CONTEXTO).toContain('window.addEventListener(TIMEZONES_UPDATED_EVENT, handleOrgChange)');
  });
});

describe('la zona de la organización se puede fijar sin el módulo de calendario', () => {
  it('hay una tarjeta de zona montada en el panel General', () => {
    expect(PANEL_GENERAL).toContain('OrganizationTimezoneCard');
    expect(TARJETA_ORG).toContain('guardarZonaOrganizacion');
  });

  it('General es un panel de núcleo y Calendario no', () => {
    // Si General dejara de ser isCore, una organización sin calendario se
    // quedaría otra vez sin ninguna pantalla para fijar su zona.
    expect(REGISTRO_CONFIG).toMatch(/id: 'general',[\s\S]{0,240}?isCore: true/);
    expect(REGISTRO_CONFIG).not.toMatch(/id: 'calendario',[\s\S]{0,240}?isCore: true/);
  });

  it('la tarjeta dice qué hora es con la zona elegida antes de guardar', () => {
    expect(TARJETA_ORG).toContain('formatDateTimeInTz');
  });
});

describe('permisos de la escritura: en el servidor (reglas duras 5 y 6)', () => {
  it('la ruta exige admin, no solo sesión', () => {
    expect(RUTA).toContain('withOrg(guardar, { admin: true })');
  });

  it('la organización sale de la sesión, nunca del body', () => {
    expect(RUTA).toContain('ctx.organizationId');
    expect(RUTA).not.toMatch(/cuerpo\.organization_?[Ii]d/);
  });

  it('la sucursal se comprueba por pertenencia antes de escribirla', () => {
    expect(RUTA).toContain("'BRANCH_NOT_FOUND'");
    const iComprueba = RUTA.indexOf("'branches'");
    const iEscribe = RUTA.lastIndexOf("'branches'");
    expect(iEscribe).toBeGreaterThan(iComprueba);
  });
});

describe('no se acepta una zona inválida al escribir', () => {
  it('la sucursal valida contra el catálogo IANA canónico antes de guardar', () => {
    expect(SERVICIO_SUCURSALES).toContain('isSupportedTimeZone');
    expect(SERVICIO_SUCURSALES).toMatch(/throw new Error\(`Zona horaria no reconocida/);
  });
});

describe('permisos (regla dura 6): se resuelven fuera del formulario', () => {
  it('la pantalla de sucursales exige admin de organización por id de rol', () => {
    expect(PAGINA_SUCURSALES).toContain('useOrgAdmin');
    expect(PAGINA_SUCURSALES).toContain('if (!isOrgAdmin)');
    expect(PAGINA_SUCURSALES).toContain("t('common.noPermissions')");
  });

  it('el criterio de admin no se deduce del nombre del rol', () => {
    const criterio = leer('src/components/organization/useOrgAdmin.ts');
    expect(criterio).toContain('const isOrgAdmin = userRole === 2 || userRole === 1;');
    expect(criterio).not.toMatch(/role_name|roleName|'Admin de organización'/);
  });
});
