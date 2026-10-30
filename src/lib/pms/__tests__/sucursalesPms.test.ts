import { esSucursalHotelera, sucursalesParaRuta, rutaPmsSoloHotel } from '../sucursalesPms';

const sucursales = [
  { id: 108, name: 'Sucursal Principal', branch_type: null },
  { id: 528, name: 'Restaurante', branch_type: 'restaurant' },
  { id: 9, name: 'Hotel 2', branch_type: 'hotel' },
];

describe('sucursalesPms', () => {
  it('oculta restaurantes solo en Limpieza y Mantenimiento del PMS', () => {
    expect(sucursalesParaRuta(sucursales, '/app/pms/housekeeping').map((b) => b.id)).toEqual([108, 9]);
    expect(sucursalesParaRuta(sucursales, '/app/pms/mantenimiento/123').map((b) => b.id)).toEqual([108, 9]);
    expect(sucursalesParaRuta(sucursales, '/app/pos').length).toBe(3);
    expect(sucursalesParaRuta(sucursales, '/app/pms/reservas').length).toBe(3);
    expect(rutaPmsSoloHotel('/app/pms/housekeepingx')).toBe(false);
  });
  it('hotelera = hotel o sin tipo', () => {
    expect(sucursales.filter(esSucursalHotelera).map((b) => b.id)).toEqual([108, 9]);
  });
});
