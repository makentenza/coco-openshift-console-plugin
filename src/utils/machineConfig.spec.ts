import type { MachineConfigPoolKind, NodeKind } from '../k8s/types';
import {
  buildTdxHostMachineConfig,
  hasTdxHostArgs,
  poolRoleForNode,
  rolesForNodes,
  TDX_HOST_KERNEL_ARGS,
  tdxHostMachineConfigName,
} from './machineConfig';

interface McShape {
  metadata: { name: string; labels?: Record<string, string> };
  spec: { kernelArguments?: string[] };
}

const node = (name: string, labels: Record<string, string> = {}): NodeKind => ({
  metadata: { name, labels },
});
const workerPool: MachineConfigPoolKind = {
  metadata: { name: 'worker' },
  spec: { nodeSelector: { matchLabels: { 'node-role.kubernetes.io/worker': '' } } },
};
const kataPool: MachineConfigPoolKind = {
  metadata: { name: 'kata-oc' },
  spec: { nodeSelector: { matchLabels: { 'node-role.kubernetes.io/kata-oc': '' } } },
};

describe('tdxHostMachineConfigName', () => {
  it('names the MachineConfig after the pool role', () => {
    expect(tdxHostMachineConfigName('worker')).toBe('99-worker-tdx-host');
    expect(tdxHostMachineConfigName('kata-oc')).toBe('99-kata-oc-tdx-host');
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
    const mc = buildTdxHostMachineConfig('kata-oc') as unknown as McShape;
    expect(mc.metadata.name).toBe('99-kata-oc-tdx-host');
    expect(mc.metadata.labels?.['machineconfiguration.openshift.io/role']).toBe('kata-oc');
    expect(mc.spec.kernelArguments).toEqual(TDX_HOST_KERNEL_ARGS);
  });
});

describe('poolRoleForNode', () => {
  it('returns the custom pool a node belongs to (kata-oc), not worker', () => {
    const n = node('metal', {
      'node-role.kubernetes.io/worker': '',
      'node-role.kubernetes.io/kata-oc': '',
    });
    expect(poolRoleForNode(n, [workerPool, kataPool])).toBe('kata-oc');
  });

  it('falls back to worker when no custom pool matches', () => {
    const n = node('w', { 'node-role.kubernetes.io/worker': '' });
    expect(poolRoleForNode(n, [workerPool, kataPool])).toBe('worker');
  });
});

describe('rolesForNodes', () => {
  it('returns the distinct sorted pool roles', () => {
    const metal = node('metal', {
      'node-role.kubernetes.io/worker': '',
      'node-role.kubernetes.io/kata-oc': '',
    });
    const plain = node('w', { 'node-role.kubernetes.io/worker': '' });
    expect(rolesForNodes([metal, plain], [workerPool, kataPool])).toEqual(['kata-oc', 'worker']);
  });
});
