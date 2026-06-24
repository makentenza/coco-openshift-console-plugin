import type { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';

// Standard NFD operand namespace and the resources this plugin creates to enable
// TEE detection. Mirrors the CoCo doc, ch. 3.1 "Auto-detecting TEEs".
export const NFD_NAMESPACE = 'openshift-nfd';
export const NFD_INSTANCE_NAME = 'nfd-instance';
export const TEE_NODE_FEATURE_RULE_NAME = 'coco-tee-detection';

// ---- Node Feature Discovery operator (OLM) ----
// The NodeFeatureDiscovery / NodeFeatureRule CRDs only exist once the NFD operator is
// installed, so the TEE-detection wizard can install it first (OwnNamespace operator:
// Namespace + OperatorGroup + Subscription). We watch this CRD to know it is ready.
export const NFD_OPERATOR = 'nfd';
export const NFD_OPERATOR_CHANNEL = 'stable';
export const NFD_OPERATOR_SOURCE = 'redhat-operators';
export const NFD_OPERATOR_SOURCE_NS = 'openshift-marketplace';
/** CRD whose presence means the NFD operator is installed and its API is served. */
export const NFD_CRD = 'nodefeaturediscoveries.nfd.openshift.io';

/** Namespace the NFD operator installs into. */
export const buildNfdNamespace = (namespace: string): K8sResourceCommon => ({
  apiVersion: 'v1',
  kind: 'Namespace',
  metadata: { name: namespace },
});

/** OperatorGroup scoping the (OwnNamespace) NFD operator to its install namespace. */
export const buildNfdOperatorGroup = (namespace: string): K8sResourceCommon =>
  ({
    apiVersion: 'operators.coreos.com/v1',
    kind: 'OperatorGroup',
    metadata: { name: namespace, namespace },
    spec: { targetNamespaces: [namespace] },
  }) as K8sResourceCommon;

/** Subscription that installs the Red Hat NFD operator from redhat-operators. */
export const buildNfdSubscription = (namespace: string): K8sResourceCommon =>
  ({
    apiVersion: 'operators.coreos.com/v1alpha1',
    kind: 'Subscription',
    metadata: { name: NFD_OPERATOR, namespace },
    spec: {
      channel: NFD_OPERATOR_CHANNEL,
      name: NFD_OPERATOR,
      source: NFD_OPERATOR_SOURCE,
      sourceNamespace: NFD_OPERATOR_SOURCE_NS,
      installPlanApproval: 'Automatic',
    },
  }) as K8sResourceCommon;

/** Derive the NFD operand image tag (vX.Y) from a ClusterVersion string like "4.21.19". */
export const nfdOperandImage = (clusterVersion?: string): string => {
  const m = /^(\d+\.\d+)/.exec(clusterVersion ?? '');
  const tag = m ? `v${m[1]}` : 'v4.21';
  return `registry.redhat.io/openshift4/ose-node-feature-discovery-rhel9:${tag}`;
};

/** The NFD operand (master + worker) that scans nodes for hardware features. */
export const buildNodeFeatureDiscovery = (namespace: string, image: string): K8sResourceCommon =>
  ({
    apiVersion: 'nfd.openshift.io/v1',
    kind: 'NodeFeatureDiscovery',
    metadata: { name: NFD_INSTANCE_NAME, namespace },
    spec: {
      operand: { image, imagePullPolicy: 'Always', servicePort: 12000 },
    },
  }) as K8sResourceCommon;

/**
 * Consolidated NodeFeatureRule that labels nodes by TEE capability:
 *   intel.feature.node.kubernetes.io/tdx, amd.feature.node.kubernetes.io/snp,
 *   intel.feature.node.kubernetes.io/sgx, feature.node.kubernetes.io/runtime.kata.
 */
export const buildTeeNodeFeatureRule = (namespace: string): K8sResourceCommon =>
  ({
    apiVersion: 'nfd.openshift.io/v1alpha1',
    kind: 'NodeFeatureRule',
    metadata: { name: TEE_NODE_FEATURE_RULE_NAME, namespace },
    spec: {
      rules: [
        {
          name: 'runtime.kata',
          labels: { 'feature.node.kubernetes.io/runtime.kata': 'true' },
          matchAny: [
            {
              matchFeatures: [
                {
                  feature: 'cpu.cpuid',
                  matchExpressions: { SSE42: { op: 'Exists' }, VMX: { op: 'Exists' } },
                },
                {
                  feature: 'kernel.loadedmodule',
                  matchExpressions: { kvm: { op: 'Exists' }, kvm_intel: { op: 'Exists' } },
                },
              ],
            },
            {
              matchFeatures: [
                {
                  feature: 'cpu.cpuid',
                  matchExpressions: { SSE42: { op: 'Exists' }, SVM: { op: 'Exists' } },
                },
                {
                  feature: 'kernel.loadedmodule',
                  matchExpressions: { kvm: { op: 'Exists' }, kvm_amd: { op: 'Exists' } },
                },
              ],
            },
          ],
        },
        {
          name: 'amd.sev-snp',
          labels: { 'amd.feature.node.kubernetes.io/snp': 'true' },
          extendedResources: { 'sev-snp.amd.com/esids': '@cpu.security.sev.encrypted_state_ids' },
          matchFeatures: [
            { feature: 'cpu.cpuid', matchExpressions: { SVM: { op: 'Exists' } } },
            { feature: 'cpu.security', matchExpressions: { 'sev.snp.enabled': { op: 'Exists' } } },
          ],
        },
        {
          name: 'intel.sgx',
          labels: { 'intel.feature.node.kubernetes.io/sgx': 'true' },
          extendedResources: { 'sgx.intel.com/epc': '@cpu.security.sgx.epc' },
          matchFeatures: [
            {
              feature: 'cpu.cpuid',
              matchExpressions: { SGX: { op: 'Exists' }, SGXLC: { op: 'Exists' } },
            },
            { feature: 'cpu.security', matchExpressions: { 'sgx.enabled': { op: 'IsTrue' } } },
            { feature: 'kernel.config', matchExpressions: { X86_SGX: { op: 'Exists' } } },
          ],
        },
        {
          name: 'intel.tdx',
          labels: { 'intel.feature.node.kubernetes.io/tdx': 'true' },
          extendedResources: { 'tdx.intel.com/keys': '@cpu.security.tdx.total_keys' },
          matchFeatures: [
            { feature: 'cpu.cpuid', matchExpressions: { VMX: { op: 'Exists' } } },
            { feature: 'cpu.security', matchExpressions: { 'tdx.enabled': { op: 'Exists' } } },
          ],
        },
      ],
    },
  }) as K8sResourceCommon;
