import { z } from 'zod';
import type { Tool } from './Tool';

const inputSchema = z
  .object({
    system: z.string().min(1),
    query: z.string().min(1).describe('Name pattern; `*` is the ADT wildcard (e.g. `ZCL_TEST*`).'),
    objectType: z.string().optional().describe('Restrict to one ADT object type (e.g. `CLAS/OC`, `PROG/P`).'),
    maxResults: z.number().int().positive().optional(),
  })
  .strict();

/** Tier A. Searches ABAP repository objects by name pattern/type - the primary entry point for
 * an investigation. */
export const searchTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'adt_search',
  description: 'Searches for ABAP repository objects by name pattern and/or object type.',
  inputSchema,
  execute: (gateway, args) =>
    gateway.search(args.system, { query: args.query, objectType: args.objectType, maxResults: args.maxResults }),
};

export const searchTools = [searchTool];
