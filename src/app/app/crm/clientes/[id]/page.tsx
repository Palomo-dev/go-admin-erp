'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  MapPin,
  FileText,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { CustomerFoliosSection } from '@/components/crm/clientes/CustomerFoliosSection';
import { DetailSkeleton } from '@/components/common/PageSkeletons';

interface CustomerData {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  doc_type: string | null;
  doc_number: string | null;
  customer_type: string | null;
}

export default function ClienteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { organization } = useOrganization();
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!params?.id || !organization?.id) return;
    const customerId = params.id as string;

    const loadCustomer = async () => {
      try {
        const { data, error } = await supabase
          .from('customers')
          .select('id, full_name, email, phone, address, doc_type, doc_number, customer_type')
          .eq('id', customerId)
          .eq('organization_id', organization.id)
          .single();

        if (error) throw error;
        setCustomer(data);
      } catch (error) {
        console.error('Error cargando cliente:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadCustomer();
  }, [params?.id, organization?.id]);

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <DetailSkeleton />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] gap-4">
        <p className="text-gray-600 dark:text-gray-400">Cliente no encontrado</p>
        <Button variant="outline" onClick={() => router.back()}>
          Volver
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-blue-50 dark:bg-blue-900/20">
            <User className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {customer.full_name}
            </h1>
            {customer.customer_type && (
              <Badge variant="outline" className="mt-1">
                {customer.customer_type === 'company' ? 'Empresa' : 'Persona'}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Info Card */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
          Información de Contacto
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {customer.email && (
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-gray-400" />
              <span className="text-gray-600 dark:text-gray-400">{customer.email}</span>
            </div>
          )}
          {customer.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-gray-400" />
              <span className="text-gray-600 dark:text-gray-400">{customer.phone}</span>
            </div>
          )}
          {customer.address && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gray-400" />
              <span className="text-gray-600 dark:text-gray-400">{customer.address}</span>
            </div>
          )}
          {customer.doc_number && (
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-400" />
              <span className="text-gray-600 dark:text-gray-400">
                {customer.doc_type || 'Doc'}: {customer.doc_number}
              </span>
            </div>
          )}
        </div>
      </Card>

      <Separator />

      {/* Folios & Debts Section */}
      <div>
        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
          Folios y Deudas
        </h2>
        <CustomerFoliosSection customerId={customer.id} />
      </div>
    </div>
  );
}
