import { aplicarEstiloTarjeta, contadorCantidadActivo, guardarCambioTarjeta } from '@/lib/website/tarjetaProducto';

describe('add.quantity_stepper («Contador de cantidad»)', () => {
  const circulo = { button_style: 'icon_only', button_shape: 'circle' } as const;
  it('por defecto apagado', () => {
    expect(contadorCantidadActivo(undefined)).toBe(false);
    expect(contadorCantidadActivo({ ...circulo })).toBe(false);
    expect(aplicarEstiloTarjeta({ add: { ...circulo, quantity_stepper: false } })?.add).not.toHaveProperty('quantity_stepper');
  });
  it('solo cuenta con icon_only + circle', () => {
    expect(contadorCantidadActivo({ ...circulo, quantity_stepper: true })).toBe(true);
    expect(contadorCantidadActivo({ button_style: 'solid', button_shape: 'pill', quantity_stepper: true })).toBe(false);
  });
  it('el interruptor guarda true y al apagar borra la clave', () => {
    const on = guardarCambioTarjeta({ add: { ...circulo } }, 'add.quantity_stepper', true);
    expect(on.add?.quantity_stepper).toBe(true);
    const off = guardarCambioTarjeta(on, 'add.quantity_stepper', undefined);
    expect(off.add).not.toHaveProperty('quantity_stepper');
  });
});
