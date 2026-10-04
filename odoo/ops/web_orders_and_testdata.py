# 1. Prints every web order created by the storefront (origin shop-nextx.com): customer, lines, prices, channel, reservation.
# 2. With NEXTX_CANCEL_TESTS=1, cancels web orders whose customer name starts with "TEST" (my own integration/browser tests).
#    Cancelling releases the reservation. Nothing is deleted.
# 3. Lists records that look like earlier implementation test data, WITHOUT touching them (owner decision).
#   docker exec -i -e NEXTX_CANCEL_TESTS=1 odoo20-web odoo shell -d nextx_staging --no-http < web_orders_and_testdata.py
import os

CANCEL = os.environ.get("NEXTX_CANCEL_TESTS") == "1"

print("=" * 8, "web orders (origin shop-nextx.com)", "=" * 8)
orders = env["sale.order"].search([("origin", "=", "shop-nextx.com")], order="id")
refs = {}
for o in orders:
    refs[o.client_order_ref] = refs.get(o.client_order_ref, 0) + 1
    print(f"{o.name} | state={o.state} | customer={o.partner_id.name!r} | total={o.amount_total} {o.currency_id.name} | tax={o.amount_tax} | ref={(o.client_order_ref or '')[:10]}... | note={(o.note and o.note.striptags() or '')[:60]!r}")
    for l in o.order_line:
        print(f"    line {l.product_id.name!r} qty={l.product_uom_qty} unit={l.price_unit} subtotal={l.price_subtotal}")
    for p in o.picking_ids:
        print(f"    picking {p.name} state={p.state} from {p.location_id.display_name} reserved at: {[(ml.location_id.display_name, ml.quantity) for ml in p.move_line_ids]}")
print("orders with a duplicated idempotency key:", [k for k, n in refs.items() if n > 1] or "none")
if CANCEL:
    for o in orders.filtered(lambda r: (r.partner_id.name or "").upper().startswith("TEST") and r.state in ("draft", "sent", "sale")):
        o.action_cancel()
        print("cancelled test order", o.name, "->", o.state)
    env.cr.commit()

print()
print("=" * 8, "possible earlier test data (NOT modified; owner decides)", "=" * 8)
for model, domain, fmt in (
    ("product.template", [("name", "ilike", "STAGING")], lambda r: f"product {r.name!r} active={r.active} cost={r.standard_price}"),
    ("res.partner", [("name", "ilike", "STAGING")], lambda r: f"partner {r.name!r}"),
    ("account.journal", [("name", "ilike", "STAGING")], lambda r: f"journal {r.code} {r.name!r}"),
    ("pos.session", [], lambda r: f"POS session {r.name} state={r.state} orders={len(r.order_ids)}"),
    ("pos.order", [], lambda r: f"POS order {r.name} state={r.state} total={r.amount_total} by={r.user_id.login}"),
    ("purchase.order", [], lambda r: f"PO {r.name} state={r.state} vendor={r.partner_id.name!r} total={r.amount_total} {r.currency_id.name}"),
    ("stock.picking", [], lambda r: f"picking {r.name} state={r.state} {r.picking_type_id.name}"),
    ("account.move", [("state", "=", "posted")], lambda r: f"POSTED entry {r.name} type={r.move_type} journal={r.journal_id.name} total={r.amount_total} ref={r.ref or r.invoice_origin or ''!r}"),
):
    for rec in env[model].with_context(active_test=False).search(domain, order="id"):
        print(" ", fmt(rec))
env.cr.rollback() if not CANCEL else None
