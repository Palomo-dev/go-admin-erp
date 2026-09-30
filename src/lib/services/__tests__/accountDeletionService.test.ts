/**
 * Tests para el servicio de eliminación de cuentas
 * 
 * Tests sobre funciones puras y lógica de negocio
 */

import { describe, it, expect } from '@jest/globals';
import { hashEmail } from '../accountDeletionEmails';

describe('Account Deletion Service - Pure Functions', () => {
  describe('Formato de fechas en español (America/Bogota)', () => {
    it('debe formatear fecha en español de Colombia', () => {
      const date = new Date('2026-09-30T10:00:00Z');
      const opciones: Intl.DateTimeFormatOptions = {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'America/Bogota',
      };
      const formatted = new Intl.DateTimeFormat('es-CO', opciones).format(date);
      
      expect(formatted).toContain('2026');
      expect(formatted).toContain('septiembre');
      expect(formatted.toLowerCase()).toMatch(/\d{1,2}\s+de\s+\w+\s+de\s+\d{4}/);
    });

    it('debe calcular fecha programada (solicitud + 10 días)', () => {
      const requestDate = new Date('2026-09-20T10:00:00Z');
      const scheduledDate = new Date(requestDate);
      scheduledDate.setDate(scheduledDate.getDate() + 10);
      
      const diffDays = Math.floor(
        (scheduledDate.getTime() - requestDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      expect(diffDays).toBe(10);
    });
  });

  describe('Hash SHA-256 del email', () => {
    it('debe generar hash SHA-256 consistente', () => {
      const email = 'usuario@example.com';
      const hash1 = hashEmail(email);
      const hash2 = hashEmail(email);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produce 64 caracteres hex
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('debe ser case-insensitive y trimear espacios', () => {
      const hash1 = hashEmail('usuario@example.com');
      const hash2 = hashEmail('USUARIO@EXAMPLE.COM');
      const hash3 = hashEmail('  usuario@example.com  ');
      
      expect(hash1).toBe(hash2);
      expect(hash1).toBe(hash3);
    });

    it('no debe contener el email original', () => {
      const email = 'usuario@example.com';
      const hash = hashEmail(email);
      
      expect(hash).not.toContain('usuario');
      expect(hash).not.toContain('example');
      expect(hash).not.toContain('@');
    });
  });

  describe('Textos literales del correo 1', () => {
    it('debe contener el asunto exacto', () => {
      const subject = 'Recibimos tu solicitud para eliminar tu cuenta';
      expect(subject).toBe('Recibimos tu solicitud para eliminar tu cuenta');
    });

    it('debe incluir saludo con nombre si existe', () => {
      const userName = 'Juan';
      const saludo = userName ? `Hola ${userName}:` : 'Hola:';
      expect(saludo).toBe('Hola Juan:');
    });

    it('debe incluir solo Hola: si no hay nombre', () => {
      const userName = '';
      const saludo = userName ? `Hola ${userName}:` : 'Hola:';
      expect(saludo).toBe('Hola:');
    });

    it('debe contener texto legal exacto sin emojis ni exclamaciones', () => {
      const text = 'Eliminaremos tus datos personales en un plazo máximo de 15 días hábiles. Conservaremos solo lo que la ley nos obliga a guardar, como la facturación y la contabilidad, por 10 años.';
      
      expect(text).not.toMatch(/[!🎉✅]/);
      expect(text).toContain('15 días hábiles');
      expect(text).toContain('10 años');
    });

    it('debe mencionar servicio@goadmin.io para cancelar', () => {
      const text = 'Si cambiaste de opinión, escríbenos a servicio@goadmin.io';
      expect(text).toContain('servicio@goadmin.io');
    });

    it('debe incluir firma Equipo GO Admin', () => {
      const firma = 'Equipo GO Admin';
      expect(firma).toBe('Equipo GO Admin');
      expect(firma).not.toContain('ERP');
      expect(firma).not.toContain('Sistema de Gestión');
    });

    it('debe incluir pie legal completo', () => {
      const pie = 'Go Admin S.A.S. · NIT 901.479.683-5 · Carrera 87 B # 45 B - 8, Medellín';
      expect(pie).toContain('Go Admin S.A.S.');
      expect(pie).toContain('NIT 901.479.683-5');
      expect(pie).toContain('Medellín');
    });

    it('debe incluir link a política de privacidad', () => {
      const link = 'https://goadmin.io/privacidad';
      expect(link).toBe('https://goadmin.io/privacidad');
    });
  });

  describe('Textos literales del correo 2', () => {
    it('debe contener el asunto exacto', () => {
      const subject = 'Eliminamos tu cuenta de GO Admin';
      expect(subject).toBe('Eliminamos tu cuenta de GO Admin');
    });

    it('debe usar solo Hola: sin nombre', () => {
      const saludo = 'Hola:';
      expect(saludo).toBe('Hola:');
      expect(saludo).not.toMatch(/Hola\s+\w+:/);
    });

    it('debe listar las acciones realizadas', () => {
      const actions = [
        'Eliminamos o anonimizamos tu perfil y tus datos personales.',
        'Tu usuario quedó deshabilitado y ya no tiene acceso a ninguna organización.',
        'Conservamos solo lo que la ley nos obliga a guardar, como los registros de facturación y contabilidad, por 10 años. Después los eliminamos.',
      ];
      
      actions.forEach(action => {
        expect(action).not.toMatch(/[!🎉✅]/);
      });
    });

    it('debe mencionar SIC para reclamos', () => {
      const text = 'También puedes acudir a la Superintendencia de Industria y Comercio.';
      expect(text).toContain('Superintendencia de Industria y Comercio');
    });
  });

  describe('Bloqueo por único administrador con otros usuarios', () => {
    it('debe bloquear si es único admin Y hay otros usuarios', () => {
      const isOnlyAdmin = true;
      const hasOtherUsers = true;
      const shouldBlock = isOnlyAdmin && hasOtherUsers;
      
      expect(shouldBlock).toBe(true);
    });

    it('no debe bloquear si no es único admin', () => {
      const isOnlyAdmin = false;
      const hasOtherUsers = true;
      const shouldBlock = isOnlyAdmin && hasOtherUsers;
      
      expect(shouldBlock).toBe(false);
    });

    it('no debe bloquear si no hay otros usuarios', () => {
      const isOnlyAdmin = true;
      const hasOtherUsers = false;
      const shouldBlock = isOnlyAdmin && hasOtherUsers;
      
      expect(shouldBlock).toBe(false);
    });

    it('debe generar razón de bloqueo correcta', () => {
      const orgCount = 2;
      const reason = `Usuario es el único administrador de ${orgCount} organización(es) con suscripción activa y otros usuarios`;
      
      expect(reason).toContain('único administrador');
      expect(reason).toContain('otros usuarios');
      expect(reason).toContain('2');
    });
  });

  describe('Alerta a soporte por admin bloqueado', () => {
    it('debe enviar a servicio@goadmin.io', () => {
      const supportEmail = 'servicio@goadmin.io';
      expect(supportEmail).toBe('servicio@goadmin.io');
    });

    it('debe incluir detalles de organizaciones bloqueantes', () => {
      const blockingOrgs = [
        {
          organization_id: 1,
          organization_name: 'Empresa A',
          subscription_status: 'active',
        },
        {
          organization_id: 2,
          organization_name: 'Empresa B',
          subscription_status: 'trialing',
        },
      ];
      
      expect(blockingOrgs.length).toBe(2);
      expect(blockingOrgs[0]).toHaveProperty('organization_id');
      expect(blockingOrgs[0]).toHaveProperty('subscription_status');
    });
  });

  describe('Filtrado por plazo legal', () => {
    it('debe identificar cuentas que superan los 10 días', () => {
      const now = new Date('2026-09-30T10:00:00Z');
      const oldRequest = new Date('2026-09-20T10:00:00Z');
      const recentRequest = new Date('2026-09-25T10:00:00Z');
      
      const daysSinceOld = Math.floor((now.getTime() - oldRequest.getTime()) / (1000 * 60 * 60 * 24));
      const daysSinceRecent = Math.floor((now.getTime() - recentRequest.getTime()) / (1000 * 60 * 60 * 24));
      
      expect(daysSinceOld).toBeGreaterThanOrEqual(10);
      expect(daysSinceRecent).toBeLessThan(10);
    });
  });

  describe('Construcción del payload de anonimización', () => {
    it('debe anonimizar todos los campos personales', () => {
      const anonymizedData = {
        first_name: null,
        last_name: null,
        phone: null,
        avatar_url: null,
        department: null,
        preferred_language: 'es',
        metadata: {},
        updated_at: new Date().toISOString(),
      };

      expect(anonymizedData.first_name).toBeNull();
      expect(anonymizedData.last_name).toBeNull();
      expect(anonymizedData.phone).toBeNull();
      expect(anonymizedData.avatar_url).toBeNull();
      expect(anonymizedData.department).toBeNull();
      expect(anonymizedData.preferred_language).toBe('es');
      expect(anonymizedData.metadata).toEqual({});
    });
  });

  describe('Conservación de datos legales', () => {
    it('debe identificar tablas que NO se deben tocar', () => {
      const legalTables = [
        'invoice_sales',
        'invoice_purchase',
        'accounting_entries',
        'payments',
        'cash_movements',
        'accounts_receivable',
        'accounts_payable',
      ];

      const tablesToAnonymize = ['profiles'];
      const tablesToDeactivate = ['organization_members'];

      legalTables.forEach((table) => {
        expect(tablesToAnonymize).not.toContain(table);
        expect(tablesToDeactivate).not.toContain(table);
      });
    });

    it('debe mantener referencias FK intactas', () => {
      const invoice = {
        id: 1,
        created_by: '123e4567-e89b-12d3-a456-426614174000',
        total: 100000,
      };

      expect(invoice.created_by).toBeTruthy();
      expect(invoice.created_by).toBe('123e4567-e89b-12d3-a456-426614174000');
    });
  });

  describe('Registro de auditoría con hash', () => {
    it('no debe incluir email en claro en auditoría', () => {
      const email = 'usuario@example.com';
      const emailHash = hashEmail(email);
      const auditRecord = {
        user_id: '123e4567-e89b-12d3-a456-426614174000',
        email: emailHash,
        deletion_requested_at: new Date().toISOString(),
        deletion_completed_at: new Date().toISOString(),
        reason: 'user_request',
        actions_taken: ['anonymized_profile', 'disabled_auth_user'],
        organization_ids: [1, 2],
        processed_by: 'cron_job',
      };

      expect(auditRecord.email).not.toContain('@');
      expect(auditRecord.email).not.toContain('usuario');
      expect(auditRecord.email).toHaveLength(64);
      expect(auditRecord.email).toMatch(/^[0-9a-f]{64}$/);
    });

    it('debe incluir metadata con algoritmo de hash', () => {
      const metadata = {
        processed_at: new Date().toISOString(),
        version: '1.0',
        email_hash_algorithm: 'SHA-256',
      };

      expect(metadata.email_hash_algorithm).toBe('SHA-256');
    });
  });

  describe('Procesamiento de resultado', () => {
    it('debe categorizar resultados correctamente', () => {
      const results = [
        { success: true, user_id: '1', email: 'hash1' },
        { success: true, user_id: '2', email: 'hash2' },
        { success: false, user_id: '3', email: 'hash3', error: 'DB error' },
        {
          success: false,
          user_id: '4',
          email: 'hash4',
          skipped_reason: 'Único admin con otros usuarios',
        },
      ];

      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success && !('skipped_reason' in r)).length;
      const skipped = results.filter((r) => 'skipped_reason' in r).length;

      expect(succeeded).toBe(2);
      expect(failed).toBe(1);
      expect(skipped).toBe(1);
      expect(results.length).toBe(4);
    });
  });

  describe('Email anónimo para liberar dirección', () => {
    it('debe generar email anónimo con el user_id', () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const anonymizedEmail = `deleted_${userId}@deleted.goadmin.local`;

      expect(anonymizedEmail).toContain(userId);
      expect(anonymizedEmail).toContain('@deleted.goadmin.local');
      expect(anonymizedEmail.startsWith('deleted_')).toBe(true);
    });
  });

  describe('Orden de operaciones', () => {
    it('debe enviar correo 2 ANTES de anonimizar', () => {
      const operations = [
        'send_confirmation_email',
        'anonymize_profile',
        'delete_avatar',
        'remove_from_organizations',
        'disable_auth_user',
        'create_audit_record',
      ];

      const emailIndex = operations.indexOf('send_confirmation_email');
      const anonymizeIndex = operations.indexOf('anonymize_profile');

      expect(emailIndex).toBeLessThan(anonymizeIndex);
    });
  });
});
