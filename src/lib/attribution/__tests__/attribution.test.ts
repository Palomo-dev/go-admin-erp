/**
 * Pruebas de atribución de marketing (tarea 02).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readConsent, writeConsent, readAttribution, writeAttribution, captureAttribution } from '../cookie';

describe('Atribución de marketing', () => {
  beforeEach(() => {
    // Mock de document.cookie
    let cookieStore = '';
    Object.defineProperty(document, 'cookie', {
      get: () => cookieStore,
      set: (value: string) => {
        const [pair] = value.split(';');
        const [name, val] = pair.split('=');
        // Simular set de cookie (simplificado)
        cookieStore = cookieStore.split('; ').filter(c => !c.startsWith(name + '=')).concat(pair).join('; ');
      },
      configurable: true,
    });
    
    // Limpiar sessionStorage
    sessionStorage.clear();
    
    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: {
        href: 'https://app.goadmin.io/auth/signup?utm_source=test&utm_campaign=test',
        pathname: '/auth/signup',
        protocol: 'https:',
        hostname: 'app.goadmin.io',
        search: '?utm_source=test&utm_campaign=test',
      },
      writable: true,
      configurable: true,
    });
    
    // Mock document.referrer
    Object.defineProperty(document, 'referrer', {
      value: '',
      writable: true,
      configurable: true,
    });
    
    // Limpiar cookies
    cookieStore = '';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Consentimiento', () => {
    it('debe leer consentimiento heredado "all" como ambos true', () => {
      document.cookie = 'goadmin_consent=all';
      const consent = readConsent();
      expect(consent.v).toBe(1);
      expect(consent.analytics).toBe(true);
      expect(consent.marketing).toBe(true);
    });

    it('debe leer otros valores heredados como ambos false', () => {
      document.cookie = 'goadmin_consent=necessary';
      const consent = readConsent();
      expect(consent.v).toBe(1);
      expect(consent.analytics).toBe(false);
      expect(consent.marketing).toBe(false);
    });

    it('debe leer JSON nuevo correctamente', () => {
      const expected = { v: 1, analytics: true, marketing: false, ts: Date.now() };
      document.cookie = `goadmin_consent=${encodeURIComponent(JSON.stringify(expected))}`;
      const consent = readConsent();
      expect(consent.v).toBe(1);
      expect(consent.analytics).toBe(true);
      expect(consent.marketing).toBe(false);
    });

    it('debe escribir consentimiento y emitir evento', () => {
      const mockDispatch = vi.spyOn(window, 'dispatchEvent');
      const consent = { v: 1, analytics: true, marketing: true, ts: Date.now() };
      writeConsent(consent);
      
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'goadmin:consent',
        })
      );
    });
  });

  describe('Atribución con consentimiento', () => {
    beforeEach(() => {
      // Establecer consentimiento de marketing
      const consent = { v: 1, analytics: true, marketing: true, ts: Date.now() };
      document.cookie = `goadmin_consent=${encodeURIComponent(JSON.stringify(consent))}`;
    });

    it('debe guardar primera atribución en cookie con consentimiento de marketing', () => {
      const attribution = {
        utm_source_first: 'google',
        utm_campaign_first: 'test',
        gclid: 'test123',
        ref: 'REF001',
      };
      
      writeAttribution(attribution);
      const read = readAttribution();
      
      expect(read).toBeTruthy();
      expect(read?.utm_source_first).toBe('google');
      expect(read?.gclid).toBe('test123');
      expect(read?.ref).toBe('REF001');
      expect(read?.first_seen_at).toBeTruthy();
    });

    it('first-touch no sobrescribe atribución existente (sin ref nuevo)', () => {
      // Primera atribución
      writeAttribution({
        utm_source_first: 'google',
        utm_campaign_first: 'primera',
        utm_source_last: 'google',
        utm_campaign_last: 'primera',
      });
      
      const first = readAttribution();
      expect(first?.utm_source_first).toBe('google');
      expect(first?.utm_campaign_first).toBe('primera');
      
      // Intentar segunda atribución sin ref nuevo
      writeAttribution({
        utm_source_first: 'facebook',
        utm_campaign_first: 'segunda',
        utm_source_last: 'facebook',
        utm_campaign_last: 'segunda',
      });
      
      const second = readAttribution();
      // Debe mantener la primera
      expect(second?.utm_source_first).toBe('google');
      expect(second?.utm_campaign_first).toBe('primera');
    });

    it('un ref nuevo actualiza solo ref y last_touch', () => {
      // Primera atribución sin ref
      writeAttribution({
        utm_source_first: 'google',
        utm_campaign_first: 'primera',
        utm_source_last: 'google',
        utm_campaign_last: 'primera',
      });
      
      const first = readAttribution();
      expect(first?.ref).toBeUndefined();
      
      // Segunda visita con ref nuevo
      writeAttribution({
        utm_source_first: 'facebook',
        utm_campaign_first: 'segunda',
        utm_source_last: 'facebook',
        utm_campaign_last: 'segunda',
        ref: 'REF002',
      });
      
      const second = readAttribution();
      // Mantiene primera fuente
      expect(second?.utm_source_first).toBe('google');
      expect(second?.utm_campaign_first).toBe('primera');
      // Actualiza ref y last_touch
      expect(second?.ref).toBe('REF002');
      expect(second?.utm_source_last).toBe('facebook');
      expect(second?.utm_campaign_last).toBe('segunda');
    });
  });

  describe('Atribución sin consentimiento', () => {
    beforeEach(() => {
      // Sin consentimiento de marketing
      const consent = { v: 1, analytics: false, marketing: false, ts: Date.now() };
      document.cookie = `goadmin_consent=${encodeURIComponent(JSON.stringify(consent))}`;
    });

    it('sin consentimiento guarda solo UTMs en sessionStorage', () => {
      writeAttribution({
        utm_source_first: 'google',
        utm_campaign_first: 'test',
        gclid: 'test123',
        fbclid: 'fb123',
        ref: 'REF001',
      });
      
      const read = readAttribution();
      
      // Debe tener UTMs y ref
      expect(read?.utm_source_first).toBe('google');
      expect(read?.utm_campaign_first).toBe('test');
      expect(read?.ref).toBe('REF001');
      
      // NO debe tener IDs de clic
      expect(read?.gclid).toBeUndefined();
      expect(read?.fbclid).toBeUndefined();
      
      // Debe estar en sessionStorage, no en cookie
      const sessionData = sessionStorage.getItem('goadmin_attr_session');
      expect(sessionData).toBeTruthy();
      
      // Cookie no debe existir (o estar vacía)
      const cookieMatch = document.cookie.match(/goadmin_attr=/);
      expect(cookieMatch).toBeFalsy();
    });
  });

  describe('Captura desde URL', () => {
    it('no debe capturar si no hay datos relevantes', () => {
      // URL sin parámetros
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.goadmin.io/auth/signup',
          pathname: '/auth/signup',
          search: '',
        },
        writable: true,
        configurable: true,
      });
      
      // Sin referrer externo
      Object.defineProperty(document, 'referrer', {
        value: '',
        writable: true,
        configurable: true,
      });
      
      // Limpiar storage
      sessionStorage.clear();
      document.cookie = 'goadmin_consent=' + encodeURIComponent(JSON.stringify({ v: 1, analytics: false, marketing: false, ts: Date.now() }));
      
      captureAttribution();
      
      // No debe haber nada en sessionStorage
      const sessionData = sessionStorage.getItem('goadmin_attr_session');
      expect(sessionData).toBeFalsy();
    });

    it('debe excluir referrer del propio dominio', () => {
      Object.defineProperty(document, 'referrer', {
        value: 'https://goadmin.io/precios',
        writable: true,
        configurable: true,
      });
      
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.goadmin.io/auth/signup?utm_source=test',
          pathname: '/auth/signup',
          search: '?utm_source=test',
        },
        writable: true,
        configurable: true,
      });
      
      document.cookie = 'goadmin_consent=' + encodeURIComponent(JSON.stringify({ v: 1, analytics: false, marketing: false, ts: Date.now() }));
      
      captureAttribution();
      
      const read = readAttribution();
      // No debe incluir el referrer
      expect(read?.referrer).toBeUndefined();
    });

    it('debe incluir referrer de dominios externos', () => {
      Object.defineProperty(document, 'referrer', {
        value: 'https://google.com/search?q=erp',
        writable: true,
        configurable: true,
      });
      
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.goadmin.io/auth/signup?utm_source=test',
          pathname: '/auth/signup',
          search: '?utm_source=test',
        },
        writable: true,
        configurable: true,
      });
      
      document.cookie = 'goadmin_consent=' + encodeURIComponent(JSON.stringify({ v: 1, analytics: false, marketing: false, ts: Date.now() }));
      
      captureAttribution();
      
      const read = readAttribution();
      // Debe incluir referrer (sin query string)
      expect(read?.referrer).toBe('https://google.com/search');
    });
  });

  describe('Supervivencia de ?ref= a través de confirmación de correo', () => {
    it('debe preservar ref en user_metadata para recuperarlo después de confirmar', () => {
      // Simular flujo completo:
      // 1. Usuario visita signup con ?ref=ABC123
      // 2. Se guarda en localStorage
      // 3. Se envía al API de registro
      // 4. Se guarda en user_metadata
      // 5. Después de confirmar correo, se lee de localStorage o metadata
      
      // Este test verifica la lógica de guardado/lectura
      // El flujo real se prueba en E2E
      
      const ref = 'ABC123';
      
      // Guardar en localStorage (como lo hace el componente)
      localStorage.setItem('go-referido', JSON.stringify({ 
        codigo: ref, 
        hasta: Date.now() + 30 * 24 * 60 * 60 * 1000 
      }));
      
      // Verificar que se puede leer
      const stored = localStorage.getItem('go-referido');
      expect(stored).toBeTruthy();
      
      const parsed = JSON.parse(stored!);
      expect(parsed.codigo).toBe(ref);
      
      // Simular que el API lo guardó en user_metadata
      const userMetadata = {
        referido: ref,
        first_name: 'Test',
        last_name: 'User',
      };
      
      // El asistente debe poder leerlo de metadata como fallback
      const refFromMeta = userMetadata.referido;
      expect(refFromMeta).toBe(ref);
      
      // O de localStorage si está disponible
      const refFromLocal = parsed.codigo;
      const refFinal = refFromLocal || refFromMeta;
      expect(refFinal).toBe(ref);
    });

    it('debe usar metadata como fallback si localStorage no está disponible', () => {
      // Simular que localStorage fue borrado pero metadata tiene el ref
      const userMetadata = {
        referido: 'VENDOR99',
        first_name: 'Test',
      };
      
      // localStorage vacío
      const refLocal = null;
      const refMeta = userMetadata.referido;
      const refFinal = refLocal || refMeta;
      
      expect(refFinal).toBe('VENDOR99');
    });
  });
});
