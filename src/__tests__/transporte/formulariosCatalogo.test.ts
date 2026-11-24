/**
 * Catálogo común › lógica pura de las fichas (Figma 2872:1691 y 2874:2806) y de los formularios y
 * diálogos (sección 25, 2970:20718): validación y columnas que se escriben, quién puede manejar qué,
 * bitácora, importación por fila, documentos de un dueño e historial.
 */
import {
  CATEGORIAS_POR_TIPO,
  agregarBitacora,
  altaExterno,
  clavePlaca,
  evaluarConductor,
  formularioAPersona,
  formularioAVehiculo,
  leerBitacora,
  personaAFormulario,
  validarPersona,
  validarVehiculo,
  vehiculoAFormulario,
  MAX_BITACORA,
} from '@/lib/transporte/formulariosCatalogo';
import { analizarConductores, analizarVehiculos, faltantes, fechaCelda, registrosDesdeMatriz, resumenImportacion } from '@/lib/transporte/importarCatalogo';
import { documentosDeDueno, eventosHistorial, llegadaViaje, ocupacionViaje, peorDocumento, viajeEnCurso, viajesDelMes, viajesProgramados } from '@/lib/transporte/fichaCatalogo';
import { documentosFlota, type DocumentoTabla } from '@/lib/transporte/documentosFlota';
import { filtroNovedades } from '@/lib/services/transporte/fichaCatalogoService';
import { rutaFicha } from '@/lib/transporte/catalogoComun';
import type { Trip, Vehicle } from '@/lib/services/transportService';

const HOY = '2026-11-24';

describe('rutas de las fichas', () => {
  test('la ficha vive bajo la lista de la que se abrió', () => {
    expect(rutaFicha('logistica', 'vehiculo', 'v1')).toBe('/app/logistica/vehiculos/v1');
    expect(rutaFicha('transporte', 'persona', 'd 1')).toBe('/app/transporte/conductores/d%201');
  });
});

describe('formulario de vehículo', () => {
  const base = { id: 'v1', organization_id: 120, plate: 'wnp 103', vehicle_type: 'bus', brand: 'Marca', model: 'OF', year: 2021, passenger_capacity: 40, status: 'maintenance', is_active: true, current_driver_id: 'u1', soat_expiry: '2027-03-14', seat_map_id: 's1', created_at: '', updated_at: '' } as unknown as Vehicle;

  test('nuevo: valores por defecto y sede activa', () => {
    const f = vehiculoAFormulario(null, { sede: 3 });
    expect(f).toMatchObject({ plate: '', vehicle_type: 'car', status: 'available', is_active: true, branch_id: 3 });
  });

  test('duplicar copia el modelo, no la identidad', () => {
    const f = vehiculoAFormulario(base, { sede: null, duplicar: true });
    expect(f).toMatchObject({ plate: '', vin: '', current_driver_id: null, status: 'available', soat_expiry: '', brand: 'Marca', seat_map_id: 's1', passenger_capacity: '40' });
  });

  test('valida placa obligatoria y repetida (sin espacios ni guiones), año y números', () => {
    const f = vehiculoAFormulario(null, { sede: null });
    expect(validarVehiculo(f, new Set(), 2027).plate).toBe('requerido');
    const otro = { ...f, plate: 'WNP-103', year: '1800', capacity_kg: '-3', passenger_capacity: '2.5', soat_expiry: '2027-13-40' };
    const e = validarVehiculo(otro, new Set([clavePlaca('wnp 103')]), 2027);
    expect(e).toMatchObject({ plate: 'duplicada', year: 'invalido', capacity_kg: 'invalido', passenger_capacity: 'invalido', soat_expiry: 'invalido' });
    expect(validarVehiculo({ ...f, plate: 'ABC 12F', year: '2024' }, new Set(), 2027)).toEqual({});
  });

  test('escribe solo columnas reales de vehicles, con vacíos en null', () => {
    const d = formularioAVehiculo({ ...vehiculoAFormulario(base, { sede: null }), brand: '  ', capacity_kg: '3,5', vin: 'abc' });
    expect(Object.keys(d).sort()).toEqual(
      [
        'branch_id', 'brand', 'capacity_kg', 'capacity_m3', 'carrier_id', 'color', 'current_driver_id', 'insurance_expiry', 'is_active', 'model', 'operating_card_expiry',
        'passenger_capacity', 'plate', 'seat_map_id', 'soat_expiry', 'status', 'techno_expiry', 'vehicle_type', 'vin', 'year',
      ].sort(),
    );
    expect(d).toMatchObject({ plate: 'WNP 103', brand: null, capacity_kg: 3.5, vin: 'ABC', techno_expiry: null, soat_expiry: '2027-03-14', year: 2021 });
  });
});

describe('quién puede manejar qué (Asignar conductor 2972:21658)', () => {
  const p = { userId: 'u1', activo: true, licenciaCategoria: 'C2', licenciaVence: '2028-08-18' };
  test('bus pide C2 o C3; moto A1 o A2; lancha no pide licencia', () => {
    expect(CATEGORIAS_POR_TIPO.bus).toEqual(['C2', 'C3']);
    expect(evaluarConductor(p, 'bus', HOY)).toMatchObject({ apto: true, porVencer: false });
    expect(evaluarConductor(p, 'motorcycle', HOY)).toMatchObject({ apto: false, motivo: 'categoria' });
    expect(evaluarConductor({ ...p, licenciaCategoria: null, licenciaVence: null }, 'boat', HOY).apto).toBe(true);
  });
  test('sin usuario, inactiva, sin licencia o vencida no sirven; por vencer avisa', () => {
    expect(evaluarConductor({ ...p, userId: null }, 'bus', HOY).motivo).toBe('sinUsuario');
    expect(evaluarConductor({ ...p, activo: false }, 'bus', HOY).motivo).toBe('inactivo');
    expect(evaluarConductor({ ...p, licenciaVence: null }, 'bus', HOY).motivo).toBe('sinLicencia');
    expect(evaluarConductor({ ...p, licenciaVence: '2026-11-01' }, 'bus', HOY).motivo).toBe('vencida');
    expect(evaluarConductor({ ...p, licenciaVence: '2026-12-03' }, 'bus', HOY)).toMatchObject({ apto: true, porVencer: true, dias: 9 });
  });
});

describe('bitácora del vehículo (metadata.bitacora)', () => {
  test('agrega adelante, conserva el resto de metadata y respeta el tope', () => {
    let m: unknown = { otra: 1 };
    for (let i = 0; i < MAX_BITACORA + 5; i += 1) m = agregarBitacora(m, { tipo: 'estado', de: 'available', a: 'maintenance', motivo: `m${i}`, at: `2026-11-24T10:${String(i).padStart(2, '0')}:00Z` });
    const b = leerBitacora(m);
    expect(b).toHaveLength(MAX_BITACORA);
    expect(b[0].motivo).toBe(`m${MAX_BITACORA + 4}`);
    expect((m as { otra: number }).otra).toBe(1);
    expect(leerBitacora(null)).toEqual([]);
    expect(leerBitacora({ bitacora: [{ tipo: 'raro' }] })).toEqual([]);
  });
});

describe('formulario de persona', () => {
  test('empleado: pide el empleo y la licencia completa (menos en bici o a pie)', () => {
    const f = personaAFormulario(null, { sede: null });
    expect(validarPersona(f)).toMatchObject({ employment_id: 'requerido', license_number: 'requerido', license_category: 'requerido', license_expiry: 'requerido' });
    expect(validarPersona({ ...f, employment_id: 'e1', vehicle_type: 'bicycle' })).toEqual({});
  });

  test('externo: las reglas del alta de Domiciliarios; la licencia, si se empieza, se completa', () => {
    const f = { ...personaAFormulario(null, { sede: null }), modo: 'externo' as const };
    expect(validarPersona(f)).toMatchObject({ full_name: 'requerido', phone: 'requerido', document_number: 'requerido', branch_id: 'requerido' });
    const ok = { ...f, full_name: 'Karen Díaz', phone: '310 555 2140', document_number: '1.020.334', branch_id: 3 };
    expect(validarPersona(ok)).toEqual({});
    expect(validarPersona({ ...ok, license_number: '123' })).toMatchObject({ license_category: 'incompleta', license_expiry: 'incompleta' });
    expect(altaExterno(ok)).toEqual({ nombre: 'Karen Díaz', celular: '310 555 2140', tipoDocumento: 'CC', documento: '1.020.334', branchId: 3, tipoVehiculo: null, cobraContraentrega: true, userId: null });
  });

  test('escribe columnas de driver_credentials; la identidad solo para el externo; conserva metadata', () => {
    const f = { ...personaAFormulario(null, { sede: 3 }), employment_id: 'e1', license_number: ' 79452118 ', license_category: 'C2', license_expiry: '2026-12-05', blood_type: 'O+', certificaciones: 'Primeros auxilios, Manejo defensivo' };
    const d = formularioAPersona(f, { fin_jornada_at: 'x', certifications: ['vieja'] });
    expect(d).toMatchObject({ employment_id: 'e1', license_number: '79452118', blood_type: 'O+', branch_id: 3, metadata: { fin_jornada_at: 'x', certifications: ['Primeros auxilios', 'Manejo defensivo'] } });
    expect(d).not.toHaveProperty('full_name');
    const e = formularioAPersona({ ...f, modo: 'externo', full_name: ' Karen  Díaz ', document_number: '1.020.334', user_id: 'u9' }, null);
    expect(e).toMatchObject({ employment_id: null, is_external: true, full_name: 'Karen Díaz', document_number: '1020334', document_type: 'CC', user_id: 'u9', metadata: { cobra_contraentrega: true } });
  });

  test('al editar lee lo que la base guarda; duplicar no copia a la persona', () => {
    const c = { employment_id: null, full_name: 'Karen Díaz', phone: '3105552140', document_number: '1020334', license_category: 'A2', license_expiry: '2027-01-01', blood_type: 'A+', is_active: false, metadata: { certifications: ['X'], cobra_contraentrega: false } };
    expect(personaAFormulario(c, { sede: null })).toMatchObject({ modo: 'externo', full_name: 'Karen Díaz', is_active: false, certificaciones: 'X', cobra_contraentrega: false, blood_type: 'A+' });
    expect(personaAFormulario(c, { sede: null, duplicar: true })).toMatchObject({ full_name: '', document_number: '', license_expiry: '', license_category: 'A2', is_active: true });
  });
});

describe('importar desde Excel (2972:21818)', () => {
  test('encabezados, filas vacías y columnas que faltan', () => {
    const m = [['Plate', 'VEHICLE_TYPE'], ['abc 123', 'truck'], [null, ''], ['', 'bus']];
    expect(registrosDesdeMatriz(m)).toEqual([
      { fila: 2, datos: { plate: 'abc 123', vehicle_type: 'truck' } },
      { fila: 4, datos: { plate: '', vehicle_type: 'bus' } },
    ]);
    expect(faltantes([['plate']], ['plate', 'vehicle_type'])).toEqual(['vehicle_type']);
  });

  test('fechas: ISO, dd/mm/aaaa y número de serie de Excel', () => {
    expect(fechaCelda('2027-03-14')).toBe('2027-03-14');
    expect(fechaCelda('14/3/2027')).toBe('2027-03-14');
    expect(fechaCelda('46460')).toBe('2027-03-14');
    expect(fechaCelda('')).toBeNull();
    expect(fechaCelda('mañana')).toBeUndefined();
  });

  test('vehículos: nuevo, existe (se actualiza) y errores por fila', () => {
    const r = analizarVehiculos(
      [
        { fila: 2, datos: { plate: 'wnp 103', vehicle_type: 'bus', passenger_capacity: '40' } },
        { fila: 3, datos: { plate: 'ABC 12F', vehicle_type: 'motorcycle', soat_expiry: '46460' } },
        { fila: 4, datos: { plate: '', vehicle_type: 'bus' } },
        { fila: 5, datos: { plate: 'XYZ 1', vehicle_type: 'nave' } },
        { fila: 6, datos: { plate: 'WNP-103', vehicle_type: 'bus' } },
      ],
      new Map([[clavePlaca('ABC 12F'), 'v1']]),
    );
    expect(r.map((x) => x.estado)).toEqual(['nuevo', 'existe', 'error', 'error', 'error']);
    expect(r[0].datos).toMatchObject({ plate: 'WNP 103', passenger_capacity: 40, status: 'available', is_active: true });
    expect(r[1]).toMatchObject({ id: 'v1', datos: { soat_expiry: '2027-03-14' } });
    expect(r.slice(2).map((x) => x.error?.codigo)).toEqual(['placaVacia', 'tipoInvalido', 'placaRepetida']);
    expect(resumenImportacion(r)).toEqual({ nuevos: 1, existen: 1, errores: 3 });
  });

  test('conductores: con empleo exige licencia; el externo entra con su nombre', () => {
    const r = analizarConductores(
      [
        { fila: 2, datos: { employment_id: 'e1', license_number: '1', license_category: 'c2', license_expiry: '2028-08-18', blood_type: 'o+' } },
        { fila: 3, datos: { employment_id: 'e2' } },
        { fila: 4, datos: { full_name: 'Karen Díaz', document_number: '1.020.334', vehicle_type: 'bicycle' } },
        { fila: 5, datos: {} },
      ],
      new Map([['e1', 'd1']]),
    );
    expect(r.map((x) => x.estado)).toEqual(['existe', 'error', 'nuevo', 'error']);
    expect(r[0].datos).toMatchObject({ license_category: 'C2', blood_type: 'O+', employment_id: 'e1' });
    expect(r[2].datos).toMatchObject({ is_external: true, full_name: 'Karen Díaz', document_number: '1020334', document_type: 'CC', vehicle_type: 'bicycle' });
    expect([r[1].error?.codigo, r[3].error?.codigo]).toEqual(['licenciaIncompleta', 'identidadFaltante']);
  });
});

describe('fichas: documentos, viajes y novedades', () => {
  test('documentos de un dueño: los de Flota y los que no tienen vencimiento', () => {
    const tabla: DocumentoTabla[] = [
      { id: 'doc1', vehicle_id: 'v1', driver_credential_id: null, doc_type: 'soat', number: 'AT-1', issuer: 'Aseguradora', category: null, expires_on: '2026-12-01', blocks_dispatch: true, file_path: 'a/b.pdf', file_name: 'b.pdf', notes: null },
      { id: 'doc2', vehicle_id: 'v1', driver_credential_id: null, doc_type: 'otro', number: 'X', issuer: null, category: null, expires_on: null, blocks_dispatch: false, file_path: null, file_name: null, notes: null },
      { id: 'doc3', vehicle_id: 'v2', driver_credential_id: null, doc_type: 'soat', number: 'Y', issuer: null, category: null, expires_on: '2027-01-01', blocks_dispatch: true, file_path: null, file_name: null, notes: null },
    ];
    const docs = documentosFlota(
      [
        { id: 'v1', plate: 'WNP 103', vehicle_type: 'bus', soat_expiry: '2026-12-01', techno_expiry: '2026-10-01', insurance_expiry: null, operating_card_expiry: null },
        { id: 'v2', plate: 'ABC', vehicle_type: 'car', soat_expiry: null, techno_expiry: null, insurance_expiry: null, operating_card_expiry: null },
      ],
      [],
      HOY,
      tabla,
    );
    const filas = documentosDeDueno('vehiculo', 'v1', docs, tabla);
    expect(filas.map((f) => [f.tipo, f.estado])).toEqual([
      ['tecnomecanica', 'vencido'],
      ['soat', 'por_vencer'],
      ['otro', 'sin_fecha'],
    ]);
    expect(filas[1]).toMatchObject({ numero: 'AT-1', entidad: 'Aseguradora', archivo: 'a/b.pdf' });
    expect(peorDocumento(filas)).toMatchObject({ estado: 'vencido', tipo: 'tecnomecanica' });
    expect(peorDocumento(filas.slice(2)).estado).toBe('sin_fecha');
  });

  const viaje = (x: Partial<Trip> & { status: string }) => ({ id: 't', trip_code: 'V-1', trip_date: HOY, total_seats: 40, available_seats: 12, ...x }) as unknown as Trip;

  test('viaje en curso, viajes del mes, programados, ocupación y llegada', () => {
    const vs = [viaje({ id: 'a', status: 'completed', trip_date: '2026-11-02' }), viaje({ id: 'b', status: 'boarding' }), viaje({ id: 'c', status: 'scheduled', trip_date: '2026-12-02' }), viaje({ id: 'd', status: 'cancelled' })];
    expect(viajeEnCurso(vs)?.id).toBe('b');
    expect(viajesDelMes(vs, HOY)).toBe(2);
    expect(viajesProgramados(vs, HOY).map((v) => v.id)).toEqual(['b', 'c']);
    expect(ocupacionViaje(vs[0])).toEqual({ vendidos: 28, total: 40 });
    expect(ocupacionViaje({ total_seats: 0, available_seats: 0 })).toBeNull();
    expect(llegadaViaje({ status: 'completed', delay_minutes: 12 })).toEqual({ tipo: 'retraso', minutos: 12 });
    expect(llegadaViaje({ status: 'arrived', delay_minutes: null })).toEqual({ tipo: 'aTiempo' });
    expect(llegadaViaje({ status: 'boarding' })).toEqual({ tipo: 'estado', estado: 'boarding' });
  });

  test('filtro de novedades por referencia (solo uuid, sin repetidos)', () => {
    const u = '11111111-2222-3333-4444-555555555555';
    expect(filtroNovedades([{ tipo: 'vehicle', ids: [u] }, { tipo: 'trip', ids: [] }, { tipo: 'shipment', ids: ['malo;drop', u, u] }])).toBe(
      `and(reference_type.eq.vehicle,reference_id.in.(${u})),and(reference_type.eq.shipment,reference_id.in.(${u}))`,
    );
    expect(filtroNovedades([{ tipo: 'trip', ids: [] }])).toBeNull();
  });

  test('historial: bitácora, documentos, despachos, novedades y alta, del más reciente al más viejo', () => {
    const ev = eventosHistorial({
      bitacora: [{ tipo: 'estado', de: 'available', a: 'maintenance', motivo: 'Frenos', at: '2026-11-24T14:00:00Z' }],
      documentos: [{ id: 'd1', doc_type: 'tecnomecanica', expires_on: '2026-12-02', is_active: true, created_at: '2026-11-22T21:00:00Z' }],
      viajes: [{ ...viaje({ id: 't1', status: 'completed', trip_code: 'V-1118' }), dispatched_at: '2026-11-18T12:30:00Z' }, viaje({ id: 't2', status: 'scheduled' })],
      otroDeViaje: () => 'Pedro',
      novedades: [{ id: 'n1', title: 'Retraso', reported_at: '2026-11-20T10:00:00Z', occurred_at: null }],
      creado: '2026-11-03T15:00:00Z',
    });
    expect(ev.map((e) => e.tipo)).toEqual(['estado', 'documento', 'novedad', 'despacho', 'alta']);
    expect(ev[3]).toMatchObject({ codigo: 'V-1118', otro: 'Pedro' });
  });
});
