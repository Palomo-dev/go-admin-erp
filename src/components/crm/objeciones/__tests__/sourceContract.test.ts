/// <reference types="jest" />
/**
 * F2 — contrato sobre el FUENTE de la zona de objeciones y discovery
 * (brief §5 y §7): ningún componente supera 300 líneas —medidas tras
 * formatear a 100 columnas, no con líneas de 327 caracteres—, los botones de
 * solo icono llevan `aria-label`, cada overlay devuelve el foco con
 * `useReturnFocus(…, fallback)`, sin `requestAnimationFrame`, el esqueleto
 * solo en la primera carga, y los muertos (`ObjecionesList`,
 * `DiscoveryWizard`) ya no existen.
 *
 * Regla (ronda 2, lección de Automatizaciones r4): un guardarraíl que se
 * rompe con un reformateo es peor que ninguno. La conducta se prueba
 * EJECUTADA donde hay modelo puro (`objectionModel.test.ts`,
 * `useReturnFocus.test.ts`, `objections.contract.test.ts`,
 * `objectionService.test.ts`); aquí queda solo el cableado, con lectores que
 * toleran llaves, saltos de línea, comillas dobles, variables intermedias y
 * orden de atributos o de clases. El último bloque demuestra que los diez
 * reformateos que dieron rojo falso en las rondas 1 y 2 son verdes y que una
 * mutación de sustancia con la misma forma sigue siendo roja.
 *
 * Ronda 3: `ui/command.tsx` (compartido por 7 consumidores) llevaba
 * `data-[disabled]:pointer-events-none`; con cmdk 1.1.1 los ítems habilitados
 * reciben `data-disabled="false"` y el selector casa con la PRESENCIA del
 * atributo: todo ítem del picker quedaba sin puntero y al 50 %. En jsdom no
 * hay layout, así que aquí se afirma sobre el fuente que las clases están
 * condicionadas a `=true`; el clic real por coordenadas lo hizo el arnés.
 */
import fs from 'fs';
import path from 'path';
// prettier/index.cjs usa import() dinámico (imposible en jest CJS): el standalone con sus plugins carga en CJS.
import * as prettier from 'prettier/standalone';
import * as prettierTs from 'prettier/plugins/typescript';
import * as prettierEstree from 'prettier/plugins/estree';

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));
const listTsx = (dir: string) =>
  fs.readdirSync(path.join(ROOT, dir)).filter((f) => /\.tsx?$/.test(f)).map((f) => `${dir}/${f}`);

const ZONE = [
  ...listTsx('src/components/crm/objeciones'),
  ...listTsx('src/components/crm/pipeline/drawer'),
  ...listTsx('src/components/crm/pipeline/drawer/tabs'),
  'src/components/crm/oportunidades/detail/DetailSidebar.tsx',
];

/** Archivos que F2 construyó o reescribió: los 300 se miden a 100 columnas. El resto del drawer es de F9. */
const F2_FILES = [
  ...listTsx('src/components/crm/objeciones'),
  'src/components/crm/pipeline/drawer/DiscoverySection.tsx',
  'src/components/crm/pipeline/drawer/FieldRenderer.tsx',
];

// ─── Lectores tolerantes ─────────────────────────────────────────────────────

/** Etiquetas JSX de apertura `<Name …>` completas, aunque los atributos lleven `=>`, llaves o saltos de línea. */
function openingTags(src: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${name}\\b`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 0;
    let quote: string | null = null;
    for (let i = m.index + m[0].length; i < src.length; i += 1) {
      const ch = src[i];
      if (quote) { if (ch === quote) quote = null; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth === 0) { out.push(src.slice(m.index, i + 1)); break; }
    }
  }
  return out;
}

/** Valor de un atributo JSX: `x="v"`, `x='v'` o `x={'v'}`/`x={"v"}`. `null` si no está o no es literal. */
function attrLiteral(tag: string, attr: string): string | null {
  const m = tag.match(new RegExp(`\\b${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*(?:"([^"]*)"|'([^']*)')\\s*\\})`));
  return m ? m[1] ?? m[2] ?? m[3] ?? m[4] ?? null : null;
}
/** Expresión cruda de un atributo `x={…}` (llaves balanceadas) o su literal. `null` si no está. */
function attrExpr(tag: string, attr: string): string | null {
  const lit = attrLiteral(tag, attr);
  if (lit !== null) return lit;
  const m = tag.match(new RegExp(`\\b${attr}\\s*=\\s*\\{`));
  if (!m || m.index === undefined) return null;
  let depth = 0;
  for (let i = m.index + m[0].length - 1; i < tag.length; i += 1) {
    if (tag[i] === '{') depth += 1;
    else if (tag[i] === '}') { depth -= 1; if (depth === 0) return tag.slice(m.index + m[0].length, i).trim(); }
  }
  return null;
}
const hasAttr = (tag: string, attr: string) => new RegExp(`\\b${attr}\\s*=`).test(tag);

/** Argumentos de nivel superior de cada llamada `fn(…)`, con paréntesis y llaves balanceados. */
function callArgs(src: string, fn: string): string[][] {
  const calls: string[][] = [];
  const re = new RegExp(`\\b${fn}\\s*\\(`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const args: string[] = [];
    let depth = 0;
    let cur = '';
    for (let i = m.index + m[0].length; i < src.length; i += 1) {
      const ch = src[i];
      if (ch === '(' || ch === '{' || ch === '[') depth += 1;
      if (ch === ')' || ch === '}' || ch === ']') {
        if (depth === 0) { if (cur.trim()) args.push(cur.trim()); break; }
        depth -= 1;
      }
      if (ch === ',' && depth === 0) { args.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    calls.push(args);
  }
  return calls;
}

/** El objeto literal `{ … }` que contiene `key: 'x'`, sin importar en cuántas líneas esté. */
function navEntry(src: string, key: string): string | null {
  return src.match(new RegExp(`\\{[^{}]*\\bkey:\\s*['"]${key}['"][^{}]*\\}`))?.[0] ?? null;
}
const navProp = (entry: string, prop: string) => entry.match(new RegExp(`\\b${prop}:\\s*([^,}\\n]+)`))?.[1].trim() ?? null;
/** `'x'`, `"x"` o `x` → `x`. */
const unquote = (v: string | null) => (v === null ? null : v.replace(/^(['"])(.*)\1$/, '$2'));

/** Todas las listas de clases del fuente (cada literal de cadena partido por espacios). */
function classLists(src: string): string[][] {
  const out: string[][] = [];
  const re = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[2].split(/\s+/).filter(Boolean));
  return out;
}

// ─── Guardarraíles (constantes para que el bloque de reformateos los reutilice) ──
/** `if (!loadedOnce.current) setLoading(true)`, con o sin llaves, o con la negación en una variable intermedia. */
const SKELETON_FIRST_LOAD = (src: string) => {
  const names = ['!\\s*loadedOnce\\.current'];
  const alias = /\bconst\s+(\w+)\s*=\s*!\s*loadedOnce\.current\b/g;
  let m: RegExpExecArray | null;
  while ((m = alias.exec(src))) names.push(`\\b${m[1]}\\b`);
  return new RegExp(`if\\s*\\(\\s*(?:${names.join('|')})\\s*\\)\\s*\\{?\\s*setLoading\\s*\\(\\s*true\\s*\\)`).test(src);
};
const RAF = /requestAnimationFrame\s*\(/;
const ISO_SPLIT = /toISOString\(\)\.split/;
const STAGGER_IMPORT = /\bStaggerList\b[^;]*from\s*['"]@\/components\/shared\/motion['"]/;
const REDUCED_MOTION = (src: string) => openingTags(src, 'MotionConfig').some((t) => attrLiteral(t, 'reducedMotion') === 'user');
const PROGRESSBAR = (src: string) => openingTags(src, 'div').some((t) => attrLiteral(t, 'role') === 'progressbar' && hasAttr(t, 'aria-valuenow'));
const ICON_BUTTONS_UNLABELLED = (src: string) => openingTags(src, 'Button').filter((t) => attrLiteral(t, 'size') === 'icon' && !hasAttr(t, 'aria-label'));
const RETURN_FOCUS_WITH_FALLBACK = (src: string) => {
  const calls = callArgs(src, 'useReturnFocus');
  return calls.length > 0 && calls.every((args) => args.length === 2);
};
const NAV_ENABLED = (src: string) => {
  const e = navEntry(src, 'objeciones');
  return !!e && unquote(navProp(e, 'href')) === '/app/crm/objeciones' && navProp(e, 'enabled') === 'true';
};
/** Alguna lista de clases contiene TODAS las pedidas, en cualquier orden. */
const CLASSES_TOGETHER = (src: string, ...wanted: string[]) => classLists(src).some((list) => wanted.every((w) => list.includes(w)));
/** `ui/command.tsx`: las clases de deshabilitado condicionadas a `=true` (cmdk 1.1.1 pone `data-disabled="false"` en los habilitados). */
const COMMAND_ITEM_DISABLED_ONLY_WHEN_TRUE = (src: string) =>
  CLASSES_TOGETHER(src, 'data-[disabled=true]:pointer-events-none', 'data-[disabled=true]:opacity-50') && !/data-\[disabled\]:/.test(src);
/** Chips de categoría: radios reales (una elección obligatoria), no botones con `aria-pressed`. */
const CATEGORY_CHIPS_ARE_RADIOS = (src: string) => {
  const inputs = openingTags(src, 'input');
  const names = new Set(inputs.map((t) => attrLiteral(t, 'name')));
  return (
    inputs.length > 0 &&
    inputs.every((t) => attrLiteral(t, 'type') === 'radio' && hasAttr(t, 'checked') && hasAttr(t, 'onChange')) &&
    names.size === 1 && !names.has(null) &&
    openingTags(src, 'label').every((t) => hasAttr(t, 'htmlFor')) &&
    /<fieldset\b/.test(src) && /<legend\b/.test(src) &&
    !/aria-pressed\s*=/.test(src)
  );
};
/** Cada control del discovery describe su pista: `aria-describedby={X}` y existe `<p id={X}>`. */
const FIELD_CONTROLS_DESCRIBED = (src: string) => {
  const hints = new Set(openingTags(src, 'p').map((t) => attrExpr(t, 'id')).filter((v): v is string => v !== null));
  const controls = [...openingTags(src, 'Input'), ...openingTags(src, 'Textarea'), ...openingTags(src, 'select')];
  return controls.length >= 3 && controls.every((t) => {
    const ref = attrExpr(t, 'aria-describedby');
    return ref !== null && hints.has(ref) && hasAttr(t, 'aria-required');
  });
};

/** Líneas del archivo tras formatearlo a 100 columnas (prettier, parser de TypeScript). */
async function linesAt100(rel: string): Promise<number> {
  const out = await prettier.format(read(rel), { parser: 'typescript', plugins: [prettierTs, prettierEstree], printWidth: 100 });
  return out.replace(/\n$/, '').split('\n').length;
}

describe('límites duros (brief §5)', () => {
  it.each(ZONE)('%s tiene ≤ 300 líneas', (file) => {
    expect(read(file).split('\n').length).toBeLessThanOrEqual(300);
  });

  it.each(F2_FILES)('%s tiene ≤ 300 líneas formateado a 100 columnas (no vale apilar 327 caracteres por línea)', async (file) => {
    expect(await linesAt100(file)).toBeLessThanOrEqual(300);
  });

  it('el editor y el discovery delegan en CategoryChips y FieldRenderer (extraídos en la ronda 3)', () => {
    expect(exists('src/components/crm/objeciones/CategoryChips.tsx')).toBe(true);
    expect(exists('src/components/crm/pipeline/drawer/FieldRenderer.tsx')).toBe(true);
    const sheet = read('src/components/crm/objeciones/ObjectionEditorSheet.tsx');
    expect(sheet).toMatch(/from\s*['"]\.\/CategoryChips['"]/);
    expect(openingTags(sheet, 'CategoryChips')).toHaveLength(1);
    expect(openingTags(sheet, 'input')).toEqual([]);
    const discovery = read('src/components/crm/pipeline/drawer/DiscoverySection.tsx');
    expect(discovery).toMatch(/from\s*['"]\.\/FieldRenderer['"]/);
    expect(openingTags(discovery, 'FieldRenderer').length).toBeGreaterThan(0);
    expect(discovery).not.toMatch(/function\s+FieldRenderer\b/);
  });

  it('los componentes muertos se borraron', () => {
    expect(exists('src/components/crm/objeciones/ObjecionesList.tsx')).toBe(false);
    expect(exists('src/components/crm/discovery/DiscoveryWizard.tsx')).toBe(false);
    expect(exists('src/components/crm/discovery')).toBe(false);
  });

  it('existe la página /app/crm/objeciones y el menú la habilita', () => {
    expect(exists('src/app/app/crm/objeciones/page.tsx')).toBe(true);
    expect(NAV_ENABLED(read('src/config/crmNav.ts'))).toBe(true);
  });

  it('el fuente no usa toISOString().split para derivar un día', () => {
    for (const file of ZONE) expect({ file, bad: ISO_SPLIT.test(read(file)) }).toEqual({ file, bad: false });
  });
});

describe('accesibilidad (brief §4)', () => {
  const zone = listTsx('src/components/crm/objeciones');

  it.each(zone)('%s: todo botón size="icon" lleva aria-label', (file) => {
    expect(ICON_BUTTONS_UNLABELLED(read(file))).toEqual([]);
  });

  it('cada Sheet/Dialog/ConfirmDialog de la zona devuelve el foco con useReturnFocus y fallback', () => {
    const overlays = zone.filter((f) => /<(Sheet|Dialog|ConfirmDialog|CommandDialog)\b/.test(read(f)));
    expect(overlays.length).toBeGreaterThan(0);
    for (const file of overlays) {
      const src = read(file);
      expect({ file, ok: RETURN_FOCUS_WITH_FALLBACK(src) }).toEqual({ file, ok: true });
      expect(src).toMatch(/onCloseAutoFocus\s*=/);
    }
  });

  it('nada de requestAnimationFrame para mover el foco', () => {
    for (const file of ZONE) expect({ file, raf: RAF.test(read(file)) }).toEqual({ file, raf: false });
  });

  it('la página respeta prefers-reduced-motion y usa las primitivas compartidas', () => {
    const page = read('src/components/crm/objeciones/ObjecionesPage.tsx');
    // F15 (2026-09-21): un solo `MotionConfig reducedMotion="user"` en el provider compartido
    // (montado en src/app/app/layout.tsx); la página no lo anida.
    expect(REDUCED_MOTION(read('src/components/shared/motion/MotionProvider.tsx'))).toBe(true);
    expect(openingTags(page, 'MotionConfig')).toEqual([]);
    expect(page).toMatch(STAGGER_IMPORT);
    expect(exists('src/components/crm/objeciones/motion.tsx')).toBe(false);
  });

  it('el esqueleto solo se muestra en la primera carga (recargas sin desmontar la lista)', () => {
    for (const hook of ['src/components/crm/objeciones/useObjections.ts', 'src/components/crm/objeciones/useOpportunityObjections.ts']) {
      expect({ hook, ok: SKELETON_FIRST_LOAD(read(hook)) }).toEqual({ hook, ok: true });
    }
  });

  it('el discovery del drawer expone el progreso como progressbar accesible con pista ≥ 3:1 en oscuro', () => {
    const src = read('src/components/crm/pipeline/drawer/DiscoverySection.tsx');
    expect(PROGRESSBAR(src)).toBe(true);
    expect(src).toMatch(/discoveryProgress\s*\(/);
    // Contraste no-texto (WCAG 1.4.11, paleta hex de Tailwind 3): blue-600 sobre gray-700 daba 1,99:1 y
    // sobre gray-800 solo 2,84:1; con pista gray-800 y relleno 500 en oscuro: azul 3,99:1, esmeralda 5,79:1.
    const track = openingTags(src, 'div').find((t) => attrLiteral(t, 'role') === 'progressbar') ?? '';
    expect(track).toMatch(/dark:bg-gray-800/);
    expect(track).not.toMatch(/dark:bg-gray-700/);
    expect(CLASSES_TOGETHER(src, 'bg-blue-600', 'dark:bg-blue-500')).toBe(true);
    expect(CLASSES_TOGETHER(src, 'bg-emerald-600', 'dark:bg-emerald-500')).toBe(true);
  });

  it('cada campo del discovery lleva <Label htmlFor>, aria-required y una pista enlazada por aria-describedby', () => {
    const src = read('src/components/crm/pipeline/drawer/FieldRenderer.tsx');
    expect(FIELD_CONTROLS_DESCRIBED(src)).toBe(true);
    expect(openingTags(src, 'Label').every((t) => hasAttr(t, 'htmlFor'))).toBe(true);
    expect(openingTags(src, 'Label').length).toBeGreaterThan(0);
  });

  it('las categorías del editor son un grupo de radios con leyenda (una elección obligatoria), no botones aria-pressed', () => {
    expect(CATEGORY_CHIPS_ARE_RADIOS(read('src/components/crm/objeciones/CategoryChips.tsx'))).toBe(true);
  });

  it('«Marcar resuelta» no deja el foco en el body: el bloque decide con focusAfterResolve (probado ejecutado) y el ítem es enfocable', () => {
    const block = read('src/components/crm/objeciones/OpportunityObjectionsBlock.tsx');
    expect(callArgs(block, 'focusAfterResolve').some((args) => args.length === 4)).toBe(true);
    const items = openingTags(block, 'li').filter((t) => hasAttr(t, 'tabIndex') && hasAttr(t, 'id'));
    expect(items.length).toBeGreaterThan(0);
  });

  it('la vista previa del picker no lleva aria-live (cmdk ya anuncia la opción) y la nota opcional tiene su <Label>', () => {
    const picker = read('src/components/crm/objeciones/RegisterObjectionDialog.tsx');
    expect(openingTags(picker, 'div').filter((t) => attrLiteral(t, 'aria-live') === 'polite')).toEqual([]);
    expect(openingTags(picker, 'Label').some((t) => hasAttr(t, 'htmlFor'))).toBe(true);
    expect(picker).toContain('Nota (opcional)');
    // La nota viaja: el picker llama onPick con dos argumentos y el bloque pasa ambos a register (la ruta la prueba ejecutada).
    expect(callArgs(picker, 'onPick').some((args) => args.length === 2)).toBe(true);
    const block = read('src/components/crm/objeciones/OpportunityObjectionsBlock.tsx');
    expect(callArgs(block, 'register').some((args) => args.length === 2)).toBe(true);
  });

  it('el picker se puede usar con el ratón: ui/command.tsx solo apaga el puntero y atenúa con data-disabled="true"', () => {
    // cmdk 1.1.1 escribe `data-disabled="false"` en los ítems habilitados; `data-[disabled]:` casa con la presencia
    // del atributo y dejaba TODO ítem con pointer-events:none y opacidad 50 % (ronda 2: un clic real no registraba).
    const src = read('src/components/ui/command.tsx');
    expect(COMMAND_ITEM_DISABLED_ONLY_WHEN_TRUE(src)).toBe(true);
    const item = openingTags(src, 'CommandPrimitive.Item')[0] ?? '';
    expect(item).toMatch(/data-\[disabled=true\]:pointer-events-none/);
    expect(item).toMatch(/data-\[disabled=true\]:opacity-50/);
  });

  it('las tarjetas no llevan transition-colors global (fundido al cambiar de tema); solo en hover', () => {
    for (const file of ['src/components/crm/objeciones/ObjectionCard.tsx', 'src/components/crm/objeciones/OpportunityObjectionsBlock.tsx']) {
      expect({ file, bad: /(?<![:\w-])transition-colors/.test(read(file)) }).toEqual({ file, bad: false });
    }
  });
});

describe('los guardarraíles toleran reformateos inocuos y siguen matando mutaciones de sustancia', () => {
  // Los siete reformateos de la ronda 1 y los tres de la ronda 2 → verdes.
  const GREEN = {
    ifConLlaves: 'if (!loadedOnce.current) {\n  setLoading(true);\n}',
    variableIntermedia: 'const fallback = () => registerButtonRef.current;\nconst onCloseAutoFocus = useReturnFocus(open, fallback);',
    motionConfigDosLineas: '<MotionConfig\n  reducedMotion="user"\n>',
    navMultilinea: "{\n  key: 'objeciones',\n  name: 'Objeciones',\n  href: '/app/crm/objeciones',\n  icon: X,\n  enabled: true,\n}",
    onClickAntesDeAriaLabel: '<Button onClick={() => onDelete(o)} size="icon" aria-label="Eliminar">',
    roleEntreLlaves: "<div role={'progressbar'} aria-valuenow={p} />",
    espaciosEnLaLlamada: 'useReturnFocus( deleteTarget !== null , () => newButtonRef.current )',
    // Ronda 2 (rojos falsos del tester):
    navComillasDobles: '{\n  key: "objeciones",\n  name: "Objeciones",\n  href: "/app/crm/objeciones",\n  icon: X,\n  enabled: true,\n}',
    skeletonVariableIntermedia: 'const first = !loadedOnce.current;\nif (first) {\n  setLoading(true);\n}',
    clasesEnOtroOrden: '<div className="dark:bg-blue-500 h-full bg-blue-600" />',
    commandItemMultilinea: '"relative flex\n data-[disabled=true]:opacity-50\n data-[disabled=true]:pointer-events-none"',
  };
  // Mutaciones de sustancia con la MISMA forma → rojas.
  const RED = {
    ifConLlaves: 'if (!loadedOnce.current) {\n  setLoading(false);\n}',
    ifSinCondicion: 'setLoading(true);',
    sinFallback: 'const onCloseAutoFocus = useReturnFocus(open);',
    reducedMotionAlways: '<MotionConfig\n  reducedMotion="always"\n>',
    navDeshabilitada: "{\n  key: 'objeciones',\n  name: 'Objeciones',\n  href: '/app/crm/objeciones',\n  icon: X,\n  enabled: false,\n}",
    iconoSinLabel: '<Button onClick={() => onDelete(o)} size="icon" title="Eliminar">',
    roleStatus: "<div role={'status'} aria-valuenow={p} />",
    rafConEspacio: 'window.requestAnimationFrame ( () => el.focus() )',
    // Ronda 2:
    navComillasDoblesOtraRuta: '{\n  key: "objeciones",\n  name: "Objeciones",\n  href: "/app/crm/objeciones-v2",\n  icon: X,\n  enabled: true,\n}',
    skeletonVariableSinNegar: 'const first = loadedOnce.current;\nif (first) {\n  setLoading(true);\n}',
    skeletonVariableFalse: 'const first = !loadedOnce.current;\nif (first) {\n  setLoading(false);\n}',
    claseOscuraMasClara: '<div className="dark:bg-blue-400 h-full bg-blue-600" />',
    commandItemSinCondicion: '"relative flex data-[disabled]:pointer-events-none data-[disabled]:opacity-50"',
    commandItemMezclado: '"relative flex data-[disabled=true]:opacity-50 data-[disabled]:pointer-events-none"',
    chipsSinChecked: '<fieldset><legend>Categoría</legend><input id={id} type="radio" name="c" value={v} onChange={f} /><label htmlFor={id}>x</label></fieldset>',
    chipsCheckbox: '<fieldset><legend>Categoría</legend><input id={id} type="checkbox" name="c" checked={on} onChange={f} /><label htmlFor={id}>x</label></fieldset>',
    chipsAriaPressed: '<fieldset><legend>Categoría</legend><input id={id} type="radio" name="c" checked={on} aria-pressed={on} onChange={f} /><label htmlFor={id}>x</label></fieldset>',
    // Ronda 3: el lector decía `/aria-presseds*=/` (una `s` literal): `aria-pressed = {on}` con espacios pasaba.
    chipsAriaPressedConEspacios: '<fieldset><legend>Categoría</legend><input id={id} type="radio" name="c" checked={on} aria-pressed = {on} onChange={f} /><label htmlFor={id}>x</label></fieldset>',
    fieldSinDescribedby: '<p id={hintId} /><Input id={id} aria-required={r} /><Textarea id={id} aria-describedby={hintId} aria-required={r} /><select id={id} aria-describedby={hintId} aria-required={r} />',
    fieldPistaHuerfana: '<p id={otro} /><Input id={id} aria-describedby={hintId} aria-required={r} /><Textarea id={id} aria-describedby={hintId} aria-required={r} /><select id={id} aria-describedby={hintId} aria-required={r} />',
  };
  const GREEN_CHIPS = '<fieldset><legend>Categoría</legend>{list.map((c) => <div><input\n  id={id}\n  type="radio"\n  name="objection-category"\n  checked={on}\n  onChange={() => pick(c)}\n/><label htmlFor={id}>{c.label}</label></div>)}</fieldset>';
  const GREEN_FIELDS = '<p id={hintId} className="sr-only">{hint}</p>\n<Input id={id} aria-required={field.required || undefined} aria-describedby={hintId} />\n<Textarea aria-describedby={ hintId } aria-required={r} id={id} />\n<select aria-required={r} id={id} aria-describedby={hintId}></select>';

  test('verdes: los diez reformateos', () => {
    expect(SKELETON_FIRST_LOAD(GREEN.ifConLlaves)).toBe(true);
    expect(RETURN_FOCUS_WITH_FALLBACK(GREEN.variableIntermedia)).toBe(true);
    expect(REDUCED_MOTION(GREEN.motionConfigDosLineas)).toBe(true);
    expect(NAV_ENABLED(GREEN.navMultilinea)).toBe(true);
    expect(ICON_BUTTONS_UNLABELLED(GREEN.onClickAntesDeAriaLabel)).toEqual([]);
    expect(PROGRESSBAR(GREEN.roleEntreLlaves)).toBe(true);
    expect(RETURN_FOCUS_WITH_FALLBACK(GREEN.espaciosEnLaLlamada)).toBe(true);
    expect(NAV_ENABLED(GREEN.navComillasDobles)).toBe(true);
    expect(SKELETON_FIRST_LOAD(GREEN.skeletonVariableIntermedia)).toBe(true);
    expect(CLASSES_TOGETHER(GREEN.clasesEnOtroOrden, 'bg-blue-600', 'dark:bg-blue-500')).toBe(true);
    expect(COMMAND_ITEM_DISABLED_ONLY_WHEN_TRUE(GREEN.commandItemMultilinea)).toBe(true);
    expect(CATEGORY_CHIPS_ARE_RADIOS(GREEN_CHIPS)).toBe(true);
    expect(FIELD_CONTROLS_DESCRIBED(GREEN_FIELDS)).toBe(true);
  });

  test('rojos: la misma forma con la sustancia cambiada', () => {
    expect(SKELETON_FIRST_LOAD(RED.ifConLlaves)).toBe(false);
    expect(SKELETON_FIRST_LOAD(RED.ifSinCondicion)).toBe(false);
    expect(RETURN_FOCUS_WITH_FALLBACK(RED.sinFallback)).toBe(false);
    expect(REDUCED_MOTION(RED.reducedMotionAlways)).toBe(false);
    expect(NAV_ENABLED(RED.navDeshabilitada)).toBe(false);
    expect(ICON_BUTTONS_UNLABELLED(RED.iconoSinLabel)).toHaveLength(1);
    expect(PROGRESSBAR(RED.roleStatus)).toBe(false);
    expect(RAF.test(RED.rafConEspacio)).toBe(true);
    expect(NAV_ENABLED(RED.navComillasDoblesOtraRuta)).toBe(false);
    expect(SKELETON_FIRST_LOAD(RED.skeletonVariableSinNegar)).toBe(false);
    expect(SKELETON_FIRST_LOAD(RED.skeletonVariableFalse)).toBe(false);
    expect(CLASSES_TOGETHER(RED.claseOscuraMasClara, 'bg-blue-600', 'dark:bg-blue-500')).toBe(false);
    expect(COMMAND_ITEM_DISABLED_ONLY_WHEN_TRUE(RED.commandItemSinCondicion)).toBe(false);
    expect(COMMAND_ITEM_DISABLED_ONLY_WHEN_TRUE(RED.commandItemMezclado)).toBe(false);
    expect(CATEGORY_CHIPS_ARE_RADIOS(RED.chipsSinChecked)).toBe(false);
    expect(CATEGORY_CHIPS_ARE_RADIOS(RED.chipsCheckbox)).toBe(false);
    expect(CATEGORY_CHIPS_ARE_RADIOS(RED.chipsAriaPressed)).toBe(false);
    expect(CATEGORY_CHIPS_ARE_RADIOS(RED.chipsAriaPressedConEspacios)).toBe(false);
    expect(FIELD_CONTROLS_DESCRIBED(RED.fieldSinDescribedby)).toBe(false);
    expect(FIELD_CONTROLS_DESCRIBED(RED.fieldPistaHuerfana)).toBe(false);
  });
});
