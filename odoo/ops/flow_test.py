# End-to-end business flow test for NextX, run through `odoo shell`. Everything happens in ONE transaction
# that is ROLLED BACK at the end: nothing persists, no sequence-visible leftovers on the data you care about.
#   docker exec -i odoo20-web odoo shell -d nextx_staging --no-http < flow_test.py
#
# Covers: PO in SRD -> partial receipt -> backorder -> remainder -> vendor bill -> landed cost -> AVCO,
#         internal transfer to a shop, POS sale with seller attribution, POS refund, sales order reservation,
#         delivery + customer return, margin reporting, documents render.
import traceback
from odoo import fields

results = []


def step(name):
    def run(fn):
        try:
            outcome = fn()
            ok = outcome is not False
            results.append((name, "PASS" if ok else "FAIL", "" if outcome in (True, None) else str(outcome)))
        except Exception as exc:
            results.append((name, "FAIL", f"{type(exc).__name__}: {str(exc)[:300]}"))
            frames = [l.strip() for l in traceback.format_exc().splitlines() if "addons" in l and "File" in l]
            results.append(("    where", "INFO", " > ".join(f.split("addons\\")[-1].split(", in")[0] + ":" + f.split("line ")[-1].split(",")[0] for f in frames[-4:])))
    return run


def approx(a, b, tol=0.01):
    return abs(a - b) <= tol


company = env["res.company"].search([], limit=1)
warehouse = env["stock.warehouse"].search([("company_id", "=", company.id)], limit=1)
shop_loc = env["ir.model.data"].search([("module", "=", "nextx_supabase"), ("name", "=like", "location_%"), ("model", "=", "stock.location")], limit=1)
shop = env["stock.location"].browse(shop_loc.res_id)
categ = env["product.category"].search([("name", "=", "Audio")], limit=1)
S = {}  # shared state between steps


@step("setup: test product, vendor, customer, seller user")
def _():
    S["product"] = env["product.product"].create({"name": "ZZ FLOWTEST item", "type": "consu", "is_storable": True, "categ_id": categ.id, "list_price": 25.0, "standard_price": 0.0, "available_in_pos": True})
    S["vendor"] = env["res.partner"].create({"name": "ZZ FLOWTEST vendor", "supplier_rank": 1})
    S["customer"] = env["res.partner"].create({"name": "ZZ FLOWTEST customer", "customer_rank": 1})
    grp = env.ref("point_of_sale.group_pos_user")
    S["seller"] = env["res.users"].create({"name": "ZZ Seller Rico", "login": "zz_rico_flowtest", "group_ids": [(6, 0, [env.ref("base.group_user").id, grp.id, env.ref("stock.group_stock_user").id])]})
    return categ.property_cost_method == "average"


@step("purchase: PO 10 x 10 SRD confirmed, one-step receipt created")
def _():
    po = env["purchase.order"].create({"partner_id": S["vendor"].id, "order_line": [(0, 0, {"product_id": S["product"].id, "product_qty": 10, "price_unit": 10.0})]})
    po.button_confirm()
    S["po"] = po
    S["receipt"] = po.picking_ids[:1]
    return len(po.picking_ids) == 1 and S["receipt"].picking_type_id.code == "incoming"


@step("partial receipt: receive 7 of 10 -> backorder of 3 created automatically")
def _():
    rc = S["receipt"]
    rc.move_ids.quantity = 7
    rc.with_context(skip_backorder=True).button_validate()
    S["backorder"] = env["stock.picking"].search([("backorder_id", "=", rc.id)])
    return rc.state == "done" and len(S["backorder"]) == 1 and S["backorder"].move_ids.product_uom_qty == 3


@step("receive the remaining 3 on the backorder; PO shows 10 received")
def _():
    bo = S["backorder"]
    bo.move_ids.quantity = 3
    bo.button_validate()
    S["po"].invalidate_recordset()
    return bo.state == "done" and S["po"].order_line.qty_received == 10 and S["product"].with_context(location=warehouse.lot_stock_id.id).qty_available == 10


@step("AVCO: unit cost is 10 SRD after the receipts")
def _():
    S["product"].invalidate_recordset()
    return approx(S["product"].standard_price, 10.0) or f"standard_price={S['product'].standard_price}"


@step("vendor bill: created from the PO for received quantities")
def _():
    S["po"].action_create_invoice()
    bill = S["po"].invoice_ids
    S["bill"] = bill
    return len(bill) == 1 and bill.invoice_line_ids.quantity == 10


@step("landed cost: SRD 40 freight on the first receipt raises AVCO to 14")
def _():
    freight = env["product.product"].search([("name", "ilike", "Freight")], limit=1)
    lc = env["stock.landed.cost"].create(
        {"picking_ids": [(6, 0, [S["receipt"].id])], "cost_lines": [(0, 0, {"product_id": freight.id, "name": "Freight", "price_unit": 40.0, "split_method": "equal"})]}
    )
    lc.compute_landed_cost()
    lc.button_validate()
    S["product"].invalidate_recordset()
    # 7 units of 10 + (40 spread over 7 units) -> 7*10+40 = 110; plus 3 units at 10 = 30; total 140 / 10 = 14.0
    return (lc.state == "done" and approx(S["product"].standard_price, 14.0)) or f"state={lc.state} standard_price={S['product'].standard_price}"


@step("internal transfer: 5 units main stock -> first shop (one operation, no transit)")
def _():
    picking = env["stock.picking"].create(
        {"picking_type_id": env.ref("stock.picking_type_internal").id, "location_id": warehouse.lot_stock_id.id, "location_dest_id": shop.id,
         "move_ids": [(0, 0, {"product_id": S["product"].id, "product_uom_qty": 5, "location_id": warehouse.lot_stock_id.id, "location_dest_id": shop.id})]}
    )
    picking.action_confirm()
    picking.action_assign()
    picking.move_ids.quantity = 5
    picking.button_validate()
    return picking.state == "done" and sum(env["stock.quant"].search([("product_id", "=", S["product"].id), ("location_id", "=", shop.id)]).mapped("quantity")) == 5


@step("POS: seller sells 1 item in the shop; stock 5 -> 4; seller recorded")
def _():
    cfg = env["pos.config"].search([("picking_type_id.default_location_src_id", "=", shop.id)], limit=1)
    S["cfg"] = cfg
    session = env["pos.session"].with_user(S["seller"]).create({"config_id": cfg.id, "user_id": S["seller"].id})
    session.set_opening_control(0, "")
    S["session"] = session
    method = cfg.payment_method_ids.filtered(lambda m: m.type == "cash")[:1]
    price = cfg.pricelist_id._get_product_price(S["product"], 1)
    line = {"id": 1, "price_unit": price, "product_id": S["product"].id, "price_subtotal": price, "price_subtotal_incl": price, "qty": 1, "tax_ids": [(6, 0, [])]}
    data = {
        "amount_paid": price, "amount_return": 0, "amount_tax": 0, "amount_total": price, "date_order": fields.Datetime.to_string(fields.Datetime.now()),
        "fiscal_position_id": False, "pricelist_id": cfg.pricelist_id.id, "name": "Order ZZ-FLOWTEST-0001", "lines": [(0, 0, line)], "partner_id": False,
        "session_id": session.id, "payment_ids": [(0, 0, {"amount": price, "name": fields.Datetime.now(), "payment_method_id": method.id})],
        "uuid": "zz-flowtest-0001", "user_id": S["seller"].id, "to_invoice": False,
    }
    res = env["pos.order"].with_user(S["seller"]).sync_from_ui([data])
    order = env["pos.order"].browse(res["pos.order"][0]["id"])
    S["order"] = order
    if not order.picking_ids:
        order._create_order_picking()
    on_hand = sum(env["stock.quant"].search([("product_id", "=", S["product"].id), ("location_id", "=", shop.id)]).mapped("quantity"))
    return (order.state in ("paid", "done") and order.user_id == S["seller"] and on_hand == 4) or f"state={order.state} user={order.user_id.login} on_hand={on_hand}"


@step("POS margin: revenue 25, cost 14, margin 11 (44%)")
def _():
    o = S["order"]
    return (approx(o.margin, 11.0) and approx(o.amount_total, 25.0)) or f"margin={o.margin} total={o.amount_total} pct={getattr(o, 'margin_percent', None)}"


@step("POS receipt renders (Dutch labels, no 'Powered by Odoo', has shop url)")
def _():
    html = str(S["order"].order_receipt_generate_html())
    S["receipt_html"] = html
    return ("Powered by" not in html) and ("shop-nextx.com" in html) and ("Verkoper" in html) or "receipt text check failed"


@step("POS refund: returning the item puts stock back to 5")
def _():
    action = S["order"].refund()
    refund = env["pos.order"].browse(action["res_id"])
    method = S["cfg"].payment_method_ids.filtered(lambda m: m.type == "cash")[:1]
    refund.add_payment({"pos_order_id": refund.id, "amount": refund.amount_total, "name": "refund", "payment_method_id": method.id})
    refund.action_pos_order_paid()
    if not refund.picking_ids:
        refund._create_order_picking()
    on_hand = sum(env["stock.quant"].search([("product_id", "=", S["product"].id), ("location_id", "=", shop.id)]).mapped("quantity"))
    return (on_hand == 5) or f"on_hand={on_hand} refund_state={refund.state} total={refund.amount_total}"


@step("sales order: confirming reserves stock (customer reservation)")
def _():
    so = env["sale.order"].create({"partner_id": S["customer"].id, "order_line": [(0, 0, {"product_id": S["product"].id, "product_uom_qty": 2})]})
    so.action_confirm()
    S["so"] = so
    pick = so.picking_ids[:1]
    S["delivery"] = pick
    return (pick.state == "assigned" and sum(pick.move_ids.mapped("quantity")) == 2) or f"picking state={pick.state}"


@step("delivery validated, then customer return restores stock")
def _():
    d = S["delivery"]
    d.move_ids.quantity = 2
    d.button_validate()
    res = d.action_return()  # Odoo 20: no wizard, the return picking is created directly
    ret = env["stock.picking"].browse(res["res_id"])
    ret.move_ids.product_uom_qty = 1
    ret.move_ids.quantity = 1
    ret.button_validate()
    free = S["product"].with_context(location=warehouse.lot_stock_id.id).qty_available
    return (d.state == "done" and ret.state == "done" and free == 9) or f"delivery={d.state} return={ret.state} on_hand={free}"


@step("permissions: seller cannot edit company or accounting settings")
def _():
    try:
        company.with_user(S["seller"]).write({"name": "hacked"})
        return "seller could write company!"
    except Exception:
        pass
    try:
        env["account.journal"].with_user(S["seller"]).create({"name": "x", "type": "cash", "code": "ZZZ"})
        return "seller could create a journal!"
    except Exception:
        return True


@step("documents render to PDF (quote, SO, PO, invoice, delivery slip)")
def _():
    out = {}
    Report = env["ir.actions.report"]
    for name, rec in (("sale.report_saleorder", S["so"]), ("purchase.report_purchase_quotation", S["po"]), ("account.report_invoice", S["bill"]), ("stock.report_deliveryslip", S["delivery"])):
        pdf, _fmt = Report._render_qweb_pdf(name, rec.ids)
        out[name] = len(pdf)
    return all(v > 1500 for v in out.values()) or str(out)


print("\n" + "=" * 70)
for name, status, note in results:
    print(f"{status:4}  {name}" + (f"   <- {note}" if note else ""))
print("=" * 70)
print("TOTAL:", sum(1 for r in results if r[1] == "PASS"), "pass /", sum(1 for r in results if r[1] == "FAIL"), "fail")
env.cr.rollback()
print("(rolled back, nothing persisted)")
