/**
 * ¿El cliente pregunta por productos? — casos tomados de las conversaciones
 * reales analizadas el 2026-09-09.
 */
import {
  decidirBusquedaCatalogo,
  extraerTokens,
  normalizar,
  pareceCortesia,
  pareceSoporte,
  quitarDatosDeContacto,
} from '../../../supabase/functions/_shared/ai-chat/intencionConsulta';

describe('normalizar — debe coincidir con normalizar_busqueda() de Postgres', () => {
  it('quita tildes', () => {
    expect(normalizar('Pocillo Apilable Café')).toBe('pocillo apilable cafe');
    expect(normalizar('Aciclovir Ungüento')).toBe('aciclovir unguento');
  });

  it('borra el apóstrofo en vez de convertirlo en espacio', () => {
    // Si fuera espacio daría "men s" y el cliente escribe "mens".
    expect(normalizar("On Running Men's Performance-T - S"))
      .toBe('on running mens performance t s');
  });

  it('convierte el resto de signos en espacio', () => {
    expect(normalizar('Cognac Remy Martin VSOP Botella - 700ml'))
      .toBe('cognac remy martin vsop botella 700ml');
  });
});

describe('quitarDatosDeContacto', () => {
  it('quita el correo que se usaba como término de búsqueda 132 veces', () => {
    const r = quitarDatosDeContacto('escriban a servicio@ventaonline.com por favor');
    expect(r).not.toContain('servicio');
    expect(r).not.toContain('ventaonline');
  });

  it('quita el teléfono que se buscaba 78 veces', () => {
    expect(quitarDatosDeContacto('mi numero es 3045635752')).not.toContain('3045635752');
  });

  it('quita enlaces', () => {
    expect(quitarDatosDeContacto('vi esto en https://tienda.com/x')).not.toContain('tienda.com');
  });

  it('NO se come una consulta legítima de tallas', () => {
    // Una regla basada solo en la forma borraría "42 43 44" por parecer numero.
    const r = quitarDatosDeContacto('tienen talla 42 43 44');
    expect(r).toContain('42');
    expect(r).toContain('44');
  });
});

describe('pareceCortesia', () => {
  it.each(['Hola', 'hola', 'Buenas', 'buenos dias', 'Gracias', 'ok', 'listo', 'Chao'])(
    'reconoce «%s»', (t) => expect(pareceCortesia(t)).toBe(true)
  );

  it('no confunde una consulta real con cortesía', () => {
    expect(pareceCortesia('tienen pocillos')).toBe(false);
    expect(pareceCortesia('busco nevera samsung')).toBe(false);
  });

  // Caso real (captura del 2026-09-10): el patrón anterior daba por cortesía
  // cualquier mensaje que EMPEZARA por un saludo, así que "Hola, tienen
  // armarios?" no consultaba el catálogo y el bot respondía que no tenía
  // armarios teniendo decenas.
  it('un saludo SEGUIDO de una pregunta no es cortesía', () => {
    expect(pareceCortesia('Hola, tienen armarios?')).toBe(false);
    expect(pareceCortesia('hola busco vasos')).toBe(false);
    expect(pareceCortesia('buenas tardes, tienen neveras')).toBe(false);
    expect(pareceCortesia('gracias, y tienen ollas?')).toBe(false);
  });

  it('sigue reconociendo la cortesía de varias palabras', () => {
    expect(pareceCortesia('hola buenas tardes')).toBe(true);
    expect(pareceCortesia('muchas gracias')).toBe(true);
    expect(pareceCortesia('ok listo gracias')).toBe(true);
    expect(pareceCortesia('de acuerdo')).toBe(true);
  });
});

describe('el saludo no puede tapar la consulta', () => {
  it('«Hola, tienen armarios?» SÍ busca en el catálogo', () => {
    const d = decidirBusquedaCatalogo('Hola, tienen armarios?');
    expect(d.buscar).toBe(true);
    expect(d.tokens).toContain('armarios');
  });

  it('«hola busco vasos» SÍ busca', () => {
    const d = decidirBusquedaCatalogo('hola busco vasos');
    expect(d.buscar).toBe(true);
    expect(d.tokens).toContain('vasos');
  });

  it('«Buenas, tienen tenis New Balance?» SÍ busca', () => {
    const d = decidirBusquedaCatalogo('Buenas, tienen tenis New Balance?');
    expect(d.buscar).toBe(true);
    expect(d.tokens).toContain('balance');
  });
});

describe('pareceSoporte — los mensajes que hoy disparan búsquedas inútiles', () => {
  it.each([
    '¿cuándo llega mi pedido?',
    'hacen pago contraentrega?',
    'llevo un mes esperando el envio',
    'quiero un reembolso',
    'son unos estafadores',
    'puedo pagar con nequi',
    'la transportadora no ha entregado nada',
  ])('reconoce «%s»', (t) => expect(pareceSoporte(t)).toBe(true));

  it('no marca como soporte una consulta de catálogo', () => {
    expect(pareceSoporte('tienen pocillos apilables')).toBe(false);
    expect(pareceSoporte('busco tenis nike talla 42')).toBe(false);
  });
});

describe('extraerTokens', () => {
  it('descarta gramática y deja solo lo que puede nombrar un producto', () => {
    expect(extraerTokens('hola, ustedes tienen neveras?')).toEqual(['neveras']);
  });

  it('conserva marcas y modelos aunque sean extranjeros', () => {
    const t = extraerTokens('busco unos New Balance para hombre');
    expect(t).toContain('new');
    expect(t).toContain('balance');
    expect(t).toContain('hombre');
  });

  it('descarta números sueltos como palabra de búsqueda', () => {
    expect(extraerTokens('quiero 3 unidades')).not.toContain('3');
  });

  it('devuelve vacío en un saludo', () => {
    expect(extraerTokens('hola buenas tardes')).toEqual([]);
  });
});

describe('decidirBusquedaCatalogo — la decisión completa', () => {
  it('no busca en un saludo (el caso de la captura)', () => {
    const d = decidirBusquedaCatalogo('Hola');
    expect(d.buscar).toBe(false);
    expect(d.motivo).toBe('cortesia');
  });

  it('no busca en un reclamo', () => {
    const d = decidirBusquedaCatalogo('llevo un mes esperando, son unos estafadores');
    expect(d.buscar).toBe(false);
    expect(d.motivo).toBe('soporte');
  });

  it('no busca cuando el mensaje es solo un teléfono', () => {
    const d = decidirBusquedaCatalogo('3045635752');
    expect(d.buscar).toBe(false);
    expect(d.motivo).toBe('sin_palabras_utiles');
  });

  it('no busca cuando el mensaje es solo un correo', () => {
    const d = decidirBusquedaCatalogo('servicio@ventaonline.com');
    expect(d.buscar).toBe(false);
    expect(d.motivo).toBe('sin_palabras_utiles');
  });

  it('sí busca una consulta de producto, en cualquier vertical', () => {
    for (const consulta of [
      'tienen pocillos apilables',
      'busco perfume Al Haramain',
      'necesito acetaminofen',
      'tienen cerveza heineken',
      'quiero unos tenis New Balance',
    ]) {
      const d = decidirBusquedaCatalogo(consulta);
      expect(d.buscar).toBe(true);
      expect(d.tokens.length).toBeGreaterThan(0);
    }
  });

  it('la palabra «pedido» sola no convierte en soporte una consulta de producto', () => {
    // "pedido" está en el vocabulario de soporte: el mensaje entero manda.
    const d = decidirBusquedaCatalogo('quiero hacer un pedido de pocillos');
    expect(d.motivo).toBe('soporte');
    // Aun así se conservan los tokens, por si la organización decide buscar.
    expect(d.tokens).toContain('pocillos');
  });
});
