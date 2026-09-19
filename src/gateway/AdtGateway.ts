import {
  discovery,
  search,
  ddic,
  usageReferences,
  packages,
  revisions,
  objectSource,
  transports,
  atc,
  refactor,
  unitTest,
  objectManagement,
  debuggerOps,
  git,
  syntaxCheck,
  codeCompletion,
  traces,
} from 'sap-adt-client';
import { randomUUID } from 'node:crypto';
import type { SystemRegistry } from '../config/SystemRegistry';
import type { IAdtGateway } from './IAdtGateway';

/**
 * A refactoring is a three-step ADT conversation (evaluate -> preview -> execute) where each step
 * must echo the previous step's response back byte-for-byte: it carries server-issued tokens that
 * are rejected if reserialized (see `sap-adt-client`'s `RefactorStepResult`). MCP tool calls are
 * independent request/response pairs, so that blob has to live somewhere between the preview call
 * and the execute call.
 *
 * It is kept here, behind a short opaque handle, rather than returned to the caller: handing a
 * multi-kilobyte XML document to an LLM and trusting it to pass it back unaltered would fail the
 * byte-exactness requirement, and would waste its context for no benefit.
 */
interface StoredPreview {
  system: string;
  preview: refactor.RefactorStepResult;
  storedAt: number;
}

const PREVIEW_TTL_MS = 30 * 60 * 1000;
const MAX_PREVIEWS = 50;

/**
 * The real {@link IAdtGateway} implementation: resolves a `system` alias to its cached
 * {@link SystemRegistry.getConnection} connection and delegates to `sap-adt-client`'s
 * `operations/` functions. Never catches `AdtError` - it propagates to `ToolRegistry`, which is
 * the single place that normalizes it into a tool response.
 */
export class AdtGateway implements IAdtGateway {
  constructor(private readonly systems: SystemRegistry) {}

  private readonly previews = new Map<string, StoredPreview>();

  private storePreview(system: string, preview: refactor.RefactorStepResult): string {
    const now = Date.now();
    for (const [id, entry] of this.previews) {
      if (now - entry.storedAt > PREVIEW_TTL_MS) this.previews.delete(id);
    }
    // Map preserves insertion order, so the first key is the oldest.
    while (this.previews.size >= MAX_PREVIEWS) {
      const oldest = this.previews.keys().next().value;
      if (oldest === undefined) break;
      this.previews.delete(oldest);
    }

    const previewId = randomUUID();
    this.previews.set(previewId, { system, preview, storedAt: now });
    return previewId;
  }

  /** Consumes a stored preview: a preview is valid for exactly one execute. */
  private takePreview(system: string, previewId: string): refactor.RefactorStepResult {
    const entry = this.previews.get(previewId);
    if (!entry) {
      throw new Error(
        `Unknown or expired previewId "${previewId}". Previews are single-use and expire after ${PREVIEW_TTL_MS / 60000} minutes - run the preview step again.`,
      );
    }
    // A preview is bound to the system it was produced against; applying it elsewhere would push
    // one system's refactoring into another.
    if (entry.system !== system) {
      throw new Error(`previewId "${previewId}" belongs to system "${entry.system}", not "${system}".`);
    }
    this.previews.delete(previewId);
    return entry.preview;
  }

  discovery(system: string) {
    return discovery.discovery(this.systems.getConnection(system));
  }

  search(system: string, args: Parameters<IAdtGateway['search']>[1]) {
    return search.search(this.systems.getConnection(system), args);
  }

  readObjectSource(system: string, args: Parameters<IAdtGateway['readObjectSource']>[1]) {
    return objectSource.readSource(this.systems.getConnection(system), args);
  }

  writeObjectSource(system: string, args: Parameters<IAdtGateway['writeObjectSource']>[1]) {
    return objectSource.writeSource(this.systems.getConnection(system), args);
  }

  ddicElement(system: string, args: Parameters<IAdtGateway['ddicElement']>[1]) {
    return ddic.ddicElement(this.systems.getConnection(system), args);
  }

  ddicTableContents(system: string, args: Parameters<IAdtGateway['ddicTableContents']>[1]) {
    return ddic.tableContents(this.systems.getConnection(system), args);
  }

  usageReferences(system: string, args: Parameters<IAdtGateway['usageReferences']>[1]) {
    return usageReferences.usageReferences(this.systems.getConnection(system), args);
  }

  packageContents(system: string, args: Parameters<IAdtGateway['packageContents']>[1]) {
    return packages.packageContents(this.systems.getConnection(system), args);
  }

  revisions(system: string, args: Parameters<IAdtGateway['revisions']>[1]) {
    return revisions.revisions(this.systems.getConnection(system), args);
  }

  transportInfo(system: string, args: Parameters<IAdtGateway['transportInfo']>[1]) {
    return transports.transportInfo(this.systems.getConnection(system), args);
  }

  createTransport(system: string, args: Parameters<IAdtGateway['createTransport']>[1]) {
    return transports.createTransport(this.systems.getConnection(system), args);
  }

  releaseTransport(system: string, args: Parameters<IAdtGateway['releaseTransport']>[1]) {
    return transports.releaseTransport(this.systems.getConnection(system), args);
  }

  createAtcRun(system: string, args: Parameters<IAdtGateway['createAtcRun']>[1]) {
    return atc.createAtcRun(this.systems.getConnection(system), args);
  }

  atcWorklist(system: string, args: Parameters<IAdtGateway['atcWorklist']>[1]) {
    return atc.atcWorklist(this.systems.getConnection(system), args);
  }

  async renamePreview(system: string, args: Parameters<IAdtGateway['renamePreview']>[1]) {
    const connection = this.systems.getConnection(system);
    const evaluation = await refactor.renameEvaluate(connection, {
      uri: args.objectUri,
      line: args.line,
      startColumn: args.startColumn,
      endColumn: args.endColumn,
    });
    const preview = await refactor.renamePreview(connection, { evaluation, newName: args.newName });
    return {
      previewId: this.storePreview(system, preview),
      affectedLocations: preview.affectedObjects,
    };
  }

  async renameExecute(system: string, args: Parameters<IAdtGateway['renameExecute']>[1]) {
    const preview = this.takePreview(system, args.previewId);
    const result = await refactor.renameExecute(this.systems.getConnection(system), { preview });
    return { changedObjects: result.affectedObjects.map((object) => object.uri) };
  }

  runUnitTests(system: string, args: Parameters<IAdtGateway['runUnitTests']>[1]) {
    return unitTest.runUnitTests(this.systems.getConnection(system), args);
  }

  createObject(system: string, args: Parameters<IAdtGateway['createObject']>[1]) {
    return objectManagement.createObject(this.systems.getConnection(system), args);
  }

  deleteObject(system: string, args: Parameters<IAdtGateway['deleteObject']>[1]) {
    return objectManagement.deleteObject(this.systems.getConnection(system), args);
  }

  lockObject(system: string, args: Parameters<IAdtGateway['lockObject']>[1]) {
    return objectManagement.lock(this.systems.getConnection(system), args);
  }

  unlockObject(system: string, args: Parameters<IAdtGateway['unlockObject']>[1]) {
    return objectManagement.unlock(this.systems.getConnection(system), args);
  }

  activateObject(system: string, args: Parameters<IAdtGateway['activateObject']>[1]) {
    return objectManagement.activate(this.systems.getConnection(system), args);
  }

  debuggerAttach(system: string, args: Parameters<IAdtGateway['debuggerAttach']>[1]) {
    return debuggerOps.attach(this.systems.getConnection(system), args);
  }

  debuggerSetBreakpoints(system: string, args: Parameters<IAdtGateway['debuggerSetBreakpoints']>[1]) {
    return debuggerOps.setBreakpoints(this.systems.getConnection(system), args);
  }

  debuggerDeleteBreakpoints(system: string, args: Parameters<IAdtGateway['debuggerDeleteBreakpoints']>[1]) {
    return debuggerOps.deleteBreakpoints(this.systems.getConnection(system), args);
  }

  debuggerStep(system: string, args: Parameters<IAdtGateway['debuggerStep']>[1]) {
    return debuggerOps.step(this.systems.getConnection(system), args);
  }

  debuggerVariables(system: string, args: Parameters<IAdtGateway['debuggerVariables']>[1]) {
    return debuggerOps.variables(this.systems.getConnection(system), args);
  }

  gitRepos(system: string) {
    return git.gitRepos(this.systems.getConnection(system));
  }

  gitPull(system: string, args: Parameters<IAdtGateway['gitPull']>[1]) {
    return git.gitPull(this.systems.getConnection(system), args);
  }

  gitPush(system: string, args: Parameters<IAdtGateway['gitPush']>[1]) {
    return git.gitPush(this.systems.getConnection(system), args);
  }

  syntaxCheck(system: string, args: Parameters<IAdtGateway['syntaxCheck']>[1]) {
    return syntaxCheck.syntaxCheck(this.systems.getConnection(system), args);
  }

  codeCompletionProposal(system: string, args: Parameters<IAdtGateway['codeCompletionProposal']>[1]) {
    return codeCompletion.codeCompletionProposal(this.systems.getConnection(system), args);
  }

  codeCompletionElementInfo(system: string, args: Parameters<IAdtGateway['codeCompletionElementInfo']>[1]) {
    return codeCompletion.codeCompletionElementInfo(this.systems.getConnection(system), args);
  }

  tracesList(system: string, args: Parameters<IAdtGateway['tracesList']>[1]) {
    return traces.tracesList(this.systems.getConnection(system), args);
  }

  tracesHitList(system: string, args: Parameters<IAdtGateway['tracesHitList']>[1]) {
    return traces.tracesHitList(this.systems.getConnection(system), args);
  }

  tracesDbAccess(system: string, args: Parameters<IAdtGateway['tracesDbAccess']>[1]) {
    return traces.tracesDbAccess(this.systems.getConnection(system), args);
  }

  tracesCreateConfiguration(system: string, args: Parameters<IAdtGateway['tracesCreateConfiguration']>[1]) {
    return traces.tracesCreateConfiguration(this.systems.getConnection(system), args);
  }

  tracesDelete(system: string, args: Parameters<IAdtGateway['tracesDelete']>[1]) {
    return traces.tracesDelete(this.systems.getConnection(system), args);
  }

  async extractMethodPreview(system: string, args: Parameters<IAdtGateway['extractMethodPreview']>[1]) {
    const connection = this.systems.getConnection(system);
    const evaluation = await refactor.extractMethodEvaluate(connection, {
      uri: args.objectUri,
      range: args.range,
    });
    const preview = await refactor.extractMethodPreview(connection, {
      evaluation,
      methodName: args.methodName,
    });
    return {
      previewId: this.storePreview(system, preview),
      affectedLocations: preview.affectedObjects,
    };
  }

  async extractMethodExecute(system: string, args: Parameters<IAdtGateway['extractMethodExecute']>[1]) {
    const preview = this.takePreview(system, args.previewId);
    const result = await refactor.extractMethodExecute(this.systems.getConnection(system), { preview });
    return { changedObjects: result.affectedObjects.map((object) => object.uri) };
  }

  debuggerSetVariableValue(system: string, args: Parameters<IAdtGateway['debuggerSetVariableValue']>[1]) {
    return debuggerOps.setVariableValue(this.systems.getConnection(system), args);
  }
}
