import {
  k8sCreate,
  k8sPatch,
  useK8sWatchResource,
  type K8sResourceCommon,
} from '@openshift-console/dynamic-plugin-sdk';
import {
  Alert,
  Button,
  Checkbox,
  CodeBlock,
  CodeBlockCode,
  ExpandableSection,
  Form,
  FormGroup,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Radio,
  Spinner,
  TextInput,
} from '@patternfly/react-core';
import { CheckCircleIcon, ExclamationTriangleIcon } from '@patternfly/react-icons';
import type { FC } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MachineConfigGVK,
  MachineConfigModel,
  MachineConfigPoolGVK,
  MachineConfigPoolModel,
  NodeGVK,
  NodeModel,
} from '../k8s/resources';
import type { MachineConfigPoolKind, NodeKind } from '../k8s/types';
import {
  buildTdxHostMachineConfig,
  buildTdxHostMachineConfigPool,
  hasTdxHostArgs,
  TDX_HOST_KERNEL_ARGS,
  TDX_HOST_NODE_ROLE_LABEL,
  TDX_HOST_POOL_ROLE,
  tdxHostNodeLabelPatch,
} from '../utils/machineConfig';
import { findPoolForRole, mcpRolloutState } from '../utils/machineConfigPool';
import './coco.css';

type MachineConfigKind = K8sResourceCommon & {
  metadata?: K8sResourceCommon['metadata'] & { labels?: Record<string, string> };
  spec?: { kernelArguments?: string[] };
};

/** Role label of a MachineConfig (which pool it targets). */
const MC_ROLE_LABEL = 'machineconfiguration.openshift.io/role';
const NODE_ROLE_PREFIX = 'node-role.kubernetes.io/';
const isAlreadyExists = (e: unknown): boolean =>
  /already exists|alreadyexists|conflict|409/i.test(e instanceof Error ? e.message : String(e));

/** Roles a node carries, derived from its node-role.kubernetes.io/* labels. */
const nodeRoles = (node: NodeKind): string[] =>
  Object.keys(node.metadata?.labels ?? {})
    .filter((k) => k.startsWith(NODE_ROLE_PREFIX))
    .map((k) => k.slice(NODE_ROLE_PREFIX.length))
    .filter(Boolean);

const isReady = (node: NodeKind): boolean =>
  (node.status?.conditions ?? []).some((c) => c.type === 'Ready' && c.status === 'True');

/**
 * One-click Intel TDX host activation. TDX must be turned on in the host kernel
 * (`nohibernate` + `kvm_intel.tdx=1`) before Node Feature Discovery can detect it.
 *
 * Two scopes (issue #5 — the old version always rebooted every worker):
 *  - **Specific nodes** (default): creates a custom `tdx-host` MachineConfigPool and
 *    labels only the selected nodes into it, so only those nodes reboot.
 *  - **Whole pool**: applies the MachineConfig to an existing pool by role (e.g.
 *    `worker`, or `master` on a compact cluster) — every node in that pool reboots.
 */
export const EnableTdxHost: FC = () => {
  const { t } = useTranslation('plugin__coco-openshift-console-plugin');

  const [mcs] = useK8sWatchResource<MachineConfigKind[]>({
    groupVersionKind: MachineConfigGVK,
    isList: true,
  });
  const appliedMcs = (mcs ?? []).filter((mc) => hasTdxHostArgs(mc.spec?.kernelArguments));
  const applied = appliedMcs.length > 0;
  // The role(s) the applied TDX-host MachineConfig(s) target, so we can follow the
  // matching pool's rolling reboot instead of declaring success on CR creation.
  const appliedRoles = [
    ...new Set(
      appliedMcs.map((mc) => mc.metadata?.labels?.[MC_ROLE_LABEL]).filter(Boolean) as string[],
    ),
  ];

  const [pools] = useK8sWatchResource<MachineConfigPoolKind[]>({
    groupVersionKind: MachineConfigPoolGVK,
    isList: true,
  });
  const [nodes] = useK8sWatchResource<NodeKind[]>({ groupVersionKind: NodeGVK, isList: true });
  // Only true workers are selectable: the custom pool inherits the *worker* base
  // config, so moving a control-plane node into it would strip its master config.
  const selectableNodes = (nodes ?? [])
    .filter((n) => {
      const roles = nodeRoles(n);
      return (
        roles.includes('worker') && !roles.includes('master') && !roles.includes('control-plane')
      );
    })
    .sort((a, b) => (a.metadata?.name ?? '').localeCompare(b.metadata?.name ?? ''));

  // Aggregate the rollout across every targeted pool: still "updating" until all are
  // Updated; "degraded" if any pool is degraded; "unknown" when we can't match a pool.
  const appliedPools = appliedRoles
    .map((r) => findPoolForRole(pools ?? [], r))
    .filter(Boolean) as MachineConfigPoolKind[];
  const rollouts = appliedPools.map((p) => mcpRolloutState(p));
  const rebootDegraded = rollouts.some((r) => r.phase === 'degraded');
  const rebootInProgress = rollouts.some((r) => r.phase === 'updating');
  const rebootTotal = rollouts.reduce((acc, r) => acc + r.total, 0);
  const rebootUpdated = rollouts.reduce((acc, r) => acc + r.updated, 0);

  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<'nodes' | 'pool'>('nodes');
  const [role, setRole] = useState('worker');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const toggleNode = (name: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(name);
      else next.delete(name);
      return next;
    });
  };

  const nodesMode = scope === 'nodes';
  const selectedNames = selectableNodes
    .map((n) => n.metadata?.name ?? '')
    .filter((n) => selected.has(n));

  // Preview of what gets created/changed, matching what onCreate applies.
  const toCreate = nodesMode
    ? [buildTdxHostMachineConfigPool(), buildTdxHostMachineConfig(TDX_HOST_POOL_ROLE)]
    : [buildTdxHostMachineConfig(role)];

  const onCreate = async () => {
    setBusy(true);
    setError(undefined);
    try {
      if (nodesMode) {
        // 1) Custom pool + 2) its TDX MachineConfig (both before labeling, so each
        //    selected node renders the full config and reboots only once). 3) Label
        //    the selected nodes into the pool. Each step tolerates AlreadyExists so a
        //    re-run only adds newly-selected nodes.
        try {
          await k8sCreate({
            model: MachineConfigPoolModel,
            data: buildTdxHostMachineConfigPool(),
          });
        } catch (e) {
          if (!isAlreadyExists(e)) throw e;
        }
        try {
          await k8sCreate({
            model: MachineConfigModel,
            data: buildTdxHostMachineConfig(TDX_HOST_POOL_ROLE),
          });
        } catch (e) {
          if (!isAlreadyExists(e)) throw e;
        }
        for (const name of selectedNames) {
          await k8sPatch({
            model: NodeModel,
            resource: { metadata: { name } },
            data: tdxHostNodeLabelPatch(),
          });
        }
      } else {
        await k8sCreate({ model: MachineConfigModel, data: buildTdxHostMachineConfig(role) });
      }
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (applied) {
    // The MachineConfig exists, but it only takes effect once the Machine Config
    // Operator has rebooted every node in the target pool. Track that rollout rather
    // than flipping straight to "enabled".
    if (rebootDegraded) {
      return (
        <Label color="red" icon={<ExclamationTriangleIcon />}>
          {t('TDX host rollout degraded — check the MachineConfigPool')}
        </Label>
      );
    }
    if (rebootInProgress) {
      return (
        <Label color="orange" icon={<Spinner size="md" />}>
          {rebootTotal > 0
            ? t('TDX host rollout: rebooting nodes ({{updated}}/{{total}})', {
                updated: rebootUpdated,
                total: rebootTotal,
              })
            : t('TDX host rollout: rebooting nodes…')}
        </Label>
      );
    }
    return (
      <Label color="green" icon={<CheckCircleIcon />}>
        {t('TDX host enabled')}
      </Label>
    );
  }

  const applyDisabled = busy || (nodesMode ? selectedNames.length === 0 : role.trim() === '');

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t('Enable Intel TDX host')}
      </Button>
      {open && (
        <Modal isOpen variant="medium" onClose={() => setOpen(false)}>
          <ModalHeader title={t('Enable Intel TDX host')} />
          <ModalBody>
            <p className="coco-openshift-console-plugin__mb">
              {t(
                'Intel TDX must be activated in the host kernel before Node Feature Discovery can detect it. This adds the required kernel arguments. Use it when a node has TDX enabled in firmware but is not detected as TEE-capable.',
              )}
            </p>
            <Form>
              <FormGroup label={t('Apply to')} fieldId="tdx-scope" role="radiogroup">
                <Radio
                  id="tdx-scope-nodes"
                  name="tdx-scope"
                  label={t('Specific nodes')}
                  description={t(
                    'Create a dedicated tdx-host MachineConfigPool and move only the nodes you pick into it — only those nodes reboot.',
                  )}
                  isChecked={nodesMode}
                  onChange={() => {
                    setScope('nodes');
                  }}
                />
                <Radio
                  id="tdx-scope-pool"
                  name="tdx-scope"
                  label={t('All nodes in a MachineConfigPool')}
                  description={t(
                    'Apply to an existing pool by role (e.g. worker, or master on a compact cluster). Every node in that pool reboots.',
                  )}
                  isChecked={!nodesMode}
                  onChange={() => {
                    setScope('pool');
                  }}
                />
              </FormGroup>

              {nodesMode ? (
                <FormGroup label={t('Nodes')} fieldId="tdx-nodes" isRequired>
                  {selectableNodes.length === 0 ? (
                    <Alert variant="info" isInline title={t('No standalone worker nodes found')}>
                      {t(
                        'This cluster has no dedicated worker nodes (e.g. a 3-node compact cluster where the control-plane is schedulable). Switch to “All nodes in a MachineConfigPool” and target the “master” pool instead.',
                      )}
                    </Alert>
                  ) : (
                    <>
                      <div className="coco-openshift-console-plugin__nodelist">
                        {selectableNodes.map((n) => {
                          const name = n.metadata?.name ?? '';
                          const labels = n.metadata?.labels ?? {};
                          const tdxDetected =
                            labels['intel.feature.node.kubernetes.io/tdx'] === 'true';
                          const alreadyHost = TDX_HOST_NODE_ROLE_LABEL in labels;
                          return (
                            <div key={name} className="coco-openshift-console-plugin__nodelist-row">
                              <Checkbox
                                id={`tdx-node-${name}`}
                                label={name}
                                description={[
                                  nodeRoles(n).join(', ') || t('no roles'),
                                  isReady(n) ? t('Ready') : t('NotReady'),
                                  tdxDetected ? t('TDX detected') : null,
                                  alreadyHost ? t('already a tdx-host') : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                                isChecked={selected.has(name)}
                                onChange={(_e, checked) => {
                                  toggleNode(name, checked);
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <p className="coco-openshift-console-plugin__muted coco-openshift-console-plugin__mt">
                        {t('{{count}} of {{total}} nodes selected.', {
                          count: selectedNames.length,
                          total: selectableNodes.length,
                        })}
                      </p>
                    </>
                  )}
                </FormGroup>
              ) : (
                <FormGroup label={t('MachineConfigPool role')} fieldId="tdx-role">
                  <TextInput
                    id="tdx-role"
                    value={role}
                    onChange={(_e, v) => {
                      setRole(v);
                    }}
                  />
                  <p className="coco-openshift-console-plugin__muted coco-openshift-console-plugin__mt">
                    {t(
                      'The role label of the MachineConfigPool holding your TEE nodes — for example "worker", or a custom pool such as "kata-oc".',
                    )}
                  </p>
                </FormGroup>
              )}

              <FormGroup label={t('Kernel arguments')} fieldId="tdx-args">
                <span className="coco-openshift-console-plugin__mono">
                  {TDX_HOST_KERNEL_ARGS.join('  ')}
                </span>
              </FormGroup>
            </Form>

            <Alert
              variant="warning"
              isInline
              title={t('Nodes will reboot')}
              className="coco-openshift-console-plugin__mt"
            >
              {nodesMode
                ? t(
                    'Applying this reboots only the {{count}} selected node(s), one at a time. Other nodes are untouched.',
                    { count: selectedNames.length },
                  )
                : t(
                    'Applying this MachineConfig rolls out a reboot to every node in the "{{role}}" pool, one at a time.',
                    { role },
                  )}
            </Alert>

            <ExpandableSection
              toggleText={t('Resources to create ({{count}})', { count: toCreate.length })}
              className="coco-openshift-console-plugin__mt"
            >
              <CodeBlock>
                <CodeBlockCode>{JSON.stringify(toCreate, null, 2)}</CodeBlockCode>
              </CodeBlock>
            </ExpandableSection>
            {error && (
              <Alert
                variant="danger"
                isInline
                title={t('Could not enable Intel TDX host')}
                className="coco-openshift-console-plugin__mt"
              >
                {error}
              </Alert>
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              variant="primary"
              onClick={() => void onCreate()}
              isLoading={busy}
              isDisabled={applyDisabled}
            >
              {t('Enable and reboot')}
            </Button>
            <Button variant="link" onClick={() => setOpen(false)}>
              {t('Cancel')}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
};

export default EnableTdxHost;
