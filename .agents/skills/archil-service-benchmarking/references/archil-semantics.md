# Archil semantics for debugging

Discover current documentation through <https://docs.archil.com/llms.txt>. Confirm CLI flags and metric names against the installed version.

## Storage and durability

```text
Application → Linux/FUSE → per-mount Archil client cache
            → durable multi-AZ Archil service cache → backing S3
```

- A client-cache miss may hit the service cache; it does not necessarily read S3.
- Successful `fsync()` durably commits to Archil's multi-AZ storage system. **It does not wait for eventual S3 synchronization.**
- Backing-bucket visibility is asynchronous in both directions. Do not use immediate S3 visibility to judge mounted-file durability.
- Writes, close, rename, and application-level commit are different events. Preserve the service's sync/publication protocol.

## Consistency and ownership

- The storage service is strongly consistent, but another client's cached data/attributes may lag by seconds. Directory listings can remain cached longer.
- Renames are atomic; cached directory views can still lag.
- `flock`/`fcntl` coordinate processes on one client, not different clients. Archil documents single-client write ownership; do not treat database lock files as distributed locks or benchmark concurrent writers across mounts.

## Caching and remounts

- Each mount caches file contents, attributes, directory listings, and optional xattrs in memory.
- Default maximum data cache: min(one quarter of available RAM, 2048 MiB); target: 75% of maximum. Check effective startup settings.
- Dirty and in-use entries are not evicted. Prefetch can evict earlier data if the working set exceeds capacity.
- `metrics --reset` resets measurements, **not caches**.
- `invalidate-cache` refreshes cached entries while preserving dirty writes; it does not clear the durable service cache.
- `prefetch` queues asynchronous warming. `set-cache-expiry` tunes directory-listing freshness.
- **Remount before every benchmark**, but do not label it fully cold: remounting does not empty the service cache or guarantee backing-S3 reads.
- Keep cache/read-ahead/writeback settings fixed unless explicitly testing them. FUSE writeback caching is distinct from Archil's client cache.

## Metrics

Capture `client.cache.*`, `client.fuse.latency_us`, `client.operations.read.read_from_server_us`, and `client.sync.bytes` when available. Correlate them with the mount service's journal using the measured UTC interval.

Histogram `sum / count` gives an average, not a percentile. Latency sums can overlap across operations/layers and cannot simply be added into wall time. Flushed bytes are not final database size or S3-upload bytes.

Published cached-operation latency and aggregate throughput specifications are not end-to-end application guarantees. Diagnose actual operation counts, CPU, waits, and bytes before blaming the network or S3.

Sources: [Consistency](https://docs.archil.com/details/consistency.md), [Client caching](https://docs.archil.com/details/caching.md), [POSIX compatibility](https://docs.archil.com/details/support.md), [Performance](https://docs.archil.com/details/performance.md).
