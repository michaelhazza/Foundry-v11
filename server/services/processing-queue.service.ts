import { EventEmitter } from 'events';
import { db } from '../db';
import { processingJobs, dataSources, datasets } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { detectPII, redactPII } from '../lib/pii';
import { downloadFile, uploadFile } from './s3-storage.service';
import { parse as csvParse } from 'csv-parse/sync';
import { stringify as csvStringify } from 'csv-stringify/sync';

export interface ProcessingJobConfig {
  outputFormat: 'json' | 'jsonl' | 'csv' | 'parquet';
  enablePiiDetection: boolean;
  enablePiiRedaction: boolean;
  customRedactionLabels?: Record<string, string>;
  fieldMappings?: Record<string, string>;
  filterConditions?: Array<{
    field: string;
    operator: 'eq' | 'ne' | 'gt' | 'lt' | 'contains' | 'not_contains';
    value: string | number;
  }>;
  batchSize?: number;
}

interface JobProgress {
  jobId: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  processedRecords: number;
  totalRecords: number;
  errors: string[];
  startedAt?: Date;
  completedAt?: Date;
}

type JobEventName = 'progress' | 'completed' | 'failed' | 'cancelled';

class ProcessingQueue extends EventEmitter {
  private isProcessing = false;
  private concurrency = 2;
  private activeJobs = new Map<number, AbortController>();
  private jobLogs = new Map<number, string[]>();

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  /**
   * Add a job to the queue
   */
  async enqueue(jobId: number): Promise<void> {
    // Mark job as pending
    await db
      .update(processingJobs)
      .set({ status: 'pending' })
      .where(eq(processingJobs.id, jobId));

    this.addLog(jobId, 'Job enqueued');

    // Start processing if not already running
    this.processQueue();
  }

  /**
   * Cancel a running job
   */
  async cancel(jobId: number): Promise<boolean> {
    const controller = this.activeJobs.get(jobId);

    if (controller) {
      controller.abort();
      this.activeJobs.delete(jobId);

      await db
        .update(processingJobs)
        .set({
          status: 'cancelled',
          completedAt: new Date(),
        })
        .where(eq(processingJobs.id, jobId));

      this.addLog(jobId, 'Job cancelled by user');
      this.emit('cancelled', { jobId });
      return true;
    }

    return false;
  }

  /**
   * Get job progress
   */
  async getProgress(jobId: number): Promise<JobProgress | null> {
    const [job] = await db
      .select()
      .from(processingJobs)
      .where(eq(processingJobs.id, jobId))
      .limit(1);

    if (!job) return null;

    return {
      jobId: job.id,
      status: job.status as JobProgress['status'],
      progress: job.progress ?? 0,
      processedRecords: job.processedRecords ?? 0,
      totalRecords: job.totalRecords ?? 0,
      errors: [],
      startedAt: job.startedAt ?? undefined,
      completedAt: job.completedAt ?? undefined,
    };
  }

  /**
   * Get job logs
   */
  getLogs(jobId: number): string[] {
    return this.jobLogs.get(jobId) || [];
  }

  /**
   * Main queue processing loop
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (true) {
        // Check how many jobs we can start
        const availableSlots = this.concurrency - this.activeJobs.size;
        if (availableSlots <= 0) {
          await this.sleep(1000);
          continue;
        }

        // Get pending jobs
        const pendingJobs = await db
          .select()
          .from(processingJobs)
          .where(eq(processingJobs.status, 'pending'))
          .limit(availableSlots);

        if (pendingJobs.length === 0) {
          // No more jobs, stop processing
          break;
        }

        // Start processing jobs
        for (const job of pendingJobs) {
          this.processJob(job.id).catch((error) => {
            console.error(`Error processing job ${job.id}:`, error);
          });
        }

        await this.sleep(100);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single job
   */
  private async processJob(jobId: number): Promise<void> {
    const controller = new AbortController();
    this.activeJobs.set(jobId, controller);

    try {
      // Mark job as processing
      await db
        .update(processingJobs)
        .set({
          status: 'processing',
          startedAt: new Date(),
          progress: 0,
        })
        .where(eq(processingJobs.id, jobId));

      this.addLog(jobId, 'Processing started');

      // Get job details
      const [job] = await db
        .select()
        .from(processingJobs)
        .where(eq(processingJobs.id, jobId))
        .limit(1);

      if (!job) {
        throw new Error('Job not found');
      }

      // Get data source
      const [dataSource] = await db
        .select()
        .from(dataSources)
        .where(eq(dataSources.id, job.dataSourceId))
        .limit(1);

      if (!dataSource) {
        throw new Error('Data source not found');
      }

      // Parse config
      const config: ProcessingJobConfig = (job.config as ProcessingJobConfig) || {
        outputFormat: (job.outputFormat as ProcessingJobConfig['outputFormat']) || 'jsonl',
        enablePiiDetection: true,
        enablePiiRedaction: false,
      };

      this.addLog(jobId, `Processing data source: ${dataSource.name}`);
      this.addLog(jobId, `Output format: ${config.outputFormat}`);

      // Download source file
      const sourceKey = dataSource.s3Key;
      if (!sourceKey) {
        throw new Error('Data source has no S3 key');
      }

      this.addLog(jobId, 'Downloading source file...');
      const sourceData = await downloadFile(sourceKey);

      // Parse source data
      const records = this.parseSourceData(
        sourceData,
        dataSource.format as string
      );

      const totalRecords = records.length;
      await db
        .update(processingJobs)
        .set({ totalRecords })
        .where(eq(processingJobs.id, jobId));

      this.addLog(jobId, `Found ${totalRecords} records to process`);

      // Process records in batches
      const batchSize = config.batchSize || 100;
      const processedRecords: Record<string, unknown>[] = [];
      let piiDetections = 0;

      for (let i = 0; i < records.length; i += batchSize) {
        // Check for cancellation
        if (controller.signal.aborted) {
          throw new Error('Job cancelled');
        }

        const batch = records.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        this.addLog(jobId, `Processing batch ${batchNumber}...`);

        for (const record of batch) {
          let processedRecord = { ...record };

          // Apply field mappings
          if (config.fieldMappings) {
            processedRecord = this.applyFieldMappings(
              processedRecord,
              config.fieldMappings
            );
          }

          // Apply filters
          if (config.filterConditions) {
            const passesFilter = this.checkFilters(
              processedRecord,
              config.filterConditions
            );
            if (!passesFilter) continue;
          }

          // PII detection and redaction
          if (config.enablePiiDetection || config.enablePiiRedaction) {
            for (const [key, value] of Object.entries(processedRecord)) {
              if (typeof value === 'string') {
                const piiResult = detectPII(value);
                if (piiResult.hasPII) {
                  piiDetections++;
                  if (config.enablePiiRedaction) {
                    processedRecord[key] = redactPII(value, {
                      redactionLabels: config.customRedactionLabels as Record<
                        'email' | 'phone' | 'ssn' | 'credit_card' | 'ip_address' | 'person_name' | 'address' | 'date_of_birth' | 'url' | 'custom',
                        string
                      >,
                    });
                  }
                }
              }
            }
          }

          processedRecords.push(processedRecord);
        }

        // Update progress
        const progress = Math.round(
          ((i + batch.length) / totalRecords) * 100
        );
        await db
          .update(processingJobs)
          .set({
            progress,
            processedRecords: i + batch.length,
          })
          .where(eq(processingJobs.id, jobId));

        this.emit('progress', {
          jobId,
          progress,
          processedRecords: i + batch.length,
          totalRecords,
        });
      }

      this.addLog(
        jobId,
        `Processing complete. ${processedRecords.length} records processed, ${piiDetections} PII detections`
      );

      // Convert to output format
      const outputData = this.convertToOutputFormat(
        processedRecords,
        config.outputFormat
      );

      // Generate output key
      const outputKey = sourceKey.replace('/sources/', '/datasets/').replace(
        /\.[^.]+$/,
        `.${config.outputFormat}`
      );

      // Upload output
      this.addLog(jobId, 'Uploading output file...');
      await uploadFile(outputKey, outputData, {
        contentType: this.getContentType(config.outputFormat),
      });

      // Create dataset record
      const [dataset] = await db
        .insert(datasets)
        .values({
          projectId: job.projectId,
          processingJobId: job.id,
          name: `${dataSource.name}_processed`,
          format: config.outputFormat,
          s3Key: outputKey,
          recordCount: processedRecords.length,
          fileSize: Buffer.byteLength(outputData),
        })
        .returning();

      // Mark job as completed
      await db
        .update(processingJobs)
        .set({
          status: 'completed',
          progress: 100,
          processedRecords: processedRecords.length,
          completedAt: new Date(),
        })
        .where(eq(processingJobs.id, jobId));

      this.addLog(jobId, `Job completed successfully. Dataset ID: ${dataset.id}`);
      this.emit('completed', { jobId, datasetId: dataset.id });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.addLog(jobId, `Job failed: ${errorMessage}`);

      await db
        .update(processingJobs)
        .set({
          status: 'failed',
          completedAt: new Date(),
          errorMessage,
        })
        .where(eq(processingJobs.id, jobId));

      this.emit('failed', { jobId, error: errorMessage });
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  /**
   * Parse source data based on format
   */
  private parseSourceData(
    data: Buffer,
    format: string
  ): Record<string, unknown>[] {
    const content = data.toString('utf-8');

    switch (format) {
      case 'json':
        return JSON.parse(content);
      case 'jsonl':
        return content
          .split('\n')
          .filter((line) => line.trim())
          .map((line) => JSON.parse(line));
      case 'csv':
        return csvParse(content, {
          columns: true,
          skip_empty_lines: true,
        });
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Convert records to output format
   */
  private convertToOutputFormat(
    records: Record<string, unknown>[],
    format: string
  ): string {
    switch (format) {
      case 'json':
        return JSON.stringify(records, null, 2);
      case 'jsonl':
        return records.map((r) => JSON.stringify(r)).join('\n');
      case 'csv':
        return csvStringify(records, { header: true });
      default:
        throw new Error(`Unsupported output format: ${format}`);
    }
  }

  /**
   * Get content type for format
   */
  private getContentType(format: string): string {
    switch (format) {
      case 'json':
        return 'application/json';
      case 'jsonl':
        return 'application/x-ndjson';
      case 'csv':
        return 'text/csv';
      default:
        return 'application/octet-stream';
    }
  }

  /**
   * Apply field mappings to a record
   */
  private applyFieldMappings(
    record: Record<string, unknown>,
    mappings: Record<string, string>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [newField, oldField] of Object.entries(mappings)) {
      if (oldField in record) {
        result[newField] = record[oldField];
      }
    }

    // Include unmapped fields
    for (const [key, value] of Object.entries(record)) {
      if (!Object.values(mappings).includes(key)) {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Check if record passes filter conditions
   */
  private checkFilters(
    record: Record<string, unknown>,
    conditions: ProcessingJobConfig['filterConditions']
  ): boolean {
    if (!conditions) return true;

    for (const condition of conditions) {
      const value = record[condition.field];

      switch (condition.operator) {
        case 'eq':
          if (value !== condition.value) return false;
          break;
        case 'ne':
          if (value === condition.value) return false;
          break;
        case 'gt':
          if (typeof value !== 'number' || value <= Number(condition.value))
            return false;
          break;
        case 'lt':
          if (typeof value !== 'number' || value >= Number(condition.value))
            return false;
          break;
        case 'contains':
          if (
            typeof value !== 'string' ||
            !value.includes(String(condition.value))
          )
            return false;
          break;
        case 'not_contains':
          if (
            typeof value !== 'string' ||
            value.includes(String(condition.value))
          )
            return false;
          break;
      }
    }

    return true;
  }

  /**
   * Add log entry for a job
   */
  private addLog(jobId: number, message: string): void {
    const logs = this.jobLogs.get(jobId) || [];
    const timestamp = new Date().toISOString();
    logs.push(`[${timestamp}] ${message}`);
    this.jobLogs.set(jobId, logs);

    // Limit log size
    if (logs.length > 1000) {
      logs.splice(0, logs.length - 1000);
    }
  }

  /**
   * Helper sleep function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Override emit for type safety
   */
  emit(event: JobEventName, ...args: unknown[]): boolean {
    return super.emit(event, ...args);
  }
}

// Export singleton instance
export const processingQueue = new ProcessingQueue();

// Export convenience functions
export async function enqueueJob(jobId: number): Promise<void> {
  return processingQueue.enqueue(jobId);
}

export async function cancelJob(jobId: number): Promise<boolean> {
  return processingQueue.cancel(jobId);
}

export async function getJobProgress(
  jobId: number
): Promise<JobProgress | null> {
  return processingQueue.getProgress(jobId);
}

export function getJobLogs(jobId: number): string[] {
  return processingQueue.getLogs(jobId);
}
