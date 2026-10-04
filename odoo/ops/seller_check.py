# Permission check for the real seller accounts, via Odoo's own access rules (no password needed, nothing persists).
#   docker exec -i odoo20-web odoo shell -d nextx_staging --no-http < seller_check.py
# Each probe runs as the seller inside a savepoint that is rolled back. This verifies SECURITY RULES. It does not test
# a real interactive login: that needs the seller's own password.
import os
from odoo import fields
from odoo.exceptions import AccessError

LOGINS = ("rico", "aryan")
results = []

if os.environ.get("NEXTX_CREATE_TEST_USERS") == "1":  # local replica only
    for login in LOGINS:
        if not env["res.users"].search([("login", "=", login)]):
            env["res.users"].create({"name": login.title(), "login": login, "group_ids": [(6, 0, [env.ref("base.group_user").id, env.ref("point_of_sale.group_pos_user").id, env.ref("stock.group_stock_user").id, env.ref("sales_team.group_sale_salesman").id, env.ref("base.group_partner_manager").id])]})


def probe(user, label, fn, expect):
    """expect: 'allow' or 'deny'."""
    try:
        with env.cr.savepoint():
            fn(env(user=user.id))
        got = "allow"
    except AccessError:
        got = "deny"
    except Exception as exc:  # a business error still means the access check passed
        got = "allow" if "access" not in str(exc).lower() else "deny"
    results.append((user.login, label, expect, got, "OK" if expect == got else "MISMATCH"))


company = env["res.company"].search([], limit=1)
shop_cfg = env["pos.config"].search([("session_ids.state", "not in", ("opened", "opening_control", "closing_control"))], limit=1) or env["pos.config"].search([], limit=1)
categ = env["product.category"].search([("name", "=", "Audio")], limit=1)
existing_partner = env["res.partner"].create({"name": "ZZ seller-check existing customer"})  # created as admin, rolled back at the end

for login in LOGINS:
    user = env["res.users"].with_context(active_test=False).search([("login", "=", login)], limit=1)
    if not user:
        results.append((login, "account exists", "yes", "NO ACCOUNT", "MISSING"))
        continue
    groups = sorted(g.full_name for g in user.group_ids if any(k.lower() in (g.full_name or "").lower() for k in ("point of sale", "kassa", "sales", "verkoop", "inventory", "voorraad", "accounting", "boekhouding", "purchase", "inkoop", "administration", "beheer", "technical")))
    print(f"[{login}] active={user.active} share={user.share} relevant groups: {groups}")

    # --- must be able to
    probe(user, "read products and prices", lambda e: e["product.template"].search([("sale_ok", "=", True)], limit=5).mapped("list_price"), "allow")
    probe(user, "see stock availability (quants)", lambda e: e["stock.quant"].search([("location_id.usage", "=", "internal")], limit=5).mapped("quantity"), "allow")
    probe(user, "read free quantity on a product", lambda e: e["product.product"].search([("is_storable", "=", True)], limit=3).mapped("free_qty"), "allow")
    probe(user, "create a customer", lambda e: e["res.partner"].create({"name": "ZZ seller-check customer"}), "allow")
    probe(user, "create a quotation for an existing customer", lambda e: e["sale.order"].create({"partner_id": existing_partner.id, "order_line": [(0, 0, {"product_id": e["product.product"].search([("sale_ok", "=", True), ("type", "=", "consu")], limit=1).id, "product_uom_qty": 1})]}), "allow")
    probe(user, "read landed-cost lines (needed to sell products with landed cost)", lambda e: e["stock.valuation.adjustment.lines"].search([], limit=1).mapped("additional_landed_cost"), "allow")
    probe(user, "open a POS session on a shop", lambda e: (e["pos.session"].create({"config_id": shop_cfg.id, "user_id": e.uid}).set_opening_control(0, "")), "allow")

    # --- must NOT be able to
    probe(user, "change company settings", lambda e: e["res.company"].browse(company.id).write({"name": "hacked"}), "deny")
    probe(user, "create an accounting journal", lambda e: e["account.journal"].create({"name": "ZZ", "type": "cash", "code": "ZZZ"}), "deny")
    probe(user, "create an account", lambda e: e["account.account"].create({"name": "ZZ", "code": "999999", "account_type": "asset_current"}), "deny")
    probe(user, "edit a stock route", lambda e: e["stock.route"].search([], limit=1).write({"name": "hacked"}), "deny")
    probe(user, "create a reordering rule", lambda e: e["stock.warehouse.orderpoint"].create({"product_id": e["product.product"].search([("is_storable", "=", True)], limit=1).id, "product_min_qty": 1, "product_max_qty": 2}), "deny")
    probe(user, "change a product's list price", lambda e: e["product.template"].search([("sale_ok", "=", True)], limit=1).write({"list_price": 1}), "deny")
    probe(user, "create a user", lambda e: e["res.users"].create({"name": "ZZ", "login": "zz_seller_made"}), "deny")
    probe(user, "post an accounting entry", lambda e: e["account.move"].create({"move_type": "entry"}), "deny")

    # --- information, not a pass/fail: what a seller can see about cost and margin
    def cost_visible(e):
        p = e["product.product"].search([("is_storable", "=", True)], limit=1)
        return p.standard_price
    try:
        with env.cr.savepoint():
            cost_visible(env(user=user.id))
        results.append((login, "read a product's cost price (standard_price)", "info", "visible", "DECISION"))
    except AccessError:
        results.append((login, "read a product's cost price (standard_price)", "info", "hidden", "DECISION"))

print()
print(f"{'user':6} {'check':72} {'expected':9} {'result':8} verdict")
for r in results:
    print(f"{r[0]:6} {r[1]:72} {r[2]:9} {r[3]:8} {r[4]}")
bad = [r for r in results if r[4] in ("MISMATCH", "MISSING")]
print("\nSECURITY RULES VERIFIED" if not bad else f"\n{len(bad)} MISMATCH(ES)", "| REAL INTERACTIVE LOGIN NOT TESTED (needs the sellers' own passwords)")
env.cr.rollback()
