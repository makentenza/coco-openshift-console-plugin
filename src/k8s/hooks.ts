import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { useMemo } from 'react';
import {
  CC_INIT_DATA_ANNOTATION,
  ConfigMapGVK,
  KataConfigGVK,
  NodeGVK,
  OSC_FEATURE_GATES_CM,
  OSC_NAMESPACE,
  PEER_PODS_CM,
  PodGVK,
  RuntimeClassGVK,
} from './resources';
import type {
  CcClass,
  CcWorkload,
  ConfigMapKind,
  KataConfigKind,
  NodeKind,
  PodKind,
  RuntimeClassKind,
  TeeNode,
} from './types';
import { classForRuntimeClass, isConfidentialClass } from '../utils/runtime';
import { cvmPeerPodsEnabled } from '../utils/topology';
import { teeNode } from '../utils/tee';
import { podDisplayStatus, podRestartCount } from '../utils/status';

export const useRuntimeClasses = (): [RuntimeClassKind[], boolean] => {
  const [data, loaded] = useK8sWatchResource<RuntimeClassKind[]>({
    groupVersionKind: RuntimeClassGVK,
    isList: true,
  });
  return [data ?? [], loaded];
};

/** KataConfig is a cluster-scoped singleton; return the first (and only) one. */
export const useKataConfig = (): [KataConfigKind | undefined, boolean] => {
  const [data, loaded] = useK8sWatchResource<KataConfigKind[]>({
    groupVersionKind: KataConfigGVK,
    isList: true,
  });
  return [data?.[0], loaded];
};

/**
 * Is confidential containers enabled? True when the osc-feature-gates ConfigMap
 * has confidential: "true" (kata-cc), OR when peer-pods on this cluster run as
 * Confidential VMs (peer-pods-cm has CLOUD_PROVIDER and DISABLECVM !== "true").
 */
export const useConfidentialEnabled = (): [boolean | undefined, boolean] => {
  const [cm, loaded, loadError] = useK8sWatchResource<ConfigMapKind>({
    groupVersionKind: ConfigMapGVK,
    namespace: OSC_NAMESPACE,
    name: OSC_FEATURE_GATES_CM,
  });
  const [ppCm, ppLoaded, ppError] = useK8sWatchResource<ConfigMapKind>({
    groupVersionKind: ConfigMapGVK,
    namespace: OSC_NAMESPACE,
    name: PEER_PODS_CM,
  });
  // A named resource that doesn't exist yet 404s: loadError is set but `loaded`
  // never flips true. Treat each watch as settled once it is loaded OR errored, so
  // consumers that gate on the loaded flag don't show a spinner forever when the
  // ConfigMap is absent (it just reads as "not enabled").
  const settled = (loaded || Boolean(loadError)) && (ppLoaded || Boolean(ppError));
  const hasKataCc = cm?.data?.confidential === 'true';
  const hasCvmPeerPods = cvmPeerPodsEnabled(ppCm?.data);
  return [settled ? hasKataCc || hasCvmPeerPods : undefined, settled];
};

export const useNodes = (): [NodeKind[], boolean] => {
  const [data, loaded] = useK8sWatchResource<NodeKind[]>({
    groupVersionKind: NodeGVK,
    isList: true,
  });
  return [data ?? [], loaded];
};

/** Nodes that can host confidential workloads (have a TEE label or CC-ready GPU). */
export const useTeeNodes = (): { teeNodes: TeeNode[]; loaded: boolean } => {
  const [nodes, loaded] = useNodes();
  return useMemo(() => {
    const teeNodes = nodes.map(teeNode).filter((n) => n.tee !== 'none' || n.gpuCcReady);
    return { teeNodes, loaded };
  }, [nodes, loaded]);
};

/**
 * Watch Pods cluster-wide and reduce them to normalized CcWorkload rows, keeping
 * only those on a confidential (kata-cc) RuntimeClass. A confidential workload is
 * the actual TEE guest — the Pod; Deployments are just controllers and are not
 * listed as workloads (a Deployment's guest is its replica Pod, shown here).
 */
export const useConfidentialWorkloads = (): { workloads: CcWorkload[]; loaded: boolean } => {
  const [runtimeClasses, rcLoaded] = useRuntimeClasses();
  const [pods, podsLoaded] = useK8sWatchResource<PodKind[]>({
    groupVersionKind: PodGVK,
    isList: true,
  });
  const [peerPodsCm] = useK8sWatchResource<ConfigMapKind>({
    groupVersionKind: ConfigMapGVK,
    namespace: OSC_NAMESPACE,
    name: PEER_PODS_CM,
  });
  const cvmPeerPods = cvmPeerPodsEnabled(peerPodsCm?.data);

  const confidentialRC = useMemo(() => {
    const map: Record<string, CcClass> = {};
    runtimeClasses.forEach((rc) => {
      const cc = classForRuntimeClass(rc);
      const name = rc.metadata?.name;
      if (name && (isConfidentialClass(cc) || (cvmPeerPods && cc === 'peerpod'))) map[name] = cc;
    });
    return map;
  }, [runtimeClasses, cvmPeerPods]);

  const workloads = useMemo<CcWorkload[]>(() => {
    if (!rcLoaded) return [];
    const rows: CcWorkload[] = [];

    (pods ?? []).forEach((p) => {
      const rc = p.spec?.runtimeClassName;
      if (!rc || !(rc in confidentialRC)) return;
      rows.push({
        uid: p.metadata?.uid ?? `${p.metadata?.namespace}/${p.metadata?.name}`,
        kind: 'Pod',
        name: p.metadata?.name ?? '',
        namespace: p.metadata?.namespace ?? '',
        runtimeClass: rc,
        ccClass: confidentialRC[rc],
        hasInitData: Boolean(p.metadata?.annotations?.[CC_INIT_DATA_ANNOTATION]),
        node: p.spec?.nodeName,
        status: podDisplayStatus(p),
        restarts: podRestartCount(p),
        creationTimestamp: p.metadata?.creationTimestamp,
        obj: p,
      });
    });

    return rows.sort((a, b) =>
      (b.creationTimestamp ?? '').localeCompare(a.creationTimestamp ?? ''),
    );
  }, [pods, confidentialRC, rcLoaded]);

  return { workloads, loaded: rcLoaded && podsLoaded };
};
