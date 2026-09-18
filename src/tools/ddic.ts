import { z } from 'zod';
import type { Tool } from './Tool';

const elementInputSchema = z
  .object({
    system: z.string().min(1),
    name: z.string().min(1).describe('Table/structure/CDS view name.'),
    kind: z.enum(['table', 'structure', 'cdsView']).optional(),
  })
  .strict();

/** Tier A. Retrieves a table/structure/CDS view's field list and types. */
export const ddicElementTool: Tool<z.infer<typeof elementInputSchema>> = {
  name: 'adt_ddic_element',
  description: "Retrieves a table/structure/CDS view's DDIC metadata (field list and types).",
  inputSchema: elementInputSchema,
  execute: (gateway, args) => gateway.ddicElement(args.system, { name: args.name, kind: args.kind }),
};

const tableContentsInputSchema = z
  .object({
    system: z.string().min(1),
    tableName: z.string().min(1),
    rowLimit: z.number().int().positive().max(10000).optional(),
  })
  .strict();

/** Tier B. Queries a table's contents, up to `rowLimit` rows (default 100). Unlike a metadata
 * read, this can expose application data (PII, financial records) - not Tier A. */
export const ddicTableContentsTool: Tool<z.infer<typeof tableContentsInputSchema>> = {
  name: 'adt_ddic_table_contents',
  description: "Queries a database table's contents, up to rowLimit rows (default 100).",
  inputSchema: tableContentsInputSchema,
  execute: (gateway, args) =>
    gateway.ddicTableContents(args.system, { tableName: args.tableName, rowLimit: args.rowLimit }),
};

export const ddicTools = [ddicElementTool, ddicTableContentsTool];
