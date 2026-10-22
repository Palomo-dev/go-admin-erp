/**
 * @jest-environment jsdom
 */
import { esCapaFlotante } from '../capaFlotante';

describe('capa flotante de un diálogo', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('un select o un popover portaleados no cuentan como clic fuera', () => {
    document.body.innerHTML = `
      <div data-radix-popper-content-wrapper>
        <div data-radix-select-content><div id="opcion"></div></div>
      </div>
      <div data-radix-popover-content><button id="fila"></button></div>
      <div role="listbox"><div id="lista"></div></div>
      <div role="menu"><div id="menu"></div></div>
      <div id="dialogo"></div>
    `;
    expect(esCapaFlotante(document.getElementById('opcion'))).toBe(true);
    expect(esCapaFlotante(document.getElementById('fila'))).toBe(true);
    expect(esCapaFlotante(document.getElementById('lista'))).toBe(true);
    expect(esCapaFlotante(document.getElementById('menu'))).toBe(true);
    expect(esCapaFlotante(document.getElementById('dialogo'))).toBe(false);
    expect(esCapaFlotante(null)).toBe(false);
    expect(esCapaFlotante(window)).toBe(false);
  });
});
