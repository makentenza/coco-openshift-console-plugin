import type { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import type { MachineConfigPoolKind, NodeKind } from '../k8s/types';

/**
 * Kernel arguments that activate the Intel TDX host on a node:
 *  - `nohibernate`     hibernation (S4) is mutually exclusive with TDX; the kernel
 *                      refuses to initialize the TDX module while it is available.
 *  - `kvm_intel.tdx=1` turns TDX on in the kvm_intel module (defaults to off).
 *
 * Both are required: `nohibernate` alone clears the "Hibernation support is enabled"
 * init failure, but KVM still loads with TDX disabled, so NFD reports no
 * `cpu.security.tdx.enabled` and the node is never labeled TEE-capable.
 */
export const TDX_HOST_KERNEL_ARGS = ['nohibernate', 'kvm_intel.tdx=1'];

/** Name of the MachineConfig this plugin creates for a given pool role. */
export const tdxHostMachineConfigName = (role: string): string => `99-${role}-tdx-host`;

/** True when a MachineConfig already carries the TDX host kernel arguments. */
export const hasTdxHostArgs = (kernelArguments?: string[]): boolean =>
  (kernelArguments ?? []).includes('kvm_intel.tdx=1');

/**
 * MachineConfig that activates the Intel TDX host on every node in the
 * MachineConfigPool identified by `role` (e.g. "worker", or a custom pool such
 * as "kata-oc"). Applying it triggers a one-node-at-a-time rolling reboot of the
 * pool. On nodes without TDX support the `kvm_intel.tdx` argument is a no-op.
 */
export const buildTdxHostMachineConfig = (role: string): K8sResourceCommon =>
  ({
    apiVersion: 'machineconfiguration.openshift.io/v1',
    kind: 'MachineConfig',
    metadata: {
      name: tdxHostMachineConfigName(role),
      labels: { 'machineconfiguration.openshift.io/role': role },
    },
    spec: {
      kernelArguments: [...TDX_HOST_KERNEL_ARGS],
    },
  }) as K8sResourceCommon;

// ---------------------------------------------------------------------------
// Targeted TDX-host enablement.
//
// Kernel arguments are applied per MachineConfigPool, not per node: a node belongs
// to exactly one pool (a custom pool whose nodeSelector matches, else `worker`). An
// earlier design created a separate `tdx-host` pool and labeled the selected nodes
// into it — but CoCo/kata nodes already live in a custom pool (`kata-oc`), so that
// put them in TWO custom pools, which the Machine Config Operator refuses ("belongs
// to 2 custom roles") and the whole operator goes Degraded. So instead we apply the
// TDX MachineConfig to the role of the pool each selected node ALREADY belongs to.
// ---------------------------------------------------------------------------

/**
 * The MachineConfigPool role a node currently belongs to: a custom pool whose
 * nodeSelector matches the node's labels (e.g. `kata-oc`), else the default
 * `worker`. TDX kernel args for that node must target this role.
 */
export const poolRoleForNode = (node: NodeKind, pools: MachineConfigPoolKind[]): string => {
  const labels = node.metadata?.labels ?? {};
  for (const p of pools) {
    const name = p.metadata?.name;
    if (!name || name === 'worker' || name === 'master') continue;
    const sel = p.spec?.nodeSelector?.matchLabels ?? {};
    const keys = Object.keys(sel);
    if (keys.length > 0 && keys.every((k) => labels[k] === sel[k])) return name;
  }
  return 'worker';
};

/** Distinct pool roles among a set of nodes — the pools a TDX rollout will reboot. */
export const rolesForNodes = (nodes: NodeKind[], pools: MachineConfigPoolKind[]): string[] =>
  [...new Set(nodes.map((n) => poolRoleForNode(n, pools)))].sort((a, b) => a.localeCompare(b));
