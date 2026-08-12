'use client';

import { useState, useEffect } from 'react';
import { getTokenKey } from '@/lib/apollo';
import { gql } from '@apollo/client';
import { useQuery, useMutation, useSubscription } from '@apollo/client/react';
import { motion, AnimatePresence } from 'motion/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

const LOGIN = gql`
  mutation Login($pin: String!, $cafeCode: String!) {
    login(pin: $pin, cafeCode: $cafeCode) {
      token
      user { id name cafeId }
    }
  }
`;

const GET_ORDERS = gql`
  query GetOrders {
    orders(status: null) {
      id tableNumber status totalAmount items { productName quantity } waitress { name } createdAt
    }
  }
`;

const ACKNOWLEDGE = gql`
  mutation Acknowledge($orderId: ID!) {
    acknowledgeOrder(orderId: $orderId) { id status }
  }
`;

const ORDER_CREATED_SUB = gql`
  subscription OrderCreated { orderCreated { id tableNumber status totalAmount items { productName quantity } waitress { name } createdAt } }
`;
const ORDER_UPDATED_SUB = gql`
  subscription OrderUpdated { orderUpdated { id tableNumber status totalAmount items { productName quantity } waitress { name } createdAt } }
`;

type Order = {
  id: string; tableNumber: string; status: string; totalAmount: number;
  items: { productName: string; quantity: number }[];
  waitress: { name: string } | null;
  createdAt: string;
};

const CAFE_CODE = process.env.NEXT_PUBLIC_CAFE_CODE || '';

const ACTIVE_STATUSES = ['PENDING', 'PRINT_FAILED', 'PRINTED'];

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-ET', { hour: '2-digit', minute: '2-digit' });
}

function timeSince(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  return `${Math.floor(diff / 60)}m`;
}

function OrderTicket({ order, onAck }: { order: Order; onAck: (id: string) => void }) {
  const isUrgent = order.status === 'PRINT_FAILED';
  const isPending = order.status === 'PENDING';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, transform: 'translateY(12px) scale(0.97)' }}
      animate={{ opacity: 1, transform: 'translateY(0) scale(1)' }}
      exit={{ opacity: 0, transform: 'translateX(100%) scale(0.95)' }}
      transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
      className={`
        relative rounded-xl border p-4 flex flex-col gap-3
        ${isUrgent ? 'border-red-500/50 bg-red-500/5 ring-1 ring-red-500/20' : ''}
        ${isPending ? 'border-amber-500/40 bg-amber-500/5' : ''}
        ${order.status === 'PRINTED' ? 'border-border bg-card' : ''}
      `}
    >
      {/* Urgent pulse */}
      {isUrgent && (
        <span className="absolute -top-1.5 -right-1.5 flex size-3">
          <span className="animate-ping absolute inline-flex size-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full size-3 bg-red-500" />
        </span>
      )}

      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{order.tableNumber}</span>
            <Badge
              variant="outline"
              className={`text-xs ${isUrgent ? 'border-red-500/50 text-red-400' : isPending ? 'border-amber-500/50 text-amber-400' : 'border-emerald-500/50 text-emerald-400'}`}
            >
              {isUrgent ? '⚠ PRINT FAILED' : order.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{order.waitress?.name} · {formatTime(order.createdAt)} · {timeSince(order.createdAt)} ago</p>
        </div>
        <span className="text-sm text-muted-foreground font-mono whitespace-nowrap">ETB {order.totalAmount}</span>
      </div>

      <Separator />

      <ul className="flex flex-col gap-1">
        {order.items.map((item, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className="size-6 rounded-md bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">{item.quantity}</span>
            <span>{item.productName}</span>
          </li>
        ))}
      </ul>

      {(isUrgent || isPending) && (
        <Button
          size="sm"
          variant={isUrgent ? 'destructive' : 'default'}
          onClick={() => onAck(order.id)}
          className="w-full active:scale-[0.97] transition-transform duration-100"
        >
          {isUrgent ? '✓ Acknowledge (Manual)' : 'Received ✓'}
        </Button>
      )}
    </motion.div>
  );
}

function BaristaBoard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const { data, loading, refetch } = useQuery<any>(GET_ORDERS);
  const [acknowledge] = useMutation(ACKNOWLEDGE);

  useEffect(() => {
    if ((data as any)?.orders) {
      setOrders((data as any).orders.filter((o: Order) => ACTIVE_STATUSES.includes(o.status)));
    }
  }, [data]);

  useSubscription<any>(ORDER_CREATED_SUB, {
    onData: ({ data }) => {
      const o: Order = (data.data as any)?.orderCreated;
      if (o && ACTIVE_STATUSES.includes(o.status)) {
        setOrders(prev => [o, ...prev.filter(x => x.id !== o.id)]);
        toast.info(`New order · Table ${o.tableNumber}`, { duration: 3000 });
      }
    },
  });

  useSubscription<any>(ORDER_UPDATED_SUB, {
    onData: ({ data }) => {
      const o: Order = (data.data as any)?.orderUpdated;
      if (!o) return;
      if (ACTIVE_STATUSES.includes(o.status)) {
        setOrders(prev => prev.map(x => x.id === o.id ? o : x));
      } else {
        setOrders(prev => prev.filter(x => x.id !== o.id));
        if (o.status === 'VOIDED') {
          toast.warning(`VOID · Table ${o.tableNumber}`, { description: 'Stop preparation', duration: 6000 });
        }
      }
    },
  });

  const handleAck = async (orderId: string) => {
    try {
      await acknowledge({ variables: { orderId } });
    } catch (e: any) { toast.error(e.message); }
  };

  const printFailed = orders.filter(o => o.status === 'PRINT_FAILED');
  const pending = orders.filter(o => o.status === 'PENDING');
  const printed = orders.filter(o => o.status === 'PRINTED');

  return (
    <div className="min-h-screen bg-background p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Barista Station</h1>
          <p className="text-sm text-muted-foreground">{orders.length} active ticket{orders.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-muted-foreground mr-2">Live</span>
          </div>
          <Button variant="outline" size="sm" onClick={onLogout} className="text-xs font-semibold hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors">
            Logout
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-5xl mb-4">✓</div>
          <p className="text-lg font-medium text-muted-foreground">All clear</p>
          <p className="text-sm text-muted-foreground">No pending tickets</p>
        </div>
      ) : (
        <div className="space-y-6">
          {printFailed.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">⚠ Print Failed — Needs Acknowledgement</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence mode="popLayout">
                  {printFailed.map(o => <OrderTicket key={o.id} order={o} onAck={handleAck} />)}
                </AnimatePresence>
              </div>
            </section>
          )}
          {pending.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-3">● Incoming</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence mode="popLayout">
                  {pending.map(o => <OrderTicket key={o.id} order={o} onAck={handleAck} />)}
                </AnimatePresence>
              </div>
            </section>
          )}
          {printed.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-3">● In Progress</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence mode="popLayout">
                  {printed.map(o => <OrderTicket key={o.id} order={o} onAck={handleAck} />)}
                </AnimatePresence>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export default function BaristaPage() {
  const [token, setToken] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [cafeCode, setCafeCode] = useState(CAFE_CODE);
  const [loginMutation, { loading }] = useMutation(LOGIN);

  useEffect(() => {
    const t = localStorage.getItem(getTokenKey());
    if (t) setToken(t);
  }, []);

  const handleLogin = async () => {
    if (pin.length !== 4 || !cafeCode) return;
    try {
      const { data } = await loginMutation({ variables: { pin, cafeCode } });
      localStorage.setItem(getTokenKey(), (data as any).login.token);
      localStorage.setItem('db_cafeId', (data as any).login.user.cafeId);
      setToken((data as any).login.token);
    } catch { toast.error('Invalid PIN'); setPin(''); }
  };

  const handleLogout = () => {
    localStorage.removeItem(getTokenKey());
    setToken(null);
    window.location.reload();
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, transform: 'scale(0.95) translateY(8px)' }}
          animate={{ opacity: 1, transform: 'scale(1) translateY(0)' }}
          transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
          className="w-72 bg-card border border-border rounded-2xl p-6 flex flex-col gap-4"
        >
          <div className="text-center">
            <div className="text-3xl mb-2">🎯</div>
            <h1 className="text-lg font-bold">Barista Station</h1>
          </div>
          {!CAFE_CODE && (
            <input type="text" placeholder="Cafe Code" value={cafeCode}
              onChange={e => setCafeCode(e.target.value.toUpperCase())}
              className="px-3 py-2 rounded-lg bg-muted border border-border text-sm font-mono text-center uppercase" />
          )}
          <input type="password" maxLength={4} placeholder="PIN" value={pin}
            onChange={e => setPin(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            className="px-3 py-2 rounded-lg bg-muted border border-border text-sm text-center tracking-[0.5em]" />
          <Button onClick={handleLogin} disabled={loading || pin.length !== 4 || !cafeCode} className="active:scale-[0.97] transition-transform duration-100">
            {loading ? 'Signing in…' : 'Enter Station'}
          </Button>
        </motion.div>
      </div>
    );
  }

  return <BaristaBoard token={token} onLogout={handleLogout} />;
}
