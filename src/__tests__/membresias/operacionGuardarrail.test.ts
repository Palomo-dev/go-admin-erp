/**
 * Guardarraíl de la operación de Membresías: el código que escribe clases,
 * reservas y entradas no vuelve a usar valores que la base rechaza, la
 * búsqueda del check-in va por el servidor (customers.identification_number,
 * no la columna inexistente document_number) y las rutas viejas /app/gym ya
 * no tienen páginas.
 */
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(__dirname, '../../..');
const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), 'utf8');
const existe = (rel: string) => fs.existsSync(path.join(raiz, rel));

function archivos(dir: string): string[] {
  const abs = path.join(raiz, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) return archivos(rel);
    return /\.(ts|tsx)$/.test(e.name) ? [rel] : [];
  });
}

/** Quita comentarios para no confundir documentación con código. */
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CODIGO_OPERACION = [
  'src/lib/services/gymService.ts',
  'src/lib/services/gymCheckinService.ts',
  'src/lib/services/gymDevicesService.ts',
  ...archivos('src/components/membresias/operacion'),
  'src/app/app/membresias/clases/page.tsx',
  'src/app/app/membresias/reservas/page.tsx',
  'src/app/app/membresias/check-in/page.tsx',
  'src/app/app/membresias/instructores/page.tsx',
  'src/app/app/membresias/control-de-acceso/page.tsx',
  'src/app/membresias-kiosco/[deviceId]/page.tsx',
];

describe('valores rechazados por las CHECK', () => {
  it.each(CODIGO_OPERACION)('%s no escribe scheduled, attended, card, biometric ni nfc', (rel) => {
    const s = sinComentarios(leer(rel));
    // Escrituras y filtros (`status: 'x'`, `.eq('status', 'x')`, uniones de tipo). La lectura
    // tolerante de valores viejos (`valor === 'attended'` en logica.ts) sí se permite.
    expect(s).not.toMatch(/status['"]?\s*[:,]\s*['"](scheduled|in_progress|attended)['"]/);
    expect(s).not.toMatch(/\|\s*['"](scheduled|in_progress|attended)['"]|['"](scheduled|in_progress|attended)['"]\s*\|/);
    expect(s).not.toMatch(/(method|metodo)['"]?\s*[:,=]\s*['"](card|biometric|nfc)['"]/);
    expect(s).not.toMatch(/\|\s*['"](card|biometric|nfc)['"]|['"](card|biometric|nfc)['"]\s*\|/);
    // Origen de reserva inventado por el duplicado anterior.
    expect(s).not.toMatch(/reservation_source:\s*['"]duplicate['"]/);
  });

  it('la asistencia se escribe como checked_in / no_show', () => {
    const s = sinComentarios(leer('src/lib/services/gymService.ts'));
    expect(s).toMatch(/status:\s*attended \? 'checked_in' : 'no_show'/);
    expect(s).toMatch(/status:\s*gymClass\.status \|\| 'active'/);
  });
});

describe('check-in', () => {
  it('busca y registra por la API del servidor', () => {
    const pagina = leer('src/app/app/membresias/check-in/page.tsx');
    expect(pagina).toContain('apiMembresias.buscarEntrada');
    expect(pagina).toContain('apiMembresias.registrarEntrada');
    expect(pagina).not.toMatch(/branch_id\s*\|\|\s*1/);
  });

  it('la búsqueda del servidor usa identification_number', () => {
    const servidor = leer('src/lib/services/membresias/membresias.server.ts');
    expect(servidor).toMatch(/identification_number/);
    for (const rel of CODIGO_OPERACION) {
      expect(sinComentarios(leer(rel))).not.toMatch(/document_number/);
    }
  });

  it('nadie inserta en member_checkins desde el navegador', () => {
    for (const rel of CODIGO_OPERACION) {
      expect(sinComentarios(leer(rel))).not.toMatch(/from\('member_checkins'\)\s*\.insert/);
    }
  });
});

describe('fechas', () => {
  it.each(CODIGO_OPERACION)('%s no deriva días con toISOString().split', (rel) => {
    const s = sinComentarios(leer(rel));
    expect(s).not.toMatch(/toISOString\(\)\.split\(/);
    expect(s).not.toMatch(/\.split\('T'\)\[0\]/);
  });
});

describe('rutas', () => {
  it('las páginas nuevas existen y las viejas se retiraron', () => {
    for (const r of ['clases', 'reservas', 'check-in', 'instructores', 'control-de-acceso']) {
      expect(existe(`src/app/app/membresias/${r}/page.tsx`)).toBe(true);
    }
    expect(existe('src/app/membresias-kiosco/[deviceId]/page.tsx')).toBe(true);
    expect(existe('src/app/app/gym')).toBe(false);
    expect(existe('src/app/gym-display')).toBe(false);
  });

  it('el alta de membresía sin cobro ya no existe', () => {
    expect(existe('src/components/gym/membresias/MembershipDialog.tsx')).toBe(false);
    expect(existe('src/components/gym/membresias/CustomerSelectorGym.tsx')).toBe(false);
  });

  it('ningún enlace interno del módulo apunta a /app/gym', () => {
    for (const rel of [...CODIGO_OPERACION, ...archivos('src/components/gym')]) {
      expect(sinComentarios(leer(rel))).not.toMatch(/['"`]\/app\/gym(\/|['"`?])/);
    }
  });
});
