import {
  PESTANAS_HRM,
  PESTANAS_JEFE,
  contadorDePestana,
  mostrarPestanaAprobaciones,
  muestraPestanasHrm,
  pestanaHrmActiva,
  pestanasDeVista,
} from '../navHrmLogica';

describe('pestañas de Recursos humanos', () => {
  it('la lista de cada pestaña muestra la barra; el detalle y los formularios no', () => {
    expect(muestraPestanasHrm('/app/hrm/empleados')).toBe(true);
    expect(muestraPestanasHrm('/app/hrm/areas')).toBe(true);
    expect(muestraPestanasHrm('/app/hrm/turnos')).toBe(true);
    expect(muestraPestanasHrm('/app/hrm/mi-equipo')).toBe(true);
    expect(muestraPestanasHrm('/app/hrm/empleados/0b3234e0-eb69-4b72-8853-1bb84184a22e')).toBe(false);
    expect(muestraPestanasHrm('/app/hrm/empleados/nuevo')).toBe(false);
    expect(muestraPestanasHrm('/app/hrm/nomina')).toBe(false);
  });

  it('la pestaña activa sale del prefijo', () => {
    expect(pestanaHrmActiva('/app/hrm/cargos/123/editar')).toBe('/app/hrm/cargos');
    expect(pestanaHrmActiva('/app/hrm/novedades')).toBe('/app/hrm/novedades');
    expect(pestanaHrmActiva('/app/hrm/nomina')).toBeNull();
  });

  it('decisión 1: RR. HH. ve 9 pestañas y el jefe 6, con «Mi equipo» primero', () => {
    expect(PESTANAS_HRM).toHaveLength(9);
    expect(PESTANAS_JEFE).toHaveLength(6);
    expect(PESTANAS_JEFE[0]).toBe('/app/hrm/mi-equipo');
    expect(pestanasDeVista('jefe')).toBe(PESTANAS_JEFE);
    expect(pestanasDeVista('rrhh')).toBe(PESTANAS_HRM);
    expect(pestanasDeVista('ninguna')).toBe(PESTANAS_HRM);
    expect(PESTANAS_JEFE).not.toContain('/app/hrm/empleados');
    expect(PESTANAS_HRM).not.toContain('/app/hrm/mi-equipo');
  });

  it('Aprobaciones solo con algo pendiente o estando en ella', () => {
    expect(mostrarPestanaAprobaciones(0, '/app/hrm/empleados')).toBe(false);
    expect(mostrarPestanaAprobaciones(null, '/app/hrm/empleados')).toBe(false);
    expect(mostrarPestanaAprobaciones(3, '/app/hrm/empleados')).toBe(true);
    expect(mostrarPestanaAprobaciones(0, '/app/hrm/aprobaciones')).toBe(true);
  });

  it('contadores: empleados, novedades, mi equipo y aprobaciones; nunca un cero', () => {
    const c = { empleados: 46, novedades: 12, equipo: 9 };
    expect(contadorDePestana('/app/hrm/empleados', c, 7)).toBe(46);
    expect(contadorDePestana('/app/hrm/novedades', c, 7)).toBe(12);
    expect(contadorDePestana('/app/hrm/mi-equipo', c, 7)).toBe(9);
    expect(contadorDePestana('/app/hrm/aprobaciones', c, 7)).toBe(7);
    expect(contadorDePestana('/app/hrm/turnos', c, 7)).toBeNull();
    expect(contadorDePestana('/app/hrm/novedades', { novedades: 0 }, 0)).toBeNull();
  });
});
