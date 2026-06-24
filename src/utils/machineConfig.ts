import type { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';

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
// Targeted TDX-host enablement (a chosen subset of nodes, not the whole pool).
//
// Applying the TDX MachineConfig to the "worker" pool reboots every worker. To
// limit the blast radius to the nodes the user picks, we create a custom
// MachineConfigPool ("tdx-host") that selects (a) base "worker" MachineConfigs
// plus the "tdx-host" one and (b) only nodes carrying the
// `node-role.kubernetes.io/tdx-host` label. Labeling a node moves it from the
// worker pool into this pool, so only the selected nodes render the TDX config
// and reboot — once.
// ---------------------------------------------------------------------------

/** Role of the custom pool that holds the user-selected TDX hosts. */
export const TDX_HOST_POOL_ROLE = 'tdx-host';
/** Node-role label that places a node into the custom TDX-host pool. */
export const TDX_HOST_NODE_ROLE_LABEL = `node-role.kubernetes.io/${TDX_HOST_POOL_ROLE}`;

/**
 * Custom MachineConfigPool holding only the selected TDX hosts. It inherits the
 * base worker config (so the nodes stay normal workers) and adds the tdx-host
 * MachineConfig; its nodeSelector matches the tdx-host node-role label.
 */
export const buildTdxHostMachineConfigPool = (): K8sResourceCommon =>
  ({
    apiVersion: 'machineconfiguration.openshift.io/v1',
    kind: 'MachineConfigPool',
    metadata: { name: TDX_HOST_POOL_ROLE },
    spec: {
      machineConfigSelector: {
        matchExpressions: [
          {
            key: 'machineconfiguration.openshift.io/role',
            operator: 'In',
            values: ['worker', TDX_HOST_POOL_ROLE],
          },
        ],
      },
      nodeSelector: {
        matchLabels: { [TDX_HOST_NODE_ROLE_LABEL]: '' },
      },
    },
  }) as K8sResourceCommon;

/**
 * JSON Patch (RFC 6902) that adds the tdx-host node-role label to a node, moving
 * it into the custom pool. The label key's '/' is escaped per RFC 6901 ('~' →
 * '~0', '/' → '~1'). Real nodes always have a `metadata.labels` object, so a
 * single `add` on the escaped key creates or replaces just that label.
 */
export const tdxHostNodeLabelPatch = (): { op: 'add'; path: string; value: string }[] => {
  const escaped = TDX_HOST_NODE_ROLE_LABEL.replace(/~/g, '~0').replace(/\//g, '~1');
  return [{ op: 'add', path: `/metadata/labels/${escaped}`, value: '' }];
};
