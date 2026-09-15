/// <reference types="jest" />
/**
 * `useReturnFocus` (hook compartido): la parte pura de «quién abrió» y «a
 * dónde vuelve el foco». Safari no enfoca un botón al pulsarlo con el ratón,
 * así que `document.activeElement` en el momento de abrir es el `body`: eso
 * cuenta como «sin disparador» y al cerrar se usa el fallback, no el `body`.
 */
import { openerFrom, returnTarget } from '../useReturnFocus';

type El = { isConnected: boolean; name: string };
const body: El = { isConnected: true, name: 'body' };
const button: El = { isConnected: true, name: 'button' };
const fallback: El = { isConnected: true, name: 'fallback' };

describe('openerFrom', () => {
  it('el elemento activo es el disparador', () => {
    expect(openerFrom(button, body)).toBe(button);
  });

  it('el body (Safari) o nada cuentan como «sin disparador»', () => {
    expect(openerFrom(body, body)).toBeNull();
    expect(openerFrom(null, body)).toBeNull();
  });
});

describe('returnTarget', () => {
  it('vuelve al disparador si sigue en el DOM', () => {
    expect(returnTarget(button, () => fallback)).toBe(button);
  });

  it('si el disparador se desmontó o no lo hubo, va al fallback; sin fallback, a nada', () => {
    expect(returnTarget({ ...button, isConnected: false }, () => fallback)).toBe(fallback);
    expect(returnTarget(null, () => fallback)).toBe(fallback);
    expect(returnTarget(null, undefined)).toBeNull();
    expect(returnTarget(null, () => null)).toBeNull();
  });

  it('un disparador que era el body nunca se «restaura»: openerFrom + returnTarget acaban en el fallback', () => {
    expect(returnTarget(openerFrom(body, body), () => fallback)).toBe(fallback);
  });
});
