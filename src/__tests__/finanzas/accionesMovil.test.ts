/**
 * Guardarraíl (2026-11-07): ninguna pantalla de Finanzas pierde sus acciones en
 * el celular.
 *
 * `PageHeader` (y `DocumentoCabecera`, que lo envuelve) NO se dibuja por debajo
 * de `lg`: lo que va en `acciones` desaparece en móvil si la pantalla no publica
 * su equivalente. El dueño lo encontró en Métodos de pago (no se podía crear un
 * método) y en el detalle de las facturas de venta y compra (ni registrar pago,
 * ni anular, ni nota crédito); el barrido encontró 45 pantallas más.
 *
 * Toda cabecera del kit con `acciones` debe llevar UNA de estas:
 * - `movil={{ accion }}`: «+», «⋯» o un botón propio en el MobileHeader.
 * - `movil={{ menu: AccionFila[] }}`: las acciones como «⋯» en el MobileHeader.
 * - `movil={{ accionesEnFila: true }}`: los mismos botones en una fila bajo el
 *   MobileHeader (cabeceras compartidas que reciben `acciones` como nodo).
 * - `accionesMovil` (solo `DocumentoCabecera`): fila con la primaria + «⋯».
 * - `movil={false}`: la página no va dentro del shell (la cabecera se dibuja siempre).
 * O estar en la allow-list de abajo, con su motivo.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const RAIZ = path.resolve(__dirname, '..', '..', '..');
// 2026-11-09: también Integraciones › Conexiones (el dueño encontró la cabecera sin «Conectar» ni
// «Importar» en el celular): la página, sus pestañas y el detalle de la conexión.
const CARPETAS = ['src/components/finanzas', 'src/app/app/finanzas', 'src/components/integraciones/conexiones-v2', 'src/app/app/integraciones/conexiones'];

/**
 * Casos justificados. Clave `ruta:Componente#n` (n = orden de aparición de esa
 * cabecera en el archivo, empezando en 1, para no depender del número de línea).
 */
const PERMITIDOS: Record<string, string> = {
  // Formularios de documento: en móvil las acciones (Guardar, Emitir, Cancelar)
  // van en el pie fijo `pieMovil` de `FormularioDocumentoLayout` (Figma
  // `FormularioDocumento` móvil). Repetirlas en la cabecera las duplicaría.
  'src/components/finanzas/cotizaciones/formulario/FormularioCotizacion.tsx:DocumentoCabecera#1': 'pieMovil del formulario',
  'src/components/finanzas/documentos-soporte/FormularioDocumentoSoporte.tsx:DocumentoCabecera#1': 'pieMovil del formulario',
  'src/components/finanzas/facturas-compra/formulario/FormularioFacturaCompra.tsx:DocumentoCabecera#2': 'pieMovil del formulario',
  'src/components/finanzas/facturas-venta/formulario/FormularioFacturaVenta.tsx:DocumentoCabecera#1': 'pieMovil del formulario',
};

function archivos(dir: string): string[] {
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === '__tests__' ? [] : archivos(rel);
    return /\.tsx$/.test(e.name) && !/\.test\./.test(e.name) ? [rel] : [];
  });
}

interface Uso {
  clave: string;
  linea: number;
  tieneAcciones: boolean;
  movilOk: boolean;
}

function usosDeCabecera(rel: string): Uso[] {
  const texto = fs.readFileSync(path.join(RAIZ, rel), 'utf-8');
  if (!/PageHeader|DocumentoCabecera/.test(texto)) return [];
  const sf = ts.createSourceFile(rel, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  // Solo las del kit (hay componentes locales que también se llaman PageHeader).
  const delKit = new Map<string, string>();
  for (const s of sf.statements) {
    if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier) || !/components\/kit/.test(s.moduleSpecifier.text)) continue;
    const enlaces = s.importClause?.namedBindings;
    if (!enlaces || !ts.isNamedImports(enlaces)) continue;
    for (const e of enlaces.elements) {
      const original = (e.propertyName ?? e.name).text;
      if (original === 'PageHeader' || original === 'DocumentoCabecera') delKit.set(e.name.text, original);
    }
  }
  if (delKit.size === 0) return [];

  const usos: Uso[] = [];
  const contador: Record<string, number> = {};
  const visitar = (n: ts.Node) => {
    if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && delKit.has(n.tagName.getText(sf))) {
      const componente = delKit.get(n.tagName.getText(sf))!;
      contador[componente] = (contador[componente] ?? 0) + 1;
      const props = new Map<string, string>();
      for (const a of n.attributes.properties) {
        if (ts.isJsxAttribute(a)) props.set(a.name.getText(sf), a.initializer ? a.initializer.getText(sf) : 'true');
        // `{...props}` puede traer cualquier cosa: se trata como si trajera el móvil.
        if (ts.isJsxSpreadAttribute(a)) props.set('...', 'spread');
      }
      const movil = props.get('movil');
      const movilOk =
        props.has('...') ||
        props.has('accionesMovil') ||
        movil === '{false}' ||
        (movil !== undefined && /\b(accion|menu|accionesEnFila)\b\s*[:,}]/.test(movil));
      usos.push({
        clave: `${rel}:${componente}#${contador[componente]}`,
        linea: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
        tieneAcciones: props.has('acciones'),
        movilOk,
      });
    }
    ts.forEachChild(n, visitar);
  };
  visitar(sf);
  return usos;
}

const USOS = CARPETAS.flatMap(archivos).flatMap(usosDeCabecera);

describe('Finanzas e Integraciones: las acciones de la cabecera también existen en móvil', () => {
  test('el barrido encuentra las cabeceras del kit (si no, el test no está mirando nada)', () => {
    expect(USOS.length).toBeGreaterThan(50);
    expect(USOS.filter((u) => u.tieneAcciones).length).toBeGreaterThan(40);
  });

  test('toda cabecera con `acciones` publica su equivalente móvil', () => {
    const sinMovil = USOS.filter((u) => u.tieneAcciones && !u.movilOk && !(u.clave in PERMITIDOS)).map(
      (u) => `${u.clave.split(':')[0]}:${u.linea} (${u.clave.split(':')[1]})`,
    );
    expect(sinMovil).toEqual([]);
  });

  test('la allow-list no tiene entradas viejas: cada caso existe y sigue sin móvil', () => {
    const porClave = new Map(USOS.map((u) => [u.clave, u]));
    const viejas = Object.keys(PERMITIDOS).filter((c) => {
      const u = porClave.get(c);
      return !u || !u.tieneAcciones || u.movilOk;
    });
    expect(viejas).toEqual([]);
  });

  test('los formularios permitidos de verdad tienen pie móvil', () => {
    for (const clave of Object.keys(PERMITIDOS)) {
      const archivo = clave.split(':')[0];
      expect([archivo, fs.readFileSync(path.join(RAIZ, archivo), 'utf-8').includes('pieMovil=')]).toEqual([archivo, true]);
    }
  });

  test('los casos que reportó el dueño siguen cubiertos', () => {
    const debe = [
      'src/components/finanzas/metodos-pago/PaymentMethodsPage.tsx:PageHeader#1',
      'src/components/integraciones/conexiones-v2/ConexionesPagina.tsx:PageHeader#1',
      'src/app/app/integraciones/conexiones/[id]/page.tsx:PageHeader#1',
      'src/components/finanzas/facturas-venta/detalle/DetalleFacturaVenta.tsx:DocumentoCabecera#1',
      'src/components/finanzas/facturas-compra/detalle/DetalleFacturaCompraV2.tsx:DocumentoCabecera#2',
    ];
    for (const c of debe) expect([c, USOS.find((u) => u.clave === c)?.movilOk]).toEqual([c, true]);
  });
});
