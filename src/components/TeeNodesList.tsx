import { DocumentTitle, ListPageHeader, ResourceLink } from '@openshift-console/dynamic-plugin-sdk';
import {
  Card,
  CardBody,
  CardTitle,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Label,
  PageSection,
  Skeleton,
} from '@patternfly/react-core';
import { CheckCircleIcon, ExclamationTriangleIcon } from '@patternfly/react-icons';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useTeeNodes } from '../k8s/hooks';
import { NodeGVK } from '../k8s/resources';
import { teeLabel } from '../utils/tee';
import { EnableTdxHost } from './EnableTdxHost';
import { EnableTeeDetection } from './EnableTeeDetection';
import './coco.css';

const TeeNodesList: FC = () => {
  const { t } = useTranslation('plugin__coco-openshift-console-plugin');
  const { teeNodes, loaded } = useTeeNodes();

  return (
    <>
      <DocumentTitle>{t('TEE-capable nodes')}</DocumentTitle>
      <ListPageHeader title={t('TEE-capable nodes')}>
        <Flex gap={{ default: 'gapSm' }}>
          <FlexItem>
            <EnableTeeDetection />
          </FlexItem>
          <FlexItem>
            <EnableTdxHost />
          </FlexItem>
        </Flex>
      </ListPageHeader>
      <PageSection>
        {!loaded ? (
          <Skeleton width="100%" height="8rem" />
        ) : teeNodes.length === 0 ? (
          <EmptyState headingLevel="h4" titleText={t('No TEE-capable nodes detected')}>
            <EmptyStateBody>
              {t(
                'No nodes are labeled with a Trusted Execution Environment yet. Use Enable TEE detection to set up Node Feature Discovery and label Intel TDX or AMD SEV-SNP nodes.',
              )}
            </EmptyStateBody>
            <Flex
              gap={{ default: 'gapSm' }}
              justifyContent={{ default: 'justifyContentCenter' }}
              className="coco-openshift-console-plugin__mt"
            >
              <FlexItem>
                <EnableTeeDetection />
              </FlexItem>
              <FlexItem>
                <EnableTdxHost />
              </FlexItem>
            </Flex>
          </EmptyState>
        ) : (
          <Table aria-label={t('TEE-capable nodes')} variant="compact">
            <Thead>
              <Tr>
                <Th>{t('Node')}</Th>
                <Th>{t('TEE')}</Th>
                <Th>{t('Confidential GPU')}</Th>
                <Th>{t('Ready')}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {teeNodes.map((n) => (
                <Tr key={n.name}>
                  <Td dataLabel={t('Node')}>
                    <ResourceLink groupVersionKind={NodeGVK} name={n.name} />
                  </Td>
                  <Td dataLabel={t('TEE')}>
                    {n.tee !== 'none' ? (
                      <Label color="blue" isCompact>
                        {teeLabel(n.tee)}
                      </Label>
                    ) : (
                      <span className="coco-openshift-console-plugin__muted">—</span>
                    )}
                  </Td>
                  <Td dataLabel={t('Confidential GPU')}>
                    {n.gpuCcReady ? (
                      <Label color="purple" isCompact>
                        {t('Ready')}
                      </Label>
                    ) : (
                      <span className="coco-openshift-console-plugin__muted">—</span>
                    )}
                  </Td>
                  <Td dataLabel={t('Ready')}>
                    {n.ready ? (
                      <Label color="green" icon={<CheckCircleIcon />} isCompact>
                        {t('Ready')}
                      </Label>
                    ) : (
                      <Label color="orange" icon={<ExclamationTriangleIcon />} isCompact>
                        {t('Not ready')}
                      </Label>
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}

        <Card className="coco-openshift-console-plugin__mt">
          <CardTitle>{t('About TEE detection')}</CardTitle>
          <CardBody className="coco-openshift-console-plugin__muted">
            {t(
              'Nodes are labeled by the Node Feature Discovery operator via a NodeFeatureRule: intel.feature.node.kubernetes.io/tdx and amd.feature.node.kubernetes.io/snp mark TEE hardware; nvidia.com/cc.mode.state and nvidia.com/cc.ready.state mark confidential-computing GPUs.',
            )}
          </CardBody>
        </Card>
      </PageSection>
    </>
  );
};

export default TeeNodesList;
