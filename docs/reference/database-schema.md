# Database Schema Reference

DigitalBon uses MongoDB with Mongoose ORM. The data model is designed for a multi-tenant architecture, partitioned by `cafeCode`.

## Core Collections

### 1. Cafe
Represents a physical branch or tenant.
- `name` (String): The human-readable name of the branch.
- `cafeCode` (String, Unique): A 4-character alphanumeric identifier used for login routing and multi-tenant scoping.
- `vatRate` (Number): Optional VAT percentage (e.g., 0.15 for 15%).
- `globalThresholds` (Object): Settings enforced by the Super Admin.
  - `maxVoidAmount` (Number): The maximum ETB amount a cashier can void in a single shift.
  - `alertShortageAmount` (Number): The ETB threshold that triggers a high-priority alert to the Super Admin.

### 2. User
Represents a staff member or administrator.
- `name` (String)
- `pin` (String): Stored as a bcrypt hash.
- `role` (ObjectId -> Role): Reference to their dynamic role.
- `cafe` (ObjectId -> Cafe): Reference to the tenant.
- `status` (Enum): `ACTIVE`, `IN_RECONCILIATION`.
- `currentLiability` (Number): Tracks cash shortages in ETB. Must be 0 for a user to be `ACTIVE` if they handle cash.
- `isSuperAdmin` (Boolean): Master flag for the root system controller.

### 3. Role
Dynamic roles created by Cafe Admins.
- `name` (String)
- `cafe` (ObjectId -> Cafe): Scopes the role to a specific branch.
- `permissions` (Array of Strings): Enum values mapping to specific capabilities (e.g., `MANAGE_MENU`, `PROCESS_PAYMENTS`).

### 4. Product & Category
The menu structure.
- **Category:** `name`, `cafe` (ObjectId -> Cafe).
- **Product:** `name`, `price` (Number), `category` (ObjectId -> Category), `cafe` (ObjectId -> Cafe).

### 5. Order
Transactional records.
- `items` (Array of Objects): Snapshot of product ID, name, quantity, and price at the time of order.
- `totalAmount` (Number)
- `status` (Enum): `PENDING`, `VOID_REQUESTED`, `VOIDED`, `PAID`.
- `tableNumber` (String)
- `waitress` (ObjectId -> User)
- `cashier` (ObjectId -> User): Only set when the order transitions to `PAID`.
- `cafe` (ObjectId -> Cafe)

### 6. SystemLog
Immutable audit trail.
- `type` (Enum): `VOID`, `SHORTAGE`, `SETTINGS_CHANGE`, `LOGIN`.
- `message` (String): Human-readable event description.
- `severity` (Enum): `INFO`, `WARNING`, `CRITICAL`.
- `cafe` (ObjectId -> Cafe)
- `timestamp` (Date): Uses a MongoDB TTL Index (`expires: '30d'`) to automatically delete logs older than 30 days to save costs.
