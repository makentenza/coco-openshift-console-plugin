import { k8sPatch, ResourceLink } from '@openshift-console/dynamic-plugin-sdk';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardTitle,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import type { FC } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useKataConfig, useNodes } from '../k8s/hooks';
import { NodeGVK, NodeModel } from '../k8s/resources';
import {
  kataAddNodePatch,
  kataNodeMembership,
  kataSelectionLabels,
  type KataNodeMembership,
} from '../utils/kataConfig';
import { teeLabel, teeNode } from '../utils/tee';
import './coco.css';

const WORKER_ROLE = 'node-role.kubernetes.io/worker';

const MEMBERSHIP_LABEL: Record<
  KataNodeMembership,
  { color: 'green' | 'orange' | 'red' | 'blue' | 'grey'; key: string }
> = {
  installed: { color: 'green', key: 'In kata' },
  installing: { color: 'orange', key: 'Installing' },
  failed: { color: 'red', key: 'Failed' },
  included: { color: 'blue', key: 'Selected' },
  all: { color: 'green', key: 'Included (all workers)' },
  excluded: { color: 'grey', key: 'Not in kata' },
};

/**
 * Day-2 management of which nodes the KataConfig covers. The plugin (and the operator)
 * pick nodes at KataConfig-create time, but a node that joins later — e.g. a bare-metal
 * TEE host added after setup — has no way, from the UI, to be folded into the existing
 * KataConfig. This lists worker nodes with their kata membership and lets you add a
 * not-yet-included node by applying the KataConfig's selection label to it.
 */
export const KataNodesPanel: FC = () => {
  const { t } = useTranslation('plugin__coco-openshift-console-plugin');
  const [kataConfig, kcLoaded] = useKataConfig();
  const [nodes, nodesLoaded] = useNodes();

  const [confirmNode, setConfirmNode] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const selectionLabels = kataSelectionLabels(kataConfig);
  const selectionText = Object.entries(selectionLabels)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');

  const addNode = async (name: string) => {
    setBusy(true);
    setError(undefined);
    try {
      await k8sPatch({
        model: NodeModel,
        resource: { metadata: { name } },
        data: kataAddNodePatch(kataConfig),
      });
      setConfirmNode(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const workers = (nodes ?? [])
    .filter((n) => WORKER_ROLE in (n.metadata?.labels ?? {}))
    .sort((a, b) => (a.metadata?.name ?? '').localeCompare(b.metadata?.name ?? ''));

  return (
    <Card className="coco-openshift-console-plugin__mt">
      <CardTitle>{t('Kata runtime nodes')}</CardTitle>
      <CardBody>
        {!kcLoaded || !nodesLoaded ? null : !kataConfig ? (
          <Alert variant="info" isInline title={t('No KataConfig yet')}>
            {t(
              'Create a KataConfig from the Confidential Containers setup to install the kata-cc runtime, then come back here to add nodes that join later.',
            )}
          </Alert>
        ) : (
          <>
            <p className="coco-openshift-console-plugin__muted coco-openshift-console-plugin__mb">
              {Object.keys(selectionLabels).length === 0
                ? t(
                    'This KataConfig installs kata on every worker node, so nodes that join later are included automatically.',
                  )
                : t(
                    'This KataConfig selects nodes by {{selector}}. A node that joins after setup is only converted once it carries that label — use “Add to KataConfig” to apply it and fold the node in (the node reboots to install the runtime).',
                    { selector: selectionText },
                  )}
            </p>
            {error && (
              <Alert
                variant="danger"
                isInline
                title={t('Could not add the node')}
                className="coco-openshift-console-plugin__mb"
              >
                {error}
              </Alert>
            )}
            <Table aria-label={t('Kata runtime nodes')} variant="compact">
              <Thead>
                <Tr>
                  <Th>{t('Node')}</Th>
                  <Th>{t('TEE')}</Th>
                  <Th>{t('Kata runtime')}</Th>
                  <Th>{t('Action')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {workers.map((n) => {
                  const name = n.metadata?.name ?? '';
                  const labels = n.metadata?.labels ?? {};
                  const membership = kataNodeMembership(name, labels, kataConfig);
                  const tee = teeNode(n).tee;
                  const m = MEMBERSHIP_LABEL[membership];
                  return (
                    <Tr key={name}>
                      <Td dataLabel={t('Node')}>
                        <ResourceLink groupVersionKind={NodeGVK} name={name} />
                      </Td>
                      <Td dataLabel={t('TEE')}>
                        {tee !== 'none' ? (
                          <Label color="blue" isCompact>
                            {teeLabel(tee)}
                          </Label>
                        ) : (
                          <span className="coco-openshift-console-plugin__muted">—</span>
                        )}
                      </Td>
                      <Td dataLabel={t('Kata runtime')}>
                        <Label color={m.color} isCompact>
                          {t(m.key)}
                        </Label>
                      </Td>
                      <Td dataLabel={t('Action')}>
                        {membership === 'excluded' ? (
                          <Button
                            variant="secondary"
                            isInline
                            onClick={() => {
                              setError(undefined);
                              setConfirmNode(name);
                            }}
                          >
                            {t('Add to KataConfig')}
                          </Button>
                        ) : (
                          <span className="coco-openshift-console-plugin__muted">—</span>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </>
        )}
      </CardBody>

      {confirmNode && (
        <Modal
          isOpen
          variant="small"
          onClose={() => {
            setConfirmNode(undefined);
          }}
        >
          <ModalHeader title={t('Add node to KataConfig')} />
          <ModalBody>
            <p className="coco-openshift-console-plugin__mb">
              {t(
                'This labels {{node}} with {{selector}} so the operator installs the kata-cc runtime on it.',
                { node: confirmNode, selector: selectionText },
              )}
            </p>
            <Alert variant="warning" isInline title={t('The node will reboot')}>
              {t('Installing the runtime reconfigures and reboots the node once.')}
            </Alert>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="primary"
              onClick={() => void addNode(confirmNode)}
              isLoading={busy}
              isDisabled={busy}
            >
              {t('Add and reboot')}
            </Button>
            <Button
              variant="link"
              onClick={() => {
                setConfirmNode(undefined);
              }}
            >
              {t('Cancel')}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </Card>
  );
};

export default KataNodesPanel;
