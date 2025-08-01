/**
 * Exportaciones principales del módulo de segmentos CRM
 */

export { default as SegmentBuilder } from './SegmentBuilder';
export { default as FilterBuilder } from './FilterBuilder';
export { default as SegmentPreview } from './SegmentPreview';
export { default as SegmentList } from './SegmentList';

export * from './utils';

export type {
  FilterRule,
  FilterGroup,
  Segment
} from './utils';
