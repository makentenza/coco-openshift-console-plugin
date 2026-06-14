import type { NodeKind, TeeNode, TeeType } from '../k8s/types';

// NFD labels that mark a node's TEE capability.
export const TDX_LABEL = 'intel.feature.node.kubernetes.io/tdx';
export const SNP_LABEL = 'amd.feature.node.kubernetes.io/snp';
// NVIDIA confidential-computing GPU labels (added by the GPU Operator).
export const GPU_CC_MODE_LABEL = 'nvidia.com/cc.mode.state';
export const GPU_CC_READY_LABEL = 'nvidia.com/cc.ready.state';

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

const nodeReady = (node: NodeKind): boolean =>
  (node.status?.conditions ?? []).some((c) => c.type === 'Ready' && c.status === 'True');

export const teeNode = (node: NodeKind): TeeNode => ({
  name: node.metadata?.name ?? '',
  tee: teeTypeForNode(node),
  gpuCcReady: gpuCcReady(node),
  ready: nodeReady(node),
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
