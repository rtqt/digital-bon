# Dual-Blind Architecture

This document explains the business logic and necessity behind DigitalBon's "Dual-Blind Shift Reconciliation" system.

## The Business Problem: Cash Leakage

In environments with high cash volume and lower-wage employees, cash leakage (theft or misplacement) is the primary cause of margin loss. 

Standard POS systems fail because they tell the employee exactly how much cash they *should* have at the end of a shift (e.g., a "Z-Report"). 
1. If a Waitress knows she is supposed to have 500 ETB, but she actually has 550 ETB in her pouch, she simply pockets the extra 50 ETB.
2. If a Cashier and Waitress are colluding, the Waitress can hand over 400 ETB, the Cashier can void 100 ETB worth of orders without oversight, and they split the difference.

## The Dual-Blind Solution

DigitalBon solves this by removing visibility and enforcing strict workflows.

### 1. Waitress Blindness
The Waitress mobile interface intentionally **lacks any total shift reporting**. The Waitress can see individual table totals, but never her cumulative expected cash. 
When her shift ends, she must count her physical cash and hand it over. If she has 550 ETB, she must hand over 550 ETB, because she does not know the system only expects 500 ETB. 

### 2. Cashier Blindness
The Cashier interface for receiving a shift settlement requires the Cashier to input the exact amount of physical cash handed to them *before* they see the expected total.
The system performs the math: `Expected - Declared`.

### 3. Immediate Consequence (Liability Lock-Out)
If the system determines a shortage (e.g., Expected 500, Declared 400), the difference is immediately recorded as `currentLiability` on the Waitress's account.

To enforce accountability, any Waitress with a `currentLiability > 0` has their status automatically switched to `IN_RECONCILIATION`. 
- **Effect:** The Waitress cannot log in to take new orders.
- **Resolution:** The Cafe Admin must physically discuss the shortage with the Waitress, collect the missing funds, and manually reset their status to `ACTIVE` via the Admin Dashboard.

### 4. Void Control
Because Waitresses are held strictly liable for all orders attached to their ID, they cannot delete orders to hide theft. They can only transition an order to `VOID_REQUESTED`.
The Cashier must review the request and enter their PIN to approve the void, changing it to `VOIDED`. This requires two distinct employees to agree on a reduction in cash expectation, drastically reducing solitary theft.
