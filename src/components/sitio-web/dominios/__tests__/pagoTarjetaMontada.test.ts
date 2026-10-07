/// <reference types="jest" />
/**
 * Comprar dominio: la tarjeta se confirma con Stripe mientras el CardElement sigue montado.
 * La fase «comprando» desmonta el formulario; si se pasaba a ella antes de confirmCardSetup,
 * Stripe lanzaba «We could not retrieve data from the specified Element» y el diálogo quedaba
 * girando en «Pago aprobado» sin cobrar ni registrar el dominio (2026-10-07).
 */
import * as fs from 'fs';
import * as path from 'path';

const fuente = fs.readFileSync(path.join(__dirname, '..', 'DialogoComprarDominio.tsx'), 'utf8');
const pagar = fuente.slice(fuente.indexOf('const pagar = async'), fuente.indexOf('const precioTexto'));

describe('DialogoComprarDominio — pago con la tarjeta montada', () => {
  it('confirmCardSetup va antes de setFase(\'comprando\')', () => {
    const confirmar = pagar.indexOf('stripe.confirmCardSetup(');
    const comprando = pagar.indexOf("setFase('comprando')");
    expect(confirmar).toBeGreaterThan(-1);
    expect(comprando).toBeGreaterThan(confirmar);
  });
  it('un rechazo de la promesa de Stripe termina en la pantalla de fallo, no girando para siempre', () => {
    expect(pagar).toMatch(/try\s*\{\s*confirmacion = await stripe\.confirmCardSetup\(/);
    expect(pagar).toMatch(/catch \(e\) \{[\s\S]*?setFase\('fallo'\)/);
  });
  it('el botón Pagar se bloquea mientras se confirma la tarjeta (sin doble envío)', () => {
    expect(fuente).toMatch(/disabled=\{[^}]*confirmandoTarjeta\}/);
  });
});
