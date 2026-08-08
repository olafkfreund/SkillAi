#!/usr/bin/env python3
"""Assert every third-party image in the RENDERED deploy/k8s carries a digest.

Why rendered, not source (#305)
-------------------------------
deploy/k8s/kustomization.yaml has an `images:` transformer. factory-gitops#140
found one that stripped `@sha256:` on every build while the source file still
read as correctly pinned -- the manifests looked right in review and the
cluster ran an unpinned tag. This repo's transformer touches only the two
first-party refs today, which is exactly the state that one was in before it
did not. So this reads `kustomize build` output, which is what ArgoCD applies.

Why third-party only
--------------------
The first-party `ghcr.io/olafkfreund/*` refs are bumped to an immutable
`:<git-sha>` tag by deploy-image.yml on every merge, and the cluster's
signature ClusterPolicy is now Enforce for them -- a substituted image fails
admission. Third-party images have neither guard: `pgvector/pgvector:pg17`
moved under a live database (#304) with nothing to say so.

Rule 4.7 (Factory standards): a gate that cannot do its work must FAIL, not
pass. Zero documents and zero images are both errors -- that is the shape
where a check quietly stops checking.

Run: kustomize build deploy/k8s | python3 scripts/assert-k8s-images-pinned.py
"""
from __future__ import annotations

import sys

try:
    import yaml
except ImportError:
    print("::error::PyYAML missing -- this gate could not parse anything")
    raise SystemExit(1)

FIRST_PARTY = "ghcr.io/olafkfreund/"


def images(node) -> list[str]:
    """Every `image:` string anywhere in the tree.

    ponytail: any key named `image` counts, rather than walking
    containers/initContainers/ephemeralContainers paths. Shorter, and it also
    covers CRDs and embedded pod templates a path walk would miss. A non-image
    field named `image` would be a false positive -- loud, which is the right
    direction to be wrong in. Narrow the walk if one ever shows up.
    """
    out = []
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "image" and isinstance(v, str):
                out.append(v)
            else:
                out.extend(images(v))
    elif isinstance(node, list):
        for v in node:
            out.extend(images(v))
    return out


def main() -> int:
    raw = sys.stdin.read()
    if not raw.strip():
        print("::error::no rendered manifests on stdin -- this gate checked nothing")
        return 1

    try:
        docs = [d for d in yaml.safe_load_all(raw) if isinstance(d, dict)]
    except yaml.YAMLError as e:
        print(f"::error::rendered output is not parseable YAML, so it was not checked: {e}")
        return 1

    if not docs:
        print("::error::rendered output contained no YAML documents -- this gate checked nothing")
        return 1

    found = images(docs)
    if not found:
        print("::error::no image references found in the rendered output -- discovery "
              "broke and this gate checked nothing")
        return 1

    bad = [i for i in found if not i.startswith(FIRST_PARTY) and "@sha256:" not in i]
    for i in sorted(set(bad)):
        print(f"::error::{i} is a third-party image with no digest. ArgoCD syncs "
              "deploy/k8s straight onto the cluster, so a moved tag reaches production "
              "with nothing in the way -- which is how pgvector:pg17 came to be running "
              "bytes its own tag no longer resolved to (#304). Pin it as "
              "name:tag@sha256:<digest>.")

    third_party = [i for i in found if not i.startswith(FIRST_PARTY)]
    print(f"images: {len(found)} rendered ref(s), {len(third_party)} third-party, "
          f"{len(bad)} unpinned")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
