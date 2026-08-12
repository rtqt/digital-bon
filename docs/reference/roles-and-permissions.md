# Roles and Permissions Reference

DigitalBon uses a hybrid Role-Based Access Control (RBAC) system. The root user (`Super Admin`) is hardcoded via a boolean flag on the User schema, while branch-level staff rely on dynamic roles mapped to discrete permissions.

## Root Level

### Super Admin
- **Identifier:** `User.isSuperAdmin = true`
- **Scope:** Global across all tenants.
- **Capabilities:**
  - Create new Cafe branches.
  - Delete Cafe branches.
  - Edit Cafe global thresholds (VAT, alert thresholds).
  - View global System Logs aggregated from all branches.

## Branch Level (Dynamic Permissions)

At the branch level, users are assigned a `Role` document. The `Role` document contains an array of `permissions`.

### Available Permissions

| Permission Tag | Functionality Granted | Typical Role Mapping |
| :--- | :--- | :--- |
| `MANAGE_MENU` | Can CRUD categories and products. | Cafe Admin |
| `MANAGE_STAFF` | Can CRUD branch users and roles. | Cafe Admin |
| `MANAGE_TABLES` | Can CRUD table layouts. | Cafe Admin |
| `TAKE_ORDERS` | Can access the mobile interface, select tables, and create `PENDING` orders. | Waitress, Bartender |
| `PROCESS_PAYMENTS` | Can access the Cashier dashboard, approve/reject voids, and execute Shift Reconciliation. | Cashier |

*Note: A Cafe Admin role typically has `MANAGE_MENU`, `MANAGE_STAFF`, and `MANAGE_TABLES`, but might not have `PROCESS_PAYMENTS`. This separation of duties prevents the person managing the database from also authorizing cash transactions.*
