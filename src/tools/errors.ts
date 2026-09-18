import { AdtError } from 'sap-adt-client';
import type { GuardrailDenial } from '../guardrails/AdtGuardrail';

export interface ToolTextResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
}

/** Turns a structured `AdtError` into a tool response, per `tools` spec's "ADT failures are
 * normalized into a structured, actionable error" - always the HTTP status, the hint, the SAP
 * message when present, and any parsed syntax errors. Never a bare "request failed". */
export function adtErrorToToolResult(error: AdtError): ToolTextResult {
  const lines = [`ADT request failed (HTTP ${error.httpStatus}).`, error.hint];
  if (error.adtMessage) {
    lines.push(`SAP message: ${error.adtMessage}`);
  }
  if (error.syntaxErrors && error.syntaxErrors.length > 0) {
    lines.push('Check messages:');
    for (const message of error.syntaxErrors) {
      lines.push(`  - [${message.type ?? '?'}] ${message.shortText}`);
    }
  }
  lines.push(`Request: ${error.request.method} ${error.request.path}`);
  return { content: [{ type: 'text', text: lines.join('\n') }], isError: true };
}

/** Turns a guardrail denial into a tool response distinguishable from an `AdtError` (per
 * `tools` spec's "a guardrail denial is distinguishable from an ADT failure") - no ADT request
 * was made, so there is no HTTP status/hint to report, only the denial category and reason. */
export function guardrailDenialToToolResult(denial: GuardrailDenial): ToolTextResult {
  return {
    content: [
      {
        type: 'text',
        text: `Guardrail denied this call [${denial.category}]: ${denial.reason}`,
      },
    ],
    isError: true,
  };
}

/** Fallback for an unexpected (non-`AdtError`) exception - still never a bare "request failed". */
export function unexpectedErrorToToolResult(error: unknown): ToolTextResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text', text: `Unexpected error: ${message}` }], isError: true };
}
