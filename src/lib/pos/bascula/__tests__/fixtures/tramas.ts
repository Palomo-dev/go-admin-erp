/**
 * Tramas de ejemplo por protocolo, tal como llegan del puerto (bytes).
 *
 * Construidas desde la documentación de cada fabricante (formato de salida
 * continua ST,GS de A&D/CAS, respuesta del protocolo 8217 de Mettler Toledo,
 * comandos SICS nivel 0 y trama PD-II de CAS). Cuando se grabe una báscula
 * real (§11 del documento de diseño, «cómo probar»), se agregan aquí con el
 * modelo en el nombre y deben seguir pasando las mismas pruebas.
 */

const b = (texto: string): Uint8Array => Uint8Array.from(texto, (c) => c.charCodeAt(0));
const STX = '\x02';
const SOH = '\x01';
const ETX = '\x03';
const EOT = '\x04';

export const TRAMAS = {
  stGs: {
    estable: b('ST,GS,+00.735kg\r\n'),
    estableConEspacios: b('ST,GS,+  0.735 kg\r\n'),
    inestable: b('US,GS,+00.742kg\r\n'),
    neto: b('ST,NT,+00.720kg\r\n'),
    sobrecarga: b('OL,GS,+99999999\r\n'),
    negativo: b('ST,GS,-00.015kg\r\n'),
    tara: b('ST,TR,+00.015kg\r\n'),
    libras: b('ST,GS,+001.62lb\r\n'),
    sinPunto: b('ST,GS,+0000735kg\r\n'),
  },
  toledo8217: {
    estable: b(`${STX}00.735\r`),
    libras: b(`${STX}01.62\r`),
    enMovimiento: b(`${STX}?a\r`), // 0x61: bit 0 = en movimiento
    sobrecarga: b(`${STX}?b\r`), // 0x62: bit 1 = sobre capacidad
    bajoCero: b(`${STX}?d\r`), // 0x64: bit 2 = bajo cero
  },
  sics: {
    estable: b('S S      0.735 kg\r\n'),
    dinamico: b('S D      0.742 kg\r\n'),
    sobrecarga: b('S +\r\n'),
    bajoCero: b('S -\r\n'),
    ocupado: b('S I\r\n'),
    error: b('ES\r\n'),
    ceroAceptado: b('Z A\r\n'),
  },
  casPd2: {
    ack: Uint8Array.of(0x06),
    estable: b(`${SOH}${STX}S 00.735kg\x5a${ETX}${EOT}`),
    inestable: b(`${SOH}${STX}U 00.742kg\x5a${ETX}${EOT}`),
    negativo: b(`${SOH}${STX}S-00.015kg\x5a${ETX}${EOT}`),
  },
  propio: {
    patron: '^(?<estado>[SU])\\s+(?<signo>[+-]?)(?<peso>\\d+\\.\\d+)\\s*(?<unidad>kg|lb)$',
    estable: b('S +0.735 kg\r\n'),
    inestable: b('U 0.742 kg\r\n'),
  },
  basura: b('\xff\xfe@@##\r\n'),
} as const;

export { b as bytes };
