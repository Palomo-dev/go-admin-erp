'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Users, Clock, Save, Lock, Unlock, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { TableWithSession } from './types';

interface MesasFloorMapProps {
  mesas: TableWithSession[];
  onSavePositions: (positions: { id: string; position_x: number; position_y: number }[]) => Promise<void>;
  onMesaClick: (mesa: TableWithSession) => void;
}

const TABLE_W = 120;
const TABLE_H = 80;
const GRID_SIZE = 20;
const MIN_CANVAS_H = 600;

function snapToGrid(val: number): number {
  return Math.round(val / GRID_SIZE) * GRID_SIZE;
}

export function MesasFloorMap({ mesas, onSavePositions, onMesaClick }: MesasFloorMapProps) {
  const [editMode, setEditMode] = useState(false);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [canvasSize, setCanvasSize] = useState({ w: 1200, h: MIN_CANVAS_H });
  const canvasRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Medir el contenedor y adaptar el canvas
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        const h = Math.max(MIN_CANVAS_H, Math.floor(window.innerHeight - 340));
        setCanvasSize({ w, h });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Inicializar posiciones desde las mesas
  useEffect(() => {
    const pos: Record<string, { x: number; y: number }> = {};
    mesas.forEach((mesa, idx) => {
      pos[mesa.id] = {
        x: mesa.position_x ?? (60 + (idx % 6) * (TABLE_W + 30)),
        y: mesa.position_y ?? (60 + Math.floor(idx / 6) * (TABLE_H + 40)),
      };
    });
    setPositions(pos);
    setHasChanges(false);
  }, [mesas]);

  const getPos = (id: string) => positions[id] || { x: 0, y: 0 };

  // --- Drag handlers ---
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, mesaId: string) => {
      if (!editMode) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pos = getPos(mesaId);
      setDragging(mesaId);
      setDragOffset({
        x: (e.clientX - rect.left) / zoom - pos.x,
        y: (e.clientY - rect.top) / zoom - pos.y,
      });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [editMode, positions, zoom],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      e.preventDefault();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      let newX = (e.clientX - rect.left) / zoom - dragOffset.x;
      let newY = (e.clientY - rect.top) / zoom - dragOffset.y;
      newX = snapToGrid(Math.max(0, Math.min(newX, canvasSize.w / zoom - TABLE_W)));
      newY = snapToGrid(Math.max(0, Math.min(newY, canvasSize.h / zoom - TABLE_H)));
      setPositions((prev) => ({ ...prev, [dragging]: { x: newX, y: newY } }));
      setHasChanges(true);
    },
    [dragging, dragOffset, zoom, canvasSize],
  );

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  const handleMesaClick = (mesa: TableWithSession) => {
    if (editMode) return; // en modo edición solo se arrastra
    onMesaClick(mesa);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const batch = Object.entries(positions).map(([id, pos]) => ({
        id,
        position_x: Math.round(pos.x),
        position_y: Math.round(pos.y),
      }));
      await onSavePositions(batch);
      setHasChanges(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetZoom = () => setZoom(1);

  // Color por estado
  const getTableColors = (mesa: TableWithSession) => {
    if (mesa.session?.status === 'bill_requested') {
      return {
        bg: 'bg-orange-100 dark:bg-orange-900/40',
        border: 'border-orange-400 dark:border-orange-600',
        text: 'text-orange-700 dark:text-orange-300',
      };
    }
    if (mesa.state === 'occupied') {
      return {
        bg: 'bg-red-100 dark:bg-red-900/40',
        border: 'border-red-400 dark:border-red-600',
        text: 'text-red-700 dark:text-red-300',
      };
    }
    if (mesa.state === 'reserved') {
      return {
        bg: 'bg-yellow-100 dark:bg-yellow-900/40',
        border: 'border-yellow-400 dark:border-yellow-600',
        text: 'text-yellow-700 dark:text-yellow-300',
      };
    }
    return {
      bg: 'bg-green-100 dark:bg-green-900/40',
      border: 'border-green-400 dark:border-green-600',
      text: 'text-green-700 dark:text-green-300',
    };
  };

  // Calcular tiempo sesión
  const getTiempo = (mesa: TableWithSession) => {
    if (!mesa.session?.opened_at) return null;
    const diff = Math.floor((Date.now() - new Date(mesa.session.opened_at).getTime()) / 60000);
    if (diff < 60) return `${diff}m`;
    return `${Math.floor(diff / 60)}h${diff % 60}m`;
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant={editMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => setEditMode(!editMode)}
            className={editMode ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
          >
            {editMode ? <Unlock className="h-4 w-4 mr-1" /> : <Lock className="h-4 w-4 mr-1" />}
            {editMode ? 'Editando plano' : 'Editar plano'}
          </Button>
          {hasChanges && editMode && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Save className="h-4 w-4 mr-1" />
              {isSaving ? 'Guardando...' : 'Guardar posiciones'}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs text-gray-500 dark:text-gray-400 min-w-[40px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.min(2, z + 0.1))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleResetZoom}>
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Leyenda */}
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500" /> Libre</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500" /> Ocupada</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-500" /> Cuenta</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-500" /> Reservada</span>
        </div>
      </div>

      {/* Canvas */}
      <div ref={wrapperRef} className="w-full">
      <Card className="overflow-hidden bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        <div
          ref={canvasRef}
          className={cn(
            'relative select-none w-full',
            editMode ? 'cursor-crosshair' : 'cursor-default',
          )}
          style={{
            height: canvasSize.h,
            backgroundImage: `radial-gradient(circle, rgba(156,163,175,0.3) 1px, transparent 1px)`,
            backgroundSize: `${GRID_SIZE * zoom}px ${GRID_SIZE * zoom}px`,
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {mesas.map((mesa) => {
            const pos = getPos(mesa.id);
            const colors = getTableColors(mesa);
            const tiempo = getTiempo(mesa);
            const isDragging = dragging === mesa.id;

            return (
              <div
                key={mesa.id}
                className={cn(
                  'absolute rounded-xl border-2 shadow-md transition-shadow select-none flex flex-col items-center justify-center',
                  colors.bg,
                  colors.border,
                  isDragging && 'shadow-xl ring-2 ring-blue-500 z-50 opacity-90',
                  editMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer hover:shadow-lg',
                )}
                style={{
                  left: pos.x * zoom,
                  top: pos.y * zoom,
                  width: TABLE_W * zoom,
                  height: TABLE_H * zoom,
                  touchAction: 'none',
                }}
                onPointerDown={(e) => handlePointerDown(e, mesa.id)}
                onClick={() => handleMesaClick(mesa)}
              >
                {/* Nombre */}
                <span
                  className={cn('font-bold leading-tight text-center', colors.text)}
                  style={{ fontSize: 14 * zoom }}
                >
                  {mesa.name}
                </span>

                {/* Info compacta */}
                <div className="flex items-center gap-1 mt-0.5" style={{ fontSize: 10 * zoom }}>
                  <Users style={{ width: 10 * zoom, height: 10 * zoom }} className={colors.text} />
                  <span className={colors.text}>
                    {mesa.session?.customers || 0}/{mesa.capacity}
                  </span>
                  {tiempo && (
                    <>
                      <Clock style={{ width: 10 * zoom, height: 10 * zoom }} className={cn(colors.text, 'ml-1')} />
                      <span className={colors.text}>{tiempo}</span>
                    </>
                  )}
                </div>

                {/* Zona badge */}
                {mesa.zone && (
                  <span
                    className="text-gray-500 dark:text-gray-400 truncate max-w-full px-1"
                    style={{ fontSize: 9 * zoom }}
                  >
                    {mesa.zone}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Card>
      </div>

      {editMode && (
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Arrastra las mesas para reorganizar el plano. Las posiciones se ajustan a una cuadrícula de {GRID_SIZE}px. Haz clic en &quot;Guardar posiciones&quot; cuando termines.
        </p>
      )}
    </div>
  );
}
