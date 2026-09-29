/**
 * Guardarraíl P9 (docs/design/MEMBRESIAS-FASE-1-2.md §11.1): el precio de una membresía es el
 * precio VIGENTE de su producto en `product_prices`. `membership_plans.price` solo sobrevive como
 * copia para la rama master y goadmin-websites (la mantiene la base) y se va a borrar; ningún
 * código de `src/` la lee ni la escribe.
 *
 * Falla si en `src/` (fuera de pruebas):
 *   1. un `select` embebido `membership_plans(...)` pide `price` o `*`;
 *   2. una consulta `.from('membership_plans')` selecciona `*`, `price` o nada (`.select()`),
 *      o escribe `price` en un insert/update/upsert;
 *   3. un archivo del dominio membresías lee `.price` de un plan (`plan.price`, `membership_plans?.price`).
 */
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(__dirname, '../../..');
const SRC = path.join(RAIZ, 'src');

function archivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : archivos(abs);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [abs] : [];
  });
}

/** Quita comentarios de bloque y de línea (la documentación puede nombrar la columna). */
function sinComentarios(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const rel = (abs: string) => path.relative(RAIZ, abs).split(path.sep).join('/');

const FUENTES = archivos(SRC).map((abs) => ({ ruta: rel(abs), codigo: sinComentarios(fs.readFileSync(abs, 'utf8')) }));

const PIDE_PRECIO = /(^|[\s,(])price($|[\s,)])/;
const PIDE_TODO = /(^|[\s,(])\*($|[\s,)])/;

/** Resuelve `select(CONSTANTE)` y `${CONSTANTE}` a su texto dentro del mismo archivo. */
function resolverSelect(arg: string, codigo: string): string {
  const constante = (nombre: string) => {
    const m = new RegExp(`const\\s+${nombre}\\s*=\\s*([\\s\\S]*?);`).exec(codigo);
    return m ? m[1].replace(/['"`+\n]/g, ' ') : '';
  };
  const limpio = arg.trim();
  if (/^[A-Z_][A-Z0-9_]*$/.test(limpio)) return constante(limpio);
  return limpio.replace(/\$\{\s*([A-Za-z_]\w*)\s*\}/g, (_, n: string) => constante(n));
}

/** Tramo de la cadena de llamadas que empieza en `.from('membership_plans')` (hasta el siguiente `.from(` o `;`). */
function cadenasDePlanes(codigo: string): string[] {
  const tramos: string[] = [];
  const re = /\.from\(\s*['"`]membership_plans['"`]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(codigo))) {
    const resto = codigo.slice(m.index + m[0].length);
    const fin = resto.search(/\.from\(|;/);
    tramos.push(resto.slice(0, fin === -1 ? 800 : fin));
  }
  return tramos;
}

describe('P9: nadie en src/ lee ni escribe membership_plans.price', () => {
  it('los select embebidos membership_plans(...) no piden price ni *', () => {
    const malos: string[] = [];
    for (const { ruta, codigo } of FUENTES) {
      const re = /membership_plans\s*(?:!\w+)?\s*\(([^()]*)\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(codigo))) {
        const columnas = m[1];
        // `membership_plans(` también aparece en llamadas como `x.membership_plans(...)`: solo cuenta
        // si parece una lista de columnas.
        if (!/^[\s\w,*:!.]*$/.test(columnas)) continue;
        if (PIDE_PRECIO.test(columnas) || PIDE_TODO.test(columnas)) malos.push(`${ruta}: membership_plans(${columnas.trim()})`);
      }
    }
    expect(malos).toEqual([]);
  });

  it('.from(membership_plans) selecciona columnas explícitas sin price y no escribe price', () => {
    const malos: string[] = [];
    for (const { ruta, codigo } of FUENTES) {
      for (const tramo of cadenasDePlanes(codigo)) {
        const sel = /\.select\(\s*(?:(['"`])([\s\S]*?)\1|([A-Z_][A-Z0-9_]*))?\s*[,)]/.exec(tramo);
        if (sel) {
          const texto = resolverSelect(sel[2] ?? sel[3] ?? '', codigo);
          if (texto.trim() === '') malos.push(`${ruta}: .select() sin columnas (equivale a *)`);
          else if (PIDE_PRECIO.test(texto) || PIDE_TODO.test(texto)) malos.push(`${ruta}: .select(${texto.trim().slice(0, 80)})`);
        }
        const escritura = /\.(insert|update|upsert)\(([\s\S]*?)\)\s*(\.|$)/.exec(tramo);
        if (escritura && /\bprice\s*:/.test(escritura[2])) malos.push(`${ruta}: .${escritura[1]} escribe price`);
      }
    }
    expect(malos).toEqual([]);
  });

  it('el dominio membresías no lee .price de un plan', () => {
    const DOMINIO = /(membresias|gym|membership)/i;
    const malos = FUENTES.filter(
      ({ ruta, codigo }) => (DOMINIO.test(ruta) || /membership_plans/.test(codigo)) &&
        /\b(plan\w*|membership_plans)\s*\??\.\s*price\b/i.test(codigo),
    ).map((f) => f.ruta);
    expect(malos).toEqual([]);
  });

  it('el guardarraíl detecta las formas viejas (autoprueba)', () => {
    expect(PIDE_PRECIO.test('name, price')).toBe(true);
    expect(PIDE_PRECIO.test('id, name, duration_days')).toBe(false);
    expect(PIDE_PRECIO.test('compare_price, price_list')).toBe(false);
    expect(PIDE_TODO.test('*, products(id)')).toBe(true);
    const viejo = "db.from('memberships').select('id, membership_plans(name, price)')";
    expect(/membership_plans\s*\(([^()]*)\)/.exec(viejo)?.[1]).toBe('name, price');
    const tramo = cadenasDePlanes("await supabase.from('membership_plans').select('*').eq('id', 1);")[0];
    expect(tramo).toContain(".select('*')");
    expect(resolverSelect('COLS', "const COLS = 'id, ' +\n  'price';")).toMatch(/price/);
  });
});

describe('P9: el precio de la base viene de product_prices', () => {
  it('la migración de fase 3 deja la columna como copia y quita price de fn_producto_guardar', () => {
    const sql = fs.readFileSync(
      path.join(RAIZ, 'supabase/migrations/20260929235000_membresias_f3_precio_plan_legado.sql'),
      'utf8',
    );
    expect(sql).toContain('fn_membresias_int_precio_vigente');
    expect(sql).toContain('trg_membresias_precio_legado');
    expect(sql).toContain('trg_membership_plans_precio_legado');
    expect(sql).not.toMatch(/drop\s+column/i);
    expect(fs.existsSync(path.join(RAIZ, 'supabase/rollbacks/20260929235000_membresias_f3_precio_plan_legado_rollback.sql'))).toBe(true);
  });
});
