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
  ExpandableSection,
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

// Documented LUKS-in-TEE pattern: a raw-block PVC opened by an init container
// with a Trustee-delivered passphrase. Shown as guidance — advanced/optional.
const LUKS_EXAMPLE = `# 1) Raw-block PVC
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: enc-data }
spec:
  accessModes: [ReadWriteOnce]
  volumeMode: Block
  resources: { requests: { storage: 1Gi } }
---
# 2) In the kata-cc pod/template spec:
spec:
  runtimeClassName: kata-cc
  volumes:
    - name: enc
      persistentVolumeClaim: { claimName: enc-data }
  initContainers:
    - name: luks-open          # formats/opens the LUKS volume using a
      image: <osc-storage-helper>   # passphrase sealed by Trustee (kbs:///...)
      volumeDevices:
        - { name: enc, devicePath: /dev/encblock }
  containers:
    - name: app
      image: <your-image>
      volumeDevices:
        - { name: enc, devicePath: /dev/encblock }`;

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
                  {runtimeClass === 'kata-cc-nvidia-gpu' && (
                    <Alert
                      variant="info"
                      isInline
                      title={t('Confidential GPU prerequisites (Tech Preview)')}
                      className="coco-openshift-console-plugin__mb"
                    >
                      <p className="coco-openshift-console-plugin__mb">
                        {t(
                          'The kata-cc-nvidia-gpu runtime needs the GPU stack enabled on your TEE nodes first (NVIDIA H100, bare metal only):',
                        )}
                      </p>
                      <ul className="coco-openshift-console-plugin__mb">
                        <li>
                          {t('An IOMMU MachineConfig (intel_iommu=on / amd_iommu=on) — reboots nodes.')}
                        </li>
                        <li>
                          {t(
                            'The NVIDIA GPU Operator with a ClusterPolicy enabling ccManager (CC mode on), the kata sandbox device plugin, and vfio-manager.',
                          )}
                        </li>
                        <li>
                          {t(
                            'Nodes labeled nvidia.com/cc.mode.state=on, nvidia.com/cc.ready.state=true, and a TEE label.',
                          )}
                        </li>
                      </ul>
                      <a
                        href="https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/index.html"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t('NVIDIA GPU Operator documentation')}
                      </a>
                    </Alert>
                  )}
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

                  <ExpandableSection
                    toggleText={t('Encrypted block volume (LUKS) — advanced')}
                  >
                    <p className="coco-openshift-console-plugin__muted coco-openshift-console-plugin__mb">
                      {t(
                        'For data-at-use encryption inside the TEE, attach a raw-block volume and open it with LUKS from an init container, using a passphrase that Trustee delivers only after attestation. Add to the pod spec:',
                      )}
                    </p>
                    <CodeBlock>
                      <CodeBlockCode>{LUKS_EXAMPLE}</CodeBlockCode>
                    </CodeBlock>
                  </ExpandableSection>

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
