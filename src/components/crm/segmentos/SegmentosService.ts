import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import type { SegmentoRegistro } from '@/lib/services/crm/segmentosAudiencia';
/** Adaptador de lectura para consumidores existentes. Las mutaciones usan las API del CRM. */
export const SegmentosService = {
  async getSegments(): Promise<SegmentoRegistro[]> {
    return (await pedirCrm<SegmentoRegistro[]>('/api/crm/segments')).data;
  },
  async getSegmentById(id: string): Promise<SegmentoRegistro> {
    return (await pedirCrm<SegmentoRegistro>(`/api/crm/segments/${id}`)).data;
  },
};
