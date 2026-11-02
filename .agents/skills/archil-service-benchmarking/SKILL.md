---
name: Archil Service Benchmarking
description: Benchmark and profile any service using an Archil disk on EC2, with repeatable mount conditions, storage metrics, and runtime profiling.
---

# Archil service benchmarking

## Setup

- AWS profile: **`git-benchmark`**. Region: **`us-east-1`**.
- Create or reuse a **`c7i.large`**: non-burstable x86_64, **2 vCPUs / 4 GiB RAM**.
- Use Amazon Linux, a **30-GiB encrypted gp3 root volume**, and SSM access. Allow outbound connectivity; inbound SSH is unnecessary.
- Give each benchmark a unique UTC-based run ID, for example `service-20260912T170500Z`. Tag the instance and every attached volume with `Name=archil-benchmark`, `Purpose=git-benchmark`, `BenchmarkRunId=<run-id>`, `Service=<service>`, and `ManagedBy=OpenCode`. Do not launch an untagged benchmark instance.
- Use VPC **`vpc-0c4332f4b867bc0de`** unless the workload requires another network. Before launch, verify that VPC Flow Log **`fl-0cc0036ad3e5a5c5d`** is `ACTIVE`. If another VPC is required, create an equivalent `ALL`-traffic, one-minute, Parquet flow log before benchmarking.
- Record the instance ID, ENI IDs, private/public IPs, subnet, Availability Zone, instance launch/termination times, and run ID in the benchmark report. Use UTC for timestamps so the report can be joined with Flow Logs and billing records.
- Install the service's runtime/dependencies and the Archil client. Use current Archil installation instructions from <https://docs.archil.com/llms.txt>.
- Use an **Archil disk in `aws-us-east-1`** for the service's storage workload. Reuse populated input data instead of copying it for every run. Record which paths use Archil versus local storage.
- Discover current instance/disk IDs and credentials when executing. Do not store them or historical run paths in this skill. Keep credentials out of code and reports.

### Cost attribution

- VPC Flow Logs are delivered to `s3://git-benchmark-observability-767491588378-us-east-1/vpc-flow-logs/` and expire after 90 days. They include instance/ENI IDs, Availability Zone, direction, traffic path, endpoints, and bytes.
- Hourly CUR 2.0 data with resource IDs is delivered by export `git-benchmark-hourly-resource-costs` under `s3://git-benchmark-observability-767491588378-us-east-1/cost-and-usage/` and expires after 400 days. Billing data can take up to 24 hours to settle.
- Record CloudWatch `NetworkIn` and `NetworkOut` for the exact measured interval. After CUR data settles, report EC2 runtime, EBS, public IPv4, and regional data-transfer cost by resource ID. Use Flow Logs to identify the source/destination pair behind material transfer; CloudWatch totals alone cannot prove the peer or whether traffic crossed an Availability Zone.
- Treat unexpected cross-AZ or repeated input-copy traffic as a benchmark defect. Prefer an EC2 subnet/AZ aligned with the storage endpoint when Archil exposes that placement, and reuse already-populated Archil data rather than retransferring it.

Read [Archil semantics](references/archil-semantics.md) before interpreting storage behavior.

## Every measured run

1. Finish the previous benchmark and stop processes holding files on the mount.
2. Record the run ID, instance/ENI IDs, UTC start time, and initial CloudWatch network counters.
3. **Fully unmount and remount Archil before every run**, including repeats, controls, and profiled runs. Confirm unmount succeeded; do not substitute lazy unmount or metrics reset.
4. Keep mount flags, hardware, service version/configuration, input data, concurrency, duration, and durability settings consistent. Define the initial application state and any warmup explicitly; remounting alone does not reset application data.
5. Capture/reset Archil metrics and record the start time:
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

Report configuration, workload, repeated results, controls, deferred work, correctness checks, instance/ENI identity, network bytes, and settled resource costs. Copy reports and profiles off the instance, verify the copies, stop benchmark processes, and cleanly unmount Archil. **Leave the benchmark instance running by default. Never stop, terminate, or otherwise destroy it unless the user explicitly requests that specific action.** State the estimated hourly cost while it remains running. When explicitly asked to destroy an instance, verify that it reached `terminated` and that all benchmark EBS volumes used `DeleteOnTermination=true`; check for orphaned volumes, snapshots, Elastic IPs, NAT gateways, load balancers, and temporary transfer buckets. Delete temporary local benchmark code/artifacts and transfer buckets; preserve unrelated user work and existing documentation. Run appropriate build/diff checks after code cleanup.
