/**
 * Flujo genérico del agente de voz (sin agente del CRM): `organizations` no tiene
 * `business_type`. Pedirla hacía fallar `buildAgentContext` y `getBusinessInfo`
 * en cada llamada; el tipo de negocio sale de `organization_types.name`.
 */
import fs from 'fs';
import path from 'path';
import { tipoDeNegocio } from '@/lib/services/integrations/twilio/voiceAgent/voiceAgentPrompts';

const DIR = path.join(process.cwd(), 'src/lib/services/integrations/twilio/voiceAgent');

describe('tipoDeNegocio', () => {
  it('lee el embebido muchos-a-uno como objeto', () => {
    expect(tipoDeNegocio({ organization_types: { name: 'restaurant' } })).toBe('restaurant');
  });

  it('acepta el embebido como arreglo', () => {
    expect(tipoDeNegocio({ organization_types: [{ name: 'retail' }] })).toBe('retail');
  });

  it('sin tipo o sin organización devuelve null', () => {
    expect(tipoDeNegocio({ organization_types: null })).toBeNull();
    expect(tipoDeNegocio({})).toBeNull();
    expect(tipoDeNegocio(null)).toBeNull();
  });
});

describe('ninguna lectura de organizations pide business_type', () => {
  it.each(['conversationRelayHandler.ts', 'voiceAgentTools.ts'])('%s', (archivo) => {
    const fuente = fs.readFileSync(path.join(DIR, archivo), 'utf8');
    // Entre `.from` y `.select` puede haber comentarios de línea.
    const re = /\.from\('organizations'\)(?:\s|\/\/[^\n]*)*\.select\('([^']*)'\)/g;
    const selects = Array.from(fuente.matchAll(re), (m) => m[1]);
    expect(selects.length).toBeGreaterThan(0);
    for (const s of selects) {
      expect(s).not.toMatch(/business_type/);
      expect(s).toMatch(/organization_types\(name\)/);
    }
  });
});
