import { NextRequest, NextResponse } from 'next/server';
import categoryRulesService, {
  type CategoryRuleInput,
  type RuleField,
  type RuleOperator,
  type LogicCombiner,
} from '@/lib/services/categoryRulesService';

// POST /api/categorias/reglas
// Body: { action: 'save' | 'evaluate' | 'apply', categoryId, organizationId, rules? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, categoryId, organizationId, rules } = body;

    if (!categoryId || !organizationId) {
      return NextResponse.json(
        { error: 'categoryId y organizationId son requeridos' },
        { status: 400 }
      );
    }

    switch (action) {
      case 'save': {
        if (!Array.isArray(rules)) {
          return NextResponse.json({ error: 'rules debe ser un array' }, { status: 400 });
        }
        const saved = await categoryRulesService.saveRules(
          Number(categoryId),
          Number(organizationId),
          rules as CategoryRuleInput[]
        );
        return NextResponse.json({ rules: saved });
      }

      case 'evaluate': {
        // Obtener reglas guardadas o usar las del body
        let rulesToEval = await categoryRulesService.getRules(Number(categoryId));
        if (rules && Array.isArray(rules) && rules.length > 0) {
          // Si vienen reglas en el body, convertirlas al formato
          rulesToEval = rules.map((r: any, i: number) => ({
            id: 0,
            category_id: Number(categoryId),
            organization_id: Number(organizationId),
            field: r.field as RuleField,
            operator: r.operator as RuleOperator,
            value: r.value || null,
            value_array: r.value_array || [],
            logic_combiner: (i === 0 ? 'AND' : r.logic_combiner) as LogicCombiner,
            display_order: i,
            is_active: true,
            created_at: '',
            updated_at: '',
          }));
        }
        const products = await categoryRulesService.evaluateRules(
          Number(organizationId),
          rulesToEval
        );
        return NextResponse.json({ products, count: products.length });
      }

      case 'apply': {
        const rulesToApply = await categoryRulesService.getRules(Number(categoryId));
        if (rulesToApply.length === 0) {
          return NextResponse.json(
            { error: 'No hay reglas guardadas para esta categoría' },
            { status: 400 }
          );
        }
        const result = await categoryRulesService.applyRules(
          Number(categoryId),
          Number(organizationId),
          rulesToApply
        );
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
    }
  } catch (err: any) {
    console.error('Error en /api/categorias/reglas:', err);
    return NextResponse.json(
      { error: err.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// GET /api/categorias/reglas?categoryId=X
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get('categoryId');
    const organizationId = searchParams.get('organizationId');

    if (!categoryId) {
      return NextResponse.json({ error: 'categoryId es requerido' }, { status: 400 });
    }

    const rules = await categoryRulesService.getRules(Number(categoryId));

    // Si se pide, también obtener opciones para selects
    if (organizationId) {
      const [suppliers, tags] = await Promise.all([
        categoryRulesService.getSuppliersForSelect(Number(organizationId)),
        categoryRulesService.getTagsForSelect(Number(organizationId)),
      ]);
      return NextResponse.json({ rules, suppliers, tags });
    }

    return NextResponse.json({ rules });
  } catch (err: any) {
    console.error('Error en GET /api/categorias/reglas:', err);
    return NextResponse.json(
      { error: err.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
