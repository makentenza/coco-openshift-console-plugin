import type { CcClass, RuntimeClassKind } from '../k8s/types';

// Confidential runtime classes are product-defined by name; their handlers are
// TEE-specific (e.g. kata-cc -> handler "kata-tdx" on a TDX cluster, "kata-snp"
// on SEV-SNP). We classify by name first, then fall back to handler prefix.
const CONFIDENTIAL_NAMES = new Set(['kata-cc']);
const CONFIDENTIAL_GPU_NAMES = new Set(['kata-cc-nvidia-gpu']);
const CONFIDENTIAL_HANDLER_PREFIXES = ['kata-tdx', 'kata-snp', 'kata-qemu-tdx', 'kata-qemu-snp'];

const hasConfidentialHandler = (handler: string): boolean =>
  CONFIDENTIAL_HANDLER_PREFIXES.some((p) => handler.startsWith(p));

/** Classify a RuntimeClass into a confidential-computing class. */
export const classForRuntimeClass = (rc: RuntimeClassKind): CcClass => {
  const name = rc.metadata?.name ?? '';
  const handler = rc.handler ?? '';
  if (CONFIDENTIAL_GPU_NAMES.has(name) || (name.includes('gpu') && hasConfidentialHandler(handler)))
    return 'confidential-gpu';
  if (CONFIDENTIAL_NAMES.has(name) || hasConfidentialHandler(handler)) return 'confidential';
  if (handler === 'kata-remote') return 'peerpod';
  if (handler.startsWith('kata')) return 'sandbox';
  return 'unknown';
};

export const isConfidentialClass = (c: CcClass): boolean =>
  c === 'confidential' || c === 'confidential-gpu';

/**
 * Is this RuntimeClass confidential? The kata-cc family always is. kata-remote
 * (peer pods) is confidential only when peer-pods on this cluster run as
 * Confidential VMs — pass `cvmPeerPods` (from {@link cvmPeerPodsEnabled}) so cloud
 * deployments recognize kata-remote while plain non-CVM peer pods stay excluded.
 * Keeping this in step with useConfidentialWorkloads is what lets the runtime-class
 * and overview views agree with the workloads/topology views on every platform.
 */
export const isConfidentialRuntimeClass = (rc: RuntimeClassKind, cvmPeerPods = false): boolean => {
  const cc = classForRuntimeClass(rc);
  return isConfidentialClass(cc) || (cvmPeerPods && cc === 'peerpod');
};

export const ccClassLabel = (c: CcClass): string => {
  switch (c) {
    case 'confidential':
      return 'Confidential';
    case 'confidential-gpu':
      return 'Confidential + GPU';
    case 'peerpod':
      return 'Peer pod';
    case 'sandbox':
      return 'Sandbox';
    default:
      return 'Unknown';
  }
};

export const ccClassDescription = (c: CcClass): string => {
  switch (c) {
    case 'confidential':
      return 'Runs in a hardware TEE (Intel TDX / AMD SEV-SNP) via the kata-cc runtime.';
    case 'confidential-gpu':
      return 'Confidential microVM with an attested NVIDIA GPU (kata-cc-nvidia-gpu).';
    case 'peerpod':
      return 'Runs in a dedicated cloud VM on a separate host (kata-remote).';
    case 'sandbox':
      return 'Sandboxed microVM on the worker node, without confidential computing.';
    default:
      return 'Class could not be determined from the RuntimeClass.';
  }
};
