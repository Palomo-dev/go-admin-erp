'use client';

import { useState, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useOrgAdmin } from '@/components/organization/useOrgAdmin';
import {
  OrganizationInfoSkeleton,
  MembersSkeleton,
  InvitationsSkeleton,
  BranchesSkeleton,
  OrganizationListSkeleton,
} from '@/components/organization/OrganizationSkeletons';
import { Building2, Users, Mail, MapPin, Layers } from 'lucide-react';

const OrganizationInfoTab = dynamic(() => import('@/components/organization/OrganizationInfoTab'), {
  loading: () => <OrganizationInfoSkeleton />,
});
const MembersTab = dynamic(() => import('@/components/organization/MembersTab'), {
  loading: () => <MembersSkeleton />,
});
const InvitationsTab = dynamic(() => import('@/components/organization/InvitationsTab'), {
  loading: () => <InvitationsSkeleton />,
});
const BranchesTab = dynamic(() => import('@/components/organization/BranchesTab'), {
  loading: () => <BranchesSkeleton />,
});
const ManageOrganizationsTab = dynamic(() => import('@/components/organization/ManageOrganizationsTab'), {
  loading: () => <OrganizationListSkeleton />,
});

const TABS = [
  { id: 'informacion', label: 'Información', icon: Building2 },
  { id: 'miembros', label: 'Miembros', icon: Users },
  { id: 'invitaciones', label: 'Invitaciones', icon: Mail },
  { id: 'sucursales', label: 'Sucursales', icon: MapPin },
  { id: 'organizaciones', label: 'Mis Organizaciones', icon: Layers },
] as const;

export function GeneralConfigPanel() {
  const [activeTab, setActiveTab] = useState<string>('informacion');
  const { orgId, isOrgAdmin, userBranches, loading, error } = useOrgAdmin();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex gap-2 border-b pb-2">
          {TABS.map((tab) => (
            <div key={tab.id} className="h-10 w-28 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
        <OrganizationInfoSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (!isOrgAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-yellow-700 dark:text-yellow-300">
          No tienes permisos de administrador para ver esta configuración.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="border-b pb-2">
          <TabsList className="bg-transparent h-auto p-0 gap-1 flex flex-wrap">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm data-[state=active]:bg-primary/10 data-[state=active]:shadow-none dark:data-[state=active]:bg-primary/20"
                >
                  <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30 transition-colors group-data-[state=active]:bg-primary">
                    <Icon className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400 transition-colors group-data-[state=active]:text-white" />
                  </div>
                  <span className="whitespace-nowrap text-gray-600 dark:text-gray-400 transition-colors group-data-[state=active]:text-primary dark:group-data-[state=active]:text-primary font-medium">
                    {tab.label}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <TabsContent value="informacion" className="mt-6">
          <Suspense fallback={<OrganizationInfoSkeleton />}>
            <OrganizationInfoTab orgData={orgId} />
          </Suspense>
        </TabsContent>

        <TabsContent value="miembros" className="mt-6">
          <Suspense fallback={<MembersSkeleton />}>
            <MembersTab orgId={orgId} />
          </Suspense>
        </TabsContent>

        <TabsContent value="invitaciones" className="mt-6">
          <Suspense fallback={<InvitationsSkeleton />}>
            <InvitationsTab orgId={orgId} />
          </Suspense>
        </TabsContent>

        <TabsContent value="sucursales" className="mt-6">
          <Suspense fallback={<BranchesSkeleton />}>
            <BranchesTab orgId={orgId} userBranches={userBranches} />
          </Suspense>
        </TabsContent>

        <TabsContent value="organizaciones" className="mt-6">
          <Suspense fallback={<OrganizationListSkeleton />}>
            <ManageOrganizationsTab />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
