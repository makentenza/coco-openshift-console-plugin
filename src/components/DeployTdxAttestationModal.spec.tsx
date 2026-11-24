/**
 * Fail-closed regression tests for the Intel TDX DCAP wizard (RBAC-10).
 *
 * These pin the safety behavior verified live with a restricted
 * ServiceAccount against a real cluster:
 *  - legacy state UNKNOWN (no read access to intel-dcap) must render the
 *    "could not check" warning and keep Deploy disabled — never ABSENT;
 *  - denied create permissions must surface the relevant permission hints;
 *  - pending authorization reviews must keep Deploy disabled (no hints yet);
 *  - legacy PRESENT blocks Deploy even when every permission is granted.
 *
 * R1 (uninitialized/inaccessible resource states):
 *  - a CRD the account cannot read leaves the PCS Secret watch unstarted —
 *    verification guidance replaces the key input (an unstarted watch must
 *    never read as Secret absence);
 *  - a TQGS CR the account cannot read shows cannot-determine guidance and
 *    blocks Deploy instead of offering a fresh setup;
 *  - only a confirmed Secret absence (404) offers the key input, and only
 *    with the create permission granted.
 *
 * R2 (stale legacy infrastructure warning):
 *  - the legacy alerts offer a fresh "Recheck prerequisites" action;
 *  - recheckLegacyTdxInfra classifies fresh GETs with the same fail-closed
 *    semantics as the watch (404-only absence, terminating = present,
 *    403/network = unknown);
 *  - a successful recheck overrides the stale watch until the watch moves.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import {
  k8sGet,
  useAccessReview,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { useLegacyTdxAttestationInfra, useTdxQuoteGenerationService } from '../k8s/hooks';
import DeployTdxAttestationModal, {
  effectiveLegacyStatus,
  recheckLegacyTdxInfra,
} from './DeployTdxAttestationModal';

jest.mock('@openshift-console/dynamic-plugin-sdk', () => ({
  k8sCreate: jest.fn(),
  k8sGet: jest.fn(),
  ResourceLink: () => null,
  useK8sWatchResource: jest.fn(),
  useAccessReview: jest.fn(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (value: string, opts?: Record<string, string | number>) =>
      opts ? value.replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts[k] ?? '')) : value,
  }),
}));

jest.mock('../k8s/hooks', () => ({
  useLegacyTdxAttestationInfra: jest.fn(),
  useTdxQuoteGenerationService: jest.fn(),
}));

// PatternFly's Modal renders through a React portal, which SSR ignores — the
// static markup would be empty. Replace only the Modal shell with plain
// wrappers; every other PatternFly component renders for real.
jest.mock('@patternfly/react-core', () => {
  const actual = jest.requireActual('@patternfly/react-core');
  const React = jest.requireActual('react');
  const wrapper = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children);
  return {
    ...actual,
    Modal: wrapper,
    ModalHeader: wrapper,
    ModalBody: wrapper,
    ModalFooter: wrapper,
  };
});

const watch = useK8sWatchResource as jest.Mock;
const review = useAccessReview as jest.Mock;
const legacy = useLegacyTdxAttestationInfra as jest.Mock;
const tqgs = useTdxQuoteGenerationService as jest.Mock;
const get = k8sGet as jest.Mock;

// Mirrors a real TDX node (as replayed in the live restricted-identity run):
// TDX+SGX labels and the SGX device plugin resources — so the wizard's
// SGX-plugin install CTA (and its extra permission hint) stays hidden, exactly
// like the live scenario.
const TDX_NODE = {
  metadata: {
    name: 'node-tdx',
    labels: {
      'intel.feature.node.kubernetes.io/tdx': 'true',
      'intel.feature.node.kubernetes.io/sgx': 'true',
    },
  },
  status: { allocatable: { 'sgx.intel.com/enclave': '110', 'sgx.intel.com/provision': '110' } },
};

const renderModal = () =>
  renderToStaticMarkup(<DeployTdxAttestationModal onClose={() => undefined} />);

const deployButton = (markup: string): { tag: string; disabled: boolean } => {
  const buttons = markup.match(/<button[^>]*>[\s\S]*?<\/button>/g) ?? [];
  const btn = buttons.find((b) => b.includes('Deploy attestation infrastructure'));
  return { tag: btn ?? '<not found>', disabled: Boolean(btn?.includes('disabled')) };
};

const countOccurrences = (markup: string, text: string): number =>
  (markup.match(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length;

beforeEach(() => {
  watch
    .mockReset()
    .mockImplementation((opts: { isList?: boolean }) =>
      opts?.isList ? [[TDX_NODE], true, undefined] : [undefined, true, undefined],
    );
  review.mockReset().mockReturnValue([false, false]);
  tqgs.mockReset().mockReturnValue({
    cr: undefined,
    crdInstalled: false,
    crdAccessDenied: false,
    crAccessDenied: false,
  });
  get.mockReset();
});

test('legacy UNKNOWN (unreadable intel-dcap) warns and keeps Deploy disabled', () => {
  legacy.mockReturnValue({ loaded: true, status: 'unknown' });
  const markup = renderModal();

  expect(markup).toContain('Could not check for obsolete attestation infrastructure');
  // 403 on the legacy Deployment/DaemonSet reads must NOT read as confirmed absence.
  expect(markup).not.toContain('Obsolete attestation infrastructure detected');
  expect(markup).toContain('Deploying is blocked until that is ruled out');
  expect(deployButton(markup).disabled).toBe(true);
});

test('denied TQGS create surfaces its permission hint (PCS Secret unwatchable while the CRD is unreadable)', () => {
  legacy.mockReturnValue({ loaded: true, status: 'unknown' });
  const markup = renderModal();

  // Only the TQGS-create hint renders: the PCS Secret watch never started, so
  // its create-permission hint (and key input) must not appear.
  expect(countOccurrences(markup, 'You do not have permission to perform this action')).toBe(1);
  expect(markup).not.toContain('Paste your Provisioning Certification Service API key');
  expect(deployButton(markup).disabled).toBe(true);
});

test('pending authorization reviews hide hints but keep Deploy disabled', () => {
  legacy.mockReturnValue({ loaded: true, status: 'unknown' });
  review.mockReturnValue([false, true]); // [allowed, loading]
  const markup = renderModal();

  expect(countOccurrences(markup, 'You do not have permission to perform this action')).toBe(0);
  expect(deployButton(markup).disabled).toBe(true);
});

test('legacy PRESENT blocks Deploy even with every permission granted', () => {
  legacy.mockReturnValue({ loaded: true, status: 'present' });
  review.mockReturnValue([true, false]);
  const markup = renderModal();

  expect(markup).toContain('Obsolete attestation infrastructure detected');
  expect(countOccurrences(markup, 'You do not have permission to perform this action')).toBe(0);
  expect(deployButton(markup).disabled).toBe(true);
});

test('granted permissions with legacy ABSENT and CRD absent still block Deploy', () => {
  legacy.mockReturnValue({ loaded: true, status: 'absent' });
  review.mockReturnValue([true, false]);
  const markup = renderModal();

  // No legacy/permission warnings — but the operator CRD is not installed, so
  // the wizard must not offer Deploy.
  expect(markup).not.toContain('Could not check for obsolete attestation infrastructure');
  expect(markup).not.toContain('Obsolete attestation infrastructure detected');
  expect(countOccurrences(markup, 'You do not have permission to perform this action')).toBe(0);
  expect(deployButton(markup).disabled).toBe(true);
});

// A reconciled TdxQuoteGenerationService exactly as the operator writes it:
// Ready=True (ServicesReady) against the current generation, Online mode,
// QGS DaemonSet 1/1. This is the "infrastructure already deployed" state the
// wizard must recognize without demanding anything from the user.
const READY_TQGS_CR = {
  apiVersion: 'trustedservices.intel.com/v1',
  kind: 'TdxQuoteGenerationService',
  metadata: { name: 'intel-tdx-dcap', generation: 1 },
  spec: {
    platformRegistration: { Online: {} },
    nodeSelector: ['intel.feature.node.kubernetes.io/sgx=true'],
  },
  status: {
    conditions: [{ type: 'Ready', status: 'True', reason: 'ServicesReady' }],
    daemonsetName: 'intel-tdx-dcap-qgs',
    registrationDeploymentName: 'intel-tdx-dcap-registrar',
    registrationDeploymentReady: true,
    desiredNumberScheduled: 1,
    currentNumberScheduled: 1,
    numberReady: 1,
    observedGeneration: 1,
  },
};

// The keyless PCS configuration already working on the cluster: the Secret
// carries the api-key data key with an EMPTY value. Only the key name is
// inspected, so this counts as configured.
const KEYLESS_PCS_SECRET = {
  metadata: { name: 'intel-pcs-api-key', namespace: 'intel-dcap-operator-system' },
  data: { 'api-key': '' },
};

test('existing ready TQGS with a keyless PCS Secret is recognized — no API key demanded', () => {
  legacy.mockReturnValue({ loaded: true, status: 'absent' });
  review.mockReturnValue([true, false]);
  tqgs.mockReturnValue({ cr: READY_TQGS_CR, crdInstalled: true, crdAccessDenied: false });
  watch.mockImplementation((opts: { isList?: boolean }) =>
    opts?.isList ? [[TDX_NODE], true, undefined] : [KEYLESS_PCS_SECRET, true, undefined],
  );
  const markup = renderModal();

  // The deployed-and-running success state, with the live QGS counts.
  expect(markup).toContain('Attestation infrastructure is deployed and running');
  expect(markup).toContain('1/1');
  // The keyless Secret counts as configured — no API-key input is rendered.
  expect(markup).toContain('Configured — the operator reads the key from');
  expect(markup).not.toContain('Paste your Provisioning Certification Service API key');
  expect(markup).not.toContain('The existing Secret is missing the api-key data key');
  // Ready ⇒ the footer offers Done; there is no Deploy button to press.
  expect(deployButton(markup).tag).toBe('<not found>');
  expect(markup).toContain('Done');
});

test('CRD 403 shows access-denied message instead of install prompt', () => {
  legacy.mockReturnValue({ loaded: true, status: 'absent' });
  review.mockReturnValue([true, false]);
  tqgs.mockReturnValue({ cr: undefined, crdInstalled: false, crdAccessDenied: true });
  const markup = renderModal();

  expect(markup).toContain('Cannot determine whether the operator is installed');
  expect(markup).not.toContain('Not installed. Install it from OperatorHub');
  expect(markup).not.toContain('Open in OperatorHub');
});

test('PCS Secret 403 blocks Deploy and shows unreadable hint instead of key input', () => {
  legacy.mockReturnValue({ loaded: true, status: 'absent' });
  review.mockReturnValue([true, false]);
  tqgs.mockReturnValue({ cr: undefined, crdInstalled: true, crdAccessDenied: false });
  watch.mockImplementation((opts: { isList?: boolean }) =>
    opts?.isList ? [[TDX_NODE], true, undefined] : [undefined, false, { code: 403 }],
  );
  const markup = renderModal();

  expect(markup).toContain('Cannot verify PCS API key Secret configuration');
  expect(markup).not.toContain('Paste your Provisioning Certification Service API key');
  expect(deployButton(markup).disabled).toBe(true);
});

test('multi-selector CR shows resource-editor note instead of editable selector', () => {
  const multiSelectorCr = {
    ...READY_TQGS_CR,
    spec: {
      ...READY_TQGS_CR.spec,
      nodeSelector: ['intel.feature.node.kubernetes.io/sgx=true', 'custom/label=value'],
    },
  };
  legacy.mockReturnValue({ loaded: true, status: 'absent' });
  review.mockReturnValue([true, false]);
  tqgs.mockReturnValue({ cr: multiSelectorCr, crdInstalled: true, crdAccessDenied: false });
  watch.mockImplementation((opts: { isList?: boolean }) =>
    opts?.isList ? [[TDX_NODE], true, undefined] : [KEYLESS_PCS_SECRET, true, undefined],
  );
  const markup = renderModal();

  expect(markup).toContain('2 selectors');
  expect(markup).toContain('use the resource editor for multi-selector changes');
});

test('ReconcileFailed shows failure message in QGS stepper description', () => {
  const failedCr = {
    ...READY_TQGS_CR,
    status: {
      ...READY_TQGS_CR.status,
      conditions: [
        {
          type: 'Ready',
          status: 'False',
          reason: 'ReconcileFailed',
          message: '403 Forbidden: cannot patch daemonsets',
        },
      ],
      numberReady: 1,
    },
  };
  legacy.mockReturnValue({ loaded: true, status: 'absent' });
  review.mockReturnValue([true, false]);
  tqgs.mockReturnValue({ cr: failedCr, crdInstalled: true, crdAccessDenied: false });
  watch.mockImplementation((opts: { isList?: boolean }) =>
    opts?.isList ? [[TDX_NODE], true, undefined] : [KEYLESS_PCS_SECRET, true, undefined],
  );
  const markup = renderModal();

  expect(markup).toContain('Reconciliation failed');
  expect(markup).toContain('403 Forbidden');
  expect(markup).not.toContain('Rolling out:');
});

// ---- R1: uninitialized and inaccessible resource states ----

test('CRD unreadable leaves the PCS Secret watch unstarted — verification guidance, no key input', () => {
  legacy.mockReturnValue({ loaded: true, status: 'absent' });
  review.mockReturnValue([true, false]);
  tqgs.mockReturnValue({
    cr: undefined,
    crdInstalled: false,
    crdAccessDenied: true,
    crAccessDenied: false,
  });
  const markup = renderModal();

  expect(markup).toContain('Cannot determine whether the operator is installed');
  // An unstarted Secret watch must not read as absence: verification guidance
  // replaces the key input.
  expect(markup).toContain('Cannot verify PCS API key Secret configuration');
  expect(markup).toContain('until the Intel TDX DCAP operator installation can be determined');
  expect(markup).not.toContain('Paste your Provisioning Certification Service API key');
  expect(markup).not.toContain('The one manual step');
  expect(deployButton(markup).disabled).toBe(true);
});

test('TQGS CR unreadable shows cannot-determine guidance and blocks Deploy', () => {
  legacy.mockReturnValue({ loaded: true, status: 'absent' });
  review.mockReturnValue([true, false]);
  tqgs.mockReturnValue({
    cr: undefined,
    crdInstalled: true,
    crdAccessDenied: false,
    crAccessDenied: true,
  });
  watch.mockImplementation((opts: { isList?: boolean }) =>
    opts?.isList ? [[TDX_NODE], true, undefined] : [KEYLESS_PCS_SECRET, true, undefined],
  );
  const markup = renderModal();

  expect(markup).toContain('Cannot determine whether attestation infrastructure is deployed');
  expect(markup).toContain(
    'Your account does not have permission to read the TdxQuoteGenerationService',
  );
  // The readable keyless Secret is still recognized as configured.
  expect(markup).toContain('Configured — the operator reads the key from');
  expect(deployButton(markup).disabled).toBe(true);
});

test('confirmed Secret absence (404) offers the key input only with the create permission', () => {
  legacy.mockReturnValue({ loaded: true, status: 'absent' });
  review.mockReturnValue([true, false]);
  tqgs.mockReturnValue({
    cr: undefined,
    crdInstalled: true,
    crdAccessDenied: false,
    crAccessDenied: false,
  });
  watch.mockImplementation((opts: { isList?: boolean }) =>
    opts?.isList ? [[TDX_NODE], true, undefined] : [undefined, false, { code: 404 }],
  );
  const markup = renderModal();

  expect(markup).toContain('Paste your Provisioning Certification Service API key');
  expect(markup).not.toContain('Cannot verify PCS API key Secret configuration');
  // Deploy stays disabled until a key is typed.
  expect(deployButton(markup).disabled).toBe(true);
});

test('confirmed Secret absence without the create permission hides the key input and shows both hints', () => {
  legacy.mockReturnValue({ loaded: true, status: 'absent' });
  review.mockReturnValue([false, false]);
  tqgs.mockReturnValue({
    cr: undefined,
    crdInstalled: true,
    crdAccessDenied: false,
    crAccessDenied: false,
  });
  watch.mockImplementation((opts: { isList?: boolean }) =>
    opts?.isList ? [[TDX_NODE], true, undefined] : [undefined, false, { code: 404 }],
  );
  const markup = renderModal();

  expect(markup).not.toContain('Paste your Provisioning Certification Service API key');
  expect(countOccurrences(markup, 'You do not have permission to perform this action')).toBe(2);
  expect(deployButton(markup).disabled).toBe(true);
});

// ---- R2: stale legacy infrastructure warning ----

test('legacy PRESENT and UNKNOWN alerts offer a fresh recheck', () => {
  legacy.mockReturnValue({ loaded: true, status: 'present' });
  const markup = renderModal();
  expect(markup).toContain('Recheck prerequisites');

  legacy.mockReturnValue({ loaded: true, status: 'unknown' });
  const markup2 = renderModal();
  expect(markup2).toContain('Recheck prerequisites');
});

// An SDK-shaped HTTP status error (what k8sGet rejects with in practice).
const statusError = (code: number): Error => {
  const e = new Error(`HTTP ${code}`) as Error & { code: number };
  e.code = code;
  return e;
};

describe('recheckLegacyTdxInfra (fresh GETs, fail-closed)', () => {
  test('confirms absence only when both legacy resources 404', async () => {
    get.mockRejectedValue(statusError(404));
    await expect(recheckLegacyTdxInfra()).resolves.toBe('absent');
    expect(get).toHaveBeenCalledTimes(2);
  });

  test('a still-existing legacy resource blocks the pre-deploy safety check', async () => {
    get.mockResolvedValue({ metadata: { name: 'pccs' } });
    await expect(recheckLegacyTdxInfra()).resolves.toBe('present');
  });

  test('a terminating legacy resource (deletionTimestamp) still counts as present', async () => {
    get.mockImplementation(({ name }: { name: string }) =>
      name === 'pccs'
        ? Promise.resolve({
            metadata: { name: 'pccs', deletionTimestamp: '2026-11-24T00:00:00Z' },
          })
        : Promise.reject(statusError(404)),
    );
    await expect(recheckLegacyTdxInfra()).resolves.toBe('present');
  });

  test('403 fails closed to unknown', async () => {
    get.mockRejectedValue(statusError(403));
    await expect(recheckLegacyTdxInfra()).resolves.toBe('unknown');
  });

  test('network errors fail closed to unknown', async () => {
    get.mockRejectedValue(new Error('network unreachable'));
    await expect(recheckLegacyTdxInfra()).resolves.toBe('unknown');
  });
});

describe('effectiveLegacyStatus (a successful recheck beats a stale watch)', () => {
  test('a recheck that confirmed absence overrides a stale present watch', () => {
    expect(effectiveLegacyStatus('present', { status: 'absent', staleWatch: 'present' })).toBe(
      'absent',
    );
  });

  test('the watch is trusted again once it moves off the stale value', () => {
    // Watch caught up with the recheck:
    expect(effectiveLegacyStatus('absent', { status: 'absent', staleWatch: 'present' })).toBe(
      'absent',
    );
    // Watch reports something new (e.g. the legacy stack was re-created):
    expect(effectiveLegacyStatus('present', { status: 'absent', staleWatch: 'absent' })).toBe(
      'present',
    );
  });

  test('without a recheck the watch decides', () => {
    expect(effectiveLegacyStatus('unknown', null)).toBe('unknown');
  });
});
