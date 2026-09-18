import { z } from 'zod';
import type { Tool } from './Tool';

const inputSchema = z
  .object({
    system: z.string().min(1),
    objectUri: z.string().min(1),
    source: z.string().describe('Source buffer, addressed by line/column for the cursor position.'),
    line: z.number().int().positive(),
    column: z.number().int().nonnegative(),
  })
  .strict();

/** Tier A. Retrieves code-completion proposals at a cursor position in a source buffer - a
 * transient analysis of the supplied buffer, no state is created or persisted. */
export const codeCompletionProposalTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'adt_code_completion_proposal',
  description: 'Retrieves code-completion proposals at a cursor position in a source buffer.',
  inputSchema,
  execute: (gateway, args) =>
    gateway.codeCompletionProposal(args.system, {
      objectUri: args.objectUri,
      source: args.source,
      line: args.line,
      column: args.column,
    }),
};

/** Tier A. Retrieves documentation/type info for the symbol at a cursor position - same
 * no-side-effect reasoning as {@link codeCompletionProposalTool}. */
export const codeCompletionElementInfoTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'adt_code_completion_element_info',
  description: 'Retrieves documentation/type info for the symbol at a cursor position in a source buffer.',
  inputSchema,
  execute: (gateway, args) =>
    gateway.codeCompletionElementInfo(args.system, {
      objectUri: args.objectUri,
      source: args.source,
      line: args.line,
      column: args.column,
    }),
};

export const codeCompletionTools = [codeCompletionProposalTool, codeCompletionElementInfoTool];
