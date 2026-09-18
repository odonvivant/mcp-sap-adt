import { z } from 'zod';
import type { Tool } from './Tool';

const createRunInputSchema = z
  .object({
    system: z.string().min(1),
    checkVariant: z.string().min(1),
    objectUris: z.array(z.string().min(1)).min(1),
  })
  .strict();

/** Tier B. Creates an ATC (ABAP Test Cockpit) check run - the custom-code-quality check central
 * to a migration assessment. Creates an inspectable worklist, doesn't touch source. */
export const atcCreateRunTool: Tool<z.infer<typeof createRunInputSchema>> = {
  name: 'adt_atc_create_run',
  description: 'Creates an ATC (ABAP Test Cockpit) check run for the given check variant and object set.',
  inputSchema: createRunInputSchema,
  execute: (gateway, args) =>
    gateway.createAtcRun(args.system, { checkVariant: args.checkVariant, objectUris: args.objectUris }),
};

const worklistInputSchema = z
  .object({
    system: z.string().min(1),
    worklistId: z.string().min(1),
  })
  .strict();

/** Tier A. Retrieves findings for a completed ATC run's worklist. */
export const atcWorklistTool: Tool<z.infer<typeof worklistInputSchema>> = {
  name: 'adt_atc_worklist',
  description: "Retrieves the findings for a completed ATC run's worklist.",
  inputSchema: worklistInputSchema,
  execute: (gateway, args) => gateway.atcWorklist(args.system, { worklistId: args.worklistId }),
};

export const atcTools = [atcCreateRunTool, atcWorklistTool];
