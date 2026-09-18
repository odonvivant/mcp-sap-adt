import { z } from 'zod';
import type { Tool } from './Tool';

const listInputSchema = z
  .object({
    system: z.string().min(1),
    user: z.string().min(1),
  })
  .strict();

/** Tier A. Lists performance/SQL trace runs recorded for the given user. */
export const tracesListTool: Tool<z.infer<typeof listInputSchema>> = {
  name: 'adt_traces_list',
  description: 'Lists performance/SQL trace runs recorded for the given user.',
  inputSchema: listInputSchema,
  execute: (gateway, args) => gateway.tracesList(args.system, { user: args.user }),
};

const traceUriInputSchema = z
  .object({
    system: z.string().min(1),
    traceUri: z.string().min(1),
  })
  .strict();

/** Tier A. Retrieves a trace's hit list (per-statement/procedure timing breakdown). */
export const tracesHitListTool: Tool<z.infer<typeof traceUriInputSchema>> = {
  name: 'adt_traces_hit_list',
  description: "Retrieves a trace's hit list (per-statement/procedure timing breakdown).",
  inputSchema: traceUriInputSchema,
  execute: (gateway, args) => gateway.tracesHitList(args.system, { traceUri: args.traceUri }),
};

/** Tier A. Retrieves the database-access statements recorded by a trace. */
export const tracesDbAccessTool: Tool<z.infer<typeof traceUriInputSchema>> = {
  name: 'adt_traces_db_access',
  description: 'Retrieves the database-access statements recorded by a trace.',
  inputSchema: traceUriInputSchema,
  execute: (gateway, args) => gateway.tracesDbAccess(args.system, { traceUri: args.traceUri }),
};

const createConfigurationInputSchema = z
  .object({
    system: z.string().min(1),
    processType: z.string().min(1),
    objectType: z.string().min(1),
    description: z.string().optional(),
  })
  .strict();

/** Tier B. Creates a trace configuration (a transient run request) - creates an inspectable,
 * reversible run request, doesn't touch source, same class as adt_atc_create_run. */
export const tracesCreateConfigurationTool: Tool<z.infer<typeof createConfigurationInputSchema>> = {
  name: 'adt_traces_create_configuration',
  description: 'Creates a trace configuration (a transient run request) for a given process/object type.',
  inputSchema: createConfigurationInputSchema,
  execute: (gateway, args) =>
    gateway.tracesCreateConfiguration(args.system, {
      processType: args.processType,
      objectType: args.objectType,
      description: args.description,
    }),
};

const deleteInputSchema = z
  .object({
    system: z.string().min(1),
    uri: z
      .string()
      .min(1)
      .describe('URI of the trace or trace configuration, as returned by adt_traces_list or adt_traces_create_configuration.'),
  })
  .strict();

/** Tier B (not C): deletes a trace or trace configuration created by
 * adt_traces_create_configuration (also Tier B) - mirrors the adt_object_unlock/
 * adt_debugger_delete_breakpoints precedent: cleanup of a Tier B action is never gated harder
 * than the action that created it, or a declined/unsupported confirmation strands a live trace
 * consuming system resources. */
export const tracesDeleteTool: Tool<z.infer<typeof deleteInputSchema>> = {
  name: 'adt_traces_delete',
  description: 'Deletes a trace or trace configuration, identified by its own URI.',
  inputSchema: deleteInputSchema,
  execute: async (gateway, args) => {
    await gateway.tracesDelete(args.system, { uri: args.uri });
    return { success: true };
  },
};

export const tracesTools = [
  tracesListTool,
  tracesHitListTool,
  tracesDbAccessTool,
  tracesCreateConfigurationTool,
  tracesDeleteTool,
];
