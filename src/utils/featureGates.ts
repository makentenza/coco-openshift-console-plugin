import type { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import { OSC_FEATURE_GATES_CM, OSC_NAMESPACE } from '../k8s/resources';

/**
 * The `osc-feature-gates` ConfigMap that turns on confidential containers. The
 * OpenShift sandboxed containers operator installs the `kata-cc` runtime on the
 * TEE nodes when `data.confidential` is `"true"`.
 */
export const buildOscFeatureGatesConfigMap = (): K8sResourceCommon =>
  ({
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { name: OSC_FEATURE_GATES_CM, namespace: OSC_NAMESPACE },
    data: { confidential: 'true' },
  }) as K8sResourceCommon;
