/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as Popover from '@radix-ui/react-popover';
import { useState } from 'react';
import { useAtajosEditor } from '../useAtajosEditor';

const acciones = {
  guardarAhora: jest.fn(async () => true), canUndo: true, canRedo: true,
  deshacer: jest.fn(), rehacer: jest.fn(), activeSectionId: 's-1', duplicarSeccion: jest.fn(async () => undefined),
  seleccionarSeccion: jest.fn(), seleccionarZona: jest.fn(),
};
const eliminar = jest.fn();
function Pantalla() {
  useAtajosEditor(acciones, eliminar);
  const [abierto, setAbierto] = useState(true);
  return <><aside>Sección seleccionada: {acciones.activeSectionId}</aside><Popover.Root open={abierto} onOpenChange={setAbierto}><Popover.Trigger>Opciones</Popover.Trigger><Popover.Content><button>Acción del popover</button></Popover.Content></Popover.Root><input aria-label="Título" /></>;
}
beforeEach(() => jest.clearAllMocks());

test('Escape cierra solo el popover y conserva selección y paneles', async () => {
  render(<Pantalla />);
  expect(screen.getByText('Acción del popover')).toBeTruthy();
  fireEvent.keyDown(screen.getByText('Acción del popover'), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByText('Acción del popover')).toBeNull());
  expect(screen.getByText('Sección seleccionada: s-1')).toBeTruthy();
  expect(acciones.seleccionarSeccion).not.toHaveBeenCalled();
  expect(acciones.seleccionarZona).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.getByText('Sección seleccionada: s-1')).toBeTruthy();
});

test('los demás atajos siguen funcionando y no borran la sección mientras se escribe', () => {
  render(<Pantalla />);
  fireEvent.keyDown(screen.getByLabelText('Título'), { key: 's', ctrlKey: true });
  expect(acciones.guardarAhora).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(screen.getByLabelText('Título'), { key: 'Delete' });
  expect(eliminar).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: 'Delete' });
  expect(eliminar).toHaveBeenCalledWith('s-1');
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
  expect(acciones.deshacer).toHaveBeenCalledTimes(1);
});
