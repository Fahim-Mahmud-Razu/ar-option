---
name: AR Option
description: Multi-shop POS, stock and accounts for a clothing retailer, built for the counter, the stockroom and the owner's phone.
colors:
  primary: "#881337"
  primary-hover: "#9f1239"
  primary-tint: "#fda4af"
  on-primary: "#ffffff"
  focus-ring: "#ff3366"
  light-bg: "#f8fafc"
  light-surface: "#ffffff"
  light-surface-hover: "#f1f5f9"
  light-border: "#e2e8f0"
  light-text: "#0f172a"
  light-text-muted: "#64748b"
  dark-bg: "#0e111a"
  dark-surface: "#151928"
  dark-surface-hover: "#1d233a"
  dark-border: "#242b45"
  dark-text: "#ffffff"
  dark-text-muted: "#929bb4"
  success: "#10b981"
  success-text-light: "#047857"
  warning: "#f59e0b"
  warning-text-light: "#b45309"
  danger: "#f43f5e"
  danger-text-light: "#be123c"
  info: "#6366f1"
  info-text-light: "#4338ca"
  info-text-dark: "#a5b4fc"
typography:
  display:
    fontFamily: "Inter, Noto Sans Bengali, SolaimanLipi, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(1.5rem, 1.25rem + 1vw, 1.875rem)"
    fontWeight: 800
    lineHeight: 1.15
    fontFeature: "'tnum' 1"
  headline:
    fontFamily: "Inter, Noto Sans Bengali, SolaimanLipi, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "Inter, Noto Sans Bengali, SolaimanLipi, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Inter, Noto Sans Bengali, SolaimanLipi, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  body-touch:
    fontFamily: "Inter, Noto Sans Bengali, SolaimanLipi, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  input-touch:
    fontFamily: "Inter, Noto Sans Bengali, SolaimanLipi, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Inter, Noto Sans Bengali, SolaimanLipi, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.35
  label-bengali:
    fontFamily: "Noto Sans Bengali, SolaimanLipi, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.5
  amount:
    fontFamily: "Inter, Noto Sans Bengali, SolaimanLipi, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.35
    fontFeature: "'tnum' 1"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  gutter-phone: "16px"
  gutter-tablet: "24px"
  gutter-desktop: "24px"
  touch-target: "44px"
  touch-target-primary: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
  button-primary-touch:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    height: "48px"
  card-light:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-text}"
    rounded: "{rounded.lg}"
    padding: "16px"
  card-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.lg}"
    padding: "16px"
  input-fine:
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
    height: "40px"
  input-touch:
    typography: "{typography.input-touch}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
    height: "48px"
  top-bar-phone:
    height: "56px"
  top-bar-desktop:
    height: "64px"
  bottom-tabs:
    height: "56px"
  rail:
    width: "64px"
  sidebar:
    width: "256px"
  drawer:
    width: "288px"
---

# Design System: AR Option

## Overview

**Creative North Star: "The Counter Ledger"**

AR Option should feel like a well-kept shop ledger that fits in the hand. A cashier uses it with a customer waiting. A stock worker uses it on a phone between shelves. The owner checks it from anywhere. Each of them needs a correct number quickly, so numbers lead and decoration stays out of the way.

The visual world continues Fast Hisab: deep maroon, slate neutrals, Inter with Noto Sans Bengali, and light and dark themes. The primary colour is a placeholder for AR Option's brand until the client supplies one. Changing it should mean changing one token.

Fast Hisab was built desktop-first, at a dense 10px to 12px text size. AR Option keeps that density for mouse users but is **designed for the phone first**. This is a change in how screens are planned, not a resize of existing screens.

**Key Characteristics:**

- Numbers first, with tabular figures everywhere money appears
- Mobile-first, with one codebase for every device
- The active shop is always visible
- Two status tracks for courier parcels, always shown separately
- Calm surfaces, with colour reserved for action and status
- Bengali is a first-class language, not a translation layer

## Colors

Maroon carries action, slate carries structure, and four status hues carry meaning.

### Primary

- **Ledger Maroon** (#881337): primary buttons, the active navigation item and key actions.
- **Pressed Maroon** (#9f1239): hover and pressed state of primary buttons.
- **Soft Maroon Tint** (#fda4af): maroon text and icons in dark mode, because Ledger Maroon has only 1.83:1 contrast on the dark surface.
- **Focus Signal** (#ff3366): the keyboard focus ring in both themes.

### Status

Each status has a base hue for dark mode and a darker text colour for light mode. The base hues fail as small text on white, at 2.15:1 to 4.47:1, so they appear on white only as tinted backgrounds, dots or icons next to a text label.

- **Paid Emerald** (#10b981, light-mode text #047857): paid, delivered, received, positive change.
- **Due Amber** (#f59e0b, light-mode text #b45309): due, partial, in transit, awaiting action.
- **Alert Rose** (#f43f5e, light-mode text #be123c): returned, lost, damaged, delete, shortage.
- **Info Indigo** (#6366f1, light-mode text #4338ca, dark-mode text #a5b4fc): information, links, booked.

### Neutral

- **Paper Slate** (#f8fafc) and **White Surface** (#ffffff): the light theme's page and card backgrounds.
- **Hover Slate** (#f1f5f9) and **Hairline Slate** (#e2e8f0): light hover and pressed fills, and borders.
- **Ink** (#0f172a) and **Muted Ink** (#64748b): light theme text.
- **Obsidian** (#0e111a) and **Night Surface** (#151928): the dark theme's page and card backgrounds.
- **Raised Night** (#1d233a) and **Night Line** (#242b45): dark hover and pressed fills, and borders.
- **White Text** (#ffffff) and **Moonlit Grey** (#929bb4): dark theme text.

The theme follows the device setting on first use. A manual choice persists on that device.

**The Semantic Token Rule.** Never use a raw Tailwind palette colour such as `red-500` for meaning. Use the tokens above through CSS variables, so both themes stay correct.

**The Label Rule.** Colour never carries meaning alone. Every status shows a text label.

## Typography

**Interface Font:** Inter, with Noto Sans Bengali, then SolaimanLipi, then the system font

**Character:** Inter is plain and exact at small sizes. Noto Sans Bengali keeps Bengali text clear and is the same fallback in every context.

### Hierarchy

- **Display** (800, fluid 24px to 30px, 1.15): KPI values and the payable total.
- **Headline** (700, 18px, 1.3): page and sheet titles.
- **Title** (600, 15px, 1.4): card titles and section headings.
- **Body** (400, 14px, 1.5): standard text for mouse users.
- **Body Touch** (400, 15px, 1.5): standard text on touch devices.
- **Input Touch** (400, 16px, 1.4): every input on a touch device.
- **Label** (600, 12px, 1.35): captions, table headers and badges.
- **Label Bengali** (600, 13px, 1.5): the same role, in Bengali.
- **Amount** (600, 14px, 1.35): money in lists and tables.

**The 16px Input Rule.** On touch devices, inputs, selects and text areas use 16px text. iPhones and iPads zoom the page when a smaller input takes focus.

**The 12px Floor Rule.** Nothing is smaller than 12px in English or 13px in Bengali. This retires Fast Hisab's 10px and 11px labels.

**The Whole Number Rule.** Money is never truncated with an ellipsis. Long amounts may wrap or take a full row. Currency placement comes from settings and is never hardcoded in a component.

**The Bengali Room Rule.** Bengali labels run longer and sit taller than English. Buttons, tabs and table headers must grow with their text, with no fixed widths and no fixed heights on text rows.

## Layout

### Delivery model

AR Option is one responsive web app, installable as a PWA. It serves Android, iPhone, iPad and desktop browsers from the same screens, and there is no separate mobile site.

**The Width Not Device Rule.** Layout depends on available width and pointer type. Never read the user agent. An iPad in Split View with a narrow window correctly gets the phone layout.

### Device classes

Design the Phone layout first, then add to it with `min-width` breakpoints.

| Class | Width | Typical devices | Navigation | Content |
|---|---|---|---|---|
| Phone | 320px to 743px | Android phones, iPhones, narrow iPad Split View | Top bar and bottom tabs | One column, cards, full-screen sheets |
| Tablet | 744px to 1023px | iPad mini, iPad, iPad Air and 11-inch iPad Pro in portrait | Top bar and 64px rail | Two-column forms, list and detail side by side |
| Laptop | 1024px to 1279px | iPads in landscape, 12.9-inch iPad Pro in portrait, small laptops | 64px rail, expands to 256px | Full tables and KPI rows |
| Desktop | 1280px and wider | Laptops and monitors | 256px sidebar, collapsible to 64px | Multi-panel, keyboard shortcuts |

The tablet breakpoint is 744px, not Tailwind's default 768px, because an iPad mini in portrait is 744px wide and would otherwise get the phone layout.

Set this in `tailwind.config.js`:

```js
export default {
  darkMode: 'class',
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      screens: {
        md: '744px',
        short: { raw: '(max-height: 500px) and (orientation: landscape)' },
        touch: { raw: '(pointer: coarse)' },
      },
    },
  },
};
```

`hoverOnlyWhenSupported` stops hover styles from sticking after a tap on phones and iPads.

### App shell

| Part | Phone | Tablet | Laptop | Desktop |
|---|---|---|---|---|
| Top bar | 56px: back or menu, page title, shop chip, user | 64px: adds search and quick POS | 64px: adds date and calculator | 64px: all controls |
| Main navigation | Bottom tabs | Rail, tap for an overlay drawer | Rail, expands in place | Sidebar |
| Primary action | Sticky bottom bar above the tabs | Top right of the page | Top right of the page | Top right of the page |
| Filters | Search and a Filters button | Inline, wrapping | Inline | Inline |
| Dialogs | Full-screen sheet | Centred, up to 640px | Centred | Centred |

The bottom tabs are built from the user's permissions. The usual set is Home, POS, Sales, Courier and More. More opens the full menu, so **every feature stays reachable on a phone**.

The content container fills the available width up to 1600px. Forms stop at 720px on tablet and wider, except multi-pane screens.

### Spacing

Spacing follows a 4px base: 4, 8, 12, 16 and 24px. Page gutters are 16px on phones and 24px on tablets and wider. Cards use 16px padding, and lists use 8px to 12px gaps.

### Viewport and platform setup

Use this in `index.html`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<meta name="theme-color" content="#f8fafc" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0e111a" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png">
```

Use this as the base CSS:

```css
:root {
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
}

html {
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}

body {
  min-height: 100vh;
  min-height: 100dvh;
  overscroll-behavior-y: none;
}

button, a, [role="button"] {
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

@media (pointer: coarse) {
  input, select, textarea { font-size: 16px; }
}

@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

`overscroll-behavior-y: none` prevents an accidental pull-to-refresh during a sale. Screens that need refresh provide a visible refresh control.

**The Safe Area Rule.** The top bar, bottom tabs, sticky bars and sheet footers must add the matching safe-area inset. Use `padding-bottom: max(12px, var(--safe-bottom))` for bottom bars. In landscape, also pad the left and right edges.

**The Dynamic Height Rule.** Use `dvh`, with `vh` as the fallback, for full-height layouts. Plain `100vh` hides content behind mobile browser bars. `dvh` needs Safari 15.4 or Chrome 108, and older browsers use the fallback.

### Platform behaviour

| Platform | Required behaviour |
|---|---|
| Android | The back gesture closes the open sheet or drawer before leaving the page, so every open sheet adds a history entry. Screens must work on small, slow phones. PWA install is offered from the menu |
| iPhone | Handle the notch, the Dynamic Island and the home indicator. No browser back button exists in an installed PWA, so every inner screen shows a back control. Installation is by Add to Home Screen from Safari |
| iPad | Support both orientations, Split View, and touch, Apple Pencil, keyboard and trackpad use. Hover styles apply only when a pointer that hovers is present. Laptop-width iPads still get touch-sized targets |
| Desktop | Keyboard-first POS, visible focus, keyboard shortcuts, and hover details. Touchscreen desktops get touch sizes through `pointer: coarse` |

### Orientation

- Portrait and landscape are both supported. Never lock orientation.
- A phone in landscape can be wider than 744px but only about 390px tall, so `short:` layouts apply. Bottom tabs become a rail, the top bar drops to 44px, and sticky bars become one line.
- Rotating must not lose a cart, a form or a scroll position.

### Input and keyboard

- Money uses `inputmode="decimal"`, and quantity uses `inputmode="numeric"`. Do not use `type="number"`, because the mouse wheel and browser rounding can change values.
- Phone numbers use `type="tel"`, with the matching `autocomplete` values.
- Use `enterkeyhint` so the keyboard's action key reads Next, Search or Done.
- The focused field and the primary action must stay visible above the on-screen keyboard.
- Dates use the native date input on touch devices.
- Tappable controls are at least 44px by 44px with 8px between them. POS payment and checkout actions are 48px tall.
- Swipe is never the only way to do something.

### Performance on low-cost phones

- Lazy-load routes and charts. Charts only load on screens that show them.
- Images are lazy-loaded, sized to their display size and have fixed dimensions to prevent layout shift.
- Virtualise long lists, including the POS product grid.
- No `backdrop-filter` blur on phones.
- Loading states use skeletons in the shape of the final content.

### Offline and connection

- The app shell is cached by a service worker, so POS opens with no connection.
- Fast Hisab has an offline sale queue but no service worker, so the app itself could not load offline. AR Option needs both.
- A banner under the top bar shows the offline state and the number of queued sales.
- Only counter sales can be queued. Other actions are disabled offline, and the reason is shown.
- Sync as soon as a connection returns, because browser storage on a phone can be cleared by the system.

### Test matrix

Test every new or changed screen in these viewports, in light and dark themes, in English and Bengali.

| Profile | Viewport | Engine |
|---|---|---|
| Narrowest supported | 320 x 568 | Chromium |
| Small Android | 360 x 640 | Chromium |
| Large Android | 412 x 915 | Chromium |
| Small iPhone | 375 x 667 | WebKit |
| iPhone | 393 x 852 | WebKit |
| Large iPhone | 430 x 932 | WebKit |
| Phone in landscape | 844 x 390 | WebKit |
| iPad mini portrait | 744 x 1133 | WebKit |
| iPad portrait | 820 x 1180 | WebKit |
| iPad landscape | 1180 x 820 | WebKit |
| iPad Pro landscape | 1366 x 1024 | WebKit |
| Laptop | 1366 x 768 | Chromium |
| Desktop | 1920 x 1080 | Chromium |

A screen passes when:

- The page never scrolls sideways. Only a table's own container may.
- Every action in the desktop layout is reachable.
- No amount, name or button label is clipped.
- The keyboard never covers the focused field or the primary action.
- Back closes the top sheet first.
- Rotating keeps the user's work.
- Tapping works on real touch input, not only with a mouse click.

Emulation checks layout only. Before each release, test on one low-cost Android phone, one iPhone and one iPad, and say plainly which devices were and were not tested.

## Elevation & Depth

Depth is mostly tonal: a surface colour on a page colour, separated by a thin border. Shadows are for things floating above the page.

### Shadow Vocabulary

- **Resting card** (`box-shadow: 0 1px 2px rgba(0,0,0,0.05)`): cards and panels.
- **Popover** (`box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)`): menus and dropdowns.
- **Sheet** (`box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25)`): sheets, drawers and dialogs.

**The Floating Only Rule.** Strong shadows belong only to layers above the page. Page content stays flat.

## Shapes

Corners are gently rounded and consistent. Radius grows with the size of the object: 8px for inputs and small controls with a mouse, 12px for buttons and touch inputs, 16px for cards, sheets and dialogs, and full round for badges, chips and avatars.

Sheets round only their top corners on phones. Full-screen sheets have no rounded corners.

## Components

Each component here must have a phone behaviour. If a pattern is missing, add it here before building it.

### Buttons

Solid and direct, with no gradients.

- **Shape:** rounded (12px).
- **Primary:** Ledger Maroon with white text, 40px tall with a mouse, 48px on touch.
- **Secondary:** surface hover fill with main text colour.
- **Danger:** Alert Rose text on a tinted fill. It always needs a confirmation.
- **States:** hover only where the device supports it. On touch, a pressed state replaces the tap highlight. Keyboard focus shows Focus Signal.

### Shop Chip

New for AR Option, and on every screen.

- Shows the active shop name, or "All shops" for a combined view.
- **Phone:** in the top bar. Tapping opens a shop list sheet.
- **Tablet and wider:** in the top bar, as a dropdown.
- **POS:** the shop name always shows, and changing shop while a cart holds items requires confirmation.
- Users with one shop see the name as plain text with no dropdown.

**The Which Shop Rule.** Before saving any shop-owned record, the user can see which shop it will save to.

### KPI Card

Large value, label below, optional trend.

- **Phone:** two columns. If a value is too long, the card takes the full row.
- **Tablet:** three or four columns.
- **Desktop:** up to six columns.
- Colour the number only for due or danger figures.
- The **Cash in Hand** card is wider than a standard KPI card. It shows the figure, a Till Open or Till Closed badge, and the split Opening Float, Cash Sales and Petty Cash.

### Filter Bar

The standard order is Shop, Date range, Search, then filters specific to that module.

- **Phone:** search plus a Filters button with an active count. Filters open in a sheet. Active filters show as removable chips.
- **Tablet and wider:** inline and wrapping.

### Data Table

Tables have two responsive behaviours, chosen by what the table is for.

**Operational lists** cover sales, products, contacts, expenses, parcels and transfers.

- **Phone:** each row becomes a card with its key fields, status and main action. Tapping opens the full record, so no field is lost.
- **Tablet:** a table with fewer columns, or a list with a detail pane.
- **Laptop and wider:** the full table with a column picker.

**Financial tables** cover the Trial Balance, Balance Sheet, Cash Flow, Profit & Loss and account ledgers.

- **All sizes:** stay as tables with every column present. On narrow screens the table scrolls sideways inside its card, with a sticky first column and a visible edge shadow.

Across both:

- Export actions move into an overflow menu on phones.
- Row selection on phones starts from a Select button. Checkboxes are hidden until then.
- Icon-only actions have an `aria-label` and at least a 44px target.
- Paginate financial lists with "Showing X to Y of Z". Never use infinite scroll for records that need auditing.

### Status Badge

A rounded pill with a tinted background and a text label. Paid uses emerald, Partial uses an amber outline, Due uses solid-tinted amber, and Returned, Lost and Damaged use rose.

### Sheets and Dialogs

A sheet is a panel that slides up from the bottom of the screen.

- **Long forms on phones:** full-screen with a header, a scrolling body and a sticky footer.
- **Short choices on phones:** a bottom sheet, up to 85dvh, with a drag handle and a visible close button.
- **Tablet and wider:** a centred dialog, with a 92dvh maximum height.
- **Confirmations:** a small centred dialog on all sizes. Delete and post actions state exactly what will change.
- Background scrolling is locked with `overscroll-behavior: contain`.
- Focus moves into the sheet and returns to its trigger on close.
- Sheets and inner screens such as Add Product and Import share one history stack. The Android back gesture and Esc close the top layer first, and a reload returns to the same screen.

### Forms

- **Phone:** one column, with labels above the fields and a sticky Save bar.
- **Tablet and wider:** two columns for related short fields.
- Forms with more than three groups use steps on phones and tabs on tablet and wider.
- Errors appear beside the field, and the first error is scrolled into view.
- Unsaved work asks for confirmation before closing.

### POS Terminal

The one screen allowed to leave the standard shell. Staff work with a customer waiting, so the total and the next step are always visible.

| Size | Layout |
|---|---|
| Phone | Full-screen product search and grid in two columns. A sticky bar shows item count, total and Checkout. The cart opens as a full-screen sheet. Bottom tabs are hidden during a sale |
| Tablet (744px to 1023px) | Cart list panel about 340px wide on the left. Each line is a compact card, and price and discount edit in place. Size cards on the right in two columns |
| Laptop (1024px to 1279px) | Cart table on the left, about 7/12 of the width, with the columns Product, Qty, Price, Disc and Total. Size cards on the right in two columns |
| Desktop (1280px and wider) | The same cart table, about 7/12 of the width. Size cards in three or more columns, full keyboard control |
| Phone in landscape (`short:`) | The phone layout |

- With no barcode scanner, search by product code or name is the fastest route and takes focus on tablet and wider.
- On phones, search does not take focus automatically, so the keyboard does not hide the grid.
- On phones, choosing a product with sizes opens the Size Picker. On tablet and wider, every size is its own card, so one tap adds one item.
- Every width has a Back control. At 1024px and wider the navigation collapses to the rail while POS is open.
- Payment buttons are at least 48px tall.
- A **Courier sale** switch at checkout reveals customer, phone, address, courier, delivery charge and advance fields.

### POS Cart and Product Cards

- **Cart header:** customer search by mobile, name or ID, with a Walk-in button and Add Customer. Under it, one box labelled "Enter SKU" for a typed or scanned code. There is no barcode feature, because Barcode Studio is out of scope. A scanner that types keys into the box still works.
- **Matching an entered code:** exact size SKU first, then exact product code, then name. Several matches open the Size Picker.
- **Cart lines:** product name and size, a quantity stepper, an editable Price, an editable Disc in taka, and the line total. Price edits need `pos.edit_price`. Any reduction must stay within the user's discount limit, and the server decides.
- **Below the lines:** Discount (% or taka), then Items and Subtotal, then the **Grand Payable Total** card. The total is a Display figure and is always on screen.
- **Product cards:** one card per size. Each shows the product name, size badge, SKU, price and a stock badge for the active shop: "Stock: N" or "Out of stock". Category and brand chips filter the grid. Out-of-stock cards stay visible but cannot be added.
- **Long catalogs:** the card grid is virtualised, as in Performance on low-cost phones.
- **The cart is kept** per shop on the device. It survives a tab change, a reload and a rotation. Changing shop while the cart holds items asks for confirmation.

### POS Payment Actions

- **Action grid:** Suspend, Cancel, then payment buttons for Cash, Card, bKash and MultiPay. Cash is primary and shows the total. Every button is at least 48px tall.
- **Payment methods come from the shop's configured payment accounts.** A method with no account for the shop is disabled and says why.
- **Cancel** asks for confirmation and clears the cart, the discount and the customer.
- **bKash** takes an optional transaction ID and an optional sender mobile, checked against `01[3-9]` and 8 digits.
- **MultiPay** is a dialog. It shows Payable Total and Total Tendered, then one row per method with an amount and an optional reference. Add Method fills the remaining amount. The box "Cash Tendered & Change" has Customer Gave and Change to Return. Complete is disabled until the payments add up to the payable total to the paisa. Change is a display figure only and never becomes a ledger line.
- **Hotkeys on keyboard devices:** F2 focuses the search or SKU box, F4 opens MultiPay, F8 suspends the cart, F9 focuses Discount, and Esc closes the top dialog. A hotkey list is reachable from the POS strip.

### Suspended Carts

A suspended cart is parked on this device only. It is never saved on the server and has no stock or money effect, which is why it is not a Draft Cart. The POS strip shows a Suspended button with a count. Resume restores the cart and its customer, and Discard asks for confirmation. A suspended cart can be lost if the browser clears its storage, and the list says so.

### Till

- **Till chip** in the POS strip: "Till ৳12,480" with the shop's open session, or "Open Till" when none is open. Selling is not blocked when the till is closed, but the chip is highlighted and the POS offers to open it.
- **Open Till** asks for the float and an optional note. After the first session, the field is pre-filled with the cash the books expect. A different amount needs a reason.
- **Till Status dialog:** Current Cash in Drawer, then Opening Float, Cash Sales, Digital / Card, Pay-Ins, Petty Cash, Refunds and Other Cash, so the figures always add up. Then three actions: Cash In, Cash Out and Close & Handover.
- **Cash In and Cash Out** take an amount, a category and a note. Phone: a bottom sheet.
- **Close & Handover** has a denomination count (1000, 500, 200, 100, 50, 20, 10, 5, 2, 1), the counted total, the difference with the expected cash, a required reason when they differ, Cash Collected by Owner, Retained in Till, and closing notes. Phone: full screen with a sticky Finish bar.
- **Dashboard:** a Cash in Hand card shows the open session's figure and an Open POS Till button. With All shops selected, it lists one row per shop and a total.

### Size Picker

- A sheet on phones and a popover on tablet and wider.
- Sizes appear as 48px tiles showing the stock count in the current shop.
- Out-of-stock sizes stay visible but disabled, and show whether another shop has stock.

### Stock by Shop Grid

Rows are shops, columns are sizes, and the first column is sticky. On phones, the user picks a size and sees a list of shops, because the full grid is rarely readable at that width.

### Return & Exchange

New for AR Option. The net amount is always visible.

- **Phone:** three steps: Coming back, Going out, Settle. A sticky bar shows the net amount through all three.
- **Tablet:** two columns with Coming back and Going out, and a full-width Settle bar below.
- **Laptop and wider:** three columns.
- The net bar reads in plain words, such as "Customer pays ৳450" or "Refund ৳300".
- Each returned item shows a resaleable or damaged choice.
- Manual returns show a visible warning and required reason and phone fields.

### Courier Parcels

New for AR Option.

- **Phone:** parcel cards with customer, tracking number, amount due and both status badges. The phone number is a `tel:` link. The main action sits on the card.
- **Tablet:** list and detail side by side.
- **Laptop and wider:** a full table, with detail in a side panel.
- Quick filters: Out now, Delivered unpaid, Returned and Overdue.
- The dashboard shows "Money with couriers".

**The Two Tracks Rule.** Delivery status and payment status always appear as two separate labelled badges. Never merge them into one.

### Courier Settlement

New for AR Option.

- **Phone:** a list of delivered parcels with selection. A sticky bar shows selected total, and the next step takes the amount received and charges.
- **Tablet and wider:** the parcel list beside a summary panel.
- The difference between expected and received is always visible, and Save is disabled until it is explained.

### Stock Transfers

- Tabs: To send, In transit, Received.
- **Phone:** the Receive screen lists items with steppers, and shortages require a reason.
- **Tablet and wider:** a table with the same fields.

### Product Form

One page for adding and editing a product, reached from Products. It has three groups, so it stays one scrolling column with a sticky Save bar on phones.

- **General:** name, SKU, unit, category, sub-category, brand and low-stock alert. The SKU is Auto (the next 6-digit code) or Custom, with a live "Available" or "Already used by" check. A saved SKU cannot be changed.
- **Category and brand** can be created from the form without leaving it.
- **Pricing and sizes:** each size has a SKU, cost, margin % and selling price. Selling price is cost x (1 + margin / 100). Editing the selling price recalculates the margin. A "Copy first row to all" action fills the other rows. Size chips are presets, and a custom size can be added.
- **Stock by shop:** opening stock per size for each shop the user may use. Stock of a saved size is changed in Stock, not here.
- **Phone:** each size is a card. **Tablet and wider:** a table, up to 960px wide. This is an exception to the 720px form width.
- **Money** uses `inputmode="decimal"` and shows the saved figure in full.

### Import Products

A page of its own, reached from Products, with a Back control.

- **File:** drag and drop, or Browse, for CSV (UTF-8) or XLSX. Download template and Export my products sit in the header.
- **Columns:** Product Name, Size, SKU, Category, Brand, Cost Price, Selling Price, Add Stock, Sub Category, Alert Qty and Shop. One row per size. A blank cell keeps the current value. Add Stock adds to current stock. A blank Shop means the active shop.
- **Preview:** summary tiles for New Products, New Sizes, Updated, +Stock and Errors. Tapping a tile filters the rows. Rows can also be searched. Each row shows its action and a message.
- **Phone:** rows become cards. **Tablet and wider:** a table that scrolls inside its card.
- **Limits:** up to 2,000 rows a file. A CSV must be UTF-8, and `.xls` is refused. Rows can be told apart by SKU, or by product name when no SKU is given.
- **Import is disabled while any row has an error.** Commit is all or nothing. Success shows the counts and the Stock In document number, with Import Another File and View in Stock.

### Charts

- Use the brand palette, never chart library defaults.
- **Phone:** 220px tall, full width, with the legend below. Values appear on tap, not hover.
- **Tablet and wider:** 280px to 320px tall.
- Every chart has a text total, so no figure depends on reading the chart.

### Navigation

- **Bottom tabs:** 56px plus the safe area, icon with a text label, and a clear active state. Never icon-only.
- **Rail:** 64px wide, icons with tooltips where hover exists. Tapping opens the 288px drawer.
- **Sidebar:** 256px wide with grouped sections, collapsible to 64px.
- The section order is Dashboard, User Management, Contacts, Products, Purchases, Sell/POS, Courier, Expenses, Payment Accounts, Financial Statements, Reports, Settings.

### Login

- A centred card on every size, with a 48px Sign In button. Inputs follow the 16px Input Rule.
- On a fresh deployment with no users, the same card creates the first admin.
- When a session expires, the login appears over the open screen so the cart or form underneath is kept.

### Empty, Loading and Error States

- Empty states say what is missing and offer the next action.
- Errors say what happened and how to fix it, in plain language.
- A failed save keeps everything the user entered.

### Receipt Print

Optional, and thermal only. See Rule 11 in [agent.md](agent.md). Printing support on phones and tablets depends on the printer and has not been tested. The Print action appears only where a working printer path is confirmed.

## Do's and Don'ts

### Do:

- **Do** design the Phone layout first, then add to it at 744px, 1024px and 1280px.
- **Do** show the active shop on every screen.
- **Do** keep the primary action and the total on screen during POS, return and settlement work.
- **Do** use 16px input text on touch devices.
- **Do** use tokens for every colour.
- **Do** keep every field and action reachable on a phone.
- **Do** keep financial tables as complete tables, with a sticky first column.
- **Do** add safe-area padding to every fixed bar.
- **Do** test iPad mini portrait at 744px, a phone in landscape, and Bengali text.
- **Do** respect reduced-motion settings. Keep transitions at 150ms to 250ms.

### Don't:

- **Don't** detect devices from the user agent.
- **Don't** disable pinch zoom with `user-scalable=no` or `maximum-scale`.
- **Don't** hide a feature on phones because it is awkward. Redesign it.
- **Don't** depend on hover, right-click or swipe alone.
- **Don't** use `100vh` without a `dvh` version, or fixed bars without safe-area padding.
- **Don't** let the page scroll sideways.
- **Don't** truncate money.
- **Don't** use text smaller than 12px, or 13px in Bengali.
- **Don't** use Ledger Maroon as text on dark surfaces, or status base hues as small text on white.
- **Don't** merge delivery and payment status into one badge.
- **Don't** use blur effects on phones.
- **Don't** use infinite scroll on financial records.
