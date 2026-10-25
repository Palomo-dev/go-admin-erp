/** @jest-environment jsdom */

import { useState, type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ParametrosFiscalesForm } from '../ParametrosFiscalesForm';
import { AnotacionesAsientosForm } from '../AnotacionesAsientosForm';
import type { AnotacionAsientoInforme } from '@/lib/finanzas/informes/configuracion';

const mockHoy = () => '2026-10-24';
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ getToday: mockHoy, formatPlain: (fecha: string) => fecha }), useOrgTimezone: () => ({ isLoading: false }) }));
jest.mock('@/components/kit', () => ({
  FormSection: ({ titulo, children }: { titulo: string; children: ReactNode }) => <section><h2>{titulo}</h2>{children}</section>,
  FormField: ({ etiqueta, children }: { etiqueta: string; children: ReactNode }) => <label>{etiqueta}{children}</label>,
  CampoFecha: ({ valor, onValorChange }: { valor: string; onValorChange: (dia: string) => void }) => <input type="date" value={valor} onChange={(evento) => onValorChange(evento.target.value)} />,
  clasesBoton: () => '',
}));
jest.mock('@/components/kit/AvisoTonal', () => ({ AvisoTonal: ({ titulo }: { titulo: string }) => <p role="alert">{titulo}</p> }));

function FiscalHarness() {
  const [valor, setValor] = useState<Record<string, unknown>>({ anios: { '2025': { topes_exogena: { '1001': 12 } }, '2026': { topes_exogena: { '1001': 42 } } } });
  return <><ParametrosFiscalesForm valor={valor} onChange={setValor} /><pre data-testid="fiscal">{JSON.stringify(valor)}</pre></>;
}
const leerFiscal = () => JSON.parse(screen.getByTestId('fiscal').textContent ?? '{}');

it('edita y limpia topes del año sin alterar otros años ni convertir vacío en cero', async () => {
  render(<FiscalHarness />);
  const tope = await screen.findByLabelText('Tope exógena 1001 · pesos');
  fireEvent.change(tope, { target: { value: '99' } });
  expect(leerFiscal().anios['2026'].topes_exogena['1001']).toBe(99);
  expect(leerFiscal().anios['2025'].topes_exogena['1001']).toBe(12);
  fireEvent.change(tope, { target: { value: '' } });
  expect(leerFiscal().anios['2026'].topes_exogena['1001']).toBeUndefined();
  fireEvent.change(screen.getByLabelText('Año de los parámetros'), { target: { value: '2025' } });
  expect((screen.getByLabelText('Tope exógena 1001 · pesos') as HTMLInputElement).value).toBe('12');
});

it('permite escribir varios auxiliares sin perder la coma ni concatenar códigos', async () => {
  render(<FiscalHarness />);
  const campo = await screen.findByLabelText('Auxiliares 1355 de reteIVA recibida');
  fireEvent.change(campo, { target: { value: '135515,' } });
  expect((campo as HTMLInputElement).value).toBe('135515,');
  fireEvent.change(campo, { target: { value: '135515, 135517' } });
  expect(leerFiscal().anios['2026'].auxiliares_reteiva_recibida).toEqual(['135515', '135517']);
});

it('una actividad nueva de ICA queda sin tarifa hasta que el contador la informe', async () => {
  render(<FiscalHarness />);
  await screen.findByLabelText('Año de los parámetros');
  fireEvent.click(screen.getByRole('button', { name: 'Agregar municipio' }));
  fireEvent.click(screen.getByRole('button', { name: 'Agregar actividad' }));
  expect(leerFiscal().anios['2026'].municipios_ica[0].actividades[0].tarifa_por_mil).toBeNull();
  fireEvent.change(screen.getByLabelText('Tarifa ICA por mil'), { target: { value: '4.14' } });
  expect(leerFiscal().anios['2026'].municipios_ica[0].actividades[0].tarifa_por_mil).toBe(4.14);
});

function AnotacionesHarness() {
  const [valor, setValor] = useState<Record<string, AnotacionAsientoInforme>>({ '99': { concepto_patrimonio: 'aportes' } });
  return <><AnotacionesAsientosForm valor={valor} onChange={setValor} /><pre data-testid="anotaciones">{JSON.stringify(valor)}</pre></>;
}

it('clasifica un asiento seleccionado sin modificar las clasificaciones de otros asientos', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ asientos: [{ id: 12, fecha: '2026-03-01', comprobante: 'NC-12', memo: 'Corrección documentada' }] }) });
  render(<AnotacionesHarness />);
  fireEvent.click(screen.getByRole('button', { name: 'Cargar asientos contabilizados' }));
  await screen.findByRole('option', { name: /NC-12/ });
  fireEvent.change(screen.getByLabelText('Asiento contabilizado'), { target: { value: '12' } });
  fireEvent.change(screen.getByLabelText('Movimiento del patrimonio'), { target: { value: 'correccion_errores' } });
  fireEvent.change(screen.getByLabelText('Provisión sin salida de efectivo'), { target: { value: 'si' } });
  fireEvent.change(screen.getByLabelText('Actividad del flujo de efectivo'), { target: { value: 'inversion' } });
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar clasificación del asiento' }));
  const anotaciones = JSON.parse(screen.getByTestId('anotaciones').textContent ?? '{}');
  expect(anotaciones['12']).toEqual({ concepto_patrimonio: 'correccion_errores', provision_sin_caja: true, cash_flow_activity: 'inversion' });
  expect(anotaciones['99']).toEqual({ concepto_patrimonio: 'aportes' });
  fireEvent.click(screen.getByRole('button', { name: 'Quitar clasificación' }));
  expect(JSON.parse(screen.getByTestId('anotaciones').textContent ?? '{}')['99']).toEqual({ concepto_patrimonio: 'aportes' });
});
