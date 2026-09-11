---
name: Archil Service Benchmarking
description: Benchmark and profile any service using an Archil disk on EC2, with repeatable mount conditions, storage metrics, and runtime profiling.
---

# Archil service benchmarking

## Setup

- AWS profile: **`git-benchmark`**. Region: **`us-east-1`**.
- Create or reuse a **`c7i.large`**: non-burstable x86_64, **2 vCPUs / 4 GiB RAM**.
- Use Amazon Linux, a **30-GiB encrypted gp3 root volume**, and SSM access. Allow outbound connectivity; inbound SSH is unnecessary.
- Install the service's runtime/dependencies and the Archil client. Use current Archil installation instructions from <https://docs.archil.com/llms.txt>.
- Use an **Archil disk in `aws-us-east-1`** for the service's storage workload. Reuse populated input data instead of copying it for every run. Record which paths use Archil versus local storage.
- Discover current instance/disk IDs and credentials when executing. Do not store them or historical run paths in this skill. Keep credentials out of code and reports.

Read [Archil semantics](references/archil-semantics.md) before interpreting storage behavior.

## Every measured run

1. Finish the previous benchmark and stop processes holding files on the mount.
2. **Fully unmount and remount Archil before every run**, including repeats, controls, and profiled runs. Confirm unmount succeeded; do not substitute lazy unmount or metrics reset.
3. Keep mount flags, hardware, service version/configuration, input data, concurrency, and durability settings consistent. Define the initial application state and any warmup explicitly; remounting alone does not reset application data.
4. Capture/reset Archil metrics and record the start time:
   ```sh
   archil metrics "$MOUNTPOINT" --reset --json > "$RESULTS/before.json"
   ```

Run at least three unprofiled repetitions for comparisons. Choose controls appropriate to the workload, such as compute-only, read-only, or local-storage runs. Remount before each control that uses Archil; do not reuse an old baseline from different cache conditions.

## Workload and profiling

Use the service's existing benchmark/load tool or a temporary harness following its normal execution path. Define the operation mix, input size, concurrency, duration, and completion boundary. For request-serving services, report throughput, latency percentiles, and errors; for batch jobs, report elapsed time and work completed. Account for deferred flush/shutdown work separately where relevant.

Build/package for the EC2 architecture and transfer the artifact to EC2. Execute through SSM and save remote results independently of SSM output truncation. A local timeout does not stop a remote command; retain its command ID and resolve completion before starting another run.

Profile in a separate run over a clearly defined interval. **For Go services**, collect CPU and heap profiles using `runtime/pprof` or the service's pprof endpoints, then analyze with the matching executable:

```sh
go tool pprof -top "$BINARY" "$CPU_PROFILE"
go tool pprof -top -cum "$BINARY" "$CPU_PROFILE"
go tool pprof -top -alloc_space "$BINARY" "$HEAP_PROFILE"
```

For other runtimes, use their CPU/allocation profiler or an appropriate system profiler. Stop captures and close profile files before transferring them.

- CPU samples are not wall time and do not automatically include subprocesses or the Archil client. Cumulative stacks overlap.
- Record peak RSS, allocations where available, page faults, storage footprint, flushed bytes, and sync latency. Allocations are not peak memory.
- Capture Archil metrics after the measured operation and any included drain/flush phase. Validate service outputs outside the measured interval.
- For low CPU but high elapsed time, inspect FUSE reads, mmap faults, sync queueing, and UTC-correlated Archil journal logs.
- Change one factor at a time, then confirm improvements without profiling and with identical durability.

## Completion

Report configuration, workload, repeated results, controls, deferred work, resource costs, and correctness checks. Keep the EC2 machine running, Archil mounted, and remote reports retained unless asked to remove them. Delete temporary local benchmark code/artifacts and transfer buckets; preserve unrelated user work and existing documentation. Run appropriate build/diff checks after code cleanup.
