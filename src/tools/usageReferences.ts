import { z } from 'zod';
import type { Tool } from './Tool';

const inputSchema = z
  .object({
    system: z.string().min(1),
    objectUri: z.string().min(1),
  })
  .strict();

/** Tier A. Where-used analysis for a given ABAP object URI - the core of a dependency/impact
 * assessment. */
export const usageReferencesTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'adt_usage_references',
  description: 'Retrieves where-used ("usage references") results for a given ABAP object URI.',
  inputSchema,
  execute: (gateway, args) => gateway.usageReferences(args.system, { objectUri: args.objectUri }),
};

export const usageReferencesTools = [usageReferencesTool];
