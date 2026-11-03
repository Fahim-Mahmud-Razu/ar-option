# AR Option: Agent Directives

**Version:** 1.0
**Date:** 2 November 2026
**Status:** Mandatory for every developer and AI agent working on AR Option
**Read with:** [DESIGN.md](DESIGN.md) for every UI task

If a request conflicts with a rule in this file, say so before writing code. Do not work around a rule silently.

---

## 1. Product

AR Option is a POS, stock and accounts system for one clothing retail business with several shops. Each deployment serves one business, with its own database.

AR Option started from Fast Hisab code. **Fast Hisab's single-store rules do not apply here.** Multi-shop behaviour is the core of this product.

The product must always be able to answer these four questions correctly:

1. How much did each shop sell, and how much did all shops sell together?
2. How much cash should be in each shop right now?
3. Which products (and, when sizes are on, which sizes) are in which shop?
4. Which courier parcels are still out, and how much money do couriers owe the business?

---

## 2. Scope

| Area | In scope |
|---|---|
| Dashboard | Shop-level and all-shops figures |
| User Management | Users, Roles, Shop Management |
| Contacts | Customers and suppliers |
| Products | All Products, Add Product, Stock, Categories, Brands, Import Products, Stock Transfers |
| Purchases | Simplified supplier purchases |
| Sell / POS | POS, All Sales, Return & Exchange |
| Courier | Parcels, Courier Settlement |
| Expenses | Per shop, including recurring expenses |
| Payment Accounts | Cash, bank and mobile money accounts |
| Financial Statements | Balance Sheet, Trial Balance, Cash Flow |
| Reports | Profit & Loss, Sales, Stock, Daily Cash Closing, Expenses, Manual Returns |
| Settings | Business profile, shops, return limits, the sizes setting, backup, restore and reset |

**Out of scope.** These must have no menu item, no route and no reachable API:

- Barcode Studio and barcode labels
- The Variation Templates page (sizes themselves stay in scope, see Rule 4)
- Invoice PDF and packing slip PDF generation
- Draft Carts and Sales Quotations
- Credit sales at the counter

A suspended cart (see Terms) is not a Draft Cart. It lives on one device only, has no route and no API, and has no stock or money effect.

---

## 3. Terms

Use these words in the UI, in code comments and in tests.

| Term | Meaning |
|---|---|
| Shop | A physical selling location. The database table stays `locations`, but the UI always says "Shop", never "Branch". |
| System location | A stock location that is not a shop: `With Courier` and `In Transit`. |
| All shops | The combined view across every shop. Read-only. |
| Counter sale | A sale paid in full at the POS. |
| Courier sale | A sale where a courier delivers the goods and money may arrive later. |
| Settlement | A payment from a courier that covers one or more parcels. |
| Manual return | A return with no linked sale. |
| Entry | A balanced set of ledger lines for one business event. |
| Suspended cart | A cart parked on one device. It is never saved on the server, so it is not a Draft Cart. |
| Till | The cash drawer of one shop. Its balance is the ledger balance of the shop's cash account. |
| Till session | One open-to-close period of a till. A shop has at most one open session. |
| Float | The cash put in a till at the start of a session. |
| Payment account | An asset account that takes money: a shop's cash account, or a bank, card or mobile money account. |
| MultiPay | One counter sale paid with more than one payment. |

---

## 4. Cardinal Rules

### Rule 1: Every record belongs to a shop

- Writes require a shop. If the shop is missing, reject the request with `400`. **Never default to shop 1 or to the first shop.**
- Resolve the shop on the server, in one shared guard. Do not repeat this logic in each service.
- A shop outside the user's assigned shops returns `403`, whatever the client sends.
- Admins may read one shop or All shops. All shops is the admin default for reports and the dashboard.
- Shop-owned records: stock, sales, returns, transfers, expenses, cash registers, courier parcels and shop cash accounts.
- Company-wide records: products, categories, brands, contacts and expense categories.
- Users can belong to more than one shop through a user-to-shop mapping. Their active shop must be visible on every screen.
- System locations never appear in shop pickers and can never sell stock, but their stock value still counts in the Balance Sheet.

### Rule 2: The server calculates all money

- Never trust a total, refund, due amount or cost sent by the client.
- Recalculate from stored prices, lines, discounts and the user's permissions.
- Price overrides require the `pos.edit_price` permission and stay within the user's discount limit.

### Rule 3: The ledger is the source of truth

- Every money event posts one balanced entry, in the same database transaction as its stock change and source document.
- One posting function writes every ledger line. It rejects an entry when debits do not equal credits. No other code writes to `account_transactions`.
- Each ledger line stores its account, shop, entry type and source document. The shop may be empty only for company-level entries such as owner capital.
- Look up accounts by stable code. **Never hardcode a numeric account ID and never fall back with `|| 1`.**
- Each shop has configured payment accounts. If an account is missing, fail with a clear error.
- Reports and Cash Flow classify lines by `entry_type`. **Never read note text to decide what a line means.**
- Posted entries are permanent. Correct a mistake with a reversal entry plus a new entry. The only exception is an admin's backup restore or data reset (section 5.6), which replaces or empties the books as a whole.
- Opening balances come from setup data. Never put demo balances or hardcoded opening figures in production code.
- Equity must come from ledger data. Never calculate it as assets minus liabilities, because that makes the balance check impossible to fail.
- Purchases debit Inventory. Cost of goods is posted when goods are sold.

### Rule 4: Stock moves only through the movement service

- Every stock change goes through the stock movement service, including sales, returns, exchanges, purchases, transfers and courier events. **No direct update of `qty_available`.**
- Each movement records who, when, from where, to where, why, and the source document.
- Stock is tracked per variation. Sizes are a business setting (`use_sizes`, off for this client). With sizes off, every product has exactly one hidden `Standard` variation whose SKU is the product code, and no screen shows a size.
- Online counter sales cannot oversell. If an offline sale syncs and takes stock negative, accept it and add it to a review list.
- Damaged goods never return to sellable stock.

### Rule 5: Permissions are enforced by the API

- Every API route declares a permission key, and one guard checks it. Hiding a button is not security.
- `admin` is a superuser. Every other role uses the editable `role_permissions` data.
- Required new keys: `shops.manage`, `transfers.send`, `transfers.receive`, `returns.create`, `returns.manual`, `returns.approve`, `courier.view`, `courier.manage`, `courier.settle`.
- Keys already in use: `pos.edit_price`, `cash.reconcile`.
- Keys planned for the POS, catalog and till work: `pos.sell`, `expenses.create`, `contacts.view`, `contacts.manage`, `products.view`, `products.manage`, `products.import`, `payment_accounts.manage`, `ledger.post`, `till.view`, `till.open`, `till.setup`, `till.cash_in`, `till.cash_out`, `till.close`.

### Rule 6: Every write is safe to retry

- POS sales, returns, courier events and settlements all accept a client reference and return the original record on a retry.
- Only counter sales may be queued offline. Courier actions, returns, transfers and settlements require a connection.

### Rule 7: Receipts use short sequential numbers

- Each shop has its own sequence, for example `GUL-000142`. Generate the number inside the database transaction.
- Do not use time-based or random invoice numbers. Staff need a number they can read aloud and search for.

### Rule 8: Schema changes go in two places

- Add every table, column, index, sequence or constraint to both `db/schema.sql` and a new numbered file in `db/migrations/NNN_description.sql`.
- Migrations must not contain `BEGIN` or `COMMIT`, because the migrator wraps each file in a transaction.
- Write migrations to be safely re-runnable. Never edit a migration that has already been applied.
- New code is PostgreSQL only. Do not add in-memory fallback branches.

### Rule 9: Every screen works on every device

- AR Option is one responsive web app, installable as a PWA. There is no separate mobile codebase and no native app.
- Every feature must work on Android phones, iPhones, iPads and desktops. A screen is not done until it passes the test matrix in [DESIGN.md](DESIGN.md#layout).
- Choose layouts by width and pointer type. Never detect the device from the user agent.

### Rule 10: Protect real data

- Automated tests run only against the local Docker database. Check `DATABASE_URL` before running anything that writes.
- Never point tests or a development API at the production database.
- Production gets no seed data except system accounts and system locations.

### Rule 11: Printing is optional and thermal only

- If receipt printing is enabled, use the 80mm auto-height layout: `@page { size: 80mm auto; margin: 0; }`, with a 72mm content width and no fixed heights.
- No feature may depend on printing, because phones and tablets may have no printer.

---

## 5. Feature Rules

### 5.1 Return & Exchange

- One document holds items coming back, items going out, and the net amount. Use `transaction_lines.direction` (`in`, `out`).
- Stock, ledger and document all save in one database transaction.
- The net result is either the customer pays, the shop refunds, or nothing is owed.
- Refund the price actually paid, including line discounts and a fair share of any cart discount. Never refund the list price.
- A linked return cannot exceed the quantity sold minus earlier returns.
- Each returned item needs a condition: `resaleable` or `damaged`.
- Save the reason and notes. Fast Hisab accepts a note and then discards it.
- Manual returns require the `returns.manual` permission, the customer's phone number and a reason.
- Manual returns above the limit in Settings require approval from a user with `returns.approve`.
- Staff should pick catalogue products. An `Unlisted item` line is allowed only on a manual return. It has a cash effect and no stock effect.
- The Manual Returns report lists these returns by staff member and shop.

### 5.2 Courier

A parcel has two independent statuses. **Delivered does not mean paid.**

- **Delivery status:** Booked, In Transit, Delivered, Partly Delivered, Returned, Lost.
- **Payment status:** Unpaid, Partial, Paid. This is always calculated from money received and is never edited directly.

Rules:

- Courier sales start at the POS. The full-payment rule stays in place for counter sales, and courier sales use their own server path.
- Booking moves stock from the shop to `With Courier`.
- **The sale is recorded at delivery, not at booking.** A returned parcel must not count as a sale or as profit.
- Cash changes only when money actually moves. Marking a parcel Delivered never adds cash.
- Track partial delivery per line. If a customer keeps one of two items, only that item is sold.
- A settlement covers many parcels. The user enters the amount received and the charges, and any difference must be explained before saving.
- A change after booking posts an adjustment entry and writes to the activity log. Never overwrite a past amount.

Example: a ৳2,000 sale with a ৳300 advance and a ৳60 courier charge.

| Event | Stock | Ledger entry | Cash change |
|---|---|---|---|
| Booked, ৳300 by bKash | Shop to `With Courier` | Dr bKash 300, Cr Customer Advances 300 | +300 |
| Delivered | Leaves `With Courier`, sold | Dr Courier Receivable 1,700, Dr Customer Advances 300, Cr Sales Revenue 2,000. Also Dr COGS, Cr Inventory at cost | None |
| Courier pays ৳1,640 | None | Dr Bank 1,640, Dr Courier Charges 60, Cr Courier Receivable 1,700 | +1,640 |
| Partly Delivered | Kept items sold, others go back | Same as Delivered, for kept items only | None |
| Returned | `With Courier` to shop, or to damaged | Clear Customer Advances by refund or by the kept-advance policy. Post any return charge to Courier Charges | Only if refunded |
| Lost | Abnormal stock loss | Clear Customer Advances. Record a claim only if the courier accepts it | Only if refunded |

New accounts required: Courier Receivable (asset), Customer Advances (liability), Courier Payable (liability) and Courier Charges (expense).

Manual entry comes first. Courier API integrations are a later phase.

### 5.3 Stock Transfers

- A transfer has two steps: **Sent** and **Received**.
- Sent moves stock from the source shop to `In Transit`.
- Received moves stock from `In Transit` to the destination shop. Only a user assigned to the destination shop can confirm.
- The received quantity cannot exceed the sent quantity. Record any shortage with a reason.
- Transfers have no effect on the ledger.

### 5.4 Shop-level reporting

- Reports and the dashboard must apply the shop filter in SQL.
- Trial Balance and Balance Sheet are company-wide, with shop-level balances shown for cash accounts.
- Profit & Loss, Cash Flow, Sales, Expenses and Daily Cash Closing all support one shop or All shops.

---

### 5.5 Payments, Till and Catalog (decided 2 November 2026, not yet built)

- A counter sale takes one or more payments. They must add up to the server's total to the paisa. Change is never a ledger line.
- Every payment uses a payment account that the shop may use. Card and mobile money accounts are configured data and are never seeded.
- Expected till cash is always the ledger balance of the shop's cash account. No second source exists.
- The first till open posts the difference between the float and the ledger balance to `OWNER_EQUITY` and needs `till.setup`. Later opens pre-fill the ledger balance. A different count needs a reason and posts to `TILL_OVER_SHORT`.
- Pay-in debits cash and credits `OWNER_EQUITY`. Pay-out goes through the expense path as one entry. An owner pull or the close handover debits `OWNER_DRAWINGS` and credits cash. At close, any difference is posted so the ledger equals the count. Each entry has its own `client_ref`.
- Selling is not blocked when the till is closed. If the client wants a block, it applies to cash payments only and sits behind a setting.
- Price overrides need `pos.edit_price`. Every reduction (override, line discount and cart discount) must stay within the user's discount limit. Admins have no limit.
- Prices and costs belong to the size, not the product. Opening stock posts Dr `INVENTORY`, Cr `OWNER_EQUITY` in the same transaction as the stock movement. A cost change on a size that holds stock posts a revaluation to `INVENTORY_ADJUSTMENT`.

### 5.6 Settings, backup and reset (decided 3 November 2026)

- Settings are company-wide rows in `settings`, read by `GET /settings` and changed only by an admin.
- `use_sizes` can be turned off only while every active product has one size, so no stock split by size is hidden.
- A shop's name can change. Its code cannot, because it is the receipt prefix. A rename also renames the shop's own accounts.
- **Backup** is a JSON file of every business table, read in one snapshot. Every table must be listed in `apps/api/src/system/tables.ts`, or backups miss it.
- **Restore** replaces every business table with the file's rows in one transaction. It refuses a file from another schema version.
- **Reset** has two levels, both admin-only, typed-confirmation and one transaction. *Clear transactions* empties sales, returns, stock, transfers, courier, till, expenses, imports and the ledger, and keeps the catalog, contacts, shops and users. *Factory reset* also empties the catalog, contacts and expense categories (re-seeded with the defaults), removes every shop and every user except the admin who runs it, and keeps system accounts, system locations, role permissions and settings.
- The web app downloads a backup before it sends any reset.

## 6. Fast Hisab Code Traps

Do not carry these patterns forward.

| Inherited code | Problem | Required action |
|---|---|---|
| `LocationScopeGuard`, `resolveScopedLocation` | Falls back to shop 1. Only POS locks a user to their shop | Replace with one guard (Rule 1) |
| `PosService.createSell` | Updates stock directly and rejects any part payment | Move stock through the movement service. Keep full payment for counter sales only |
| `PosService.easyReturn` | Refund only. Trusts the client's amount, uses list price, has no quantity cap, and always restocks | Replace (section 5.1) |
| `ContactsService.payDue` | Writes one ledger line and does not update the account balance | Replace with the posting function |
| `AccountsService.getBalanceSheet` | Hardcoded opening capital. Equity is calculated so that the check always passes | Rewrite (Rule 3) |
| `AccountsService.getCashFlow` | Hardcoded opening cash. Sorts lines by note text | Rewrite with `entry_type` |
| `ReportsService` | Accepts `location_id` but ignores it almost everywhere | Apply the filter in SQL |
| `resolvePaymentAccount`, `account_id \|\| 1` | Picks the first matching account | Use the shop's configured accounts |
| `ExpensesView` | Defaults to location 1 | Add a shop picker |
| `PurchasesService` | Debits COGS at purchase | Debit Inventory |
| Controllers with no permission check | The Roles page is not enforced on most routes | Add the permission guard (Rule 5) |
| `DatabaseService` seed | Inserts demo balances | Keep demo data out of production |
| `isLivePostgres` branches | Every write path exists twice | Do not extend them |
| Hardcoded "Three Elixir" and "Fast-Hisab" | Wrong branding | Move to settings |

---

## 7. Unconfirmed Assumptions

These have not been confirmed by the client. Before building a feature that depends on one, check that it has been confirmed, and update this table with the answer.

| # | Assumption | Affects | Status |
|---|---|---|---|
| 1 | Stock is tracked by size | Products, POS, transfers, returns | Changed 3 November 2026: the client does not sell by size. Sizes sit behind the `use_sizes` setting, off by default |
| 2 | "Condition courier" means the courier collects the price and sends it to the shop | Courier module | Unconfirmed |
| 3 | The rules for delivery charges, return charges and advances still need defining | Courier ledger entries | Unconfirmed |
| 4 | Couriers may settle many parcels in one payment | Settlement screen | Unconfirmed |
| 5 | Each shop keeps its own cash. Bank and bKash accounts may be shared | Payment accounts | Confirmed by the user, 2 November 2026 |
| 6 | Purchases, Contacts, Payment Accounts and Dashboard are kept, although the client's list did not name them | Scope | Contacts confirmed, 2 November 2026. The rest is unconfirmed |
| 7 | A return at another shop is allowed. Stock and the refund belong to the receiving shop | Return & Exchange | Unconfirmed |
| 8 | Thermal receipts are wanted | Printing | Unconfirmed |

---

## 8. Stack and Structure

| Layer | Technology |
|---|---|
| Web app | React 18, Vite, Tailwind CSS 3.4, Lucide, Recharts, vite-plugin-pwa |
| Web hosting | Cloudflare Workers static assets |
| API | NestJS with Fastify, running on Cloudflare Containers |
| Database | Neon Postgres in Singapore, using the pg driver |
| Files and backups | Cloudflare R2 |
| Local tests | Postgres in Docker |
| Test tools | Jest and Playwright |
| Shared code | TypeScript types in `packages/shared-types` |

```text
apps/api                  API
apps/web                  Responsive web app and PWA
packages/shared-types     Types shared by API and web
db/schema.sql             Baseline schema
db/migrations/            Numbered migrations
```

---

## 9. Build Order

1. **Foundation:** posting function, shop-linked accounts, ledger shop stamps, the shop guard, API permissions, and the responsive app shell.
2. **Multi-shop:** Shop Management, user-to-shop mapping, report filters, and two-step transfers.
3. **Daily screens:** remove out-of-scope features, make POS search-first, and add shops to expenses, stock and import.
4. **Return & Exchange.**
5. **Courier and Settlement.**
6. **Go-live:** import the client's data and pilot one shop, checking physical cash against the system daily before adding other shops.

---

## 10. Definition of Done

A task is done only when all of these are true:

- [ ] All three workspaces build with no TypeScript errors:

  ```bash
  npm run build --workspace=packages/shared-types
  npm run build --workspace=apps/api
  npm run build --workspace=apps/web
  ```

- [ ] Automated tests pass against the local test database.
- [ ] New money flows have a test proving the Trial Balance stays balanced.
- [ ] New stock flows have a test proving the movement history matches the stock quantity.
- [ ] New routes have a test for a user without permission and a user from another shop.
- [ ] UI work passes the responsive test matrix in [DESIGN.md](DESIGN.md#layout), in light and dark themes.
- [ ] Schema changes are in both `db/schema.sql` and a migration.
- [ ] Any new pattern is added to [DESIGN.md](DESIGN.md) first.
- [ ] Anything not tested is stated plainly in the handover, including anything tested only by emulation and not on a real device.
