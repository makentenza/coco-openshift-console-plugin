import type { FC } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  k8sCreate,
  useK8sWatchResource,
  type K8sResourceCommon,
} from '@openshift-console/dynamic-plugin-sdk';
import { Alert, Button, Label, Spinner } from '@patternfly/react-core';
import { CheckCircleIcon } from '@patternfly/react-icons';
import {
  CustomResourceDefinitionGVK,
  INTEL_DEVICE_PLUGINS_CHANNEL,
  INTEL_DEVICE_PLUGINS_INSTALL_NS,
  INTEL_DEVICE_PLUGINS_OPERATOR,
  INTEL_DEVICE_PLUGINS_SOURCE,
  INTEL_DEVICE_PLUGINS_SOURCE_NS,
  SGX_DEVICEPLUGIN_CR_NAME,
  SGX_DEVICEPLUGIN_CRD,
  SGX_NODE_SELECTOR_LABEL,
  SgxDevicePluginGVK,
  SgxDevicePluginModel,
  SubscriptionModel,
} from '../k8s/resources';
import './coco.css';

const PREFIX = 'coco-openshift-console-plugin';
const isAlreadyExists = (e: unknown): boolean =>
  /already exists|alreadyexists|conflict|409/i.test(e instanceof Error ? e.message : String(e));

type Props = {
  /** True once the node advertises sgx.intel.com/enclave + /provision (plugin live). */
  ready: boolean;
};

/**
 * One-click install of the Intel SGX device plugin — the prerequisite that lets the
 * QGS schedule (it advertises sgx.intel.com/enclave + /provision). Subscribes to the
 * Intel Device Plugins Operator, then auto-creates the SgxDevicePlugin CR once the
 * operator's CRD is established. Reflects live state so it never duplicates work.
 */
export const InstallSgxDevicePlugin: FC<Props> = ({ ready }) => {
  const { t } = useTranslation('plugin__coco-openshift-console-plugin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [started, setStarted] = useState(false);
  const crCreatedRef = useRef(false);

  // Operator installed? (its CRD is established.)
  const [crd] = useK8sWatchResource<K8sResourceCommon>({
    groupVersionKind: CustomResourceDefinitionGVK,
    name: SGX_DEVICEPLUGIN_CRD,
  });
  const crdReady = Boolean(crd?.metadata?.name);

  // SgxDevicePlugin CR already present? (Only watchable once the CRD exists.)
  const [crs] = useK8sWatchResource<K8sResourceCommon[]>(
    crdReady ? { groupVersionKind: SgxDevicePluginGVK, isList: true } : null,
  ) as [K8sResourceCommon[] | undefined, boolean, unknown];
  const crExists = (crs ?? []).length > 0;

  // Once the operator is installed, create the SgxDevicePlugin CR (once).
  useEffect(() => {
    if (!started || !crdReady || crExists || crCreatedRef.current) return;
    crCreatedRef.current = true;
    void (async () => {
      try {
        await k8sCreate({
          model: SgxDevicePluginModel,
          data: {
            apiVersion: 'deviceplugin.intel.com/v1',
            kind: 'SgxDevicePlugin',
            metadata: { name: SGX_DEVICEPLUGIN_CR_NAME },
            spec: {
              enclaveLimit: 110,
              provisionLimit: 110,
              nodeSelector: { [SGX_NODE_SELECTOR_LABEL]: 'true' },
            },
          },
        });
      } catch (e) {
        if (!isAlreadyExists(e)) setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [started, crdReady, crExists]);

  const onInstall = async () => {
    setBusy(true);
    setError('');
    try {
      // Subscribe to the operator if it isn't installed yet; the CR is created by
      // the effect once the CRD appears.
      if (!crdReady) {
        try {
          await k8sCreate({
            model: SubscriptionModel,
            data: {
              apiVersion: 'operators.coreos.com/v1alpha1',
              kind: 'Subscription',
              metadata: {
                name: INTEL_DEVICE_PLUGINS_OPERATOR,
                namespace: INTEL_DEVICE_PLUGINS_INSTALL_NS,
              },
              spec: {
                channel: INTEL_DEVICE_PLUGINS_CHANNEL,
                name: INTEL_DEVICE_PLUGINS_OPERATOR,
                source: INTEL_DEVICE_PLUGINS_SOURCE,
                sourceNamespace: INTEL_DEVICE_PLUGINS_SOURCE_NS,
                installPlanApproval: 'Automatic',
              },
            },
          });
        } catch (e) {
          if (!isAlreadyExists(e)) throw e;
        }
      }
      setStarted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (ready) {
    return (
      <Label color="green" icon={<CheckCircleIcon />}>
        {t('SGX device plugin ready')}
      </Label>
    );
  }

  const installing = started && !crdReady;
  const creating = started && crdReady && !crExists;
  const status = crExists
    ? t('SGX device plugin created — waiting for the node to advertise enclave/provision…')
    : creating
      ? t('Operator ready — creating the SGX device plugin…')
      : installing
        ? t('Installing the Intel Device Plugins Operator (this can take a minute)…')
        : '';

  return (
    <div>
      {!crExists && (
        <Button
          variant="secondary"
          onClick={() => void onInstall()}
          isLoading={busy || installing || creating}
          isDisabled={busy || started}
        >
          {crdReady ? t('Create SGX device plugin') : t('Install Intel SGX device plugin')}
        </Button>
      )}
      {status && (
        <div className={`${PREFIX}__mt ${PREFIX}__muted`}>
          <Spinner size="sm" /> {status}
        </div>
      )}
      {error && (
        <Alert
          variant="danger"
          isInline
          title={t('Could not install the SGX device plugin')}
          className={`${PREFIX}__mt`}
        >
          <p>{error}</p>
          <a
            href="/operatorhub/all-namespaces?keyword=Intel+Device+Plugins"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('Install from OperatorHub instead')}
          </a>
        </Alert>
      )}
    </div>
  );
};

export default InstallSgxDevicePlugin;
