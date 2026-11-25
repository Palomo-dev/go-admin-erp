/**
 * «Ver la ruta de» (supervisor, encargo 2026-11-25): opciones del selector con su carga y el peor
 * documento, reasignar solo donde la base deja y la parada como fila de la hoja «Asignar».
 */
import { filaDespachoDeParada, nombreCorto, opcionesRutaDe, puedeReasignar } from '../supervisorRuta';
import type { EnvioApp } from '@/lib/services/logistica/misEnviosService';

const HOY = '2026-11-25';
const ZONA = 'America/Bogota';

test('nombre corto del chip', () => {
  expect(nombreCorto('Jhon Ramírez')).toBe('Jhon R.');
  expect(nombreCorto('  Ana  ')).toBe('Ana');
  expect(nombreCorto('')).toBe('');
});

test('opciones: activos, en ruta primero, avance del día y el peor documento (vencido antes que por vencer)', () => {
  const op = opcionesRutaDe(
    [
      { id: 'a', full_name: 'Andrés Pérez', is_active: true, vehiculo: { id: 'v1', plate: 'PQS66C', vehicle_type: 'motorcycle', ownership: 'company', soat_expiry: '2026-12-02', techno_expiry: '2026-11-01' } },
      { id: 'b', full_name: 'Luisa Martínez', is_active: true, license_expiry: '2026-12-01', vehiculo: { id: 'v2', plate: 'HTR21F', vehicle_type: 'motorcycle', ownership: 'driver', soat_expiry: '2027-05-01', techno_expiry: '2027-05-01' } },
      { id: 'c', full_name: 'Karen Díaz', is_active: true, vehiculo: { id: 'v3', plate: null, vehicle_type: 'bicycle', ownership: 'driver', soat_expiry: '2020-01-01' } },
      { id: 'x', full_name: 'Inactivo', is_active: false },
    ],
    [
      { driver_id: 'b', status: 'out_for_delivery' },
      { driver_id: 'b', status: 'delivered', delivered_at: '2026-11-25T15:00:00Z' },
      { driver_id: 'a', status: 'assigned' },
    ],
    HOY,
    ZONA,
  );
  expect(op.map((o) => o.id)).toEqual(['b', 'a', 'c']);
  expect(op[0]).toMatchObject({ corto: 'Luisa M.', estado: 'en_ruta', paradas: 2, entregados: 1, placa: 'HTR21F', documento: { clave: 'licencia', estado: 'por_vencer', dias: 6 } });
  expect(op[1].documento).toMatchObject({ clave: 'tecnomecanica', estado: 'vencido' });
  // La bici no se revisa (igual que la base).
  expect(op[2].documento).toBeNull();
});

test('reasignar solo en los estados que la base deja (ESTADO_NO_ASIGNABLE)', () => {
  expect(puedeReasignar({ status: 'assigned' })).toBe(true);
  expect(puedeReasignar({ status: 'failed_attempt' })).toBe(true);
  expect(puedeReasignar({ status: 'picked' })).toBe(false);
  expect(puedeReasignar({ status: 'out_for_delivery' })).toBe(false);
  expect(puedeReasignar({ status: 'delivered' })).toBe(false);
});

test('la parada como fila de «Asignar domiciliario»: su domiciliario, su contraentrega y su promesa', () => {
  const e = {
    id: 'e6', organization_id: 120, driver_id: 'drv-1', shipment_number: 'ENV-1047', status: 'assigned', source_type: 'web_order', source_id: 'wo-1',
    branch_id: 3, delivery_address: 'Cl 26', delivery_city: 'Bogotá', cod_amount: 100000, cod_status: 'pending', promesa: '2026-11-25T19:00:00Z',
    created_at: '2026-11-25T12:00:00Z', fulfillment_mode: 'own', vehicle_id: 'v1', metadata: { delivery_neighborhood: 'Salitre' },
  } as unknown as EnvioApp;
  const f = filaDespachoDeParada(e, 'Domiciliario Uno');
  expect(f).toMatchObject({ id: 'e6', numero: 'ENV-1047', status: 'assigned', modo: 'own', domiciliarioId: 'drv-1', domiciliario: 'Domiciliario Uno', contraentrega: 100000, barrio: 'Salitre', vehiculoId: 'v1', promesa: '2026-11-25T19:00:00Z' });
});
