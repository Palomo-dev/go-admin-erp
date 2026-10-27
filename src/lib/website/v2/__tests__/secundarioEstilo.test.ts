import { ajustesVivosDeEstilo, mismoEstilo, secundarioDe, secundarioEfectivo, type EstiloEditable } from '../tokensEstilo';

const base: EstiloEditable = {
  preset: null, modo: 'light', fondo: '#FFFFFF', texto: '#111111', acento: '#2563EB',
  fuenteTitulos: 'Inter', fuenteCuerpo: 'Inter', radio: 4, estiloBoton: 'solido', movimiento: 'bajo',
};

describe('color secundario del sitio', () => {
  it('sin elegir usa el derivado del estilo', () => {
    expect(secundarioEfectivo(base)).toBe(secundarioDe(base));
    expect(ajustesVivosDeEstilo(base).secondary_color).toBe('#111111');
  });
  it('elegido a mano se respeta y cuenta como cambio', () => {
    const conSec = { ...base, secundario: '#FF8800' };
    expect(ajustesVivosDeEstilo(conSec).secondary_color).toBe(secundarioEfectivo(conSec));
    expect(secundarioEfectivo(conSec).toLowerCase()).toBe('#ff8800');
    expect(mismoEstilo(base, conSec, false)).toBe(false);
  });
});
