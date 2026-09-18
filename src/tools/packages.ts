import { z } from 'zod';
import type { Tool } from './Tool';

const inputSchema = z
  .object({
    system: z.string().min(1),
    packageName: z.string().min(1),
  })
  .strict();

/** Tier A. Lists a package's node hierarchy: the objects/sub-packages it directly contains. */
export const packageContentsTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'adt_package_contents',
  description: "Retrieves a package's node hierarchy: the objects and sub-packages it directly contains.",
  inputSchema,
  execute: (gateway, args) => gateway.packageContents(args.system, { packageName: args.packageName }),
};

export const packagesTools = [packageContentsTool];
