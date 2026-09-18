import { discoveryTools } from './discovery';
import { searchTools } from './search';
import { objectSourceTools } from './objectSource';
import { ddicTools } from './ddic';
import { usageReferencesTools } from './usageReferences';
import { packagesTools } from './packages';
import { revisionsTools } from './revisions';
import { transportsTools } from './transports';
import { atcTools } from './atc';
import { refactorTools } from './refactor';
import { unitTestTools } from './unitTest';
import { objectManagementTools } from './objectManagement';
import { debuggerTools } from './debuggerTools';
import { gitTools } from './git';
import { syntaxCheckTools } from './syntaxCheck';
import { codeCompletionTools } from './codeCompletion';
import { tracesTools } from './traces';
import type { Tool } from './Tool';

/** The full registered tool inventory, one array per ADT domain (per `tools` spec's "full
 * investigation/mapping tool surface"). `server.ts` registers every one of these with
 * `ToolRegistry`. */
export const allTools: Array<Tool<any, unknown>> = [
  ...discoveryTools,
  ...searchTools,
  ...objectSourceTools,
  ...ddicTools,
  ...usageReferencesTools,
  ...packagesTools,
  ...revisionsTools,
  ...transportsTools,
  ...atcTools,
  ...refactorTools,
  ...unitTestTools,
  ...objectManagementTools,
  ...debuggerTools,
  ...gitTools,
  ...syntaxCheckTools,
  ...codeCompletionTools,
  ...tracesTools,
];
