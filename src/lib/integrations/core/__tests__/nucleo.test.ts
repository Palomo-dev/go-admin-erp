/**
 * Núcleo de integraciones de logística: errores tipados, estados canónicos, redacción de
 * secretos, cliente HTTP (timeout y reintento solo idempotente), formulario de conexión, peso y
 * registro de adaptadores (catálogo honesto).
 */
import {
  AuthError,
  IntegrationError,
  NotConfiguredError,
  ProviderUnavailableError,
  RateLimitError,
  ValidationError,
  errorParaUI,
  esErrorIntegracion,
} from '../errores';
import { ESTADOS_CANONICOS, ESTADO_ENVIO_POR_CANONICO, ESTADO_PEDIDO_WEB_POR_CANONICO, avanza, esEstadoCanonico } from '../estados';
import { redactar, redactarTexto } from '../redaccion';
import { solicitar } from '../http';
import { faltanRequeridos, leerEsquema, validarValores, type EsquemaConexion } from '../esquemaConexion';
import { paqueteParaGuia, resolverPesoEnvio } from '../peso';
import { codigosRegistrados, entradaRegistro, motivoNoConectable, puedeConectarLogistica } from '../registro';

describe('errores tipados', () => {
  test('cada error lleva código estable, reintentable y mensaje para la UI', () => {
    const casos: [IntegrationError, string, boolean][] = [
      [new NotConfiguredError('coordinadora', 'sin adaptador'), 'NOT_CONFIGURED', false],
      [new AuthError('coordinadora'), 'AUTH', false],
      [new ValidationError('coordinadora', 'falta peso', ['peso']), 'VALIDATION', false],
      [new RateLimitError('coordinadora', 3000), 'RATE_LIMIT', true],
      [new ProviderUnavailableError('coordinadora'), 'PROVIDER_UNAVAILABLE', true],
    ];
    for (const [err, codigo, reintentable] of casos) {
      expect(esErrorIntegracion(err)).toBe(true);
      expect(err.codigo).toBe(codigo);
      expect(err.reintentable).toBe(reintentable);
      expect(err.name).toBe(err.constructor.name);
    }
  });

  test('errorParaUI nunca expone el detalle de un error desconocido', () => {
    expect(errorParaUI(new Error('password=abc123 en la URL'))).toEqual({
      codigo: 'INTERNAL',
      mensaje: expect.not.stringContaining('abc123'),
      reintentable: false,
    });
    expect(errorParaUI(new NotConfiguredError('envia', 'Esperando doc.'))).toEqual({ codigo: 'NOT_CONFIGURED', mensaje: 'Esperando doc.', reintentable: false });
  });
});

describe('estados canónicos', () => {
  test('cada estado canónico tiene traducción (o null explícito) a shipments.status', () => {
    const permitidos = ['draft', 'pending', 'assigned', 'ready', 'picked', 'dispatched', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned', 'cancelled'];
    for (const e of ESTADOS_CANONICOS) {
      expect(e in ESTADO_ENVIO_POR_CANONICO).toBe(true);
      const s = ESTADO_ENVIO_POR_CANONICO[e];
      if (s !== null) expect(permitidos).toContain(s);
    }
    expect(ESTADO_ENVIO_POR_CANONICO.exception).toBeNull();
  });

  test('el pedido web solo cambia con salida a reparto y entrega', () => {
    expect(ESTADO_PEDIDO_WEB_POR_CANONICO).toEqual({ out_for_delivery: 'in_delivery', delivered: 'delivered' });
  });

  test('un evento atrasado no hace retroceder el envío y los finales no se mueven', () => {
    expect(avanza(null, 'created')).toBe(true);
    expect(avanza('in_transit', 'out_for_delivery')).toBe(true);
    expect(avanza('out_for_delivery', 'in_transit')).toBe(false);
    expect(avanza('out_for_delivery', 'exception')).toBe(true);
    expect(avanza('delivered', 'in_transit')).toBe(false);
    expect(avanza('cancelled', 'delivered')).toBe(false);
    expect(esEstadoCanonico('entregado')).toBe(false);
  });
});

describe('redacción de secretos', () => {
  test('por clave sensible y por valor conocido, sin tocar el original', () => {
    const original = { usuario: 'tienda', clave: 'S3cret0!', anidado: { apikey: 'k-123456', nota: 'la llave es k-123456' }, lista: ['S3cret0!'] };
    const r = redactar(original, ['k-123456', 'S3cret0!']) as typeof original;
    expect(r.usuario).toBe('tienda');
    expect(r.clave).toBe('[redactado]');
    expect(r.anidado.apikey).toBe('[redactado]');
    expect(r.anidado.nota).toBe('la llave es [redactado]');
    expect(r.lista).toEqual(['[redactado]']);
    expect(original.clave).toBe('S3cret0!');
    expect(redactarTexto('<pwd>S3cret0!</pwd>', ['S3cret0!'])).toBe('<pwd>[redactado]</pwd>');
  });
});

describe('cliente HTTP', () => {
  const sinEspera = async () => {};
  const respuesta = (status: number, texto = '', headers: Record<string, string> = {}) =>
    ({ status, text: async () => texto, headers: new Headers(headers) }) as unknown as Response;

  test('reintenta un 5xx solo si la operación es idempotente', async () => {
    const fetchIdem = jest.fn().mockResolvedValueOnce(respuesta(503)).mockResolvedValueOnce(respuesta(200, 'ok'));
    await expect(solicitar({ proveedor: 'p', url: 'https://x', idempotente: true, fetchImpl: fetchIdem, esperarImpl: sinEspera })).resolves.toMatchObject({ status: 200, texto: 'ok' });
    expect(fetchIdem).toHaveBeenCalledTimes(2);

    const fetchCrear = jest.fn().mockResolvedValue(respuesta(503));
    await expect(solicitar({ proveedor: 'p', url: 'https://x', idempotente: false, fetchImpl: fetchCrear, esperarImpl: sinEspera })).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(fetchCrear).toHaveBeenCalledTimes(1);
  });

  test('un fallo de red al crear (no idempotente) no se reintenta: no se generan dos guías', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
    await expect(solicitar({ proveedor: 'p', url: 'https://x', idempotente: false, fetchImpl, esperarImpl: sinEspera })).rejects.toMatchObject({ codigo: 'PROVIDER_UNAVAILABLE' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('401 → AuthError sin reintento; 429 → RateLimitError con Retry-After', async () => {
    const f401 = jest.fn().mockResolvedValue(respuesta(401));
    await expect(solicitar({ proveedor: 'p', url: 'https://x', idempotente: true, fetchImpl: f401, esperarImpl: sinEspera })).rejects.toBeInstanceOf(AuthError);
    expect(f401).toHaveBeenCalledTimes(1);

    const f429 = jest.fn().mockResolvedValue(respuesta(429, '', { 'retry-after': '7' }));
    await expect(solicitar({ proveedor: 'p', url: 'https://x', idempotente: false, fetchImpl: f429 })).rejects.toMatchObject({ codigo: 'RATE_LIMIT', reintentarEnMs: 7000 });
  });

  test('timeout → ProviderUnavailableError con motivo timeout', async () => {
    const fetchImpl = jest.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('abort'), { name: 'AbortError' })));
      }),
    ) as unknown as typeof fetch;
    await expect(solicitar({ proveedor: 'p', url: 'https://x', idempotente: false, timeoutMs: 10, fetchImpl })).rejects.toMatchObject({
      codigo: 'PROVIDER_UNAVAILABLE',
      detalle: { motivo: 'timeout' },
    });
  });

  test('4xx de negocio se devuelve al adaptador para que lea el cuerpo de su proveedor', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(respuesta(400, '<faultstring>ciudad</faultstring>'));
    await expect(solicitar({ proveedor: 'p', url: 'https://x', idempotente: true, fetchImpl })).resolves.toMatchObject({ status: 400 });
  });
});

describe('formulario de conexión', () => {
  const esquema: EsquemaConexion = leerEsquema({
    version: 1,
    ambientes: ['sandbox', 'production'],
    campos: [
      { clave: 'nit', etiqueta: 'NIT', tipo: 'texto', requerido: true, secreto: false },
      { clave: 'apikey', etiqueta: 'API key', tipo: 'secreto', requerido: true, secreto: true },
      { clave: 'id_cliente', etiqueta: 'Id cliente', tipo: 'numero', requerido: true, secreto: false },
      { clave: 'pais', etiqueta: 'País', tipo: 'seleccion', requerido: false, secreto: false, opciones: ['CO'] },
    ],
  })!;

  test('esquema inválido → null (el conector no tiene formulario)', () => {
    expect(leerEsquema(null)).toBeNull();
    expect(leerEsquema({ campos: [{ clave: 'Mala Clave', etiqueta: 'x', tipo: 'texto' }] })).toBeNull();
    expect(leerEsquema({ campos: [{ clave: 'x', etiqueta: 'x', tipo: 'otro' }] })).toBeNull();
  });

  test('un campo tipo secreto siempre va al Vault aunque no diga secreto: true', () => {
    expect(leerEsquema({ campos: [{ clave: 'pwd', etiqueta: 'pwd', tipo: 'secreto' }] })!.campos[0].secreto).toBe(true);
  });

  test('separa secretos (Vault) de ajustes y valida tipos', () => {
    const r = validarValores(esquema, { nit: ' 900123 ', apikey: 'abc', id_cliente: '42', pais: 'CO' });
    expect(r).toEqual({ ok: true, valores: { secretos: { apikey: 'abc' }, ajustes: { nit: '900123', id_cliente: 42, pais: 'CO' } } });
    expect(validarValores(esquema, { nit: '1', apikey: 'a', id_cliente: 'x' })).toMatchObject({ ok: false, errores: { id_cliente: 'Debe ser un número.' } });
    expect(validarValores(esquema, { nit: '1', apikey: 'a', id_cliente: '1', pais: 'MX' })).toMatchObject({ ok: false, errores: { pais: 'Opción no válida.' } });
    expect(validarValores(esquema, { nit: '1', apikey: 'a', id_cliente: '1', organization_id: 9 })).toMatchObject({ ok: false });
  });

  test('en edición, un secreto ya guardado puede venir vacío', () => {
    expect(validarValores(esquema, { nit: '1', id_cliente: '1' })).toMatchObject({ ok: false, errores: { apikey: 'Obligatorio.' } });
    expect(validarValores(esquema, { nit: '1', id_cliente: '1' }, new Set(['apikey']))).toMatchObject({ ok: true, valores: { secretos: {} } });
    expect(faltanRequeridos(esquema, new Set(['nit']))).toEqual(['apikey', 'id_cliente']);
  });
});

describe('peso del envío', () => {
  test('producto → categoría → organización, y sin peso no hay guía', () => {
    const r = resolverPesoEnvio(
      [
        { nombre: 'A', cantidad: 2, pesoKg: 0.5 },
        { nombre: 'B', cantidad: 1, pesoCategoriaKg: 1.2 },
        { nombre: 'C', cantidad: 3 },
      ],
      0.3,
    );
    expect(r.pesoKg).toBe(3.1);
    expect(r.detalle.map((d) => d.fuente)).toEqual(['producto', 'categoria', 'organizacion']);
    expect(resolverPesoEnvio([{ nombre: 'C', cantidad: 1 }]).pesoKg).toBeNull();
    expect(resolverPesoEnvio([]).pesoKg).toBeNull();
  });

  test('paqueteParaGuia exige peso (nunca inventa 1 kg)', () => {
    expect(() => paqueteParaGuia('coordinadora', [{ nombre: 'Tenis', cantidad: 1 }])).toThrow(ValidationError);
    expect(() => paqueteParaGuia('coordinadora', [{ nombre: 'Tenis', cantidad: 1 }])).toThrow(/Tenis/);
    expect(paqueteParaGuia('coordinadora', [{ cantidad: 2, pesoKg: 0.8 }], { largoCm: 30, anchoCm: 20, altoCm: 10 })).toEqual({
      pesoKg: 1.6,
      unidades: 1,
      largoCm: 30,
      anchoCm: 20,
      altoCm: 10,
    });
  });
});

describe('registro de adaptadores: catálogo honesto', () => {
  test('solo transportadoras y dropshipping registrados; Rappi, iFood y Uber Eats no se pueden conectar', () => {
    expect(codigosRegistrados().sort()).toEqual(['coordinadora', 'dropi', 'effi', 'envia', 'interrapidisimo', 'servientrega']);
    for (const code of ['rappi', 'ifood', 'ubereats']) {
      expect(puedeConectarLogistica(code)).toBe(false);
      expect(motivoNoConectable(code)).toMatch(/Próximamente/);
    }
  });

  test('Effi y Dropi son de la Fase 5: «Próximamente»', () => {
    expect(puedeConectarLogistica('dropi')).toBe(false);
    expect(puedeConectarLogistica('effi')).toBe(false);
  });

  test('coming_soon en la base gana aunque el registro lo permita', () => {
    expect(puedeConectarLogistica('coordinadora')).toBe(true);
    expect(puedeConectarLogistica('coordinadora', { status: 'coming_soon' })).toBe(false);
  });

  test('las transportadoras usan un api_provider permitido por el CHECK de transport_carriers', () => {
    const permitidos = ['coordinadora', 'envia', 'servientrega', 'tcc', 'interrapidisimo', 'deprisa', 'shippo', 'other'];
    for (const code of codigosRegistrados()) {
      const e = entradaRegistro(code)!;
      if (e.creaTransportadora) expect(permitidos).toContain(e.apiProvider);
      else expect(e.apiProvider).toBeUndefined();
    }
  });

  test('un adaptador pendiente nunca simula respuesta: lanza NotConfiguredError', async () => {
    for (const code of codigosRegistrados()) {
      const { adaptador } = entradaRegistro(code)!.crear();
      await expect(
        adaptador.validateCredentials({ organizationId: 1, connectionId: 'c', environment: 'sandbox', credenciales: {} }),
      ).rejects.toBeInstanceOf(NotConfiguredError);
    }
  });
});
