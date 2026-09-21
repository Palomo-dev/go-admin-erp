/// <reference types="jest" />
/**
 * F15 — sistema único de motion. Guardarraíles estáticos sobre el fuente
 * (jest corre en `node`, sin jsdom: aquí no se renderiza nada).
 *
 * 1. Toda primitiva compartida que anime (`motion.*`) llama a
 *    `useReducedMotion`: la deuda «FadeIn no respeta reduced-motion» no vuelve.
 * 2. Los números de duración/easing/muelle viven solo en `tokens.ts`.
 * 3. Hay UN solo `MotionConfig` en la app (`MotionProvider`), montado en
 *    `src/app/app/layout.tsx`; ninguna página lo duplica.
 * 4. `automatizaciones/motion.tsx` desapareció: `Chip`/`Expand` son compartidos.
 * 5. Los componentes del CRM que solo necesitaban `AnimatePresence`,
 *    `MotionConfig` o `useReducedMotion` los toman del índice compartido;
 *    `motion/react` directo queda para casos complejos (Reorder, `motion.*`).
 * 6. Los duplicados muertos (`src/lib/motion`, `usePlatform`) no existen.
 */
import fs from 'fs';
import path from 'path';
import { AUDIO_LOOP, DURATION, OFFSET, SCALE, SPRING, STAGGER } from '../tokens';

const ROOT = process.cwd();
const MOTION_DIR = path.join(ROOT, 'src/components/shared/motion');
const read = (abs: string) => fs.readFileSync(abs, 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      walk(abs, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(abs);
    }
  }
  return out;
}

const primitiveFiles = fs
  .readdirSync(MOTION_DIR)
  .filter((f) => f.endsWith('.tsx') && f !== 'MotionProvider.tsx')
  .map((f) => path.join(MOTION_DIR, f));

describe('1. primitivas compartidas y prefers-reduced-motion', () => {
  it('hay primitivas que animan', () => {
    expect(primitiveFiles.length).toBeGreaterThan(0);
  });

  /** Cada componente (trozo entre declaraciones de nivel superior) que renderiza `<motion.`/`<Component` llama al hook. */
  for (const file of primitiveFiles) {
    const chunks = read(file).split(/\n(?=(?:export )?(?:const|function) [A-Za-z])/);
    const renderers = chunks.filter((c) => /<motion\.|<Component\b/.test(c));
    it(`${path.basename(file)}: ${renderers.length} componentes que animan, todos con useReducedMotion`, () => {
      expect(renderers.length).toBeGreaterThan(0);
      for (const chunk of renderers) expect(chunk).toMatch(/useReducedMotion\(\)/);
    });
  }
});

describe('1b. StaggerItem hereda las etiquetas de StaggerList', () => {
  it('sin initial/animate/exit como etiqueta: una etiqueta lo saca de la orquestación y staggerChildren no le llega (tester F15)', () => {
    const item = read(path.join(MOTION_DIR, 'staggerList.tsx')).split('export const StaggerItem')[1];
    expect(item).not.toMatch(/\b(initial|animate|exit)="/);
    expect(item).toMatch(/exit=\{/);
  });
});

describe('1c. contrato de las primitivas de entrada (tester F15)', () => {
  const src = read(path.join(MOTION_DIR, 'primitives.tsx'));
  it('bajo reduced-motion las variantes no llevan x/y/scale (nada se desplaza ni escala)', () => {
    for (const file of primitiveFiles) {
      const reducedBlocks = read(file).match(/const reduced\w*(?:Variants|Exit): \w+ = \{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\};/g) ?? [];
      if (/reducedVariants|reducedItem/.test(read(file))) expect(reducedBlocks.length).toBeGreaterThan(0);
      for (const block of reducedBlocks) expect(block).not.toMatch(/\b(x|y|scale|height):/);
    }
  });
  it('toda prop `layout` de una primitiva se apaga con reduced-motion (layout={!reduced} / layout={reduced ? false : …})', () => {
    for (const file of primitiveFiles) {
      // Solo el atributo JSX (`layout` o `layout={…}`), no el parámetro `layout = true` ni el tipo `layout?:`.
      for (const m of read(file).matchAll(/\blayout(?:=\{([^}]*)\})?(?!\s*[=?:])(?=[\s/>])/g)) expect(m[1] ?? '').toMatch(/reduced/);
    }
  });
  it('el `transition` del consumidor (p. ej. delay) manda sobre la entrada por defecto', () => {
    expect(src).toMatch(/transition \?\? enterTransition/);
  });
});

describe('2. tokens: los números viven en tokens.ts', () => {
  it('duraciones dentro del brief (150–300 ms) o cero', () => {
    for (const [name, value] of Object.entries(DURATION)) {
      if (name === 'none') expect(value).toBe(0);
      else expect(value).toBeGreaterThanOrEqual(0.15);
      expect(value).toBeLessThanOrEqual(0.3);
    }
    expect(SPRING.type).toBe('spring');
    expect(STAGGER.children).toBeLessThan(DURATION.fast);
  });

  it('desplazamientos de 1–24 px, escalas en [0.9, 1) y bucles > 0: nada «vuela» (tester F15)', () => {
    for (const v of Object.values(OFFSET)) { expect(v).toBeGreaterThan(0); expect(v).toBeLessThanOrEqual(24); }
    for (const v of Object.values(SCALE)) { expect(v).toBeGreaterThanOrEqual(0.9); expect(v).toBeLessThan(1); }
    for (const v of Object.values(AUDIO_LOOP)) expect(v).toBeGreaterThan(0);
  });

  for (const file of primitiveFiles.concat(path.join(MOTION_DIR, 'MotionProvider.tsx'))) {
    const src = read(file);
    it(`${path.basename(file)} no lleva duraciones ni muelles literales`, () => {
      expect(src).not.toMatch(/\b(duration|delay):[^,}\n]*\d/); // también dentro de ternarios
      expect(src).not.toMatch(/stiffness:\s*[0-9]+/);
      expect(src).not.toMatch(/staggerChildren:\s*[0-9.]+/);
      expect(src).not.toMatch(/ease:\s*'/);
    });
  }
});

describe('3. un solo MotionConfig, montado en el layout de /app', () => {
  const appFiles = walk(path.join(ROOT, 'src/app')).concat(walk(path.join(ROOT, 'src/components')));
  const withConfig = appFiles.filter((f) => /<MotionConfig\b/.test(read(f)));

  it('el único <MotionConfig> es el de shared/motion/MotionProvider.tsx', () => {
    expect(withConfig.map((f) => path.relative(ROOT, f).replace(/\\/g, '/'))).toEqual([
      'src/components/shared/motion/MotionProvider.tsx',
    ]);
  });

  it('MotionProvider respeta la preferencia del sistema y usa el muelle de tokens', () => {
    const src = read(path.join(MOTION_DIR, 'MotionProvider.tsx'));
    expect(src).toMatch(/<MotionConfig reducedMotion="user" transition=\{SPRING\}>/);
  });

  it('src/app/app/layout.tsx monta MotionProvider desde el índice compartido', () => {
    const layout = read(path.join(ROOT, 'src/app/app/layout.tsx'));
    expect(layout).toMatch(/import \{ MotionProvider \} from '@\/components\/shared\/motion'/);
    expect(layout).toMatch(/<MotionProvider>/);
  });

  it('el antiguo src/components/shared/MotionProvider.tsx ya no existe', () => {
    expect(exists('src/components/shared/MotionProvider.tsx')).toBe(false);
  });
});

describe('4. y 5. consumidores del CRM', () => {
  const crmFiles = walk(path.join(ROOT, 'src/components/crm')).concat(walk(path.join(ROOT, 'src/components/voice')));

  it('automatizaciones/motion.tsx no existe y nadie importa ./motion', () => {
    expect(exists('src/components/crm/automatizaciones/motion.tsx')).toBe(false);
    for (const f of crmFiles) expect(read(f)).not.toMatch(/from '\.\/motion'/);
  });

  it("`motion/react` directo solo donde hay motion.*, Reorder o controles de arrastre", () => {
    const offenders: string[] = [];
    for (const f of crmFiles) {
      const src = read(f);
      const m = src.match(/import \{([^}]+)\} from ['"]motion\/react['"]/);
      if (!m) continue;
      const names = m[1].split(',').map((s) => s.trim().replace(/^type\s+/, ''));
      const complex = names.some((n) => ['motion', 'Reorder', 'useDragControls', 'useMotionValue', 'useSpring', 'useTransform', 'useAnimate', 'LayoutGroup'].includes(n));
      if (!complex) offenders.push(path.relative(ROOT, f));
    }
    expect(offenders).toEqual([]);
  });

  it('las primitivas se importan desde el índice, no desde los archivos internos', () => {
    const internal = crmFiles.filter((f) => /@\/components\/shared\/motion\/(primitives|audio|staggerList|chip|MotionProvider)/.test(read(f)));
    expect(internal.map((f) => path.relative(ROOT, f))).toEqual([]);
  });
});

describe('6. índice estable y duplicados muertos', () => {
  it('index.ts exporta los nombres estables', () => {
    const idx = read(path.join(MOTION_DIR, 'index.ts')).replace(/\/\*[\s\S]*?\*\//g, ''); // sin comentarios: solo exports
    for (const name of ['FadeIn', 'SlideIn', 'SlideUp', 'ScaleIn', 'StaggerList', 'StaggerItem', 'Chip', 'Expand', 'PulseRing', 'SoundWave', 'LevelMeter', 'MotionProvider', 'AnimatePresence', 'useReducedMotion']) {
      expect(idx).toMatch(new RegExp(`\\b${name}\\b`));
    }
  });

  it('src/lib/motion y src/lib/hooks/usePlatform.ts (sin importadores) no existen', () => {
    expect(exists('src/lib/motion')).toBe(false);
    expect(exists('src/lib/hooks/usePlatform.ts')).toBe(false);
  });
});
