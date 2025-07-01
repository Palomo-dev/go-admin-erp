declare module '@hello-pangea/dnd' {
  import * as React from 'react';
  
  // DragDropContext
  export interface DragDropContextProps {
    onDragEnd: (result: DropResult) => void;
    onDragStart?: (initial: DragStart) => void;
    onDragUpdate?: (update: DragUpdate) => void;
    children: React.ReactNode;
  }
  
  export const DragDropContext: React.FC<DragDropContextProps>;
  
  // Droppable
  export interface DroppableProps {
    droppableId: string;
    type?: string;
    direction?: 'horizontal' | 'vertical';
    isDropDisabled?: boolean;
    children: (provided: DroppableProvided, snapshot: DroppableStateSnapshot) => React.ReactNode;
  }
  
  export interface DroppableProvided {
    innerRef: (element: HTMLElement | null) => void;
    droppableProps: {
      'data-rbd-droppable-id': string;
      'data-rbd-droppable-context-id': string;
    };
    placeholder?: React.ReactNode;
  }
  
  export interface DroppableStateSnapshot {
    isDraggingOver: boolean;
    draggingOverWith?: string;
    draggingFromThisWith?: string;
    isUsingPlaceholder: boolean;
  }
  
  export const Droppable: React.FC<DroppableProps>;
  
  // Draggable
  export interface DraggableProps {
    draggableId: string;
    index: number;
    isDragDisabled?: boolean;
    disableInteractiveElementBlocking?: boolean;
    children: (provided: DraggableProvided, snapshot: DraggableStateSnapshot) => React.ReactNode;
  }
  
  export interface DraggableProvided {
    innerRef: (element: HTMLElement | null) => void;
    draggableProps: {
      'data-rbd-draggable-context-id': string;
      'data-rbd-draggable-id': string;
      style?: React.CSSProperties;
    };
    dragHandleProps: {
      'data-rbd-drag-handle-draggable-id': string;
      'data-rbd-drag-handle-context-id': string;
      role: string;
      tabIndex: number;
      draggable: boolean;
      onDragStart: (event: React.DragEvent<HTMLElement>) => void;
    } | null;
  }
  
  export interface DraggableStateSnapshot {
    isDragging: boolean;
    isDropAnimating: boolean;
    isClone: boolean;
    dropAnimation?: {
      duration: number;
      curve: string;
      moveTo: {
        x: number;
        y: number;
      };
    };
    draggingOver?: string;
    combineWith?: string;
    combineTargetFor?: string;
    mode?: 'FLUID' | 'SNAP';
  }
  
  export const Draggable: React.FC<DraggableProps>;
  
  // Types for results and updates
  export interface DraggableLocation {
    droppableId: string;
    index: number;
  }
  
  export interface DragStart {
    draggableId: string;
    type: string;
    source: DraggableLocation;
    mode: 'FLUID' | 'SNAP';
  }
  
  export interface DragUpdate extends DragStart {
    destination?: DraggableLocation | null;
    combine?: {
      draggableId: string;
      droppableId: string;
    } | null;
  }
  
  export interface DropResult extends DragUpdate {
    reason: 'DROP' | 'CANCEL';
  }
}
