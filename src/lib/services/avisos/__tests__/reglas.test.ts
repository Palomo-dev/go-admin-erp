import { htmlAviso, textoCartera, textoContacto, textoInventarioCero, textoPlanoAviso, unirSeguimientoYCierre, urlAbsoluta } from '../correo';
import {
  clasificarVencimiento,
  correoPermitido,
  cruzoMinimo,
  enNoMolestar,
  esHoraDeResumen,
  eventoVencimiento,
  fusionarTiposAviso,
  gruposActivos,
  minutosEnZona,
  productoAvisable,
  tiposDesdeGrupos,
} from '../reglas';

describe('avisos al miembro', () => {
  test('el arreglo vacio deja pasar todos los eventos y ninguno los apaga', () => {
    expect(correoPermitido([], 'tarea.asignada', false)).toBe(true);
    expect(correoPermitido(null, 'tarea.vence', false)).toBe(true);
    expect(correoPermitido(['ninguno'], 'tarea.asignada', false)).toBe(false);
    expect(correoPermitido(['tarea.asignada'], 'oportunidad.etapa', false)).toBe(false);
    expect(correoPermitido(['tarea.asignada'], 'tarea.asignada', true)).toBe(false);
  });

  test('los grupos del perfil se guardan sin perder el significado de vacio', () => {
    const todos = gruposActivos([]);
    expect(tiposDesdeGrupos(todos)).toEqual([]);
    const apagados = gruposActivos(['ninguno']);
    expect(Object.values(apagados).every((activo) => !activo)).toBe(true);
    expect(tiposDesdeGrupos(apagados)).toEqual(['ninguno']);
    const soloEtapa = { ...todos, 'oportunidad.etapa': false, vence: false };
    const guardado = tiposDesdeGrupos(soloEtapa);
    expect(guardado).toEqual([
      'tarea.asignada',
      'oportunidad.asignada',
      'tarea.completada',
      'oportunidad.ganada',
      'oportunidad.perdida',
      'oportunidad.contacto',
      'caja.diferencia',
      'cartera.resumen',
      'inventario.cero',
      'inventario.bajo',
    ]);
    expect(gruposActivos(guardado).vence).toBe(false);
    expect(gruposActivos(guardado)['tarea.completada']).toBe(true);
    const conOtro = fusionarTiposAviso(['stock_low'], todos);
    expect(conOtro).toContain('stock_low');
    expect(conOtro).toContain('tarea.asignada');
    expect(correoPermitido(conOtro, 'tarea.asignada', false)).toBe(true);
    expect(fusionarTiposAviso(['stock_low'], apagados)).toEqual(['stock_low', 'ninguno']);
    expect(fusionarTiposAviso([], todos)).toEqual([]);
  });

  test('vence hoy y atrasada son excluyentes', () => {
    expect(clasificarVencimiento('2026-10-01', '2026-10-01', true)).toBe('vence');
    expect(clasificarVencimiento('2026-09-30', '2026-10-01', true)).toBe('atrasada');
    expect(clasificarVencimiento('2026-10-02', '2026-10-01', true)).toBeNull();
    expect(clasificarVencimiento('2026-09-30', '2026-10-01', false)).toBeNull();
    expect(eventoVencimiento('task', 'atrasada')).toBe('tarea.atrasada');
    expect(eventoVencimiento('opportunity', 'vence')).toBe('oportunidad.vence');
    expect(eventoVencimiento('opportunity', 'atrasada')).toBe('oportunidad.atrasada');
  });

  test('el no molestar cruza la medianoche y no pausa si las horas coinciden', () => {
    expect(enNoMolestar('22:00', '08:00', 23 * 60)).toBe(true);
    expect(enNoMolestar('22:00', '08:00', 7 * 60)).toBe(true);
    expect(enNoMolestar('22:00', '08:00', 12 * 60)).toBe(false);
    expect(enNoMolestar('22:00:00', '08:00:00', 22 * 60)).toBe(true);
    expect(enNoMolestar('13:00', '13:00', 13 * 60)).toBe(false);
    expect(enNoMolestar(null, '08:00', 7 * 60)).toBe(false);
    expect(minutosEnZona(new Date('2026-10-01T17:00:00.000Z'), 'America/Bogota')).toBe(12 * 60);
    expect(esHoraDeResumen(7 * 60)).toBe(true);
    expect(esHoraDeResumen(6 * 60 + 59)).toBe(false);
  });

  test('una lista vieja completa deja prendidos los avisos nuevos', () => {
    const vieja = [
      'tarea.asignada', 'oportunidad.asignada', 'oportunidad.etapa', 'tarea.completada',
      'tarea.atrasada', 'tarea.vence', 'oportunidad.vence', 'oportunidad.atrasada', 'stock_low',
    ];
    const activos = gruposActivos(vieja);
    expect(activos['oportunidad.cierre']).toBe(true);
    expect(activos.inventario).toBe(true);
    expect(activos['caja.diferencia']).toBe(true);
    const guardado = fusionarTiposAviso(vieja, activos);
    expect(guardado).toContain('inventario.cero');
    expect(guardado).toContain('stock_low');
    expect(correoPermitido(guardado, 'cartera.resumen', false)).toBe(true);
  });

  test('el stock avisa por la variante y solo al cruzar el mínimo', () => {
    expect(productoAvisable({ trackStock: true, eliminado: false, esPadre: true, hijosVivos: 2, padreEliminado: false })).toBe(false);
    expect(productoAvisable({ trackStock: true, eliminado: false, esPadre: false, hijosVivos: 0, padreEliminado: false })).toBe(true);
    expect(productoAvisable({ trackStock: true, eliminado: false, esPadre: false, hijosVivos: 0, padreEliminado: true })).toBe(false);
    expect(productoAvisable({ trackStock: false, eliminado: false, esPadre: false, hijosVivos: 0, padreEliminado: false })).toBe(false);
    expect(cruzoMinimo(10, 3, 8)).toBe(true);
    expect(cruzoMinimo(3, 2, 8)).toBe(false);
    expect(cruzoMinimo(10, 0, 8)).toBe(false);
    expect(cruzoMinimo(10, 3, null)).toBe(false);
  });

  test('el seguimiento y el cierre del mismo día salen en un solo texto', () => {
    const contacto = textoContacto('Pedido');
    expect(contacto.cuerpo).toBe('«Pedido» tiene seguimiento hoy.');
    expect(unirSeguimientoYCierre(contacto.cuerpo, 'vence')).toBe('«Pedido» tiene seguimiento hoy y también llega hoy a su fecha de cierre.');
    expect(unirSeguimientoYCierre(contacto.cuerpo, 'atrasada')).toContain('su fecha de cierre ya pasó');
    expect(textoCartera({ porCobrar: 0, saldoCobrar: '$ 0', porPagar: 0, saldoPagar: '$ 0' })).toBeNull();
    expect(textoCartera({ porCobrar: 2, saldoCobrar: '$ 10', porPagar: 1, saldoPagar: '$ 4' })?.cuerpo).toContain('$ 10');
    const cero = textoInventarioCero([
      { sucursal: 'Centro', nombres: ['Camiseta (M, Azul)', 'Camiseta (S, Azul)'] },
    ]);
    expect(cero?.titulo).toBe('Productos en cero');
    expect(cero?.cuerpo).toContain('«Camiseta (M, Azul)»');
    const mismaSucursal = textoInventarioCero([
      { sucursal: 'Centro', nombres: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] },
    ]);
    expect(mismaSucursal?.cuerpo).toContain('y 2 más');
    expect(mismaSucursal?.cuerpo).not.toContain('otras sucursales');
    const otraSucursal = textoInventarioCero([
      { sucursal: 'Centro', nombres: ['1', '2', '3', '4', '5', '6', '7', '8'] },
      { sucursal: 'Norte', nombres: ['9', '10', '11'] },
    ]);
    expect(otraSucursal?.cuerpo).toContain('Y 3 más en otras sucursales');
    expect(textoInventarioCero([])).toBeNull();
  });

  test('el correo usa la firma sobre superficie y el boton de accion', () => {
    const html = htmlAviso({
      titulo: 'Se completó una tarea',
      cuerpo: 'Alguien completó la tarea «Pedido».',
      enlace: 'https://app.goadmin.io/app/pm/tareas?taskId=1',
    });
    expect(html).toContain('#4361EE');
    expect(html).toContain('#3651D4');
    expect(html).toContain('>GO</span>');
    expect(html).toContain('Admin</span>');
    expect(html).toContain('Puede silenciar estos avisos en su perfil.');
    expect(html).not.toContain('background:#3651D4;color:#ffffff;font-weight:700;font-size:11px');
    expect(textoPlanoAviso({ titulo: 'Aviso', cuerpo: 'Cuerpo', enlace: 'https://app.goadmin.io/x' })).toContain('https://app.goadmin.io/x');
    const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.goadmin.io').replace(/\/$/, '');
    expect(urlAbsoluta('/app/crm/oportunidades/1')).toBe(`${base}/app/crm/oportunidades/1`);
  });
});
