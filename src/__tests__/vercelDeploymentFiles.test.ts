/** Vercel filtra archivos antes de resolver imports; un checkout completo oculta ausencias. */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import ignore from 'ignore';

const root = path.resolve(__dirname, '../..');
const entrypoints = [
  'src/components/app-layout/AppLayout.tsx',
  'src/components/voice/desktop/PhoneMirror.tsx',
  'src/components/voice/hooks/useDesktopPhoneController.ts',
];
const protocol = 'electron/src/shared/phoneProtocol.ts';
// Reglas del despliegue fallido a774413b: los directorios coincidían a cualquier profundidad.
const previousRules = 'mobile/\nelectron/\nbuild_output.txt\ndev_server.txt\n*.log\n';

function runtimeImports(source: ts.SourceFile): string[] {
  const imports = new Set<string>();
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const typesOnly = clause?.isTypeOnly || (!clause?.name && bindings && ts.isNamedImports(bindings)
        && bindings.elements.length > 0 && bindings.elements.every(element => element.isTypeOnly));
      if (!typesOnly) imports.add(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)) {
      const typesOnly = node.exportClause && ts.isNamedExports(node.exportClause)
        && node.exportClause.elements.length > 0 && node.exportClause.elements.every(element => element.isTypeOnly);
      if (!typesOnly) imports.add(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      imports.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return [...imports];
}

function webClosure(): { files: string[]; edges: { importer: string; target: string }[] } {
  const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
  const { options } = ts.convertCompilerOptionsFromJson(config.config.compilerOptions, root);
  const cache = ts.createModuleResolutionCache(root, value => value, options);
  const pending = entrypoints.map(file => path.join(root, file));
  const files = new Set<string>();
  const edges: { importer: string; target: string }[] = [];
  while (pending.length) {
    const file = pending.pop() as string;
    const relative = path.relative(root, file).split(path.sep).join('/');
    if (files.has(relative)) continue;
    files.add(relative);
    if (!/\.[cm]?[jt]sx?$/.test(file) || /\.d\.ts$/.test(file)) continue;
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const specifier of runtimeImports(source)) {
      const resolved = ts.resolveModuleName(specifier, file, options, ts.sys, cache).resolvedModule;
      if (!resolved) {
        if (specifier.startsWith('.') || specifier.startsWith('@/') || specifier.startsWith('@printing/')) {
          throw new Error(`Import local sin resolver: ${relative} → ${specifier}`);
        }
        continue;
      }
      // Los paquetes instalados por npm no pertenecen a los archivos enviados del repositorio.
      if (resolved.isExternalLibraryImport || resolved.resolvedFileName.includes('/node_modules/')) continue;
      const target = path.relative(root, resolved.resolvedFileName).split(path.sep).join('/');
      edges.push({ importer: relative, target });
      pending.push(resolved.resolvedFileName);
    }
  }
  return { files: [...files], edges };
}

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const file = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(file) : [file];
  });
}

describe('Vercel conserva las dependencias de archivos del build web', () => {
  const closure = webClosure();
  const current = ignore().add(fs.readFileSync(path.join(root, '.vercelignore'), 'utf8'));
  const missing = (rules: ReturnType<typeof ignore>) => closure.edges.filter(edge => rules.ignores(edge.target));

  test('las reglas anteriores reproducen los tres módulos perdidos del despliegue fallido', () => {
    const directMissing = missing(ignore().add(previousRules)).filter(edge => entrypoints.includes(edge.importer));
    expect(directMissing).toHaveLength(3);
    expect(directMissing).toEqual(expect.arrayContaining([
      { importer: entrypoints[0], target: 'src/components/voice/mobile/IncomingMobileCall.tsx' },
      { importer: entrypoints[1], target: protocol },
      { importer: entrypoints[2], target: protocol },
    ]));
  });

  test('todos los imports locales de runtime alcanzables desde las entradas web sobreviven al filtro', () => {
    expect(closure.files.length).toBeGreaterThan(100);
    expect(entrypoints.filter(file => current.ignores(file))).toEqual([]);
    expect(missing(current)).toEqual([]);
  });

  test('Electron conserva únicamente su protocolo compartido canónico sin dependencias', () => {
    expect(sourceFiles('electron/src').filter(file => !current.ignores(file))).toEqual([protocol]);
    for (const file of ['electron/package.json', 'electron/tsconfig.json', 'electron/resources/icon.ico']) {
      expect(current.ignores(file)).toBe(true);
    }
    const source = ts.createSourceFile(protocol, fs.readFileSync(path.join(root, protocol), 'utf8'), ts.ScriptTarget.Latest, true);
    expect(runtimeImports(source)).toEqual([]);
  });

  test('excluye el subproyecto móvil de la raíz y conserva los componentes móviles de la web', () => {
    for (const file of ['mobile/package.json', 'mobile/capacitor.config.ts', 'mobile/android/build.gradle', 'mobile/ios/App/exportOptions.plist']) {
      expect(current.ignores(file)).toBe(true);
    }
    expect(sourceFiles('src/components/voice/mobile').filter(file => current.ignores(file))).toEqual([]);
  });
});
