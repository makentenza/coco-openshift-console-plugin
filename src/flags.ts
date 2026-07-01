import { useEffect } from 'react';
import { useKataConfig, useTeeNodes } from './k8s/hooks';

/** setFeatureFlag callback passed to console.flag/hookProvider handlers. */
type SetFeatureFlag = (flag: string, enabled: boolean) => void;

/**
 * Feature flag: the cluster has — or could have — bare-metal on-node TEE nodes.
 *
 * Confidential containers run in one of two places: a bare-metal node's on-node
 * hardware TEE (runtime class kata-cc), or a cloud Confidential VM via peer pods
 * (runtime class kata-remote). A peer-pods-only cloud cluster never has a
 * TEE-capable node — the TEE belongs to the cloud provider — so the "TEE nodes"
 * navigation item is noise there and is hidden. On bare-metal clusters, and on
 * mixed clusters (cloud peer pods with attached bare-metal TEE nodes), the item
 * stays.
 *
 * Wired as a console.flag/hookProvider so it can watch cluster state. We default to
 * showing on-node TEE UI and only hide once we positively know this is a peer-pods
 * cluster with zero TEE-capable nodes, so the nav never flickers out on bare metal
 * while the watches settle.
 */
export const useCocoFeatureFlags = (setFeatureFlag: SetFeatureFlag): void => {
  const [kataConfig, kcLoaded] = useKataConfig();
  const { teeNodes, loaded: nodesLoaded } = useTeeNodes();
  const peerPodsMode = kataConfig?.spec?.enablePeerPods === true;
  const teeNodeCount = teeNodes.length;

  useEffect(() => {
    if (!kcLoaded) return;
    const hide = peerPodsMode && nodesLoaded && teeNodeCount === 0;
    setFeatureFlag('COCO_ONNODE_TEE', !hide);
  }, [kcLoaded, nodesLoaded, peerPodsMode, teeNodeCount, setFeatureFlag]);
};
