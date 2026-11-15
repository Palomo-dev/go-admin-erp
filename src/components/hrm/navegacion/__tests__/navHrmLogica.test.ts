import { mostrarPestanaAprobaciones, muestraPestanasHrm, pestanaHrmActiva } from '../navHrmLogica';

describe('pestañas de Recursos humanos', () => {
  it('la lista de cada pestaña muestra la barra; el detalle y los formularios no', () => {
    expect(muestraPestanasHrm('/app/hrm/empleados')).toBe(true);
    expect(muestraPestanasHrm('/app/hrm/areas')).toBe(true);
    expect(muestraPestanasHrm('/app/hrm/empleados/0b3234e0-eb69-4b72-8853-1bb84184a22e')).toBe(false);
    expect(muestraPestanasHrm('/app/hrm/empleados/nuevo')).toBe(false);
    expect(muestraPestanasHrm('/app/hrm/turnos')).toBe(false);
  });

  it('la pestaña activa sale del prefijo', () => {
    expect(pestanaHrmActiva('/app/hrm/cargos/123/editar')).toBe('/app/hrm/cargos');
    expect(pestanaHrmActiva('/app/hrm/nomina')).toBeNull();
  });

  it('Aprobaciones solo con algo pendiente o estando en ella', () => {
    expect(mostrarPestanaAprobaciones(0, '/app/hrm/empleados')).toBe(false);
    expect(mostrarPestanaAprobaciones(null, '/app/hrm/empleados')).toBe(false);
    expect(mostrarPestanaAprobaciones(3, '/app/hrm/empleados')).toBe(true);
    expect(mostrarPestanaAprobaciones(0, '/app/hrm/aprobaciones')).toBe(true);
  });
});
