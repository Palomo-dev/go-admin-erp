/**
 * QuickActionsBar — lógica pura (FASE-09 §9.1). No hay @testing-library
 * instalado (jest testEnvironment node), así que se prueba la configuración
 * que decide qué botones/modos se muestran y por qué.
 */
import { getCallModes, getQuickActions, normalizePhone } from '../quickActionsConfig';

const customer = { email: 'a@b.co', phone: '3001234567' };

describe('quickActionsConfig', () => {
  test('todas las acciones habilitadas con cliente completo y oportunidad', () => {
    const items = getQuickActions({ customer, hasOpportunity: true, hasCustomer: true, softphone: null });
    expect(items.map((i) => i.kind)).toEqual(['call', 'email', 'whatsapp', 'meeting', 'task', 'note']);
    expect(items.every((i) => i.enabled)).toBe(true);
  });

  test('sin email → Email deshabilitado con motivo; sin teléfono → WhatsApp deshabilitado', () => {
    const items = getQuickActions({ customer: { email: null, phone: null }, hasOpportunity: true, hasCustomer: true, softphone: null });
    const email = items.find((i) => i.kind === 'email')!;
    const wa = items.find((i) => i.kind === 'whatsapp')!;
    expect(email.enabled).toBe(false);
    expect(email.reason).toMatch(/email/i);
    expect(wa.enabled).toBe(false);
    expect(wa.reason).toMatch(/tel/i);
    expect(items.find((i) => i.kind === 'note')!.enabled).toBe(true);
  });

  test('sin oportunidad ni cliente → todo deshabilitado', () => {
    const items = getQuickActions({ customer: null, hasOpportunity: false, hasCustomer: false, softphone: null });
    expect(items.every((i) => !i.enabled)).toBe(true);
  });

  test('actions limita los botones renderizados', () => {
    const items = getQuickActions({ customer, hasOpportunity: true, hasCustomer: true, softphone: null, actions: ['note', 'task'] });
    expect(items.map((i) => i.kind)).toEqual(['note', 'task']);
  });

  test('modos de llamada: sin SoftphoneProvider → navegador deshabilitado, celular habilitado, IA deshabilitada', () => {
    const modes = getCallModes({ customer, hasOpportunity: true, hasCustomer: true, softphone: null });
    expect(modes.find((m) => m.mode === 'browser')!.enabled).toBe(false);
    expect(modes.find((m) => m.mode === 'browser')!.reason).toMatch(/Softphone/);
    expect(modes.find((m) => m.mode === 'mobile')!.enabled).toBe(true);
    expect(modes.find((m) => m.mode === 'ai')!.enabled).toBe(false);
  });

  test('modos de llamada: softphone registrado → navegador habilitado; registrando → deshabilitado', () => {
    expect(getCallModes({ customer, hasOpportunity: true, hasCustomer: true, softphone: { deviceState: 'registered' } }).find((m) => m.mode === 'browser')!.enabled).toBe(true);
    expect(getCallModes({ customer, hasOpportunity: true, hasCustomer: true, softphone: { deviceState: 'registering' } }).find((m) => m.mode === 'browser')!.enabled).toBe(false);
  });

  test('normalizePhone: 10 dígitos → +57, ya E.164 se respeta, 00 → +', () => {
    expect(normalizePhone('300 123 4567')).toBe('+573001234567');
    expect(normalizePhone('+1 (415) 555-0100')).toBe('+14155550100');
    expect(normalizePhone('0057123')).toBe('+57123');
    expect(normalizePhone('')).toBeNull();
  });

  // GEMELO de F-4 (tester F16 r3). De aquí salen el enlace de WhatsApp y la
  // LLAMADA desde el móvil: poner `+57` a cualquier número de 10 dígitos
  // significaba escribir o llamar a un tercero con un número colombiano real.
  test('normalizePhone: un número de 10 dígitos que NO es colombiano no se convierte en colombiano', () => {
    expect(normalizePhone('415 555 0100')).toBeNull();
    expect(normalizePhone('415 555 0100', '1')).toBe('+14155550100');
  });

  test('normalizePhone: una cédula escrita en el campo teléfono no es un teléfono', () => {
    expect(normalizePhone('1036395459')).toBeNull();
    expect(normalizePhone('1010062107')).toBeNull();
  });

  test('normalizePhone: los fijos y móviles colombianos de 10 dígitos siguen valiendo', () => {
    expect(normalizePhone('3109876543')).toBe('+573109876543');
    expect(normalizePhone('601 234 5678')).toBe('+576012345678');
  });
});
