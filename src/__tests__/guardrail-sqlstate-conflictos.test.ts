import { createHash } from 'crypto';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

// Migraciones aplicadas e inmutables. Sus hashes no permiten introducir nuevos
// RAISE 40001. El delta posterior corrige las nueve RPC que seguían activas.
const HISTORICOS: Record<string, string> = {
  '20260930160600_crm_ola1_oportunidad_rpc.sql': '5c98b49aabe0a3422ef3afd5dad8ecea156ab710016a3e12781f65bc170350f7',
  '20260930210840_crm_fusion_transaccional.sql': '0e4833d8146f1b3708eff6a806bd0f45d9015ea7a64a906c16b455ff09e15b3b',
  '20260930213351_crm_fusion_snapshot_relaciones.sql': 'e627864fe54081eec650b8ccb4f6197f83fe0c5c0f43215636b3988efa791b18',
  '20260930225439_crm_pronostico_categorias_y_ajustes.sql': 'ac705876e416fe1063ec06ccc0e72278647e4501336816c0f3d146e53790642b',
  '20261001010300_crm_segmentos_estaticos_y_contexto.sql': '5899721d4a65b4a0a1257587f118b1d443b70e80905e4a8734357bce7b494feb',
  '20261001015500_crm_segmentos_operaciones_atomicas.sql': '97b685a807a39a880a315bbbb139e46119f11e95dea08d19b18cecb4653a3277',
  '20261001095255_crm_recepcion_cloud_atomica.sql': 'b3838e9cb9895ee374a7f15cc19f2682d8a5730325786c74deed76dde9290018',
  '20261001112641_crm_campanas_edicion_y_archivo_atomicos.sql': '141f235a17776b47245c77101768d4224d859ed196ed0306ddbf81aceb47d9e1',
  '20261001233500_crm_reuniones_atomicas.sql': 'aaad7988f3295650afec63840a5c149f5496c0ee0c39c8e82beec903aa2cb456',
  '20261002002500_crm_contactos_futuros_reparacion.sql': '92f124a9dc585d9fcaf4c629a6092b9bb6536cbcfecaa502a317b7a855761c7b',
  '20261002004000_crm_reuniones_nucleo_y_voz.sql': '213210a298f4dcd2bdeb0fef1d5ac36585a8d1ca03bc4461f8b973ba2a3e7918',
  '20261002011500_crm_actividades_atomicas.sql': 'b01370645350718c082ad64210c4f4ed8092fa7b4f4e61bfa537ff4142bacccd',
  '20261002060000_crm_llamadas_atomicas.sql': '90234a67260e94e3bc9a5e375363494d243366fc589051c0b9654bbf767e0190',
  '20261002063500_crm_equipo_gestion.sql': '60e8d133c7ee9110de9e46f9d97be16b9a430e372b44b7295be1d57dd5ab414a',
  '20261002065000_crm_red_comercial_atomica.sql': 'b26583d1e88c49c77ac9efff16f1865afa41a45ee932d777361071ccd0eaab16',
  '20261002065500_crm_objeciones_frecuencia_respuestas.sql': '609065ca416523f67944f08ec9b1dcbffaa496df1a13b4317977ae4bb568a81f',
  '20261002070000_crm_phone_conferencias.sql': 'a7add2f7ea1e214de929e3eb025364f2b4cf55db36cfed8458904dc7872890ff',
};

/** Preserva strings y separadores de línea, incluidos -- dentro de mensajes. */
function sinComentarios(sql: string): string {
  let result = '', quote: "'" | '"' | null = null, blockDepth = 0;
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i], next = sql[i + 1];
    if (blockDepth) {
      if (char === '/' && next === '*') { blockDepth++; i++; }
      else if (char === '*' && next === '/') { blockDepth--; i++; }
      else if (char === '\n') result += char;
    } else if (quote) {
      result += char;
      if (char === quote && next === quote) { result += next; i++; }
      else if (char === quote) quote = null;
    } else if (char === '/' && next === '*') { blockDepth++; result += ' '; i++; }
    else if (char === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      result += '\n';
    } else { result += char; if (char === "'" || char === '"') quote = char; }
  }
  return result;
}

function tieneRaiseReintentable(sql: string): boolean {
  const code = sinComentarios(sql);
  return /\bRAISE\s+(?:SQLSTATE\s*'40001'|serialization_failure\b)/i.test(code)
    || /\bRAISE\s+EXCEPTION\b(?:'(?:[^']|'')*'|[^';])*?\bERRCODE\s*=\s*'40001'/i.test(code);
}

function esNuevoRaise(filename: string, sql: string): boolean {
  return tieneRaiseReintentable(sql)
    && HISTORICOS[filename] !== createHash('sha256').update(sql).digest('hex');
}

it('ninguna migración nueva introduce RAISE de serialización para un conflicto manual', () => {
  const dir = resolve(__dirname, '../../supabase/migrations');
  const unsafe = readdirSync(dir).filter(name => name.endsWith('.sql'))
    .filter(name => esNuevoRaise(name, readFileSync(resolve(dir, name), 'utf8')));
  expect(unsafe).toEqual([]);
});

it.each([
  "RAISE EXCEPTION 'conflicto' USING ERRCODE='40001';",
  "raise exception using\n errcode = '40001', message = 'conflicto';",
  "RAISE EXCEPTION 'a--b;c' USING ERRCODE = '40001';",
  "RAISE SQLSTATE '40001' USING MESSAGE='conflicto';",
  'RAISE serialization_failure;',
])('detecta la forma reintentable: %s', sql => {
  expect(esNuevoRaise('nueva.sql', sql)).toBe(true);
});

it('un archivo histórico modificado pierde su excepción por hash', () => {
  const name = '20261002070000_crm_phone_conferencias.sql';
  const source = readFileSync(resolve(__dirname, '../../supabase/migrations', name), 'utf8');
  expect(esNuevoRaise(name, source)).toBe(false);
  expect(esNuevoRaise(name, source + '\n-- cambio posterior\n')).toBe(true);
});

it('admite P0001 y captura de una serialización real; ignora comentarios', () => {
  expect(tieneRaiseReintentable("RAISE EXCEPTION 'conflicto' USING ERRCODE='P0001';")).toBe(false);
  expect(tieneRaiseReintentable("EXCEPTION WHEN serialization_failure THEN RETURN '40001';")).toBe(false);
  expect(tieneRaiseReintentable("/* RAISE SQLSTATE '40001'; */\n-- RAISE serialization_failure;\nSELECT 1;")).toBe(false);
});
