/** Logos del catálogo: cada servicio tiene símbolo o iniciales; nunca queda vacío. */
import { SERVICIOS } from '@/lib/services/integrations/conexiones/catalogoConexiones';
import { INICIALES_PROVISIONALES, inicialesDeServicio, tieneSimbolo } from '../logos/logoLogica';

describe('logos de Conexiones', () => {
  it('los 30 servicios del catálogo tienen símbolo o iniciales aprobadas (o derivadas)', () => {
    expect(SERVICIOS).toHaveLength(30);
    for (const s of SERVICIOS) {
      expect(tieneSimbolo(s.id) || inicialesDeServicio(s.id).length > 0).toBe(true);
    }
  });

  it('usa las iniciales aprobadas en Figma para las marcas provisionales', () => {
    expect(inicialesDeServicio('wompi')).toBe('W');
    expect(inicialesDeServicio('payu')).toBe('PU');
    expect(inicialesDeServicio('booking')).toBe('B.');
    expect(inicialesDeServicio('interrapidisimo')).toBe('IR');
    for (const id of Object.keys(INICIALES_PROVISIONALES)) expect(tieneSimbolo(id)).toBe(false);
  });

  it('un proveedor nuevo de la base recibe iniciales derivadas de su id', () => {
    expect(inicialesDeServicio('nuevo_proveedor')).toBe('NP');
    expect(inicialesDeServicio('kushki')).toBe('Ku');
    expect(inicialesDeServicio('___')).toBe('?');
  });
});
