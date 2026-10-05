/** @jest-environment jsdom */
import { volverCabeceraMovil } from '../cabeceraMovil';
test('el editor móvil controla Atrás; el shell no navega si se bloquea por guardado', () => {
  const router = { back: jest.fn(), push: jest.fn() }; const onVolver = jest.fn();
  volverCabeceraMovil({ titulo: 'Editor', onVolver }, 3, router, '/app/crm/secuencias');
  expect(onVolver).toHaveBeenCalledTimes(1); expect(router.back).not.toHaveBeenCalled(); expect(router.push).not.toHaveBeenCalled();
});
test('sin callback se conserva Atrás y, sin historial, volverA o la ruta padre', () => {
  const router = { back: jest.fn(), push: jest.fn() };
  volverCabeceraMovil(null, 2, router, '/app/crm'); expect(router.back).toHaveBeenCalledTimes(1);
  volverCabeceraMovil({ titulo: 'Detalle', volverA: '/app/crm/secuencias' }, 1, router, '/app/crm'); expect(router.push).toHaveBeenLastCalledWith('/app/crm/secuencias');
  volverCabeceraMovil(null, 1, router, '/app/crm'); expect(router.push).toHaveBeenLastCalledWith('/app/crm');
});
