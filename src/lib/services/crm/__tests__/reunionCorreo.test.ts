import { claveToastReunion, correoValido, destinatariosReunion, detalleAvisoReunion, sinMarcasDeVariable, textoReunion } from '../reunionCorreo';

describe('correo de la reunión', () => {
  test('sin correo del cliente solo entra el responsable', () => {
    expect(destinatariosReunion({ correoCliente: '  ', correoResponsable: 'Vendedor@Empresa.co' })).toEqual([
      { correo: 'vendedor@empresa.co', rol: 'responsable' },
    ]);
    expect(correoValido('no-es-correo')).toBeNull();
    expect(claveToastReunion({ responsable: true })).toBe('reunionCorreoResponsable');
    expect(detalleAvisoReunion({ responsable: true })).toContain('responsable');
  });

  test('con correo del cliente van los dos, y la misma dirección no se duplica', () => {
    expect(destinatariosReunion({
      correoCliente: 'cliente@ejemplo.co',
      correoResponsable: 'vendedor@empresa.co',
      otros: ['cliente@ejemplo.co', 'Sala@ejemplo.co'],
    }).map((d) => d.rol)).toEqual(['cliente', 'responsable', 'participante']);
    expect(destinatariosReunion({ correoCliente: 'mismo@ejemplo.co', correoResponsable: 'mismo@ejemplo.co' })).toEqual([
      { correo: 'mismo@ejemplo.co', rol: 'cliente' },
    ]);
    expect(claveToastReunion({ cliente: true, responsable: true })).toBe('reunionCorreo');
    expect(claveToastReunion({ cliente: true })).toBe('reunionCorreoCliente');
    expect(claveToastReunion(null)).toBe('reunion');
  });

  test('el texto lleva el horario y no interpreta llaves del título', () => {
    const copia = textoReunion({
      titulo: 'Demo {{nombre}}',
      cuando: '01/10/2026 10:00–11:00',
      zona: 'America/Bogota',
      cliente: 'Cliente de prueba',
      lugar: 'Sala <principal>',
      conArchivo: true,
    });
    expect(sinMarcasDeVariable('{{x}}')).toBe('{x}');
    expect(copia.asunto).toBe('Reunión: Demo {nombre}');
    expect(copia.texto).toContain('01/10/2026 10:00–11:00');
    expect(copia.texto).toContain('America/Bogota');
    expect(copia.texto).toContain('Cliente de prueba');
    expect(copia.html).toContain('Sala &lt;principal&gt;');
    expect(copia.html).not.toContain('{{');
  });
});
