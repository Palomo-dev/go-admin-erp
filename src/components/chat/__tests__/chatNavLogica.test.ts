import { destinoPestanaChat, esPantallaAltoFijo, esRutaBandeja, pestanaChatActiva } from '../chatNavLogica';
import { moduloPorCodigo } from '@/lib/navigation/catalog';

const hrefs = (moduloPorCodigo('chat')?.paginas ?? []).filter((p) => p.enMenu !== false).map((p) => p.href);

describe('pestañas del Chat', () => {
  it('salen del catálogo (no hay lista cableada)', () => {
    expect(hrefs).toEqual(expect.arrayContaining(['/app/chat/bandeja', '/app/chat/canales', '/app/chat/ia', '/app/chat/auditoria']));
  });

  it('marca la pestaña de cada ruta del módulo', () => {
    expect(pestanaChatActiva('/app/chat/bandeja', hrefs)).toBe('/app/chat/bandeja');
    expect(pestanaChatActiva('/app/chat/conversaciones/abc', hrefs)).toBe('/app/chat/bandeja');
    expect(pestanaChatActiva('/app/chat/canales/whatsapp/1', hrefs)).toBe('/app/chat/canales');
    expect(pestanaChatActiva('/app/chat/conocimiento/fuentes/9', hrefs)).toBe('/app/chat/conocimiento');
    expect(pestanaChatActiva('/app/chat/ia/trabajos', hrefs)).toBe('/app/chat/ia');
    expect(pestanaChatActiva('/app/chat/widget/sesiones', hrefs)).toBe('/app/chat/widget/sesiones');
    expect(pestanaChatActiva('/app/chat/auditoria', hrefs)).toBe('/app/chat/auditoria');
  });

  it('no marca nada si la página no está visible para la persona', () => {
    expect(pestanaChatActiva('/app/chat/auditoria', ['/app/chat/bandeja'])).toBeNull();
    expect(pestanaChatActiva('/app/chat/bandejas', hrefs)).toBeNull();
  });

  it('la pestaña IA abre el Laboratorio', () => {
    expect(destinoPestanaChat('/app/chat/ia')).toBe('/app/chat/ia/laboratorio');
    expect(destinoPestanaChat('/app/chat/canales')).toBe('/app/chat/canales');
  });

  it('solo la Bandeja lleva «Nueva conversación»', () => {
    expect(esRutaBandeja('/app/chat/bandeja')).toBe(true);
    expect(esRutaBandeja('/app/chat/canales')).toBe(false);
  });

  it('alto fijo solo en la Bandeja y la conversación completa', () => {
    expect(esPantallaAltoFijo('/app/chat/bandeja')).toBe(true);
    expect(esPantallaAltoFijo('/app/chat/conversaciones/123')).toBe(true);
    expect(esPantallaAltoFijo('/app/chat/conversaciones/nueva')).toBe(false);
    expect(esPantallaAltoFijo('/app/chat/conversaciones/123/archivos')).toBe(false);
    expect(esPantallaAltoFijo('/app/chat/canales')).toBe(false);
  });
});
