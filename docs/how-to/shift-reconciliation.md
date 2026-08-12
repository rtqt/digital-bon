# Shift Reconciliation (Dual-Blind)

The Shift Reconciliation process is the core loss-prevention mechanism in DigitalBon. It is designed to prevent collusion between Cashiers and Waitresses by requiring independent cash declarations.

## Prerequisites
- An active Waitress account with completed, unpaid orders.
- An active Cashier account.

## The Dual-Blind Workflow

### Step 1: Waitress End of Shift
When a Waitress completes her shift, she must declare the cash she is handing over to the Cashier. Crucially, the Waitress *cannot see* how much the system expects her to have.

1. The Waitress logs into the mobile app (`/mobile`).
2. She calculates the physical cash in her pouch.
3. She navigates to the **End Shift / Settle** section (if implemented on mobile) or hands the cash to the Cashier.

### Step 2: Cashier Receives Cash
The Cashier receives the physical cash from the Waitress. The Cashier *also cannot see* the system's expected total for that Waitress.

1. The Cashier logs into the Cashier dashboard (`/cashier`).
2. The Cashier navigates to the **Shift Reconciliation** interface.
3. The Cashier selects the Waitress's name.
4. The Cashier enters the exact amount of physical cash received from the Waitress.
5. The Cashier enters their 4-digit PIN to authorize the count.

### Step 3: System Evaluation
The system receives the Cashier's declared amount and compares it against the calculated database total for that Waitress (Total Orders - Voids).

**Scenario A: Exact Match (or Over)**
- The shift is successfully closed.
- Orders are marked as `PAID`.
- No liability is recorded.

**Scenario B: Shortage (Under)**
- The shift is closed, and orders are marked as `PAID`.
- The difference (Expected - Declared) is calculated.
- This difference is added to the Waitress's `currentLiability` field.
- The Waitress's `status` is automatically changed to `IN_RECONCILIATION`.
- **Result:** The Waitress is locked out of the system until the Cafe Admin manually resolves the liability and reactivates their account.

## Handling Void Requests

Waitresses cannot delete items or void orders themselves.

1. **Waitress:** Taps "Request Void" on an order in the mobile app.
2. **System:** The order status changes to `VOID_REQUESTED`.
3. **Cashier:** Sees the order highlighted in red/orange on the Cashier dashboard.
4. **Cashier:** Clicks "Approve Void" and enters their 4-digit PIN.
5. **System:** The order is marked `VOIDED` and removed from the Waitress's expected cash total. System logs this event for the Super Admin.
