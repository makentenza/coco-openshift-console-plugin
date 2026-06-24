import type { MachineConfigPoolKind } from '../k8s/types';
import {
  buildTdxHostMachineConfig,
  buildTdxHostMachineConfigPool,
  hasTdxHostArgs,
  TDX_HOST_KERNEL_ARGS,
  TDX_HOST_NODE_ROLE_LABEL,
  TDX_HOST_POOL_ROLE,
  tdxHostMachineConfigName,
  tdxHostNodeLabelPatch,
} from './machineConfig';

interface McShape {
  metadata: { name: string; labels?: Record<string, string> };
  spec: { kernelArguments?: string[] };
}

describe('tdxHostMachineConfigName', () => {
  it('names the MachineConfig after the pool role', () => {
    expect(tdxHostMachineConfigName('worker')).toBe('99-worker-tdx-host');
    expect(tdxHostMachineConfigName(TDX_HOST_POOL_ROLE)).toBe('99-tdx-host-tdx-host');
  });
});

describe('hasTdxHostArgs', () => {
  it('detects the TDX kvm arg', () => {
    expect(hasTdxHostArgs(['nohibernate', 'kvm_intel.tdx=1'])).toBe(true);
    expect(hasTdxHostArgs(['nohibernate'])).toBe(false);
    expect(hasTdxHostArgs(undefined)).toBe(false);
  });
});

describe('buildTdxHostMachineConfig', () => {
  it('carries both kernel args and the role label', () => {
    const mc = buildTdxHostMachineConfig('worker') as unknown as McShape;
    expect(mc.metadata.name).toBe('99-worker-tdx-host');
    expect(mc.metadata.labels?.['machineconfiguration.openshift.io/role']).toBe('worker');
    expect(mc.spec.kernelArguments).toEqual(TDX_HOST_KERNEL_ARGS);
  });
});

describe('buildTdxHostMachineConfigPool', () => {
  const pool = buildTdxHostMachineConfigPool() as unknown as MachineConfigPoolKind;

  it('is named after the tdx-host role', () => {
    expect(pool.metadata?.name).toBe(TDX_HOST_POOL_ROLE);
  });

  it('inherits worker config and adds the tdx-host role', () => {
    const expr = pool.spec?.machineConfigSelector?.matchExpressions?.[0];
    expect(expr?.key).toBe('machineconfiguration.openshift.io/role');
    expect(expr?.operator).toBe('In');
    expect(expr?.values).toEqual(['worker', TDX_HOST_POOL_ROLE]);
  });

  it('selects only nodes carrying the tdx-host node-role label', () => {
    expect(pool.spec?.nodeSelector?.matchLabels).toEqual({ [TDX_HOST_NODE_ROLE_LABEL]: '' });
  });
});

describe('tdxHostNodeLabelPatch', () => {
  it('JSON-Pointer-escapes the "/" in the label key (RFC 6901)', () => {
    expect(tdxHostNodeLabelPatch()).toEqual([
      { op: 'add', path: '/metadata/labels/node-role.kubernetes.io~1tdx-host', value: '' },
    ]);
  });
});
