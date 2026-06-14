import type { K8sGroupVersionKind, K8sModel } from '@openshift-console/dynamic-plugin-sdk';

// ---------------------------------------------------------------------------
// Confidential Containers (workload cluster) — shares the OSC/Kata data model.
// CoCo is OpenShift sandboxed containers + a TEE: the kata-cc runtime class plus
// per-pod initdata. We reuse the same KataConfig/RuntimeClass objects osc-openshift-console-plugin
// watches and narrow to the confidential runtimes.
// ---------------------------------------------------------------------------
export const RuntimeClassGVK: K8sGroupVersionKind = {
  group: 'node.k8s.io',
  version: 'v1',
  kind: 'RuntimeClass',
};

export const KataConfigGVK: K8sGroupVersionKind = {
  group: 'kataconfiguration.openshift.io',
  version: 'v1',
  kind: 'KataConfig',
};

/** nfd.openshift.io/v1alpha1 NodeFeatureRule — labels nodes with detected TEEs. */
export const NodeFeatureRuleGVK: K8sGroupVersionKind = {
  group: 'nfd.openshift.io',
  version: 'v1alpha1',
  kind: 'NodeFeatureRule',
};

/** nfd.openshift.io/v1 NodeFeatureDiscovery — the NFD operand that scans nodes. */
export const NodeFeatureDiscoveryGVK: K8sGroupVersionKind = {
  group: 'nfd.openshift.io',
  version: 'v1',
  kind: 'NodeFeatureDiscovery',
};

/** config.openshift.io/v1 ClusterVersion — used to derive the NFD operand image tag. */
export const ClusterVersionGVK: K8sGroupVersionKind = {
  group: 'config.openshift.io',
  version: 'v1',
  kind: 'ClusterVersion',
};

/** machineconfiguration.openshift.io/v1 MachineConfig — sets host kernel arguments. */
export const MachineConfigGVK: K8sGroupVersionKind = {
  group: 'machineconfiguration.openshift.io',
  version: 'v1',
  kind: 'MachineConfig',
};

export const NodeFeatureRuleModel: K8sModel = {
  apiGroup: 'nfd.openshift.io',
  apiVersion: 'v1alpha1',
  kind: 'NodeFeatureRule',
  plural: 'nodefeaturerules',
  namespaced: true,
  abbr: 'NFR',
  label: 'NodeFeatureRule',
  labelPlural: 'NodeFeatureRules',
  crd: true,
};

export const NodeFeatureDiscoveryModel: K8sModel = {
  apiGroup: 'nfd.openshift.io',
  apiVersion: 'v1',
  kind: 'NodeFeatureDiscovery',
  plural: 'nodefeaturediscoveries',
  namespaced: true,
  abbr: 'NFD',
  label: 'NodeFeatureDiscovery',
  labelPlural: 'NodeFeatureDiscoveries',
  crd: true,
};

export const MachineConfigModel: K8sModel = {
  apiGroup: 'machineconfiguration.openshift.io',
  apiVersion: 'v1',
  kind: 'MachineConfig',
  plural: 'machineconfigs',
  namespaced: false,
  abbr: 'MC',
  label: 'MachineConfig',
  labelPlural: 'MachineConfigs',
  crd: true,
};

// ---- Core ----
export const PodGVK: K8sGroupVersionKind = { version: 'v1', kind: 'Pod' };
export const DeploymentGVK: K8sGroupVersionKind = {
  group: 'apps',
  version: 'v1',
  kind: 'Deployment',
};
export const DaemonSetGVK: K8sGroupVersionKind = {
  group: 'apps',
  version: 'v1',
  kind: 'DaemonSet',
};
export const ConfigMapGVK: K8sGroupVersionKind = { version: 'v1', kind: 'ConfigMap' };
export const SecretGVK: K8sGroupVersionKind = { version: 'v1', kind: 'Secret' };
export const EventGVK: K8sGroupVersionKind = { version: 'v1', kind: 'Event' };
export const NodeGVK: K8sGroupVersionKind = { version: 'v1', kind: 'Node' };
export const NamespaceGVK: K8sGroupVersionKind = { version: 'v1', kind: 'Namespace' };

/** Minimal K8sModels for create/delete via k8sCreate / k8sDelete. */
export const PodModel: K8sModel = {
  apiVersion: 'v1',
  kind: 'Pod',
  plural: 'pods',
  namespaced: true,
  abbr: 'P',
  label: 'Pod',
  labelPlural: 'Pods',
};

export const DeploymentModel: K8sModel = {
  apiVersion: 'v1',
  apiGroup: 'apps',
  kind: 'Deployment',
  plural: 'deployments',
  namespaced: true,
  abbr: 'D',
  label: 'Deployment',
  labelPlural: 'Deployments',
};

export const ConfigMapModel: K8sModel = {
  apiVersion: 'v1',
  kind: 'ConfigMap',
  plural: 'configmaps',
  namespaced: true,
  abbr: 'CM',
  label: 'ConfigMap',
  labelPlural: 'ConfigMaps',
};

// ---- Well-known names / locations ----
/** Where the OpenShift sandboxed containers operator and its config live. */
export const OSC_NAMESPACE = 'openshift-sandboxed-containers-operator';
/**
 * Configuration ConfigMap that enables confidential containers (data.confidential: "true"),
 * which makes the OSC operator install the kata-cc runtime. The ConfigMap keeps the name
 * "osc-feature-gates" for historical reasons; OSC now calls these "configuration options",
 * not "feature gates" — confidential containers is a supported (GA) option.
 */
export const OSC_FEATURE_GATES_CM = 'osc-feature-gates';
export const KATACONFIG_NAME = 'example-kataconfig';
/** Pod annotation carrying the gzip+base64 initdata for a confidential pod. */
export const CC_INIT_DATA_ANNOTATION = 'io.katacontainers.config.hypervisor.cc_init_data';

// `kind~group~version` reference string for action/flag extensions.
export const KataConfigModelRef = 'kataconfiguration.openshift.io~v1~KataConfig';
