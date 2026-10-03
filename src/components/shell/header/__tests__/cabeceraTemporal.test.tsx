/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { CabeceraMovilProvider, useCabeceraMovil, useCabeceraMovilActual, useCabeceraMovilTemporal } from '../cabeceraMovil';

function Pagina({ title }: { title: string }) {
  useCabeceraMovil({ titulo: title, ocultarBarra: false });
  return null;
}
function Temporal({ title }: { title: string }) {
  useCabeceraMovilTemporal({ titulo: title, onVolver: () => undefined, ocultarBarra: false });
  return null;
}
function Header() {
  const header = useCabeceraMovilActual();
  return <output>{header?.titulo}</output>;
}
function Shell({ title, phone, second = false }: { title: string; phone: boolean; second?: boolean }) {
  return <CabeceraMovilProvider><Pagina title={title}/>{phone && <Temporal title="Teléfono"/>}{second && <Temporal title="Resultado"/>}<Header/></CabeceraMovilProvider>;
}

test('el teléfono mantiene su cabecera y al cerrar recupera la versión actual de la página', () => {
  const { rerender } = render(<Shell title="Llamadas" phone={false}/>);
  expect(screen.getByRole('status').textContent).toBe('Llamadas');
  rerender(<Shell title="Llamadas" phone/>);
  expect(screen.getByRole('status').textContent).toBe('Teléfono');
  rerender(<Shell title="Historial actualizado" phone/>);
  expect(screen.getByRole('status').textContent).toBe('Teléfono');
  rerender(<Shell title="Historial actualizado" phone={false}/>);
  expect(screen.getByRole('status').textContent).toBe('Historial actualizado');
});

test('cada panel libera únicamente su propia cabecera temporal', () => {
  const { rerender } = render(<Shell title="Llamadas" phone second/>);
  expect(screen.getByRole('status').textContent).toBe('Resultado');
  rerender(<Shell title="Llamadas" phone second={false}/>);
  expect(screen.getByRole('status').textContent).toBe('Teléfono');
  rerender(<Shell title="Llamadas" phone={false}/>);
  expect(screen.getByRole('status').textContent).toBe('Llamadas');
});
