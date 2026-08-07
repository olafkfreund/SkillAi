#!/usr/bin/env python3
"""Assert the workloads in deploy/k8s keep their pod-hardening controls.

Why this lives HERE and not in factory-gitops (Factory#624)
-----------------------------------------------------------
factory-gitops has a hardening ratchet covering 18 workloads. It cannot cover
skillai-app: ArgoCD syncs these manifests from THIS repo, so that gate never
renders them. It reported "18/18 banked workloads" green the whole time
skillai-app was running with no securityContext at all -- not because it
passed, but because it was invisible.

Kyverno does not close the gap either: admission is Audit for everything but
one narrowly scoped rule, so nothing in the cluster refuses an unhardened pod.

So the check has to be here, next to the manifests it guards.

Rule 4.7 (Factory standards): a gate that cannot do its work must FAIL, not
pass silently. Discovering zero manifests, or zero workloads, is an error --
that is the failure shape where a check quietly stops checking.

Run: python3 scripts/assert-k8s-hardening.py [deploy/k8s]
"""
from __future__ import annotations

import pathlib
import sys

try:
    import yaml
except ImportError:
    print("::error::PyYAML missing -- this gate could not parse anything")
    raise SystemExit(1)

KINDS = {"Deployment", "StatefulSet", "DaemonSet"}

# (workload, container) whose hardening has been measured and is now banked.
# Losing a control here fails the build. Adding an entry is how a win is kept.
HARDENED = {
    ("skillai-app", "app"),
}

# Per-control carve-outs. Each is a line in a diff a reviewer has to look at.
EXCEPTIONS: dict[tuple[str, str, str], str] = {}


def missing(pod_sc: dict, sc: dict) -> list[str]:
    out = []
    # seccomp and runAsNonRoot are inheritable from the pod; either level counts.
    seccomp = (sc.get("seccompProfile") or pod_sc.get("seccompProfile") or {}).get("type")
    if seccomp not in ("RuntimeDefault", "Localhost"):
        out.append("seccompProfile")
    # allowPrivilegeEscalation is container-only; there is no pod-level form.
    if sc.get("allowPrivilegeEscalation") is not False:
        out.append("allowPrivilegeEscalation")
    drop = [str(d).upper() for d in ((sc.get("capabilities") or {}).get("drop") or [])]
    if "ALL" not in drop:
        out.append("capabilities.drop[ALL]")
    if sc.get("runAsNonRoot") is not True and pod_sc.get("runAsNonRoot") is not True:
        out.append("runAsNonRoot")
    return out


def main() -> int:
    root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "deploy/k8s")
    files = sorted(root.glob("*.yaml")) + sorted(root.glob("*.yml"))
    if not files:
        print(f"::error::no manifests found under {root} -- this gate checked nothing")
        return 1

    docs = []
    for f in files:
        try:
            docs.extend(d for d in yaml.safe_load_all(f.read_text()) if isinstance(d, dict))
        except yaml.YAMLError as e:
            print(f"::error::{f} is not parseable YAML, so it was not checked: {e}")
            return 1

    workloads = [d for d in docs if d.get("kind") in KINDS]
    if not workloads:
        print(f"::error::no Deployment/StatefulSet/DaemonSet rendered from {root} "
              "-- discovery broke and this gate checked nothing")
        return 1

    seen, bad, unhardened = set(), 0, []
    for d in workloads:
        name = (d.get("metadata") or {}).get("name", "<unnamed>")
        spec = ((d.get("spec") or {}).get("template") or {}).get("spec") or {}
        pod_sc = spec.get("securityContext") or {}
        for c in spec.get("containers") or []:
            cname = c.get("name", "<unnamed>")
            gaps = missing(pod_sc, c.get("securityContext") or {})
            if (name, cname) not in HARDENED:
                if gaps:
                    unhardened.append(f"{name}/{cname}: {', '.join(gaps)}")
                continue
            seen.add((name, cname))
            for control in gaps:
                if (name, cname, control) in EXCEPTIONS:
                    continue
                print(f"::error::REGRESSION: {name}/{cname} no longer sets {control}. "
                      "This workload was hardened deliberately (Factory#624) and the "
                      "control has been removed. factory-gitops' ratchet CANNOT see "
                      "this repo and Kyverno admission is Audit, so nothing downstream "
                      "will catch it.")
                bad = 1

    # A banked workload that vanishes from the tree silently loosens the gate:
    # a name asserted against a manifest that no longer exists passes vacuously.
    for key in sorted(HARDENED - seen):
        print(f"::error::{key[0]}/{key[1]} is in HARDENED but no such container "
              "exists in deploy/k8s -- it was renamed or removed. Update HARDENED "
              "deliberately; leaving it stale means this gate stops checking it.")
        bad = 1

    if unhardened:
        print(f"note: {len(unhardened)} container(s) not yet in the ratchet "
              "(informational, does not fail):")
        for u in sorted(unhardened):
            print(f"  -  {u}")

    if bad:
        print("hardening: REGRESSION -- see the ::error:: annotations above")
    else:
        print(f"hardening: {len(seen)}/{len(HARDENED)} banked workload(s) still carry "
              "seccompProfile, allowPrivilegeEscalation, capabilities.drop[ALL], runAsNonRoot")
    return bad


if __name__ == "__main__":
    raise SystemExit(main())
