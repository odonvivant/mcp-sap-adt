import { z } from 'zod';
import type { Tool } from './Tool';

const inputSchema = z
  .object({
    system: z.string().min(1),
    objectUri: z.string().min(1),
    content: z.string().min(1).describe('Source buffer to check; may be unsaved, ahead of the persisted source.'),
    version: z.string().optional().describe("Version to check against. Default: 'active'."),
  })
  .strict();

/** Tier A. Checks a source buffer for syntax errors against an object URI, without saving or
 * activating it - no state is created despite being a POST. */
export const syntaxCheckTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'adt_syntax_check',
  description: 'Runs a syntax check for a source buffer against an object URI, without saving or activating it.',
  inputSchema,
  execute: (gateway, args) =>
    gateway.syntaxCheck(args.system, { objectUri: args.objectUri, content: args.content, version: args.version }),
};

export const syntaxCheckTools = [syntaxCheckTool];
