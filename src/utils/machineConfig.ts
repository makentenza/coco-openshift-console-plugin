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
