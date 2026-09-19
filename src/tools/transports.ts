import { z } from 'zod';
import type { Tool } from './Tool';

const infoInputSchema = z
  .object({
    system: z.string().min(1),
    transportNumber: z.string().min(1),
  })
  .strict();

/** Tier A. Reads a transport request's contents: its description/owner/status, every object it
 * carries, and its tasks. */
export const transportInfoTool: Tool<z.infer<typeof infoInputSchema>> = {
  name: 'adt_transport_info',
  description: "Reads a transport request's description, objects, and tasks.",
  inputSchema: infoInputSchema,
  execute: (gateway, args) => gateway.transportInfo(args.system, { transportNumber: args.transportNumber }),
};

const createInputSchema = z
  .object({
    system: z.string().min(1),
    description: z.string().min(1),
    type: z.enum(['K', 'W']).optional().describe("Request type. Default 'K' (Workbench request)."),
  })
  .strict();

/** Tier B. Creates a new transport request - creates state, doesn't touch source. A transport
 * header has no "target package" - only individual objects added to it later carry one. */
export const transportCreateTool: Tool<z.infer<typeof createInputSchema>> = {
  name: 'adt_transport_create',
  description: 'Creates a new transport request for the given description (Workbench request by default).',
  inputSchema: createInputSchema,
  execute: (gateway, args) => gateway.createTransport(args.system, { description: args.description, type: args.type }),
};

const releaseInputSchema = z
  .object({
    system: z.string().min(1),
    transportNumber: z.string().min(1),
  })
  .strict();

/** Tier C. Releases a transport request - production-impacting, irreversible via this API. */
export const transportReleaseTool: Tool<z.infer<typeof releaseInputSchema>> = {
  name: 'adt_transport_release',
  description: 'Releases a transport request. Fails with a structured error if unreleased child tasks remain.',
  inputSchema: releaseInputSchema,
  execute: async (gateway, args) => {
    await gateway.releaseTransport(args.system, { transportNumber: args.transportNumber });
    return { success: true };
  },
};

export const transportsTools = [transportInfoTool, transportCreateTool, transportReleaseTool];
