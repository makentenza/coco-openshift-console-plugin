# coco-openshift-console-plugin — design & roadmap

OpenShift Console dynamic plugin to **create, configure, manage, and observe confidential
containers** — OpenShift sandboxed containers running in a hardware TEE via the `kata-cc` runtime.
Sibling of `osc-openshift-console-plugin`; built on the same OCP 4.21 stack.

> **Attestation is a separate plugin.** Deploying/managing the Red Hat build of Trustee (KBS,
> policies, reference values, delivered secrets, GPU/NRAS) lives in
> [`trustee-openshift-console-plugin`](https://github.com/makentenza/trustee-openshift-console-plugin).
> This plugin owns the *workload* side. The only attestation touchpoints here are boundary values:
> `initdata` references the Trustee **KBS URL** (a string the user supplies) and emits a **PCR8**
> reference value to register in Trustee's RVPS.

Source docs analyzed: *OpenShift sandboxed containers 1.12 — Deploying confidential containers on
bare-metal servers*.

## 1. Why this plugin

Confidential containers are assembled today by hand from CLI/YAML. This plugin turns that into a
guided, observable flow: detect TEE nodes → enable confidential containers → install the `kata-cc`
runtime → build initdata → run and verify a confidential workload. CoCo **extends OpenShift
sandboxed containers** — the same Kata / runtime-class world as `osc-openshift-console-plugin`, plus
a hardware TEE.

## 2. Architecture

**One `console.flag/model`-gated nav section — Confidential Containers** — gated by `COCO_KATACONFIG`
on `KataConfig` (`kataconfiguration.openshift.io/v1`), so the nav appears only where confidential
containers are installable.

**Consistency with `osc-openshift-console-plugin`:** identical stack (React 17 / PF 6.2 / SDK 4.21 /
`react-router-dom-v5-compat` / `ts-loader` / Yarn 4.14.1), file layout (`src/{components,k8s,utils,types}`),
hook style (`useK8sWatchResource` wrappers returning `[data, loaded]`), and styling rules
(`coco-openshift-console-plugin__` prefix, `--pf-t--*` tokens only).

## 3. Feature scope (Confidential Containers, gated by `KataConfig`)

| Capability | Create | Configure | Manage | Observe |
| --- | --- | --- | --- | --- |
| Enablement | One-click **Enable TEE detection** (NFD + `NodeFeatureRule`), **Enable Intel TDX host** (MachineConfig), **Enable confidential containers** (`osc-feature-gates`), **Create KataConfig** | node-target the kata-cc scheduling snippet | KataConfig install state | **Overview** (CC enabled?, KataConfig state, runtime classes, TEE nodes, workload health) |
| TEE nodes | — | node picker for confidential scheduling | — | per-node TDX/SNP + GPU-CC readiness from NFD labels |
| initdata | **initdata builder**: form → `initdata.toml` → gzip+base64 annotation; `policy.rego` toggles; `PCR8_HASH` for Trustee's RVPS | per-workload templates | — | effective Kata-Agent policy |
| CC workloads | CoCo-aware **Create workload** (`runtimeClassName: kata-cc` + initdata; LUKS block-volume guidance) | — | list workloads on `kata-cc*` (deep-link to `osc-openshift-console-plugin` for generic) | per-pod CC status |
| Attestation verify | — | — | — | **Verify attestation** action (CDH `…/attestation-status/status`) on a confidential pod |
| GPU CoCo (TP) | confidential-GPU prerequisites panel (IOMMU MC → GPU Operator `ClusterPolicy` → node labels → `kata-cc-nvidia-gpu`) | — | — | GPU-CC node labels & badges |

## 4. Roadmap

- **M0 — Foundation ✅** scaffold (sibling of osc-openshift-console-plugin), k8s layer, the
  Confidential Containers nav, Overview, Setup checklist.
- **M1 — CC read/observe ✅** workloads list, TEE-nodes page, runtime-classes page, KataConfig status.
- **M2 — CC guided create ✅** Enable-CoCo / TDX-host / KataConfig actions, initdata builder,
  CoCo-aware workload create, Verify-attestation action.
- **M3 — GPU & polish.** Deeper GPU-CoCo enablement (one-click IOMMU MachineConfig, ClusterPolicy
  assist), LUKS block-volume generator, embedded `kata*` metrics, must-gather helper.

Each milestone keeps `yarn lint && yarn build` green.

## 5. Risks & open questions

1. **`KataConfig` reboots** — create/edit flows must warn (mutating it reboots workers). *(Done: the
   Create KataConfig action shows a reboot warning.)*
2. **initdata correctness** — gzip+base64 + `PCR8_HASH` must match what the runtime/RVPS expect;
   the `[image]` table must live inside `cdh.toml`. Validate against a live cluster.
3. **`osc-openshift-console-plugin` overlap** — keep generic workload browsing in `osc-openshift-console-plugin`;
   own only CC-specific surfaces here, deep-linking across.
4. **RBAC** — NFD / MachineConfig / KataConfig need elevated permissions; degrade gracefully and
   point at OperatorHub when a prerequisite operator is missing.
5. **GPU is Tech Preview** — gate GPU UI behind a clear TP label; H100-only, bare metal only.

## Appendix — canonical identifiers

- Runtime classes: `kata`, `kata-cc`, `kata-remote`, `kata-cc-nvidia-gpu` (confidential handlers are
  TEE-specific, e.g. `kata-cc` → handler `kata-tdx`).
- Pod annotation: `io.katacontainers.config.hypervisor.cc_init_data` (gzip+base64 `initdata.toml`).
- Verify endpoint: `http://127.0.0.1:8006/cdh/resource/default/attestation-status/status`.
- TEE / GPU-CC node labels: `intel.feature.node.kubernetes.io/tdx`, `amd.feature.node.kubernetes.io/snp`,
  `nvidia.com/cc.mode.state=on`, `nvidia.com/cc.ready.state=true`.
- Feature gate: `osc-feature-gates` ConfigMap (`confidential: "true"`) in `openshift-sandboxed-containers-operator`.
- Boundary to Trustee: `initdata` consumes the KBS URL; `PCR8_HASH` is registered in Trustee's RVPS
  reference values. Trustee itself is managed by `trustee-openshift-console-plugin`.
