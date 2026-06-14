import type { KataConfigKind, PodKind } from '../k8s/types';

/**
 * Console-style display status: surface container waiting/terminated reasons
 * (CrashLoopBackOff, ImagePullBackOff, …) instead of the bare pod phase.
 */
export const podDisplayStatus = (pod: PodKind): string => {
  if (pod.metadata?.deletionTimestamp) return 'Terminating';
  for (const cs of pod.status?.containerStatuses ?? []) {
    const reason = cs.state?.waiting?.reason;
    if (reason) return reason;
  }
  for (const cs of pod.status?.containerStatuses ?? []) {
    const term = cs.state?.terminated;
    if (term && (term.exitCode ?? 0) !== 0) return term.reason ?? 'Error';
  }
  return pod.status?.phase ?? 'Unknown';
};

export const podRestartCount = (pod: PodKind): number =>
  (pod.status?.containerStatuses ?? []).reduce((sum, cs) => sum + (cs.restartCount ?? 0), 0);

export type StatusCategory = 'Healthy' | 'Pending' | 'Error';

const HEALTHY = new Set(['Running', 'Available', 'Succeeded', 'Completed']);
const PENDING = new Set([
  'Pending',
  'Progressing',
  'ContainerCreating',
  'PodInitializing',
  'Terminating',
]);

/** Anything that is neither healthy nor a known transitional state is an error. */
export const statusCategory = (status: string): StatusCategory => {
  if (HEALTHY.has(status)) return 'Healthy';
  if (PENDING.has(status)) return 'Pending';
  return 'Error';
};

export const statusColor = (status: string): 'green' | 'orange' | 'red' => {
  const cat = statusCategory(status);
  return cat === 'Healthy' ? 'green' : cat === 'Pending' ? 'orange' : 'red';
};

// --- KataConfig install state machine (see CoCo doc, ch. 8 "KataConfig status") ---

export type KataState = 'absent' | 'inProgress' | 'installed' | 'failed';

export interface KataInstallSummary {
  state: KataState;
  /** Short human label. */
  label: string;
  /** Optional reason from the InProgress condition (Installing / Uninstalling / Failed …). */
  reason?: string;
  /** readyNodeCount / nodeCount, e.g. "2/3". */
  ready: string;
  failed: string[];
}

export const kataInstallSummary = (kc?: KataConfigKind): KataInstallSummary => {
  if (!kc) {
    return { state: 'absent', label: 'Not installed', ready: '0/0', failed: [] };
  }
  const cond = kc.status?.conditions?.find((c) => c.type === 'InProgress');
  const nodes = kc.status?.kataNodes;
  const ready = `${nodes?.readyNodeCount ?? 0}/${nodes?.nodeCount ?? 0}`;
  const failed = nodes?.failedToInstall ?? [];

  if (failed.length > 0) {
    return { state: 'failed', label: 'Failed', reason: cond?.reason, ready, failed };
  }
  if (cond?.status === 'True') {
    return { state: 'inProgress', label: 'In progress', reason: cond?.reason, ready, failed: [] };
  }
  return { state: 'installed', label: 'Installed', ready, failed: [] };
};
