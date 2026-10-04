# Renders every customer-facing NextX document with realistic sample data, inside a transaction that is
# ROLLED BACK. Output goes to $NEXTX_OUT_DIR (default /tmp): PDFs + receipt.html + mail previews.
#   NEXTX_OUT_DIR=/out docker exec -i -e NEXTX_OUT_DIR odoo20-web odoo shell -d nextx_staging --no-http < render_docs.py
import os
from odoo import fields

OUT = os.environ.get("NEXTX_OUT_DIR", "/tmp")
os.makedirs(OUT, exist_ok=True)
company = env["res.company"].search([], limit=1)
# wkhtmltopdf fetches CSS/fonts/logo over HTTP; point it at a running server (rolled back with everything else)
env["ir.config_parameter"].sudo().set_str("report.url", os.environ.get("NEXTX_REPORT_URL", "http://127.0.0.1:8069"))
env["ir.config_parameter"].sudo().set_str("web.base.url", os.environ.get("NEXTX_REPORT_URL", "http://127.0.0.1:8069"))
Report = env["ir.actions.report"]
usd = env.ref("base.USD")
env["res.currency.rate"].create({"currency_id": usd.id, "company_id": company.id, "name": fields.Date.today(), "rate": 1 / 38.0})  # rolled back
env.cr.execute("SELECT 1")

categ = env["product.category"].search([("name", "=", "Audio")], limit=1)
products = env["product.product"].create([
    {"name": "KZ AS16 Pro X", "type": "consu", "is_storable": True, "taxes_id": [(5, 0, 0)], "supplier_taxes_id": [(5, 0, 0)], "categ_id": categ.id, "list_price": 3000.0, "standard_price": 1216.0},
    {"name": "ESSAGER AUX(3.5mm) to Type-C DAC", "type": "consu", "is_storable": True, "taxes_id": [(5, 0, 0)], "supplier_taxes_id": [(5, 0, 0)], "categ_id": categ.id, "list_price": 200.0, "standard_price": 72.2},
    {"name": "Invicta Specialty Rowan Men's Watch – Gold & Steel, Blue Dial, Model 69476", "type": "consu", "is_storable": True, "taxes_id": [(5, 0, 0)], "categ_id": categ.id, "list_price": 3471.0, "standard_price": 1140.0},
])
customer = env["res.partner"].create({"name": "Ramona Lachman", "phone": "+597 8123456", "street": "Commewijnestraat 12", "city": "Paramaribo", "country_id": env.ref("base.sr").id})
vendor = env["res.partner"].create({"name": "AliExpress Supplier (voorbeeld)", "supplier_rank": 1})


def save(name, content):
    path = os.path.join(OUT, name)
    with open(path, "wb") as fh:
        fh.write(content)
    print("wrote", path, len(content), "bytes")


# --- quotation + sales order (long product name on purpose)
so = env["sale.order"].create({
    "partner_id": customer.id,
    "order_line": [
        (0, 0, {"product_id": products[0].id, "product_uom_qty": 1}),
        (0, 0, {"product_id": products[1].id, "product_uom_qty": 2, "discount": 10}),
        (0, 0, {"product_id": products[2].id, "product_uom_qty": 1}),
    ],
})
save("quotation.pdf", Report._render_qweb_pdf("sale.report_saleorder", so.ids)[0])
so.action_confirm()
save("sales-order.pdf", Report._render_qweb_pdf("sale.report_saleorder", so.ids)[0])
save("delivery-slip.pdf", Report._render_qweb_pdf("stock.report_deliveryslip", so.picking_ids.ids)[0])

# --- a long quotation (30 lines) to check page breaks, repeated headers and the footer on page 2
long_so = env["sale.order"].create({"partner_id": customer.id, "order_line": [(0, 0, {"product_id": products[i % 3].id, "product_uom_qty": 1 + i % 4}) for i in range(30)]})
save("quotation-long.pdf", Report._render_qweb_pdf("sale.report_saleorder", long_so.ids)[0])

# --- purchase order in USD
po = env["purchase.order"].create({
    "partner_id": vendor.id, "currency_id": usd.id,
    "order_line": [(0, 0, {"product_id": products[0].id, "product_qty": 10, "price_unit": 32.0}), (0, 0, {"product_id": products[1].id, "product_qty": 40, "price_unit": 1.9})],
})
po.button_confirm()
save("purchase-order.pdf", Report._render_qweb_pdf("purchase.report_purchaseorder", po.ids)[0])

# --- customer invoice (SRD), USD invoice, credit note
inv = so._create_invoices()
inv.action_post()
save("invoice.pdf", Report._render_qweb_pdf("account.report_invoice", inv.ids)[0])
inv_usd = env["account.move"].create({
    "move_type": "out_invoice", "partner_id": customer.id, "currency_id": usd.id,
    "invoice_line_ids": [(0, 0, {"product_id": products[0].id, "quantity": 1, "price_unit": 79.0}), (0, 0, {"product_id": products[1].id, "quantity": 1, "price_unit": 5.26})],
})
inv_usd.action_post()
save("invoice-usd.pdf", Report._render_qweb_pdf("account.report_invoice", inv_usd.ids)[0])
reversal = env["account.move.reversal"].with_context(active_model="account.move", active_ids=inv.ids).create({"reason": "Retour", "journal_id": inv.journal_id.id}).refund_moves()
credit = env["account.move"].browse(reversal["res_id"])
credit.action_post()
save("credit-note.pdf", Report._render_qweb_pdf("account.report_invoice", credit.ids)[0])

# --- POS receipt (HTML; convert with wkhtmltopdf --page-width 80mm)
# A POS can have only one open session; an earlier implementation test left one open, so use a shop that has none.
busy = env["pos.session"].search([("state", "!=", "closed")]).mapped("config_id")
cfg = env["pos.config"].search([("id", "not in", busy.ids)], limit=1) or env["pos.config"].search([], limit=1)
seller = env["res.users"].create({"name": "Rico", "login": "zz_rico_render", "group_ids": [(6, 0, [env.ref("base.group_user").id, env.ref("point_of_sale.group_pos_user").id])]})
session = env["pos.session"].with_user(seller).create({"config_id": cfg.id, "user_id": seller.id})
session.set_opening_control(0, "")
method = cfg.payment_method_ids.filtered(lambda m: m.type == "cash")[:1]
lines, total = [], 0.0
for prod, qty, disc in ((products[0], 1, 0), (products[1], 2, 10), (products[2], 1, 0)):
    price = prod.lst_price
    sub = round(price * qty * (1 - disc / 100.0), 2)
    total += sub
    lines.append((0, 0, {"id": prod.id, "price_unit": price, "product_id": prod.id, "price_subtotal": sub, "price_subtotal_incl": sub, "qty": qty, "discount": disc, "tax_ids": [(6, 0, [])]}))
paid = 7000.0
data = {"amount_paid": paid, "amount_return": -round(paid - total, 2), "amount_tax": 0, "amount_total": round(total, 2), "date_order": fields.Datetime.to_string(fields.Datetime.now()),
        "fiscal_position_id": False, "pricelist_id": cfg.pricelist_id.id, "name": "Order ZZ-RENDER-0001", "lines": lines, "partner_id": False, "session_id": session.id,
        "payment_ids": [(0, 0, {"amount": paid, "name": fields.Datetime.now(), "payment_method_id": method.id})], "uuid": "zz-render-0001", "user_id": seller.id, "to_invoice": False}
order = env["pos.order"].with_user(seller).sync_from_ui([data])
order = env["pos.order"].browse(order["pos.order"][0]["id"])
save("receipt.html", str(order.order_receipt_generate_html()).encode("utf8"))

# --- mail previews
for tmpl_xmlid, rec in (("sale.email_template_edi_sale", so), ("account.email_template_edi_invoice", inv), ("purchase.email_template_edi_purchase", po)):
    t = env.ref(tmpl_xmlid, raise_if_not_found=False)
    if t:
        r = t._generate_template([rec.id], ("subject", "body_html"))[rec.id]
        save(f"mail-{tmpl_xmlid.split('.')[-1]}.html", (f"<h4 style='font-family:sans-serif'>{r['subject']}</h4>" + r["body_html"]).encode("utf8"))

env.cr.rollback()
print("(rolled back)")
