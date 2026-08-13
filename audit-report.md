# DigitalBon POS: Security & QA Audit Report

## 1. Security & Architecture Risks

### 1.1 Data Bleeds & Multi-Tenant Routing
- **Risk Level**: High
- **Issue**: In `server/src/graphql/resolvers/query.ts`, the `orders` query allows querying without status filtering, and while it filters by `cafeId`, there are mutations that do not strictly check ownership before interacting with resources. For example, in `mutation.shift.ts`, `openShift` uses `c.userId` and `c.cafeId` correctly, but some other endpoints rely solely on the `cafeId` context without ensuring the user actively owns the resource or has the right role permissions dynamically for cross-tenant operations.
- **Recommendation**: Implement strict ownership and role-based checks inside resolvers beyond just `cafeId`. Ensure that user IDs passed in arguments actually belong to the current `cafeId`.

### 1.2 JWT and Shift Locking
- **Risk Level**: Medium
- **Issue**: In `server/src/middleware/auth.ts`, the authentication logic checks `sessionVersion` against the database to enforce shift lock invalidation. However, this incurs a database query on every authenticated request, which can cause performance bottlenecks under load.
- **Recommendation**: Consider caching the `sessionVersion` in Redis or encoding a short-lived token to reduce database round-trips while maintaining security.

### 1.3 `systemExpectedCash` Leakage
- **Risk Level**: High
- **Issue**: In `server/src/graphql/resolvers/mutation.shift.ts`, the `initiateReconciliation` mutation returns `systemExpectedCash` directly to the client. This breaks the "Dual-Blind" reconciliation principle because if the client (cashier UI) receives this data before the cashier submits their count, a malicious cashier could intercept the network response (via DevTools) and declare exactly the expected amount.
- **Recommendation**: Remove `systemExpectedCash` from the return type of `initiateReconciliation`. The expected cash should only be evaluated on the server side during the `submitDualDeclaration` step and optionally returned *after* reconciliation is complete.

## 2. Business Logic Flaws

### 2.1 The Void Workflow & Real-Time Sync
- **Risk Level**: Medium
- **Issue**: In `server/src/graphql/resolvers/mutation.order.ts`, the `requestOrderVoid` mutation sets `previousStatus` correctly. However, if multiple voids are requested rapidly, or if the WebSocket connection drops, there is no robust polling fallback in the client. Waitresses cannot see real-time rejection reasons easily.
- **Recommendation**: Add a robust fallback for WebSocket failures and store detailed void histories (including reasons for rejection) so they can be viewed persistently by waitstaff.

### 2.2 Shortage Countersigning
- **Risk Level**: Medium
- **Issue**: In `countersignShortage`, the admin's pin is verified, but there's no strict check to prevent an admin from countersigning their own shift if they happen to act as a cashier/waitress.
- **Recommendation**: Enforce a "Dual-Auth" check explicitly confirming that the `admin._id` does not equal `shift.waitressId` or `shift.cashierId`.

## 3. UI/UX Improvements

### 3.1 Cashier Dashboard (`cashier/page.tsx`)
- **Friction Point**: The UI uses hardcoded delays (e.g., `setTimeout(() => window.print(), 100);`) for printing. This is brittle and can fail if the DOM hasn't fully rendered the hidden printable component.
- **Improvement**: Use React `ref` or `onAfterPrint` callbacks to handle printing more robustly.
- **Missing State**: During the `submitDualDeclaration` process, if the network is slow, there is no explicit visual loading state on the "Submit Reconciliation" button to prevent double-clicks.

### 3.2 Mobile Waitstaff App (`mobile/page.tsx`)
- **Friction Point**: When a shift is unexpectedly closed (e.g., by Admin), the `openShiftMutation` error handling silently swallows non-UNAUTHENTICATED errors and forces `setShiftOpen(true)` regardless. This could lead to a desynced state where the UI thinks a shift is open, but backend mutations fail.
- **Improvement**: Properly handle server errors for shift opening and display a user-friendly error message, keeping `shiftOpen` false if it fails.
- **UX**: Modals for destructive actions (like Request Void) do not have a loading state on the confirm button, which could lead to multiple void requests being dispatched.

## 4. Code Quality & Performance

### 4.1 GraphQL Over-fetching
- **Issue**: In the client, the `GET_ORDERS` and `GET_MY_ORDERS` queries fetch the entire item list and waitstaff objects constantly via polling or subscriptions. Over time, this could cause memory bloat on mobile devices.
- **Recommendation**: Implement pagination or cursor-based fetching for older orders, and only subscribe to delta updates rather than refetching/merging full objects unnecessarily.

### 4.2 Unnecessary Re-renders
- **Issue**: In `cashier/page.tsx`, the `groupedOrdersArray` computation and the `orders` filtering happen on every render.
- **Recommendation**: Wrap these expensive derived state calculations in `useMemo` hooks to prevent UI stuttering, especially on low-powered tablet devices.