import { z } from 'zod';
export const objectionCatalogSchema=z.object({
 title:z.string().trim().min(1).max(120),category:z.string().trim().min(1).max(80),
 detection_signals:z.array(z.string().trim().min(1).max(500)).max(50).nullable().optional(),
 recommended_response:z.string().max(5000).nullable().optional(),
 discovery_questions:z.array(z.string().trim().min(1).max(500)).max(50).nullable().optional(),
 related_case_studies:z.array(z.string().max(500)).max(50).nullable().optional(),
 vertical_id:z.string().uuid().nullable().optional(),is_active:z.boolean().optional(),sort_order:z.number().int().min(0).max(100000).optional(),
 expected_updated_at:z.string().datetime({offset:true}).optional(),
}).strict();
