# TECH.md — DigitalBon Platform v4.2

**Product:** DigitalBon  
**Version:** 4.2 (Production-Ready & Operationally Resilient)  
**Spec Type:** Technical Specification  
**Derived From:** PRD v4.2 + 6-cycle security review  
**References:** [PRODUCT.md](./PRODUCT.md)  
**Date:** August 2026

---

## 1. Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│                  LOCAL CAFE SUBNET                     │
│  192.168.X.X — No internet required for core ops      │
│                                                        │
│  [Waitstaff PWA]   [Barista Screen]   [Cashier UI]    │
│       │                  │                  │          │
│       └──────────────────┼──────────────────┘          │
│                          │ Socket.IO / WebSocket        │
│              ┌───────────▼───────────┐                 │
│              │   LOCAL EDGE NODE     │                 │
│              │  (Mini-PC)            │                 │
│              │  - Node.js/Express    │                 │
│              │  - MongoDB RS (rs0)   │                 │
│              │  - Socket.IO Server   │                 │
│              │  - LUKS Encrypted Vol │                 │
│              └───────────┬───────────┘                 │
└──────────────────────────┼─────────────────────────────┘
                           │ Background sync (online only)
                           │ CLOUD_CONFIG_{cafeId} WS push
                  ┌────────▼────────┐
                  │  CLOUD LAYER    │
                  │  (Multi-tenant) │
                  │  - MongoDB Atlas │
                  │  - Chain Dashboard│
                  │  - Billing       │
                  └─────────────────┘
```

---

## 2. Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend PWA | Next.js 14 (App Router) | BYOD mobile PWA via `/mobile` route; no native app |
| Barista UI | Next.js `/barista` route | Full-screen order queue; optimized for single screen |
| Cashier UI | Next.js `/cashier` route | Multi-waitstaff dashboard |
| Admin UI | Next.js `/admin` route | CMS, staff, roles, reconciliation |
| Backend | Express.js + TypeScript | Local edge node API; also used by cloud layer |
| API Protocol | GraphQL (Apollo Server) + WebSocket subscriptions (`graphql-ws`) | Real-time order dispatch without polling |
| Database | MongoDB (Mongoose) with single-node Replica Set | Flexible schema; required for multi-document transactions |
| Real-time | Socket.IO (local) + GraphQL subscriptions | Local: Socket.IO for printer; GraphQL WS for UI state |
| Auth | JWT (short-lived, `{ userId, cafeId, sessionVersion }`) | Never embeds permissions |
| Cache | Redis (encrypted, auth-required) | Permission lookup cache; invalidated on role change |
| Encryption | LUKS (WiredTiger or volume) + TPM 2.0 key sealing | Physical tamper protection on edge node |
| Password Hashing | bcrypt (PIN + password) | Server-side only |
| Payment | Telebirr / CBE Birr (HMAC webhook + server-to-server verify) | Digital payment settlement |

---

## 3. Directory Structure

```
digitalbon/
├── apps/
│   ├── web/                    # Next.js frontend (all UI routes)
│   │   ├── app/
│   │   │   ├── mobile/         # Waitstaff PWA
│   │   │   ├── barista/        # Barista terminal
│   │   │   ├── cashier/        # Cashier command center
│   │   │   └── admin/          # Cafe Admin dashboard
│   │   └── components/
│   └── edge/                   # Local edge node (Express + GraphQL)
│       ├── src/
│       │   ├── graphql/
│       │   │   ├── schema/     # Type definitions
│       │   │   ├── resolvers/  # Query / Mutation / Subscription resolvers
│       │   │   └── context.ts  # JWT extraction → { userId, cafeId, sessionVersion }
│       │   ├── models/         # Mongoose schemas
│       │   ├── middleware/
│       │   │   ├── auth.ts     # JWT verify + sessionVersion check
│       │   │   └── permissions.ts  # Live DB/Redis permission fetch
│       │   ├── services/
│       │   │   ├── order.service.ts
│       │   │   ├── reconciliation.service.ts
│       │   │   ├── void.service.ts
│       │   │   └── sync.service.ts  # Edge→cloud + CLOUD_CONFIG listener
│       │   ├── socket/         # Socket.IO printer bridge
│       │   └── startup.ts      # RS health gate + rs.initiate() automation
│       └── scripts/
│           └── deploy.sh       # LUKS / TPM detection + key management
├── packages/
│   └── shared/                 # Shared types, enums, constants
│       ├── types/
│       │   └── order.types.ts  # OrderStatus enum, state machine constants
│       └── permissions/
│           └── scopes.ts       # SYSTEM / CAFE / STATION permission enum
└── specs/
    └── DB-001/
        ├── PRODUCT.md
        └── TECH.md             ← this file
```

---

## 4. Data Models

### 4.1 User

```typescript
interface User {
  _id: ObjectId;
  cafeId: ObjectId;          // immutable, from JWT on creation
  roleId: ObjectId;
  name: string;
  pinHash: string;           // bcrypt hash of 4-digit PIN
  sessionVersion: number;    // incremented on shift lock or permission change
  currentLiability: number;  // ETB — atomic $inc only, never read-modify-write
  status: 'ACTIVE' | 'LOCKED_FOR_RECONCILIATION';
  createdAt: Date;
}
```

### 4.2 Role

```typescript
interface Role {
  _id: ObjectId;
  cafeId: ObjectId;
  name: string;
  permissions: string[];     // e.g. ['CREATE_ORDER', 'APPROVE_VOID']
  scope: 'SYSTEM' | 'CAFE' | 'STATION';
}
```

### 4.3 Order

```typescript
type OrderStatus =
  | 'PENDING'
  | 'PRINTED'
  | 'PRINT_FAILED'
  | 'VOID_REQUESTED'
  | 'LOCKED_VOID'
  | 'PENDING_CASH_RESOLUTION'
  | 'SETTLED'
  | 'VOIDED';

interface OrderItem {
  productId: ObjectId;
  name: string;              // snapshot at order time
  unitPrice: number;         // snapshot from DB — never from client
  quantity: number;          // positive integer only
}

interface AuditEntry {
  action: string;            // e.g. 'STATUS_PENDING', 'AMENDED', 'CASH_LIABILITY_ADDED'
  actorId: ObjectId;
  authorizedBy?: ObjectId;   // required for dual-auth amendments
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

interface Order {
  _id: ObjectId;
  cafeId: ObjectId;
  waitressId: ObjectId;
  tableNumber: string;
  items: OrderItem[];
  totalAmount: number;       // calculated server-side
  status: OrderStatus;
  previousStatus?: OrderStatus;  // set when entering VOID_REQUESTED
  paymentMethod?: 'CASH' | 'TELEBIRR' | 'CBE_BIRR';
  reason?: string;           // mandatory on void transitions
  wasPaymentCollected?: boolean;  // mandatory on direct PRINTED → void
  auditLog: AuditEntry[];
  createdAt: Date;
  updatedAt: Date;
}
```

### 4.4 Product

```typescript
interface Product {
  _id: ObjectId;
  cafeId: ObjectId;
  categoryId: ObjectId;
  name: string;
  price: number;
  cost: number;
  isAvailable: boolean;
}
```

### 4.5 Shift Reconciliation

```typescript
interface ShiftReconciliation {
  _id: ObjectId;
  cafeId: ObjectId;
  waitressId: ObjectId;
  cashierId: ObjectId;
  expectedCash: number;        // sum of SETTLED CASH orders + liability-added voids
  waitstaffDeclared: number;
  cashierCounted: number;
  variance: number;            // cashierCounted - expectedCash
  declarationGap: number;      // |cashierCounted - waitstaffDeclared|
  result: 'BALANCED' | 'SURPLUS' | 'SHORTAGE';
  authorizedBy?: ObjectId;     // Admin/Manager PIN for shortage countersign
  auditLog: AuditEntry[];
  createdAt: Date;
}
```

### 4.6 Cafe

```typescript
interface Cafe {
  _id: ObjectId;
  name: string;
  shortageAlertThreshold: number;      // default 100, range 20–1000
  declarationGapAlertThreshold: number; // default 50, range 10–500
  syncStatus?: 'SYNCED' | 'PENDING_SYNC' | 'SYNC_FAILED';
  chainId?: ObjectId;
}
```

---

## 5. State Machine Implementation

### 5.1 Transition Table (Code Representation)

```typescript
// packages/shared/types/order.types.ts

export const STATE_TRANSITIONS: Record<
  OrderStatus,
  { to: OrderStatus; roles: string[]; conditions: string[] }[]
> = {
  PENDING: [
    { to: 'PRINTED',          roles: ['BARISTA'],      conditions: ['socketConfirmed'] },
    { to: 'PRINT_FAILED',     roles: ['SYSTEM'],       conditions: ['socketTimeout'] },
    { to: 'VOID_REQUESTED',   roles: ['WAITRESS'],     conditions: ['isOriginalCreator'] },
    { to: 'SETTLED',          roles: ['CASHIER'],      conditions: ['shiftOpen'] },
  ],
  PRINTED: [
    { to: 'VOID_REQUESTED',       roles: ['WAITRESS'], conditions: ['isOriginalCreator'] },
    { to: 'PENDING_CASH_RESOLUTION', roles: ['CASHIER'], conditions: ['wasPaymentCollected', 'hasReason'] },
    { to: 'SETTLED',              roles: ['CASHIER'],  conditions: ['shiftOpen'] },
  ],
  PRINT_FAILED: [
    { to: 'PENDING',          roles: ['BARISTA', 'SYSTEM'], conditions: ['isRetry'] },
    { to: 'PRINTED',          roles: ['BARISTA'],      conditions: ['manualAcknowledge'] },
    { to: 'VOID_REQUESTED',   roles: ['WAITRESS'],     conditions: ['isOriginalCreator'] },
  ],
  VOID_REQUESTED: [
    { to: 'VOIDED',           roles: ['CASHIER'],      conditions: ['pinValid', 'hasReason'] },
    { to: 'previousStatus',   roles: ['CASHIER'],      conditions: [] },      // reject void
    { to: 'LOCKED_VOID',      roles: ['SYSTEM'],       conditions: ['pinAttemptsExceeded'] },
  ],
  LOCKED_VOID: [
    { to: 'VOID_REQUESTED',   roles: ['CAFE_ADMIN'],   conditions: ['pinCounterReset'] },
    { to: 'VOIDED',           roles: ['CAFE_ADMIN'],   conditions: ['adminOverride'] },
    { to: 'previousStatus',   roles: ['CAFE_ADMIN'],   conditions: ['adminRejectsVoid'] },
  ],
  PENDING_CASH_RESOLUTION: [
    { to: 'VOIDED',           roles: ['CAFE_ADMIN'],   conditions: ['cashResolved'] },
    // cashResolved = 'returned_to_till' | 'added_to_liability'
    // 'added_to_liability' fires atomic $inc on waitress.currentLiability
  ],
  SETTLED: [],   // terminal
  VOIDED: [],    // terminal
};
```

### 5.2 `previousStatus` Pattern

```typescript
// When entering VOID_REQUESTED, store prior state:
await Order.findOneAndUpdate(
  { _id: orderId, cafeId: ctx.cafeId, status: { $in: ['PENDING', 'PRINTED', 'PRINT_FAILED'] } },
  { status: 'VOID_REQUESTED', previousStatus: order.status }
);

// When Cashier rejects (returns to previous state):
await Order.findOneAndUpdate(
  { _id: orderId, cafeId: ctx.cafeId, status: 'VOID_REQUESTED' },
  { $set: { status: order.previousStatus }, $unset: { previousStatus: '' } }
);
```

### 5.3 Mandatory Audit Logging (Pre-Save Hook)

```typescript
// apps/edge/src/models/order.model.ts
orderSchema.pre('save', function (next) {
  if (this.isModified('status')) {
    this.auditLog.push({
      action: `STATUS_${this.status}`,
      actorId: this.$locals.actorId,
      timestamp: new Date(),
      metadata: {
        previousStatus: this.$locals.previousStatus,
        reason: this.reason,
      },
    });
  }
  next();
});
```

---

## 6. Security Implementation

### 6.1 JWT Architecture

```typescript
// Payload — NEVER includes permissions
interface JWTPayload {
  userId: string;
  cafeId: string;
  sessionVersion: number;
  iat: number;
  exp: number;  // short-lived: 15 minutes; refresh token pattern
}

// Auth middleware — runs on every request
async function authMiddleware(req, res, next) {
  const token = extractBearer(req.headers.authorization);
  const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
  
  // sessionVersion check — core shift-lock invalidation
  const user = await User.findById(payload.userId).select('sessionVersion cafeId');
  if (user.sessionVersion !== payload.sessionVersion) {
    throw new UnauthorizedError('SESSION_INVALIDATED');
  }
  
  // Live permission fetch (DB or Redis cache)
  const permissions = await getPermissions(payload.userId, payload.cafeId);
  
  req.ctx = { userId: payload.userId, cafeId: payload.cafeId, permissions };
  next();
}
```

### 6.2 Atomic Financial Operations

```typescript
// Settling an order — atomic $inc, never read-modify-write
async function settleOrder(orderId: string, ctx: RequestContext) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Verify shift is OPEN inside the write lock
    const shift = await Shift.findOne({ cafeId: ctx.cafeId, status: 'OPEN' }).session(session);
    if (!shift) throw new ConflictError('SHIFT_CLOSED');

    const order = await Order.findOneAndUpdate(
      { _id: orderId, cafeId: ctx.cafeId, status: { $in: ['PENDING', 'PRINTED'] } },
      { status: 'SETTLED', paymentMethod: 'CASH' },
      { session, new: true }
    );
    if (!order) throw new NotFoundError('ORDER_NOT_FOUND_OR_WRONG_STATE');

    await User.findOneAndUpdate(
      { _id: order.waitressId, cafeId: ctx.cafeId },
      { $inc: { currentLiability: order.totalAmount } },
      { session }
    );

    await session.commitTransaction();
    return order;
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
}
```

### 6.3 PIN Brute-Force Lockout

```typescript
// Redis-backed attempt counter per orderId
async function approveVoid(orderId: string, pin: string, ctx: RequestContext) {
  const key = `void_attempts:${orderId}`;
  const attempts = await redis.incr(key);
  await redis.expire(key, 900); // 15-minute window

  if (attempts > 5) {
    await Order.findOneAndUpdate(
      { _id: orderId, cafeId: ctx.cafeId, status: 'VOID_REQUESTED' },
      { status: 'LOCKED_VOID' }
    );
    // Check Cashier Misconduct Alert threshold
    await checkMisconductAlert(ctx.userId, ctx.cafeId);
    throw new ForbiddenError('VOID_LOCKED');
  }

  const cashier = await User.findById(ctx.userId);
  const pinValid = await bcrypt.compare(pin, cashier.pinHash);
  if (!pinValid) throw new ForbiddenError('INVALID_PIN');

  // Clear counter on success
  await redis.del(key);
  // ... proceed with void approval
}

async function checkMisconductAlert(cashierId: string, cafeId: string) {
  const key = `locked_void_count:${cashierId}:${getCurrentShiftId(cafeId)}`;
  const count = await redis.incr(key);
  if (count >= 2) {
    await notifyCafeAdmin(cafeId, { type: 'CASHIER_MISCONDUCT', cashierId });
  }
}
```

---

## 7. Startup & Deployment

### 7.1 Replica Set Initialization (Automated)

```typescript
// apps/edge/src/startup.ts — runs before Express accepts connections
async function ensureReplicaSet() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const admin = client.db('admin').admin();

  let status;
  try {
    status = await admin.command({ replSetGetStatus: 1 });
  } catch {
    status = null;
  }

  if (!status || status.ok !== 1) {
    await admin.command({
      replSetInitiate: {
        _id: 'rs0',
        members: [{ _id: 0, host: 'localhost:27017' }],
      },
    });
    // Wait for RS to elect primary
    await new Promise(r => setTimeout(r, 2000));
  }

  await client.close();
  console.log('[STARTUP] Replica set OK — server accepting connections');
}
```

### 7.2 LUKS Key Management (Deployment Script)

```bash
# scripts/deploy.sh — runs once during initial edge node setup

detect_tpm() {
  if command -v tpm2_getcap &>/dev/null && tpm2_getcap properties-fixed 2>/dev/null | grep -q TPMFamilyIndicator; then
    echo "TPM2"
  elif [ -c /dev/tpm0 ]; then
    echo "TPM1"
  else
    echo "NONE"
  fi
}

TPM_STATUS=$(detect_tpm)

case $TPM_STATUS in
  "TPM2")
    echo "[SECURITY] Tier 1: Sealing LUKS key to TPM 2.0"
    # Generate key, seal to TPM PCRs, backup encrypted key to cloud
    setup_tpm_sealed_luks
    ;;
  "TPM1"|"NONE")
    echo "[SECURITY] Tier 2: Storing LUKS key in read-only OS partition"
    # Store encrypted key in /etc/digitalbon/.luks_key (read-only FS)
    setup_fallback_luks
    ;;
esac
```

---

## 8. Cloud Sync Architecture

### 8.1 Edge-to-Cloud (Append-Only)

```typescript
// services/sync.service.ts
async function syncToCloud(cafeId: string) {
  const lastSyncedAt = await getLastSyncTimestamp(cafeId);
  const newRecords = await Order.find({
    cafeId,
    updatedAt: { $gt: lastSyncedAt }
  }).lean();

  const response = await cloudApi.post('/sync', {
    cafeId,
    records: newRecords,
    serviceToken: SERVICE_JWT,   // edge node service-level JWT
  });

  if (response.data.rejected) {
    // Cloud rejected batch (auditLog shrink detected)
    await alertSuperAdmin(cafeId, 'SYNC_INTEGRITY_VIOLATION');
  }
}
```

### 8.2 Cloud-to-Edge (Config Push)

```typescript
// The edge node maintains a persistent outbound WebSocket to the cloud
// authenticated with a service-level JWT issued at setup time

const cloudSocket = io(CLOUD_URL, {
  auth: { token: SERVICE_JWT },  // service JWT, not user JWT
  transports: ['websocket'],
});

cloudSocket.on(`CLOUD_CONFIG_${cafeId}`, (event) => {
  switch (event.type) {
    case 'MENU_UPDATED':
      invalidateMenuCache(cafeId);
      break;
    case 'ROLE_UPDATED':
      invalidatePermissionCache(event.userId, cafeId);
      break;
    case 'SESSION_REVOKED':
      // Force sessionVersion increment for the target user
      User.findOneAndUpdate(
        { _id: event.userId, cafeId },
        { $inc: { sessionVersion: 1 } }
      );
      break;
  }
});
```

---

## 9. Order Creation — Anti-Tampering

```typescript
// resolvers/order.resolver.ts
async function createOrder(input: CreateOrderInput, ctx: RequestContext) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // 1. Verify shift is OPEN — inside transaction (TOCTOU prevention)
    const shift = await Shift.findOne({ cafeId: ctx.cafeId, status: 'OPEN' }).session(session);
    if (!shift) throw new ConflictError('NO_OPEN_SHIFT');

    // 2. Fetch product prices from DB — NEVER trust client-supplied price
    const productIds = input.items.map(i => i.productId);
    const products = await Product.find({
      _id: { $in: productIds },
      cafeId: ctx.cafeId,
      isAvailable: true,   // 86-toggle TOCTOU prevention
    }).session(session);

    if (products.length !== productIds.length) {
      throw new UserInputError('ITEM_UNAVAILABLE');
    }

    // 3. Build items with server-side prices
    const items = input.items.map(item => {
      const product = products.find(p => p._id.equals(item.productId));
      return {
        productId: item.productId,
        name: product.name,
        unitPrice: product.price,    // from DB, not client
        quantity: Math.floor(item.quantity),  // integer validation
      };
    });

    // 4. Calculate total server-side
    const totalAmount = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

    // 5. Create order
    const order = await Order.create([{
      cafeId: ctx.cafeId,
      waitressId: ctx.userId,
      tableNumber: input.tableNumber,
      items,
      totalAmount,
      status: 'PENDING',
    }], { session });

    await session.commitTransaction();

    // 6. Fire WebSocket event (local + cloud-namespaced)
    pubsub.publish(`ORDER_CREATED_${ctx.cafeId}`, { order: order[0] });

    return order[0];
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
}
```

---

## 10. Shift Reconciliation — Full Service

```typescript
async function closeShift(waitressId: string, cashierCounted: number, ctx: RequestContext) {
  // Pre-condition: no unresolved orders
  const unresolved = await Order.countDocuments({
    cafeId: ctx.cafeId,
    waitressId,
    status: { $in: ['PENDING', 'PRINTED', 'PRINT_FAILED', 'VOID_REQUESTED', 'PENDING_CASH_RESOLUTION'] }
  });
  if (unresolved > 0) throw new ConflictError('UNRESOLVED_ORDERS');

  const waitress = await User.findById(waitressId);
  const expectedCash = waitress.currentLiability;
  const waitstaffDeclared = waitress.declaredCash;  // set during declaration step

  const variance = cashierCounted - expectedCash;
  const declarationGap = Math.abs(cashierCounted - waitstaffDeclared);

  const cafe = await Cafe.findById(ctx.cafeId);

  // Declaration Gap alert
  if (declarationGap > cafe.declarationGapAlertThreshold) {
    await logForensicAlert(ctx.cafeId, waitressId, ctx.userId, { declarationGap });
  }

  // Shortage countersign check
  if (variance < -cafe.shortageAlertThreshold) {
    if (!ctx.adminPin) throw new ConflictError('SHORTAGE_REQUIRES_ADMIN_PIN');
    const admin = await User.findById(ctx.userId);
    const pinValid = await bcrypt.compare(ctx.adminPin, admin.pinHash);
    if (!pinValid) throw new ForbiddenError('INVALID_ADMIN_PIN');
  }

  // Determine result
  const result = variance === 0 ? 'BALANCED' : variance > 0 ? 'SURPLUS' : 'SHORTAGE';

  // Create reconciliation record
  await ShiftReconciliation.create({
    cafeId: ctx.cafeId, waitressId, cashierId: ctx.userId,
    expectedCash, waitstaffDeclared, cashierCounted,
    variance, declarationGap, result,
  });

  // Reset waitress liability and unlock
  await User.findByIdAndUpdate(waitressId, {
    currentLiability: 0,
    status: 'ACTIVE',
    $inc: { sessionVersion: 1 },  // new session for next shift
  });
}
```

---

## 11. Implementation Phases

### Phase 1 — Edge Node Foundation (Week 1–2)
- [ ] MongoDB replica set setup + startup health gate (`startup.ts`)
- [ ] Express + Apollo Server + `graphql-ws` scaffold
- [ ] JWT auth middleware with `sessionVersion` check
- [ ] Live permission fetch (DB + Redis)
- [ ] Core Mongoose models (User, Role, Product, Order, Cafe)
- [ ] Mongoose `pre('save')` audit log hook

### Phase 2 — Order Lifecycle (Week 2–3)
- [ ] `createOrder` mutation (anti-tampering, TOCTOU-safe transaction)
- [ ] Full state machine with all transitions from §5.1
- [ ] Socket.IO printer bridge + `PRINT_FAILED` timeout + retry
- [ ] WebSocket subscriptions: `ORDER_CREATED`, `ORDER_UPDATED`, `VOID_REQUESTED`, `VOID_LOCKED`
- [ ] Barista virtual terminal fallback (always shows PENDING + PRINT_FAILED)

### Phase 3 — Void Protocol & PIN Security (Week 3)
- [ ] `requestOrderVoid` mutation (sets `previousStatus`)
- [ ] `approveOrderVoid` with PIN brute-force lockout (Redis counter)
- [ ] `rejectOrderVoid` (restores `previousStatus`)
- [ ] `LOCKED_VOID` transitions (Admin review, re-open, force void)
- [ ] Cashier Misconduct Alert (≥ 2 LOCKED_VOID per shift per cashier)
- [ ] Direct `PRINTED → PENDING_CASH_RESOLUTION` (Cashier direct void)
- [ ] `resolvePendingCash` mutation with `$inc` liability path

### Phase 4 — Financial Reconciliation (Week 4)
- [ ] `initiateReconciliation` mutation (sessionVersion increment, shift lock)
- [ ] Waitstaff declaration endpoint
- [ ] `closeShift` service (pre-condition check, variance + gap calc, countersign)
- [ ] Configurable thresholds (`shortageAlertThreshold`, `declarationGapAlertThreshold`)
- [ ] Admin Amendment Workflow (PENDING only, dual-auth for financial fields)

### Phase 5 — Admin CMS & RBAC (Week 4–5)
- [ ] Category + Product CRUD with `isAvailable` toggle
- [ ] 86-toggle WebSocket broadcast (`MENU_ITEM_TOGGLED_{cafeId}`)
- [ ] Role + permission management with scope ceiling enforcement
- [ ] Staff management (create, assign role, deactivate)

### Phase 6 — Cloud Sync & Multi-Branch (Week 5–6)
- [ ] Edge-to-cloud append-only sync (with `auditLog` shrink rejection)
- [ ] `CLOUD_CONFIG_{cafeId}` outbound WebSocket (service JWT auth)
- [ ] Multi-tenant cloud layer (chain dashboard, cross-branch menu sync)
- [ ] Online-Only Sync Policy + atomic chain rollback
- [ ] Telebirr / CBE Birr HMAC webhook + server-to-server verification

### Phase 7 — Deployment Hardening (Week 6)
- [ ] LUKS + TPM detection script (`deploy.sh`)
- [ ] Cloud key escrow for TPM backup
- [ ] Read-only OS configuration + BIOS lockout documentation
- [ ] End-to-end integration test suite (from §6 of PRODUCT.md)

---

## 12. Key Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| MongoDB standalone deployed without RS | High | Critical | Startup health gate blocks server; clear error message |
| Developer forgets `$inc`, uses read-modify-write | Medium | High | ESLint rule + code review checklist: ban direct `save()` on financial fields |
| `auditLog` not appended for a transition | Medium | High | `pre('save')` hook — automatic, cannot be forgotten |
| `previousStatus` not set when entering `VOID_REQUESTED` | Medium | High | Type system: `VOID_REQUESTED` transition always sets `previousStatus` |
| Service JWT for `CLOUD_CONFIG` expires | Low | Medium | Auto-rotation script; 1-year expiry with 30-day pre-expiry re-issue |
| TPM unavailable, fallback not triggered | Low | High | `deploy.sh` detects and logs active tier; health dashboard shows security tier |
| PENDING_CASH_RESOLUTION stuck > 30 min | Medium | Medium | Background cron job monitors and escalates to `RED` CS tier |

---

## 13. Testing Conventions

All tests follow the project's Vitest + Supertest conventions.

```
apps/edge/src/
  __tests__/
    unit/
      order.statemachine.test.ts    # All state transitions, valid + invalid
      liability.atomic.test.ts      # Concurrent $inc correctness
      pin.lockout.test.ts           # 5-attempt threshold
      reconciliation.variance.test.ts
    integration/
      createOrder.e2e.test.ts       # Full order lifecycle
      shiftClose.e2e.test.ts        # Reconciliation with pre-conditions
      sync.integrity.test.ts        # auditLog shrink rejection
      toctou.transaction.test.ts    # Shift lock during createOrder
```
