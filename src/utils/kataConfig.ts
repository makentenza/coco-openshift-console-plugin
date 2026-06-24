import type { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import { KATACONFIG_NAME } from '../k8s/resources';
import type { KataConfigKind } from '../k8s/types';

/**
 * NFD label `checkNodeEligibility` gates kata installation on. A node carrying it
 * is treated as TEE-capable and converted by the operator; manually adding it is the
 * day-2 way to fold a node in when NFD hasn't (or to force-include one).
 */
export const KATA_ELIGIBILITY_LABEL = 'feature.node.kubernetes.io/runtime.kata';

/**
 * The labels a node must carry to be included in this KataConfig's installation:
 *  - an explicit `kataConfigPoolSelector.matchLabels` if set, else
 *  - the NFD eligibility label when `checkNodeEligibility` is on, else
 *  - none — kata installs on every worker, so there is nothing to add per-node.
 */
export const kataSelectionLabels = (kc?: KataConfigKind): Record<string, string> => {
  const explicit = kc?.spec?.kataConfigPoolSelector?.matchLabels;
  if (explicit && Object.keys(explicit).length > 0) return explicit;
  if (kc?.spec?.checkNodeEligibility) return { [KATA_ELIGIBILITY_LABEL]: 'true' };
  return {};
};

export type KataNodeMembership =
  | 'installed' // converted and ready (status.kataNodes.installed)
  | 'installing' // mid-conversion (installing / waitingToInstall)
  | 'failed' // failedToInstall
  | 'included' // matches the selector — will be converted, not yet in status
  | 'excluded' // a worker not selected — the day-2 "add" candidate
  | 'all'; // no selector — every worker is included automatically

/** Classify a node's kata membership from the KataConfig status + selection labels. */
export const kataNodeMembership = (
  nodeName: string,
  nodeLabels: Record<string, string>,
  kc?: KataConfigKind,
): KataNodeMembership => {
  const kn = kc?.status?.kataNodes;
  if (kn?.installed?.includes(nodeName)) return 'installed';
  if (kn?.installing?.includes(nodeName) || kn?.waitingToInstall?.includes(nodeName))
    return 'installing';
  if (kn?.failedToInstall?.includes(nodeName)) return 'failed';
  const want = kataSelectionLabels(kc);
  if (Object.keys(want).length === 0) return 'all';
  const matches = Object.entries(want).every(([k, v]) => nodeLabels[k] === v);
  return matches ? 'included' : 'excluded';
};

/**
 * JSON Patch (RFC 6902) that adds this KataConfig's selection labels to a node so the
 * operator folds it into the kata install. Label-key '/' is escaped per RFC 6901.
 * Empty when the KataConfig has no per-node selector (all workers already included).
 */
export const kataAddNodePatch = (
  kc?: KataConfigKind,
): { op: 'add'; path: string; value: string }[] =>
  Object.entries(kataSelectionLabels(kc)).map(([k, v]) => ({
    op: 'add',
    path: `/metadata/labels/${k.replace(/~/g, '~0').replace(/\//g, '~1')}`,
    value: v,
  }));

/**
 * KataConfig that installs the kata / kata-cc runtime on the cluster's TEE nodes.
 * Applying it triggers a one-node-at-a-time rolling reboot of the kata-oc pool.
 *  - `enablePeerPods: false` — on-node kata microVMs (the bare-metal TEE case).
 *  - `checkNodeEligibility: true` — only install on nodes NFD has labeled
 *    TEE-capable, so non-TEE workers are left alone.
 * Confidential containers must already be enabled (osc-feature-gates) for the
 * operator to build the confidential `kata-cc` runtime class from this.
 */
export const buildKataConfig = (): K8sResourceCommon =>
  ({
    apiVersion: 'kataconfiguration.openshift.io/v1',
    kind: 'KataConfig',
    metadata: { name: KATACONFIG_NAME },
    spec: {
      enablePeerPods: false,
      checkNodeEligibility: true,
    },
  }) as K8sResourceCommon;
