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
} from 'sap-adt-client';
import type { SystemRegistry } from '../config/SystemRegistry';
import type { IAdtGateway } from './IAdtGateway';

/**
 * The real {@link IAdtGateway} implementation: resolves a `system` alias to its cached
 * {@link SystemRegistry.getConnection} connection and delegates to `sap-adt-client`'s
 * `operations/` functions. Never catches `AdtError` - it propagates to `ToolRegistry`, which is
 * the single place that normalizes it into a tool response.
 */
export class AdtGateway implements IAdtGateway {
  constructor(private readonly systems: SystemRegistry) {}

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

  renamePreview(system: string, args: Parameters<IAdtGateway['renamePreview']>[1]) {
    return refactor.renamePreview(this.systems.getConnection(system), args);
  }

  renameExecute(system: string, args: Parameters<IAdtGateway['renameExecute']>[1]) {
    return refactor.renameExecute(this.systems.getConnection(system), args);
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
}
