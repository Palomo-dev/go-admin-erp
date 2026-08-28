'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, FileText, Send, Printer, Save } from 'lucide-react';
import { toastSuccess, toastError } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import {
  proposalService,
  type ProposalSections,
  type Proposal,
} from '@/lib/services/crm/proposalService';
import { PDFService, type InvoiceDataForPDF } from '@/lib/services/pdfService';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';

interface ProposalBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityId: string;
  opportunityName?: string;
}

interface OpportunityProductRow {
  product_id: number;
  quantity: number;
  unit_price: number;
  total_price: number;
  product?: { name: string; sku?: string } | null;
}

const SECTION_LABELS: Record<keyof ProposalSections, string> = {
  situacion_actual: 'Situación Actual',
  problemas: 'Problemas / Dolores',
  solucion: 'Solución Propuesta',
  roi_estimado: 'ROI Estimado',
  proximo_paso: 'Próximos Pasos',
};

/** Extrae un mensaje legible de un error desconocido. */
function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

const EMPTY_SECTIONS: ProposalSections = {
  situacion_actual: '',
  problemas: '',
  solucion: '',
  roi_estimado: '',
  proximo_paso: '',
};

export function ProposalBuilderDialog({
  open,
  onOpenChange,
  opportunityId,
  opportunityName,
}: ProposalBuilderDialogProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [products, setProducts] = useState<OpportunityProductRow[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [sections, setSections] = useState<ProposalSections>(EMPTY_SECTIONS);

  const loadProposal = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Cargar productos de la oportunidad (read-only)
      const { data: oppProducts } = await supabase
        .from('opportunity_products')
        .select(
          'product_id, quantity, unit_price, total_price, product:products(name, sku)'
        )
        .eq('opportunity_id', opportunityId);

      setProducts((oppProducts || []) as unknown as OpportunityProductRow[]);

      // 2. Generar o reutilizar propuesta
      const result = await proposalService.generateProposal(opportunityId);
      const fullProposal = await proposalService.getProposal(result.quotationId);

      setProposal(fullProposal);

      // 3. Cargar secciones narrativas
      if (fullProposal?.sections_json) {
        setSections({ ...EMPTY_SECTIONS, ...fullProposal.sections_json });
      } else {
        setSections(EMPTY_SECTIONS);
      }
    } catch (err: unknown) {
      console.error('Error al cargar propuesta:', err);
      toastError('Error', getErrorMessage(err, 'No se pudo cargar la propuesta'));
    } finally {
      setLoading(false);
    }
  }, [opportunityId]);

  useEffect(() => {
    if (open && opportunityId) {
      loadProposal();
    }
  }, [open, opportunityId, loadProposal]);

  const handleSectionChange = (key: keyof ProposalSections, value: string) => {
    setSections((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!proposal) return;
    setSaving(true);
    try {
      await proposalService.updateProposalSections(proposal.id, sections);
      toastSuccess('Guardado', 'Secciones narrativas actualizadas correctamente.');
    } catch (err: unknown) {
      toastError('Error', getErrorMessage(err, 'No se pudieron guardar las secciones'));
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePDF = async () => {
    if (!proposal) return;
    try {
      // Guardar secciones antes de generar PDF
      await proposalService.updateProposalSections(proposal.id, sections);

      // Construir datos para PDF reutilizando la infraestructura de cotizaciones
      const pdfData = await buildPDFData(proposal);
      pdfData.status = 'quotation';
      await PDFService.printInvoiceHTML(pdfData);
      toastSuccess('PDF Generado', `Propuesta ${proposal.number} lista para imprimir.`);
    } catch (err: unknown) {
      toastError('Error', getErrorMessage(err, 'No se pudo generar el PDF'));
    }
  };

  const handleSend = async () => {
    if (!proposal) return;
    setSending(true);
    try {
      // Guardar secciones antes de enviar
      await proposalService.updateProposalSections(proposal.id, sections);

      // Marcar como enviada: status='sent' + actividad + next_contact_at = +24h
      await proposalService.markProposalSent(proposal.id, opportunityId);

      toastSuccess(
        'Propuesta enviada',
        'Se registró el envío y se programó seguimiento en 24h.'
      );
      onOpenChange(false);
    } catch (err: unknown) {
      toastError('Error', getErrorMessage(err, 'No se pudo marcar como enviada'));
    } finally {
      setSending(false);
    }
  };

  const buildPDFData = async (quot: Proposal): Promise<InvoiceDataForPDF> => {
    // Obtener datos de la organización
    const orgData = obtenerOrganizacionActiva();
    let organizationData: InvoiceDataForPDF['organization'] | undefined;
    if (orgData?.id) {
      const { data: org } = await supabase
        .from('organizations')
        .select('name, tax_id, nit, address, phone, email, logo_url, primary_color, secondary_color')
        .eq('id', orgData.id)
        .maybeSingle();
      if (org) {
        const o = org as {
          name?: string;
          tax_id?: string;
          nit?: string;
          address?: string;
          phone?: string;
          email?: string;
          logo_url?: string;
          primary_color?: string;
          secondary_color?: string;
        };
        organizationData = {
          name: o.name || 'Mi Empresa',
          tax_id: o.tax_id || o.nit,
          address: o.address,
          phone: o.phone,
          email: o.email,
          logo_url: o.logo_url,
          primary_color: o.primary_color,
          secondary_color: o.secondary_color,
        };
      }
    }

    return {
      id: quot.id,
      number: quot.number,
      issue_date: quot.issue_date,
      due_date: quot.valid_until || quot.issue_date,
      status: 'quotation',
      currency: quot.currency || 'COP',
      subtotal: quot.subtotal || 0,
      tax_total: quot.tax_total || 0,
      total: quot.total || 0,
      balance: 0,
      notes: quot.terms_conditions || undefined,
      tax_included: quot.quotation_items?.[0]?.tax_included || false,
      discount_total: quot.discount_total > 0 ? quot.discount_total : undefined,
      organization: organizationData,
      customer: quot.customers
        ? {
            full_name: quot.customers.full_name,
            email: quot.customers.email,
            phone: quot.customers.phone,
            address: quot.customers.address,
            tax_id: quot.customers.identification_number,
          }
        : undefined,
      items: (quot.quotation_items || []).map((item) => ({
        description: item.description,
        qty: item.qty,
        unit_price: item.unit_price,
        tax_rate: item.tax_rate,
        tax_included: item.tax_included,
        discount_amount: item.discount_amount || 0,
        total_line: item.total_line,
      })),
    };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Propuesta: {opportunityName || 'Oportunidad'}
          </DialogTitle>
          <DialogDescription>
            {proposal
              ? `Cotización ${proposal.number} — edita la narrativa de valor y envía al cliente.`
              : 'Generando propuesta...'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            <span className="ml-2 text-sm text-gray-500">
              Generando propuesta...
            </span>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Líneas de productos (read-only) */}
            <div>
              <h3 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
                Líneas de la oportunidad
              </h3>
              <div className="rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Producto</th>
                      <th className="text-right px-3 py-2 font-medium">Cant.</th>
                      <th className="text-right px-3 py-2 font-medium">Precio</th>
                      <th className="text-right px-3 py-2 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-4 text-center text-gray-400"
                        >
                          Sin productos asociados
                        </td>
                      </tr>
                    ) : (
                      products.map((p, idx) => (
                        <tr
                          key={idx}
                          className="border-t border-gray-100 dark:border-gray-800"
                        >
                          <td className="px-3 py-2">
                            {p.product?.name || `Producto #${p.product_id}`}
                          </td>
                          <td className="text-right px-3 py-2">{p.quantity}</td>
                          <td className="text-right px-3 py-2">
                            {Number(p.unit_price).toLocaleString('es-ES')}
                          </td>
                          <td className="text-right px-3 py-2">
                            {Number(p.total_price).toLocaleString('es-ES')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Secciones narrativas editables */}
            <div>
              <h3 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">
                Narrativa de valor
              </h3>
              <div className="space-y-4">
                {(Object.keys(SECTION_LABELS) as (keyof ProposalSections)[]).map(
                  (key) => (
                    <div key={key}>
                      <label className="block text-xs font-medium mb-1 text-gray-600 dark:text-gray-400">
                        {SECTION_LABELS[key]}
                      </label>
                      <Textarea
                        value={sections[key]}
                        onChange={(e) => handleSectionChange(key, e.target.value)}
                        rows={3}
                        placeholder={`Describe ${SECTION_LABELS[key].toLowerCase()}...`}
                        className="resize-y"
                      />
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            variant="secondary"
            onClick={handleSave}
            disabled={loading || saving || !proposal}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            Guardar
          </Button>
          <Button
            variant="outline"
            onClick={handleGeneratePDF}
            disabled={loading || !proposal}
          >
            <Printer className="h-4 w-4 mr-1" />
            Generar PDF
          </Button>
          <Button
            onClick={handleSend}
            disabled={loading || sending || !proposal}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ProposalBuilderDialog;
