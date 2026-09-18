import { z } from 'zod';
import type { Tool } from './Tool';

const readInputSchema = z
  .object({
    system: z.string().min(1),
    objectUri: z.string().min(1).describe('ADT object URI, e.g. `/sap/bc/adt/oo/classes/zcl_example`.'),
  })
  .strict();

/** Tier A. Reads an ABAP object's source code and its ETag for a later conditional write. */
export const objectSourceReadTool: Tool<z.infer<typeof readInputSchema>> = {
  name: 'adt_object_source_read',
  description: "Reads an ABAP object's source code, along with an ETag for later conditional writes.",
  inputSchema: readInputSchema,
  execute: (gateway, args) => gateway.readObjectSource(args.system, { objectUri: args.objectUri }),
};

const writeInputSchema = z
  .object({
    system: z.string().min(1),
    objectUri: z.string().min(1),
    source: z.string().describe('Full replacement source code.'),
    lockHandle: z.string().min(1).describe('Lock handle from `adt_object_lock`; required.'),
    etag: z.string().optional().describe('ETag from a prior read, sent as If-Match to avoid clobbering a concurrent edit.'),
    packageName: z
      .string()
      .optional()
      .describe(
        "The object's package, if known - used only for this system's allowPackages/denyPackages guardrail scoping, never sent to SAP.",
      ),
  })
  .strict();

/** Tier C. Overwrites an ABAP object's source code; requires a lock handle from
 * `adt_object_lock`. */
export const objectSourceWriteTool: Tool<z.infer<typeof writeInputSchema>> = {
  name: 'adt_object_source_write',
  description: "Writes (overwrites) an ABAP object's source code. Requires a lock handle obtained via adt_object_lock.",
  inputSchema: writeInputSchema,
  execute: async (gateway, args) => {
    await gateway.writeObjectSource(args.system, {
      objectUri: args.objectUri,
      source: args.source,
      lockHandle: args.lockHandle,
      etag: args.etag,
    });
    return { success: true };
  },
};

export const objectSourceTools = [objectSourceReadTool, objectSourceWriteTool];
