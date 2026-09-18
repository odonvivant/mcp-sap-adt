import { z } from 'zod';
import type { Tool } from './Tool';

const inputSchema = z
  .object({
    system: z.string().min(1),
    objectUri: z.string().min(1).describe('Object or package URI to run ABAP Unit tests for.'),
  })
  .strict();

/** Tier C. Runs ABAP Unit tests. A test class can be marked DANGEROUS/CRITICAL and legitimately
 * commit DB changes or call remote systems - this executes arbitrary customer ABAP, not just
 * "creates an inspectable run". */
export const unitTestRunTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'adt_unit_test_run',
  description: 'Runs ABAP Unit tests for a given object (or package) URI; returns pass/fail per test method.',
  inputSchema,
  execute: (gateway, args) => gateway.runUnitTests(args.system, { objectUri: args.objectUri }),
};

export const unitTestTools = [unitTestRunTool];
