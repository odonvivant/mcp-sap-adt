import { z } from 'zod';
import type { Tool } from './Tool';

const createInputSchema = z
  .object({
    system: z.string().min(1),
    collectionPath: z.string().min(1).describe('ADT collection path for this object type, e.g. `oo/classes`.'),
    objectType: z.string().min(1).describe('ADT object type code, e.g. `CLAS/OC`.'),
    name: z.string().min(1),
    description: z.string().optional(),
    targetPackage: z.string().min(1),
    responsible: z.string().optional(),
  })
  .strict();

/** Tier C. Creates a new ABAP object in the target package. */
export const objectCreateTool: Tool<z.infer<typeof createInputSchema>> = {
  name: 'adt_object_create',
  description: 'Creates a new ABAP object of the given type/name in the target package.',
  inputSchema: createInputSchema,
  execute: (gateway, args) =>
    gateway.createObject(args.system, {
      collectionPath: args.collectionPath,
      objectType: args.objectType,
      name: args.name,
      description: args.description,
      targetPackage: args.targetPackage,
      responsible: args.responsible,
    }),
};

const packageScopeField = z
  .string()
  .optional()
  .describe(
    "The object's package, if known - used only for this system's allowPackages/denyPackages guardrail scoping, never sent to SAP.",
  );

const deleteInputSchema = z
  .object({
    system: z.string().min(1),
    objectUri: z.string().min(1),
    lockHandle: z.string().min(1).describe('Lock handle from adt_object_lock.'),
    packageName: packageScopeField,
  })
  .strict();

/** Tier C. Deletes an existing ABAP object; requires a lock handle. */
export const objectDeleteTool: Tool<z.infer<typeof deleteInputSchema>> = {
  name: 'adt_object_delete',
  description: 'Deletes an existing ABAP object. Requires a lock handle obtained via adt_object_lock.',
  inputSchema: deleteInputSchema,
  execute: async (gateway, args) => {
    await gateway.deleteObject(args.system, { objectUri: args.objectUri, lockHandle: args.lockHandle });
    return { success: true };
  },
};

const lockInputSchema = z
  .object({
    system: z.string().min(1),
    objectUri: z.string().min(1),
    packageName: packageScopeField,
  })
  .strict();

/** Tier C. Locks an object for editing, returning a lock handle for write/delete. */
export const objectLockTool: Tool<z.infer<typeof lockInputSchema>> = {
  name: 'adt_object_lock',
  description: 'Locks an object for editing, returning a lock handle usable by source-write and delete.',
  inputSchema: lockInputSchema,
  execute: (gateway, args) => gateway.lockObject(args.system, { objectUri: args.objectUri }),
};

const unlockInputSchema = z
  .object({
    system: z.string().min(1),
    objectUri: z.string().min(1),
    lockHandle: z.string().min(1),
    packageName: packageScopeField,
  })
  .strict();

/** Tier B. Unlocks a previously locked object - releases state rather than creating it; gated
 * more leniently than `lock` so a declined/unsupported confirmation can't strand an enqueue lock
 * and block other developers. */
export const objectUnlockTool: Tool<z.infer<typeof unlockInputSchema>> = {
  name: 'adt_object_unlock',
  description: 'Unlocks a previously locked object.',
  inputSchema: unlockInputSchema,
  execute: async (gateway, args) => {
    await gateway.unlockObject(args.system, { objectUri: args.objectUri, lockHandle: args.lockHandle });
    return { success: true };
  },
};

const activateInputSchema = z
  .object({
    system: z.string().min(1),
    objectUri: z.string().min(1),
    objectName: z.string().min(1),
    packageName: packageScopeField,
  })
  .strict();

/** Tier C. Activates an inactive object; can make it live in the target system. */
export const objectActivateTool: Tool<z.infer<typeof activateInputSchema>> = {
  name: 'adt_object_activate',
  description: 'Activates an inactive ABAP object. Reports activation/syntax errors instead of a false success.',
  inputSchema: activateInputSchema,
  execute: (gateway, args) => gateway.activateObject(args.system, { objectUri: args.objectUri, objectName: args.objectName }),
};

export const objectManagementTools = [
  objectCreateTool,
  objectDeleteTool,
  objectLockTool,
  objectUnlockTool,
  objectActivateTool,
];
