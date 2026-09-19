// One smoke test per registered tool: args validate, and execute() forwards them to the right
// IAdtGateway method with the right shape. Deeper ADT-semantic behavior is already covered by
// sap-adt-client's own operation tests - this only exercises the thin mapping layer in this repo.
import { FakeAdtGateway, type FakeGatewayCall } from '../gateway/FakeAdtGateway';
import type { Tool } from './Tool';
import { allTools } from './index';

function toolByName(name: string): Tool<any, unknown> {
  const tool = allTools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`test setup: tool "${name}" not found in allTools`);
  return tool;
}

interface Case {
  name: string;
  args: Record<string, unknown>;
  gatewayMethod: string;
  expectedGatewayArgs?: unknown;
  resultValue: unknown;
}

const cases: Case[] = [
  { name: 'adt_discovery', args: { system: 'dev' }, gatewayMethod: 'discovery', resultValue: [{ href: '/x' }] },
  {
    name: 'adt_search',
    args: { system: 'dev', query: 'ZCL*' },
    gatewayMethod: 'search',
    expectedGatewayArgs: { query: 'ZCL*', objectType: undefined, maxResults: undefined },
    resultValue: [],
  },
  {
    name: 'adt_object_source_read',
    args: { system: 'dev', objectUri: '/x' },
    gatewayMethod: 'readObjectSource',
    expectedGatewayArgs: { objectUri: '/x' },
    resultValue: { source: 'REPORT.' },
  },
  {
    name: 'adt_object_source_write',
    args: { system: 'dev', objectUri: '/x', source: 'REPORT.', lockHandle: 'L1' },
    gatewayMethod: 'writeObjectSource',
    expectedGatewayArgs: { objectUri: '/x', source: 'REPORT.', lockHandle: 'L1', etag: undefined },
    resultValue: undefined,
  },
  {
    name: 'adt_ddic_element',
    args: { system: 'dev', name: 'SFLIGHT' },
    gatewayMethod: 'ddicElement',
    expectedGatewayArgs: { name: 'SFLIGHT', kind: undefined },
    resultValue: { name: 'SFLIGHT', fields: [] },
  },
  {
    name: 'adt_ddic_table_contents',
    args: { system: 'dev', tableName: 'SFLIGHT' },
    gatewayMethod: 'ddicTableContents',
    expectedGatewayArgs: { tableName: 'SFLIGHT', rowLimit: undefined, sqlQuery: undefined },
    resultValue: { columns: [], rows: [] },
  },
  {
    name: 'adt_usage_references',
    args: { system: 'dev', objectUri: '/x' },
    gatewayMethod: 'usageReferences',
    expectedGatewayArgs: { objectUri: '/x' },
    resultValue: [],
  },
  {
    name: 'adt_package_contents',
    args: { system: 'dev', packageName: 'ZPKG' },
    gatewayMethod: 'packageContents',
    expectedGatewayArgs: { packageName: 'ZPKG' },
    resultValue: [],
  },
  {
    name: 'adt_revisions',
    args: { system: 'dev', objectUri: '/x' },
    gatewayMethod: 'revisions',
    expectedGatewayArgs: { objectUri: '/x' },
    resultValue: [],
  },
  {
    name: 'adt_transport_info',
    args: { system: 'dev', transportNumber: 'DEVK900001' },
    gatewayMethod: 'transportInfo',
    expectedGatewayArgs: { transportNumber: 'DEVK900001' },
    resultValue: { number: 'DEVK900001', tasks: [] },
  },
  {
    name: 'adt_transport_create',
    args: { system: 'dev', description: 'desc' },
    gatewayMethod: 'createTransport',
    expectedGatewayArgs: { description: 'desc', type: undefined },
    resultValue: { transportNumber: 'DEVK900001' },
  },
  {
    name: 'adt_transport_release',
    args: { system: 'dev', transportNumber: 'DEVK900001' },
    gatewayMethod: 'releaseTransport',
    expectedGatewayArgs: { transportNumber: 'DEVK900001' },
    resultValue: undefined,
  },
  {
    name: 'adt_atc_create_run',
    args: { system: 'dev', checkVariant: 'DEFAULT', objectUris: ['/x'] },
    gatewayMethod: 'createAtcRun',
    expectedGatewayArgs: { checkVariant: 'DEFAULT', objectUris: ['/x'] },
    resultValue: { worklistId: 'W1' },
  },
  {
    name: 'adt_atc_worklist',
    args: { system: 'dev', worklistId: 'W1' },
    gatewayMethod: 'atcWorklist',
    expectedGatewayArgs: { worklistId: 'W1' },
    resultValue: [],
  },
  {
    name: 'adt_refactor_rename_preview',
    args: { system: 'dev', objectUri: '/x', newName: 'ZCL_NEW' },
    gatewayMethod: 'renamePreview',
    expectedGatewayArgs: { objectUri: '/x', newName: 'ZCL_NEW' },
    resultValue: { previewId: 'P1', affectedLocations: [] },
  },
  {
    name: 'adt_refactor_rename_execute',
    args: { system: 'dev', previewId: 'P1' },
    gatewayMethod: 'renameExecute',
    expectedGatewayArgs: { previewId: 'P1' },
    resultValue: { changedObjects: [] },
  },
  {
    name: 'adt_unit_test_run',
    args: { system: 'dev', objectUri: '/x' },
    gatewayMethod: 'runUnitTests',
    expectedGatewayArgs: { objectUri: '/x' },
    resultValue: [],
  },
  {
    name: 'adt_object_create',
    args: { system: 'dev', collectionPath: 'oo/classes', objectType: 'CLAS/OC', name: 'ZCL_NEW', targetPackage: 'ZPKG' },
    gatewayMethod: 'createObject',
    expectedGatewayArgs: {
      collectionPath: 'oo/classes',
      objectType: 'CLAS/OC',
      name: 'ZCL_NEW',
      description: undefined,
      targetPackage: 'ZPKG',
      responsible: undefined,
    },
    resultValue: { uri: '/x' },
  },
  {
    name: 'adt_object_delete',
    args: { system: 'dev', objectUri: '/x', lockHandle: 'L1' },
    gatewayMethod: 'deleteObject',
    expectedGatewayArgs: { objectUri: '/x', lockHandle: 'L1' },
    resultValue: undefined,
  },
  {
    name: 'adt_object_lock',
    args: { system: 'dev', objectUri: '/x' },
    gatewayMethod: 'lockObject',
    expectedGatewayArgs: { objectUri: '/x' },
    resultValue: { lockHandle: 'L1' },
  },
  {
    name: 'adt_object_unlock',
    args: { system: 'dev', objectUri: '/x', lockHandle: 'L1' },
    gatewayMethod: 'unlockObject',
    expectedGatewayArgs: { objectUri: '/x', lockHandle: 'L1' },
    resultValue: undefined,
  },
  {
    name: 'adt_object_activate',
    args: { system: 'dev', objectUri: '/x', objectName: 'ZCL_X' },
    gatewayMethod: 'activateObject',
    expectedGatewayArgs: { objectUri: '/x', objectName: 'ZCL_X' },
    resultValue: { success: true },
  },
  {
    name: 'adt_debugger_attach',
    args: { system: 'dev', debugUser: 'DEVUSER', terminalId: 'T1' },
    gatewayMethod: 'debuggerAttach',
    expectedGatewayArgs: { debugUser: 'DEVUSER', terminalId: 'T1' },
    resultValue: { debuggeeId: 'D1' },
  },
  {
    name: 'adt_debugger_set_breakpoints',
    args: { system: 'dev', debuggeeId: 'D1', breakpoints: [{ objectUri: '/x', line: 10 }] },
    gatewayMethod: 'debuggerSetBreakpoints',
    expectedGatewayArgs: { debuggeeId: 'D1', breakpoints: [{ objectUri: '/x', line: 10 }] },
    resultValue: { registered: 1 },
  },
  {
    name: 'adt_debugger_delete_breakpoints',
    args: { system: 'dev', debuggeeId: 'D1', breakpointIds: ['B1'] },
    gatewayMethod: 'debuggerDeleteBreakpoints',
    expectedGatewayArgs: { debuggeeId: 'D1', breakpointIds: ['B1'] },
    resultValue: undefined,
  },
  {
    name: 'adt_debugger_step',
    args: { system: 'dev', debuggeeId: 'D1', stepType: 'stepOver' },
    gatewayMethod: 'debuggerStep',
    expectedGatewayArgs: { debuggeeId: 'D1', stepType: 'stepOver' },
    resultValue: undefined,
  },
  {
    name: 'adt_debugger_variables',
    args: { system: 'dev', debuggeeId: 'D1' },
    gatewayMethod: 'debuggerVariables',
    expectedGatewayArgs: { debuggeeId: 'D1', parentId: undefined },
    resultValue: [],
  },
  { name: 'adt_git_repos', args: { system: 'dev' }, gatewayMethod: 'gitRepos', resultValue: [] },
  {
    name: 'adt_git_pull',
    args: { system: 'dev', repositoryKey: 'K1' },
    gatewayMethod: 'gitPull',
    expectedGatewayArgs: { repositoryKey: 'K1', branch: undefined },
    resultValue: { objectsChanged: [] },
  },
  {
    name: 'adt_git_push',
    args: { system: 'dev', repositoryKey: 'K1', comment: 'msg' },
    gatewayMethod: 'gitPush',
    expectedGatewayArgs: { repositoryKey: 'K1', comment: 'msg' },
    resultValue: { commitId: 'C1' },
  },
  {
    name: 'adt_syntax_check',
    args: { system: 'dev', objectUri: '/x', content: 'REPORT.' },
    gatewayMethod: 'syntaxCheck',
    expectedGatewayArgs: { objectUri: '/x', content: 'REPORT.', version: undefined },
    resultValue: [],
  },
  {
    name: 'adt_code_completion_proposal',
    args: { system: 'dev', objectUri: '/x', source: 'REPORT.', line: 1, column: 0 },
    gatewayMethod: 'codeCompletionProposal',
    expectedGatewayArgs: { objectUri: '/x', source: 'REPORT.', line: 1, column: 0 },
    resultValue: [],
  },
  {
    name: 'adt_code_completion_element_info',
    args: { system: 'dev', objectUri: '/x', source: 'REPORT.', line: 1, column: 0 },
    gatewayMethod: 'codeCompletionElementInfo',
    expectedGatewayArgs: { objectUri: '/x', source: 'REPORT.', line: 1, column: 0 },
    resultValue: { name: 'FOO' },
  },
  {
    name: 'adt_traces_list',
    args: { system: 'dev', user: 'DEVUSER' },
    gatewayMethod: 'tracesList',
    expectedGatewayArgs: { user: 'DEVUSER' },
    resultValue: [],
  },
  {
    name: 'adt_traces_hit_list',
    args: { system: 'dev', traceUri: '/traces/T1' },
    gatewayMethod: 'tracesHitList',
    expectedGatewayArgs: { traceUri: '/traces/T1' },
    resultValue: [],
  },
  {
    name: 'adt_traces_db_access',
    args: { system: 'dev', traceUri: '/traces/T1' },
    gatewayMethod: 'tracesDbAccess',
    expectedGatewayArgs: { traceUri: '/traces/T1' },
    resultValue: [],
  },
  {
    name: 'adt_traces_create_configuration',
    args: { system: 'dev', processType: 'UICALLBACK', objectType: 'CLAS' },
    gatewayMethod: 'tracesCreateConfiguration',
    expectedGatewayArgs: { processType: 'UICALLBACK', objectType: 'CLAS', description: undefined },
    resultValue: { configurationUri: '/traces/config/1' },
  },
  {
    name: 'adt_traces_delete',
    args: { system: 'dev', uri: '/traces/T1' },
    gatewayMethod: 'tracesDelete',
    expectedGatewayArgs: { uri: '/traces/T1' },
    resultValue: undefined,
  },
  {
    name: 'adt_refactor_extract_method_preview',
    args: { system: 'dev', objectUri: '/x', startLine: 1, startColumn: 0, endLine: 2, endColumn: 5, methodName: 'GET_FOO' },
    gatewayMethod: 'extractMethodPreview',
    expectedGatewayArgs: {
      objectUri: '/x',
      range: { startLine: 1, startColumn: 0, endLine: 2, endColumn: 5 },
      methodName: 'GET_FOO',
    },
    resultValue: { previewId: 'P1', affectedLocations: [] },
  },
  {
    name: 'adt_refactor_extract_method_execute',
    args: { system: 'dev', previewId: 'P1' },
    gatewayMethod: 'extractMethodExecute',
    expectedGatewayArgs: { previewId: 'P1' },
    resultValue: { changedObjects: [] },
  },
  {
    name: 'adt_debugger_set_variable_value',
    args: { system: 'dev', debuggeeId: 'D1', variableName: 'LV_FOO', value: "'BAR'" },
    gatewayMethod: 'debuggerSetVariableValue',
    expectedGatewayArgs: { debuggeeId: 'D1', variableName: 'LV_FOO', value: "'BAR'" },
    resultValue: undefined,
  },
];

describe('tool module smoke tests (args validated, forwarded to IAdtGateway)', () => {
  it('covers every registered tool exactly once', () => {
    expect(cases.map((c) => c.name).sort()).toEqual(allTools.map((t) => t.name).sort());
  });

  it.each(cases)('$name validates args and forwards them to gateway.$gatewayMethod', async (testCase) => {
    const tool = toolByName(testCase.name);
    const gateway = new FakeAdtGateway();
    gateway.queueResult(testCase.gatewayMethod as never, () => testCase.resultValue);

    const parsed = tool.inputSchema.parse(testCase.args);
    const result = await tool.execute(gateway, parsed);

    expect(gateway.calls).toHaveLength(1);
    const call = gateway.calls[0] as FakeGatewayCall;
    expect(call.method).toBe(testCase.gatewayMethod);
    expect(call.system).toBe('dev');
    if (testCase.expectedGatewayArgs !== undefined) {
      expect(call.args).toEqual(testCase.expectedGatewayArgs);
    }
    if (testCase.resultValue !== undefined) {
      expect(result).toEqual(
        testCase.gatewayMethod === 'writeObjectSource' ||
          testCase.gatewayMethod === 'releaseTransport' ||
          testCase.gatewayMethod === 'deleteObject' ||
          testCase.gatewayMethod === 'unlockObject' ||
          testCase.gatewayMethod === 'debuggerDeleteBreakpoints' ||
          testCase.gatewayMethod === 'debuggerStep' ||
          testCase.gatewayMethod === 'tracesDelete' ||
          testCase.gatewayMethod === 'debuggerSetVariableValue'
          ? { success: true }
          : testCase.resultValue,
      );
    }
  });

  it('rejects a call missing the required "system" field for every tool', () => {
    for (const tool of allTools) {
      expect(() => tool.inputSchema.parse({})).toThrow();
    }
  });
});
