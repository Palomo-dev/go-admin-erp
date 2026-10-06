/// <reference types="jest" />
/**
 * Bug «al importar leads se pierden un montón de datos» (2026-10-06).
 *
 * Un archivo con TODAS las columnas (las reconocidas, las nuevas y varias que
 * ningún alias conoce) recorre el camino real: libro XLSX → mapeo inicial del
 * asistente → filas del navegador → cuerpo JSON leído por el servidor →
 * validación → alta → INSERT de `resolveLeadCustomer` (con un cliente falso
 * que solo captura la fila). Cada celda debe terminar en una columna de
 * `customers` o en `metadata`, y lo que no tiene columna debe salir en lo que
 * la ficha muestra (`datosImportadosDe`).
 *
 * Datos sintéticos (el repositorio es público).
 */

import * as XLSX from 'xlsx';
import type { SupabaseClient } from '@supabase/supabase-js';
import { calcularDv } from '@/lib/utils/nitDv';
import { leerLibro } from '@/lib/importacion/libro';
import { resolveLeadCustomer } from '@/lib/services/crm/leadCustomer';
import { mapeoInicialLeads, encontrarFilaCabeceraLeads } from '../campos';
import { leerFilasLeads, validarFilaLead } from '../validacion';
import { leerEntradaImportacion } from '../entrada';
import { altaConClienteExistente, altaConClienteNuevo, nombreComercialDeFicha, type ContextoAltaLead } from '../mapeo';
import { datosImportadosDe, tieneDatosImportados, type DatoImportado } from '../datosFicha';
import { fechaDeCelda } from '../normalizacion';

const NIT = '900222333';
const DV = calcularDv(NIT) as number;
/** 2026-09-15 como serial de Excel (así entrega SheetJS una celda de fecha). */
const SERIAL_15_SEP_2026 = 46280;

const ARCHIVO: unknown[][] = [
  ['Prospectos sintéticos'],
  [
    'ID', 'Prioridad', 'Nombre comercial', 'Razón social', 'Contacto', 'Cargo', 'NIT', 'Teléfono', 'Celular', 'Teléfono 2',
    'Tipo de teléfono', 'Correo', 'Correo 2', 'Web', 'Dirección', 'Barrio', 'Ciudad', 'Departamento', 'País', 'Zona',
    'Sector', 'Subsector', 'Plan', 'Valor', 'Etapa', 'Fecha', 'Verificación', 'Fecha verificación', 'Fuente URL', 'Origen',
    'Horario', 'Notas', 'Etiquetas', 'RNE', 'Instagram', 'Nivel ciudad', '',
  ],
  [
    'SIN-100', 'A', 'Panadería Sintética', 'Panadería Sintética S.A.S.', 'Laura Inventada', 'Gerente', `${NIT}-${DV}`, '300 123 4567', '310 765 4321', 'no tiene',
    'Celular', 'Hola@Panaderia-Sintetica.example', 'compras@panaderia-sintetica.example', 'panaderia-sintetica.example', 'Calle 10 # 20-30', 'Centro', 'Pereira', 'Risaralda', 'Colombia', 'Eje',
    'Retail (tienda)', 'Panadería', 'Pro', '1.200.000', 'Contactado', SERIAL_15_SEP_2026, 'Llamada', '2026-09-10', 'https://directorio.example/panaderia', 'Feria empresarial',
    'Mañanas', 'Atiende el dueño', 'piloto; norte', 'pendiente', '@panaderia.sintetica', 'Intermedia', 'dato sin encabezado',
  ],
];

const CTX: ContextoAltaLead = {
  lote: 'lote_sintetico',
  archivo: 'sintetico.xlsx',
  tipoCliente: 'company',
  userId: 'u-1',
  importadoEn: '2026-10-06T15:00:00.000Z',
  verticalId: null,
  amount: 1200000,
  currency: 'COP',
  valorOriginal: { monto: 1200000, moneda: 'COP' },
  rne: 'pendiente',
  zonaOrganizacion: 'America/Bogota',
};

function libroXlsx(matriz: unknown[][]): ArrayBuffer {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(matriz), 'prospectos');
  return XLSX.write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

/** Cliente falso: captura el INSERT de `customers` y devuelve un id. */
function supabaseQueCaptura(insertados: Record<string, unknown>[]): SupabaseClient {
  return {
    from: () => ({
      insert: (fila: Record<string, unknown>) => {
        insertados.push(fila);
        return { select: () => ({ single: async () => ({ data: { id: 'c-1', full_name: 'x' }, error: null }) }) };
      },
    }),
  } as unknown as SupabaseClient;
}

/** Recorre el camino completo hasta la fila de `customers` y la metadata del lead. */
async function importarArchivo(matriz: unknown[][]) {
  const libro = leerLibro(libroXlsx(matriz), 'sintetico.xlsx');
  const hoja = libro.matriz('prospectos');
  const cabecera = encontrarFilaCabeceraLeads(hoja);
  const mapeo = mapeoInicialLeads(hoja, cabecera);
  const filasNavegador = leerFilasLeads(hoja, cabecera, mapeo);

  // El servidor solo ve lo que viaja en el cuerpo JSON.
  const entrada = leerEntradaImportacion(JSON.parse(JSON.stringify({ accion: 'importar', filas: filasNavegador, opciones: { lote: CTX.lote, archivo: CTX.archivo } })));
  if (!entrada.ok) throw new Error(entrada.error);
  const validada = validarFilaLead(entrada.filas[0], entrada.opciones);
  if (!validada.datos) throw new Error(JSON.stringify(validada.errores));

  const { body, extras } = altaConClienteNuevo(validada.datos, CTX);
  const insertados: Record<string, unknown>[] = [];
  const r = await resolveLeadCustomer({ organizationId: 1, supabase: supabaseQueCaptura(insertados) }, body, null, extras.customer);
  expect(r.ok).toBe(true);
  const fila = insertados[0];
  // `createLeadWithCustomer` fusiona `extras.lead.metadata` y el valor en `metadata.lead`.
  const metadataLead = { titulo: body.name, valor_estimado: { monto: body.amount, moneda: body.currency }, ...(extras.lead?.metadata ?? {}) };
  return { mapeo, cabeceras: hoja[cabecera], fila, metadataLead, datos: validada.datos, avisos: validada.avisos };
}

const textoDe = (d: DatoImportado): string =>
  d.tipo === 'texto' || d.tipo === 'fecha' ? d.valor : d.tipo === 'importe' ? String(d.monto) : d.valores.join(' | ');

describe('importación de leads sin pérdida de datos', () => {
  it('el asistente no deja ninguna columna con datos en «No importar»', async () => {
    const { mapeo, cabeceras } = await importarArchivo(ARCHIVO);
    const sinDestino = mapeo.map((c, i) => (c ? null : String(cabeceras[i] ?? `col ${i + 1}`))).filter(Boolean);
    expect(sinDestino).toEqual([]);
    expect(mapeo[cabeceras.indexOf('Celular')]).toBe('telefonoAdicional');
    expect(mapeo[cabeceras.indexOf('Correo 2')]).toBe('correoAdicional');
    expect(mapeo[cabeceras.indexOf('Instagram')]).toBe('adicional');
  });

  it('cada dato va a su columna real de customers', async () => {
    const { fila } = await importarArchivo(ARCHIVO);
    expect(fila).toMatchObject({
      customer_type: 'company',
      company_name: 'Panadería Sintética S.A.S.',
      trade_name: 'Panadería Sintética',
      first_name: 'Laura',
      last_name: 'Inventada',
      identification_type: 'NIT',
      identification_number: NIT,
      dv: DV,
      phone: '+573001234567',
      email: 'hola@panaderia-sintetica.example',
      address: 'Calle 10 # 20-30, Centro',
      city: 'Pereira',
      notes: 'Atiende el dueño',
      timezone: 'America/Bogota',
      lifecycle_stage: 'lead',
    });
    expect(fila.tags).toEqual(expect.arrayContaining(['Retail (tienda)', 'Panadería', 'prioridad:A', 'zona:Eje', 'piloto', 'norte']));
    // Columnas GENERATED: nunca se escriben.
    expect(fila).not.toHaveProperty('full_name');
    expect(fila).not.toHaveProperty('doc_type');
    expect(fila).not.toHaveProperty('doc_number');
  });

  it('lo que no tiene columna queda en metadata.importacion', async () => {
    const { fila, metadataLead } = await importarArchivo(ARCHIVO);
    const imp = (fila.metadata as { importacion: Record<string, unknown> }).importacion;
    expect(imp).toMatchObject({
      lote: 'lote_sintetico',
      id_externo: 'SIN-100',
      cargo: 'Gerente',
      departamento: 'Risaralda',
      pais: 'Colombia',
      zona: 'Eje',
      barrio: 'Centro',
      tipo_telefono: 'Celular',
      telefonos_adicionales: ['+573107654321', 'no tiene'],
      correos_adicionales: ['compras@panaderia-sintetica.example'],
      web: 'https://panaderia-sintetica.example/',
      plan_probable: 'Pro',
      etapa: 'Contactado',
      fecha_archivo: '2026-09-15',
      verificacion: 'Llamada',
      fecha_verificacion: '2026-09-10',
      fuentes: ['https://directorio.example/panaderia'],
      fuentes_texto: ['Feria empresarial'],
      horario_contacto: 'Mañanas',
      rne_archivo: 'pendiente',
      adicionales: { Instagram: '@panaderia.sintetica', 'Nivel ciudad': 'Intermedia', 'Columna 37': 'dato sin encabezado' },
    });
    expect(metadataLead.valor_estimado).toEqual({ monto: 1200000, moneda: 'COP' });
  });

  it('ninguna celda del archivo se pierde: toda aparece en la fila guardada', async () => {
    const { fila, metadataLead } = await importarArchivo(ARCHIVO);
    const guardado = JSON.stringify({ fila, metadataLead }).toLowerCase();
    // Formas normalizadas de las celdas que el alta transforma.
    const normalizadas: Record<string, string> = {
      [`${NIT}-${DV}`]: NIT,
      '300 123 4567': '+573001234567',
      '310 765 4321': '+573107654321',
      'panaderia-sintetica.example': 'https://panaderia-sintetica.example/',
      '1.200.000': '1200000',
      [String(SERIAL_15_SEP_2026)]: '2026-09-15',
      'piloto; norte': 'piloto',
      // El contacto se parte en first_name / last_name (las dos se comprueban arriba).
      'Laura Inventada': 'Laura',
      A: 'prioridad:a',
    };
    const perdidas = (ARCHIVO[2] as unknown[])
      .map((c) => String(c))
      .filter((c) => !guardado.includes(JSON.stringify(normalizadas[c] ?? c).slice(1, -1).toLowerCase()));
    expect(perdidas).toEqual([]);
  });

  it('la ficha muestra todo lo que no tiene columna propia', async () => {
    const { fila, metadataLead } = await importarArchivo(ARCHIVO);
    const meta = fila.metadata as { importacion: unknown };
    const vista = datosImportadosDe(meta.importacion, metadataLead);
    expect(vista).not.toBeNull();
    const porClave = Object.fromEntries(vista!.datos.map((d) => [d.clave, textoDe(d)]));
    expect(porClave).toMatchObject({
      cargo: 'Gerente',
      departamento: 'Risaralda',
      pais: 'Colombia',
      zona: 'Eje',
      barrio: 'Centro',
      tipoTelefono: 'Celular',
      telefonosAdicionales: '+573107654321 | no tiene',
      correosAdicionales: 'compras@panaderia-sintetica.example',
      web: 'https://panaderia-sintetica.example/',
      plan: 'Pro',
      etapa: 'Contactado',
      fecha: '2026-09-15',
      valor: '1200000',
      fuentes: 'https://directorio.example/panaderia',
      fuentesTexto: 'Feria empresarial',
      horario: 'Mañanas',
      verificacion: 'Llamada',
      fechaVerificacion: '2026-09-10',
      rneArchivo: 'pendiente',
    });
    // El valor del archivo igual al estimado no se repite.
    expect(porClave.valorOriginal).toBeUndefined();
    expect(vista!.adicionales).toEqual([
      { columna: 'Instagram', valor: '@panaderia.sintetica' },
      { columna: 'Nivel ciudad', valor: 'Intermedia' },
      { columna: 'Columna 37', valor: 'dato sin encabezado' },
    ]);
    expect(vista!.origen).toMatchObject({ lote: 'lote_sintetico', archivo: 'sintetico.xlsx', fila: 3, idExterno: 'SIN-100' });
  });

  it('un valor que no se puede interpretar se guarda crudo y se muestra', async () => {
    const malo = ARCHIVO.map((f) => [...f]);
    const cab = malo[1] as string[];
    malo[2][cab.indexOf('Web')] = 'no tenemos';
    malo[2][cab.indexOf('Valor')] = 'a convenir';
    malo[2][cab.indexOf('NIT')] = 'en trámite';
    const { fila, metadataLead, avisos } = await importarArchivo(malo);
    expect(avisos.map((a) => a.codigo)).toEqual(expect.arrayContaining(['web_invalida', 'valor_invalido', 'nit_invalido']));
    expect((fila.metadata as { importacion: Record<string, unknown> }).importacion.valores_descartados).toEqual({ nit: 'en trámite', web: 'no tenemos', valor: 'a convenir' });
    const vista = datosImportadosDe((fila.metadata as { importacion: unknown }).importacion, metadataLead);
    expect(vista!.descartados).toEqual([
      { campo: 'nit', valor: 'en trámite' },
      { campo: 'web', valor: 'no tenemos' },
      { campo: 'valor', valor: 'a convenir' },
    ]);
  });

  it('cliente existente: la ficha no se pisa, pero la fila completa queda en metadata.lead y se muestra', async () => {
    const { datos } = await importarArchivo(ARCHIVO);
    const { extras } = altaConClienteExistente(datos, 'cust-9', CTX);
    expect(extras.customer).toBeUndefined();
    const lead = extras.lead?.metadata as { importacion: Record<string, unknown> };
    expect(lead.importacion).toMatchObject({ ciudad: 'Pereira', direccion: 'Calle 10 # 20-30, Centro', nit: NIT, contacto: 'Laura Inventada', departamento: 'Risaralda', notas: 'Atiende el dueño' });
    expect(tieneDatosImportados(undefined, lead)).toBe(true);
    const claves = datosImportadosDe(undefined, lead)!.datos.map((d) => d.clave);
    expect(claves).toEqual(expect.arrayContaining(['nombre', 'razonSocial', 'contacto', 'nit', 'telefono', 'correo', 'direccion', 'ciudad', 'departamento', 'notas', 'etiquetas']));
  });

  it('persona: el nombre comercial ya no se pierde cuando viene un contacto', () => {
    expect(nombreComercialDeFicha({ nombre: 'Tienda Sintética', razonSocial: null, contacto: 'Ana Prueba' }, false)).toBe('Tienda Sintética');
    expect(nombreComercialDeFicha({ nombre: 'Ana Prueba', razonSocial: null, contacto: 'Ana Prueba' }, false)).toBeNull();
    expect(nombreComercialDeFicha({ nombre: 'X S.A.S.', razonSocial: 'X S.A.S.', contacto: 'Ana' }, false)).toBeNull();
  });
});

describe('ficha: importaciones ya guardadas (forma real de metadata, sin cambios)', () => {
  it('muestra departamento, zona, web, fuentes, horario y el valor en dólares', () => {
    const vista = datosImportadosDe(
      {
        lote: 'tanda_sintetica', fila: 12, archivo: 'tanda.csv', importado_en: '2026-09-30T16:07:38.000Z', id_externo: 'T-12',
        departamento: 'Valle del Cauca', zona: 'Sur', barrio: 'Granada', tipo_telefono: 'fijo', web: 'https://negocio.example/',
        fuentes: ['https://mapa.example/1'], horario_contacto: 'L-V 8-12', plan_probable: 'Business', verificacion: 'osm',
        fecha_verificacion: '2026-09-28', rne: 'pendiente', rne_archivo: 'PENDIENTE', valor_original: { monto: 600, moneda: 'USD', tasa: 3900, fecha_tasa: '2026-09-30' },
      },
      { titulo: 'Negocio · Cali', valor_estimado: { monto: 2340000, moneda: 'COP' } },
    );
    const claves = vista!.datos.map((d) => d.clave);
    expect(claves).toEqual(['tipoTelefono', 'barrio', 'departamento', 'zona', 'plan', 'valor', 'valorOriginal', 'web', 'fuentes', 'horario', 'verificacion', 'fechaVerificacion', 'rneArchivo']);
    expect(vista!.datos.find((d) => d.clave === 'fechaVerificacion')).toEqual({ clave: 'fechaVerificacion', tipo: 'fecha', valor: '2026-09-28' });
    expect(vista!.datos.find((d) => d.clave === 'valorOriginal')).toEqual({ clave: 'valorOriginal', tipo: 'importe', monto: 600, moneda: 'USD' });
  });

  it('sin importación no hay nada que mostrar; un enlace que no es http(s) no se pinta', () => {
    expect(datosImportadosDe(undefined, { titulo: 'Manual' })).toBeNull();
    expect(tieneDatosImportados(null, null)).toBe(false);
    const vista = datosImportadosDe({ web: 'javascript:alert(1)', fuentes: ['javascript:x', 'https://ok.example/'] });
    expect(vista!.datos).toEqual([{ clave: 'fuentes', tipo: 'enlaces', valores: ['https://ok.example/'] }]);
  });
});

describe('fechaDeCelda', () => {
  it.each([
    [String(SERIAL_15_SEP_2026), '2026-09-15'],
    ['45658', '2025-01-01'],
    ['2026-09-10', '2026-09-10'],
    ['10/09/2026', '10/09/2026'],
    ['12345', '12345'],
    ['', null],
  ])('%s → %s', (entrada, esperado) => {
    expect(fechaDeCelda(entrada)).toBe(esperado);
  });
});
