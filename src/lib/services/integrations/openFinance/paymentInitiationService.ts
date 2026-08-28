/**
 * Servicio de pagos a proveedores via Open Finance.
 * Orquesta validacion de cuentas, transferencias y registro de pagos.
 * Utiliza openFinanceService para interactuar con Prometeo.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { openFinanceService } from './openFinanceService';
import type { AccountValidationResponse } from './openFinanceTypes';

// --------------------------------------------------------
// Tipos publicos
// --------------------------------------------------------

/** Resultado de un pago a proveedor */
export interface PaymentResult {
  success: boolean;
  transferId?: string;
  amount: number;
  supplierName: string;
  accountPayableId: number;
  error?: string;
}

/** Resultado de validacion de cuenta de proveedor */
export interface ValidationResult {
  valid: boolean;
  holderName?: string;
  accountNumber?: string;
  bankName?: string;
  warnings: string[];
}

/** Entrada del historial de pagos */
export interface PaymentHistoryEntry {
  id: string;
  date: string;
  amount: number;
  reference: string;
  status: string;
  transferId?: string;
}

// --------------------------------------------------------
// Tipos internos para filas de BD
// --------------------------------------------------------

/** Fila minima de accounts_payable */
interface AccountPayableRow {
  id: string;
  organization_id: number;
  supplier_id: number;
  invoice_id: string | null;
  amount: number;
  balance: number;
  due_date: string | null;
  status: string;
}

/** Fila minima de suppliers */
interface SupplierRow {
  id: number;
  name: string;
  nit: string | null;
  bank_name: string | null;
  bank_account: string | null;
  account_type: string | null;
  doc_type: string | null;
  tax_id: string | null;
}

/** Fila minima de bank_accounts */
interface BankAccountRow {
  id: number;
  organization_id: number;
  name: string;
  account_number: string | null;
  bank_name: string | null;
  account_type: string | null;
  balance: number;
  is_active: boolean;
}

/** Fila minima de open_finance_links */
interface OpenFinanceLinkRow {
  id: string;
  organization_id: number;
  provider: string;
  institution_code: string;
  session_key: string | null;
  status: string;
}

/** Fila minima de open_finance_accounts */
interface OpenFinanceAccountRow {
  id: string;
  link_id: string;
  bank_account_id: number | null;
  external_account_id: string;
  account_number: string | null;
}

/** Fila minima de payments */
interface PaymentRow {
  id: string;
  payment_date: string | null;
  amount: number;
  reference: string | null;
  status: string;
  processor_response: Record<string, unknown> | null;
}

// --------------------------------------------------------
// Utilidades internas
// --------------------------------------------------------

/** Mapea el nombre del banco del proveedor a un codigo de institution */
function mapBankNameToCode(bankName: string | null): string {
  if (!bankName) return '';
  const name = bankName.toLowerCase();
  if (name.includes('bancolombia')) return 'bancolombia';
  if (name.includes('davivienda')) return 'davivienda';
  if (name.includes('bbva')) return 'bbva';
  if (name.includes('bogota')) return 'banco_de_bogota';
  if (name.includes('colpatria') || name.includes('scotiabank')) return 'scotiabank_colpatria';
  if (name.includes('av villas') || name.includes('av_villas')) return 'banco_av_villas';
  return '';
}

/** Mapea el tipo de cuenta del proveedor al formato esperado por Prometeo */
function mapAccountType(accountType: string | null): string {
  if (!accountType) return 'checking';
  const type = accountType.toLowerCase();
  if (type.includes('ahorro') || type.includes('savings')) return 'savings';
  if (type.includes('corriente') || type.includes('checking')) return 'checking';
  return accountType;
}

/** Mapea el tipo de documento del proveedor al formato de Prometeo */
function mapDocumentType(docType: string | null): string {
  if (!docType) return 'NIT';
  const type = docType.toLowerCase();
  if (type.includes('nit') || type.includes('company')) return 'NIT';
  if (type.includes('cedula') || type.includes('cc') || type.includes('natural')) return 'CC';
  if (type.includes('ce') || type.includes('extranjeria')) return 'CE';
  return docType;
}

// --------------------------------------------------------
// Servicio
// --------------------------------------------------------

export class PaymentInitiationService {
  /**
   * Paga una cuenta por pagar a un proveedor via Open Finance.
   * @param accountPayableId ID de la cuenta por pagar (uuid como string o numero)
   * @param bankAccountId ID de la cuenta bancaria origen
   * @param userId ID del usuario que ejecuta el pago
   */
  static async paySupplier(
    accountPayableId: number,
    bankAccountId: number,
    userId: string,
  ): Promise<PaymentResult> {
    try {
      const supabase = getSupabaseAdmin();

      // 1. Leer la cuenta por pagar
      const { data: apRow, error: apError } = await supabase
        .from('accounts_payable')
        .select('id, organization_id, supplier_id, invoice_id, amount, balance, due_date, status')
        .eq('id', String(accountPayableId))
        .single();

      if (apError || !apRow) {
        return {
          success: false,
          amount: 0,
          supplierName: '',
          accountPayableId,
          error: 'Cuenta por pagar no encontrada',
        };
      }

      const ap = apRow as AccountPayableRow;
      const balance = Number(ap.balance) || 0;

      // 2. Verificar que el balance > 0
      if (balance <= 0) {
        return {
          success: false,
          amount: 0,
          supplierName: '',
          accountPayableId,
          error: 'La cuenta por pagar no tiene saldo pendiente',
        };
      }

      // 3. Leer los datos del proveedor
      const { data: supplierRow, error: supplierError } = await supabase
        .from('suppliers')
        .select('id, name, nit, bank_name, bank_account, account_type, doc_type, tax_id')
        .eq('id', ap.supplier_id)
        .single();

      if (supplierError || !supplierRow) {
        return {
          success: false,
          amount: balance,
          supplierName: '',
          accountPayableId,
          error: 'Proveedor no encontrado',
        };
      }

      const supplier = supplierRow as SupplierRow;

      // Verificar datos bancarios del proveedor
      if (!supplier.bank_account || !supplier.bank_name) {
        return {
          success: false,
          amount: balance,
          supplierName: supplier.name,
          accountPayableId,
          error: 'El proveedor no tiene datos bancarios configurados',
        };
      }

      // 4. Leer la cuenta bancaria origen
      const { data: bankRow, error: bankError } = await supabase
        .from('bank_accounts')
        .select('id, organization_id, name, account_number, bank_name, account_type, balance, is_active')
        .eq('id', bankAccountId)
        .single();

      if (bankError || !bankRow) {
        return {
          success: false,
          amount: balance,
          supplierName: supplier.name,
          accountPayableId,
          error: 'Cuenta bancaria origen no encontrada',
        };
      }

      const bankAccount = bankRow as BankAccountRow;

      if (!bankAccount.is_active) {
        return {
          success: false,
          amount: balance,
          supplierName: supplier.name,
          accountPayableId,
          error: 'La cuenta bancaria origen no esta activa',
        };
      }

      // 5. Buscar el link de Open Finance vinculado a bankAccountId
      const { data: ofAccountRow } = await supabase
        .from('open_finance_accounts')
        .select('id, link_id, bank_account_id, external_account_id, account_number')
        .eq('bank_account_id', bankAccountId)
        .eq('is_active', true)
        .maybeSingle();

      if (!ofAccountRow) {
        return {
          success: false,
          amount: balance,
          supplierName: supplier.name,
          accountPayableId,
          error: 'La cuenta bancaria no tiene un link de Open Finance vinculado',
        };
      }

      const ofAccount = ofAccountRow as OpenFinanceAccountRow;

      // Obtener el link para verificar sesion
      const { data: linkRow } = await supabase
        .from('open_finance_links')
        .select('id, organization_id, provider, institution_code, session_key, status')
        .eq('id', ofAccount.link_id)
        .single();

      if (!linkRow) {
        return {
          success: false,
          amount: balance,
          supplierName: supplier.name,
          accountPayableId,
          error: 'Link de Open Finance no encontrado',
        };
      }

      const link = linkRow as OpenFinanceLinkRow;

      if (link.status !== 'active') {
        return {
          success: false,
          amount: balance,
          supplierName: supplier.name,
          accountPayableId,
          error: 'El link de Open Finance no esta activo',
        };
      }

      // 6. Validar la cuenta del proveedor
      const bankCode = mapBankNameToCode(supplier.bank_name);
      const accountType = mapAccountType(supplier.account_type);
      const documentType = mapDocumentType(supplier.doc_type);
      const documentNumber = supplier.nit || supplier.tax_id || '';

      if (!bankCode) {
        return {
          success: false,
          amount: balance,
          supplierName: supplier.name,
          accountPayableId,
          error: `No se pudo mapear el banco del proveedor: ${supplier.bank_name}`,
        };
      }

      if (!documentNumber) {
        return {
          success: false,
          amount: balance,
          supplierName: supplier.name,
          accountPayableId,
          error: 'El proveedor no tiene NIT o tax_id configurado',
        };
      }

      const validation = await openFinanceService.validateAccount({
        country_code: 'CO',
        account_number: supplier.bank_account,
        bank_code: bankCode,
        account_type: accountType,
        document_number: documentNumber,
        document_type: documentType,
      });

      if (!validation.valid) {
        return {
          success: false,
          amount: balance,
          supplierName: supplier.name,
          accountPayableId,
          error: 'La cuenta del proveedor no paso la validacion',
        };
      }

      // 7. Iniciar la transferencia
      const reference = `PAGO-CXP-${ap.id.substring(0, 8)}`;
      const transferResult = await openFinanceService.initiateTransfer(
        supabase,
        {
          account_number: supplier.bank_account,
          bank_code: bankCode,
          account_type: accountType,
          document_number: documentNumber,
          document_type: documentType,
          amount: balance,
          currency: 'COP',
          description: `Pago a proveedor ${supplier.name} - CxP ${ap.id.substring(0, 8)}`,
          reference,
        },
        userId,
      );

      // 8. Registrar el pago en la tabla payments
      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          organization_id: ap.organization_id,
          source: 'accounts_payable',
          source_id: ap.id,
          method: 'open_finance',
          amount: balance,
          currency: 'COP',
          reference,
          processor_response: {
            transfer_id: transferResult.id,
            transfer_status: transferResult.status,
            provider: link.provider,
            supplier_id: supplier.id,
            supplier_name: supplier.name,
          },
          status: transferResult.status === 'completed' ? 'completed' : 'pending',
          created_by: userId,
          payment_date: new Date().toISOString(),
          discount_amount: 0,
          change_amount: 0,
        });

      if (paymentError) {
        console.error('[PaymentInitiation] Error al registrar pago:', paymentError.message);
      }

      // 9. Actualizar el balance de accounts_payable
      const newBalance = 0; // Se asume pago completo del balance
      const newStatus = newBalance === 0 ? 'paid' : ap.status;

      const { error: updateError } = await supabase
        .from('accounts_payable')
        .update({
          balance: newBalance,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ap.id);

      if (updateError) {
        console.error('[PaymentInitiation] Error al actualizar CxP:', updateError.message);
      }

      // 10. Retornar resultado
      return {
        success: true,
        transferId: transferResult.id,
        amount: balance,
        supplierName: supplier.name,
        accountPayableId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      return {
        success: false,
        amount: 0,
        supplierName: '',
        accountPayableId,
        error: message,
      };
    }
  }

  /**
   * Valida la cuenta bancaria de un proveedor via Open Finance.
   * @param supplierId ID del proveedor
   */
  static async validateSupplierAccount(supplierId: number): Promise<ValidationResult> {
    try {
      const supabase = getSupabaseAdmin();

      // Leer datos bancarios del proveedor
      const { data: supplierRow, error } = await supabase
        .from('suppliers')
        .select('id, name, nit, bank_name, bank_account, account_type, doc_type, tax_id')
        .eq('id', supplierId)
        .single();

      if (error || !supplierRow) {
        return {
          valid: false,
          warnings: ['Proveedor no encontrado'],
        };
      }

      const supplier = supplierRow as SupplierRow;
      const warnings: string[] = [];

      // Verificar que tenga datos bancarios
      if (!supplier.bank_account) {
        warnings.push('El proveedor no tiene numero de cuenta bancaria configurado');
      }
      if (!supplier.bank_name) {
        warnings.push('El proveedor no tiene banco configurado');
      }
      if (!supplier.nit && !supplier.tax_id) {
        warnings.push('El proveedor no tiene NIT o tax_id configurado');
      }

      if (warnings.length > 0) {
        return { valid: false, warnings };
      }

      const bankCode = mapBankNameToCode(supplier.bank_name);
      if (!bankCode) {
        warnings.push(`Banco no reconocido para Open Finance: ${supplier.bank_name}`);
        return { valid: false, warnings };
      }

      const accountType = mapAccountType(supplier.account_type);
      const documentType = mapDocumentType(supplier.doc_type);
      const documentNumber = supplier.nit || supplier.tax_id || '';

      // Llamar a validacion de Prometeo
      const validation: AccountValidationResponse = await openFinanceService.validateAccount({
        country_code: 'CO',
        account_number: supplier.bank_account!,
        bank_code: bankCode,
        account_type: accountType,
        document_number: documentNumber,
        document_type: documentType,
      });

      // Advertencias si los datos no coinciden
      if (validation.holder_name && supplier.name
        && !validation.holder_name.toLowerCase().includes(supplier.name.toLowerCase().substring(0, 10))) {
        warnings.push(`El titular de la cuenta (${validation.holder_name}) no coincide con el nombre del proveedor (${supplier.name})`);
      }

      return {
        valid: validation.valid,
        holderName: validation.holder_name || undefined,
        accountNumber: validation.account_number || undefined,
        bankName: validation.bank_name || supplier.bank_name || undefined,
        warnings,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al validar cuenta';
      return {
        valid: false,
        warnings: [message],
      };
    }
  }

  /**
   * Registra un pago programado para ejecucion posterior (cron job Fase 9).
   * @param accountPayableId ID de la cuenta por pagar
   * @param bankAccountId ID de la cuenta bancaria origen
   * @param scheduledDate Fecha programada (ISO string)
   * @param userId ID del usuario
   */
  static async schedulePayment(
    accountPayableId: number,
    bankAccountId: number,
    scheduledDate: string,
    userId: string,
  ): Promise<{ scheduled: boolean; paymentId: string }> {
    try {
      const supabase = getSupabaseAdmin();

      // Leer la cuenta por pagar para obtener organization_id y balance
      const { data: apRow, error: apError } = await supabase
        .from('accounts_payable')
        .select('id, organization_id, balance')
        .eq('id', String(accountPayableId))
        .single();

      if (apError || !apRow) {
        throw new Error('Cuenta por pagar no encontrada');
      }

      const ap = apRow as { id: string; organization_id: number; balance: number };
      const balance = Number(ap.balance) || 0;

      // Registrar la intencion de pago en payments con status 'pending'
      // El cron job de la Fase 9 ejecutara la transferencia
      const { data: paymentRow, error: paymentError } = await supabase
        .from('payments')
        .insert({
          organization_id: ap.organization_id,
          source: 'accounts_payable',
          source_id: ap.id,
          method: 'open_finance_scheduled',
          amount: balance,
          currency: 'COP',
          reference: `PROGRAMADO-CXP-${ap.id.substring(0, 8)}`,
          processor_response: {
            bank_account_id: bankAccountId,
            scheduled_date: scheduledDate,
            status: 'scheduled',
          },
          status: 'pending',
          created_by: userId,
          payment_date: scheduledDate,
          discount_amount: 0,
          change_amount: 0,
        })
        .select('id')
        .single();

      if (paymentError) {
        throw new Error(`Error al registrar pago programado: ${paymentError.message}`);
      }

      return {
        scheduled: true,
        paymentId: paymentRow.id,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al programar pago';
      throw new Error(message);
    }
  }

  /**
   * Obtiene el historial de pagos a un proveedor via Open Finance.
   * @param supplierId ID del proveedor
   * @param organizationId ID de la organizacion
   */
  static async getPaymentHistory(
    supplierId: number,
    organizationId: number,
  ): Promise<PaymentHistoryEntry[]> {
    try {
      const supabase = getSupabaseAdmin();

      // Buscar las cuentas por pagar del proveedor
      const { data: apRows } = await supabase
        .from('accounts_payable')
        .select('id')
        .eq('supplier_id', supplierId)
        .eq('organization_id', organizationId);

      if (!apRows || apRows.length === 0) {
        return [];
      }

      const apIds = apRows.map((row: { id: string }) => row.id);

      // Buscar pagos asociados a esas cuentas por pagar via Open Finance
      const { data: paymentRows, error } = await supabase
        .from('payments')
        .select('id, payment_date, amount, reference, status, processor_response')
        .in('source_id', apIds)
        .eq('organization_id', organizationId)
        .in('method', ['open_finance', 'open_finance_scheduled'])
        .order('payment_date', { ascending: false });

      if (error) {
        console.error('[PaymentInitiation] Error al obtener historial:', error.message);
        return [];
      }

      return (paymentRows || []).map((row: PaymentRow) => {
        const processor = row.processor_response as { transfer_id?: string } | null;
        return {
          id: row.id,
          date: row.payment_date || '',
          amount: Number(row.amount) || 0,
          reference: row.reference || '',
          status: row.status,
          transferId: processor?.transfer_id,
        };
      });
    } catch (err) {
      console.error('[PaymentInitiation] Error al obtener historial:', err);
      return [];
    }
  }

  /**
   * Cancela una transferencia pendiente y revierte el efecto en accounts_payable.
   * @param transferId ID de la transferencia de Prometeo
   */
  static async cancelPayment(transferId: string): Promise<{ success: boolean }> {
    try {
      const supabase = getSupabaseAdmin();

      // Buscar el pago registrado con ese transfer_id en processor_response
      const { data: paymentRow, error: findError } = await supabase
        .from('payments')
        .select('id, source_id, amount, status, processor_response')
        .eq('method', 'open_finance')
        .eq('status', 'pending')
        .filter('processor_response->>transfer_id', 'eq', transferId)
        .maybeSingle();

      if (findError || !paymentRow) {
        return { success: false };
      }

      const payment = paymentRow as {
        id: string;
        source_id: string;
        amount: number;
        status: string;
      };

      // Marcar el pago como cancelado
      const { error: cancelError } = await supabase
        .from('payments')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', payment.id);

      if (cancelError) {
        console.error('[PaymentInitiation] Error al cancelar pago:', cancelError.message);
        return { success: false };
      }

      // Revertir el efecto en accounts_payable: restaurar el balance
      if (payment.source_id) {
        const { data: apRow } = await supabase
          .from('accounts_payable')
          .select('id, balance, amount, status')
          .eq('id', payment.source_id)
          .single();

        if (apRow) {
          const ap = apRow as { id: string; balance: number; amount: number; status: string };
          const restoredBalance = Number(ap.balance) + Number(payment.amount);

          const { error: revertError } = await supabase
            .from('accounts_payable')
            .update({
              balance: restoredBalance,
              status: restoredBalance >= ap.amount ? 'pending' : 'partial',
              updated_at: new Date().toISOString(),
            })
            .eq('id', ap.id);

          if (revertError) {
            console.error('[PaymentInitiation] Error al revertir CxP:', revertError.message);
          }
        }
      }

      return { success: true };
    } catch (err) {
      console.error('[PaymentInitiation] Error al cancelar pago:', err);
      return { success: false };
    }
  }
}

/** Instancia singleton del servicio */
export const paymentInitiationService = PaymentInitiationService;
