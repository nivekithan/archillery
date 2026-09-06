# Git benchmark results

Benchmarks compare Archillery with GitHub using Linux kernel history over HTTPS.

## Test environment

- Date: September 5, 2026
- Client: Amazon EC2 `c7i.2xlarge` in `us-east-1a`
- Operating system: Amazon Linux 2023
- Git: 2.50.1
- Storage: encrypted 300 GB `gp3`
- Timed provider pairs in the post-optimization tests ran concurrently on the
  same host. Different benchmark types ran sequentially.
- Each trial used a fresh repository starting from an empty remote.
- Repository creation, fixture preparation, prewarming, and deletion were not
  timed.
- An Archillery cold trial started with an existing sandbox explicitly stopped.
  Its first timed operation therefore includes stopped-to-running latency.
- A warm trial started with the Archillery sandbox running.

Concurrent trials measure both providers under the same simultaneous host load,
but include shared CPU, disk, and network contention. One-operation tests are
single samples and should not be treated as statistically stable.

## Dataset

- Source: Linux kernel Git history
- Pinned reference: `v6.12`
- Walk: earliest 1,000 commits on the first-parent chain
- Initial commit: `1da177e4c3f41524e886b7f1b8a0c1fc7321cac2`
- Commit 500: `a27e951f1e9362411eba81e724fafca20f1b0563`
- Commit 1,000: `01e77d31d11a767c9da665f46e075756aef4fc4f`
- Batch pack preflight: 77,634,320 bytes
- Largest sequential pack preflight: 53,988,902 bytes
- Pack limit: 90,000,000 bytes

## Post-optimization sequential push

Each commit was pushed as an individual fast-forward update. These provider
pairs ran concurrently.

### 100 commits

| Metric           | Archillery |    GitHub |
| ---------------- | ---------: | --------: |
| End-to-end       |   62.561 s |  82.813 s |
| Timed operations |   60.997 s |  81.698 s |
| Mean             |  609.97 ms | 816.98 ms |
| p50              |     518 ms |    788 ms |
| p95              |     727 ms |    895 ms |
| p99              |   1,154 ms |    940 ms |
| First push       |   7,905 ms |  3,031 ms |
| Minimum          |     385 ms |    710 ms |
| Maximum          |   7,905 ms |  3,031 ms |
| Failures         |          0 |         0 |

Archillery completed the timed operations 20.701 seconds faster. Its median was
lower, while its p99 was higher.

### 1,000 commits

| Metric                    | Archillery |     GitHub |
| ------------------------- | ---------: | ---------: |
| End-to-end                |  878.526 s |  948.136 s |
| Timed operations          |  868.761 s |  938.889 s |
| Mean                      | 868.761 ms | 938.889 ms |
| p50                       |     810 ms |     922 ms |
| p95                       |   1,382 ms |   1,017 ms |
| p99                       |   2,029 ms |   1,128 ms |
| First push                |   8,457 ms |   3,141 ms |
| Minimum                   |     371 ms |     821 ms |
| Maximum                   |   8,655 ms |   5,134 ms |
| Mean excluding first push | 861.165 ms | 936.685 ms |
| Failures                  |          0 |          0 |

Archillery completed 69.610 seconds sooner end-to-end and had a 7.5% lower
mean. Archillery had better median latency but worse p95 and p99 tail latency.

## Batch push, clone, and fetch

- Batch push sends all 1,000 commits in one push to an empty remote.
- Clone downloads the populated 1,000-commit `benchmark` branch.
- Fetch starts from a local clone at commit 500, advances the remote to commit
  1,000 outside the timed section, and fetches commits 501 through 1,000.

Each warm and cold row came from a separate fresh repository and concurrent
GitHub control.

| Benchmark                 | Archillery cold | Cold GitHub control | Archillery warm | Warm GitHub control | Cold-to-warm improvement |
| ------------------------- | --------------: | ------------------: | --------------: | ------------------: | -----------------------: |
| Batch push, 1,000 commits |        15.605 s |             7.253 s |        13.871 s |             7.435 s |                    11.1% |
| Full clone, 1,000 commits |         9.562 s |             4.394 s |         7.038 s |             4.516 s |                    26.4% |
| Fetch, commits 501–1,000  |         7.616 s |             4.196 s |         4.819 s |             4.235 s |                    36.7% |

Against their concurrent GitHub controls, warm Archillery was 86.6% slower for
batch push, 55.8% slower for clone, and 13.8% slower for fetch. All operations
completed without failures.
