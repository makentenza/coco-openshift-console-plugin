import type { KataConfigKind } from '../k8s/types';
import {
  KATA_ELIGIBILITY_LABEL,
  kataAddNodePatch,
  kataNodeMembership,
  kataSelectionLabels,
} from './kataConfig';

describe('kataSelectionLabels', () => {
  it('uses an explicit kataConfigPoolSelector when set', () => {
    const kc: KataConfigKind = {
      spec: { kataConfigPoolSelector: { matchLabels: { foo: 'bar' } } },
    };
    expect(kataSelectionLabels(kc)).toEqual({ foo: 'bar' });
  });

  it('uses the NFD eligibility label when checkNodeEligibility is on', () => {
    expect(kataSelectionLabels({ spec: { checkNodeEligibility: true } })).toEqual({
      [KATA_ELIGIBILITY_LABEL]: 'true',
    });
  });

  it('returns no labels when kata covers all workers', () => {
    expect(kataSelectionLabels({ spec: {} })).toEqual({});
    expect(kataSelectionLabels(undefined)).toEqual({});
  });
});

describe('kataNodeMembership', () => {
  const kc: KataConfigKind = {
    spec: { checkNodeEligibility: true },
    status: { kataNodes: { installed: ['a'], installing: ['b'], failedToInstall: ['c'] } },
  };

  it('reads installed / installing / failed from status', () => {
    expect(kataNodeMembership('a', {}, kc)).toBe('installed');
    expect(kataNodeMembership('b', {}, kc)).toBe('installing');
    expect(kataNodeMembership('c', {}, kc)).toBe('failed');
  });

  it('classifies a selected-but-not-yet-converted node as included', () => {
    expect(kataNodeMembership('x', { [KATA_ELIGIBILITY_LABEL]: 'true' }, kc)).toBe('included');
  });

  it('classifies an unlabeled worker as excluded — the day-2 add candidate', () => {
    expect(kataNodeMembership('x', {}, kc)).toBe('excluded');
  });

  it('classifies every node as all when there is no per-node selector', () => {
    expect(kataNodeMembership('x', {}, { spec: {} })).toBe('all');
  });
});

describe('kataAddNodePatch', () => {
  it('JSON-Pointer-escapes the label-key slash (RFC 6901)', () => {
    expect(kataAddNodePatch({ spec: { checkNodeEligibility: true } })).toEqual([
      {
        op: 'add',
        path: '/metadata/labels/feature.node.kubernetes.io~1runtime.kata',
        value: 'true',
      },
    ]);
  });

  it('is empty when kata covers all workers (nothing to add per-node)', () => {
    expect(kataAddNodePatch({ spec: {} })).toEqual([]);
  });
});
