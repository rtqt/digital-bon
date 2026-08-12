# Managing Staff and Roles

This guide explains how to manage user access within a specific Cafe branch.

## Understanding Roles and Permissions

DigitalBon uses a dynamic role-based access control (RBAC) system at the Cafe level. Unlike hardcoded roles, Cafe Admins can define custom roles and attach specific `PERMISSIONS` to them.

Available base permissions:
- `MANAGE_MENU`: Create, edit, and delete categories and products.
- `MANAGE_STAFF`: Create users, reset PINs, lock/unlock accounts.
- `MANAGE_TABLES`: Add or remove table definitions.
- `PROCESS_PAYMENTS`: Required to settle orders (Cashier functionality).
- `TAKE_ORDERS`: Required to create orders via the mobile interface (Waitress functionality).

## Creating a Custom Role

1.  Access the Admin Dashboard (`/admin`).
2.  Scroll to the **Create Role** card.
3.  Enter a role name (e.g., "Senior Waitress").
4.  Check the boxes for the desired permissions (e.g., `TAKE_ORDERS`).
5.  Click **Create Role**.

## Adding a New Staff Member

1.  Access the Admin Dashboard (`/admin`).
2.  Scroll to the **Add Staff Member** card.
3.  Enter the employee's full name.
4.  Select a previously created Role from the dropdown menu.
5.  Assign a secure 4-digit PIN. *Note: PINs must be unique across the specific cafe branch.*
6.  Click **Add Staff**.

## Editing or Locking a Staff Member

If a staff member forgets their PIN, or if they need to be suspended:

1.  In the Admin Dashboard, locate the **Staff Roster** card.
2.  Hover over the target user. An **Edit** button will appear on the right side of the row.
3.  Click **Edit**.
4.  A modal will appear allowing you to:
    *   Change the user's Name.
    *   Set a new 4-digit PIN.
    *   Change their Status (e.g., `ACTIVE` to `IN_RECONCILIATION`). Setting a user to `IN_RECONCILIATION` will immediately block them from logging in.
5.  Click **Save Changes**.
