'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { BlocksHeader, BlocksStats, BlocksList, BlockDialog } from '@/components/pms/bloqueos';
import reservationBlocksService, {
  ReservationBlock,
  BlockStats,
  CreateBlockData,
} from '@/lib/services/reservationBlocksService';
import SpacesService from '@/lib/services/spacesService';
import SpaceTypesService from '@/lib/services/spaceTypesService';
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

interface Space {
  id: string;
  label: string;
  floor_zone?: string;
  space_types?: {
    name: string;
  };
}

interface SpaceType {
  id: string;
  name: string;
}

export default function BloqueosPage() {
  const { toast } = useToast();
  const [blocks, setBlocks] = useState<ReservationBlock[]>([]);
  const [stats, setStats] = useState<BlockStats>({
    total: 0,
    by_type: { maintenance: 0, owner: 0, event: 0, ota_hold: 0, other: 0 },
    active_today: 0,
    upcoming: 0,
  });
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [spaceTypes, setSpaceTypes] = useState<SpaceType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<ReservationBlock | null>(null);
  const [blockToDelete, setBlockToDelete] = useState<ReservationBlock | null>(null);

  // TODO: Obtener de contexto de usuario
  const organizationId = 2;
  const branchId = 2;

  const loadData = async () => {
    try {
      setIsLoading(true);

      const [blocksData, statsData, spacesData, typesData] = await Promise.all([
        reservationBlocksService.getBlocks(organizationId, { branchId }),
        reservationBlocksService.getStats(organizationId, branchId),
        SpacesService.getSpaces({ branchId }),
        SpaceTypesService.getSpaceTypes(organizationId),
      ]);

      setBlocks(blocksData);
      setStats(statsData);
      setSpaces(spacesData as Space[]);
      setSpaceTypes(typesData as SpaceType[]);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los bloqueos',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleNewBlock = () => {
    setSelectedBlock(null);
    setShowDialog(true);
  };

  const handleEditBlock = (block: ReservationBlock) => {
    setSelectedBlock(block);
    setShowDialog(true);
  };

  const handleDeleteBlock = (block: ReservationBlock) => {
    setBlockToDelete(block);
  };

  const confirmDelete = async () => {
    if (!blockToDelete) return;

    try {
      await reservationBlocksService.deleteBlock(blockToDelete.id, organizationId);
      toast({
        title: 'Bloqueo eliminado',
        description: 'El bloqueo se eliminó correctamente',
      });
      loadData();
    } catch (error) {
      console.error('Error eliminando bloqueo:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el bloqueo',
        variant: 'destructive',
      });
    } finally {
      setBlockToDelete(null);
    }
  };

  const handleSaveBlock = async (data: CreateBlockData) => {
    try {
      if (selectedBlock) {
        await reservationBlocksService.updateBlock(selectedBlock.id, organizationId, data);
        toast({
          title: 'Bloqueo actualizado',
          description: 'Los cambios se guardaron correctamente',
        });
      } else {
        await reservationBlocksService.createBlock(data);
        toast({
          title: 'Bloqueo creado',
          description: 'El bloqueo se creó correctamente',
        });
      }
      loadData();
    } catch (error) {
      console.error('Error guardando bloqueo:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar el bloqueo',
        variant: 'destructive',
      });
      throw error;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <BlocksHeader onNewBlock={handleNewBlock} />

      <BlocksStats stats={stats} isLoading={isLoading} />

      <BlocksList
        blocks={blocks}
        isLoading={isLoading}
        onEdit={handleEditBlock}
        onDelete={handleDeleteBlock}
      />

      <BlockDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        block={selectedBlock}
        spaces={spaces}
        spaceTypes={spaceTypes}
        organizationId={organizationId}
        branchId={branchId}
        onSave={handleSaveBlock}
      />

      <AlertDialog open={!!blockToDelete} onOpenChange={() => setBlockToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar bloqueo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El espacio quedará disponible para reservas
              en las fechas del bloqueo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
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
