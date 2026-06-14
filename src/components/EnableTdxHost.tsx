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
import { MachineConfigGVK, MachineConfigModel } from '../k8s/resources';
import {
  buildTdxHostMachineConfig,
  hasTdxHostArgs,
  TDX_HOST_KERNEL_ARGS,
} from '../utils/machineConfig';
import './coco.css';

type MachineConfigKind = K8sResourceCommon & { spec?: { kernelArguments?: string[] } };

/**
 * One-click Intel TDX host activation: creates a MachineConfig that adds the
 * `nohibernate` + `kvm_intel.tdx=1` kernel arguments to a MachineConfigPool, so
 * the TDX module initializes and NFD can detect the node as TEE-capable. This is
 * the prerequisite for TEE detection when a node has TDX enabled in firmware but
 * is not yet labeled. Applying it reboots the pool's nodes.
 */
export const EnableTdxHost: FC = () => {
  const { t } = useTranslation('plugin__coco-openshift-console-plugin');

  const [mcs] = useK8sWatchResource<MachineConfigKind[]>({
    groupVersionKind: MachineConfigGVK,
    isList: true,
  });
  const applied = (mcs ?? []).some((mc) => hasTdxHostArgs(mc.spec?.kernelArguments));

  const [open, setOpen] = useState(false);
  const [role, setRole] = useState('worker');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const toCreate = buildTdxHostMachineConfig(role);

  const onCreate = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await k8sCreate({ model: MachineConfigModel, data: buildTdxHostMachineConfig(role) });
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (applied) {
    return (
      <Label color="green" icon={<CheckCircleIcon />}>
        {t('TDX host enabled')}
      </Label>
    );
  }

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
                'Intel TDX must be activated in the host kernel before Node Feature Discovery can detect it. This adds the required kernel arguments to the selected MachineConfigPool. Use it when a node has TDX enabled in firmware but is not detected as TEE-capable.',
              )}
            </p>
            <Alert
              variant="warning"
              isInline
              title={t('Nodes will reboot')}
              className="coco-openshift-console-plugin__mb"
            >
              {t(
                'Applying this MachineConfig rolls out a reboot to every node in the "{{role}}" pool, one at a time.',
                { role },
              )}
            </Alert>
            <Form>
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
              <FormGroup label={t('Kernel arguments')} fieldId="tdx-args">
                <span className="coco-openshift-console-plugin__mono">
                  {TDX_HOST_KERNEL_ARGS.join('  ')}
                </span>
              </FormGroup>
            </Form>
            <ExpandableSection
              toggleText={t('Resource to create')}
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
              isDisabled={busy || !role}
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
