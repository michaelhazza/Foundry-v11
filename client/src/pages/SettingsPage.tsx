import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Plug, ExternalLink } from 'lucide-react';

interface OAuthConnection {
  id: number;
  provider: string;
  accountName: string | null;
  isActive: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
}

export function SettingsPage() {
  const { user } = useAuth();

  const { data: connections } = useQuery({
    queryKey: ['oauth-connections'],
    queryFn: () =>
      api.get<{ data: { connections: OAuthConnection[] } }>('/oauth/connections'),
  });

  const connectTeamwork = async () => {
    try {
      const response = await api.get<{ data: { authUrl: string } }>(
        '/oauth/connect/teamwork'
      );
      window.location.href = response.data.authUrl;
    } catch (error) {
      console.error('Failed to initiate OAuth:', error);
    }
  };

  const teamworkConnection = connections?.data.connections.find(
    (c) => c.provider === 'teamwork_desk'
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your organisation settings and integrations
        </p>
      </div>

      {/* Organisation Info */}
      <Card>
        <CardHeader>
          <CardTitle>Organisation</CardTitle>
          <CardDescription>
            Your organisation information and subscription
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Name</p>
              <p className="font-medium">{user?.organisation?.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Slug</p>
              <p className="font-medium">{user?.organisation?.slug}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Integrations */}
      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>
            Connect external services to import data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Teamwork Desk */}
          <div className="flex items-center justify-between p-4 border rounded-md">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 bg-primary/10 rounded-md flex items-center justify-center">
                <Plug className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium">Teamwork Desk</p>
                <p className="text-sm text-muted-foreground">
                  Import conversations and tickets
                </p>
                {teamworkConnection && (
                  <p className="text-xs text-green-600">
                    Connected: {teamworkConnection.accountName || 'Active'}
                  </p>
                )}
              </div>
            </div>
            {teamworkConnection ? (
              <Button variant="outline" disabled>
                Connected
              </Button>
            ) : (
              <Button onClick={connectTeamwork}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Connect
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
