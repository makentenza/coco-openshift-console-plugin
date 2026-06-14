import {
  DocumentTitle,
  k8sDelete,
  ListPageHeader,
  ResourceLink,
  Timestamp,
} from '@openshift-console/dynamic-plugin-sdk';
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownList,
  EmptyState,
  EmptyStateBody,
  Label,
  MenuToggle,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  PageSection,
  SearchInput,
  Select,
  SelectList,
  SelectOption,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core';
import { EllipsisVIcon } from '@patternfly/react-icons';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import type { ISortBy, OnSort } from '@patternfly/react-table';
import type { FC } from 'react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom-v5-compat';
import { useTranslation } from 'react-i18next';
import { useConfidentialWorkloads } from '../k8s/hooks';
import { DeploymentGVK, DeploymentModel, NamespaceGVK, PodGVK, PodModel } from '../k8s/resources';
import type { CcWorkload } from '../k8s/types';
import { statusCategory, statusColor } from '../utils/status';
import { CcClassLabel } from './CcClassLabel';
import './coco.css';

const SORTABLE_FIELDS: (keyof CcWorkload | null)[] = [
  'name',
  'namespace',
  'kind',
  null,
  null,
  null,
  'status',
  null,
  null,
  'creationTimestamp',
];

const RowActions: FC<{ w: CcWorkload; onDelete: (w: CcWorkload) => void }> = ({ w, onDelete }) => {
  const { t } = useTranslation('plugin__coco-openshift-console-plugin');
  const [open, setOpen] = useState(false);
  return (
    <Dropdown
      isOpen={open}
      onOpenChange={setOpen}
      popperProps={{ position: 'right' }}
      toggle={(ref) => (
        <MenuToggle
          ref={ref}
          variant="plain"
          onClick={() => {
            setOpen(!open);
          }}
          aria-label={t('Actions')}
        >
          <EllipsisVIcon />
        </MenuToggle>
      )}
    >
      <DropdownList>
        <DropdownItem
          onClick={() => {
            onDelete(w);
          }}
        >
          {t('Delete')}
        </DropdownItem>
      </DropdownList>
    </Dropdown>
  );
};

const SkeletonTable: FC = () => (
  <Table aria-label="Loading" variant="compact">
    <Thead>
      <Tr>
        {Array.from({ length: 10 }, (_, i) => (
          <Th key={i}>
            <Skeleton width="5rem" />
          </Th>
        ))}
      </Tr>
    </Thead>
    <Tbody>
      {Array.from({ length: 5 }, (_, i) => (
        <Tr key={i}>
          {Array.from({ length: 10 }, (_, j) => (
            <Td key={j}>
              <Skeleton width={j === 0 ? '10rem' : '6rem'} />
            </Td>
          ))}
        </Tr>
      ))}
    </Tbody>
  </Table>
);

const ConfidentialWorkloadsList: FC = () => {
  const { t } = useTranslation('plugin__coco-openshift-console-plugin');
  const { workloads, loaded } = useConfidentialWorkloads();

  // Filters live in the URL so overview tiles and runtime-class links can deep-link.
  const [searchParams, setSearchParams] = useSearchParams();
  const text = searchParams.get('name') ?? '';
  const nsFilter = searchParams.get('ns') ?? 'All';
  const ccFilter = searchParams.get('cc') ?? 'All'; // confidential | confidential-gpu
  const statusFilter = searchParams.get('status') ?? 'All'; // healthy | pending | error
  const rcFilter = searchParams.get('rc') ?? '';

  const setParam = (key: string, value?: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (!value || value === 'All') next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  };
  const hasFilters =
    text !== '' ||
    nsFilter !== 'All' ||
    ccFilter !== 'All' ||
    statusFilter !== 'All' ||
    rcFilter !== '';
  const clearFilters = () => {
    setSearchParams({}, { replace: true });
  };

  const [ccOpen, setCcOpen] = useState(false);
  const [nsOpen, setNsOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [sortBy, setSortBy] = useState<ISortBy>({});
  const [toDelete, setToDelete] = useState<CcWorkload | undefined>();
  const [deleting, setDeleting] = useState(false);

  const namespaces = useMemo(
    () => [...new Set(workloads.map((w) => w.namespace))].sort(),
    [workloads],
  );

  const onSort: OnSort = (_event, index, direction) => {
    setSortBy({ index, direction });
  };

  const rows = useMemo(() => {
    const filtered = workloads.filter((w) => {
      if (text && !w.name.toLowerCase().includes(text.toLowerCase())) return false;
      if (ccFilter !== 'All' && w.ccClass !== ccFilter) return false;
      if (nsFilter !== 'All' && w.namespace !== nsFilter) return false;
      if (statusFilter !== 'All' && statusCategory(w.status).toLowerCase() !== statusFilter)
        return false;
      if (rcFilter && w.runtimeClass !== rcFilter) return false;
      return true;
    });

    if (sortBy.index === undefined) return filtered;
    const field = SORTABLE_FIELDS[sortBy.index];
    if (!field) return filtered;
    const sorted = [...filtered].sort((a, b) =>
      String(a[field] ?? '').localeCompare(String(b[field] ?? '')),
    );
    return sortBy.direction === 'desc' ? sorted.reverse() : sorted;
  }, [workloads, text, ccFilter, nsFilter, statusFilter, rcFilter, sortBy]);

  const doDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await k8sDelete({
        model: toDelete.kind === 'Pod' ? PodModel : DeploymentModel,
        resource: toDelete.obj,
      });
      setToDelete(undefined);
    } finally {
      setDeleting(false);
    }
  };

  const getSortParams = (columnIndex: number) => ({ sortBy, onSort, columnIndex });

  const statusLabel = (value: string) =>
    value === 'healthy'
      ? t('Healthy')
      : value === 'pending'
        ? t('Pending')
        : value === 'error'
          ? t('Error')
          : t('All statuses');

  return (
    <>
      <DocumentTitle>{t('Confidential workloads')}</DocumentTitle>
      <ListPageHeader title={t('Confidential workloads')} />
      <PageSection>
        <Toolbar>
          <ToolbarContent>
            <ToolbarItem>
              <SearchInput
                placeholder={t('Filter by name')}
                value={text}
                onChange={(_e, v) => {
                  setParam('name', v);
                }}
                onClear={() => {
                  setParam('name');
                }}
              />
            </ToolbarItem>
            <ToolbarItem>
              <Select
                isOpen={nsOpen}
                selected={nsFilter}
                onSelect={(_e, v) => {
                  setParam('ns', v as string);
                  setNsOpen(false);
                }}
                onOpenChange={setNsOpen}
                toggle={(ref) => (
                  <MenuToggle
                    ref={ref}
                    onClick={() => {
                      setNsOpen(!nsOpen);
                    }}
                  >
                    {nsFilter === 'All' ? t('All namespaces') : nsFilter}
                  </MenuToggle>
                )}
              >
                <SelectList>
                  <SelectOption value="All">{t('All namespaces')}</SelectOption>
                  {namespaces.map((ns) => (
                    <SelectOption key={ns} value={ns}>
                      {ns}
                    </SelectOption>
                  ))}
                </SelectList>
              </Select>
            </ToolbarItem>
            <ToolbarItem>
              <Select
                isOpen={ccOpen}
                selected={ccFilter}
                onSelect={(_e, v) => {
                  setParam('cc', v as string);
                  setCcOpen(false);
                }}
                onOpenChange={setCcOpen}
                toggle={(ref) => (
                  <MenuToggle
                    ref={ref}
                    onClick={() => {
                      setCcOpen(!ccOpen);
                    }}
                  >
                    {ccFilter === 'confidential'
                      ? t('Confidential')
                      : ccFilter === 'confidential-gpu'
                        ? t('Confidential + GPU')
                        : t('All types')}
                  </MenuToggle>
                )}
              >
                <SelectList>
                  <SelectOption value="All">{t('All types')}</SelectOption>
                  <SelectOption value="confidential">{t('Confidential')}</SelectOption>
                  <SelectOption value="confidential-gpu">{t('Confidential + GPU')}</SelectOption>
                </SelectList>
              </Select>
            </ToolbarItem>
            <ToolbarItem>
              <Select
                isOpen={statusOpen}
                selected={statusFilter}
                onSelect={(_e, v) => {
                  setParam('status', v as string);
                  setStatusOpen(false);
                }}
                onOpenChange={setStatusOpen}
                toggle={(ref) => (
                  <MenuToggle
                    ref={ref}
                    onClick={() => {
                      setStatusOpen(!statusOpen);
                    }}
                  >
                    {statusLabel(statusFilter)}
                  </MenuToggle>
                )}
              >
                <SelectList>
                  <SelectOption value="All">{t('All statuses')}</SelectOption>
                  <SelectOption value="healthy">{t('Healthy')}</SelectOption>
                  <SelectOption value="pending">{t('Pending')}</SelectOption>
                  <SelectOption value="error">{t('Error')}</SelectOption>
                </SelectList>
              </Select>
            </ToolbarItem>
            {rcFilter && (
              <ToolbarItem>
                <Label
                  onClose={() => {
                    setParam('rc');
                  }}
                  closeBtnAriaLabel={t('Clear runtime class filter')}
                >
                  {t('Runtime class')}: {rcFilter}
                </Label>
              </ToolbarItem>
            )}
            {hasFilters && (
              <ToolbarItem>
                <Button variant="link" isInline onClick={clearFilters}>
                  {t('Clear all filters')}
                </Button>
              </ToolbarItem>
            )}
          </ToolbarContent>
        </Toolbar>

        {!loaded ? (
          <SkeletonTable />
        ) : rows.length === 0 ? (
          <EmptyState
            headingLevel="h4"
            titleText={
              workloads.length === 0
                ? t('No confidential workloads')
                : t('No results match the current filters')
            }
          >
            <EmptyStateBody>
              {workloads.length === 0
                ? t(
                    'Confidential workloads use a kata-cc runtime class and run inside a hardware TEE. Deploy one with runtimeClassName: kata-cc and initdata to see it here.',
                  )
                : t('{{count}} confidential workloads are hidden by the active filters.', {
                    count: workloads.length,
                  })}
            </EmptyStateBody>
          </EmptyState>
        ) : (
          <Table aria-label={t('Confidential workloads')} variant="compact">
            <Thead>
              <Tr>
                <Th sort={getSortParams(0)}>{t('Name')}</Th>
                <Th sort={getSortParams(1)}>{t('Namespace')}</Th>
                <Th sort={getSortParams(2)}>{t('Kind')}</Th>
                <Th>{t('Runtime class')}</Th>
                <Th>{t('Confidentiality')}</Th>
                <Th>{t('Initdata')}</Th>
                <Th sort={getSortParams(6)}>{t('Status')}</Th>
                <Th>{t('Restarts')}</Th>
                <Th>{t('Node')}</Th>
                <Th sort={getSortParams(9)}>{t('Created')}</Th>
                <Th screenReaderText={t('Actions')} />
              </Tr>
            </Thead>
            <Tbody>
              {rows.map((w) => (
                <Tr key={w.uid}>
                  <Td dataLabel={t('Name')}>
                    <ResourceLink
                      groupVersionKind={w.kind === 'Pod' ? PodGVK : DeploymentGVK}
                      name={w.name}
                      namespace={w.namespace}
                      hideIcon
                    />
                  </Td>
                  <Td dataLabel={t('Namespace')}>
                    <ResourceLink groupVersionKind={NamespaceGVK} name={w.namespace} linkTo />
                  </Td>
                  <Td dataLabel={t('Kind')}>{w.kind}</Td>
                  <Td
                    dataLabel={t('Runtime class')}
                    className="coco-openshift-console-plugin__mono"
                  >
                    {w.runtimeClass}
                  </Td>
                  <Td dataLabel={t('Confidentiality')}>
                    <CcClassLabel ccClass={w.ccClass} isCompact />
                  </Td>
                  <Td dataLabel={t('Initdata')}>
                    {w.hasInitData ? (
                      <Label color="green" isCompact>
                        {t('Yes')}
                      </Label>
                    ) : (
                      <Label color="grey" isCompact>
                        {t('No')}
                      </Label>
                    )}
                  </Td>
                  <Td dataLabel={t('Status')}>
                    <Label color={statusColor(w.status)} isCompact>
                      {w.ready ? `${w.status} (${w.ready})` : w.status}
                    </Label>
                  </Td>
                  <Td dataLabel={t('Restarts')}>
                    {w.kind === 'Pod' ? (
                      (w.restarts ?? 0)
                    ) : (
                      <span className="coco-openshift-console-plugin__muted">—</span>
                    )}
                  </Td>
                  <Td dataLabel={t('Node')}>
                    {w.node ? (
                      <span className="coco-openshift-console-plugin__mono">{w.node}</span>
                    ) : (
                      <span className="coco-openshift-console-plugin__muted">—</span>
                    )}
                  </Td>
                  <Td dataLabel={t('Created')}>
                    <Timestamp timestamp={w.creationTimestamp} />
                  </Td>
                  <Td isActionCell>
                    <RowActions w={w} onDelete={setToDelete} />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </PageSection>

      {toDelete && (
        <Modal
          isOpen
          variant="small"
          onClose={() => {
            setToDelete(undefined);
          }}
        >
          <ModalHeader title={t('Delete confidential workload?')} />
          <ModalBody>
            {t(
              'Delete {{kind}} {{name}} in {{namespace}}? Its confidential VM will be torn down.',
              {
                kind: toDelete.kind,
                name: toDelete.name,
                namespace: toDelete.namespace,
              },
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="danger" onClick={() => void doDelete()} isLoading={deleting}>
              {t('Delete')}
            </Button>
            <Button
              variant="link"
              onClick={() => {
                setToDelete(undefined);
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

export default ConfidentialWorkloadsList;
