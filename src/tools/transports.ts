import { z } from 'zod';
import type { Tool } from './Tool';

const infoInputSchema = z
  .object({
    system: z.string().min(1),
    transportNumber: z.string().min(1),
  })
  .strict();

/** Tier A. Reads a transport request's contents: its tasks and the objects each task carries. */
export const transportInfoTool: Tool<z.infer<typeof infoInputSchema>> = {
  name: 'adt_transport_info',
  description: "Reads a transport request's contents: its tasks and the objects each task contains.",
  inputSchema: infoInputSchema,
  execute: (gateway, args) => gateway.transportInfo(args.system, { transportNumber: args.transportNumber }),
};

const createInputSchema = z
  .object({
    system: z.string().min(1),
    description: z.string().min(1),
    targetPackage: z.string().min(1),
  })
  .strict();

/** Tier B. Creates a new transport request/task - creates state, doesn't touch source. */
export const transportCreateTool: Tool<z.infer<typeof createInputSchema>> = {
  name: 'adt_transport_create',
  description: 'Creates a new transport request/task for the given description and target package.',
  inputSchema: createInputSchema,
  execute: (gateway, args) =>
    gateway.createTransport(args.system, { description: args.description, targetPackage: args.targetPackage }),
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
