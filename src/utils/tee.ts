import type { NodeKind, TeeNode, TeeType } from '../k8s/types';

// NFD labels that mark a node's TEE capability.
export const TDX_LABEL = 'intel.feature.node.kubernetes.io/tdx';
export const SNP_LABEL = 'amd.feature.node.kubernetes.io/snp';
export const SGX_LABEL = 'intel.feature.node.kubernetes.io/sgx';
export const SGX_ENABLED_LABEL = 'feature.node.kubernetes.io/cpu-security.sgx.enabled';
// NVIDIA confidential-computing GPU labels (added by the GPU Operator).
export const GPU_CC_MODE_LABEL = 'nvidia.com/cc.mode.state';
export const GPU_CC_READY_LABEL = 'nvidia.com/cc.ready.state';
// Extended resources the Intel SGX device plugin advertises. The QGS (which signs
// Intel TDX quotes inside an SGX enclave) requests enclave + provision; epc comes
// from NFD, so its presence alone does NOT mean the device plugin is installed.
export const SGX_ENCLAVE_RESOURCE = 'sgx.intel.com/enclave';
export const SGX_PROVISION_RESOURCE = 'sgx.intel.com/provision';

export const teeTypeForNode = (node: NodeKind): TeeType => {
  const labels = node.metadata?.labels ?? {};
  if (labels[TDX_LABEL] === 'true') return 'tdx';
  if (labels[SNP_LABEL] === 'true') return 'snp';
  return 'none';
};

export const gpuCcReady = (node: NodeKind): boolean => {
  const labels = node.metadata?.labels ?? {};
  return labels[GPU_CC_MODE_LABEL] === 'on' && labels[GPU_CC_READY_LABEL] === 'true';
};

/** SGX capability detected by NFD — TDX quote generation runs in an SGX enclave. */
export const sgxCapable = (node: NodeKind): boolean => {
  const labels = node.metadata?.labels ?? {};
  return labels[SGX_LABEL] === 'true' || labels[SGX_ENABLED_LABEL] === 'true';
};

/** Is the Intel SGX device plugin advertising the enclave + provision resources? */
export const sgxDevicePluginReady = (node: NodeKind): boolean => {
  const alloc = node.status?.allocatable ?? {};
  const enclave = parseInt(alloc[SGX_ENCLAVE_RESOURCE] ?? '0', 10);
  const provision = parseInt(alloc[SGX_PROVISION_RESOURCE] ?? '0', 10);
  return enclave > 0 && provision > 0;
};

const nodeReady = (node: NodeKind): boolean =>
  (node.status?.conditions ?? []).some((c) => c.type === 'Ready' && c.status === 'True');

export const teeNode = (node: NodeKind): TeeNode => ({
  name: node.metadata?.name ?? '',
  tee: teeTypeForNode(node),
  gpuCcReady: gpuCcReady(node),
  ready: nodeReady(node),
  sgxCapable: sgxCapable(node),
  sgxDevicePlugin: sgxDevicePluginReady(node),
  obj: node,
});

export const teeLabel = (tee: TeeType): string => {
  switch (tee) {
    case 'tdx':
      return 'Intel TDX';
    case 'snp':
      return 'AMD SEV-SNP';
    default:
      return 'None';
  }
};
