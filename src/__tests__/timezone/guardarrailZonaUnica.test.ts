// ============================================================================
// Guardarraíl — una sola regla de zona horaria (decisión del dueño, 2026-09-30)
// ============================================================================
// La zona es la de la SUCURSAL si la tiene; si no, la de la ORGANIZACIÓN;
// `America/Bogota` solo como fallback (`DEFAULT_TIMEZONE` de dateCore.ts).
//
//  1. No hay zona por persona: nada en src/ ni en las migraciones resuelve o
//     guarda una zona del usuario (columna en `profiles`, `user_timezone`,
//     `userTimezone`, `zonaUsuario`…). El dueño lo descartó expresamente.
//  2. `'America/Bogota'` escrito a mano fuera del fallback: TRINQUETE. Los
//     archivos que ya lo tenían el 2026-09-30 quedan en una lista congelada
//     (deuda: catálogos de zonas, valores por defecto de formularios, textos
//     de prompts, fallbacks locales); ningún archivo NUEVO puede escribirlo.
//     La lista solo se achica: si un archivo deja de contenerlo, este test
//     exige quitarlo de la lista. Para usar el fallback se importa
//     `DEFAULT_TIMEZONE`; para una zona real, `useFormatDate` /
//     `useTimezoneFor` en cliente o `zonaHorariaEnServidor` en servidor.
// ============================================================================

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = join(__dirname, '..', '..', '..');
const SRC = join(RAIZ, 'src');
const MIGRACIONES = join(RAIZ, 'supabase', 'migrations');

function archivos(dir: string, out: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) {
      if (nombre === 'node_modules' || nombre === '__tests__' || nombre === '__fixtures__') continue;
      archivos(ruta, out);
    } else if (/\.(ts|tsx)$/.test(nombre) && !/\.test\.tsx?$/.test(nombre) && !nombre.endsWith('.d.ts')) {
      out.push(ruta);
    }
  }
  return out;
}

const FUENTES = [...archivos(SRC), ...archivos(join(RAIZ, 'supabase/functions/_shared/contacto'))].map((ruta) => ({
  ruta: relative(RAIZ, ruta).split('\\').join('/'),
  texto: readFileSync(ruta, 'utf8'),
}));

/** Tokens de una zona por persona. */
export const ZONA_POR_PERSONA = /\b(user_?time_?zone|zona_?(del_?)?usuario|zonaDelUsuario|zonaPersonal)\b/i;
/** `profiles` con una columna de zona (select o DDL). */
export const PROFILES_CON_ZONA_TS = /from\(\s*['"]profiles['"]\s*\)[^;]{0,400}?\btimezone\b/;
export const PROFILES_CON_ZONA_SQL = /alter\s+table\s+(if\s+exists\s+)?(public\.)?profiles\b[^;]*\btime_?zone\b/i;
/** El literal de la zona por defecto entre comillas. */
export const LITERAL_BOGOTA = /['"`]America\/Bogota['"`]/;

/**
 * Archivos que ya escribían el literal el 2026-09-30 (deuda congelada).
 * `src/lib/utils/dateCore.ts` es el hogar legítimo de DEFAULT_TIMEZONE.
 */
const PERMITIDOS_BOGOTA = new Set<string>([
  'src/lib/utils/dateCore.ts',
  'src/app/api/crm/whatsapp/settings/route.ts',
  'src/components/calendario/configuracion/types.ts',
  'src/components/configuracion/crm/WhatsAppTab.tsx',
  'src/components/crm/shared/MeetingDialog.tsx',
  'src/components/crm/timeline/utils.ts',
  'src/components/organization/branding/editor/GlobalSettingsPanel.tsx',
  'src/lib/ai/agent/systemPrompt.ts',
  'src/lib/context/OrganizationTimezoneContext.tsx',
  'src/lib/crm/importacionLeads/mapeo.ts',
  'src/lib/services/aiAssistantService.ts',
  'src/lib/services/crm/email/variables.ts',
  'src/lib/services/crm/email/variablesContext.ts',
  'src/lib/services/crm/meetingsService.ts',
  'src/lib/services/crm/renewalMilestones.ts',
  // Misma regla de +57 trasladada para compartirla con Edge; no añade un fallback.
  'supabase/functions/_shared/contacto/ley2300.ts',
  'src/lib/services/crm/voiceAgentService.ts',
  'src/lib/services/crm/whatsapp/allowedHours.ts',
  'src/lib/services/mobilePrintService.ts',
  'src/lib/services/openexchangerates.ts',
  'src/lib/services/organizationTimezoneService.ts',
  'src/lib/services/pmsSettingsService.ts',
  'src/lib/services/printJobsService.ts',
  'src/lib/services/timezoneResolver.ts',
  'src/lib/services/websitePageBuilderService.ts',
  'src/lib/utils/branchTimezoneCascade.ts',
  'src/lib/utils/paisNavegador.ts',
  'src/lib/utils/timezoneCatalog.ts',
  'src/test-utils/renderConIdioma.tsx',
]);

describe('1. No hay zona horaria por persona', () => {
  test('ningún archivo de src/ nombra una zona del usuario', () => {
    const culpables = FUENTES.filter((f) => ZONA_POR_PERSONA.test(f.texto)).map((f) => f.ruta);
    expect(culpables).toEqual([]);
  });

  test('ningún archivo lee o escribe una zona en profiles', () => {
    const culpables = FUENTES.filter((f) => PROFILES_CON_ZONA_TS.test(f.texto)).map((f) => f.ruta);
    expect(culpables).toEqual([]);
  });

  test('ninguna migración añade una zona a profiles', () => {
    const culpables = readdirSync(MIGRACIONES)
      .filter((f) => f.endsWith('.sql'))
      .filter((f) => PROFILES_CON_ZONA_SQL.test(readFileSync(join(MIGRACIONES, f), 'utf8')));
    expect(culpables).toEqual([]);
  });

  test('los detectores muerden (casos sintéticos)', () => {
    expect(ZONA_POR_PERSONA.test('const userTimezone = perfil.tz')).toBe(true);
    expect(ZONA_POR_PERSONA.test("select('user_timezone')")).toBe(true);
    expect(ZONA_POR_PERSONA.test('const zonaUsuario = x')).toBe(true);
    expect(ZONA_POR_PERSONA.test('const zona = useTimezoneFor()')).toBe(false);
    expect(PROFILES_CON_ZONA_TS.test("supabase.from('profiles').select('id, timezone')")).toBe(true);
    expect(PROFILES_CON_ZONA_TS.test("supabase.from('profiles').select('id, preferred_language')")).toBe(false);
    expect(PROFILES_CON_ZONA_SQL.test('alter table public.profiles add column if not exists timezone text;')).toBe(true);
    expect(PROFILES_CON_ZONA_SQL.test('alter table public.branches add column timezone text;')).toBe(false);
  });
});

describe('2. America/Bogota escrito a mano solo en el fallback (trinquete)', () => {
  test('ningún archivo nuevo escribe el literal', () => {
    const nuevos = FUENTES.filter((f) => LITERAL_BOGOTA.test(f.texto) && !PERMITIDOS_BOGOTA.has(f.ruta)).map((f) => f.ruta);
    // Si esto falla: importa DEFAULT_TIMEZONE (fallback) o resuelve la zona con
    // useFormatDate / useTimezoneFor / zonaHorariaEnServidor. No amplíes la lista.
    expect(nuevos).toEqual([]);
  });

  test('la lista solo se achica: cada permitido sigue conteniéndolo', () => {
    const porRuta = new Map(FUENTES.map((f) => [f.ruta, f.texto]));
    const sobrantes = [...PERMITIDOS_BOGOTA].filter((ruta) => {
      const texto = porRuta.get(ruta);
      return texto === undefined || !LITERAL_BOGOTA.test(texto);
    });
    expect(sobrantes).toEqual([]);
  });

  test('el fallback canónico sigue siendo DEFAULT_TIMEZONE en dateCore', () => {
    const core = FUENTES.find((f) => f.ruta === 'src/lib/utils/dateCore.ts');
    expect(core?.texto).toMatch(/export const DEFAULT_TIMEZONE = 'America\/Bogota';/);
  });

  test('el punto único de servidor no escribe la zona a mano', () => {
    const servidor = FUENTES.find((f) => f.ruta === 'src/lib/utils/zonaHorariaServidor.ts');
    expect(servidor?.texto).toContain("rpc('fn_timezone_for'");
    expect(servidor?.texto).not.toMatch(LITERAL_BOGOTA);
  });
});
