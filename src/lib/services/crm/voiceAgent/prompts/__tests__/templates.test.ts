/**
 * Tests para el módulo de plantillas de prompts de agentes de voz
 */

import {
  fillPromptVariables,
  getOrigenDatoFrase,
  validatePromptVariables,
  PROMPT_PROSPECCION_LEADS_NUEVOS,
  FIRST_MESSAGE_PROSPECCION_LEADS_NUEVOS,
  PROMPT_PROSPECCION_CLIENTES_EXISTENTES,
  FIRST_MESSAGE_PROSPECCION_CLIENTES_EXISTENTES,
  PROMPT_ENCUESTA_SATISFACCION,
  RESPUESTA_ERES_ROBOT,
} from '../templates';

describe('Voice Agent Prompt Templates', () => {
  describe('fillPromptVariables', () => {
    it('reemplaza variables simples correctamente', () => {
      const template = 'Hola {{nombre}}, bienvenido a {{empresa}}';
      const result = fillPromptVariables(template, {
        nombre: 'Juan',
        empresa: 'GO Admin',
      });
      expect(result).toBe('Hola Juan, bienvenido a GO Admin');
    });

    it('conserva variables no proporcionadas', () => {
      const template = 'Hola {{nombre}}, tu código es {{codigo}}';
      const result = fillPromptVariables(template, { nombre: 'Ana' });
      expect(result).toBe('Hola Ana, tu código es {{codigo}}');
    });

    it('maneja variables con valores numéricos', () => {
      const template = 'Quedan {{dias}} días de prueba';
      const result = fillPromptVariables(template, { dias: 7 });
      expect(result).toBe('Quedan 7 días de prueba');
    });

    it('maneja múltiples ocurrencias de la misma variable', () => {
      const template = '{{nombre}} dijo: "Hola, soy {{nombre}}"';
      const result = fillPromptVariables(template, { nombre: 'Pedro' });
      expect(result).toBe('Pedro dijo: "Hola, soy Pedro"');
    });

    it('no modifica texto sin variables', () => {
      const template = 'Este es un texto sin variables';
      const result = fillPromptVariables(template, {});
      expect(result).toBe(template);
    });
  });

  describe('getOrigenDatoFrase', () => {
    it('retorna frase correcta para registro web', () => {
      const frase = getOrigenDatoFrase('web_form');
      expect(frase).toContain('registraste en la página');
    });

    it('retorna frase correcta para listado público', () => {
      const frase = getOrigenDatoFrase('business_public_listing');
      expect(frase).toContain('negocio publica');
    });

    it('retorna frase correcta para cuenta de cliente', () => {
      const frase = getOrigenDatoFrase('customer_account');
      expect(frase).toContain('registraste al crear tu cuenta');
    });

    it('retorna frase correcta para RUES', () => {
      const frase = getOrigenDatoFrase('rues');
      expect(frase).toContain('Cámara de Comercio');
    });

    it('retorna frase genérica para fuente desconocida', () => {
      const frase = getOrigenDatoFrase(null);
      expect(frase).toContain('negocio publica');
    });

    it('retorna frase genérica para fuente no soportada', () => {
      const frase = getOrigenDatoFrase('unknown_source');
      expect(frase).toContain('negocio publica');
    });
  });

  describe('validatePromptVariables', () => {
    it('no lanza error cuando todas las variables están presentes', () => {
      const variables = {
        negocio: 'Mi Tienda',
        whatsapp_goadmin: '311 319 5711',
      };
      expect(() =>
        validatePromptVariables(variables, ['negocio', 'whatsapp_goadmin'])
      ).not.toThrow();
    });

    it('lanza error cuando falta una variable requerida', () => {
      const variables = { negocio: 'Mi Tienda' };
      expect(() =>
        validatePromptVariables(variables, ['negocio', 'whatsapp_goadmin'])
      ).toThrow('Faltan variables requeridas');
    });

    it('lanza error cuando una variable es null', () => {
      const variables = { negocio: 'Mi Tienda', whatsapp_goadmin: null };
      expect(() =>
        validatePromptVariables(variables, ['negocio', 'whatsapp_goadmin'])
      ).toThrow('Faltan variables requeridas');
    });

    it('lanza error cuando una variable es undefined', () => {
      const variables = { negocio: 'Mi Tienda', whatsapp_goadmin: undefined };
      expect(() =>
        validatePromptVariables(variables, ['negocio', 'whatsapp_goadmin'])
      ).toThrow('Faltan variables requeridas');
    });

    it('incluye nombres de variables faltantes en el error', () => {
      const variables = { negocio: 'Mi Tienda' };
      expect(() =>
        validatePromptVariables(variables, ['negocio', 'ciudad', 'sector'])
      ).toThrow(/ciudad.*sector/);
    });
  });

  describe('Prompts de prospección', () => {
    describe('Variante A: leads nuevos', () => {
      it('contiene el bloque común', () => {
        expect(PROMPT_PROSPECCION_LEADS_NUEVOS).toContain(
          'Eres Pedro, el asistente virtual con inteligencia artificial'
        );
      });

      it('contiene las reglas que nunca rompe', () => {
        expect(PROMPT_PROSPECCION_LEADS_NUEVOS).toContain(
          'REGLAS QUE NUNCA ROMPES'
        );
      });

      it('contiene la sección de calificación', () => {
        expect(PROMPT_PROSPECCION_LEADS_NUEVOS).toContain('CALIFICACIÓN');
        expect(PROMPT_PROSPECCION_LEADS_NUEVOS).toContain(
          '¿Hoy cómo llevas las ventas y el inventario'
        );
      });

      it('contiene las objeciones comunes', () => {
        expect(PROMPT_PROSPECCION_LEADS_NUEVOS).toContain('OBJECIONES');
        expect(PROMPT_PROSPECCION_LEADS_NUEVOS).toContain('No tengo tiempo');
        expect(PROMPT_PROSPECCION_LEADS_NUEVOS).toContain(
          'Ya tengo un sistema'
        );
      });

      it('usa tuteo consistentemente', () => {
        expect(PROMPT_PROSPECCION_LEADS_NUEVOS).not.toMatch(
          /\b(usted|ustedes)\b/i
        );
        expect(PROMPT_PROSPECCION_LEADS_NUEVOS).toMatch(/\b(tuteas|dices)\b/);
      });

      it('no contiene signos de exclamación iniciales', () => {
        expect(PROMPT_PROSPECCION_LEADS_NUEVOS).not.toContain('¡');
      });

      it('usa formato correcto para precios', () => {
        expect(PROMPT_PROSPECCION_LEADS_NUEVOS).toContain('US$ 30');
        expect(PROMPT_PROSPECCION_LEADS_NUEVOS).toContain('US$ 300');
      });

      it('menciona las herramientas permitidas', () => {
        expect(PROMPT_PROSPECCION_LEADS_NUEVOS).toContain('check_availability');
        expect(PROMPT_PROSPECCION_LEADS_NUEVOS).toContain('book_meeting');
        expect(PROMPT_PROSPECCION_LEADS_NUEVOS).toContain('mark_do_not_call');
      });
    });

    describe('Variante B: clientes existentes', () => {
      it('contiene el bloque común', () => {
        expect(PROMPT_PROSPECCION_CLIENTES_EXISTENTES).toContain(
          'Eres Pedro, el asistente virtual con inteligencia artificial'
        );
      });

      it('contiene los tres motivos de llamada', () => {
        expect(PROMPT_PROSPECCION_CLIENTES_EXISTENTES).toContain(
          'motivo = seguimiento_propuesta'
        );
        expect(PROMPT_PROSPECCION_CLIENTES_EXISTENTES).toContain(
          'motivo = renovacion'
        );
        expect(PROMPT_PROSPECCION_CLIENTES_EXISTENTES).toContain(
          'motivo = activacion'
        );
      });

      it('contiene reglas extra para clientes', () => {
        expect(PROMPT_PROSPECCION_CLIENTES_EXISTENTES).toContain(
          'REGLAS EXTRA PARA CLIENTES'
        );
        expect(PROMPT_PROSPECCION_CLIENTES_EXISTENTES).toContain(
          'No hablas de facturas ni de cobros pendientes'
        );
      });

      it('diferencia el scope de baja para clientes', () => {
        expect(PROMPT_PROSPECCION_CLIENTES_EXISTENTES).toContain(
          'scope="marketing_voice"'
        );
      });

      it('usa tuteo consistentemente', () => {
        expect(PROMPT_PROSPECCION_CLIENTES_EXISTENTES).not.toMatch(
          /\b(usted|ustedes)\b/i
        );
      });
    });

    describe('First messages', () => {
      it('first message de leads contiene aviso de IA y grabación', () => {
        expect(FIRST_MESSAGE_PROSPECCION_LEADS_NUEVOS).toContain(
          'asistente virtual con inteligencia artificial'
        );
        expect(FIRST_MESSAGE_PROSPECCION_LEADS_NUEVOS).toContain('se graba');
      });

      it('first message de clientes contiene aviso de IA y grabación', () => {
        expect(FIRST_MESSAGE_PROSPECCION_CLIENTES_EXISTENTES).toContain(
          'asistente virtual con inteligencia artificial'
        );
        expect(FIRST_MESSAGE_PROSPECCION_CLIENTES_EXISTENTES).toContain(
          'se graba'
        );
      });
    });
  });

  describe('Prompt de encuesta de satisfacción (Pedro actual)', () => {
    it('se conserva sin modificaciones', () => {
      expect(PROMPT_ENCUESTA_SATISFACCION).toContain(
        'Esta es una prueba con un cliente actual de GO Admin'
      );
    });

    it('contiene el objetivo de la encuesta', () => {
      expect(PROMPT_ENCUESTA_SATISFACCION).toContain(
        'conocer su experiencia con GO Admin'
      );
    });

    it('contiene las preguntas de la encuesta', () => {
      expect(PROMPT_ENCUESTA_SATISFACCION).toContain(
        '¿Cómo les ha ido usando GO Admin'
      );
      expect(PROMPT_ENCUESTA_SATISFACCION).toContain(
        '¿Hay algo que te gustaría que mejoráramos?'
      );
    });
  });

  describe('Respuestas legales', () => {
    it('respuesta a "¿eres un robot?" es honesta', () => {
      expect(RESPUESTA_ERES_ROBOT).toContain(
        'Sí, soy un asistente virtual con inteligencia artificial'
      );
    });

    it('respuesta ofrece alternativa humana', () => {
      expect(RESPUESTA_ERES_ROBOT).toContain('te llama alguien del equipo');
    });
  });

  describe('Reglas de estilo en todos los prompts', () => {
    const prompts = [
      { name: 'Leads nuevos', text: PROMPT_PROSPECCION_LEADS_NUEVOS },
      {
        name: 'Clientes existentes',
        text: PROMPT_PROSPECCION_CLIENTES_EXISTENTES,
      },
      { name: 'Encuesta', text: PROMPT_ENCUESTA_SATISFACCION },
    ];

    prompts.forEach(({ name, text }) => {
      it(`${name}: usa "GO Admin" sin guion`, () => {
        expect(text).toContain('GO Admin');
        expect(text).not.toContain('Go-Admin');
        expect(text).not.toContain('GoAdmin');
      });

      it(`${name}: no usa "usted" (tuteo)`, () => {
        // Excepción: el prompt de encuesta permite "usted" solo en un contexto específico
        if (name !== 'Encuesta') {
          expect(text).not.toMatch(/\busted\b/i);
        }
      });

      it(`${name}: no contiene signos de exclamación iniciales`, () => {
        expect(text).not.toContain('¡');
      });
    });
  });
});
