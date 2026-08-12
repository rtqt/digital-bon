# PRODUCT.md — DigitalBon Platform v4.2

**Product:** DigitalBon  
**Version:** 4.2 (Production-Ready & Operationally Resilient)  
**Spec Type:** Product Specification  
**Derived From:** PRD v4.2 + 6-cycle security & business review  
**Date:** August 2026

---

## 1. Problem Being Solved

Ethiopian cafe and hospitality operators run on paper "Bon" vouchers and manual end-of-shift cash tallying (*Hisab Mawerarad*). This creates:

- **Guda'et (financial leakage):** Uncollected table bills, untracked shortages, and no audit trail when cash goes missing.
- **Infrastructure fragility:** Cloud-only POS systems fail when the local internet drops — a daily occurrence. Enterprise alternatives cost $1,500+ USD in hardware that SMB cafe owners cannot justify.

DigitalBon solves both by running **local-first on a cheap Mini-PC** that works 100% offline on local Wi-Fi, with cloud sync only for backup and management.

---

## 2. Users & Roles

| Role | Device | Core Job |
|---|---|---|
| **Waitress / Waitstaff** | Their own smartphone (BYOD PWA) | Place orders, track which tables owe cash, manage active shift |
| **Barista** | Shared station screen or thermal printer | Receive and acknowledge drink/food tickets in real time |
| **Cashier** | Shared station tablet or desktop | Settle orders, approve/reject voids, run end-of-shift reconciliation |
| **Cafe Admin** | Any device (local or remote via cloud) | Manage menu, staff, roles, reconciliation thresholds, amendments |
| **Super Admin** | Cloud dashboard (DigitalBon company) | Manage tenants, billing, global config (requires 2FA) |
| **Chain Master** | Cloud dashboard | View consolidated analytics, push menu updates across branches |

---

## 3. Core User Flows

### 3.1 Waitstaff — Placing an Order

1. Waitstaff opens the PWA on their phone and logs in with their PIN.
2. They select a table number and add items from the live menu.
3. They tap **"Send Order"** — the order is submitted.
4. The Barista terminal instantly displays the ticket and chimes.
5. The Waitstaff sees the order status update in real time: `PENDING → PRINTED`.
6. If the printer is offline, the status shows `PRINT_FAILED` with a warning: *"Order not yet received by bar."* The Barista screen shows it as a fallback.

**Invariants:**
- Prices are always fetched from the server — Waitstaff cannot manipulate the price.
- The menu only shows items where `isAvailable = true` at the moment of submission (server re-validates on write).
- The Waitstaff can only place orders while their shift is `OPEN`.

---

### 3.2 Barista — Receiving & Acknowledging Tickets

1. Every new order appears instantly on the Barista screen as a paper-style ticket.
2. The thermal printer fires automatically. If it fails, the virtual screen is the fallback.
3. Barista taps **"Acknowledge"** on a `PRINT_FAILED` order to manually confirm receipt (moves to `PRINTED`).
4. When a void is approved by the Cashier, a `*** VOID ***` ticket prints at the bar to halt drink preparation.

---

### 3.3 Cashier — Settling & Void Control

**Settling an order:**
1. Cashier sees all active orders across all waitstaff on their dashboard.
2. They select a `PENDING` or `PRINTED` order and tap **"Settle"**, choosing the payment method (Cash / Telebirr / CBE Birr).
3. The Waitstaff's cash liability increments atomically in real time.

**Approving a void:**
1. A void request from Waitstaff flashes on the Cashier dashboard (Amber state).
2. Cashier reviews it, enters their 4-digit PIN, and taps **"Approve"** or **"Reject"**.
3. On approval: a VOID ticket prints at the bar; the order is voided; liability adjusts if needed.
4. On rejection: the order returns to its previous active state (`PENDING` or `PRINTED`).

**Direct void (Cashier-initiated):**
1. Cashier can void a `PRINTED` order directly without a Waitstaff request.
2. They must enter a mandatory `reason` and declare whether cash was already collected (`wasPaymentCollected`).
3. If cash was collected: the order enters `PENDING_CASH_RESOLUTION`. The Cashier cannot finalize the void until the Cafe Admin accounts for the cash (returned to till, or added to shift liability).

---

### 3.4 Void Protocol — Full State Narrative

```
Waitstaff requests void  →  VOID_REQUESTED (Amber)
                                │
                    ┌───────────┴──────────────┐
               Cashier rejects              Cashier approves (PIN)
                    │                           │
          ← previousStatus                   VOIDED ✅
         (PENDING or PRINTED)           (VOID ticket prints)

If PIN fails 5× in 15 min:
  → LOCKED_VOID
  → Waitstaff PWA shows: "Void locked — see Manager"
  → Cafe Admin alerted
  → Admin can: Reject void (→ PENDING/PRINTED) | Re-open (→ VOID_REQUESTED) | Force void (→ VOIDED)

If same Cashier causes 2+ LOCKED_VOIDs in one shift:
  → Cashier Misconduct Alert fires to Cafe Admin
```

---

### 3.5 Shift Reconciliation (*Hisab Mawerarad*)

This is the end-of-shift cash accounting ceremony that eliminates manual ledger disputes.

**Pre-condition:** All of the Waitstaff's orders must be in a terminal or settled state. If any order is `PENDING`, `PRINTED`, `PRINT_FAILED`, or `VOID_REQUESTED`, reconciliation is blocked with a message listing the outstanding orders.

**Flow:**
1. Cashier taps **"Close Shift"** on the Waitstaff's profile.
2. The Waitstaff's mobile session is immediately terminated (JWT invalidated via `sessionVersion` increment).
3. **Waitstaff declaration:** The Waitstaff inputs the total physical cash they have in their apron.
4. **Cashier audit:** The Cashier counts and inputs the physical cash received.
5. System calculates:
   - `Variance = Physical Cash Counted − Expected Cash (currentLiability)`
   - `Declaration Gap = |Cashier Counted − Waitstaff Declared|`
6. If Declaration Gap > `declarationGapAlertThreshold`: a forensic alert is logged for management.
7. If Variance < −`shortageAlertThreshold` (a shortage): Cafe Admin or Manager PIN countersignature required.
8. Shift is marked **BALANCED**, **SURPLUS**, or **SHORTAGE (Guda'et)**. The Waitstaff's liability resets to zero and their profile unlocks.

---

### 3.6 Cafe Admin — Menu & Staff Management

**Dynamic CMS:**
- Admin creates/edits categories and products at any time without developer intervention.
- The **"86" toggle** (`isAvailable = false`) instantly removes an item from all active Waitstaff PWA screens via WebSocket. New orders cannot include it.
- Price and cost fields are tracked separately.

**Staff & Role Management:**
- Admin creates custom roles (e.g., "Head Waitress") and assigns specific permissions.
- Permission ceiling: Cafe Admin can only grant permissions within `CAFE` and `STATION` scopes — never `SYSTEM`-scope permissions.

**Admin Amendment Workflow:**
- For `PENDING` orders only: Admin can correct a table number (single auth) or correct a product/quantity (dual auth — requires a distinct second authorizer, `actorId !== authorizedBy`).
- Amendments create an `AMENDED` AuditEntry with old and new values. The original financial record is never overwritten.
- Permitted on `PENDING` only. Not permitted on `PRINTED`, `VOID_REQUESTED`, `PENDING_CASH_RESOLUTION`, `SETTLED`, or `VOIDED`.

---

### 3.7 Multi-Branch Chain Dashboard

Chain Masters see a consolidated real-time view across all branches:
- Live orders, void rates, average ticket sizes, table turnover per branch.
- Comparative performance analytics (which branch is busiest, which has the highest void rate).

**Cross-branch menu sync:**
1. Chain Master pushes a price/menu update.
2. All online branches receive it immediately and report `SYNCED`.
3. Offline branches are flagged `PENDING_SYNC` — they receive the update automatically when reconnected.
4. If an **online** branch actively rejects the sync (write error, validation failure — not a timeout), the update is rolled back chain-wide.

---

## 4. Invariants & Non-Negotiable Rules

| # | Rule | Scope |
|---|---|---|
| I-1 | Price is always calculated server-side from DB — never trusted from client | Order creation |
| I-2 | `cafeId` is always injected from the JWT — never accepted from client input | Every mutation |
| I-3 | `currentLiability` is always updated with `$inc` — never read-then-write | Financial ops |
| I-4 | All order status transitions are validated against the state matrix with role + ownership checks | State machine |
| I-5 | The `auditLog` array only grows — never shrinks. Cloud sync rejects any batch where it has shrunk | Sync integrity |
| I-6 | Void approval (Cashier PIN) is always validated server-side via `bcrypt.compare` | Void protocol |
| I-7 | Session invalidation on shift lock is enforced via `sessionVersion` — not just WebSocket disconnect | Auth |
| I-8 | `PENDING_CASH_RESOLUTION → VOIDED` with "Add to Liability" must atomically `$inc currentLiability` | Financial ops |
| I-9 | Reconciliation cannot start while any order is in a non-terminal, non-settled state | Shift close |
| I-10 | `VOID_REQUESTED` rejection restores `previousStatus` (PENDING or PRINTED) — not always PENDING | State machine |

---

## 5. Edge Cases

| Scenario | Expected Behavior |
|---|---|
| Printer goes offline mid-shift | Order enters `PRINT_FAILED`; Waitstaff alerted; Barista screen shows order as fallback |
| Cashier enters wrong PIN 5 times | Order → `LOCKED_VOID`; Waitstaff notified; Admin alerted |
| Same Cashier causes 2+ LOCKED_VOIDs per shift | Cashier Misconduct Alert fires to Cafe Admin |
| Shift locked while order is in PENDING | Reconciliation blocked until order is resolved (settled or voided) |
| Internet drops during cloud sync | Edge node operates fully offline; pending sync queued for reconnect |
| Branch offline during chain menu update | Branch marked `PENDING_SYNC`; update delivered on reconnect |
| Online branch rejects chain menu sync | Entire chain update rolled back; conflict notification sent |
| Cashier voids after collecting cash | Order → `PENDING_CASH_RESOLUTION`; blocked until Admin accounts for cash |
| PENDING_CASH_RESOLUTION unresolved at shift close | Reconciliation blocked; Admin must act first |
| Waitstaff declares different amount than Cashier counts | Declaration Gap calculated; forensic alert if > `declarationGapAlertThreshold` |
| Shortage > `shortageAlertThreshold` | Manager/Admin PIN countersignature required to close shift |
| Cafe Admin amends a PRINTED order | Amendment rejected — only PENDING orders are amendable |
| Power cuts; Mini-PC reboots | Replica set restores; health gate verifies; Edge node resumes without cloud |
| TPM not found on Mini-PC | Deployment falls back to encrypted read-only OS config file (Tier 2) |

---

## 6. Success Criteria

### Activation
- [ ] A new cafe can go from zero to "First Bon Sent" in under 15 minutes from initial network setup.

### Core Operations
- [ ] Waitstaff can place an order and see it appear on the Barista terminal in < 500ms on local Wi-Fi.
- [ ] Barista receives a `PRINT_FAILED` alert and can manually acknowledge within 30 seconds.
- [ ] Cashier can approve a void in < 60 seconds from the void request appearing.
- [ ] End-of-shift reconciliation completes in < 5 minutes including both declarations.

### Financial Integrity
- [ ] `currentLiability` matches the sum of all `SETTLED` CASH orders + any `PENDING_CASH_RESOLUTION → VOIDED (liability)` orders at all times.
- [ ] Zero financial records are modifiable outside the defined state machine transitions.
- [ ] Every status transition has a corresponding `AuditEntry` in the `auditLog`.

### Security
- [ ] Direct database modification on the edge node does not propagate to cloud (rejected by `auditLog` shrink check).
- [ ] Revoked session JWT is rejected by the server after `sessionVersion` increment.
- [ ] A Cashier who fails the PIN 5 times cannot approve the void without Cafe Admin intervention.

### Business
- [ ] LTV:CAC ratio ≥ 3:1 maintained at ETB 1,500/mo average retainer and < ETB 30,000 CAC.
- [ ] Customer health alerts fire within 24 hours of threshold breach.

---

## 7. Validation Plan

| Behavior | Test Type |
|---|---|
| Sub-500ms order dispatch on local Wi-Fi | Integration test with latency assertion |
| `currentLiability` atomicity (concurrent settlements) | Unit test: parallel `$inc` calls, verify final value |
| State machine illegal transition rejection | Unit test: every invalid transition returns 403 |
| `auditLog` shrink rejection on sync | Integration test: modify local DB, trigger sync, verify rejection |
| PIN brute-force lockout at attempt #5 | Integration test: 5 wrong PINs → `LOCKED_VOID` |
| `VOID_REQUESTED` rejection restores `previousStatus` | Unit test: PRINTED → VOID_REQUESTED → reject → PRINTED |
| Shift close blocked with unresolved orders | Integration test: open PENDING order → attempt reconcile → blocked |
| `PENDING_CASH_RESOLUTION` liability `$inc` | Unit test: Admin "add to liability" → assert `currentLiability += order.totalAmount` |
| Replica set health gate blocks server without RS | Integration test: start without `rs.initiate()` → verify server does not accept connections |
| Reconciliation: all three numbers stored | Unit test: variance + declaration gap both calculated and stored |
