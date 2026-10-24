import { leerFiltrosInforme } from '../filtros';

describe('Filtros de informes contables', () => {
  test('acepta día bisiesto y filtros completos tipados', () => {
    const respuesta = leerFiltrosInforme(new URLSearchParams({ desde: '2024-02-29', hasta: '2024-03-01', nivel: 'auxiliar', branch_id: '2', product_id: '3', cost_center_id: '00000000-0000-4000-8000-000000000001', cuenta: '1435' }));
    expect(respuesta.error).toBeNull();
    expect(respuesta.datos).toMatchObject({ branch_id: 2, product_id: 3, nivel: 'auxiliar', cuenta: '1435' });
  });
  test.each([
    { desde: '2025-02-29', hasta: '2025-03-01' },
    { desde: '2025-01-02', hasta: '2025-01-01' },
    { desde: '2025-01-01', hasta: '2025-12-31', branch_id: '-1' },
    { desde: '2025-01-01', hasta: '2025-12-31', cost_center_id: 'otro' },
    { desde: '2025-01-01', hasta: '2025-12-31', cuenta: '13%20OR%201=1' },
  ])('rechaza fechas y filtros inválidos: %j', (caso) => {
    const parametros = new URLSearchParams(Object.entries(caso).filter((par): par is [string, string] => typeof par[1] === 'string'));
    expect(leerFiltrosInforme(parametros).error).toBeTruthy();
  });
});
