/**
 * Búsqueda única de clientes (2026-09-29).
 *
 * Caso real: en el POS se escribía «val» (de Valentina) y no aparecían las
 * clientas que se llaman así: salían los 20 primeros por orden alfabético de un
 * «contiene» («Aura Duval…»). Tampoco se encontraba «María» escribiendo
 * «maria», «Ana María Gómez» escribiendo «ana gomez», un teléfono con espacios
 * ni un documento con puntos, y una coma rompía la consulta.
 *
 * Los resultados esperados de «online» son los que devolvió la RPC
 * `fn_clientes_buscar` en la base con estas mismas filas (transacción
 * deshecha, 2026-09-29): el POS sin red debe dar EXACTAMENTE lo mismo.
 * Nombres inventados.
 */
import {
  buscarClientesEnLista,
  normalizarBusqueda,
  palabrasBusqueda,
  relevanciaCliente,
  textoBusquedaCliente,
  type CamposBusquedaCliente,
} from '@/lib/clientes/busqueda';
import { buscarClientes } from '@/lib/services/customers/busquedaClientesService';

type Fila = CamposBusquedaCliente & { id: string; full_name: string };

let n = 0;
function persona(first_name: string, last_name: string, extra: Partial<Fila> = {}): Fila {
  n += 1;
  const full_name = `${first_name.trim()} ${last_name.trim()}`.trim();
  return { id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`, customer_type: 'person', first_name, last_name, trade_name: 'Zqxprueba', full_name, ...extra };
}

function datos(): Fila[] {
  n = 0;
  const filas = [
    persona('María', 'Pérez'),
    persona('Íñigo', 'Muñoz'),
    persona('Ana María', 'Gómez'),
    persona('Luisa  Fernanda', 'Ríos '),
    persona('Pedro', 'Lara', { phone: '399 555 0101' }),
    persona('Sofía', 'Mesa', { identification_number: '9.912.345.678' }),
    persona('Valentina', 'Gómez', { email: 'vgomez.zqx@ejemplo.test' }),
    persona('Valeria', 'Ruiz'),
    persona('Ana', 'Valencia'),
  ];
  n += 1;
  filas.push({
    id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
    customer_type: 'company',
    first_name: null,
    last_name: null,
    company_name: 'Carnaval Eventos SAS',
    trade_name: 'Zqxprueba',
    full_name: 'Carnaval Eventos SAS',
  });
  for (let i = 1; i <= 25; i++) filas.push(persona('Aura', `Duval ${String(i).padStart(2, '0')}`));
  return filas;
}

const nombres = (r: { filas: Array<{ full_name: string; relevancia: number }> }) => r.filas.map((f) => `${f.full_name}(${f.relevancia})`);

describe('normalización y palabras (espejo de normalizar_busqueda y fn_clientes_palabras)', () => {
  it('quita tildes, ñ, mayúsculas, apóstrofos y colapsa espacios', () => {
    expect(normalizarBusqueda('  María   ÍÑIGO  ')).toBe('maria inigo');
    expect(normalizarBusqueda("D'Ángelo O’Neil")).toBe('dangelo oneil');
    expect(normalizarBusqueda(null)).toBe('');
  });

  it.each([
    ['María  Gómez', ['maria', 'gomez']],
    ['300 123 4567', ['3001234567']],
    ['1.234.567', ['1234567']],
    ['Gómez, Ana (hija)', ['gomez', 'ana', 'hija']],
    ['ana@correo.co', ['ana', 'correo', 'co']],
    ['(,)', []],
    ["Ñandú O'Neil", ['nandu', 'oneil']],
    ['ana 1.234.567', ['ana', '1234567']],
    ['valentina g', ['valentina', 'g']],
    ['AB-123', ['ab', '123']],
    ['  ', []],
  ])('palabras de «%s» = lo mismo que fn_clientes_palabras', (q, esperado) => {
    expect(palabrasBusqueda(q)).toEqual(esperado);
  });

  it('sin repetidas y máximo 8', () => {
    expect(palabrasBusqueda('a b c d e f g h i j a')).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  });

  it('texto de búsqueda idéntico a customers.search_text', () => {
    const pedro = datos()[4];
    // Valor leído de la columna generada en la base con esta misma fila.
    expect(textoBusquedaCliente(pedro)).toBe(' pedro lara zqxprueba | 399 555 0101 :: ;; =3995550101=');
  });

  it('una empresa pone razón social y nombre comercial delante', () => {
    expect(textoBusquedaCliente({ customer_type: 'company', company_name: 'Ferretería Ñ', trade_name: 'La Tuerca', first_name: 'Ana' })).toMatch(/^ ferreteria n la tuerca ana \| /);
  });
});

describe('antes fallaba, ahora encuentra (mismos resultados que la RPC)', () => {
  const filas = datos();
  const buscar = (q: string, desde = 0) => buscarClientesEnLista(filas, q, { limite: 20, desde });

  it.each([
    ['maria zqxprueba', ['Ana María Gómez(2)', 'María Pérez(2)']],
    ['munoz zqxprueba', ['Íñigo Muñoz(2)']],
    ['gomez ana zqxprueba', ['Ana María Gómez(2)']],
    ['luisa fernanda zqxprueba', ['Luisa  Fernanda Ríos(2)']],
    ['Gómez, Ana (zqxprueba)', ['Ana María Gómez(2)']],
    ['valen zqxprueba', ['Ana Valencia(2)', 'Valentina Gómez(2)']],
    ['valentina g zqxprueba', ['Valentina Gómez(2)']],
    ['vgomez.zqx@ejemplo.test', ['Valentina Gómez(3)']],
  ])('«%s»', (q, esperado) => {
    const r = buscar(q);
    expect(nombres(r)).toEqual(esperado);
    expect(r.total).toBe(esperado.length);
  });

  it.each([
    ['399 555 0101', 'Pedro Lara'],
    ['3995550101', 'Pedro Lara'],
    ['5550101', 'Pedro Lara'],
    ['9.912.345.678', 'Sofía Mesa'],
    ['9912345678', 'Sofía Mesa'],
  ])('teléfono o documento con o sin separadores «%s» → exacto primero', (q, nombre) => {
    const r = buscar(q);
    expect(r.total).toBe(1);
    expect(r.filas[0]).toMatchObject({ full_name: nombre, relevancia: 0 });
  });

  it('caracteres reservados de PostgREST no rompen nada: «(,)» no devuelve nada; vacío devuelve todos', () => {
    expect(buscar('(,)').total).toBe(0);
    expect(buscar('*%_"\\').total).toBe(0);
    expect(buscar('').total).toBe(filas.length);
  });
});

describe('caso real «val»: primero los nombres que EMPIEZAN por el término', () => {
  const filas = datos();

  it('Valentina y Valeria (nombre empieza) > Ana Valencia (apellido empieza) > Duval/Carnaval (solo contiene)', () => {
    const r = buscarClientesEnLista(filas, 'val', { limite: 100 });
    expect(nombres(r).slice(0, 5)).toEqual(['Valentina Gómez(1)', 'Valeria Ruiz(1)', 'Ana Valencia(2)', 'Aura Duval 01(3)', 'Aura Duval 02(3)']);
    expect(nombres(r).at(-1)).toBe('Carnaval Eventos SAS(3)');
    expect(r.total).toBe(29);
  });

  it('límite 20 + total: «Mostrando 20 de 29 · Ver más» y la página siguiente trae las 9 que faltan', () => {
    const p1 = buscarClientesEnLista(filas, 'val zqxprueba', { limite: 20 });
    expect(p1.total).toBe(29);
    expect(p1.filas).toHaveLength(20);
    expect(nombres(p1).slice(0, 5)).toEqual(['Ana Valencia(2)', 'Valentina Gómez(2)', 'Valeria Ruiz(2)', 'Aura Duval 01(3)', 'Aura Duval 02(3)']);
    const p2 = buscarClientesEnLista(filas, 'val zqxprueba', { limite: 20, desde: 20 });
    expect(p2.filas.map((f) => f.full_name)).toEqual([
      'Aura Duval 18', 'Aura Duval 19', 'Aura Duval 20', 'Aura Duval 21', 'Aura Duval 22', 'Aura Duval 23', 'Aura Duval 24', 'Aura Duval 25', 'Carnaval Eventos SAS',
    ]);
  });

  it('al seguir escribiendo se afina: «valen» → 2, «valentina g» → 1', () => {
    expect(buscarClientesEnLista(filas, 'valen').filas.map((f) => f.full_name)).toEqual(['Valentina Gómez', 'Ana Valencia']);
    expect(buscarClientesEnLista(filas, 'valentina g').filas.map((f) => f.full_name)).toEqual(['Valentina Gómez']);
  });

  it('relevancia: la palabra tiene que EMPEZAR una palabra del nombre (el correo no cuenta)', () => {
    const t = textoBusquedaCliente({ first_name: 'Aura', last_name: 'Duval', email: 'valeria@correo.co' });
    expect(relevanciaCliente(t, ['val'])).toBe(3);
    expect(relevanciaCliente(textoBusquedaCliente({ first_name: 'Ana', last_name: 'Valencia' }), ['val'])).toBe(2);
  });

  it('límite acotado a 1-100 igual que la RPC', () => {
    expect(buscarClientesEnLista(filas, '', { limite: 0 }).filas).toHaveLength(1);
    expect(buscarClientesEnLista(filas, '', { limite: 500 }).filas).toHaveLength(filas.length);
  });
});

describe('servicio único: el texto viaja como parámetro de la RPC', () => {
  it('llama a fn_clientes_buscar con el texto crudo, límite y desplazamiento, y devuelve filas + total', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { total: 57, filas: [{ id: 'c1', full_name: 'Valentina Gómez', relevancia: 1 }] }, error: null });
    const r = await buscarClientes({ rpc } as never, { organizationId: 120, texto: 'Gómez, Ana (hija)', limite: 20, desde: 20 });
    expect(rpc).toHaveBeenCalledWith('fn_clientes_buscar', {
      p_organization_id: 120,
      p_q: 'Gómez, Ana (hija)',
      p_limit: 20,
      p_offset: 20,
      p_tipo: null,
      p_estado: null,
    });
    expect(r).toEqual({ filas: [{ id: 'c1', full_name: 'Valentina Gómez', relevancia: 1 }], total: 57 });
  });

  it('un error de la RPC se propaga (la pantalla muestra «Reintentar», no una lista vacía muda)', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(buscarClientes({ rpc } as never, { organizationId: 120, texto: 'ana' })).rejects.toEqual({ message: 'boom' });
  });
});
