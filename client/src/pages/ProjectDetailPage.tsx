import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ArrowLeft,
  Database,
  FileOutput,
  Play,
  Settings,
  Loader2,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { formatDate, formatFileSize } from '@/lib/utils';

interface ProjectSummary {
  project: { id: number; name: string; status: string };
  dataSources: { count: number; totalRecords: number };
  datasets: { count: number; totalRecords: number };
  jobs: {
    total: number;
    completed: number;
    failed: number;
    processing: number;
    pending: number;
  };
  lastProcessedAt: string | null;
}

interface DataSource {
  id: number;
  name: string;
  type: string;
  format: string;
  fileSize: number | null;
  recordCount: number | null;
  status: string;
  createdAt: string;
}

interface Dataset {
  id: number;
  name: string;
  format: string;
  recordCount: number;
  fileSize: number | null;
  createdAt: string;
}

interface Job {
  id: number;
  dataSourceName: string;
  status: string;
  progress: number;
  outputFormat: string;
  createdAt: string;
}

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['project-summary', projectId],
    queryFn: () =>
      api.get<{ data: ProjectSummary }>(`/projects/${projectId}/summary`),
    enabled: !!projectId,
  });

  const { data: dataSources } = useQuery({
    queryKey: ['data-sources', projectId],
    queryFn: () =>
      api.get<{ data: DataSource[] }>(
        `/data-sources?project_id=${projectId}&page_size=10`
      ),
    enabled: !!projectId,
  });

  const { data: datasets } = useQuery({
    queryKey: ['datasets', projectId],
    queryFn: () =>
      api.get<{ data: Dataset[] }>(
        `/datasets?project_id=${projectId}&page_size=10`
      ),
    enabled: !!projectId,
  });

  const { data: jobs } = useQuery({
    queryKey: ['jobs', projectId],
    queryFn: () =>
      api.get<{ data: Job[] }>(
        `/jobs?project_id=${projectId}&page_size=5`
      ),
    enabled: !!projectId,
  });

  if (summaryLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const project = summary?.data.project;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/dashboard">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">
            {project?.name || 'Project'}
          </h1>
          <p className="text-muted-foreground">
            Status: {project?.status || 'Unknown'}
          </p>
        </div>
        <Button variant="outline">
          <Settings className="h-4 w-4 mr-2" />
          Settings
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Data Sources
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {summary?.data.dataSources.count || 0}
            </p>
            <p className="text-xs text-muted-foreground">
              {summary?.data.dataSources.totalRecords.toLocaleString() || 0} records
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Datasets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {summary?.data.datasets.count || 0}
            </p>
            <p className="text-xs text-muted-foreground">
              {summary?.data.datasets.totalRecords.toLocaleString() || 0} records
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {summary?.data.jobs.completed || 0}/{summary?.data.jobs.total || 0}
            </p>
            <p className="text-xs text-muted-foreground">
              {summary?.data.jobs.processing || 0} processing
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Last Processed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {summary?.data.lastProcessedAt
                ? formatDate(summary.data.lastProcessedAt)
                : 'Never'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Data Sources */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Data Sources</CardTitle>
              <CardDescription>Uploaded files and API connections</CardDescription>
            </div>
            <Button size="sm">
              <Database className="h-4 w-4 mr-2" />
              Add Source
            </Button>
          </CardHeader>
          <CardContent>
            {dataSources?.data && dataSources.data.length > 0 ? (
              <div className="space-y-2">
                {dataSources.data.map((ds) => (
                  <div
                    key={ds.id}
                    className="flex items-center justify-between p-3 rounded-md bg-muted/50"
                  >
                    <div>
                      <p className="font-medium">{ds.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {ds.format.toUpperCase()} • {ds.recordCount?.toLocaleString() || 0} records
                      </p>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        ds.status === 'ready'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {ds.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No data sources yet
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent Jobs */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Jobs</CardTitle>
              <CardDescription>Processing job history</CardDescription>
            </div>
            <Button size="sm">
              <Play className="h-4 w-4 mr-2" />
              New Job
            </Button>
          </CardHeader>
          <CardContent>
            {jobs?.data && jobs.data.length > 0 ? (
              <div className="space-y-2">
                {jobs.data.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between p-3 rounded-md bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      {job.status === 'completed' && (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      )}
                      {job.status === 'failed' && (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                      {job.status === 'processing' && (
                        <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                      )}
                      {job.status === 'pending' && (
                        <div className="h-5 w-5 rounded-full border-2 border-muted-foreground" />
                      )}
                      <div>
                        <p className="font-medium">{job.dataSourceName}</p>
                        <p className="text-xs text-muted-foreground">
                          {job.outputFormat.toUpperCase()} • {formatDate(job.createdAt)}
                        </p>
                      </div>
                    </div>
                    {job.status === 'processing' && (
                      <span className="text-sm">{job.progress}%</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No jobs yet
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Datasets */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Datasets</CardTitle>
            <CardDescription>Processed and exported datasets</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {datasets?.data && datasets.data.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {datasets.data.map((dataset) => (
                <div
                  key={dataset.id}
                  className="p-4 rounded-md border hover:bg-accent/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <FileOutput className="h-5 w-5 text-muted-foreground" />
                    <p className="font-medium truncate">{dataset.name}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {dataset.format.toUpperCase()} •{' '}
                    {dataset.recordCount.toLocaleString()} records
                  </p>
                  {dataset.fileSize && (
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(dataset.fileSize)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No datasets yet. Process a data source to create datasets.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
