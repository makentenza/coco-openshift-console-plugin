import {
  buildNfdNamespace,
  buildNfdOperatorGroup,
  buildNfdSubscription,
  NFD_CRD,
  NFD_OPERATOR,
  NFD_OPERATOR_CHANNEL,
  NFD_OPERATOR_SOURCE,
  NFD_OPERATOR_SOURCE_NS,
  nfdOperandImage,
} from './nodeFeatureRule';

interface OgShape {
  metadata: { name: string; namespace: string };
  spec: { targetNamespaces: string[] };
}
interface SubShape {
  metadata: { name: string; namespace: string };
  spec: {
    channel: string;
    name: string;
    source: string;
    sourceNamespace: string;
    installPlanApproval: string;
  };
}

describe('nfdOperandImage', () => {
  it('derives the operand tag from the cluster version', () => {
    expect(nfdOperandImage('4.21.19')).toMatch(/:v4\.21$/);
  });
  it('falls back to v4.21 when the version is unparseable', () => {
    expect(nfdOperandImage(undefined)).toMatch(/:v4\.21$/);
  });
});

describe('NFD operator install resources', () => {
  const ns = 'openshift-nfd';

  it('CRD constant points at the NodeFeatureDiscovery CRD', () => {
    expect(NFD_CRD).toBe('nodefeaturediscoveries.nfd.openshift.io');
  });

  it('Namespace is named as requested', () => {
    expect(buildNfdNamespace(ns).metadata?.name).toBe(ns);
  });

  it('OperatorGroup scopes the operator to its own namespace (OwnNamespace)', () => {
    const og = buildNfdOperatorGroup(ns) as unknown as OgShape;
    expect(og.metadata.namespace).toBe(ns);
    expect(og.spec.targetNamespaces).toEqual([ns]);
  });

  it('Subscription installs the NFD operator from the configured catalog', () => {
    const sub = buildNfdSubscription(ns) as unknown as SubShape;
    expect(sub.metadata.namespace).toBe(ns);
    expect(sub.spec.name).toBe(NFD_OPERATOR);
    expect(sub.spec.channel).toBe(NFD_OPERATOR_CHANNEL);
    expect(sub.spec.source).toBe(NFD_OPERATOR_SOURCE);
    expect(sub.spec.sourceNamespace).toBe(NFD_OPERATOR_SOURCE_NS);
    expect(sub.spec.installPlanApproval).toBe('Automatic');
  });
});
