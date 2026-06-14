import {
  k8sCreate,
  useK8sWatchResource,
  type K8sResourceCommon,
} from '@openshift-console/dynamic-plugin-sdk';
import {
  Alert,
  Button,
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
  TextInput,
} from '@patternfly/react-core';
import { CheckCircleIcon } from '@patternfly/react-icons';
import type { FC } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClusterVersionGVK,
  NodeFeatureDiscoveryGVK,
  NodeFeatureDiscoveryModel,
  NodeFeatureRuleGVK,
  NodeFeatureRuleModel,
} from '../k8s/resources';
import {
  buildNodeFeatureDiscovery,
  buildTeeNodeFeatureRule,
  nfdOperandImage,
  NFD_NAMESPACE,
  TEE_NODE_FEATURE_RULE_NAME,
} from '../utils/nodeFeatureRule';
import './coco.css';

type ClusterVersionKind = K8sResourceCommon & { status?: { desired?: { version?: string } } };

/**
 * One-click TEE detection: creates the NodeFeatureDiscovery operand (if missing)
 * and a consolidated NodeFeatureRule that labels Intel TDX / AMD SEV-SNP nodes.
 */
export const EnableTeeDetection: FC = () => {
  const { t } = useTranslation('plugin__coco-openshift-console-plugin');

  const [rules] = useK8sWatchResource<K8sResourceCommon[]>({
    groupVersionKind: NodeFeatureRuleGVK,
    isList: true,
  });
  const [nfds] = useK8sWatchResource<K8sResourceCommon[]>({
    groupVersionKind: NodeFeatureDiscoveryGVK,
    isList: true,
  });
  const [cv] = useK8sWatchResource<ClusterVersionKind>({
    groupVersionKind: ClusterVersionGVK,
    name: 'version',
  });

  const ruleExists = (rules ?? []).some((r) => r.metadata?.name === TEE_NODE_FEATURE_RULE_NAME);
  const nfdExists = (nfds ?? []).length > 0;

  const [open, setOpen] = useState(false);
  const [namespace, setNamespace] = useState(NFD_NAMESPACE);
  const [image, setImage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const effectiveImage = image || nfdOperandImage(cv?.status?.desired?.version);
  const toCreate = [
    ...(!nfdExists ? [buildNodeFeatureDiscovery(namespace, effectiveImage)] : []),
    buildTeeNodeFeatureRule(namespace),
  ];

  const onCreate = async () => {
    setBusy(true);
    setError(undefined);
    try {
      if (!nfdExists) {
        await k8sCreate({
          model: NodeFeatureDiscoveryModel,
          data: buildNodeFeatureDiscovery(namespace, effectiveImage),
        });
      }
      await k8sCreate({ model: NodeFeatureRuleModel, data: buildTeeNodeFeatureRule(namespace) });
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (ruleExists) {
    return (
      <Label color="green" icon={<CheckCircleIcon />}>
        {t('TEE detection enabled')}
      </Label>
    );
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t('Enable TEE detection')}
      </Button>
      {open && (
        <Modal isOpen variant="medium" onClose={() => setOpen(false)}>
          <ModalHeader title={t('Enable TEE detection')} />
          <ModalBody>
            <p className="coco-openshift-console-plugin__mb">
              {t(
                'This labels nodes that have a Trusted Execution Environment (Intel TDX, AMD SEV-SNP) so confidential workloads can be scheduled on them. The Node Feature Discovery operator does the scanning.',
              )}
            </p>
            {!nfdExists && (
              <Alert
                variant="info"
                isInline
                title={t('No NodeFeatureDiscovery instance found')}
                className="coco-openshift-console-plugin__mb"
              >
                {t('One will be created so NFD actually scans your nodes.')}
              </Alert>
            )}
            <Form>
              <FormGroup label={t('NFD namespace')} fieldId="nfd-ns">
                <TextInput
                  id="nfd-ns"
                  value={namespace}
                  onChange={(_e, v) => {
                    setNamespace(v);
                  }}
                />
              </FormGroup>
              {!nfdExists && (
                <FormGroup label={t('NFD operand image')} fieldId="nfd-image">
                  <TextInput
                    id="nfd-image"
                    value={effectiveImage}
                    onChange={(_e, v) => {
                      setImage(v);
                    }}
                  />
                </FormGroup>
              )}
            </Form>
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
                title={t('Could not enable TEE detection')}
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
              isDisabled={busy}
            >
              {t('Enable')}
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

export default EnableTeeDetection;
