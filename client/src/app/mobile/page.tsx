'use client';

import { useState, useEffect } from 'react';
import { getTokenKey } from '@/lib/apollo';
import { gql } from '@apollo/client';
import { useQuery, useMutation, useSubscription } from '@apollo/client/react';
import { motion, AnimatePresence } from 'motion/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';

// ─── GraphQL ──────────────────────────────────────────────────────────────────
const LOGIN = gql`
  mutation Login($pin: String!, $cafeCode: String!) {
    login(pin: $pin, cafeCode: $cafeCode) {
      token
      user { id name cafeId }
    }
  }
`;

const GET_MENU = gql`
  query GetMenu {
    categories { id name order }
    products { id categoryId name price isAvailable }
  }
`;

const GET_TABLES = gql`
  query GetTableOccupancy {
    tableOccupancy { tableNumber isOccupied orderId waitressName }
  }
`;

const ORDER_CREATED = gql`
  subscription { orderCreated { id status } }
`;



const GET_MY_ORDERS = gql`
  query GetMyOrders {
    orders(status: null) {
      id tableNumber status totalAmount paymentMethod createdAt waitress { id }
      items { productName quantity unitPrice }
    }
  }
`;

const OPEN_SHIFT = gql`
  mutation OpenShift { openShift { id status openedAt } }
`;

const CREATE_ORDER = gql`
  mutation CreateOrder($input: CreateOrderInput!) {
    createOrder(input: $input) { id tableNumber status totalAmount }
  }
`;

const REQUEST_VOID = gql`
  mutation RequestVoid($orderId: ID!, $reason: String!) {
    requestOrderVoid(orderId: $orderId, reason: $reason) { id status }
  }
`;

const SET_PAYMENT_METHOD = gql`
  mutation SetPayment($orderId: ID!, $paymentMethod: String!) {
    setOrderPaymentMethod(orderId: $orderId, paymentMethod: $paymentMethod) { id paymentMethod }
  }
`;

const ORDER_UPDATED = gql`
  subscription OrderUpdated { orderUpdated { id tableNumber status totalAmount paymentMethod } }
`;

const MENU_UPDATED_SUB = gql`
  subscription MenuUpdated { menuUpdated }
`;

// ─── Types ────────────────────────────────────────────────────────────────────
type CartItem = { productId: string; productName: string; price: number; quantity: number };

const CAFE_CODE = process.env.NEXT_PUBLIC_CAFE_CODE || '';

const statusColors: Record<string, string> = {
  PENDING: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  PRINTED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  PRINT_FAILED: 'bg-red-500/15 text-red-400 border-red-500/30',
  VOID_REQUESTED: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  SETTLED: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  VOIDED: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: (token: string, cafeId: string, userId: string, name: string) => void }) {
  const [pin, setPin] = useState('');
  const [cafeCode, setCafeCode] = useState(CAFE_CODE);
  const [loginMutation, { loading }] = useMutation(LOGIN);

  const handleLogin = async (currentPin: string = pin) => {
    if (currentPin.length !== 4) return;
    try {
      const { data } = await loginMutation({ variables: { pin: currentPin, cafeCode } });
      localStorage.setItem(getTokenKey(), (data as any).login.token);
      localStorage.setItem('db_cafeId', (data as any).login.user.cafeId);
      localStorage.setItem('db_mobile_userId', (data as any).login.user.id);
      localStorage.setItem('db_mobile_userName', (data as any).login.user.name);
      onLogin((data as any).login.token, (data as any).login.user.cafeId, (data as any).login.user.id, (data as any).login.user.name);
    } catch (e: any) {
      toast.error('Invalid PIN. Please try again.');
      setPin('');
    }
  };

  const handleKey = (k: string) => {
    if (k === 'DEL') { setPin(p => p.slice(0, -1)); return; }
    if (pin.length >= 4) return;
    const next = pin + k;
    setPin(next);
    if (next.length === 4) setTimeout(() => handleLogin(next), 100);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, transform: 'scale(0.95) translateY(8px)' }}
        animate={{ opacity: 1, transform: 'scale(1) translateY(0px)' }}
        transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
      >
        <Card className="w-80 bg-card/80 backdrop-blur-sm border-border/50">
          <CardHeader className="text-center pb-2">
            <div className="text-3xl mb-2">☕</div>
            <CardTitle className="text-xl">DigitalBon</CardTitle>
            <p className="text-sm text-muted-foreground">Enter your 4-digit PIN</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!CAFE_CODE && (
              <input type="text" placeholder="Cafe Code"
                value={cafeCode}
                onChange={e => setCafeCode(e.target.value.toUpperCase())}
                className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-center font-mono uppercase mb-4" />
            )}
            {/* PIN dots */}
            <div className="flex justify-center gap-3 py-2">
              {[0, 1, 2, 3].map(i => (
                <motion.div
                  key={i}
                  className={`size-4 rounded-full border-2 transition-colors duration-150 ${i < pin.length ? 'bg-primary border-primary' : 'border-border'}`}
                  animate={{ transform: i < pin.length ? 'scale(1.2)' : 'scale(1)' }}
                  transition={{ duration: 0.1 }}
                />
              ))}
            </div>
            {/* Numpad */}
            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'DEL'].map((k, i) => (
                <button
                  key={i}
                  onClick={() => k && handleKey(k)}
                  disabled={loading}
                  className={`
                    h-14 rounded-xl text-lg font-medium transition-all duration-100
                    active:scale-95
                    ${k ? 'bg-muted hover:bg-muted/80 text-foreground' : 'invisible'}
                    ${k === 'DEL' ? 'text-sm text-muted-foreground' : ''}
                  `}
                >
                  {k}
                </button>
              ))}
            </div>
            <Button onClick={() => handleLogin(pin)} disabled={loading || pin.length !== 4 || !cafeCode}
              className="w-full mt-6 py-6 rounded-2xl text-lg font-bold">
              {loading ? 'Signing in…' : 'Enter'}
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

// ─── Main PWA ─────────────────────────────────────────────────────────────────
export default function WaitstaffPWA() {
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [tableNumber, setTableNumber] = useState('');
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [lastOrderStatus, setLastOrderStatus] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [shiftOpen, setShiftOpen] = useState(false);

  const { data: menuData, loading: menuLoading, refetch: refetchMenu } = useQuery<any>(GET_MENU, { skip: !token });
  const { data: tablesData, loading: tablesLoading, refetch: refetchTables } = useQuery<any>(GET_TABLES, { skip: !token });
  const { data: myOrdersData, refetch: refetchOrders } = useQuery<any>(GET_MY_ORDERS, { skip: !token, pollInterval: 5000 });

  const [openShiftMutation] = useMutation(OPEN_SHIFT);
  const [createOrder, { loading: ordering }] = useMutation(CREATE_ORDER);
  const [requestVoid] = useMutation(REQUEST_VOID);
  const [setPaymentMethod] = useMutation(SET_PAYMENT_METHOD);

  const [activeTab, setActiveTab] = useState<'tables' | 'orders'>('tables');
  const [requestVoidDialog, setRequestVoidDialog] = useState<string | null>(null);

  // Subscriptions
  useSubscription<any>(ORDER_CREATED, {
    skip: !token,
    onData: () => {
      refetchTables();
      refetchOrders();
    },
  });
  useSubscription<any>(ORDER_UPDATED, {
    skip: !token,
    onData: ({ data }) => {
      const updated = (data.data as any)?.orderUpdated;
      if (updated?.id === lastOrderId) setLastOrderStatus(updated.status);
      refetchTables();
      refetchOrders();
    },
  });
  useSubscription<any>(MENU_UPDATED_SUB, {
    skip: !token,
    onData: () => {
      refetchMenu();
    },
  });

  useEffect(() => {
    const t = localStorage.getItem(getTokenKey());
    const cid = localStorage.getItem('db_cafeId');
    const uid = localStorage.getItem('db_mobile_userId');
    const uname = localStorage.getItem('db_mobile_userName');
    if (t && cid && uid) {
      setToken(t);
      setUserId(uid);
      if (uname) setUserName(uname);
    }
  }, []);

  useEffect(() => {
    if (token && !shiftOpen) {
      openShiftMutation()
        .then(() => setShiftOpen(true))
        .catch(e => {
          const msg = e?.graphQLErrors?.[0]?.message || e?.message || '';
          if (msg.includes('UNAUTHENTICATED')) {
            toast.error('Session error — please log in again');
            setToken(null);
            localStorage.removeItem(getTokenKey());
            localStorage.removeItem('db_mobile_userId');
            localStorage.removeItem('db_mobile_userName');
          } else {
            setShiftOpen(true);
          }
        });
    }
  }, [token, shiftOpen, openShiftMutation]);



  useEffect(() => {
    if (menuData?.categories?.length && !activeCategory) {
      setActiveCategory(menuData.categories[0].id);
    }
  }, [menuData, activeCategory]);

  const handleLogin = (t: string, cid: string, uid: string, name: string) => {
    setToken(t);
    setUserId(uid);
    setUserName(name);
    // The useEffect above will handle calling openShiftMutation
  };

  const handleLogout = () => {
    localStorage.removeItem(getTokenKey());
    localStorage.removeItem('db_mobile_userId');
    localStorage.removeItem('db_mobile_userName');
    setToken(null);
    window.location.reload();
  };

  if (!token) return <LoginScreen onLogin={handleLogin} />;

  const categories = menuData?.categories || [];
  const products = menuData?.products || [];
  const filteredProducts = products.filter((p: any) => p.categoryId === activeCategory);
  const cartTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  const addToCart = (product: any) => {
    setCart(prev => {
      const exists = prev.find(i => i.productId === product.id);
      if (exists) return prev.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { productId: product.id, productName: product.name, price: product.price, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => setCart(prev => prev.filter(i => i.productId !== productId));

  const handleSendOrder = async () => {
    if (!tableNumber || cart.length === 0) return;
    try {
      const { data } = await createOrder({
        variables: { input: { tableNumber, items: cart.map(i => ({ productId: i.productId, quantity: i.quantity })) } },
      });
      setLastOrderId((data as any).createOrder.id);
      setLastOrderStatus((data as any).createOrder.status);
      setCart([]);
      setTableNumber('');
      refetchTables();
      toast.success(`Order sent for Table ${(data as any).createOrder.tableNumber}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleRequestVoid = async () => {
    if (!requestVoidDialog) return;
    try {
      await requestVoid({ variables: { id: requestVoidDialog } });
      toast.success('Void requested — alerting Cashier');
      setRequestVoidDialog(null);
      refetchOrders();
    } catch (e: any) { toast.error(e.message); }
  };

  const tables = tablesData?.tableOccupancy || [];

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto">
      {/* Header */}
      <div className="px-4 pt-safe-top pt-4 pb-2 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Welcome back</p>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{userName}</h1>
            <button onClick={handleLogout} className="text-xs text-destructive hover:underline font-medium">
              Logout
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`size-2 rounded-full ${shiftOpen ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
          <span className="text-xs text-muted-foreground">{shiftOpen ? 'Shift Open' : 'No Shift'}</span>
        </div>
      </div>

      {/* Last order status */}
      <AnimatePresence>
        {lastOrderId && lastOrderStatus && (
          <motion.div
            initial={{ opacity: 0, transform: 'translateY(-8px)' }}
            animate={{ opacity: 1, transform: 'translateY(0)' }}
            exit={{ opacity: 0, transform: 'translateY(-8px)' }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="mx-4 mb-2"
          >
            <div className={`px-3 py-2 rounded-lg border text-xs flex items-center justify-between ${statusColors[lastOrderStatus] || 'bg-muted'}`}>
              <span>Last order status</span>
              <span className="font-semibold">{lastOrderStatus}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto pb-20">
        {activeTab === 'tables' && (
          !tableNumber ? (
            <div className="px-4">
              <h2 className="text-sm font-semibold mb-3">Select a Table</h2>
              {tablesLoading ? (
                <div className="grid grid-cols-3 gap-3">
                  {Array(9).fill(0).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
                </div>
              ) : tables.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-sm text-muted-foreground mb-2">No tables configured.</p>
                  <p className="text-xs text-muted-foreground">Ask the Cafe Admin to add tables in the dashboard.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3 pb-4">
                  {tables.map((t: any) => (
                    <button
                      key={t.tableNumber}
                      onClick={() => setTableNumber(t.tableNumber)}
                      className={`relative p-3 text-center rounded-xl border transition-all duration-150 active:scale-95 flex flex-col items-center justify-center h-20 ${t.isOccupied
                          ? 'bg-amber-500/10 border-amber-500/30'
                          : 'bg-card border-border hover:bg-card/80'
                        }`}
                    >
                      <span className="font-bold text-lg">{t.tableNumber}</span>
                      {t.isOccupied ? (
                        <span className="text-[10px] text-amber-500 mt-1 font-medium truncate w-full px-1">{t.waitressName}</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground mt-1 font-medium">Available</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="px-4 pb-3 flex justify-between items-center shrink-0">
                <h2 className="text-sm font-semibold">
                  Ordering for <span className="text-primary font-bold">{tableNumber}</span>
                </h2>
                <button
                  onClick={() => { setTableNumber(''); setCart([]); }}
                  className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
                >
                  Change Table
                </button>
              </div>

              {/* Category tabs */}
              <div className="flex gap-2 px-4 overflow-x-auto pb-3 scrollbar-none">
                {menuLoading
                  ? Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-8 w-20 rounded-full shrink-0" />)
                  : categories.map((cat: any) => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                      className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap shrink-0 transition-all duration-150 ${activeCategory === cat.id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                    >
                      {cat.name}
                    </button>
                  ))}
              </div>

              {/* Product grid */}
              <div className="flex-1 px-4 overflow-y-auto">
                {menuLoading ? (
                  <div className="grid grid-cols-2 gap-3">
                    {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 pb-4">
                    {filteredProducts.map((product: any, idx: number) => {
                      const available = product.isAvailable;
                      const inCart = cart.find(i => i.productId === product.id);
                      return (
                        <motion.button
                          key={product.id}
                          initial={{ opacity: 0, transform: 'translateY(8px)' }}
                          animate={{ opacity: 1, transform: 'translateY(0)' }}
                          transition={{ delay: idx * 0.04, duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                          onClick={() => available && addToCart(product)}
                          disabled={!available}
                          className={`
                    relative text-left rounded-xl p-4 border transition-all duration-150
                    active:scale-95
                    ${available
                              ? inCart
                                ? 'bg-primary/10 border-primary/50 ring-1 ring-primary/30'
                                : 'bg-card border-border hover:bg-card/80'
                              : 'bg-muted/50 border-border/30 opacity-50 cursor-not-allowed'
                            }
                  `}
                        >
                          <p className="font-medium text-sm leading-tight">{product.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">ETB {product.price}</p>
                          {inCart && (
                            <span className="absolute top-2 right-2 size-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">
                              {inCart.quantity}
                            </span>
                          )}
                          {!available && (
                            <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/60 text-xs font-semibold text-red-400">
                              OUT OF STOCK
                            </span>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        )}

        {activeTab === 'orders' && (
          <div className="px-4 flex flex-col gap-4">
            <h2 className="text-sm font-semibold mb-1">My Active Orders</h2>
            {myOrdersData?.orders?.filter((o: any) => o.waitress?.id === userId && ['PENDING', 'PRINTED', 'PRINT_FAILED'].includes(o.status)).length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">You have no active orders.</div>
            ) : (
              myOrdersData?.orders?.filter((o: any) => o.waitress?.id === userId && ['PENDING', 'PRINTED', 'PRINT_FAILED'].includes(o.status)).map((order: any) => (
                <motion.div key={order.id} className="p-4 rounded-xl border bg-card flex flex-col gap-3" layout>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg">{order.tableNumber}</span>
                      <Badge variant="outline" className={`text-xs ${statusColors[order.status] || ''}`}>{order.status}</Badge>
                    </div>
                    <span className="font-semibold text-sm">ETB {order.totalAmount}</span>
                  </div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-1">
                    {order.items.map((i: any, idx: number) => <span key={idx}>{i.quantity}× {i.productName}</span>)}
                  </div>
                  <div className="flex flex-col gap-1.5 mt-2">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">Payment Method</span>
                    <div className="flex gap-2">
                      {['CASH', 'TELEBIRR', 'BANK'].map(pm => (
                        <button
                          key={pm}
                          onClick={() => setPaymentMethod({ variables: { orderId: order.id, paymentMethod: pm } })}
                          className={`flex-1 py-1.5 rounded-md text-xs font-medium border transition-colors ${order.paymentMethod === pm ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border'}`}
                        >
                          {pm}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-1 flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => setRequestVoidDialog(order.id)} className="h-7 text-[10px] text-destructive hover:bg-destructive/10 border-destructive/30">
                      Request Void
                    </Button>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Cart & Send (Only in tables view when a table is selected) */}
      {activeTab === 'tables' && tableNumber && (
        <div className="fixed bottom-14 left-0 right-0 z-40 max-w-md mx-auto">
          <AnimatePresence>
            {cart.length > 0 && (
              <motion.div
                initial={{ opacity: 0, transform: 'translateY(100%)' }}
                animate={{ opacity: 1, transform: 'translateY(0)' }}
                exit={{ opacity: 0, transform: 'translateY(100%)' }}
                transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                className="border-t border-border bg-card/95 backdrop-blur-md px-4 py-3 shadow-lg rounded-t-2xl"
              >
                <div className="flex flex-col gap-2 mb-3 max-h-32 overflow-y-auto">
                  {cart.map(item => (
                    <div key={item.productId} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{item.quantity}× {item.productName}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">ETB {item.price * item.quantity}</span>
                        <button onClick={() => removeFromCart(item.productId)} className="text-xs text-red-400 hover:text-red-300">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between font-bold mb-4">
                  <span>Total</span>
                  <span className="text-lg">ETB {cartTotal}</span>
                </div>
                <Button
                  onClick={handleSendOrder}
                  disabled={ordering || !tableNumber || cart.length === 0}
                  className="w-full py-6 text-base font-bold rounded-xl active:scale-[0.98] transition-transform"
                >
                  {ordering ? 'Sending...' : `Send Order · ETB ${cartTotal}`}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
          {tableNumber && cart.length === 0 && (
            <div className="border-t border-border bg-card/95 backdrop-blur-md px-4 py-3 shadow-lg rounded-t-2xl">
              <Button disabled className="w-full py-5 text-base font-bold rounded-xl opacity-50">Select items to order</Button>
            </div>
          )}
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background pb-safe-bottom max-w-md mx-auto flex">
        <button
          onClick={() => setActiveTab('tables')}
          className={`flex-1 py-3 text-xs font-semibold flex flex-col items-center gap-1 transition-colors ${activeTab === 'tables' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <span className="text-lg">🍽️</span> Tables
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`flex-1 py-3 text-xs font-semibold flex flex-col items-center gap-1 transition-colors ${activeTab === 'orders' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <span className="text-lg">📝</span> My Orders
        </button>
      </div>

      <Dialog open={!!requestVoidDialog} onOpenChange={(open) => !open && setRequestVoidDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Request Void?</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>Are you sure you want to request a void for this order? This will immediately alert the cashier.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestVoidDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRequestVoid}>Request Void</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
