import {
  ajustesAvisosSchema,
  asuntoAviso,
  MOMENTOS_POR_DEFECTO,
  momentoDeEstado,
  normalizarMomentos,
  textoAviso,
} from '../avisosCliente';

describe('Avisos al cliente de pedidos web', () => {
  it('cada estado con aviso tiene su momento; «en preparación» no avisa', () => {
    expect(momentoDeEstado('confirmed')).toBe('confirmado');
    expect(momentoDeEstado('ready')).toBe('listo');
    expect(momentoDeEstado('in_delivery')).toBe('en_camino');
    expect(momentoDeEstado('delivered')).toBe('entregado');
    expect(momentoDeEstado('rejected')).toBe('rechazado');
    expect(momentoDeEstado('cancelled')).toBe('rechazado');
    expect(momentoDeEstado('preparing')).toBeNull();
  });

  it('los valores por defecto son los del Figma y lo guardado se completa', () => {
    expect(MOMENTOS_POR_DEFECTO.en_camino).toEqual({ email: false, whatsapp: true });
    const m = normalizarMomentos({ listo: { email: false }, extraño: { email: true } });
    expect(m.listo).toEqual({ email: false, whatsapp: true });
    expect(Object.keys(m)).toHaveLength(6);
  });

  it('los ajustes se validan: correo y WhatsApp con forma, sin claves extra', () => {
    const base = { momentos: MOMENTOS_POR_DEFECTO, nombreVisible: 'Restaurante demo', responderA: 'pedidos@ejemplo.co', whatsapp: '+57 601 742 88 10' };
    expect(ajustesAvisosSchema.safeParse(base).success).toBe(true);
    expect(ajustesAvisosSchema.safeParse({ ...base, responderA: 'no-es-correo' }).success).toBe(false);
    expect(ajustesAvisosSchema.safeParse({ ...base, organization_id: 1 }).success).toBe(false);
  });

  it('el texto confirmado lleva horas, líneas y total como la vista previa del Figma', () => {
    const t = textoAviso('confirmado', {
      cliente: 'Ana Gómez', numero: 'WO-000412', negocio: 'Mi empresa', sucursal: 'Sucursal Principal',
      listoAprox: '14:35', entregaAprox: '15:00', zonaHoraria: 'America/Bogota',
      lineas: '2 × Bandeja paisa · 1 × Limonada', total: '$ 128.900', pagado: true,
    });
    expect(t).toContain('Hola Ana,');
    expect(t).toContain('Estará listo alrededor de las 14:35 y llegará a tu dirección alrededor de las 15:00 (America/Bogota).');
    expect(t).toContain('Total pagado: $ 128.900');
    expect(t).toContain('Mi empresa · Sucursal Principal');
    expect(asuntoAviso('confirmado', 'WO-000412')).toBe('Tu pedido WO-000412 está confirmado');
  });

  it('el rechazo lleva el motivo tal cual', () => {
    expect(textoAviso('rechazado', { cliente: 'Luis', numero: 'W-1', negocio: 'X', motivo: 'Sin domiciliarios' })).toContain('Motivo: Sin domiciliarios.');
  });
});
