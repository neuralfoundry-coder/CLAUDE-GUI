# k8s/local — local Kubernetes manifests

Minimal manifests for running ClaudeGUI in a **local** Kubernetes cluster
(kind / minikube / k3d / Docker Desktop Kubernetes) with HMR.

> Not intended for remote / production clusters. The Deployment uses a
> `hostPath` bind mount of the repo into the pod — only meaningful when the
> cluster's node shares the same filesystem as the developer's laptop.

## Files

| File | Purpose |
|------|---------|
| `namespace.yaml` | `claudegui-dev` namespace |
| `configmap.yaml` | `LOG_LEVEL`, `CLAUDEGUI_DEBUG` — optional env |
| `deployment.yaml` | `claudegui:dev` pod + hostPath source mount |
| `service.yaml` | NodePort 30030 → 3000 |
| `kustomization.yaml` | Kustomize entry point |

## Prerequisites

1. Local cluster running (`kind create cluster`, `minikube start`, …)
2. `kubectl` pointed at the local cluster (`kubectl config current-context`)
3. `claudegui:dev` image built and loaded into the cluster:

   ```bash
   docker build --target dev -t claudegui:dev .

   # kind
   kind load docker-image claudegui:dev

   # minikube
   minikube image load claudegui:dev

   # k3d
   k3d image import claudegui:dev -c <cluster>
   ```

   (Docker Desktop Kubernetes uses the host's docker daemon, so the build
   alone is enough.)

## Apply

Because Deployment uses a `hostPath` whose value depends on your laptop, apply
with the repo root substituted in:

```bash
sed "s|__REPO_ROOT__|$(cd "$(dirname "$0")/../.." && pwd)|g" \
  k8s/local/deployment.yaml \
  | kubectl apply -k k8s/local/ -f -
```

Or use the wrapper: `scripts/dev.sh --k8s` does the substitute + apply +
port-forward automatically.

## Access

After the pod is ready (`kubectl -n claudegui-dev get pod -w`), forward the
port to localhost:

```bash
kubectl -n claudegui-dev port-forward svc/claudegui 3000:3000
```

Then open http://localhost:3000.

## Tear down

```bash
kubectl delete -k k8s/local/
```
