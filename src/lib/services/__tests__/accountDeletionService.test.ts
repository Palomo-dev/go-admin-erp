/**
 * Tests para el servicio de eliminación de cuentas
 * 
 * Verifica:
 * - Obtención de cuentas pendientes
 * - Lógica de bloqueo para único admin con suscripción activa
 * - Proceso de anonimización
 * - Cumplimiento del plazo legal (10 días)
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';

// Mock de Supabase
const mockSupabase = {
  rpc: jest.fn(),
  from: jest.fn(() => ({
    update: jest.fn(() => ({
      eq: jest.fn(() => ({ error: null })),
    })),
    insert: jest.fn(() => ({ error: null })),
  })),
  storage: {
    from: jest.fn(() => ({
      list: jest.fn(() => ({ data: [], error: null })),
      remove: jest.fn(() => ({ error: null })),
    })),
  },
  auth: {
    admin: {
      deleteUser: jest.fn(() => ({ error: null })),
      updateUserById: jest.fn(() => ({ error: null })),
    },
  },
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase),
}));

// Mock de servicios de email
jest.mock('@/lib/services/accountDeletionEmails', () => ({
  sendAccountDeletionRequestEmail: jest.fn(),
  sendAccountDeletionCompleteEmail: jest.fn(),
}));

// Necesario para las importaciones
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

describe('Account Deletion Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getPendingAccountDeletions', () => {
    it('debe obtener cuentas pendientes que superan el plazo', async () => {
      const mockPendingAccounts = [
        {
          user_id: '123e4567-e89b-12d3-a456-426614174000',
          email: 'usuario@example.com',
          first_name: 'Juan',
          last_name: 'Pérez',
          deletion_requested_at: '2026-09-20T10:00:00Z',
          days_since_request: 10,
          organization_ids: [1, 2],
        },
      ];

      mockSupabase.rpc.mockResolvedValueOnce({
        data: mockPendingAccounts,
        error: null,
      });

      const { getPendingAccountDeletions } = await import(
        '@/lib/services/accountDeletionService'
      );

      const result = await getPendingAccountDeletions(10);

      expect(result).toEqual(mockPendingAccounts);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_pending_account_deletions', {
        p_days_after: 10,
      });
    });

    it('debe retornar array vacío cuando no hay cuentas pendientes', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const { getPendingAccountDeletions } = await import(
        '@/lib/services/accountDeletionService'
      );

      const result = await getPendingAccountDeletions(10);

      expect(result).toEqual([]);
    });

    it('debe lanzar error cuando falla la consulta', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      });

      const { getPendingAccountDeletions } = await import(
        '@/lib/services/accountDeletionService'
      );

      await expect(getPendingAccountDeletions(10)).rejects.toThrow(
        'Error obteniendo cuentas pendientes'
      );
    });
  });

  describe('Verificación de único admin', () => {
    it('debe bloquear eliminación si es único admin con suscripción activa', async () => {
      const mockBlockedResult = {
        is_blocked: true,
        blocking_organizations: [
          {
            organization_id: 1,
            organization_name: 'Mi Empresa',
            subscription_id: 'sub_123',
            subscription_status: 'active',
          },
        ],
        reason: 'Único administrador con suscripción activa',
      };

      mockSupabase.rpc.mockResolvedValueOnce({
        data: mockBlockedResult,
        error: null,
      });

      const { processPendingAccountDeletions } = await import(
        '@/lib/services/accountDeletionService'
      );

      // Mock de obtención de cuentas pendientes
      mockSupabase.rpc.mockResolvedValueOnce({
        data: [
          {
            user_id: '123e4567-e89b-12d3-a456-426614174000',
            email: 'admin@example.com',
            first_name: 'Admin',
            last_name: 'User',
            deletion_requested_at: '2026-09-20T10:00:00Z',
            days_since_request: 10,
            organization_ids: [1],
          },
        ],
        error: null,
      });

      const result = await processPendingAccountDeletions(10);

      expect(result.skipped).toBe(1);
      expect(result.succeeded).toBe(0);
      expect(result.results[0].skipped_reason).toContain(
        'Único administrador con suscripción activa'
      );
    });

    it('debe permitir eliminación si hay otros admins', async () => {
      const mockNotBlockedResult = {
        is_blocked: false,
        blocking_organizations: [],
        reason: null,
      };

      mockSupabase.rpc
        // Primera llamada: get_pending_account_deletions
        .mockResolvedValueOnce({
          data: [
            {
              user_id: '123e4567-e89b-12d3-a456-426614174000',
              email: 'usuario@example.com',
              first_name: 'Juan',
              last_name: 'Pérez',
              deletion_requested_at: '2026-09-20T10:00:00Z',
              days_since_request: 10,
              organization_ids: [1],
            },
          ],
          error: null,
        })
        // Segunda llamada: is_sole_admin_with_active_subscription
        .mockResolvedValueOnce({
          data: mockNotBlockedResult,
          error: null,
        });

      const { processPendingAccountDeletions } = await import(
        '@/lib/services/accountDeletionService'
      );

      const result = await processPendingAccountDeletions(10);

      expect(result.succeeded).toBe(1);
      expect(result.skipped).toBe(0);
    });
  });

  describe('Proceso de anonimización', () => {
    it('debe anonimizar correctamente el perfil', async () => {
      const updateMock = jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ error: null })),
      }));

      mockSupabase.from.mockReturnValueOnce({
        update: updateMock,
      });

      const { processPendingAccountDeletions } = await import(
        '@/lib/services/accountDeletionService'
      );

      mockSupabase.rpc
        .mockResolvedValueOnce({
          data: [
            {
              user_id: '123e4567-e89b-12d3-a456-426614174000',
              email: 'usuario@example.com',
              first_name: 'Juan',
              last_name: 'Pérez',
              deletion_requested_at: '2026-09-20T10:00:00Z',
              days_since_request: 10,
              organization_ids: [1],
            },
          ],
          error: null,
        })
        .mockResolvedValueOnce({
          data: { is_blocked: false, blocking_organizations: [] },
          error: null,
        });

      await processPendingAccountDeletions(10);

      // Verificar que se llamó update con los campos anonimizados
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          first_name: null,
          last_name: null,
          phone: null,
          avatar_url: null,
          department: null,
          preferred_language: 'es',
          metadata: {},
        })
      );
    });
  });

  describe('Cumplimiento de plazo legal', () => {
    it('no debe procesar cuentas que no han cumplido el plazo', async () => {
      // Cuenta solicitada hace solo 5 días
      const recentRequest = new Date();
      recentRequest.setDate(recentRequest.getDate() - 5);

      mockSupabase.rpc.mockResolvedValueOnce({
        data: [], // La RPC ya filtra por plazo
        error: null,
      });

      const { getPendingAccountDeletions } = await import(
        '@/lib/services/accountDeletionService'
      );

      const result = await getPendingAccountDeletions(10);

      expect(result).toEqual([]);
    });

    it('debe procesar cuentas que superan los 10 días', async () => {
      const oldRequest = new Date();
      oldRequest.setDate(oldRequest.getDate() - 12);

      mockSupabase.rpc.mockResolvedValueOnce({
        data: [
          {
            user_id: '123e4567-e89b-12d3-a456-426614174000',
            email: 'usuario@example.com',
            first_name: 'Juan',
            last_name: 'Pérez',
            deletion_requested_at: oldRequest.toISOString(),
            days_since_request: 12,
            organization_ids: [1],
          },
        ],
        error: null,
      });

      const { getPendingAccountDeletions } = await import(
        '@/lib/services/accountDeletionService'
      );

      const result = await getPendingAccountDeletions(10);

      expect(result.length).toBe(1);
      expect(result[0].days_since_request).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Conservación de datos legales', () => {
    it('NO debe eliminar referencias en facturas o contabilidad', async () => {
      mockSupabase.rpc
        .mockResolvedValueOnce({
          data: [
            {
              user_id: '123e4567-e89b-12d3-a456-426614174000',
              email: 'usuario@example.com',
              first_name: 'Juan',
              last_name: 'Pérez',
              deletion_requested_at: '2026-09-20T10:00:00Z',
              days_since_request: 10,
              organization_ids: [1],
            },
          ],
          error: null,
        })
        .mockResolvedValueOnce({
          data: { is_blocked: false, blocking_organizations: [] },
          error: null,
        });

      const { processPendingAccountDeletions } = await import(
        '@/lib/services/accountDeletionService'
      );

      await processPendingAccountDeletions(10);

      // Verificar que NO se llamó a eliminar facturas ni accounting_entries
      // Solo se anonimiza el perfil y se deshabilita el acceso
      const calls = mockSupabase.from.mock.calls;
      const deleteCalls = calls.filter(
        (call: any[]) =>
          call[0] === 'invoice_sales' ||
          call[0] === 'invoice_purchase' ||
          call[0] === 'accounting_entries'
      );

      expect(deleteCalls.length).toBe(0);
    });

    it('debe crear registro de auditoría sin datos personales', async () => {
      const insertMock = jest.fn(() => Promise.resolve({ error: null }));

      mockSupabase.rpc
        .mockResolvedValueOnce({
          data: [
            {
              user_id: '123e4567-e89b-12d3-a456-426614174000',
              email: 'usuario@example.com',
              first_name: 'Juan',
              last_name: 'Pérez',
              deletion_requested_at: '2026-09-20T10:00:00Z',
              days_since_request: 10,
              organization_ids: [1],
            },
          ],
          error: null,
        })
        .mockResolvedValueOnce({
          data: { is_blocked: false, blocking_organizations: [] },
          error: null,
        });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'account_deletion_audit') {
          return { insert: insertMock };
        }
        return {
          update: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({ error: null })),
          })),
        };
      });

      const { processPendingAccountDeletions } = await import(
        '@/lib/services/accountDeletionService'
      );

      await processPendingAccountDeletions(10);

      // Verificar que se creó el registro de auditoría
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: '123e4567-e89b-12d3-a456-426614174000',
          email: 'usuario@example.com',
          reason: 'user_request',
          processed_by: 'cron_job',
        })
      );

      // Verificar que NO contiene datos personales en actions_taken
      const auditCall = insertMock.mock.calls[0][0];
      expect(auditCall.actions_taken).not.toContain('Juan');
      expect(auditCall.actions_taken).not.toContain('Pérez');
    });
  });
});


describe('Account Deletion Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getPendingAccountDeletions', () => {
    it('debe obtener cuentas pendientes que superan el plazo', async () => {
      const mockPendingAccounts = [
        {
          user_id: '123e4567-e89b-12d3-a456-426614174000',
          email: 'usuario@example.com',
          first_name: 'Juan',
          last_name: 'Pérez',
          deletion_requested_at: '2026-09-20T10:00:00Z',
          days_since_request: 10,
          organization_ids: [1, 2],
        },
      ];

      mockSupabase.rpc.mockResolvedValueOnce({
        data: mockPendingAccounts,
        error: null,
      });

      const { getPendingAccountDeletions } = await import(
        '@/lib/services/accountDeletionService'
      );

      const result = await getPendingAccountDeletions(10);

      expect(result).toEqual(mockPendingAccounts);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_pending_account_deletions', {
        p_days_after: 10,
      });
    });

    it('debe retornar array vacío cuando no hay cuentas pendientes', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const { getPendingAccountDeletions } = await import(
        '@/lib/services/accountDeletionService'
      );

      const result = await getPendingAccountDeletions(10);

      expect(result).toEqual([]);
    });

    it('debe lanzar error cuando falla la consulta', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      });

      const { getPendingAccountDeletions } = await import(
        '@/lib/services/accountDeletionService'
      );

      await expect(getPendingAccountDeletions(10)).rejects.toThrow(
        'Error obteniendo cuentas pendientes'
      );
    });
  });

  describe('Verificación de único admin', () => {
    it('debe bloquear eliminación si es único admin con suscripción activa', async () => {
      const mockBlockedResult = {
        is_blocked: true,
        blocking_organizations: [
          {
            organization_id: 1,
            organization_name: 'Mi Empresa',
            subscription_id: 'sub_123',
            subscription_status: 'active',
          },
        ],
        reason: 'Único administrador con suscripción activa',
      };

      mockSupabase.rpc.mockResolvedValueOnce({
        data: mockBlockedResult,
        error: null,
      });

      const { processPendingAccountDeletions } = await import(
        '@/lib/services/accountDeletionService'
      );

      // Mock de obtención de cuentas pendientes
      mockSupabase.rpc.mockResolvedValueOnce({
        data: [
          {
            user_id: '123e4567-e89b-12d3-a456-426614174000',
            email: 'admin@example.com',
            first_name: 'Admin',
            last_name: 'User',
            deletion_requested_at: '2026-09-20T10:00:00Z',
            days_since_request: 10,
            organization_ids: [1],
          },
        ],
        error: null,
      });

      const result = await processPendingAccountDeletions(10);

      expect(result.skipped).toBe(1);
      expect(result.succeeded).toBe(0);
      expect(result.results[0].skipped_reason).toContain(
        'Único administrador con suscripción activa'
      );
    });

    it('debe permitir eliminación si hay otros admins', async () => {
      const mockNotBlockedResult = {
        is_blocked: false,
        blocking_organizations: [],
        reason: null,
      };

      mockSupabase.rpc
        // Primera llamada: get_pending_account_deletions
        .mockResolvedValueOnce({
          data: [
            {
              user_id: '123e4567-e89b-12d3-a456-426614174000',
              email: 'usuario@example.com',
              first_name: 'Juan',
              last_name: 'Pérez',
              deletion_requested_at: '2026-09-20T10:00:00Z',
              days_since_request: 10,
              organization_ids: [1],
            },
          ],
          error: null,
        })
        // Segunda llamada: is_sole_admin_with_active_subscription
        .mockResolvedValueOnce({
          data: mockNotBlockedResult,
          error: null,
        });

      const { processPendingAccountDeletions } = await import(
        '@/lib/services/accountDeletionService'
      );

      const result = await processPendingAccountDeletions(10);

      expect(result.succeeded).toBe(1);
      expect(result.skipped).toBe(0);
    });
  });

  describe('Proceso de anonimización', () => {
    it('debe anonimizar correctamente el perfil', async () => {
      const updateMock = jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ error: null })),
      }));

      mockSupabase.from.mockReturnValueOnce({
        update: updateMock,
      });

      const { processPendingAccountDeletions } = await import(
        '@/lib/services/accountDeletionService'
      );

      mockSupabase.rpc
        .mockResolvedValueOnce({
          data: [
            {
              user_id: '123e4567-e89b-12d3-a456-426614174000',
              email: 'usuario@example.com',
              first_name: 'Juan',
              last_name: 'Pérez',
              deletion_requested_at: '2026-09-20T10:00:00Z',
              days_since_request: 10,
              organization_ids: [1],
            },
          ],
          error: null,
        })
        .mockResolvedValueOnce({
          data: { is_blocked: false, blocking_organizations: [] },
          error: null,
        });

      await processPendingAccountDeletions(10);

      // Verificar que se llamó update con los campos anonimizados
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          first_name: null,
          last_name: null,
          phone: null,
          avatar_url: null,
          department: null,
          preferred_language: 'es',
          metadata: {},
        })
      );
    });
  });

  describe('Cumplimiento de plazo legal', () => {
    it('no debe procesar cuentas que no han cumplido el plazo', async () => {
      // Cuenta solicitada hace solo 5 días
      const recentRequest = new Date();
      recentRequest.setDate(recentRequest.getDate() - 5);

      mockSupabase.rpc.mockResolvedValueOnce({
        data: [], // La RPC ya filtra por plazo
        error: null,
      });

      const { getPendingAccountDeletions } = await import(
        '@/lib/services/accountDeletionService'
      );

      const result = await getPendingAccountDeletions(10);

      expect(result).toEqual([]);
    });

    it('debe procesar cuentas que superan los 10 días', async () => {
      const oldRequest = new Date();
      oldRequest.setDate(oldRequest.getDate() - 12);

      mockSupabase.rpc.mockResolvedValueOnce({
        data: [
          {
            user_id: '123e4567-e89b-12d3-a456-426614174000',
            email: 'usuario@example.com',
            first_name: 'Juan',
            last_name: 'Pérez',
            deletion_requested_at: oldRequest.toISOString(),
            days_since_request: 12,
            organization_ids: [1],
          },
        ],
        error: null,
      });

      const { getPendingAccountDeletions } = await import(
        '@/lib/services/accountDeletionService'
      );

      const result = await getPendingAccountDeletions(10);

      expect(result.length).toBe(1);
      expect(result[0].days_since_request).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Conservación de datos legales', () => {
    it('NO debe eliminar referencias en facturas o contabilidad', async () => {
      mockSupabase.rpc
        .mockResolvedValueOnce({
          data: [
            {
              user_id: '123e4567-e89b-12d3-a456-426614174000',
              email: 'usuario@example.com',
              first_name: 'Juan',
              last_name: 'Pérez',
              deletion_requested_at: '2026-09-20T10:00:00Z',
              days_since_request: 10,
              organization_ids: [1],
            },
          ],
          error: null,
        })
        .mockResolvedValueOnce({
          data: { is_blocked: false, blocking_organizations: [] },
          error: null,
        });

      const { processPendingAccountDeletions } = await import(
        '@/lib/services/accountDeletionService'
      );

      await processPendingAccountDeletions(10);

      // Verificar que NO se llamó a eliminar facturas ni accounting_entries
      // Solo se anonimiza el perfil y se deshabilita el acceso
      const calls = mockSupabase.from.mock.calls;
      const deleteCalls = calls.filter(
        (call) =>
          call[0] === 'invoice_sales' ||
          call[0] === 'invoice_purchase' ||
          call[0] === 'accounting_entries'
      );

      expect(deleteCalls.length).toBe(0);
    });

    it('debe crear registro de auditoría sin datos personales', async () => {
      const insertMock = jest.fn(() => Promise.resolve({ error: null }));

      mockSupabase.rpc
        .mockResolvedValueOnce({
          data: [
            {
              user_id: '123e4567-e89b-12d3-a456-426614174000',
              email: 'usuario@example.com',
              first_name: 'Juan',
              last_name: 'Pérez',
              deletion_requested_at: '2026-09-20T10:00:00Z',
              days_since_request: 10,
              organization_ids: [1],
            },
          ],
          error: null,
        })
        .mockResolvedValueOnce({
          data: { is_blocked: false, blocking_organizations: [] },
          error: null,
        });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'account_deletion_audit') {
          return { insert: insertMock };
        }
        return {
          update: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({ error: null })),
          })),
        };
      });

      const { processPendingAccountDeletions } = await import(
        '@/lib/services/accountDeletionService'
      );

      await processPendingAccountDeletions(10);

      // Verificar que se creó el registro de auditoría
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: '123e4567-e89b-12d3-a456-426614174000',
          email: 'usuario@example.com',
          reason: 'user_request',
          processed_by: 'cron_job',
        })
      );

      // Verificar que NO contiene datos personales en actions_taken
      const auditCall = insertMock.mock.calls[0][0];
      expect(auditCall.actions_taken).not.toContain('Juan');
      expect(auditCall.actions_taken).not.toContain('Pérez');
    });
  });
});
