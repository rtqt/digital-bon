# Getting Started

This tutorial guides a developer through setting up DigitalBon, creating a root Super Admin, and processing the first transaction as a Waitress.

## Prerequisites
Ensure the server and client are running as described in the root `README.md`.

## Step 1: Initialize the Database (Super Admin)

When the database is entirely empty, the first user created must be the Super Admin.

1.  Navigate to `http://localhost:3000/superadmin` in your browser.
2.  Follow the onboarding prompts to create the initial root account. 
3.  Log in using these root credentials.

## Step 2: Create a Cafe Branch

A "Cafe" is the highest level tenant boundary in the application.

1.  From the Super Admin Dashboard, locate the **Branches** section.
2.  Click **Add New Branch**.
3.  Enter a recognizable name (e.g., "Bole Branch").
4.  The system will automatically generate a unique 4-character alphanumeric `cafeCode` (e.g., `B7X2`). **Write this down.** This code identifies which branch staff are logging into.

## Step 3: Create Branch Roles and Staff

Switching context to the Cafe Admin.

1.  Log out of the Super Admin account.
2.  Navigate to `http://localhost:3000/admin`.
3.  Log in using the `cafeCode` generated in Step 2. Since this is a new branch, you may need to seed an initial Admin user via a GraphQL mutation, or use the Super Admin interface if user-creation across branches is exposed there.
4.  Once logged into the Admin dashboard, navigate to **Staff Roster**.
5.  Create a user with the role "Cashier". Give them a 4-digit PIN (e.g., `1234`).
6.  Create a user with the role "Waitress". Give them a 4-digit PIN (e.g., `5678`).

## Step 4: Create a Menu Item

1.  In the Admin dashboard, navigate to **Menu**.
2.  Create a Category (e.g., "Hot Drinks").
3.  Create a Product (e.g., "Macchiato", Price: 35 ETB).

## Step 5: Process a Transaction (Waitress)

1.  Open a new browser window simulating a mobile device.
2.  Navigate to `http://localhost:3000/mobile`.
3.  Log in using the `cafeCode` and the Waitress PIN (`5678`).
4.  Select a Table (e.g., "Table 1").
5.  Add a "Macchiato" to the order and hit **Send Order**.

*Congratulations! You have successfully configured a multi-tenant environment and processed your first order.*
