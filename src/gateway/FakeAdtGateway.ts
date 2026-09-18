import type { IAdtGateway } from './IAdtGateway';

export interface FakeGatewayCall {
  method: string;
  system: string;
  args: unknown;
}

/**
 * In-memory {@link IAdtGateway} fake for tests (task 2.1) - no `sap-adt-client`/network
 * dependency. Each method records the call and returns the next queued result for that method
 * name (`queueResult`), or throws if none was queued, so a test always states exactly what it
 * expects the gateway to be asked for.
 */
export class FakeAdtGateway implements IAdtGateway {
  readonly calls: FakeGatewayCall[] = [];
  private readonly queues = new Map<string, Array<() => unknown>>();

  /** Queues a value (or a function that throws, e.g. an `AdtError`) as the result of the next
   * call to `method`. */
  queueResult(method: keyof IAdtGateway, factory: () => unknown): this {
    const queue = this.queues.get(method) ?? [];
    queue.push(factory);
    this.queues.set(method, queue);
    return this;
  }

  private invoke(method: string, system: string, args: unknown): Promise<any> {
    this.calls.push({ method, system, args });
    const queue = this.queues.get(method);
    const factory = queue?.shift();
    if (!factory) {
      return Promise.reject(
        new Error(`FakeAdtGateway: no queued result for "${method}" - call queueResult("${method}", ...) first`),
      );
    }
    return Promise.resolve().then(factory);
  }

  discovery(system: string) {
    return this.invoke('discovery', system, undefined);
  }
  search(system: string, args: unknown) {
    return this.invoke('search', system, args);
  }
  readObjectSource(system: string, args: unknown) {
    return this.invoke('readObjectSource', system, args);
  }
  writeObjectSource(system: string, args: unknown) {
    return this.invoke('writeObjectSource', system, args);
  }
  ddicElement(system: string, args: unknown) {
    return this.invoke('ddicElement', system, args);
  }
  ddicTableContents(system: string, args: unknown) {
    return this.invoke('ddicTableContents', system, args);
  }
  usageReferences(system: string, args: unknown) {
    return this.invoke('usageReferences', system, args);
  }
  packageContents(system: string, args: unknown) {
    return this.invoke('packageContents', system, args);
  }
  revisions(system: string, args: unknown) {
    return this.invoke('revisions', system, args);
  }
  transportInfo(system: string, args: unknown) {
    return this.invoke('transportInfo', system, args);
  }
  createTransport(system: string, args: unknown) {
    return this.invoke('createTransport', system, args);
  }
  releaseTransport(system: string, args: unknown) {
    return this.invoke('releaseTransport', system, args);
  }
  createAtcRun(system: string, args: unknown) {
    return this.invoke('createAtcRun', system, args);
  }
  atcWorklist(system: string, args: unknown) {
    return this.invoke('atcWorklist', system, args);
  }
  renamePreview(system: string, args: unknown) {
    return this.invoke('renamePreview', system, args);
  }
  renameExecute(system: string, args: unknown) {
    return this.invoke('renameExecute', system, args);
  }
  runUnitTests(system: string, args: unknown) {
    return this.invoke('runUnitTests', system, args);
  }
  createObject(system: string, args: unknown) {
    return this.invoke('createObject', system, args);
  }
  deleteObject(system: string, args: unknown) {
    return this.invoke('deleteObject', system, args);
  }
  lockObject(system: string, args: unknown) {
    return this.invoke('lockObject', system, args);
  }
  unlockObject(system: string, args: unknown) {
    return this.invoke('unlockObject', system, args);
  }
  activateObject(system: string, args: unknown) {
    return this.invoke('activateObject', system, args);
  }
  debuggerAttach(system: string, args: unknown) {
    return this.invoke('debuggerAttach', system, args);
  }
  debuggerSetBreakpoints(system: string, args: unknown) {
    return this.invoke('debuggerSetBreakpoints', system, args);
  }
  debuggerDeleteBreakpoints(system: string, args: unknown) {
    return this.invoke('debuggerDeleteBreakpoints', system, args);
  }
  debuggerStep(system: string, args: unknown) {
    return this.invoke('debuggerStep', system, args);
  }
  debuggerVariables(system: string, args: unknown) {
    return this.invoke('debuggerVariables', system, args);
  }
  gitRepos(system: string) {
    return this.invoke('gitRepos', system, undefined);
  }
  gitPull(system: string, args: unknown) {
    return this.invoke('gitPull', system, args);
  }
  gitPush(system: string, args: unknown) {
    return this.invoke('gitPush', system, args);
  }
}
