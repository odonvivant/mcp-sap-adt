import type {
  AdtObjectRef,
  AdtCheckMessage,
  discovery,
  objectSource,
  atc,
  unitTest,
  objectManagement,
  debuggerOps,
  git,
  revisions as revisionsOps,
  codeCompletion,
  traces,
} from 'sap-adt-client';

type AdtServiceCollection = discovery.AdtServiceCollection;
type AdtObjectSource = objectSource.AdtObjectSource;
type AtcObjectFindings = atc.AtcObjectFindings;
type UnitTestMethodResult = unitTest.UnitTestMethodResult;
type ActivationResult = objectManagement.ActivationResult;
type DebugVariable = debuggerOps.DebugVariable;
type GitRepo = git.GitRepo;
type AdtRevision = revisionsOps.AdtRevision;
type SourcePosition = codeCompletion.SourcePosition;
type CodeCompletionProposal = codeCompletion.CodeCompletionProposal;
type CodeCompletionElementInfo = codeCompletion.CodeCompletionElementInfo;
type TraceRun = traces.TraceRun;
type TraceHitListEntry = traces.TraceHitListEntry;
type TraceDbAccessEntry = traces.TraceDbAccessEntry;

/**
 * The Dependency Inversion seam every tool module depends on instead of `sap-adt-client`
 * directly (per `design.md` D1) - one method per repo-1 `operations/` family, each taking a
 * `system` alias (resolved internally by the implementation) instead of a raw `AdtConnection`.
 * This is what lets guardrail enforcement and `AdtError` normalization apply uniformly to every
 * tool call from a single place (`ToolRegistry`), with no path that reaches `sap-adt-client`
 * without going through it.
 */
export interface IAdtGateway {
  discovery(system: string): Promise<AdtServiceCollection[]>;
  search(system: string, args: { query: string; objectType?: string; maxResults?: number }): Promise<AdtObjectRef[]>;

  readObjectSource(system: string, args: { objectUri: string }): Promise<AdtObjectSource>;
  writeObjectSource(
    system: string,
    args: { objectUri: string; source: string; lockHandle?: string; etag?: string },
  ): Promise<void>;

  ddicElement(
    system: string,
    args: { name: string; kind?: 'table' | 'structure' | 'cdsView' },
  ): Promise<{ name: string; fields: unknown[] }>;
  ddicTableContents(
    system: string,
    args: { tableName: string; rowLimit?: number; sqlQuery?: string },
  ): Promise<{ columns: string[]; rows: Array<Record<string, string>> }>;

  usageReferences(system: string, args: { objectUri: string }): Promise<AdtObjectRef[]>;
  packageContents(system: string, args: { packageName: string }): Promise<AdtObjectRef[]>;
  revisions(system: string, args: { objectUri: string }): Promise<AdtRevision[]>;

  transportInfo(system: string, args: { transportNumber: string }): Promise<unknown>;
  createTransport(
    system: string,
    args: { description: string; type?: 'K' | 'W' },
  ): Promise<{ transportNumber: string }>;
  releaseTransport(system: string, args: { transportNumber: string }): Promise<void>;

  createAtcRun(
    system: string,
    args: { checkVariant: string; objectUris: string[] },
  ): Promise<{ worklistId: string }>;
  atcWorklist(system: string, args: { worklistId: string }): Promise<AtcObjectFindings[]>;

  /** ADT renames the *identifier at a source position*, not a whole object, so the caller must say
   * which identifier: `objectUri` includes `/source/main` and the line/column range selects it. */
  renamePreview(
    system: string,
    args: { objectUri: string; line: number; startColumn: number; endColumn: number; newName: string },
  ): Promise<{ previewId: string; affectedLocations: unknown[] }>;
  renameExecute(system: string, args: { previewId: string }): Promise<{ changedObjects: string[] }>;

  runUnitTests(system: string, args: { objectUri: string }): Promise<UnitTestMethodResult[]>;

  createObject(
    system: string,
    args: {
      collectionPath: string;
      objectType: string;
      name: string;
      description?: string;
      targetPackage: string;
      responsible?: string;
    },
  ): Promise<{ uri: string }>;
  deleteObject(system: string, args: { objectUri: string; lockHandle: string }): Promise<void>;
  lockObject(system: string, args: { objectUri: string }): Promise<{ lockHandle: string }>;
  unlockObject(system: string, args: { objectUri: string; lockHandle: string }): Promise<void>;
  activateObject(system: string, args: { objectUri: string; objectName: string }): Promise<ActivationResult>;

  debuggerAttach(system: string, args: { debugUser: string; terminalId: string }): Promise<{ debuggeeId: string }>;
  debuggerSetBreakpoints(
    system: string,
    args: { debuggeeId: string; breakpoints: Array<{ objectUri: string; line: number }> },
  ): Promise<{ registered: number }>;
  debuggerDeleteBreakpoints(
    system: string,
    args: { debuggeeId: string; breakpointIds: string[] },
  ): Promise<void>;
  debuggerStep(
    system: string,
    args: { debuggeeId: string; stepType: 'stepInto' | 'stepOver' | 'stepReturn' | 'stepContinue' },
  ): Promise<void>;
  debuggerVariables(system: string, args: { debuggeeId: string; parentId?: string }): Promise<DebugVariable[]>;

  gitRepos(system: string): Promise<GitRepo[]>;
  gitPull(system: string, args: { repositoryKey: string; branch?: string }): Promise<{ objectsChanged: unknown[] }>;
  gitPush(system: string, args: { repositoryKey: string; comment: string }): Promise<{ commitId?: string }>;

  syntaxCheck(
    system: string,
    args: { objectUri: string; content: string; version?: string },
  ): Promise<AdtCheckMessage[]>;

  codeCompletionProposal(system: string, args: SourcePosition): Promise<CodeCompletionProposal[]>;
  codeCompletionElementInfo(system: string, args: SourcePosition): Promise<CodeCompletionElementInfo>;

  tracesList(system: string, args: { user: string }): Promise<TraceRun[]>;
  tracesHitList(system: string, args: { traceUri: string }): Promise<TraceHitListEntry[]>;
  tracesDbAccess(system: string, args: { traceUri: string }): Promise<TraceDbAccessEntry[]>;
  tracesCreateConfiguration(
    system: string,
    args: { processType: string; objectType: string; description?: string },
  ): Promise<{ configurationUri: string }>;
  tracesDelete(system: string, args: { uri: string }): Promise<void>;

  extractMethodPreview(
    system: string,
    args: {
      objectUri: string;
      range: { startLine: number; startColumn: number; endLine: number; endColumn: number };
      methodName: string;
    },
  ): Promise<{ previewId: string; affectedLocations: unknown[] }>;
  extractMethodExecute(system: string, args: { previewId: string }): Promise<{ changedObjects: string[] }>;

  debuggerSetVariableValue(
    system: string,
    args: { debuggeeId: string; variableName: string; value: string },
  ): Promise<void>;
}
