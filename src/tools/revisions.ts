import { z } from 'zod';
import type { Tool } from './Tool';

const inputSchema = z
  .object({
    system: z.string().min(1),
    objectUri: z.string().min(1),
  })
  .strict();

/** Tier A. Version-history/revision list for an ABAP object URI. */
export const revisionsTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'adt_revisions',
  description: 'Retrieves the version-history/revision list for a given ABAP object URI.',
  inputSchema,
  execute: (gateway, args) => gateway.revisions(args.system, { objectUri: args.objectUri }),
};

export const revisionsTools = [revisionsTool];
