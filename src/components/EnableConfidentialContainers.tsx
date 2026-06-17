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
  CodeBlockAction,
  CodeBlockCode,
  ExpandableSection,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from '@patternfly/react-core';
import { CheckCircleIcon } from '@patternfly/react-icons';
import type { FC } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTeeNodes } from '../k8s/hooks';
import {
  ConfigMapGVK,
  ConfigMapModel,
  OSC_FEATURE_GATES_CM,
  OSC_NAMESPACE,
} from '../k8s/resources';
import type { TeeNode } from '../k8s/types';
import { buildOscFeatureGatesConfigMap } from '../utils/featureGates';
import { SNP_LABEL, TDX_LABEL, teeLabel } from '../utils/tee';
import './coco.css';

type ConfigMapKind = K8sResourceCommon & { data?: Record<string, string> };

/** NFD label that selects a node's CPU TEE, or null for a GPU-CC-only node. */
const teeNodeLabel = (n: TeeNode): string | null =>
  n.tee === 'tdx' ? TDX_LABEL : n.tee === 'snp' ? SNP_LABEL : null;

/**
 * Build a copy-pasteable pod/template spec fragment that schedules a confidential
 * workload onto the chosen TEE nodes. Confidential containers itself is enabled
 * cluster-wide; placement is per-workload via the runtime class + a node
 * selector. Uses a clean label nodeSelector when the selection is exactly all
 * nodes carrying one TEE label; otherwise pins the nodes explicitly by hostname.
 */
const buildSchedulingSnippet = (selected: TeeNode[], allTee: TeeNode[]): string => {
  const runtimeClass = selected.some((n) => n.gpuCcReady) ? 'kata-cc-nvidia-gpu' : 'kata-cc';

  if (selected.length === 0) {
    return `spec:\n  runtimeClassName: ${runtimeClass}\n  # select at least one node above`;
  }

  const labels = new Set(selected.map(teeNodeLabel));
  const onlyLabel = labels.size === 1 ? [...labels][0] : null;
  const selectedNames = new Set(selected.map((n) => n.name));
  const coversWholeLabel =
    !!onlyLabel &&
    allTee.filter((n) => teeNodeLabel(n) === onlyLabel).every((n) => selectedNames.has(n.name));

  let selectorYaml: string;
  if (onlyLabel && coversWholeLabel) {
    selectorYaml = `  nodeSelector:\n    ${onlyLabel}: "true"`;
  } else {
    const values = selected.map((n) => `            - ${n.name}`).join('\n');
    selectorYaml =
      '  affinity:\n' +
      '    nodeAffinity:\n' +
      '      requiredDuringSchedulingIgnoredDuringExecution:\n' +
      '        nodeSelectorTerms:\n' +
      '        - matchExpressions:\n' +
      '          - key: kubernetes.io/hostname\n' +
      '            operator: In\n' +
      '            values:\n' +
      values;
  }
  return `spec:\n  runtimeClassName: ${runtimeClass}\n${selectorYaml}`;
};

/**
 * One-click confidential-containers enablement: sets `confidential: "true"` on
 * the `osc-feature-gates` ConfigMap (creating it if absent), which makes the
 * OpenShift sandboxed containers operator install the `kata-cc` runtime. The
 * gate is cluster-wide; the node picker only generates a scheduling snippet for
 * placing confidential workloads on specific TEE-capable nodes.
 */
export const EnableConfidentialContainers: FC = () => {
  const { t } = useTranslation('plugin__coco-openshift-console-plugin');

  // Watch the ConfigMap as a LIST, not by name. useK8sWatchResource never flips
  // `loaded` to true for a single *named* resource that does not exist yet, and
  // osc-feature-gates is absent until CoCo is first enabled — which left the
  // enable button (isDisabled={!loaded}) permanently greyed out. A namespaced
  // list loads correctly (empty array when the CM is absent), the same pattern
  // EnableTdxHost uses for MachineConfigs.
  const [cms, loaded] = useK8sWatchResource<ConfigMapKind[]>({
    groupVersionKind: ConfigMapGVK,
    namespace: OSC_NAMESPACE,
    isList: true,
  });
  const cm = loaded ? cms?.find((c) => c.metadata?.name === OSC_FEATURE_GATES_CM) : undefined;
  const enabled = !!cm && cm.data?.confidential === 'true';
  const cmExists = !!cm;

  const { teeNodes, loaded: nodesLoaded } = useTeeNodes();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  // null = "nothing touched yet, default to all"; a Set once the user picks.
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [copied, setCopied] = useState(false);

  const sel = selected ?? new Set(teeNodes.map((n) => n.name));
  const selectedNodes = teeNodes.filter((n) => sel.has(n.name));
  const snippet = buildSchedulingSnippet(selectedNodes, teeNodes);

  const toggleNode = (name: string) => {
    const next = new Set(sel);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelected(next);
  };

  const copySnippet = () => {
    void navigator.clipboard?.writeText(snippet);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 1500);
  };

  const onEnable = async () => {
    setBusy(true);
    setError(undefined);
    try {
      if (cmExists) {
        await k8sPatch({
          model: ConfigMapModel,
          resource: cm,
          data: [
            { op: 'add', path: '/data', value: { ...(cm?.data ?? {}), confidential: 'true' } },
          ],
        });
      } else {
        await k8sCreate({ model: ConfigMapModel, data: buildOscFeatureGatesConfigMap() });
      }
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (enabled) {
    return (
      <Label color="green" icon={<CheckCircleIcon />}>
        {t('Confidential containers enabled')}
      </Label>
    );
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setOpen(true);
        }}
        isDisabled={!loaded}
      >
        {t('Enable confidential containers')}
      </Button>
      {open && (
        <Modal
          isOpen
          variant="medium"
          onClose={() => {
            setOpen(false);
          }}
        >
          <ModalHeader title={t('Enable confidential containers')} />
          <ModalBody>
            <p className="coco-openshift-console-plugin__mb">
              {t(
                'This enables confidential containers in the OpenShift sandboxed containers operator — a supported configuration option. The operator then installs the kata-cc runtime on your TEE nodes.',
              )}
            </p>
            <Alert
              variant="warning"
              isInline
              title={t('Nodes will reboot')}
              className="coco-openshift-console-plugin__mb"
            >
              {t(
                'Installing the kata-cc runtime reconfigures and reboots the sandboxed-containers nodes, one at a time.',
              )}
            </Alert>

            <p className="coco-openshift-console-plugin__mb">
              {t(
                'Confidential containers is enabled cluster-wide. Pick the TEE-capable nodes you intend to run confidential workloads on — placement is per-workload, via the runtime class and a node selector. The snippet below updates as you choose.',
              )}
            </p>
            {!nodesLoaded ? (
              <p className="coco-openshift-console-plugin__muted">{t('Loading nodes…')}</p>
            ) : teeNodes.length === 0 ? (
              <Alert
                variant="info"
                isInline
                title={t('No TEE-capable nodes detected yet')}
                className="coco-openshift-console-plugin__mb"
              >
                {t(
                  'Enable TEE detection and the Intel TDX host first. The snippet below targets any TDX node by label.',
                )}
              </Alert>
            ) : (
              <div
                className="coco-openshift-console-plugin__mb"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  maxHeight: '180px',
                  overflowY: 'auto',
                }}
              >
                {teeNodes.map((n) => (
                  <Checkbox
                    key={n.name}
                    id={`coco-node-${n.name}`}
                    isChecked={sel.has(n.name)}
                    onChange={() => {
                      toggleNode(n.name);
                    }}
                    label={
                      <>
                        <span className="coco-openshift-console-plugin__mono">{n.name}</span>{' '}
                        <Label color="blue" isCompact>
                          {teeLabel(n.tee)}
                        </Label>{' '}
                        {n.gpuCcReady && (
                          <Label color="purple" isCompact>
                            {t('Confidential GPU')}
                          </Label>
                        )}{' '}
                        {!n.ready && (
                          <Label color="orange" isCompact>
                            {t('Not ready')}
                          </Label>
                        )}
                      </>
                    }
                  />
                ))}
              </div>
            )}

            <CodeBlock
              className="coco-openshift-console-plugin__mb"
              actions={
                <CodeBlockAction>
                  <Button variant="link" isInline onClick={copySnippet}>
                    {copied ? t('Copied') : t('Copy')}
                  </Button>
                </CodeBlockAction>
              }
            >
              <CodeBlockCode>{snippet}</CodeBlockCode>
            </CodeBlock>

            <ExpandableSection
              toggleText={t('ConfigMap to apply')}
              className="coco-openshift-console-plugin__mt"
            >
              <CodeBlock>
                <CodeBlockCode>
                  {JSON.stringify(buildOscFeatureGatesConfigMap(), null, 2)}
                </CodeBlockCode>
              </CodeBlock>
            </ExpandableSection>
            {error && (
              <Alert
                variant="danger"
                isInline
                title={t('Could not enable confidential containers')}
                className="coco-openshift-console-plugin__mt"
              >
                {error}
              </Alert>
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              variant="primary"
              onClick={() => void onEnable()}
              isLoading={busy}
              isDisabled={busy || !loaded}
            >
              {t('Enable and reboot')}
            </Button>
            <Button
              variant="link"
              onClick={() => {
                setOpen(false);
              }}
            >
              {t('Cancel')}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
};

export default EnableConfidentialContainers;
