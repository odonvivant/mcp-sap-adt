import { z } from 'zod';
import type { Tool } from './Tool';

const attachInputSchema = z
  .object({
    system: z.string().min(1),
    debugUser: z.string().min(1),
    terminalId: z.string().min(1),
  })
  .strict();

/** Tier C. Attaches a debug listener to a running system - intrusive on live process execution. */
export const debuggerAttachTool: Tool<z.infer<typeof attachInputSchema>> = {
  name: 'adt_debugger_attach',
  description: 'Attaches a debug listener for the given debug user/terminal, returning a session handle.',
  inputSchema: attachInputSchema,
  execute: (gateway, args) => gateway.debuggerAttach(args.system, { debugUser: args.debugUser, terminalId: args.terminalId }),
};

const breakpointSchema = z.object({ objectUri: z.string().min(1), line: z.number().int().positive() });

const setBreakpointsInputSchema = z
  .object({
    system: z.string().min(1),
    debuggeeId: z.string().min(1),
    breakpoints: z.array(breakpointSchema).min(1),
  })
  .strict();

/** Tier C. Registers breakpoints for an attached debug session. */
export const debuggerSetBreakpointsTool: Tool<z.infer<typeof setBreakpointsInputSchema>> = {
  name: 'adt_debugger_set_breakpoints',
  description: 'Registers breakpoints for an attached debug session.',
  inputSchema: setBreakpointsInputSchema,
  execute: (gateway, args) =>
    gateway.debuggerSetBreakpoints(args.system, { debuggeeId: args.debuggeeId, breakpoints: args.breakpoints }),
};

const deleteBreakpointsInputSchema = z
  .object({
    system: z.string().min(1),
    debuggeeId: z.string().min(1),
    breakpointIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

/** Tier B. Removes previously registered breakpoints - gated more leniently than setting them so
 * cleanup (clearing a breakpoint halting a live user session) is never harder to reach than the
 * action that created it. */
export const debuggerDeleteBreakpointsTool: Tool<z.infer<typeof deleteBreakpointsInputSchema>> = {
  name: 'adt_debugger_delete_breakpoints',
  description: 'Removes previously registered breakpoints from an attached debug session.',
  inputSchema: deleteBreakpointsInputSchema,
  execute: async (gateway, args) => {
    await gateway.debuggerDeleteBreakpoints(args.system, {
      debuggeeId: args.debuggeeId,
      breakpointIds: args.breakpointIds,
    });
    return { success: true };
  },
};

const stepInputSchema = z
  .object({
    system: z.string().min(1),
    debuggeeId: z.string().min(1),
    stepType: z.enum(['stepInto', 'stepOver', 'stepReturn', 'stepContinue']),
  })
  .strict();

/** Tier C. Steps execution of an attached, stopped debug session. */
export const debuggerStepTool: Tool<z.infer<typeof stepInputSchema>> = {
  name: 'adt_debugger_step',
  description: 'Steps execution of an attached, stopped debug session.',
  inputSchema: stepInputSchema,
  execute: async (gateway, args) => {
    await gateway.debuggerStep(args.system, { debuggeeId: args.debuggeeId, stepType: args.stepType });
    return { success: true };
  },
};

const variablesInputSchema = z
  .object({
    system: z.string().min(1),
    debuggeeId: z.string().min(1),
    parentId: z.string().optional(),
  })
  .strict();

/** Tier C. Inspects variables in the current (or a parent) debug scope of an attached, live
 * session - grouped with the rest of the debugger domain since it requires an active attach. */
export const debuggerVariablesTool: Tool<z.infer<typeof variablesInputSchema>> = {
  name: 'adt_debugger_variables',
  description: 'Inspects variables in the current (or a parent) scope of an attached debug session.',
  inputSchema: variablesInputSchema,
  execute: (gateway, args) => gateway.debuggerVariables(args.system, { debuggeeId: args.debuggeeId, parentId: args.parentId }),
};

const setVariableValueInputSchema = z
  .object({
    system: z.string().min(1),
    debuggeeId: z.string().min(1),
    variableName: z.string().min(1),
    value: z.string(),
  })
  .strict();

/** Tier C. Sets the value of a variable in an attached, stopped debug session - modifies live
 * process state, same class as adt_debugger_attach/adt_debugger_step. */
export const debuggerSetVariableValueTool: Tool<z.infer<typeof setVariableValueInputSchema>> = {
  name: 'adt_debugger_set_variable_value',
  description: 'Sets the value of a variable in an attached, stopped debug session.',
  inputSchema: setVariableValueInputSchema,
  execute: async (gateway, args) => {
    await gateway.debuggerSetVariableValue(args.system, {
      debuggeeId: args.debuggeeId,
      variableName: args.variableName,
      value: args.value,
    });
    return { success: true };
  },
};

export const debuggerTools = [
  debuggerAttachTool,
  debuggerSetBreakpointsTool,
  debuggerDeleteBreakpointsTool,
  debuggerStepTool,
  debuggerVariablesTool,
  debuggerSetVariableValueTool,
];
