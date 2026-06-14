import {
  DocumentTitle,
  k8sCreate,
  ListPageHeader,
  type K8sResourceCommon,
} from '@openshift-console/dynamic-plugin-sdk';
import {
  ActionGroup,
  Alert,
  Button,
  Card,
  CardBody,
  CardTitle,
  CodeBlock,
  CodeBlockCode,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Grid,
  GridItem,
  PageSection,
  TextArea,
  TextInput,
} from '@patternfly/react-core';
import type { FC } from 'react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom-v5-compat';
import { useTranslation } from 'react-i18next';
import { CC_INIT_DATA_ANNOTATION, DeploymentModel, PodModel } from '../k8s/resources';
import './coco.css';

type Kind = 'Pod' | 'Deployment';
type RuntimeClass = 'kata-cc' | 'kata-cc-nvidia-gpu';

const CreateConfidentialWorkload: FC = () => {
  const { t } = useTranslation('plugin__coco-openshift-console-plugin');
  const navigate = useNavigate();

  const [kind, setKind] = useState<Kind>('Pod');
  const [name, setName] = useState('coco-workload');
  const [namespace, setNamespace] = useState('default');
  const [image, setImage] = useState('registry.access.redhat.com/ubi9/ubi:latest');
  const [runtimeClass, setRuntimeClass] = useState<RuntimeClass>('kata-cc');
  const [replicas, setReplicas] = useState('1');
  const [command, setCommand] = useState('sleep infinity');
  const [initdata, setInitdata] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const valid = name.trim() !== '' && namespace.trim() !== '' && image.trim() !== '';

  const buildManifest = (initdataValue: string): K8sResourceCommon => {
    const cmd = command.trim() ? command.trim().split(/\s+/) : undefined;
    const container = { name: name.trim(), image: image.trim(), ...(cmd ? { command: cmd } : {}) };
    const annotations = initdataValue ? { [CC_INIT_DATA_ANNOTATION]: initdataValue } : undefined;

    if (kind === 'Pod') {
      return {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          name: name.trim(),
          namespace: namespace.trim(),
          labels: { app: name.trim() },
          ...(annotations ? { annotations } : {}),
        },
        spec: { runtimeClassName: runtimeClass, containers: [container] },
      } as K8sResourceCommon;
    }
    return {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: name.trim(), namespace: namespace.trim() },
      spec: {
        replicas: Number(replicas) || 1,
        selector: { matchLabels: { app: name.trim() } },
        template: {
          metadata: { labels: { app: name.trim() }, ...(annotations ? { annotations } : {}) },
          spec: { runtimeClassName: runtimeClass, containers: [container] },
        },
      },
    } as K8sResourceCommon;
  };

  const trimmedInitdata = initdata.trim();
  const previewInitdata =
    trimmedInitdata.length > 80
      ? `${trimmedInitdata.slice(0, 80)}… (${trimmedInitdata.length} chars)`
      : trimmedInitdata;
  const preview = JSON.stringify(buildManifest(previewInitdata), null, 2);

  const create = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await k8sCreate({
        model: kind === 'Pod' ? PodModel : DeploymentModel,
        data: buildManifest(trimmedInitdata),
      });
      navigate('/confidential-containers/workloads');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DocumentTitle>{t('Create confidential workload')}</DocumentTitle>
      <ListPageHeader title={t('Create confidential workload')} />
      <PageSection>
        <Grid hasGutter>
          <GridItem md={6}>
            <Card>
              <CardTitle>{t('Workload')}</CardTitle>
              <CardBody>
                <Form>
                  <FormGroup label={t('Kind')} fieldId="cw-kind">
                    <FormSelect
                      id="cw-kind"
                      value={kind}
                      onChange={(_e, v) => {
                        setKind(v as Kind);
                      }}
                    >
                      <FormSelectOption value="Pod" label="Pod" />
                      <FormSelectOption value="Deployment" label="Deployment" />
                    </FormSelect>
                  </FormGroup>
                  <FormGroup label={t('Name')} isRequired fieldId="cw-name">
                    <TextInput
                      id="cw-name"
                      value={name}
                      onChange={(_e, v) => {
                        setName(v);
                      }}
                    />
                  </FormGroup>
                  <FormGroup label={t('Namespace')} isRequired fieldId="cw-namespace">
                    <TextInput
                      id="cw-namespace"
                      value={namespace}
                      onChange={(_e, v) => {
                        setNamespace(v);
                      }}
                    />
                  </FormGroup>
                  <FormGroup label={t('Image')} isRequired fieldId="cw-image">
                    <TextInput
                      id="cw-image"
                      value={image}
                      onChange={(_e, v) => {
                        setImage(v);
                      }}
                    />
                  </FormGroup>
                  <FormGroup label={t('Runtime class')} fieldId="cw-rc">
                    <FormSelect
                      id="cw-rc"
                      value={runtimeClass}
                      onChange={(_e, v) => {
                        setRuntimeClass(v as RuntimeClass);
                      }}
                    >
                      <FormSelectOption value="kata-cc" label="kata-cc" />
                      <FormSelectOption value="kata-cc-nvidia-gpu" label="kata-cc-nvidia-gpu" />
                    </FormSelect>
                  </FormGroup>
                  {kind === 'Deployment' && (
                    <FormGroup label={t('Replicas')} fieldId="cw-replicas">
                      <TextInput
                        id="cw-replicas"
                        type="number"
                        value={replicas}
                        onChange={(_e, v) => {
                          setReplicas(v);
                        }}
                      />
                    </FormGroup>
                  )}
                  <FormGroup label={t('Command (optional)')} fieldId="cw-command">
                    <TextInput
                      id="cw-command"
                      value={command}
                      onChange={(_e, v) => {
                        setCommand(v);
                      }}
                    />
                  </FormGroup>
                  <FormGroup
                    label={t('Initdata annotation value (optional)')}
                    fieldId="cw-initdata"
                  >
                    <TextArea
                      id="cw-initdata"
                      value={initdata}
                      onChange={(_e, v) => {
                        setInitdata(v);
                      }}
                      rows={4}
                      placeholder={t('Paste the gzip+base64 value, or generate it first.')}
                    />
                    <p className="coco-openshift-console-plugin__mt">
                      <Link to="/confidential-containers/initdata">
                        {t('Open the initdata builder')}
                      </Link>
                    </p>
                  </FormGroup>

                  {error && (
                    <Alert variant="danger" isInline title={t('Could not create workload')}>
                      {error}
                    </Alert>
                  )}

                  <ActionGroup>
                    <Button
                      variant="primary"
                      onClick={() => void create()}
                      isLoading={busy}
                      isDisabled={busy || !valid}
                    >
                      {t('Create')}
                    </Button>
                    <Button
                      variant="link"
                      onClick={() => {
                        navigate('/confidential-containers/workloads');
                      }}
                    >
                      {t('Cancel')}
                    </Button>
                  </ActionGroup>
                </Form>
              </CardBody>
            </Card>
          </GridItem>

          <GridItem md={6}>
            <Card>
              <CardTitle>{t('Manifest preview')}</CardTitle>
              <CardBody>
                <CodeBlock>
                  <CodeBlockCode>{preview}</CodeBlockCode>
                </CodeBlock>
              </CardBody>
            </Card>
          </GridItem>
        </Grid>
      </PageSection>
    </>
  );
};

export default CreateConfidentialWorkload;
