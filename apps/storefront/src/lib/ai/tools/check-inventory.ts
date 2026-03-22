import { BaseTool } from './base-tool';
import { fetchMedusaStoreProductRaw } from '@/lib/medusa-agent-catalog';
import { buildPdpVariantRows, findVariantRow } from '@/lib/medusa-pdp';
import type { ToolDefinition, ToolResult, AgentContext } from '../types';

export class CheckInventoryTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'check_inventory',
    description:
      'Check stock availability for a product from the live Medusa catalog. Use product_id (Medusa id) or handle (slug).',
    parameters: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'Medusa product id' },
        handle: { type: 'string', description: 'Product URL handle/slug if product_id is unknown' },
        size: { type: 'string', description: 'Size to check' },
        color: { type: 'string', description: 'Color to check' },
      },
    },
  };

  async execute(params: Record<string, unknown>, _context: AgentContext): Promise<ToolResult> {
    const productId = String(params.product_id || '').trim();
    const handle = String(params.handle || '').trim();
    const size = (params.size as string | undefined)?.trim();
    const color = (params.color as string | undefined)?.trim();

    if (!productId && !handle) {
      return { success: false, error: 'Provide product_id or handle.' };
    }

    const raw = await fetchMedusaStoreProductRaw({
      id: productId || undefined,
      handle: handle || undefined,
    });

    if (!raw) {
      return { success: false, error: 'Product not found in the catalog.' };
    }

    const rows = buildPdpVariantRows(raw);

    if (size && color) {
      const match = findVariantRow(rows, color, size);
      if (!match) {
        return {
          success: true,
          data: {
            productId: String(raw.id || productId),
            handle: String(raw.handle || handle),
            availability: [],
            anyInStock: false,
            note: 'No variant matched that color/size combination.',
          },
        };
      }
      return {
        success: true,
        data: {
          productId: String(raw.id || productId),
          handle: String(raw.handle || handle),
          availability: [
            {
              variantId: match.id,
              size: match.size,
              color: match.color,
              inStock: match.inStock,
              sku: match.sku,
            },
          ],
          anyInStock: match.inStock,
        },
      };
    }

    return {
      success: true,
      data: {
        productId: String(raw.id || productId),
        handle: String(raw.handle || handle),
        availability: rows.map((r) => ({
          variantId: r.id,
          size: r.size,
          color: r.color,
          inStock: r.inStock,
          sku: r.sku,
        })),
        anyInStock: rows.some((r) => r.inStock),
      },
    };
  }
}
