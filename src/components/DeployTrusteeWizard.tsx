import { DocumentTitle, k8sCreate, ListPageHeader } from '@openshift-console/dynamic-plugin-sdk';
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
  TextInput,
} from '@patternfly/react-core';
import type { FC } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom-v5-compat';
import { useTranslation } from 'react-i18next';
import { TRUSTEE_NAMESPACE, TrusteeConfigModel } from '../k8s/resources';
import type { TrusteeConfigKind } from '../k8s/types';
import './coco.css';

type ProfileType = 'Permissive' | 'Restricted';
type ServiceType = 'ClusterIP' | 'NodePort' | 'LoadBalancer';

const DeployTrusteeWizard: FC = () => {
  const { t } = useTranslation('plugin__coco-openshift-console-plugin');
  const navigate = useNavigate();

  const [name, setName] = useState('trustee-config');
  const [namespace, setNamespace] = useState(TRUSTEE_NAMESPACE);
  const [profileType, setProfileType] = useState<ProfileType>('Permissive');
  const [serviceType, setServiceType] = useState<ServiceType>('ClusterIP');
  const [httpsSecret, setHttpsSecret] = useState('');
  const [tokenSecret, setTokenSecret] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const restricted = profileType === 'Restricted';
  const httpsRequiredMissing = restricted && httpsSecret.trim() === '';
  const valid = name.trim() !== '' && namespace.trim() !== '' && !httpsRequiredMissing;

  const buildSpec = (): TrusteeConfigKind['spec'] => ({
    profileType,
    kbsServiceType: serviceType,
    ...(httpsSecret.trim() ? { httpsSpec: { tlsSecretName: httpsSecret.trim() } } : {}),
    ...(tokenSecret.trim()
      ? { attestationTokenVerificationSpec: { tlsSecretName: tokenSecret.trim() } }
      : {}),
  });

  const yaml = [
    'apiVersion: trustee.confidentialcontainers.org/v1',
    'kind: TrusteeConfig',
    'metadata:',
    `  name: ${name || '<name>'}`,
    `  namespace: ${namespace || '<namespace>'}`,
    'spec:',
    `  profileType: ${profileType}`,
    `  kbsServiceType: ${serviceType}`,
    ...(httpsSecret.trim() ? ['  httpsSpec:', `    tlsSecretName: ${httpsSecret.trim()}`] : []),
    ...(tokenSecret.trim()
      ? ['  attestationTokenVerificationSpec:', `    tlsSecretName: ${tokenSecret.trim()}`]
      : []),
  ].join('\n');

  const create = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const obj: TrusteeConfigKind = {
        apiVersion: 'trustee.confidentialcontainers.org/v1',
        kind: 'TrusteeConfig',
        metadata: { name: name.trim(), namespace: namespace.trim() },
        spec: buildSpec(),
      };
      await k8sCreate({ model: TrusteeConfigModel, data: obj });
      navigate('/trustee');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DocumentTitle>{t('Deploy Trustee')}</DocumentTitle>
      <ListPageHeader title={t('Deploy Trustee')} />
      <PageSection>
        <Grid hasGutter>
          <GridItem md={6}>
            <Card>
              <CardTitle>{t('TrusteeConfig')}</CardTitle>
              <CardBody>
                <Form>
                  <FormGroup label={t('Name')} isRequired fieldId="tc-name">
                    <TextInput
                      id="tc-name"
                      value={name}
                      onChange={(_e, v) => {
                        setName(v);
                      }}
                    />
                  </FormGroup>
                  <FormGroup label={t('Namespace')} isRequired fieldId="tc-namespace">
                    <TextInput
                      id="tc-namespace"
                      value={namespace}
                      onChange={(_e, v) => {
                        setNamespace(v);
                      }}
                    />
                  </FormGroup>
                  <FormGroup label={t('Profile')} fieldId="tc-profile">
                    <FormSelect
                      id="tc-profile"
                      value={profileType}
                      onChange={(_e, v) => {
                        setProfileType(v as ProfileType);
                      }}
                    >
                      <FormSelectOption value="Permissive" label={t('Permissive (dev/test)')} />
                      <FormSelectOption value="Restricted" label={t('Restricted (production)')} />
                    </FormSelect>
                  </FormGroup>
                  <FormGroup label={t('KBS service type')} fieldId="tc-service">
                    <FormSelect
                      id="tc-service"
                      value={serviceType}
                      onChange={(_e, v) => {
                        setServiceType(v as ServiceType);
                      }}
                    >
                      <FormSelectOption value="ClusterIP" label="ClusterIP" />
                      <FormSelectOption value="NodePort" label="NodePort" />
                      <FormSelectOption value="LoadBalancer" label="LoadBalancer" />
                    </FormSelect>
                  </FormGroup>
                  <FormGroup
                    label={t('HTTPS TLS secret')}
                    isRequired={restricted}
                    fieldId="tc-https"
                  >
                    <TextInput
                      id="tc-https"
                      value={httpsSecret}
                      validated={httpsRequiredMissing ? 'error' : 'default'}
                      onChange={(_e, v) => {
                        setHttpsSecret(v);
                      }}
                      placeholder={restricted ? t('Required for Restricted') : t('Optional')}
                    />
                  </FormGroup>
                  <FormGroup
                    label={t('Attestation token verification secret (optional)')}
                    fieldId="tc-token"
                  >
                    <TextInput
                      id="tc-token"
                      value={tokenSecret}
                      onChange={(_e, v) => {
                        setTokenSecret(v);
                      }}
                    />
                  </FormGroup>

                  {error && (
                    <Alert variant="danger" isInline title={t('Could not create TrusteeConfig')}>
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
                        navigate('/trustee');
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
              <CardTitle>{t('Preview')}</CardTitle>
              <CardBody>
                <p className="coco-openshift-console-plugin__mb coco-openshift-console-plugin__muted">
                  {t(
                    'The Trustee operator generates the KBS deployment, attestation and resource policies, reference values, and secrets from this single resource.',
                  )}
                </p>
                <CodeBlock>
                  <CodeBlockCode>{yaml}</CodeBlockCode>
                </CodeBlock>
              </CardBody>
            </Card>
          </GridItem>
        </Grid>
      </PageSection>
    </>
  );
};

export default DeployTrusteeWizard;
