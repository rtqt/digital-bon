'use client';

import { useState, useEffect } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

// ─── GraphQL ──────────────────────────────────────────────────────────────────
const LOGIN = gql`mutation Login($pin: String!, $cafeCode: String!) { login(pin: $pin, cafeCode: $cafeCode) { token user { id name cafeId } } }`;
const GET_MENU = gql`query { categories { id name order } products { id categoryId name price cost isAvailable } }`;
const GET_STAFF = gql`query { users { id name status currentLiability role { name } } roles { id name permissions scope } }`;
const GET_CAFE = gql`query { cafe { id name tables shortageAlertThreshold declarationGapAlertThreshold } }`;

const TOGGLE_AVAILABILITY = gql`mutation Toggle($id: ID!, $v: Boolean!) { toggleProductAvailability(id: $id, isAvailable: $v) { id isAvailable } }`;
const CREATE_CATEGORY = gql`mutation($name: String!, $order: Int) { createCategory(name: $name, order: $order) { id name } }`;
const UPDATE_CATEGORY = gql`mutation($id: ID!, $name: String, $order: Int) { updateCategory(id: $id, name: $name, order: $order) { id name order } }`;
const CREATE_PRODUCT = gql`mutation($catId: ID!, $name: String!, $price: Float!, $cost: Float!) { createProduct(categoryId: $catId, name: $name, price: $price, cost: $cost) { id name } }`;
const UPDATE_PRODUCT = gql`mutation($id: ID!, $name: String, $price: Float, $cost: Float) { updateProduct(id: $id, name: $name, price: $price, cost: $cost) { id name price } }`;
const DELETE_PRODUCT = gql`mutation($id: ID!) { deleteProduct(id: $id) }`;
const CREATE_USER = gql`mutation($name: String!, $roleId: ID!, $pin: String!) { createUser(name: $name, roleId: $roleId, pin: $pin) { id name } }`;
const UPDATE_USER = gql`mutation($id: ID!, $name: String, $pin: String, $status: String) { updateUser(id: $id, name: $name, pin: $pin, status: $status) { id name status } }`;
const CREATE_ROLE = gql`mutation($name: String!, $perms: [String!]!) { createRole(name: $name, permissions: $perms) { id name } }`;
const UPDATE_CAFE_TABLES = gql`mutation($tables: [String!]!) { updateCafeTables(tables: $tables) { id tables } }`;
const MENU_UPDATED_SUB = gql`subscription MenuUpdated { menuUpdated }`;
const GET_SHORTAGE_SHIFTS = gql`query { shortageShifts { id status systemExpectedCash waitress { id name currentLiability } } }`;
const COUNTERSIGN_SHORTAGE = gql`mutation($shiftId: ID!, $adminPin: String!) { countersignShortage(shiftId: $shiftId, adminPin: $adminPin) { id status } }`;
const GET_AMEND_REQUESTS = gql`query { orders(status: "AMEND_REQUESTED") { id tableNumber requestedAmendment { tableNumber items { productName quantity unitPrice } reason } waitress { name } createdAt } }`;
const APPROVE_AMEND = gql`mutation($id: ID!) { approveAmendment(orderId: $id) { id status } }`;
const REJECT_AMEND = gql`mutation($id: ID!) { rejectAmendment(orderId: $id) { id status } }`;
const ORDER_UPDATED_SUB = gql`subscription { orderUpdated { id status } }`;

const CAFE_CODE = process.env.NEXT_PUBLIC_CAFE_CODE || '';

const ALL_PERMISSIONS = [
  'CREATE_ORDER', 'SETTLE_ORDER', 'REQUEST_VOID', 'APPROVE_VOID', 'REJECT_VOID',
  'DIRECT_VOID', 'RESOLVE_CASH', 'INITIATE_RECONCILIATION', 'AMEND_ORDER',
  'UNLOCK_VOID', 'MANAGE_MENU', 'MANAGE_STAFF', 'VIEW_ANALYTICS', 'CAFE_ADMIN',
];

// ─── Menu Management ──────────────────────────────────────────────────────────
function MenuTab() {
  const { data, loading, refetch } = useQuery<any>(GET_MENU);
  useSubscription<any>(MENU_UPDATED_SUB, { onData: () => refetch() });
  const [toggleAvailability] = useMutation(TOGGLE_AVAILABILITY);
  const [createCategory] = useMutation(CREATE_CATEGORY);
  const [updateCategory] = useMutation(UPDATE_CATEGORY);
  const [createProduct] = useMutation(CREATE_PRODUCT);
  const [updateProduct] = useMutation(UPDATE_PRODUCT);
  const [deleteProduct] = useMutation(DELETE_PRODUCT);

  const [newCat, setNewCat] = useState('');
  const [newProd, setNewProd] = useState({ categoryId: '', name: '', price: '', cost: '' });
  
  // Editing state
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');
  
  const [editProdId, setEditProdId] = useState<string | null>(null);
  const [editProd, setEditProd] = useState({ name: '', price: '', cost: '' });

  const [deleteProdId, setDeleteProdId] = useState<string | null>(null);

  const handleToggle = async (id: string, isAvailable: boolean) => {
    try {
      await toggleAvailability({ variables: { id, v: isAvailable } });
      toast.success(`Item ${isAvailable ? 'restored' : "86'd"}`);
      refetch();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleAddCategory = async () => {
    if (!newCat) return;
    try {
      await createCategory({ variables: { name: newCat, order: ((data as any)?.categories?.length ?? 0) + 1 } });
      setNewCat('');
      refetch();
      toast.success('Category added');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleUpdateCategory = async (id: string) => {
    if (!editCatName) return;
    try {
      await updateCategory({ variables: { id, name: editCatName } });
      setEditCatId(null);
      refetch();
      toast.success('Category updated');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleAddProduct = async () => {
    if (!newProd.categoryId || !newProd.name || !newProd.price) return;
    try {
      await createProduct({ variables: { catId: newProd.categoryId, name: newProd.name, price: parseFloat(newProd.price), cost: parseFloat(newProd.cost || '0') } });
      setNewProd({ categoryId: '', name: '', price: '', cost: '' });
      refetch();
      toast.success('Product added');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleUpdateProduct = async (id: string) => {
    if (!editProd.name || !editProd.price) return;
    try {
      await updateProduct({ variables: { id, name: editProd.name, price: parseFloat(editProd.price), cost: parseFloat(editProd.cost || '0') } });
      setEditProdId(null);
      refetch();
      toast.success('Product updated');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async () => {
    if (!deleteProdId) return;
    try {
      await deleteProduct({ variables: { id: deleteProdId } });
      setDeleteProdId(null);
      refetch();
      toast.success('Product removed');
    } catch (e: any) { toast.error(e.message); }
  };

  const categories = (data as any)?.categories || [];
  const products = (data as any)?.products || [];

  return (
    <div className="flex flex-col gap-8">
      {/* Creation Section */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Add Category */}
        <Card className="bg-gradient-to-br from-card to-card/50 border-border/50 shadow-sm backdrop-blur-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm text-primary">Add Category</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input placeholder="Category name" value={newCat} onChange={e => setNewCat(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddCategory()} className="bg-background/50" />
              <Button onClick={handleAddCategory} disabled={!newCat} className="shrink-0 active:scale-[0.97] transition-transform duration-100">Add</Button>
            </div>
          </CardContent>
        </Card>

        {/* Add Product */}
        <Card className="bg-gradient-to-br from-card to-card/50 border-border/50 shadow-sm backdrop-blur-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm text-primary">Add Product</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="col-span-2">
                <select
                  value={newProd.categoryId}
                  onChange={e => setNewProd(p => ({ ...p, categoryId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-md bg-background/50 border border-input text-sm focus:ring-2 focus:ring-ring focus:outline-none"
                >
                  <option value="">Select category…</option>
                  {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="col-span-2"><Input placeholder="Product name" value={newProd.name} onChange={e => setNewProd(p => ({ ...p, name: e.target.value }))} className="bg-background/50" /></div>
              <Input placeholder="Price (ETB)" type="number" value={newProd.price} onChange={e => setNewProd(p => ({ ...p, price: e.target.value }))} className="bg-background/50" />
              <Input placeholder="Cost (ETB)" type="number" value={newProd.cost} onChange={e => setNewProd(p => ({ ...p, cost: e.target.value }))} className="bg-background/50" />
            </div>
            <Button onClick={handleAddProduct} disabled={!newProd.categoryId || !newProd.name || !newProd.price} className="w-full active:scale-[0.97] transition-transform duration-100">Add Product</Button>
          </CardContent>
        </Card>
      </div>

      {/* Menu list */}
      <div className="space-y-6">
        {loading ? (
          <div className="flex flex-col gap-3">{Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : (
          categories.map((cat: any) => {
            const catProducts = products.filter((p: any) => p.categoryId === cat.id);
            return (
              <div key={cat.id} className="bg-card/30 rounded-2xl p-4 border border-border/30 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  {editCatId === cat.id ? (
                    <div className="flex items-center gap-2 w-full max-w-sm">
                      <Input value={editCatName} onChange={e => setEditCatName(e.target.value)} className="h-8 text-sm bg-background" autoFocus onKeyDown={e => e.key === 'Enter' && handleUpdateCategory(cat.id)} />
                      <Button size="sm" onClick={() => handleUpdateCategory(cat.id)}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditCatId(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-bold text-primary tracking-wide">{cat.name}</h3>
                      <button onClick={() => { setEditCatId(cat.id); setEditCatName(cat.name); }} className="text-xs text-muted-foreground hover:text-primary transition-colors">✎ Edit</button>
                    </div>
                  )}
                </div>
                
                <div className="grid gap-3 md:grid-cols-2">
                  <AnimatePresence>
                    {catProducts.map((prod: any, idx: number) => (
                      <motion.div
                        key={prod.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: idx * 0.02, duration: 0.2 }}
                        className={`group relative flex flex-col justify-between p-4 rounded-xl border transition-all duration-300 ${prod.isAvailable ? 'border-border/60 bg-card hover:shadow-md hover:border-primary/30' : 'border-destructive/20 bg-destructive/5 opacity-70 grayscale-[30%]'}`}
                      >
                        {editProdId === prod.id ? (
                          <div className="flex flex-col gap-2">
                            <Input value={editProd.name} onChange={e => setEditProd(p => ({ ...p, name: e.target.value }))} className="h-8 text-sm" placeholder="Name" />
                            <div className="flex gap-2">
                              <Input type="number" value={editProd.price} onChange={e => setEditProd(p => ({ ...p, price: e.target.value }))} className="h-8 text-sm" placeholder="Price" />
                              <Input type="number" value={editProd.cost} onChange={e => setEditProd(p => ({ ...p, cost: e.target.value }))} className="h-8 text-sm" placeholder="Cost" />
                            </div>
                            <div className="flex justify-end gap-2 mt-2">
                              <Button size="sm" variant="ghost" onClick={() => setEditProdId(null)} className="h-8 text-xs">Cancel</Button>
                              <Button size="sm" onClick={() => handleUpdateProduct(prod.id)} className="h-8 text-xs">Save</Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <p className={`text-base font-semibold ${!prod.isAvailable ? 'line-through text-muted-foreground' : ''}`}>{prod.name}</p>
                                <p className="text-xs text-muted-foreground font-medium mt-0.5">ETB {prod.price} <span className="opacity-50">· Cost {prod.cost}</span></p>
                              </div>
                              <button onClick={() => { setEditProdId(prod.id); setEditProd({ name: prod.name, price: prod.price.toString(), cost: prod.cost.toString() }); }} className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-muted-foreground hover:text-primary">
                                ✎ Edit
                              </button>
                            </div>

                            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/40">
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={prod.isAvailable}
                                  onCheckedChange={v => handleToggle(prod.id, v)}
                                  className={prod.isAvailable ? 'data-[state=checked]:bg-green-500' : 'data-[state=unchecked]:bg-destructive'}
                                />
                                <span className={`text-xs font-semibold ${prod.isAvailable ? 'text-green-500' : 'text-destructive'}`}>
                                  {prod.isAvailable ? 'Available' : "86'd (Out of Stock)"}
                                </span>
                              </div>
                              <button onClick={() => setDeleteProdId(prod.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-destructive hover:bg-destructive/10 px-2 py-1 rounded-md">
                                Remove
                              </button>
                            </div>
                          </>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Dialog open={!!deleteProdId} onOpenChange={(open) => !open && setDeleteProdId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Product?</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>Are you sure you want to permanently delete this product? This action cannot be undone.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteProdId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete Product</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Staff Management ─────────────────────────────────────────────────────────
function StaffTab() {
  const { data, loading, refetch } = useQuery<any>(GET_STAFF);
  const [createUser] = useMutation(CREATE_USER);
  const [updateUser] = useMutation(UPDATE_USER);
  const [createRole] = useMutation(CREATE_ROLE);
  const [newUser, setNewUser] = useState({ name: '', roleId: '', pin: '' });
  const [editUser, setEditUser] = useState<{ id: string, name: string, pin: string, status: string } | null>(null);
  const [newRole, setNewRole] = useState({ name: '', permissions: [] as string[] });

  const handleAddUser = async () => {
    if (!newUser.name || !newUser.roleId || newUser.pin.length !== 4) return;
    try {
      await createUser({ variables: { name: newUser.name, roleId: newUser.roleId, pin: newUser.pin } });
      setNewUser({ name: '', roleId: '', pin: '' });
      refetch();
      toast.success('Staff member added');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleUpdateUser = async () => {
    if (!editUser || !editUser.name) return;
    try {
      await updateUser({ variables: { id: editUser.id, name: editUser.name, pin: editUser.pin || undefined, status: editUser.status } });
      setEditUser(null);
      refetch();
      toast.success('Staff member updated');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleAddRole = async () => {
    if (!newRole.name) return;
    try {
      await createRole({ variables: { name: newRole.name, perms: newRole.permissions } });
      setNewRole({ name: '', permissions: [] });
      refetch();
      toast.success('Role created');
    } catch (e: any) { toast.error(e.message); }
  };

  const togglePerm = (perm: string) => {
    setNewRole(prev => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter(p => p !== perm)
        : [...prev.permissions, perm],
    }));
  };

  const users = data?.users || [];
  const roles = data?.roles || [];

  return (
    <div className="flex flex-col gap-6">
      {/* Staff list */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Staff Roster</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {loading ? Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />) : users.map((user: any, idx: number) => (
            <motion.div
              key={user.id}
              initial={{ opacity: 0, transform: 'translateY(4px)' }}
              animate={{ opacity: 1, transform: 'translateY(0)' }}
              transition={{ delay: idx * 0.04, duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
              className="group flex items-center justify-between p-3 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors"
            >
              <div className="flex-1">
                <p className="text-sm font-semibold">{user.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{user.role?.name}</p>
              </div>
              <div className="flex items-center gap-3">
                {user.currentLiability > 0 && (
                  <span className="text-xs font-semibold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-md">Shortage: ETB {user.currentLiability}</span>
                )}
                <Badge variant="outline" className={`text-xs ${user.status === 'ACTIVE' ? 'border-emerald-500/40 text-emerald-400' : 'border-amber-500/40 text-amber-400'}`}>
                  {user.status === 'ACTIVE' ? 'Active' : 'In Recon'}
                </Badge>
                <Button variant="ghost" size="sm" className="h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setEditUser({ id: user.id, name: user.name, pin: '', status: user.status })}>
                  Edit
                </Button>
              </div>
            </motion.div>
          ))}
        </CardContent>
      </Card>

      {/* Edit Staff Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Staff Member</DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-2">
                <Label>Full Name</Label>
                <Input value={editUser.name} onChange={e => setEditUser({ ...editUser, name: e.target.value })} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>New PIN (Leave blank to keep current PIN)</Label>
                <Input type="text" maxLength={4} placeholder="4-digit PIN" value={editUser.pin} onChange={e => setEditUser({ ...editUser, pin: e.target.value })} className="tracking-[0.5em] text-center font-mono" />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Status</Label>
                <select value={editUser.status} onChange={e => setEditUser({ ...editUser, status: e.target.value })} className="px-3 py-2 rounded-md bg-muted border border-border text-sm">
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="IN_RECONCILIATION">IN RECONCILIATION</option>
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">Note: IN_RECONCILIATION locks the user out until a shift is countersigned.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button onClick={handleUpdateUser} disabled={!editUser?.name || (editUser.pin.length > 0 && editUser.pin.length !== 4)}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Staff */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Add Staff Member</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input placeholder="Full name" value={newUser.name} onChange={e => setNewUser(p => ({ ...p, name: e.target.value }))} />
          <select value={newUser.roleId} onChange={e => setNewUser(p => ({ ...p, roleId: e.target.value }))}
            className="px-3 py-2 rounded-md bg-muted border border-border text-sm">
            <option value="">Select role…</option>
            {roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <Input type="text" maxLength={4} placeholder="4-digit PIN" value={newUser.pin} onChange={e => setNewUser(p => ({ ...p, pin: e.target.value }))} className="tracking-[0.5em] text-center" />
          <Button onClick={handleAddUser} disabled={!newUser.name || !newUser.roleId || newUser.pin.length !== 4} className="active:scale-[0.97] transition-transform duration-100">Add Staff</Button>
        </CardContent>
      </Card>

      {/* Roles */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Create Role</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input placeholder="Role name" value={newRole.name} onChange={e => setNewRole(p => ({ ...p, name: e.target.value }))} />
          <div className="flex flex-wrap gap-2">
            {ALL_PERMISSIONS.map(perm => (
              <button
                key={perm}
                onClick={() => togglePerm(perm)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150 active:scale-95 ${newRole.permissions.includes(perm) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
              >
                {perm}
              </button>
            ))}
          </div>
          <Button onClick={handleAddRole} disabled={!newRole.name} className="active:scale-[0.97] transition-transform duration-100">Create Role</Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tables Management ────────────────────────────────────────────────────────
function TablesTab() {
  const { data, refetch } = useQuery<any>(GET_CAFE);
  const [updateCafeTables, { loading: saving }] = useMutation(UPDATE_CAFE_TABLES);
  const tables: string[] = data?.cafe?.tables || [];
  const [input, setInput] = useState('');

  const handleAdd = async () => {
    const name = input.trim().toUpperCase();
    if (!name || tables.includes(name)) { setInput(''); return; }
    try {
      await updateCafeTables({ variables: { tables: [...tables, name] } });
      setInput('');
      refetch();
      toast.success(`Table ${name} added`);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleRemove = async (table: string) => {
    try {
      await updateCafeTables({ variables: { tables: tables.filter(t => t !== table) } });
      refetch();
      toast.success(`Table ${table} removed`);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleBulk = async () => {
    // Quick-add T1–T10 pattern
    const count = parseInt(input.trim());
    if (!isNaN(count) && count > 0 && count <= 50) {
      const newTables = Array.from(new Set([...tables, ...Array.from({ length: count }, (_, i) => `T${i + 1}`)]));
      try {
        await updateCafeTables({ variables: { tables: newTables } });
        setInput('');
        refetch();
        toast.success(`${count} tables added`);
      } catch (e: any) { toast.error(e.message); }
    } else {
      handleAdd();
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Add Tables</CardTitle>
          <p className="text-xs text-muted-foreground">Enter a table name (e.g. T1, VIP-1, Outdoor-3) or a number to bulk-add T1–TN</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Input
              placeholder="Table name or number (e.g. T1 or 10)"
              value={input}
              onChange={e => setInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleBulk()}
              className="font-mono"
            />
            <Button onClick={handleBulk} disabled={saving || !input.trim()} className="shrink-0">Add</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Current Tables ({tables.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {tables.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No tables configured yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tables.map(t => (
                <div key={t} className="flex items-center gap-1.5 bg-muted border border-border rounded-lg px-3 py-1.5">
                  <span className="text-sm font-mono font-medium">{t}</span>
                  <button
                    onClick={() => handleRemove(t)}
                    className="text-muted-foreground hover:text-destructive transition-colors ml-1 text-xs"
                    aria-label={`Remove ${t}`}
                  >✕</button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Shortages Management ─────────────────────────────────────────────────────
function ShortagesTab() {
  const { data, loading, refetch } = useQuery<any>(GET_SHORTAGE_SHIFTS);
  const [countersign] = useMutation(COUNTERSIGN_SHORTAGE);
  const [pin, setPin] = useState('');
  const [activeShift, setActiveShift] = useState<string | null>(null);
  
  const shifts = data?.shortageShifts || [];

  const handleApprove = async () => {
    if (!activeShift || pin.length !== 4) return;
    try {
      await countersign({ variables: { shiftId: activeShift, adminPin: pin } });
      toast.success('Shortage countersigned. Waitress unlocked.');
      setPin('');
      setActiveShift(null);
      refetch();
    } catch (e: any) { toast.error(e.message); }
  };

  if (loading) return <div className="text-center py-20 text-muted-foreground">Loading shortages...</div>;
  if (shifts.length === 0) return (
    <div className="flex flex-col items-center py-20 text-center">
      <p className="text-4xl mb-3">✅</p>
      <p className="text-muted-foreground">No pending shortages to approve.</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {shifts.map((s: any) => (
        <Card key={s.id} className="border-red-500/30 bg-red-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-red-500 flex justify-between items-center text-base">
              Shortage Alert
              <Badge variant="destructive">LOCKED</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Waitress</p>
              <p className="font-semibold">{s.waitress?.name}</p>
            </div>
            <div className="flex justify-between items-center bg-background/50 p-3 rounded-lg border border-border/50">
              <span className="text-sm">Missing Cash</span>
              <span className="font-bold text-red-500">ETB {s.waitress?.currentLiability}</span>
            </div>
            
            {activeShift === s.id ? (
              <div className="flex flex-col gap-3 mt-2">
                <input 
                  type="password" 
                  maxLength={4} 
                  placeholder="Admin PIN" 
                  value={pin}
                  onChange={e => setPin(e.target.value)} 
                  className="px-3 py-2 rounded-lg bg-background border border-red-500/50 text-sm text-center tracking-[0.5em] focus:ring-1 focus:ring-red-500 focus:outline-none" 
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => { setActiveShift(null); setPin(''); }}>Cancel</Button>
                  <Button variant="destructive" className="flex-1" disabled={pin.length !== 4} onClick={handleApprove}>Confirm</Button>
                </div>
              </div>
            ) : (
              <Button variant="destructive" className="w-full mt-2" onClick={() => setActiveShift(s.id)}>
                Approve & Unlock
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Amendments Management ───────────────────────────────────────────────────
function AmendmentsTab() {
  const { data, loading, refetch } = useQuery<any>(GET_AMEND_REQUESTS);
  useSubscription<any>(ORDER_UPDATED_SUB, { onData: () => refetch() });
  const [approve] = useMutation(APPROVE_AMEND);
  const [reject] = useMutation(REJECT_AMEND);

  const requests = data?.orders || [];

  const handleApprove = async (id: string) => {
    try {
      await approve({ variables: { id } });
      toast.success('Amendment approved');
      refetch();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleReject = async (id: string) => {
    try {
      await reject({ variables: { id } });
      toast.success('Amendment rejected');
      refetch();
    } catch (e: any) { toast.error(e.message); }
  };

  if (loading) return <div className="text-center py-20 text-muted-foreground">Loading amend requests...</div>;
  if (requests.length === 0) return (
    <div className="flex flex-col items-center py-20 text-center">
      <p className="text-4xl mb-3">✅</p>
      <p className="text-muted-foreground">No pending amendment requests.</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {requests.map((req: any) => (
        <Card key={req.id} className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-amber-500 flex justify-between items-center text-base">
              Amend Request
              <Badge variant="outline" className="text-amber-500 border-amber-500">PENDING</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Waitress: <span className="text-foreground">{req.waitress?.name || 'Unknown'}</span></p>
              <p className="text-sm text-muted-foreground mb-1">Current Table: <span className="text-foreground">{req.tableNumber}</span></p>
              <p className="text-sm text-muted-foreground mb-1">Requested Table: <span className="text-foreground font-semibold">{req.requestedAmendment?.tableNumber || 'No Change'}</span></p>
            </div>
            
            <div className="bg-background/50 p-3 rounded-lg border border-border/50">
              <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Proposed Items</p>
              <div className="flex flex-col gap-2">
                {req.requestedAmendment?.items?.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span>{item.quantity}× {item.productName}</span>
                    <span>ETB {item.unitPrice * item.quantity}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="bg-amber-500/10 p-3 rounded-lg border border-amber-500/20 text-amber-500/90 text-sm">
              <span className="font-semibold">Reason:</span> {req.requestedAmendment?.reason}
            </div>

            <div className="flex gap-2 mt-2">
              <Button variant="outline" className="flex-1 text-red-500 hover:text-red-500 hover:bg-red-500/10" onClick={() => handleReject(req.id)}>Reject</Button>
              <Button className="flex-1 bg-amber-500 hover:bg-amber-600 text-white" onClick={() => handleApprove(req.id)}>Approve</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [activeView, setActiveView] = useState('menu');
  const { data: cafeData } = useQuery<any>(GET_CAFE);
  const cafe = cafeData?.cafe;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-card border-r border-border flex flex-col justify-between shadow-sm z-10">
        <div>
          <div className="p-6 border-b border-border/50">
            <h1 className="text-xl font-bold tracking-tight text-foreground">Admin Portal</h1>
            <p className="text-xs text-muted-foreground mt-1 truncate">{cafe?.name || 'Loading…'}</p>
          </div>
          <div className="p-4 flex flex-col gap-1.5">
            <Button variant={activeView === 'menu' ? 'secondary' : 'ghost'} className="justify-start text-sm font-medium w-full" onClick={() => setActiveView('menu')}>
              <span className="mr-3 text-lg opacity-70">📋</span> Menu & 86
            </Button>
            <Button variant={activeView === 'tables' ? 'secondary' : 'ghost'} className="justify-start text-sm font-medium w-full" onClick={() => setActiveView('tables')}>
              <span className="mr-3 text-lg opacity-70">🪑</span> Tables
            </Button>
            <Button variant={activeView === 'staff' ? 'secondary' : 'ghost'} className="justify-start text-sm font-medium w-full" onClick={() => setActiveView('staff')}>
              <span className="mr-3 text-lg opacity-70">👥</span> Staff & Roles
            </Button>
            <Button variant={activeView === 'amendments' ? 'secondary' : 'ghost'} className="justify-start text-sm font-medium w-full text-amber-500 hover:text-amber-500 hover:bg-amber-500/10" onClick={() => setActiveView('amendments')}>
              <span className="mr-3 text-lg opacity-70">✏️</span> Amends
            </Button>
            <Button variant={activeView === 'shortages' ? 'secondary' : 'ghost'} className="justify-start text-sm font-medium w-full text-red-500 hover:text-red-500 hover:bg-red-500/10" onClick={() => setActiveView('shortages')}>
              <span className="mr-3 text-lg opacity-70">⚠️</span> Shortages
            </Button>
          </div>
        </div>
        <div className="p-4 border-t border-border/50 bg-muted/20">
          <div className="flex flex-col gap-2 mb-4">
            <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider px-2">Thresholds</p>
            <Badge variant="outline" className="text-[11px] border-border text-muted-foreground bg-background justify-between">Shortage <span className="font-mono">ETB {cafe?.shortageAlertThreshold ?? '—'}</span></Badge>
            <Badge variant="outline" className="text-[11px] border-border text-muted-foreground bg-background justify-between">Gap <span className="font-mono">ETB {cafe?.declarationGapAlertThreshold ?? '—'}</span></Badge>
          </div>
          <Button variant="outline" className="w-full text-sm font-semibold hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors" onClick={onLogout}>
            Logout
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-background/50">
          {activeView === 'menu' && <MenuTab />}
          {activeView === 'tables' && <TablesTab />}
          {activeView === 'staff' && <StaffTab />}
          {activeView === 'amendments' && <AmendmentsTab />}
          {activeView === 'shortages' && <ShortagesTab />}
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
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
          <div className="text-center"><div className="text-3xl mb-2">⚙️</div><h1 className="text-lg font-bold">Admin Login</h1></div>
          {!CAFE_CODE && (
            <input type="text" placeholder="Cafe Code" value={cafeCode} onChange={e => setCafeCode(e.target.value.toUpperCase())}
              className="px-3 py-2 rounded-lg bg-muted border border-border text-sm font-mono text-center uppercase" />
          )}
          <input type="password" maxLength={4} placeholder="Admin PIN" value={pin}
            onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()}
            className="px-3 py-2 rounded-lg bg-muted border border-border text-sm text-center tracking-[0.5em]" />
          <Button onClick={handleLogin} disabled={loading || pin.length !== 4 || !cafeCode} className="active:scale-[0.97] transition-transform duration-100">
            {loading ? 'Signing in…' : 'Enter Admin Panel'}
          </Button>
        </motion.div>
      </div>
    );
  }

  return <AdminDashboard onLogout={handleLogout} />;
}
