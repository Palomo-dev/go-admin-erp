import { htmlAviso, textoPlanoAviso, urlAbsoluta } from '../correo';
import {
  clasificarVencimiento,
  correoPermitido,
  enNoMolestar,
  eventoVencimiento,
  fusionarTiposAviso,
  gruposActivos,
  minutosEnZona,
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
    expect(guardado).toEqual(['tarea.asignada', 'oportunidad.asignada', 'tarea.completada']);
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
