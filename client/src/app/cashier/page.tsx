'use client';

import { useState, useEffect, useMemo } from 'react';
import { getTokenKey } from '@/lib/apollo';
import { gql } from '@apollo/client';
import { useQuery, useMutation, useSubscription } from '@apollo/client/react';
import { motion, AnimatePresence } from 'motion/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

// ─── GraphQL ──────────────────────────────────────────────────────────────────
const LOGIN = gql`
  mutation Login($pin: String!, $cafeCode: String!) {
    login(pin: $pin, cafeCode: $cafeCode) { token user { id name cafeId } }
  }
`;
const GET_ORDERS = gql`
  query GetOrders {
    orders(status: null) {
      id tableNumber status totalAmount paymentMethod reason wasPaymentCollected
      items { productId productName quantity unitPrice }
      waitress { name } createdAt updatedAt
    }
  }
`;
const GET_ACTIVE_SHIFTS = gql`
  query GetShifts {
    activeShifts { id waitressId status openedAt systemExpectedCash waitress { name currentLiability } }
  }
`;
const SETTLE = gql`mutation Settle($id: ID!, $pm: String!) { settleOrder(orderId: $id, paymentMethod: $pm) { id status paymentMethod } }`;
const SETTLE_WAITRESS = gql`mutation SettleWaitress($name: String!) { settleWaitressOrders(waitressName: $name) { id status paymentMethod } }`;
const APPROVE_VOID = gql`mutation Approve($id: ID!, $pin: String!) { approveOrderVoid(orderId: $id, pin: $pin) { id status } }`;
const REJECT_VOID = gql`mutation Reject($id: ID!) { rejectOrderVoid(orderId: $id) { id status } }`;
const DIRECT_VOID = gql`mutation DirectVoid($id: ID!, $reason: String!, $wpc: Boolean!) { directVoid(orderId: $id, reason: $reason, wasPaymentCollected: $wpc) { id status } }`;
const ADMIN_UNLOCK = gql`mutation Unlock($id: ID!, $action: String!) { adminUnlockVoid(orderId: $id, action: $action) { id status } }`;
const RESOLVE_CASH = gql`mutation Resolve($id: ID!, $res: String!) { resolveCash(orderId: $id, resolution: $res) { id status } }`;
const AMEND = gql`mutation Amend($id: ID!, $table: String, $items: [OrderItemInput!], $pin: String) { amendOrder(orderId: $id, newTableNumber: $table, newItems: $items, adminPin: $pin) { id tableNumber status } }`;
const REQUEST_AMEND = gql`mutation ReqAmend($id: ID!, $table: String, $items: [OrderItemInput!], $reason: String!) { requestAmendOrder(orderId: $id, newTableNumber: $table, newItems: $items, reason: $reason) { id status } }`;
const GET_MENU = gql`query { categories { id name order } products { id categoryId name price cost isAvailable } }`;
const INITIATE_RECON = gql`mutation InitRecon($wid: ID!) { initiateReconciliation(waitressId: $wid) { id status systemExpectedCash } }`;
const DUAL_DECLARE = gql`mutation DualDeclare($shiftId: ID!, $wd: Float!, $wp: String!, $cd: Float!, $cp: String!) { submitDualDeclaration(shiftId: $shiftId, waitressDeclared: $wd, waitressPin: $wp, cashierDeclared: $cd, cashierPin: $cp) { id variance declarationGap result } }`;
const ORDER_CREATED_SUB = gql`subscription { orderCreated { id tableNumber status totalAmount paymentMethod reason wasPaymentCollected items { productId productName quantity unitPrice } waitress { name } createdAt updatedAt } }`;
const ORDER_UPDATED_SUB = gql`subscription { orderUpdated { id tableNumber status totalAmount paymentMethod reason wasPaymentCollected items { productId productName quantity unitPrice } waitress { name } createdAt updatedAt } }`;
const ADMIN_ALERT_SUB = gql`subscription { adminAlert { type message orderId userId timestamp } }`;

type Order = { id: string; tableNumber: string; status: string; totalAmount: number; paymentMethod?: string; reason?: string; wasPaymentCollected?: boolean; items: { productId: string; productName: string; quantity: number; unitPrice: number }[]; waitress: { name: string } | null; createdAt: string; updatedAt: string };

const CAFE_CODE = process.env.NEXT_PUBLIC_CAFE_CODE || '';

const statusBadge: Record<string, string> = {
  PENDING: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  PRINTED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  PRINT_FAILED: 'bg-red-500/15 text-red-400 border-red-500/30',
  VOID_REQUESTED: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  LOCKED_VOID: 'bg-red-600/20 text-red-300 border-red-600/40',
  PENDING_CASH_RESOLUTION: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  AMEND_REQUESTED: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  SETTLED: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  VOIDED: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

// ─── PIN Dialog ───────────────────────────────────────────────────────────────
function PinDialog({ open, title, description, onConfirm, onCancel, loading }: {
  open: boolean; title: string; description: string; onConfirm: (pin: string) => void; onCancel: () => void; loading?: boolean;
}) {
  const [pin, setPin] = useState('');
  return (
    <Dialog open={open} onOpenChange={v => !v && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{description}</p>
        <Input type="password" maxLength={4} placeholder="4-digit PIN" value={pin}
          onChange={e => setPin(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && pin.length === 4 && onConfirm(pin)}
          className="tracking-[0.5em] text-center text-lg"
          autoFocus />
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onConfirm(pin)} disabled={pin.length !== 4 || loading} className="active:scale-[0.97] transition-transform duration-100">
            {loading ? 'Verifying…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Order Row ────────────────────────────────────────────────────────────────
function OrderRow({ order, onSettle, onApproveVoid, onRejectVoid, onDirectVoid, onUnlock, onResolveCash, onAmend, onPrint }: {
  order: Order;
  onSettle: (order: Order) => void;
  onApproveVoid: (id: string) => void;
  onRejectVoid: (id: string) => void;
  onDirectVoid: (id: string) => void;
  onUnlock: (id: string) => void;
  onResolveCash: (id: string) => void;
  onAmend: (id: string) => void;
  onPrint: (order: Order) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, transform: 'translateY(6px)' }}
      animate={{ opacity: 1, transform: 'translateY(0)' }}
      exit={{ opacity: 0, transform: 'translateX(-100%)' }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      className={`p-4 rounded-xl border flex flex-col gap-3 ${order.status === 'VOID_REQUESTED' ? 'border-orange-500/40 bg-orange-500/5' : 'border-border bg-card'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-bold">{order.tableNumber}</span>
            <Badge variant="outline" className={`text-xs ${statusBadge[order.status] || ''}`}>{order.status}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{order.waitress?.name} · {new Date(order.createdAt).toLocaleTimeString()}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-semibold text-sm">ETB {order.totalAmount}</p>
          {order.paymentMethod && <p className="text-xs text-muted-foreground">{order.paymentMethod}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {order.items.map((item, i) => (
          <span key={i} className="px-2 py-0.5 rounded-md bg-muted text-xs">{item.quantity}× {item.productName}</span>
        ))}
      </div>
      {order.reason && <p className="text-xs text-muted-foreground italic">Reason: {order.reason}</p>}
      <div className="flex gap-2 flex-wrap">
        {['PENDING', 'PRINTED'].includes(order.status) && (
          <>
            <Button size="sm" onClick={() => onSettle(order)} className="active:scale-[0.97] transition-transform duration-100">Settle {order.paymentMethod ? `(${order.paymentMethod})` : ''}</Button>
            {order.status === 'PRINTED' && (
              <Button size="sm" variant="outline" onClick={() => onDirectVoid(order.id)} className="active:scale-[0.97] transition-transform duration-100">Direct Void</Button>
            )}
            {order.status === 'PENDING' && (
              <Button size="sm" variant="ghost" onClick={() => onAmend(order.id)} className="active:scale-[0.97] transition-transform duration-100">Amend</Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => onPrint(order)} className="active:scale-[0.97] transition-transform duration-100">🖨 Print Invoice</Button>
          </>
        )}
        {order.status === 'AMEND_REQUESTED' && (
          <Button size="sm" variant="ghost" disabled className="opacity-50">Amend Requested</Button>
        )}
        {order.status === 'VOID_REQUESTED' && (
          <>
            <Button size="sm" onClick={() => onApproveVoid(order.id)} className="active:scale-[0.97] transition-transform duration-100">Approve (PIN)</Button>
            <Button size="sm" variant="outline" onClick={() => onRejectVoid(order.id)} className="active:scale-[0.97] transition-transform duration-100">Reject</Button>
          </>
        )}
        {order.status === 'LOCKED_VOID' && (
          <Button size="sm" variant="destructive" onClick={() => onUnlock(order.id)} className="active:scale-[0.97] transition-transform duration-100">Admin Unlock</Button>
        )}
        {order.status === 'PENDING_CASH_RESOLUTION' && (
          <Button size="sm" variant="outline" onClick={() => onResolveCash(order.id)} className="active:scale-[0.97] transition-transform duration-100">Resolve Cash</Button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Cashier Dashboard ────────────────────────────────────────────────────────
function CashierDashboard({ onLogout }: { onLogout: () => void }) {
  const [activeView, setActiveView] = useState('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const { data, loading: ordersLoading, refetch } = useQuery<any>(GET_ORDERS);
  const { data: shiftsData, refetch: refetchShifts } = useQuery<any>(GET_ACTIVE_SHIFTS);
  const { data: menuData } = useQuery<any>(GET_MENU);
  const [settle] = useMutation(SETTLE);
  const [settleWaitress] = useMutation(SETTLE_WAITRESS);
  const [approveVoid] = useMutation(APPROVE_VOID);
  const [rejectVoid] = useMutation(REJECT_VOID);
  const [directVoid] = useMutation(DIRECT_VOID);
  const [adminUnlock] = useMutation(ADMIN_UNLOCK);
  const [resolveCash] = useMutation(RESOLVE_CASH);
  const [amend] = useMutation(AMEND);
  const [requestAmend] = useMutation(REQUEST_AMEND);
  const [initiateRecon] = useMutation(INITIATE_RECON);
  const [dualDeclare] = useMutation(DUAL_DECLARE);

  // Dialog state
  const [pinDialog, setPinDialog] = useState<{ open: boolean; title: string; description: string; onConfirm: (pin: string) => void } | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [directVoidDialog, setDirectVoidDialog] = useState<{ orderId: string } | null>(null);
  const [dvReason, setDvReason] = useState('');
  const [dvWpc, setDvWpc] = useState(false);
  const [reconDialog, setReconDialog] = useState<{ shiftId: string; waitressName: string; expected: number } | null>(null);
  const [recon, setRecon] = useState({ waitressDeclared: '', waitressPin: '', cashierDeclared: '', cashierPin: '' });
  const [reconResult, setReconResult] = useState<any>(null);
  const [isSubmittingRecon, setIsSubmittingRecon] = useState(false);
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const [amendDialog, setAmendDialog] = useState<{ orderId: string; tableNumber: string; items: { productId: string; productName: string; quantity: number; unitPrice: number }[]; reason: string } | null>(null);
  const [rejectVoidDialog, setRejectVoidDialog] = useState<string | null>(null);

  useEffect(() => {
    if (printOrder) {
      setTimeout(() => {
        window.print();
        setPrintOrder(null);
      }, 100);
    }
  }, [printOrder]);

  useEffect(() => { if ((data as any)?.orders) setOrders((data as any).orders); }, [data]);

  useSubscription<any>(ORDER_CREATED_SUB, {
    onData: ({ data: d }) => {
      const o: Order = (d.data as any)?.orderCreated;
      if (o) setOrders(prev => [o, ...prev.filter(x => x.id !== o.id)]);
    },
  });

  useSubscription<any>(ORDER_UPDATED_SUB, {
    onData: ({ data: d }) => {
      const o: Order = (d.data as any)?.orderUpdated;
      if (o) setOrders(prev => prev.map(x => x.id === o.id ? o : x).concat(prev.find(x => x.id === o.id) ? [] : [o]));
    },
  });

  useSubscription<any>(ADMIN_ALERT_SUB, {
    onData: ({ data: d }) => {
      const a = (d.data as any)?.adminAlert;
      if (!a) return;
      if (a.type === 'VOID_REQUESTED') toast.warning(a.message, { duration: 8000 });
      else if (a.type === 'CASHIER_MISCONDUCT') toast.error('⚠ ' + a.message, { duration: 10000 });
      else if (a.type === 'PENDING_CASH_RESOLUTION') toast.warning(a.message, { duration: 8000 });
      else toast.info(a.message);
    },
  });

  const openPinDialog = (title: string, description: string, onConfirm: (pin: string) => void) => {
    setPinDialog({ open: true, title, description, onConfirm });
  };

  // Handlers
  const handleSettle = (order: Order) => {
    const pm = order.paymentMethod || 'CASH';
    openPinDialog('Settle Order', `Confirm settlement with your cashier PIN. Payment method: ${pm}`, async (pin) => {
      setPinLoading(true);
      try {
        await settle({ variables: { id: order.id, pm } });
        toast.success(`Order settled via ${pm}`);
        setPinDialog(null);
        refetch();
      } catch (e: any) { toast.error(e.message); }
      finally { setPinLoading(false); }
    });
  };

  const handleSettleWaitress = (waitressName: string) => {
    openPinDialog('Settle All Orders', `Confirm settlement of all orders for ${waitressName} with your cashier PIN.`, async (pin) => {
      setPinLoading(true);
      try {
        await settleWaitress({ variables: { name: waitressName } });
        toast.success(`All orders settled for ${waitressName}`);
        setPinDialog(null);
        refetch();
      } catch (e: any) { toast.error(e.message); }
      finally { setPinLoading(false); }
    });
  };

  const handleApproveVoid = (orderId: string) => {
    openPinDialog('Approve Void', 'Enter your 4-digit cashier PIN to approve this void request', async (pin) => {
      setPinLoading(true);
      try {
        await approveVoid({ variables: { id: orderId, pin } });
        toast.success('Void approved');
        setPinDialog(null);
        refetch();
      } catch (e: any) { toast.error(e.message); }
      finally { setPinLoading(false); }
    });
  };

  const handleRejectVoid = (orderId: string) => setRejectVoidDialog(orderId);

  const submitRejectVoid = async () => {
    if (!rejectVoidDialog) return;
    try {
      await rejectVoid({ variables: { id: rejectVoidDialog } });
      toast.info('Void rejected — order restored');
      setRejectVoidDialog(null);
      refetch();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDirectVoid = (orderId: string) => setDirectVoidDialog({ orderId });

  const submitDirectVoid = async () => {
    if (!directVoidDialog) return;
    try {
      await directVoid({ variables: { id: directVoidDialog.orderId, reason: dvReason, wpc: dvWpc } });
      toast.success(dvWpc ? 'Order → Pending Cash Resolution' : 'Order voided');
      setDirectVoidDialog(null);
      setDvReason(''); setDvWpc(false);
      refetch();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleUnlock = (orderId: string) => {
    openPinDialog('Admin Unlock', 'Admin PIN required to unlock this void', async (pin) => {
      setPinLoading(true);
      try {
        await adminUnlock({ variables: { id: orderId, action: 'REOPEN' } });
        toast.success('Void reopened — cashier can retry');
        setPinDialog(null);
        refetch();
      } catch (e: any) { toast.error(e.message); }
      finally { setPinLoading(false); }
    });
  };

  const handleResolveCash = (orderId: string) => {
    openPinDialog('Resolve Cash', 'Has the cash been returned to till or added to liability?', async (pin) => {
      setPinLoading(true);
      try {
        await resolveCash({ variables: { id: orderId, res: 'returned_to_till' } });
        toast.success('Cash resolved — order voided');
        setPinDialog(null);
        refetch();
      } catch (e: any) { toast.error(e.message); }
      finally { setPinLoading(false); }
    });
  };

  const handleAmend = (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    setAmendDialog({
      orderId,
      tableNumber: order.tableNumber,
      items: order.items.map(i => ({ ...i })),
      reason: ''
    });
  };

  const submitAmendRequest = async () => {
    if (!amendDialog || !amendDialog.reason) return;
    try {
      await requestAmend({
        variables: {
          id: amendDialog.orderId,
          table: amendDialog.tableNumber,
          items: amendDialog.items.map(i => ({ productId: i.productId, quantity: i.quantity })),
          reason: amendDialog.reason
        }
      });
      toast.success('Amendment requested! Waiting for Admin approval.');
      setAmendDialog(null);
      refetch();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleInitiateRecon = async (waitressId: string, waitressName: string) => {
    try {
      const { data: rd } = await initiateRecon({ variables: { wid: waitressId } });
      setReconDialog({
        shiftId: (rd as any).initiateReconciliation.id,
        waitressName,
        expected: (rd as any).initiateReconciliation.systemExpectedCash,
      });
      refetchShifts();
      toast.info(`Shift lock initiated for ${waitressName}. JWT invalidated.`);
    } catch (e: any) { toast.error(e.message); }
  };

  const submitDualDeclaration = async () => {
    if (!reconDialog) return;
    setIsSubmittingRecon(true);
    try {
      const { data: dd } = await dualDeclare({
        variables: {
          shiftId: reconDialog.shiftId,
          wd: parseFloat(recon.waitressDeclared),
          wp: recon.waitressPin,
          cd: parseFloat(recon.cashierDeclared),
          cp: recon.cashierPin,
        },
      });
      setReconResult((dd as any).submitDualDeclaration);
      const res = (dd as any).submitDualDeclaration.result;
      if (res === 'SHORTAGE') {
        toast.error(`Reconciliation resulted in a SHORTAGE. Admin must approve.`);
      } else {
        toast.success(`Reconciliation complete · ${res}`);
      }
      setReconDialog(null);
      refetchShifts();
    } catch (e: any) { toast.error(e.message); }
    finally { setIsSubmittingRecon(false); }
  };

  // Grouped orders
  const activeOrders = useMemo(() => orders.filter(o => ['PENDING', 'PRINTED', 'PRINT_FAILED', 'AMEND_REQUESTED'].includes(o.status)), [orders]);
  const voidOrders = useMemo(() => orders.filter(o => ['VOID_REQUESTED', 'LOCKED_VOID', 'PENDING_CASH_RESOLUTION'].includes(o.status)), [orders]);
  const shifts = shiftsData?.activeShifts || [];

  const groupedActiveOrders = useMemo(() => activeOrders.reduce((acc, order) => {
    const wName = order.waitress?.name || 'Unknown';
    if (!acc[wName]) acc[wName] = { waitressName: wName, orders: [], expectedCash: 0, expanded: true };
    acc[wName].orders.push(order);
    acc[wName].expectedCash += order.totalAmount;
    return acc;
  }, {} as Record<string, { waitressName: string; orders: Order[]; expectedCash: number; expanded: boolean }>), [activeOrders]);
  
  const groupedOrdersArray = useMemo(() => Object.values(groupedActiveOrders).sort((a, b) => a.waitressName.localeCompare(b.waitressName)), [groupedActiveOrders]);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (groupedOrdersArray.length > 0 && Object.keys(expandedGroups).length === 0) {
      const initial: Record<string, boolean> = {};
      groupedOrdersArray.forEach(g => initial[g.waitressName] = true);
      setExpandedGroups(initial);
    }
  }, [groupedOrdersArray, expandedGroups]);

  const toggleGroup = (name: string) => setExpandedGroups(p => ({ ...p, [name]: !p[name] }));

  const orderProps = { onSettle: handleSettle, onApproveVoid: handleApproveVoid, onRejectVoid: handleRejectVoid, onDirectVoid: handleDirectVoid, onUnlock: handleUnlock, onResolveCash: handleResolveCash, onAmend: handleAmend, onPrint: setPrintOrder };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-card border-r border-border flex flex-col justify-between shadow-sm z-10">
        <div>
          <div className="p-6 border-b border-border/50">
            <h1 className="text-xl font-bold tracking-tight text-foreground">Cashier Hub</h1>
            <p className="text-xs text-muted-foreground mt-1">{new Date().toLocaleDateString('en-ET', { weekday: 'long' })}</p>
          </div>
          <div className="p-4 flex flex-col gap-1.5">
            <Button variant={activeView === 'orders' ? 'secondary' : 'ghost'} className="justify-between text-sm font-medium w-full" onClick={() => setActiveView('orders')}>
              <span className="flex items-center"><span className="mr-3 text-lg opacity-70">🧾</span> Orders</span>
              {activeOrders.length > 0 && <Badge className="size-5 rounded-full p-0 flex items-center justify-center text-[10px]">{activeOrders.length}</Badge>}
            </Button>
            <Button variant={activeView === 'voids' ? 'secondary' : 'ghost'} className="justify-between text-sm font-medium w-full text-orange-500 hover:text-orange-500 hover:bg-orange-500/10" onClick={() => setActiveView('voids')}>
              <span className="flex items-center"><span className="mr-3 text-lg opacity-70">⚠️</span> Voids & Alerts</span>
              {voidOrders.length > 0 && <Badge variant="destructive" className="size-5 rounded-full p-0 flex items-center justify-center text-[10px]">{voidOrders.length}</Badge>}
            </Button>
            <Button variant={activeView === 'shifts' ? 'secondary' : 'ghost'} className="justify-start text-sm font-medium w-full" onClick={() => setActiveView('shifts')}>
              <span className="mr-3 text-lg opacity-70">⏱️</span> Shifts
            </Button>
          </div>
        </div>
        <div className="p-4 border-t border-border/50 bg-muted/20">
          <div className="flex items-center gap-2 mb-4 justify-center">
            <div className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-medium text-emerald-500">Live Connection</span>
          </div>
          <Button variant="outline" className="w-full text-sm font-semibold hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors" onClick={onLogout}>
            Logout
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-background/50">
          {activeView === 'orders' && (
            <>
              {ordersLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
              </div>
            ) : activeOrders.length === 0 ? (
              <div className="flex flex-col items-center py-20 text-center">
                <p className="text-4xl mb-3">✓</p>
                <p className="text-muted-foreground">No active orders</p>
              </div>
            ) : (
              <div className="flex flex-col gap-8">
                {groupedOrdersArray.map(group => (
                  <div key={group.waitressName} className="flex flex-col gap-4">
                    <div
                      className="flex items-center justify-between border-b pb-2 cursor-pointer hover:bg-muted/50 rounded-lg p-2 -mx-2 transition-colors"
                      onClick={() => toggleGroup(group.waitressName)}
                    >
                      <h3 className="text-xl font-bold flex items-center gap-2">
                        <span className={`transition-transform duration-200 ${expandedGroups[group.waitressName] ? 'rotate-90' : ''}`}>▶</span>
                        👩‍🍳 {group.waitressName}
                        <Badge variant="secondary" className="text-xs">{group.orders.length} order{group.orders.length !== 1 ? 's' : ''}</Badge>
                      </h3>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Expected Cash</p>
                          <p className="font-bold text-lg text-emerald-400">ETB {group.expectedCash}</p>
                        </div>
                        <Button
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleSettleWaitress(group.waitressName); }}
                          className="active:scale-[0.97] transition-transform duration-100"
                        >
                          Settle All
                        </Button>
                      </div>
                    </div>
                    <AnimatePresence>
                      {expandedGroups[group.waitressName] && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-2">
                            {group.orders.map(o => <OrderRow key={o.id} order={o} {...orderProps} />)}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
              )}
            </>
          )}
          
          {/* Voids & Alerts Tab */}
          {activeView === 'voids' && (
            <>
              {voidOrders.length === 0 ? (
              <div className="flex flex-col items-center py-20 text-center">
                <p className="text-4xl mb-3">🔒</p>
                <p className="text-muted-foreground">No pending void requests</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <AnimatePresence mode="popLayout">
                  {voidOrders.map(o => <OrderRow key={o.id} order={o} {...orderProps} />)}
                </AnimatePresence>
              </div>
              )}
            </>
          )}

          {/* Shifts Tab */}
          {activeView === 'shifts' && (
            <>
              {shifts.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">No active shifts</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {shifts.map((shift: any) => (
                  <motion.div
                    key={shift.id}
                    initial={{ opacity: 0, transform: 'translateY(6px)' }}
                    animate={{ opacity: 1, transform: 'translateY(0)' }}
                    transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                  >
                    <Card>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{shift.waitress?.name}</CardTitle>
                          <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">{shift.status}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Cash Liability</span>
                          <span className="font-semibold">ETB {shift.waitress?.currentLiability ?? 0}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Shift opened</span>
                          <span className="text-xs">{new Date(shift.openedAt).toLocaleTimeString()}</span>
                        </div>
                        <Separator />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleInitiateRecon(shift.waitressId, shift.waitress?.name)}
                          className="active:scale-[0.97] transition-transform duration-100"
                        >
                          Close Shift & Reconcile
                        </Button>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
            {reconResult && (
              <motion.div
                initial={{ opacity: 0, transform: 'scale(0.95)' }}
                animate={{ opacity: 1, transform: 'scale(1)' }}
                className="mt-6 p-5 rounded-xl border bg-card"
              >
                <h3 className="font-semibold mb-3">Reconciliation Result</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div><p className="text-xs text-muted-foreground">Variance</p><p className="text-xl font-bold">{reconResult.variance >= 0 ? '+' : ''}{reconResult.variance}</p></div>
                  <div><p className="text-xs text-muted-foreground">Declaration Gap</p><p className="text-xl font-bold">{reconResult.declarationGap}</p></div>
                  <div><p className="text-xs text-muted-foreground">Result</p><Badge variant="outline">{reconResult.result}</Badge></div>
                </div>
              </motion.div>
              )}
            </>
          )}
        </div>
      </div>

      {/* PIN Dialog */}
      {pinDialog && (
        <PinDialog
          open={pinDialog.open}
          title={pinDialog.title}
          description={pinDialog.description}
          onConfirm={pinDialog.onConfirm}
          onCancel={() => setPinDialog(null)}
          loading={pinLoading}
        />
      )}

      {/* Direct Void Dialog */}
      <Dialog open={!!directVoidDialog} onOpenChange={v => !v && setDirectVoidDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Direct Void</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Reason (required)</Label>
              <Input placeholder="e.g. Customer changed mind" value={dvReason} onChange={e => setDvReason(e.target.value)} />
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="wpc" checked={dvWpc} onChange={e => setDvWpc(e.target.checked)} className="size-4 rounded" />
              <Label htmlFor="wpc">Cash was already collected from customer</Label>
            </div>
            {dvWpc && <p className="text-xs text-amber-400">⚠ Order will enter Pending Cash Resolution — Admin must account for the cash before void completes.</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDirectVoidDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={submitDirectVoid} disabled={!dvReason} className="active:scale-[0.97] transition-transform duration-100">Void Order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Amend Dialog */}
      <Dialog open={!!amendDialog} onOpenChange={v => !v && setAmendDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Amend Order</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-2">
            <div className="flex flex-col gap-1.5">
              <Label>Table Number</Label>
              <Input value={amendDialog?.tableNumber} onChange={e => setAmendDialog(prev => prev ? { ...prev, tableNumber: e.target.value } : null)} />
            </div>
            
            <div className="flex flex-col gap-2">
              <Label>Items</Label>
              {amendDialog?.items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center bg-muted/50 p-2 rounded border border-border/50">
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm">{item.productName}</span>
                    <span className="text-xs text-muted-foreground">ETB {item.unitPrice}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setAmendDialog(prev => {
                      if (!prev) return prev;
                      const newItems = [...prev.items];
                      if (newItems[idx].quantity > 1) newItems[idx].quantity--;
                      else newItems.splice(idx, 1);
                      return { ...prev, items: newItems };
                    })} className="size-6 bg-background border rounded flex items-center justify-center">-</button>
                    <span className="text-sm font-medium w-4 text-center">{item.quantity}</span>
                    <button onClick={() => setAmendDialog(prev => {
                      if (!prev) return prev;
                      const newItems = [...prev.items];
                      newItems[idx].quantity++;
                      return { ...prev, items: newItems };
                    })} className="size-6 bg-background border rounded flex items-center justify-center">+</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-1.5 mt-2">
              <Label>Add Item</Label>
              <select
                onChange={e => {
                  const pId = e.target.value;
                  if (!pId) return;
                  const product = menuData?.products.find((p: any) => p.id === pId);
                  if (product) {
                    setAmendDialog(prev => {
                      if (!prev) return prev;
                      const newItems = [...prev.items];
                      const existing = newItems.find(i => i.productId === product.id);
                      if (existing) existing.quantity++;
                      else newItems.push({ productId: product.id, productName: product.name, unitPrice: product.price, quantity: 1 });
                      return { ...prev, items: newItems };
                    });
                  }
                  e.target.value = '';
                }}
                className="w-full px-3 py-2 rounded-md bg-background border border-input text-sm focus:ring-1 focus:ring-ring focus:outline-none"
              >
                <option value="">Select product to add...</option>
                {menuData?.products.filter((p: any) => p.isAvailable).map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name} (ETB {p.price})</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5 mt-2">
              <Label>Reason (required)</Label>
              <Input placeholder="e.g. Customer wants to swap items" value={amendDialog?.reason} onChange={e => setAmendDialog(prev => prev ? { ...prev, reason: e.target.value } : null)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAmendDialog(null)}>Cancel</Button>
            <Button onClick={submitAmendRequest} disabled={!amendDialog?.reason || amendDialog.items.length === 0} className="active:scale-[0.97] transition-transform duration-100">Request Amend</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reconciliation Dialog */}
      <Dialog open={!!reconDialog} onOpenChange={v => !v && setReconDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Shift Reconciliation — {reconDialog?.waitressName}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-5">
            <div className="p-3 rounded-lg bg-muted flex items-center justify-between">
              <span className="text-sm text-muted-foreground">System Expected Cash</span>
              <span className="font-bold text-muted-foreground">HIDDEN</span>
            </div>
            <Separator />
            <div className="flex flex-col gap-3">
              <h4 className="text-sm font-medium">Waitstaff Declaration (at register)</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5"><Label>Amount (ETB)</Label><Input type="number" placeholder="0" value={recon.waitressDeclared} onChange={e => setRecon(p => ({ ...p, waitressDeclared: e.target.value }))} /></div>
                <div className="flex flex-col gap-1.5"><Label>Waitstaff PIN</Label><Input type="password" maxLength={4} placeholder="••••" value={recon.waitressPin} onChange={e => setRecon(p => ({ ...p, waitressPin: e.target.value }))} className="tracking-[0.5em] text-center" /></div>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <h4 className="text-sm font-medium">Cashier Count</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5"><Label>Amount (ETB)</Label><Input type="number" placeholder="0" value={recon.cashierDeclared} onChange={e => setRecon(p => ({ ...p, cashierDeclared: e.target.value }))} /></div>
                <div className="flex flex-col gap-1.5"><Label>Cashier PIN</Label><Input type="password" maxLength={4} placeholder="••••" value={recon.cashierPin} onChange={e => setRecon(p => ({ ...p, cashierPin: e.target.value }))} className="tracking-[0.5em] text-center" /></div>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReconDialog(null)} disabled={isSubmittingRecon}>Cancel</Button>
            <Button onClick={submitDualDeclaration} disabled={isSubmittingRecon || !recon.waitressDeclared || !recon.cashierDeclared || !recon.waitressPin || !recon.cashierPin} className="active:scale-[0.97] transition-transform duration-100">
              {isSubmittingRecon ? 'Submitting...' : 'Submit Reconciliation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden Printable Receipt */}
      {printOrder && (
        <div className="hidden print:block fixed inset-0 bg-white text-black text-sm p-4 z-[9999]">
          <div className="w-full max-w-sm mx-auto flex flex-col gap-2">
            <h1 className="text-xl font-bold text-center">DigitalBon Cafe</h1>
            <p className="text-center text-xs text-gray-500 mb-2">Invoice / Receipt</p>
            <div className="flex justify-between border-b border-black pb-2">
              <div>
                <p>Table: <span className="font-bold text-base">{printOrder.tableNumber}</span></p>
                <p>Waitress: {printOrder.waitress?.name || 'Unknown'}</p>
              </div>
              <div className="text-right text-xs">
                <p>{new Date().toLocaleDateString()}</p>
                <p>{new Date().toLocaleTimeString()}</p>
                <p>Order #{printOrder.id.slice(-6).toUpperCase()}</p>
              </div>
            </div>
            
            <table className="w-full text-left my-2">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="py-1">Qty</th>
                  <th className="py-1">Item</th>
                  <th className="py-1 text-right">Price</th>
                  <th className="py-1 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {printOrder.items.map((item, idx) => (
                  <tr key={idx} className="border-b border-dashed border-gray-300">
                    <td className="py-1">{item.quantity}</td>
                    <td className="py-1">{item.productName}</td>
                    <td className="py-1 text-right">{item.unitPrice}</td>
                    <td className="py-1 text-right">{item.unitPrice * item.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            <div className="flex justify-between items-center text-lg font-bold border-t border-black pt-2 mt-2">
              <span>TOTAL</span>
              <span>ETB {printOrder.totalAmount}</span>
            </div>
            <p className="text-center text-xs mt-6">Thank you for visiting DigitalBon Cafe!</p>
          </div>
        </div>
      )}
      {/* Reject Void Dialog */}
      <Dialog open={!!rejectVoidDialog} onOpenChange={(open) => !open && setRejectVoidDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Void Request?</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>Are you sure you want to reject this void request? The order will be restored to its previous state.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectVoidDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={submitRejectVoid}>Reject Void</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CashierPage() {
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
          className="w-80 bg-card border border-border rounded-2xl p-6 flex flex-col gap-4"
        >
          <div className="text-center">
            <div className="text-3xl mb-2">🏦</div>
            <h1 className="text-lg font-bold">Cashier Login</h1>
          </div>
          {!CAFE_CODE && (
            <input type="text" placeholder="Cafe Code" value={cafeCode} onChange={e => setCafeCode(e.target.value.toUpperCase())}
              className="px-3 py-2 rounded-lg bg-muted border border-border text-sm font-mono text-center uppercase" />
          )}
          <input type="password" maxLength={4} placeholder="PIN" value={pin}
            onChange={e => setPin(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            className="px-3 py-2 rounded-lg bg-muted border border-border text-sm text-center tracking-[0.5em]" />
          <Button onClick={handleLogin} disabled={loading || pin.length !== 4 || !cafeCode} className="active:scale-[0.97] transition-transform duration-100">
            {loading ? 'Signing in…' : 'Enter Cashier Register'}
          </Button>
        </motion.div>
      </div>
    );
  }

  return <CashierDashboard onLogout={handleLogout} />;
}
