/// <reference types="jest" />
/**
 * Importador de leads — lógica pura: autodetección de columnas, normalización
 * (teléfonos colombianos a E.164, NIT con DV, correo), validación,
 * deduplicación en el archivo y contra clientes existentes, mapeo a cliente +
 * lead, lectura del cuerpo de la ruta y del libro (varias hojas).
 *
 * TODOS los datos son sintéticos (negocios, teléfonos, NIT y correos inventados).
 */

import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';
import { join } from 'path';
import { calcularDv } from '@/lib/utils/nitDv';
import { normalizarCabecera } from '@/lib/inventario/importacion/texto';
import { leerLibro } from '@/lib/importacion/libro';
import {
  autoMapearLeads,
  cabeceraEnDolares,
  CAMPOS_LEAD,
  encontrarFilaCabeceraLeads,
  faltantesMapeoLead,
  mapeoInicialLeads,
  reasignarColumnaLead,
  type CampoLead,
} from '../campos';
import { bandaDesdePrioridad, correoNormalizado, nitNormalizado, telefonoE164, textoLimpio, urlNormalizada, valorNumerico } from '../normalizacion';
import { duplicadosEnArchivo, leerFilasLeads, validarFilaLead } from '../validacion';
import { altaConClienteExistente, altaConClienteNuevo, nombreDelLead, verticalParaSector, type ContextoAltaLead } from '../mapeo';
import { clienteCoincidente, patronCorreos, patronNits, type ClienteCandidato } from '../dedupe';
import { leerEntradaImportacion, maxFilasPorArchivo } from '../entrada';
import type { FilaLeadEntrada } from '../tipos';

const NIT = '900111222';
const DV = calcularDv(NIT) as number;

/** Encabezados con la forma de un libro de prospección (nombres de columna, no datos). */
const CABECERAS_TANDA = [
  'id', 'prioridad', 'nivel_ciudad', 'zona', 'ciudad', 'departamento', 'sector', 'subsector', 'nombre_comercial',
  'razon_social_rues', 'nit_rues', 'direccion', 'barrio', 'telefono_e164', 'telefono', 'tipo_telefono', 'correo_publicado',
  'web', 'plan_probable', 'valor_anual_usd', 'verificacion', 'fuente_telefono_url', 'fuente_negocio_url', 'fuente_nit_url',
  'fecha_verificacion', 'osm_ultima_edicion', 'sedes_mismo_nombre_zona', 'estado_dedupe', 'rne_crc', 'ley_2300_horario', 'notas',
];

describe('autodetección de columnas', () => {
  it('reconoce los encabezados de una tanda de prospección', () => {
    const mapeo = autoMapearLeads(CABECERAS_TANDA);
    const de = (h: string) => mapeo[CABECERAS_TANDA.indexOf(h)];
    expect(de('id')).toBe('idExterno');
    expect(de('nombre_comercial')).toBe('nombre');
    expect(de('razon_social_rues')).toBe('razonSocial');
    expect(de('nit_rues')).toBe('nit');
    // Dos columnas de teléfono: gana la primera (la E.164) y la otra pasa a
    // «Teléfono adicional» (antes quedaba sin importar y se perdía).
    expect(de('telefono_e164')).toBe('telefono');
    expect(de('telefono')).toBe('telefonoAdicional');
    expect(de('correo_publicado')).toBe('correo');
    expect(de('valor_anual_usd')).toBe('valor');
    expect(de('rne_crc')).toBe('rne');
    expect(de('ley_2300_horario')).toBe('horario');
    // Campo múltiple: las tres URL de fuente se juntan.
    expect(['fuente_telefono_url', 'fuente_negocio_url', 'fuente_nit_url'].map(de)).toEqual(['fuente', 'fuente', 'fuente']);
    // Columnas sin campo: el alias no las reconoce…
    expect(['nivel_ciudad', 'osm_ultima_edicion', 'sedes_mismo_nombre_zona', 'estado_dedupe'].map(de)).toEqual([null, null, null, null]);
    expect(faltantesMapeoLead(mapeo)).toEqual([]);
    // …pero el asistente las abre como «Dato adicional»: nada se pierde por omisión.
    const inicial = mapeoInicialLeads([CABECERAS_TANDA, CABECERAS_TANDA.map(() => 'x')], 0);
    expect(['nivel_ciudad', 'osm_ultima_edicion', 'sedes_mismo_nombre_zona', 'estado_dedupe'].map((h) => inicial[CABECERAS_TANDA.indexOf(h)])).toEqual(['adicional', 'adicional', 'adicional', 'adicional']);
    expect(inicial.filter((c) => c === null)).toEqual([]);
  });

  it.each([
    ['Nombre', 'nombre'], ['Empresa', 'nombre'], ['Razón Social', 'razonSocial'], ['NIT', 'nit'], ['Teléfono', 'telefono'],
    ['Celular', 'telefono'], ['Correo electrónico', 'correo'], ['E-mail', 'correo'], ['Ciudad', 'ciudad'], ['Dirección', 'direccion'],
    ['Sector', 'sector'], ['Notas', 'notas'], ['Observaciones', 'notas'], ['Phone', 'telefono'], ['Company', 'nombre'], ['Tags', 'etiquetas'],
  ])('«%s» → %s', (cabecera, campo) => {
    expect(autoMapearLeads([cabecera])[0]).toBe(campo);
  });

  it('las cabeceras de la plantilla en es/en/fr/pt vuelven al mismo campo', () => {
    for (const idioma of ['es', 'en', 'fr', 'pt']) {
      const mensajes = JSON.parse(readFileSync(join(process.cwd(), 'messages', `${idioma}.json`), 'utf8')) as { leadsImportar: { cabeceras: Record<string, string> } };
      for (const [campo, cabecera] of Object.entries(mensajes.leadsImportar.cabeceras)) {
        expect([idioma, cabecera, autoMapearLeads([cabecera])[0]]).toEqual([idioma, cabecera, campo]);
      }
    }
  });

  it('los alias están normalizados y no se repiten entre campos', () => {
    const vistos = new Map<string, CampoLead>();
    for (const def of CAMPOS_LEAD) {
      for (const a of def.alias) {
        expect(normalizarCabecera(a)).toBe(a);
        expect([a, vistos.get(a) ?? def.campo]).toEqual([a, def.campo]);
        vistos.set(a, def.campo);
      }
    }
  });

  it('encuentra la cabecera debajo de un título y exige nombre + contacto', () => {
    const matriz = [['Prospectos septiembre'], [], ['Empresa', 'Celular', 'Ciudad'], ['Panadería Sintética', '3001234567', 'Pereira']];
    expect(encontrarFilaCabeceraLeads(matriz)).toBe(2);
    expect(faltantesMapeoLead(autoMapearLeads(['Ciudad', 'Notas']))).toEqual(['nombre', 'contactoMedio']);
  });

  it('reasignar: un campo simple vive en una columna; «fuente» admite varias', () => {
    expect(reasignarColumnaLead(['nombre', 'telefono', null], 2, 'telefono')).toEqual(['nombre', null, 'telefono']);
    expect(reasignarColumnaLead(['fuente', null], 1, 'fuente')).toEqual(['fuente', 'fuente']);
  });

  it('detecta un valor en dólares por la cabecera', () => {
    expect(cabeceraEnDolares('valor_anual_usd')).toBe(true);
    expect(cabeceraEnDolares('Valor (US$)')).toBe(true);
    expect(cabeceraEnDolares('Valor')).toBe(false);
  });
});

describe('normalización', () => {
  it.each([
    ['3001234567', '+573001234567'],
    ['300 123 4567', '+573001234567'],
    ['+57 315 123 4567', '+573151234567'],
    ['573001234567', '+573001234567'],
    ["'+57 300 123 4567", '+573001234567'],
    ['6041234567', '+576041234567'],
    ['(601) 234 5678', '+576012345678'],
    ['602 345 6789', '+576023456789'],
    ['+1 415 555 2671', '+14155552671'],
  ])('teléfono %s → %s', (entrada, esperado) => {
    expect(telefonoE164(entrada, 'CO')).toBe(esperado);
  });

  it.each(['12345', '0000000000', 'sin teléfono', ''])('teléfono inválido «%s» → null', (v) => {
    expect(telefonoE164(v, 'CO')).toBeNull();
  });

  it('NIT: con guion toma el DV y lo valida con el módulo 11', () => {
    expect(nitNormalizado(`${NIT}-${DV}`)).toEqual({ numero: NIT, dv: DV, dvValido: true });
    expect(nitNormalizado(`${NIT}-${(DV + 1) % 10}`)).toEqual({ numero: NIT, dv: null, dvValido: false });
    expect(nitNormalizado('900.111.222', String(DV))).toEqual({ numero: NIT, dv: DV, dvValido: true });
    // Sin guion ni columna DV no se adivina que el último dígito sea el DV.
    expect(nitNormalizado(`${NIT}${DV}`)).toEqual({ numero: `${NIT}${DV}`, dv: null, dvValido: null });
    expect(nitNormalizado('123')).toBeNull();
  });

  it('correo, prioridad, valor, URL y texto', () => {
    expect(correoNormalizado(' Ventas@Ejemplo.COM ')).toBe('ventas@ejemplo.com');
    expect(correoNormalizado('no-es-correo')).toBeNull();
    expect(['A', 'b', 'Alta', 'media', '3', 'x'].map(bandaDesdePrioridad)).toEqual(['A', 'B', 'A', 'B', 'C', null]);
    expect(valorNumerico('1.200.000')).toBe(1200000);
    expect(valorNumerico(600)).toBe(600);
    expect(valorNumerico('abc')).toBeNull();
    expect(urlNormalizada('negocio-sintetico.com.co')).toBe('https://negocio-sintetico.com.co/');
    expect(urlNormalizada('javascript:alert(1)')).toBeNull();
    expect(textoLimpio("  '=SUMA(A1)  ")).toBe('=SUMA(A1)');
  });
});

const fila = (n: number, campos: FilaLeadEntrada['campos'], extra: Partial<FilaLeadEntrada> = {}): FilaLeadEntrada => ({ fila: n, campos, ...extra });
const OPC = { pais: 'CO', tipoCliente: 'company' as const };

describe('validación y duplicados en el archivo', () => {
  it('sin nombre o sin forma de contacto → error', () => {
    expect(validarFilaLead(fila(2, { telefono: '3001234567' }), OPC).errores.map((e) => e.codigo)).toEqual(['sin_nombre']);
    expect(validarFilaLead(fila(3, { nombre: 'Tienda Sintética' }), OPC).errores.map((e) => e.codigo)).toEqual(['sin_contacto']);
    expect(validarFilaLead(fila(4, { nombre: 'Tienda Sintética', telefono: '123' }), OPC).errores.map((e) => e.codigo)).toEqual(['telefono_invalido']);
  });

  it('un teléfono inválido con correo válido se descarta con aviso', () => {
    const v = validarFilaLead(fila(5, { nombre: 'Tienda Sintética', telefono: '123', correo: 'hola@tienda-sintetica.co' }), OPC);
    expect(v.errores).toEqual([]);
    expect(v.datos?.telefono).toBeNull();
    expect(v.avisos.map((a) => a.codigo)).toContain('telefono_descartado');
  });

  it('normaliza la fila completa', () => {
    const v = validarFilaLead(
      fila(6, { idExterno: 'SIN-0001', nombre: 'Café Inventado', razonSocial: 'Café Inventado S.A.S.', nit: `${NIT}-${DV}`, telefono: '604 444 1234', prioridad: 'A', valor: '600' }, { fuente: ['https://fuente.example/1', 'no-url'] }),
      OPC,
    );
    expect(v.datos).toMatchObject({ nombre: 'Café Inventado', nit: NIT, dv: DV, telefono: '+576044441234', icpBand: 'A', valor: 600, fuentes: ['https://fuente.example/1'] });
  });

  it('la segunda fila con el mismo teléfono, NIT o correo se omite y apunta a la primera', () => {
    const filas = [
      fila(2, { nombre: 'Uno', telefono: '3001112233' }),
      fila(3, { nombre: 'Dos', telefono: '+57 300 111 2233' }),
      fila(4, { nombre: 'Tres', telefono: '3004445566', correo: 'x@sintetico.co' }),
      fila(5, { nombre: 'Cuatro', telefono: '3007778899', correo: 'X@Sintetico.co' }),
      fila(6, { nombre: 'Cinco', telefono: '3009990000' }),
    ].map((f) => validarFilaLead(f, OPC));
    expect(Array.from(duplicadosEnArchivo(filas).entries())).toEqual([[3, 2], [5, 4]]);
  });

  it('lee las filas del archivo con el mapeo (múltiples y vacías)', () => {
    const matriz = [['Nombre', 'Celular', 'Fuente', 'Fuente URL', 'Etiquetas'], ['Tienda X', '3001234567', 'https://a.example', 'https://b.example', 'vip; norte'], [null, null], ['Tienda Y', "'3007654321", null, null, null]];
    const filas = leerFilasLeads(matriz, 0, autoMapearLeads(matriz[0]));
    expect(filas).toEqual([
      { fila: 2, campos: { nombre: 'Tienda X', telefono: '3001234567' }, fuente: ['https://a.example', 'https://b.example'], etiquetas: ['vip; norte'] },
      { fila: 4, campos: { nombre: 'Tienda Y', telefono: '3007654321' } },
    ]);
  });
});

const CTX: ContextoAltaLead = {
  lote: 'tanda_sintetica',
  archivo: 'sintetico.xlsx',
  tipoCliente: 'company',
  userId: 'u-1',
  importadoEn: '2026-09-29T15:00:00.000Z',
  verticalId: 'v-rest',
  amount: 1985178.59,
  currency: 'COP',
  valorOriginal: { monto: 600, moneda: 'USD', tasa: 3308.630988, fecha_tasa: '2026-09-29' },
  rne: 'pendiente',
  zonaOrganizacion: 'America/Mexico_City',
};

describe('mapeo a cliente + lead', () => {
  const datos = validarFilaLead(
    fila(7, {
      idExterno: 'SIN-0007', prioridad: 'B', zona: 'Norte', ciudad: 'Manizales', departamento: 'Caldas', sector: 'Restaurante/bar', subsector: 'Pizzería',
      nombre: 'Pizzas Inventadas', razonSocial: 'Pizzas Inventadas S.A.S.', nit: `${NIT}-${DV}`, direccion: 'Calle 1 # 2-3', barrio: 'Centro',
      telefono: '3001234567', tipoTelefono: 'Celular', correo: 'hola@pizzas-inventadas.co', plan: 'Pro', valor: '600', rne: 'PENDIENTE consulta', notas: 'Abre tarde',
    }, { fuente: ['https://fuente.example/pizzas'] }),
    OPC,
  ).datos!;

  it('cliente empresa nuevo con NIT, E.164, etiquetas, vertical, zona y metadata.importacion', () => {
    const { body, extras } = altaConClienteNuevo(datos, CTX);
    expect(body).toMatchObject({
      name: 'Pizzas Inventadas · Manizales',
      source: 'import',
      amount: 1985178.59,
      currency: 'COP',
      new_customer: { customer_type: 'company', company_name: 'Pizzas Inventadas S.A.S.', email: 'hola@pizzas-inventadas.co', phone: '+573001234567' },
    });
    expect(body.customer_id).toBeUndefined();
    expect(extras.customer).toMatchObject({
      trade_name: 'Pizzas Inventadas',
      identification_type: 'NIT',
      identification_number: NIT,
      dv: DV,
      address: 'Calle 1 # 2-3, Centro',
      city: 'Manizales',
      notes: 'Abre tarde',
      vertical_id: 'v-rest',
      timezone: 'America/Bogota',
    });
    expect(extras.customer?.tags).toEqual(['Restaurante/bar', 'Pizzería', 'prioridad:B', 'zona:Norte', 'lote:tanda_sintetica', 'rne:pendiente']);
    expect(extras.customer?.metadata).toEqual({
      importacion: expect.objectContaining({
        lote: 'tanda_sintetica', id_externo: 'SIN-0007', fila: 7, rne: 'pendiente', rne_archivo: 'PENDIENTE consulta', plan_probable: 'Pro',
        tipo_telefono: 'Celular', fuentes: ['https://fuente.example/pizzas'], departamento: 'Caldas', valor_original: CTX.valorOriginal,
      }),
    });
    // Una importación nunca decide bajas.
    expect(extras.customer).not.toHaveProperty('do_not_call');
    // Ola 1 (D2): el lead es la ficha; la vertical va en el cliente y la prioridad es la banda ICP de respaldo.
    expect(extras.lead).toEqual({ metadata: { importacion: expect.objectContaining({ lote: 'tanda_sintetica', id_externo: 'SIN-0007', rne: 'pendiente' }) }, icp_band: 'B' });
  });

  it('cliente existente: solo el lead, sin tocar la ficha', () => {
    const { body, extras } = altaConClienteExistente(datos, 'cust-9', CTX);
    expect(body.customer_id).toBe('cust-9');
    expect(body.new_customer).toBeUndefined();
    expect(extras.customer).toBeUndefined();
  });

  it('persona: el nombre va a first/last y un teléfono no colombiano usa la zona de la organización', () => {
    const d = validarFilaLead(fila(8, { nombre: 'Ana Prueba Sintética', telefono: '+1 415 555 2671' }), { pais: 'CO', tipoCliente: 'person' }).datos!;
    const { body, extras } = altaConClienteNuevo(d, { ...CTX, tipoCliente: 'person' });
    expect(body.new_customer).toMatchObject({ customer_type: 'person', full_name: 'Ana Prueba Sintética' });
    expect(extras.customer?.timezone).toBe('America/Mexico_City');
    expect(nombreDelLead({ nombre: 'X', ciudad: null })).toBe('X');
  });

  it('vertical por sector (Otros nunca casa)', () => {
    const verticales = [
      { id: 'v-rest', name: 'Restaurantes y bares', slug: 'restaurantes' },
      { id: 'v-retail', name: 'Retail y comercio', slug: 'retail' },
      { id: 'v-otros', name: 'Otros', slug: 'otros' },
    ];
    expect(verticalParaSector('Restaurante/bar', null, verticales)).toBe('v-rest');
    expect(verticalParaSector('Retail (tienda)', null, verticales)).toBe('v-retail');
    expect(verticalParaSector('Otros', null, verticales)).toBeNull();
    expect(verticalParaSector('Minería', 'Restaurantes', verticales)).toBe('v-rest');
    expect(verticalParaSector(null, null, verticales)).toBeNull();
  });
});

describe('deduplicación contra clientes existentes', () => {
  const candidatos: ClienteCandidato[] = [
    { id: 'c-tel', full_name: 'Tel', phone: '+57 300 123 4567', email: null, identification_number: null },
    { id: 'c-nac', full_name: 'Nacional', phone: '310 987 6543', email: null, identification_number: null },
    { id: 'c-nit', full_name: 'Nit', phone: null, email: null, identification_number: `${NIT}${DV}` },
    { id: 'c-mail', full_name: 'Mail', phone: null, email: 'Ventas@Sintetico.CO', identification_number: null },
    { id: 'c-lote', full_name: 'Lote', phone: null, email: null, identification_number: null, importacion: { lote: 'L1', id_externo: 'E-1' } },
  ];
  const d = (x: Partial<{ idExterno: string; telefono: string; nit: string; correo: string }>) => ({ idExterno: null, telefono: null, nit: null, correo: null, ...x });

  it('por teléfono (con separadores o sin indicativo), NIT (con DV pegado), correo e id externo del lote', () => {
    expect(clienteCoincidente(d({ telefono: '+573001234567' }), candidatos, 'L1', '57')).toEqual({ id: 'c-tel', nombre: 'Tel', por: 'telefono' });
    expect(clienteCoincidente(d({ telefono: '+573109876543' }), candidatos, 'L1', '57')?.id).toBe('c-nac');
    expect(clienteCoincidente(d({ nit: NIT }), candidatos, 'L1', '57')?.id).toBe('c-nit');
    expect(clienteCoincidente(d({ correo: 'ventas@sintetico.co' }), candidatos, 'L1', '57')?.id).toBe('c-mail');
    expect(clienteCoincidente(d({ idExterno: 'E-1', telefono: '+573001234567' }), candidatos, 'L1', '57')?.por).toBe('id_externo');
    // El mismo id externo en OTRO lote no es la misma fila.
    expect(clienteCoincidente(d({ idExterno: 'E-1' }), candidatos, 'L2', '57')).toBeNull();
    expect(clienteCoincidente(d({ telefono: '+573000000000' }), candidatos, 'L1', '57')).toBeNull();
  });

  it('los patrones del prefiltro (imatch) encuentran lo que deben', () => {
    const nits = new RegExp(patronNits([NIT]), 'i');
    expect(nits.test('900 111222')).toBe(true);
    expect(nits.test(`| ${NIT}-${DV}`)).toBe(true);
    expect(nits.test('800111222')).toBe(false);
    const correos = new RegExp(patronCorreos(['a.b+c@x-y.co']), 'i');
    expect(correos.test(' A.B+C@X-Y.CO ')).toBe(true);
    expect(correos.test('aXb+c@x-y.co')).toBe(false);
  });
});

describe('cuerpo de la ruta', () => {
  const filas = [{ fila: 2, campos: { nombre: 'Tienda', telefono: '3001234567', organization_id: 999 } }];

  it('acepta solo campos conocidos y exige lote', () => {
    const r = leerEntradaImportacion({ accion: 'validar', filas, opciones: { lote: 'L1', monedaValor: 'usd', pais: 'co' } });
    expect(r).toEqual({
      ok: true,
      accion: 'validar',
      filas: [{ fila: 2, campos: { nombre: 'Tienda', telefono: '3001234567' } }],
      opciones: { lote: 'L1', tipoCliente: 'company', monedaValor: 'USD', pais: 'CO', archivo: null },
    });
    expect(leerEntradaImportacion({ accion: 'validar', filas, opciones: {} })).toMatchObject({ ok: false, status: 400 });
    expect(leerEntradaImportacion({ accion: 'borrar', filas, opciones: { lote: 'L1' } })).toMatchObject({ ok: false, status: 400 });
  });

  it('límite por archivo (validar) y por bloque (importar)', () => {
    const muchas = Array.from({ length: 51 }, (_, i) => ({ fila: i + 2, campos: { nombre: `T${i}` } }));
    expect(leerEntradaImportacion({ accion: 'importar', filas: muchas, opciones: { lote: 'L1' } })).toMatchObject({ ok: false, status: 413 });
    expect(leerEntradaImportacion({ accion: 'validar', filas: muchas, opciones: { lote: 'L1' } })).toMatchObject({ ok: true });
    expect(leerEntradaImportacion({ accion: 'validar', filas: muchas, opciones: { lote: 'L1' } }, 50)).toMatchObject({ ok: false, status: 413 });
    expect(maxFilasPorArchivo({})).toBe(1000);
    expect(maxFilasPorArchivo({ LEADS_IMPORT_MAX_FILAS: '200' })).toBe(200);
    expect(maxFilasPorArchivo({ LEADS_IMPORT_MAX_FILAS: 'mucho' })).toBe(1000);
  });
});

describe('lectura del libro', () => {
  it('lista las hojas y lee la elegida', () => {
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['Resumen'], ['Total', 2]]), 'resumen');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['nombre_comercial', 'telefono_e164', 'ciudad'], ['Tienda Sintética', '+573001234567', 'Neiva']]), 'tanda');
    const buf = XLSX.write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const leido = leerLibro(buf, 'sintetico.xlsx');
    expect(leido.hojas).toEqual(['resumen', 'tanda']);
    expect(leido.matriz('tanda')[1]).toEqual(['Tienda Sintética', '+573001234567', 'Neiva']);
    expect(leido.matriz('no-existe')).toEqual([]);
  });

  it('CSV con «;» (la plantilla) y tildes', () => {
    const csv = new TextEncoder().encode('﻿Nombre comercial;Teléfono\nPanadería Sintética;300 123 4567\n');
    const m = leerLibro(csv.buffer as ArrayBuffer, 'plantilla.csv').matriz();
    expect(m[0]).toEqual(['Nombre comercial', 'Teléfono']);
    expect(autoMapearLeads(m[0])).toEqual(['nombre', 'telefono']);
  });
});
