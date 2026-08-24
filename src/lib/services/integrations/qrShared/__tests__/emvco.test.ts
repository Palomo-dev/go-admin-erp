/**
 * Tests unitarios del builder/parser EMVCo.
 * Cubre construccion, parseo, edge cases y formato.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEmvcoPayload,
  parseEmvcoPayload,
  EMVCO_TAGS,
} from '../emvco';

describe('EMVCo builder/parser', () => {
  // Test: construir QR EMVCo con datos validos y verificar formato
  test('construye un payload con datos validos respetando el formato ID+length+value', () => {
    const payload = buildEmvcoPayload({
      '00': '01',
      '53': '170',
      '54': '15000.00',
      '58': 'CO',
      '59': 'Mi Comercio',
    });

    // Cada tag debe tener ID (2) + length (2) + value
    assert.ok(payload.startsWith('000201'), 'Tag 00 debe ir primero');
    assert.ok(payload.includes('5303170'), 'Tag 53 con length 03');
    assert.ok(payload.includes('540815000.00'), 'Tag 54 con length 08');
    assert.ok(payload.includes('5802CO'), 'Tag 58 con length 02');
    assert.ok(payload.includes('5911Mi Comercio'), 'Tag 59 con length 11');
  });

  // Test: parsear QR EMVCo y verificar campos
  test('parsea un payload y reconstruye el mapa de tags', () => {
    const original = {
      '00': '01',
      '53': '170',
      '54': '15000.00',
      '58': 'CO',
      '59': 'Mi Comercio',
    };
    const payload = buildEmvcoPayload(original);
    const parsed = parseEmvcoPayload(payload);

    assert.equal(parsed['00'], '01');
    assert.equal(parsed['53'], '170');
    assert.equal(parsed['54'], '15000.00');
    assert.equal(parsed['58'], 'CO');
    assert.equal(parsed['59'], 'Mi Comercio');
  });

  // Test: construir QR con monto 0 (edge case)
  test('construye un payload con monto 0 (value vacio)', () => {
    const payload = buildEmvcoPayload({
      '00': '01',
      '54': '',
    });

    // length 00 para value vacio
    assert.ok(payload.includes('5400'), 'Tag 54 con length 00');
    const parsed = parseEmvcoPayload(payload);
    assert.equal(parsed['54'], '');
  });

  // Test: construir QR con caracteres especiales en descripcion
  test('maneja caracteres especiales (ñ, acentos, simbolos) en valores', () => {
    const descripcion = 'Pago Niño@2026 — Café';
    const payload = buildEmvcoPayload({
      '59': descripcion,
    });

    const parsed = parseEmvcoPayload(payload);
    assert.equal(parsed['59'], descripcion);
  });

  // Test: verificar que el ID del merchant esta presente (tag 26)
  test('incluye el merchant account info (tag 26) cuando se provee', () => {
    const payload = buildEmvcoPayload({
      '26': 'comercio-123',
    });

    assert.ok(payload.startsWith('2612comercio-123'), 'Tag 26 con length 12');
    const parsed = parseEmvcoPayload(payload);
    assert.equal(parsed['26'], 'comercio-123');
  });

  // Test: verificar formato de expiry (tag 62 additional data)
  test('el additional data field (tag 62) se serializa con formato correcto', () => {
    const expiry = '20261231T235959';
    const payload = buildEmvcoPayload({
      '62': expiry,
    });

    const parsed = parseEmvcoPayload(payload);
    assert.equal(parsed['62'], expiry);
    assert.match(payload, /^621520261231T235959/, 'Tag 62 con length 15');
  });

  // Test: el CRC (tag 63) siempre va al final
  test('el CRC (tag 63) se coloca siempre al final del payload', () => {
    const payload = buildEmvcoPayload({
      '00': '01',
      '63': 'ABCD',
    });

    assert.ok(payload.endsWith('6304ABCD'), 'CRC debe ir al final');
    assert.ok(payload.startsWith('000201'), 'Tag 00 antes del CRC');
  });

  // Test: round-trip build -> parse -> build es estable
  test('round-trip: parse(build(tags)) reproduce el mismo payload', () => {
    const tags = {
      '00': '01',
      '52': '0000',
      '53': '170',
      '54': '99.90',
      '58': 'CO',
      '59': 'Comercio Test',
      '60': 'Bogota',
    };
    const payload1 = buildEmvcoPayload(tags);
    const parsed = parseEmvcoPayload(payload1);
    const payload2 = buildEmvcoPayload(parsed);

    assert.equal(payload1, payload2);
  });

  // Test: parseo aborta con payload truncado
  test('parseo aborta de forma segura ante un payload truncado', () => {
    const payload = '000201530317'; // truncado en medio del tag 53
    const parsed = parseEmvcoPayload(payload);
    assert.equal(parsed['00'], '01');
    assert.equal(parsed['53'], undefined, 'Tag 53 truncado no debe aparecer');
  });

  // Test: EMVCO_TAGS expone los IDs estandar
  test('EMVCO_TAGS expone los IDs estandar del estandar EMVCo', () => {
    assert.equal(EMVCO_TAGS['00'], 'payloadFormat');
    assert.equal(EMVCO_TAGS['63'], 'CRC');
    assert.equal(EMVCO_TAGS['54'], 'transactionAmount');
  });
});
