'use client';

import React, { useState } from 'react';
import {
  SesionesHeader,
  SesionesFilters,
  SesionesTable,
  EditSessionDialog,
  SessionStats,
  SessionPagination,
  useSesiones,
  NoOrganizationState,
  NoBranchState,
  printSessionReceipt,
  type ParkingSession,
} from '@/components/parking/sesiones';

export default function ParkingSesionesPage() {
  const {
    organization,
    branchId,
    sessions,
    spaces,
    isLoading,
    filters,
    currentPage,
    pageSize,
    totalItems,
    stats,
    totalPages,
    loadSessions,
    exportCSV,
    updateSession,
    handleFiltersChange,
    handleClearFilters,
    handlePageChange,
    handlePageSizeChange,
  } = useSesiones();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<ParkingSession | null>(null);

  const handleEdit = (session: ParkingSession) => {
    setSelectedSession(session);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async (
    sessionId: string,
    updates: {
      vehicle_plate: string;
      vehicle_type: string;
      parking_space_id: string | null;
      audit_reason: string;
    }
  ) => {
    await updateSession(sessionId, updates);
  };

  if (!organization?.id) {
    return <NoOrganizationState />;
  }

  if (!branchId && !isLoading) {
    return <NoBranchState />;
  }

  return (
    <div className="p-6 space-y-6">
      <SesionesHeader
        onRefresh={loadSessions}
        onExport={exportCSV}
        isLoading={isLoading}
        totalSessions={totalItems}
      />

      <SessionStats {...stats} />

      <SesionesFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onClearFilters={handleClearFilters}
      />

      <SesionesTable
        sessions={sessions}
        isLoading={isLoading}
        onEdit={handleEdit}
        onPrint={printSessionReceipt}
        canEdit={true}
      />

      {totalPages > 1 && (
        <SessionPagination
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={totalItems}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      )}

      <EditSessionDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        session={selectedSession}
        spaces={spaces}
        onSave={handleSaveEdit}
      />
    </div>
  );
}
