# Business-logic test of the NextX scan screen on real Odoo (everything is rolled back).
#   docker exec -i odoo20-web odoo shell -d nextx_staging --no-http < scan_test.py
from odoo.exceptions import AccessError, UserError

S = env["nextx.scan"]
ok = []
def check(label, cond):
    ok.append(bool(cond)); print(("PASS " if cond else "FAIL ") + label)

n = S.assign_internal_barcodes()
print("barcodes assigned:", n)
check("second run assigns nothing", S.assign_internal_barcodes() == 0)

prod = env["product.product"].search([("is_storable", "=", True)], limit=1)
check("have a storable product", prod)
code = prod.barcode or "ZZ"
res = S.lookup(code)
check("lookup by barcode", res["id"] == prod.id)
try:
    S.lookup("0000000000000"); check("unknown barcode raises", False)
except UserError:
    check("unknown barcode raises", True)

locs = S.locations()
print("locations:", [l["name"] for l in locs])
a, b = locs[0]["id"], locs[1]["id"]

with env.cr.savepoint():
    rows = S.apply_count(a, [{"product_id": prod.id, "qty": 7}])
    check("count sets qty 7 at A", env["stock.quant"].search([("product_id", "=", prod.id), ("location_id", "=", a)]).quantity == 7)
    r = S.transfer(a, b, [{"product_id": prod.id, "qty": 3}])
    qa = env["stock.quant"].search([("product_id", "=", prod.id), ("location_id", "=", a)]).quantity
    qb = env["stock.quant"].search([("product_id", "=", prod.id), ("location_id", "=", b)]).quantity
    check(f"transfer 3 A->B ({r['picking']} {r['state']}) A={qa}", r["state"] == "done" and qa == 4)
    try:
        S.transfer(a, b, [{"product_id": prod.id, "qty": 999}]); check("short stock refused", False)
    except UserError as e:
        check("short stock refused", True)

    # receipt flow
    vendor = env["res.partner"].create({"name": "ZZ scan vendor"})
    po = env["purchase.order"].create({"partner_id": vendor.id, "order_line": [(0, 0, {"product_id": prod.id, "product_qty": 10, "price_unit": 5})]})
    po.button_confirm()
    rec = [r for r in S.receipts() if r["origin"] == po.name]
    check("open receipt listed", len(rec) == 1)
    out = S.receive(rec[0]["id"], [{"product_id": prod.id, "qty": 6}])
    check(f"partial receive -> backorder {out['backorders']}", out["state"] == "done" and len(out["backorders"]) == 1)

    # seller rights
    seller = env["res.users"].search([("login", "in", ("rico", "aryan"))], limit=1)
    if seller:
        es = S.with_user(seller)
        check("seller can look up", es.lookup(code)["id"] == prod.id)
        try:
            es.apply_count(a, [{"product_id": prod.id, "qty": 1}]); print("INFO seller may count (has stock user)")
        except AccessError:
            print("INFO seller cannot count")

print("RESULT", "ALL PASS" if all(ok) else "FAILURES")
env.cr.rollback()
