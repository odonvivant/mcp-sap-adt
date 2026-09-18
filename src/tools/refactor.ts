import { z } from 'zod';
import type { Tool } from './Tool';

const previewInputSchema = z
  .object({
    system: z.string().min(1),
    objectUri: z.string().min(1),
    newName: z.string().min(1),
  })
  .strict();

/** Tier B. Previews a rename refactoring's affected locations without applying it. */
export const refactorRenamePreviewTool: Tool<z.infer<typeof previewInputSchema>> = {
  name: 'adt_refactor_rename_preview',
  description: 'Previews a rename refactoring: the affected locations, without applying the change.',
  inputSchema: previewInputSchema,
  execute: (gateway, args) => gateway.renamePreview(args.system, { objectUri: args.objectUri, newName: args.newName }),
};

const executeInputSchema = z
  .object({
    system: z.string().min(1),
    previewId: z.string().min(1).describe('`previewId` returned by adt_refactor_rename_preview.'),
    packageName: z
      .string()
      .optional()
      .describe(
        "The renamed object's package, if known - used only for this system's allowPackages/denyPackages guardrail scoping, never sent to SAP.",
      ),
  })
  .strict();

/** Tier C. Applies a previously previewed rename refactoring across all affected locations. */
export const refactorRenameExecuteTool: Tool<z.infer<typeof executeInputSchema>> = {
  name: 'adt_refactor_rename_execute',
  description: 'Executes a rename refactoring previously previewed via adt_refactor_rename_preview.',
  inputSchema: executeInputSchema,
  execute: (gateway, args) => gateway.renameExecute(args.system, { previewId: args.previewId }),
};

export const refactorTools = [refactorRenamePreviewTool, refactorRenameExecuteTool];
