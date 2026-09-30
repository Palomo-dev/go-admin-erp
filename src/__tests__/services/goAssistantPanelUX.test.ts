/**
 * GO Assistant — revisión de escritorio (docs/design/GO-ASISTENTE-ESCRITORIO.md §5).
 *
 * Lo que se prueba aquí es lo que se puede probar sin navegador: la lógica de
 * sugerencias por pantalla, el contrato del endpoint de créditos, y por lectura
 * del código, que la interfaz dejó de hacer lo que el diseño señalaba (avatares
 * con degradado morado, resultado de una acción como mensaje con ✅/❌ suelto,
 * papelera donde debería haber "nueva conversación").
 */

import fs from 'fs';
import path from 'path';
import { suggestionsForPath } from '@/lib/services/aiAssistantService';
import { creditLevel, LOW_CREDITS } from '@/lib/ai/assistant/credits';

const SRC = path.join(process.cwd(), 'src');
const leer = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8');
/** Textos del panel en español: desde el rediseño del Figma viven en `messages/es.json` › `asistente`. */
const ES = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages', 'es.json'), 'utf8')).asistente;

describe('sugerencias según la pantalla', () => {
  it('propone lo de la pantalla en la que está el usuario', () => {
    expect(suggestionsForPath('/app/finanzas/facturas-venta')).toContain('Crea una factura de venta');
    expect(suggestionsForPath('/app/inventario/productos')).toContain('Sube este listado de productos');
    expect(suggestionsForPath('/app/clientes')).toContain('Crea un cliente nuevo');
    expect(suggestionsForPath('/app/pos/caja')).toContain('Registra una venta');
  });

  it('la ruta más específica gana a la general', () => {
    expect(suggestionsForPath('/app/inventario/productos/nuevo')).not.toEqual(suggestionsForPath('/app/inventario'));
  });

  it('una ruta desconocida o vacía no aporta nada (mandan las del estado real)', () => {
    expect(suggestionsForPath('/app/loquesea')).toEqual([]);
    expect(suggestionsForPath('')).toEqual([]);
    expect(suggestionsForPath(null)).toEqual([]);
    expect(suggestionsForPath(undefined)).toEqual([]);
  });

  it('el panel manda la ruta y el endpoint la valida antes de usarla', () => {
    // La ruta sale de la ventana, salvo que la persona quite el chip de contexto.
    const panel = leer('components/app-layout/Header/AIAssistantPanel.tsx');
    expect(panel).toContain('currentPath: rutaContexto()');
    expect(panel).toContain('usarContexto && typeof window');
    const route = leer('app/api/ai-assistant/suggestions/route.ts');
    expect(route).toContain("raw.startsWith('/')");
    expect(route).toContain('currentPath');
  });
});

describe('saldo de créditos visible', () => {
  it('el umbral clasifica el saldo', () => {
    expect(creditLevel(0)).toBe('empty');
    expect(creditLevel(-5)).toBe('empty');
    expect(creditLevel(LOW_CREDITS - 1)).toBe('low');
    expect(creditLevel(LOW_CREDITS)).toBe('ok');
  });

  it('el endpoint autentica, no cachea y clasifica el saldo', () => {
    const route = leer('app/api/ai-assistant/credits/route.ts');
    expect(route).toContain('getServerOrgContext');
    expect(route).toContain("'no-store'");
    expect(route).toContain('creditLevel(credits)');
    // El umbral vive fuera del route: un export de más rompe `.next/types`.
    expect(route).not.toMatch(/^export (?!async function GET)/m);
    expect(route).toContain('checkRateLimit');
    // Solo lectura: nada de escribir ni cobrar desde aquí.
    expect(route).not.toContain('chargeAiCredits');
  });

  it('el panel lo pide al abrir y lo refresca al terminar el turno; el composer lo pinta', () => {
    const panel = leer('components/app-layout/Header/AIAssistantPanel.tsx');
    expect(panel).toContain("fetch('/api/ai-assistant/credits')");
    expect(panel.match(/void loadCredits\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(panel).toContain('credits={credits}');
    const composer = leer('components/app-layout/Header/assistant/Composer.tsx');
    expect(composer).toContain("credits.level === 'empty'");
    // El enlace de compra vive en el aviso (Figma `AsistenteAviso`), que el panel pinta al abrir.
    expect(leer('components/app-layout/Header/assistant/AssistantNotice.tsx')).toContain('/app/plan');
    expect(panel).toContain('<AssistantNotice tipo="sin_creditos"');
  });
});

describe('la interfaz que el diseño señalaba', () => {
  const panel = () => leer('components/app-layout/Header/AIAssistantPanel.tsx');

  it('no quedan avatares ni degradado morado', () => {
    expect(panel()).not.toContain('from-blue-500 to-purple-500');
    expect(panel()).not.toContain('<Avatar');
  });

  it('el resultado de una acción ya no es un mensaje con ✅/❌ suelto en el hilo', () => {
    const p = panel();
    expect(p).not.toContain('✅ **Acción completada:**');
    expect(p).not.toContain('❌ **Error:**');
    expect(p).toContain('setActionOutcome(');
    expect(p).toContain('outcome={actionOutcome}');
  });

  it('la tarjeta muestra el desenlace en su sitio, con Ver y Deshacer', () => {
    const card = leer('components/app-layout/Header/ActionConfirmationForm.tsx');
    expect(card).toContain('outcome');
    expect(card).toContain("t('deshacerMin'");
    expect(card).toContain("t('corregirReintentar')");
    expect(ES.tarjeta.deshacer).toBe('Deshacer');
    expect(ES.tarjeta.corregirReintentar).toBe('Corregir y reintentar');
  });

  it('la papelera es "Nueva conversación" y se puede copiar una respuesta', () => {
    const p = panel();
    expect(ES.cabecera.nueva).toBe('Nueva conversación');
    expect(JSON.stringify(ES)).not.toContain('Limpiar conversación');
    expect(leer('components/app-layout/Header/assistant/PanelHeader.tsx')).toContain("t('nueva')");
    expect(p).toContain('copyMessage');
    expect(ES.mensaje.copiarRespuesta).toBe('Copiar respuesta');
  });

  it('los pasos se pliegan cuando empieza a llegar la respuesta', () => {
    expect(leer('components/app-layout/Header/assistant/TurnInProgress.tsx')).toContain('<details');
  });

  it('el nombre del modelo del proveedor ya no se enseña al cliente', () => {
    const p = panel();
    expect(p).not.toContain('Modelo:');
    expect(p).not.toContain('answeringModel');
  });

  it('el título es «GO Asistente» en español, no «GO Assistant»', () => {
    expect(ES.cabecera.titulo).toBe('GO Asistente');
    expect(panel()).not.toMatch(/>\s*GO Assistant\s*</);
  });
});
