import type { RuntimeClassKind } from '../k8s/types';
import { classForRuntimeClass, isConfidentialClass, isConfidentialRuntimeClass } from './runtime';

const rc = (name: string, handler: string): RuntimeClassKind =>
  ({ metadata: { name }, handler }) as RuntimeClassKind;

describe('classForRuntimeClass', () => {
  it('classifies kata-cc as confidential', () => {
    expect(classForRuntimeClass(rc('kata-cc', 'kata-qemu-tdx'))).toBe('confidential');
  });

  it('classifies kata-cc-nvidia-gpu as confidential-gpu', () => {
    expect(classForRuntimeClass(rc('kata-cc-nvidia-gpu', 'kata-qemu-snp'))).toBe('confidential-gpu');
  });

  it('classifies kata-remote as peerpod', () => {
    expect(classForRuntimeClass(rc('kata-remote', 'kata-remote'))).toBe('peerpod');
  });

  it('classifies a plain kata handler as sandbox', () => {
    expect(classForRuntimeClass(rc('kata', 'kata-qemu'))).toBe('sandbox');
  });
});

describe('isConfidentialRuntimeClass', () => {
  const kataCc = rc('kata-cc', 'kata-qemu-tdx');
  const kataRemote = rc('kata-remote', 'kata-remote');
  const kataPlain = rc('kata', 'kata-qemu');

  it('always treats the kata-cc family as confidential', () => {
    expect(isConfidentialRuntimeClass(kataCc)).toBe(true);
    expect(isConfidentialRuntimeClass(kataCc, false)).toBe(true);
    expect(isConfidentialRuntimeClass(kataCc, true)).toBe(true);
  });

  it('excludes kata-remote by default (non-CVM peer pods are not confidential)', () => {
    expect(isConfidentialRuntimeClass(kataRemote)).toBe(false);
    expect(isConfidentialRuntimeClass(kataRemote, false)).toBe(false);
  });

  it('includes kata-remote only when peer pods run as Confidential VMs', () => {
    // This is the fix for the cloud runtime-classes/overview views being empty:
    // with cvmPeerPods the kata-remote runtime class is recognized as confidential.
    expect(isConfidentialRuntimeClass(kataRemote, true)).toBe(true);
  });

  it('never treats a plain sandbox runtime as confidential', () => {
    expect(isConfidentialRuntimeClass(kataPlain, true)).toBe(false);
  });
});

describe('isConfidentialClass', () => {
  it('is true for confidential and confidential-gpu only', () => {
    expect(isConfidentialClass('confidential')).toBe(true);
    expect(isConfidentialClass('confidential-gpu')).toBe(true);
    expect(isConfidentialClass('peerpod')).toBe(false);
    expect(isConfidentialClass('sandbox')).toBe(false);
    expect(isConfidentialClass('unknown')).toBe(false);
  });
});
