import { z } from 'zod';
import type { Tool } from './Tool';

const inputSchema = z.object({ system: z.string().min(1) }).strict();

/** Tier A. Lists the ADT service collections a system exposes - a good first call to confirm
 * connectivity and see what's available. */
export const discoveryTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'adt_discovery',
  description: 'Retrieves the ADT discovery document: the service collections the target SAP system exposes.',
  inputSchema,
  execute: (gateway, args) => gateway.discovery(args.system),
};

export const discoveryTools = [discoveryTool];
