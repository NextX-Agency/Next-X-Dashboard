# Read-only audit of the NextX Odoo database. Run through `odoo shell`:
#   docker exec -i odoo20-web odoo shell -d nextx_staging --no-http < audit_odoo.py
# Nothing is written: the transaction is rolled back at the end, and no secret, password or
# customer contact detail is printed. Every section is guarded so one failure cannot hide the rest.
import collections


def section(title):
    def run(fn):
        print("\n" + "=" * 8, title, "=" * 8)
        try:
            fn()
        except Exception as exc:
            env.cr.rollback()
            print("!! section failed:", type(exc).__name__, exc)
    return run


def total(model, domain=None):
    return env[model].with_context(active_test=False).search_count(domain or [])


def by(model, field, domain=None):
    """[(value, count)] using the Odoo 20 _read_group API."""
    rows = env[model].with_context(active_test=False)._read_group(domain or [], [field], ["__count"])
    return [(getattr(k, "display_name", k), n) for k, n in rows]


@section("modules installed")
def _():
    mods = env["ir.module.module"].search([("state", "=", "installed")], order="name")
    print(", ".join(m.name for m in mods))
    print("l10n packages:", [m.name for m in mods if m.name.startswith("l10n_")])


@section("company")
def _():
    for c in env["res.company"].search([]):
        print(f"id={c.id} name={c.name!r} country={c.country_id.code} currency={c.currency_id.name}")
        for f in ("street", "city", "phone", "email", "website", "vat", "company_registry"):
            print(f"  {f}:", ("set" if getattr(c, f) else "BLANK") if f in c._fields else "n/a")
        print("  logo:", "set" if c.logo else "BLANK", "| primary:", c.primary_color, "| secondary:", c.secondary_color)
        print("  layout:", c.external_report_layout_id.name or None, "| tables:", c.report_tables_id if "report_tables_id" in c._fields else "n/a", "| font:", c.font)
        print("  terms_type:", c.terms_type, "| report_footer set:", bool(c.report_footer))


@section("currencies")
def _():
    for cur in env["res.currency"].with_context(active_test=False).search([("active", "=", True)]):
        rates = env["res.currency.rate"].search([("currency_id", "=", cur.id)], order="name desc", limit=3)
        print(cur.name, "symbol", cur.symbol, "pos", cur.position, "rates:", [(str(r.name), r.rate) for r in rates])


@section("products")
def _():
    P = env["product.template"].with_context(active_test=False)
    print("templates total/active/archived:", P.search_count([]), P.search_count([("active", "=", True)]), P.search_count([("active", "=", False)]))
    print("published:", P.search_count([("is_published", "=", True)]), "| with image:", P.search_count([("image_1920", "!=", False)]))
    print("with internal ref:", P.search_count([("default_code", "!=", False)]), "| with barcode:", P.search_count([("barcode", "!=", False)]))
    print("standard_price == 0 (non-service):", P.search_count([("standard_price", "=", 0), ("type", "!=", "service")]))
    names = collections.Counter(p.name.strip().lower() for p in P.search([]))
    print("duplicate names:", [n for n, k in names.items() if k > 1])
    for p in P.search([], order="id"):
        print(f"  [{p.id}] {p.name!r} type={p.type} storable={p.is_storable} categ={p.categ_id.display_name} price={p.list_price} cost={p.standard_price} published={p.is_published} active={p.active}")
    print("tags:", [t.name for t in env["product.tag"].search([])])


@section("product categories")
def _():
    for c in env["product.category"].search([], order="parent_path"):
        print(f"  {c.display_name} | costing={c.property_cost_method} valuation={c.property_valuation}")


@section("external ids (migration keys)")
def _():
    print(env["ir.model.data"]._read_group([("module", "=", "nextx_supabase")], ["model"], ["__count"]))


@section("warehouses / locations / stock")
def _():
    for w in env["stock.warehouse"].search([]):
        print(f"warehouse {w.name!r} code={w.code} steps in={w.reception_steps} out={w.delivery_steps} lot_stock={w.lot_stock_id.display_name}")
    for loc in env["stock.location"].search([("usage", "in", ("internal", "transit"))], order="parent_path"):
        print(f"  loc {loc.display_name} usage={loc.usage} active={loc.active}")
    for loc, qty, reserved in env["stock.quant"]._read_group([("location_id.usage", "=", "internal")], ["location_id"], ["quantity:sum", "reserved_quantity:sum"]):
        print("  quants", loc.display_name, "on_hand", qty, "reserved", reserved)
    print("negative quants:", env["stock.quant"].search_count([("quantity", "<", 0), ("location_id.usage", "=", "internal")]))
    print("picking types:")
    for t in env["stock.picking.type"].with_context(active_test=False).search([], order="warehouse_id, sequence"):
        print(f"  {t.warehouse_id.code or '-'} | {t.name} | {t.code} | active={t.active} | {t.default_location_src_id.display_name} -> {t.default_location_dest_id.display_name}")
    print("orderpoints:", total("stock.warehouse.orderpoint"), "| routes:", [(r.name, r.active) for r in env["stock.route"].with_context(active_test=False).search([])])
    print("pickings by state:", by("stock.picking", "state"))
    print("landed costs:", total("stock.landed.cost"), "| landed-cost products:", [p.name for p in env["product.template"].search([("landed_cost_ok", "=", True)])])


@section("purchase / sales")
def _():
    print("PO by state:", by("purchase.order", "state"))
    print("SO by state:", by("sale.order", "state"))
    print("pricelists:", [(p.name, p.currency_id.name, p.active) for p in env["product.pricelist"].with_context(active_test=False).search([])])
    print("vendors (supplier_rank>0):", env["res.partner"].search_count([("supplier_rank", ">", 0)]), "| customers:", env["res.partner"].search_count([("customer_rank", ">", 0)]))


@section("point of sale")
def _():
    for c in env["pos.config"].with_context(active_test=False).search([]):
        print(f"config {c.name!r} active={c.active} picking_type={c.picking_type_id.name} src={c.picking_type_id.default_location_src_id.display_name} pricelist={c.pricelist_id.name}")
        print("   payment methods:", [(m.name, m.type) for m in c.payment_method_ids], "| footer:", repr((c.receipt_footer or "")[:60]), "| header set:", bool(c.receipt_header))
    print("sessions:", [(s.name, s.state, s.config_id.name) for s in env["pos.session"].search([])])
    print("orders by state:", by("pos.order", "state"))
    print("payment methods:", [(m.name, m.type, m.journal_id.name) for m in env["pos.payment.method"].with_context(active_test=False).search([])])


@section("accounting")
def _():
    print("accounts:", total("account.account"), "| journals:", [(j.code, j.name, j.type) for j in env["account.journal"].search([])])
    print("taxes active/total:", env["account.tax"].search_count([("active", "=", True)]), total("account.tax"))
    print("moves by state:", by("account.move", "state"))


@section("users (no credentials)")
def _():
    for u in env["res.users"].with_context(active_test=False).search([]):
        print(f"  {u.login} | {u.name} | active={u.active} | share={u.share} | email set={bool(u.email)}")


@section("branding / addons")
def _():
    print("records owned by nextx_branding:", sorted(d.name for d in env["ir.model.data"].search([("module", "=", "nextx_branding")]))[:40])
    print("nextx addons:", [(m.name, m.state, m.latest_version) for m in env["ir.module.module"].search([("name", "=like", "nextx%")])])
    print("websites:", [(w.name, w.domain) for w in env["website"].search([])])


env.cr.rollback()
print("\n(audit complete, nothing written)")
