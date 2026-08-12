'use client';

import { useState, useEffect } from 'react';
import { getTokenKey } from '@/lib/apollo';
import { gql } from '@apollo/client';
import { useQuery, useMutation } from '@apollo/client/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

// ─── GraphQL ──────────────────────────────────────────────────────────────────
const SUPER_LOGIN = gql`
  mutation SuperLogin($pin: String!) {
    superLogin(pin: $pin) {
      token
      user { id name }
    }
  }
`;

const GET_ALL_CAFES = gql`
  query GetAllCafes {
    cafes {
      id name code shortageAlertThreshold declarationGapAlertThreshold
    }
  }
`;

const GET_SYSTEM_LOGS = gql`
  query GetSystemLogs($limit: Int) {
    systemLogs(limit: $limit) {
      id
      action
      description
      createdAt
      user { id name }
      cafe { id code }
    }
  }
`;

const CREATE_CAFE = gql`
  mutation CreateCafe($name: String!, $code: String!, $adminPin: String!) {
    createCafe(name: $name, code: $code, adminPin: $adminPin) {
      id name code shortageAlertThreshold declarationGapAlertThreshold
    }
  }
`;

const UPDATE_CAFE = gql`
  mutation UpdateCafe($id: ID!, $name: String, $code: String, $shortageAlertThreshold: Float, $declarationGapAlertThreshold: Float) {
    updateCafe(id: $id, name: $name, code: $code, shortageAlertThreshold: $shortageAlertThreshold, declarationGapAlertThreshold: $declarationGapAlertThreshold) {
      id name code shortageAlertThreshold declarationGapAlertThreshold
    }
  }
`;

// ─── Login Component ──────────────────────────────────────────────────────────
function LoginScreen({ onLoginSuccess }: { onLoginSuccess: () => void }) {
  const [pin, setPin] = useState('');
  const [superLogin, { loading }] = useMutation(SUPER_LOGIN);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data } = await superLogin({ variables: { pin } });
      localStorage.setItem(getTokenKey(), (data as any).superLogin.token);
      toast.success('Super Admin authenticated');
      onLoginSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Login failed');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-sm border-zinc-800 bg-zinc-900/50 text-white">
        <CardHeader>
          <div className="text-4xl text-center mb-2">🌐</div>
          <CardTitle className="text-2xl text-center">Super Admin</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pin" className="text-zinc-400">System PIN</Label>
              <Input
                id="pin"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="****"
                autoComplete="off"
                required
                className="bg-zinc-950 border-zinc-800 text-white"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full mt-2 bg-white text-zinc-950 hover:bg-zinc-200">
              {loading ? 'Authenticating...' : 'Enter System'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Cafes Tab ────────────────────────────────────────────────────────────────
function CafesTab() {
  const { data, loading, refetch } = useQuery<{ cafes: any[] }>(GET_ALL_CAFES);
  const [createCafe] = useMutation(CREATE_CAFE);
  const [updateCafe] = useMutation(UPDATE_CAFE);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newCafe, setNewCafe] = useState({ name: '', code: '', adminPin: '' });
  const [isCreating, setIsCreating] = useState(false);

  const [editCafe, setEditCafe] = useState<any>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleCreate = async () => {
    if (!newCafe.name || !newCafe.code || !newCafe.adminPin) {
      toast.error('All fields are required');
      return;
    }
    setIsCreating(true);
    try {
      await createCafe({ variables: newCafe });
      toast.success(`Cafe ${newCafe.name} deployed successfully!`);
      setIsDialogOpen(false);
      setNewCafe({ name: '', code: '', adminPin: '' });
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdate = async () => {
    if (!editCafe.name || !editCafe.code) {
      toast.error('Name and Code are required');
      return;
    }
    setIsUpdating(true);
    try {
      await updateCafe({
        variables: {
          id: editCafe.id,
          name: editCafe.name,
          code: editCafe.code,
          shortageAlertThreshold: parseFloat(editCafe.shortageAlertThreshold) || 0,
          declarationGapAlertThreshold: parseFloat(editCafe.declarationGapAlertThreshold) || 0,
        }
      });
      toast.success(`Cafe ${editCafe.name} updated successfully!`);
      setEditCafe(null);
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsUpdating(false);
    }
  };

  if (loading) return <div className="text-muted-foreground p-4">Loading branches...</div>;

  const cafes = data?.cafes || [];

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Franchise Branches</h2>
          <p className="text-sm text-muted-foreground">Manage all cafe locations across the ecosystem.</p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>Deploy New Cafe</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cafes.map((cafe: any) => (
          <Card key={cafe.id}>
            <CardHeader className="pb-2 border-b">
              <CardTitle className="text-lg flex justify-between items-center">
                {cafe.name}
                <Badge variant="outline" className="font-mono text-xs">{cafe.code}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 flex flex-col justify-between h-full">
              <div className="flex flex-col gap-2 text-sm mb-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shortage Threshold</span>
                  <span className="font-semibold">ETB {cafe.shortageAlertThreshold}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gap Threshold</span>
                  <span className="font-semibold">ETB {cafe.declarationGapAlertThreshold}</span>
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-full text-xs h-7" onClick={() => setEditCafe({ ...cafe })}>Edit Settings</Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Deploy Cafe Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deploy New Cafe Branch</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label>Cafe Name</Label>
              <Input placeholder="e.g. Yegna Bunna Bole" value={newCafe.name} onChange={e => setNewCafe({ ...newCafe, name: e.target.value })} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Cafe Code (Unique identifier)</Label>
              <Input placeholder="e.g. YEGNA_BOLE" value={newCafe.code} onChange={e => setNewCafe({ ...newCafe, code: e.target.value })} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Initial Admin PIN</Label>
              <Input type="password" placeholder="4-digit PIN" value={newCafe.adminPin} onChange={e => setNewCafe({ ...newCafe, adminPin: e.target.value })} />
              <p className="text-xs text-muted-foreground">This creates the first Cafe Admin account automatically.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button disabled={isCreating} onClick={handleCreate}>{isCreating ? 'Deploying...' : 'Deploy Cafe'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Cafe Dialog */}
      <Dialog open={!!editCafe} onOpenChange={(open) => !open && setEditCafe(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Cafe Branch</DialogTitle>
          </DialogHeader>
          {editCafe && (
            <div className="flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-2">
                <Label>Cafe Name</Label>
                <Input value={editCafe.name} onChange={e => setEditCafe({ ...editCafe, name: e.target.value })} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Cafe Code</Label>
                <Input value={editCafe.code} onChange={e => setEditCafe({ ...editCafe, code: e.target.value })} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Shortage Alert Threshold (ETB)</Label>
                <Input type="number" value={editCafe.shortageAlertThreshold} onChange={e => setEditCafe({ ...editCafe, shortageAlertThreshold: e.target.value })} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Declaration Gap Alert Threshold (ETB)</Label>
                <Input type="number" value={editCafe.declarationGapAlertThreshold} onChange={e => setEditCafe({ ...editCafe, declarationGapAlertThreshold: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCafe(null)}>Cancel</Button>
            <Button disabled={isUpdating} onClick={handleUpdate}>{isUpdating ? 'Saving...' : 'Save Changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── System Logs Tab ──────────────────────────────────────────────────────────
function SystemLogsTab() {
  const { data, loading } = useQuery<{ systemLogs: any[] }>(GET_SYSTEM_LOGS, {
    variables: { limit: 100 },
    pollInterval: 10000, // Refresh every 10 seconds
  });

  if (loading) return <div className="text-muted-foreground p-4">Loading system logs...</div>;

  const logs = data?.systemLogs || [];

  const getActionColor = (action: string) => {
    if (action.includes('VOID') || action.includes('SHORTAGE')) return 'text-red-500 bg-red-500/10 border-red-500/20';
    if (action.includes('CREATE')) return 'text-green-500 bg-green-500/10 border-green-500/20';
    if (action.includes('AMEND')) return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
    return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div>
        <h2 className="text-xl font-bold">System Analytics Logs</h2>
        <p className="text-sm text-muted-foreground">Global audit trail across all franchise branches.</p>
      </div>

      <div className="bg-card rounded-xl border flex flex-col overflow-hidden">
        {logs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No logs found.</div>
        ) : (
          <div className="divide-y max-h-[70vh] overflow-y-auto">
            {logs.map((log) => (
              <div key={log.id} className="p-4 flex gap-4 hover:bg-muted/50 transition-colors">
                <div className="flex-shrink-0 mt-1">
                  <Badge variant="outline" className={`font-mono text-[10px] uppercase tracking-wider ${getActionColor(log.action)}`}>
                    {log.action}
                  </Badge>
                </div>
                <div className="flex-1 flex flex-col gap-1">
                  <p className="text-sm leading-snug">{log.description}</p>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>{new Date(log.createdAt).toLocaleString()}</span>
                    {log.cafe && (
                      <span className="font-mono bg-muted px-1.5 rounded text-[10px]">
                        📍 {log.cafe.code}
                      </span>
                    )}
                    {log.user && (
                      <span className="font-medium">
                        👤 {log.user.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Super Admin Dashboard ────────────────────────────────────────────────────
function SuperAdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [activeView, setActiveView] = useState('cafes');

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-zinc-950 text-zinc-50 border-r border-zinc-900 flex flex-col justify-between shadow-sm z-10">
        <div>
          <div className="p-6 border-b border-zinc-800">
            <h1 className="text-xl font-bold tracking-tight">System Global</h1>
            <p className="text-xs text-zinc-400 mt-1">Super Admin Overview</p>
          </div>
          <div className="p-4 flex flex-col gap-1.5">
            <Button variant={activeView === 'cafes' ? 'secondary' : 'ghost'} className={`justify-start text-sm font-medium w-full ${activeView === 'cafes' ? 'bg-zinc-800 text-white hover:bg-zinc-800' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`} onClick={() => setActiveView('cafes')}>
              <span className="mr-3 text-lg opacity-70">🏪</span> Branches
            </Button>
            <Button variant={activeView === 'logs' ? 'secondary' : 'ghost'} className={`justify-start text-sm font-medium w-full ${activeView === 'logs' ? 'bg-zinc-800 text-white hover:bg-zinc-800' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`} onClick={() => setActiveView('logs')}>
              <span className="mr-3 text-lg opacity-70">📋</span> System Logs
            </Button>
          </div>
        </div>
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/50">
          <Button variant="outline" className="w-full text-sm font-semibold border-zinc-700 text-zinc-300 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-colors" onClick={onLogout}>
            Logout
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-background">
          {activeView === 'cafes' && <CafesTab />}
          {activeView === 'logs' && <SystemLogsTab />}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SuperAdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem(getTokenKey());
    if (token) {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem(getTokenKey());
    setIsAuthenticated(false);
    router.push('/');
  };

  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return <SuperAdminDashboard onLogout={handleLogout} />;
}
