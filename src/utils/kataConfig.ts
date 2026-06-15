import type { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import { KATACONFIG_NAME } from '../k8s/resources';

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
