import {Suspense} from 'react';
import {PartnersPage} from '@/components/crm/partners/PartnersPage';

export default async function PartnerDetailRoute({params,searchParams}: {params:Promise<{id:string}>;searchParams:Promise<{registrar?:string}>}) {
  const [{id},query] = await Promise.all([params,searchParams]);
  return <Suspense fallback={null}><PartnersPage partnerId={id} initialRegisterDeal={query.registrar === '1'}/></Suspense>;
}
