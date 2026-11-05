/**
 * Contrato de los formularios de conexión (`settings_schema` de la migración de la Fase 1) con la
 * documentación oficial de cada transportadora.
 *
 * Los fixtures son extractos literales de los WSDL oficiales (descargados el 2026-11-04, ver la
 * cabecera de cada archivo). Cada campo del formulario debe corresponder a un elemento real del
 * WSDL, y cada credencial que el WSDL pide debe estar en el formulario. Un proveedor sin doc
 * oficial no tiene contrato que verificar: su prueba queda pendiente con el motivo.
 */
import fs from 'fs';
import path from 'path';
import { leerEsquema, type EsquemaConexion } from '../esquemaConexion';

const RAIZ = path.resolve(__dirname, '../../../../..');
const MIGRACION = path.join(RAIZ, 'supabase/migrations/20261105151905_transporte_fase1_cimientos.sql');
const FIXTURES = path.join(__dirname, 'fixtures');

/** settings_schema por código de conector, leído del propio .sql (lo que se aplica a la base). */
function esquemasDeLaMigracion(): Record<string, EsquemaConexion> {
  const sql = fs.readFileSync(MIGRACION, 'utf8');
  const salida: Record<string, EsquemaConexion> = {};
  for (const m of sql.matchAll(/settings_schema = \$json\$([\s\S]*?)\$json\$::jsonb, updated_at = now\(\) where code = '([a-z_]+)'/g)) {
    salida[m[2]] = leerEsquema(JSON.parse(m[1]))!;
  }
  for (const m of sql.matchAll(/\('([a-z_]+)', '[^']+', \$json\$([\s\S]*?)\$json\$::jsonb\)/g)) {
    salida[m[1]] = leerEsquema(JSON.parse(m[2]))!;
  }
  return salida;
}

/** Elementos de un complexType del fixture: nombre → tipo. */
function elementos(fixture: string, tipo: string): Record<string, string> {
  const xml = fs.readFileSync(path.join(FIXTURES, fixture), 'utf8');
  const bloque = new RegExp(`<(?:xsd|s):complexType name="${tipo}">([\\s\\S]*?)</(?:xsd|s):complexType>`).exec(xml)?.[1];
  if (!bloque) throw new Error(`${fixture}: no está el tipo ${tipo}`);
  return Object.fromEntries([...bloque.matchAll(/<(?:xsd|s):element[^>]*\bname="([^"]+)"[^>]*\btype="([^"]+)"/g)].map((m) => [m[1], m[2]]));
}

const esquemas = esquemasDeLaMigracion();

describe('migración: formularios presentes y válidos', () => {
  test('los seis conectores de logística tienen settings_schema legible', () => {
    expect(Object.keys(esquemas).sort()).toEqual(['coordinadora', 'dropi', 'effi', 'envia', 'interrapidisimo', 'servientrega']);
    for (const e of Object.values(esquemas)) expect(e).not.toBeNull();
  });

  test('sin doc oficial → doc_pendiente (se guardan los datos, no se prueba)', () => {
    for (const code of ['envia', 'interrapidisimo', 'dropi', 'effi']) expect(esquemas[code].doc_pendiente).toBe(true);
    for (const code of ['coordinadora', 'servientrega']) expect(esquemas[code].doc_pendiente).toBeUndefined();
  });
});

describe('Coordinadora: contra los WSDL oficiales ags 1.4 y guías 1.4', () => {
  const cotizar = elementos('coordinadora-ags-1.4.xml', 'Cotizador_cotizarIn');
  const seguimiento = elementos('coordinadora-ags-1.4.xml', 'Seguimiento_detalladoIn');
  const generar = elementos('coordinadora-guias-1.4.xml', 'Agw_typeGenerarGuiaIn');
  const anular = elementos('coordinadora-guias-1.4.xml', 'Agw_typeAnularGuiaIn');
  const esquema = esquemas.coordinadora;

  /** campo del formulario → [operaciones del WSDL donde viaja, elemento]. */
  const MAPA: Record<string, [Record<string, string>[], string]> = {
    nit: [[cotizar, seguimiento], 'nit'],
    div: [[cotizar, seguimiento], 'div'],
    apikey: [[cotizar, seguimiento], 'apikey'],
    clave_cotizador: [[cotizar, seguimiento], 'clave'],
    id_cliente: [[generar], 'id_cliente'],
    usuario_guias: [[generar, anular], 'usuario'],
    clave_guias: [[generar, anular], 'clave'],
    codigo_cuenta: [[generar], 'codigo_cuenta'],
  };

  test('cada campo del formulario existe en el WSDL (no hay campos inventados)', () => {
    for (const campo of esquema.campos) {
      const destino = MAPA[campo.clave];
      expect(destino).toBeDefined();
      for (const op of destino[0]) expect(op).toHaveProperty(destino[1]);
    }
  });

  test('cada credencial que piden las operaciones está en el formulario', () => {
    const claves = new Set(esquema.campos.map((c) => c.clave));
    for (const [campo] of Object.entries(MAPA)) expect(claves.has(campo)).toBe(true);
    expect(Object.keys(anular).sort()).toEqual(['clave', 'codigo_remision', 'usuario']);
  });

  test('los tipos numéricos del WSDL son número en el formulario y las claves son secretas', () => {
    const porClave = Object.fromEntries(esquema.campos.map((c) => [c.clave, c]));
    expect(generar.id_cliente).toBe('xsd:int');
    expect(porClave.id_cliente.tipo).toBe('numero');
    expect(generar.codigo_cuenta).toBe('xsd:int');
    expect(porClave.codigo_cuenta.tipo).toBe('numero');
    for (const c of ['apikey', 'clave_cotizador', 'clave_guias']) expect(porClave[c].secreto).toBe(true);
    for (const c of ['nit', 'div', 'id_cliente', 'usuario_guias', 'codigo_cuenta']) expect(porClave[c].secreto).toBe(false);
  });

  test('el WSDL de guías trae recaudo (contra entrega) y rótulo: capacidades cod y labelPdf', () => {
    expect(generar).toHaveProperty('recaudos');
    expect(generar).toHaveProperty('id_rotulo');
    expect(generar).toHaveProperty('formato_impresion');
    expect(esquema.ambientes).toEqual(['sandbox', 'production']);
  });
});

describe('Servientrega: contra el WSDL oficial GeneracionGuias.asmx', () => {
  const auth = elementos('servientrega-generacion-guias.xml', 'AuthHeader');
  const esquema = esquemas.servientrega;
  const MAPA: Record<string, string> = { login: 'login', pwd: 'pwd', id_cod_facturacion: 'Id_CodFacturacion', nombre_cargue: 'Nombre_Cargue' };

  test('el formulario es exactamente el AuthHeader del WSDL', () => {
    expect(Object.keys(auth).sort()).toEqual(Object.values(MAPA).sort());
    expect(esquema.campos.map((c) => c.clave).sort()).toEqual(Object.keys(MAPA).sort());
    expect(esquema.campos.find((c) => c.clave === 'pwd')!.secreto).toBe(true);
  });

  test('la doc oficial no publica sandbox: solo producción', () => {
    expect(esquema.ambientes).toEqual(['production']);
  });
});

describe('proveedores sin documentación oficial', () => {
  test.todo('Envía Colvanes: contrato pendiente. Motivo: no hay doc pública del web service corporativo ni sandbox; los campos (usuario, contraseña, código de cuenta) salen del plan y se confirman cuando Envía Colvanes entregue la doc.');
  test.todo('Interrapidísimo: contrato pendiente. Motivo: falta la doc oficial de la API de cliente crédito (admisión, tarifas, rastreo, anulación, recaudo, firma de cabeceras).');
  test.todo('Dropi: contrato pendiente (Fase 5). Motivo: la OpenAPI la entrega TI de Dropi tras habilitar el dominio y una IP de salida fija; /docs responde 404.');
  test.todo('Effi: contrato pendiente (Fase 5). Motivo: falta la doc de la API de Effi.');
});
