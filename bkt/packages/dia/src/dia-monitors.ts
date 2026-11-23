/** DIA monitoring rows: the profile's cron jobs that load a `bkt-dia-*` skill, with their newest run. */
import { bundleProfile } from "@bkt/shared/sdk";
import { getCronJobRuns, getCronJobs } from "./dia-api";
import type { CronJob, CronJobRun } from "./dia-api";
import { diaMonitoringJobs } from "./dia-grouping";

export interface MonitorRow {
  job: CronJob;
  /** Newest execution, or `null` when the job never ran or its history could not be read. */
  lastRun: CronJobRun | null;
}

export async function loadMonitors(): Promise<MonitorRow[]> {
  const profile = bundleProfile();
  const jobs = diaMonitoringJobs(await getCronJobs(profile));
  return Promise.all(
    jobs.map(async (job) => {
      try {
        const { runs } = await getCronJobRuns(job.id, job.profile ?? profile);
        return { job, lastRun: runs[0] ?? null };
      } catch {
        // History is supplementary: the job row (status, schedule) still renders without it.
        return { job, lastRun: null };
      }
    }),
  );
}
