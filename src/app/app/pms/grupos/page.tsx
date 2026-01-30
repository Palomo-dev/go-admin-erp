'use client';

import React, { useState, useEffect } from 'react';
import { useOrganization, getCurrentBranchId } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import GroupReservationsService, {
  type Group,
  type GroupStats as GroupStatsType,
} from '@/lib/services/groupReservationsService';
import {
  GroupsHeader,
  GroupsStats,
  GroupsList,
  GroupDialog,
} from '@/components/pms/grupos';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function GruposPage() {
  const { organization } = useOrganization();
  const { toast } = useToast();

  const [groups, setGroups] = useState<Group[]>([]);
  const [stats, setStats] = useState<GroupStatsType>({
    totalGroups: 0,
    activeGroups: 0,
    totalRoomNights: 0,
    totalRevenue: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Dialog states
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<Group | null>(null);

  const branchId = getCurrentBranchId();

  const loadData = async () => {
    if (!branchId) return;

    try {
      const [groupsData, statsData] = await Promise.all([
        GroupReservationsService.getGroups(branchId),
        GroupReservationsService.getGroupStats(branchId),
      ]);

      setGroups(groupsData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading groups:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los grupos',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (branchId) {
      loadData();
    }
  }, [branchId]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    toast({
      title: 'Actualizado',
      description: 'Los datos han sido actualizados',
    });
  };

  const handleNewGroup = () => {
    setSelectedGroup(null);
    setShowGroupDialog(true);
  };

  const handleViewGroup = (group: Group) => {
    // For now, just edit. In the future, could show a detail view
    setSelectedGroup(group);
    setShowGroupDialog(true);
  };

  const handleEditGroup = (group: Group) => {
    setSelectedGroup(group);
    setShowGroupDialog(true);
  };

  const handleDeleteGroup = (group: Group) => {
    setGroupToDelete(group);
    setShowDeleteDialog(true);
  };

  const handleSaveGroup = async (data: {
    name: string;
    company?: string;
    pickupDate?: string;
    releaseDate?: string;
    roomNights?: number;
  }) => {
    if (!branchId) return;

    try {
      if (selectedGroup) {
        await GroupReservationsService.updateGroup(selectedGroup.id, {
          name: data.name,
          company: data.company || null,
          pickupDate: data.pickupDate || null,
          releaseDate: data.releaseDate || null,
          roomNights: data.roomNights || null,
        });
        toast({
          title: 'Grupo actualizado',
          description: `El grupo "${data.name}" ha sido actualizado`,
        });
      } else {
        await GroupReservationsService.createGroup({
          branchId,
          name: data.name,
          company: data.company,
          pickupDate: data.pickupDate,
          releaseDate: data.releaseDate,
          roomNights: data.roomNights,
        });
        toast({
          title: 'Grupo creado',
          description: `El grupo "${data.name}" ha sido creado`,
        });
      }
      await loadData();
    } catch (error) {
      console.error('Error saving group:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar el grupo',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const confirmDeleteGroup = async () => {
    if (!groupToDelete) return;

    try {
      await GroupReservationsService.deleteGroup(groupToDelete.id);
      toast({
        title: 'Grupo eliminado',
        description: `El grupo "${groupToDelete.name}" ha sido eliminado`,
      });
      setShowDeleteDialog(false);
      setGroupToDelete(null);
      await loadData();
    } catch (error) {
      console.error('Error deleting group:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el grupo',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <GroupsHeader
          onNewGroup={handleNewGroup}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
        />

        <GroupsStats
          totalGroups={stats.totalGroups}
          activeGroups={stats.activeGroups}
          totalRoomNights={stats.totalRoomNights}
          totalRevenue={stats.totalRevenue}
          isLoading={isLoading}
        />

        <GroupsList
          groups={groups}
          onView={handleViewGroup}
          onEdit={handleEditGroup}
          onDelete={handleDeleteGroup}
          isLoading={isLoading}
        />
      </div>

      <GroupDialog
        open={showGroupDialog}
        onOpenChange={setShowGroupDialog}
        group={selectedGroup}
        onSave={handleSaveGroup}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar grupo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el grupo "{groupToDelete?.name}" y desvinculará todas las reservas asociadas. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteGroup}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
