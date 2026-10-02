# Idempotent NextX base configuration for Odoo 20, run through `odoo shell`:
#   NEXTX_DATA_DIR=/data docker exec -i -e NEXTX_DATA_DIR odoo20-web odoo shell -d nextx_staging --no-http < configure_nextx.py
# Safe to re-run: every record is looked up first (external id, then name) and only created when missing.
# Adopts what already exists on staging instead of duplicating it. It never posts accounting entries,
# never sets passwords, never invents legal data, and never enters an exchange rate.
import base64
import json
import os

DATA = os.environ.get("NEXTX_DATA_DIR", "")
MODULE = "nextx_supabase"
log = []


def say(msg):
    log.append(msg)
    print(msg)


def xmlid_get(model, name):
    row = env["ir.model.data"].search([("module", "=", MODULE), ("name", "=", name), ("model", "=", model)], limit=1)
    return env[model].browse(row.res_id).exists() if row else env[model]


def xmlid_set(record, name):
    if not env["ir.model.data"].search_count([("module", "=", MODULE), ("name", "=", name)]):
        env["ir.model.data"].create({"module": MODULE, "name": name, "model": record._name, "res_id": record.id, "noupdate": True})


def ensure(model, domain, vals, label):
    rec = env[model].with_context(active_test=False).search(domain, limit=1)
    if rec:
        changed = {k: v for k, v in vals.items() if rec._fields[k].convert_to_write(rec[k], rec) != v and not rec._fields[k].type in ("many2many", "one2many")}
        if changed:
            rec.write(changed)
            say(f"~ {label}: updated {sorted(changed)}")
        return rec
    rec = env[model].create({**dict((d[0], d[2]) for d in domain if d[1] == "="), **vals})
    say(f"+ {label}: created")
    return rec


company = env["res.company"].search([], limit=1)

# ------------------------------------------------------------------ company (verified facts only)
srd = env.ref("base.SRD")
usd = env.ref("base.USD")
srd.active = True
usd.active = True
sr = env.ref("base.sr")
vals = {"name": "NextX", "website": "https://shop-nextx.com", "primary_color": "#F97015", "secondary_color": "#111111", "terms_type": "plain"}
vals["country_id"] = sr.id  # NextX is a Suriname business
company.write(vals)
if company.currency_id != srd:
    if env["account.move"].search_count([]) == 0:
        company.currency_id = srd
        say("~ company currency set to SRD (no accounting entries existed)")
    else:
        say("!! company currency is not SRD and accounting entries exist: NOT changed")
try:
    from odoo.tools import file_open
    with file_open("nextx_branding/static/src/img/nextx-logo.png", "rb") as fh:
        company.logo = base64.b64encode(fh.read()).decode()
except Exception as exc:
    say(f"!! logo not set: {exc}")
say(f"company: {company.name} / {company.country_id.code} / {company.currency_id.name}")

# ------------------------------------------------------------------ categories + product tags
roots = {}
for kind, title in (("audio", "Audio"), ("watches", "Watches")):
    roots[kind] = ensure("product.category", [("name", "=", title), ("parent_id", "=", False)], {}, f"category {title}")

if DATA:
    with open(os.path.join(DATA, "categories.json"), encoding="utf8") as fh:
        for c in json.load(fh):
            rec = xmlid_get("product.category", f"category_{c['id']}")
            if not rec:
                rec = ensure("product.category", [("name", "=", c["name"]), ("parent_id", "=", roots[c["catalog_type"]].id)], {}, f"category {c['name']}")
                xmlid_set(rec, f"category_{c['id']}")

# AVCO on every sellable category: the simplest sound method for repeated imports at changing prices.
for categ in env["product.category"].search([]):
    if categ.property_cost_method != "average":
        categ.property_cost_method = "average"
say("categories: costing method = AVCO everywhere")

# ------------------------------------------------------------------ warehouse and the three shops
warehouse = env["stock.warehouse"].search([("company_id", "=", company.id)], limit=1)
if warehouse.name != "NextX":
    warehouse.name = "NextX"
stock_root = warehouse.lot_stock_id
shops = {}
if DATA:
    with open(os.path.join(DATA, "locations.json"), encoding="utf8") as fh:
        for l in json.load(fh):
            loc = xmlid_get("stock.location", f"location_{l['id']}")
            if loc:
                if loc.name != l["name"]:
                    loc.name = l["name"]
                    say(f"~ location renamed to its real name: {l['name']}")
            else:
                loc = ensure("stock.location", [("name", "=", l["name"]), ("location_id", "=", stock_root.id)], {"usage": "internal"}, f"location {l['name']}")
                xmlid_set(loc, f"location_{l['id']}")
            shops[l["id"]] = loc
# One normal manual internal transfer, no transit stage, no replenishment rules.
internal = env.ref("stock.picking_type_internal", raise_if_not_found=False) or env["stock.picking.type"].search([("code", "=", "internal"), ("warehouse_id", "=", warehouse.id)], limit=1)
if internal and not internal.active:
    internal.active = True
    say("~ internal transfer type activated")
say(f"warehouse {warehouse.name}: {len(shops)} shop locations, receipts={warehouse.reception_steps}, deliveries={warehouse.delivery_steps}")

# ------------------------------------------------------------------ pricelists
public = env["product.pricelist"].search([("currency_id", "=", srd.id)], limit=1) or env["product.pricelist"].create({"name": "NextX SRD", "currency_id": srd.id})
if public.name != "NextX SRD" and public.name in ("Standaard", "Default", "Public Pricelist", "Openbare prijslijst"):
    public.name = "NextX SRD"
usd_list = ensure("product.pricelist", [("name", "=", "NextX USD")], {"currency_id": usd.id}, "pricelist NextX USD")

# ------------------------------------------------------------------ landed cost products (kept to three)
for name in ("Freight (Landed Cost)", "Import / Handling (Landed Cost)", "Other Landed Cost"):
    ensure(
        "product.template",
        [("name", "=", name)],
        {"type": "service", "landed_cost_ok": True, "purchase_ok": True, "sale_ok": False, "split_method_landed_cost": "by_current_cost_price"},
        f"landed cost product {name}",
    )

# ------------------------------------------------------------------ point of sale: one config per shop
SHORT = {
    "0dd69d03-f03c-4c68-8872-b3c583824b08": "Alkmaar",
    "a95b7aca-fe47-438d-ac65-2160a869938a": "Thurkowweg",
    "7f16628b-ade4-49c6-97d5-f143b093e933": "Blauwgrond",
}


def converge(rec, vals, label):
    diff = {k: v for k, v in vals.items() if rec._fields[k].type not in ("many2many", "one2many") and rec._fields[k].convert_to_write(rec[k], rec) != v}
    if diff:
        rec.write(diff)
        say(f"~ {label}: updated {sorted(diff)}")
    return rec


def make(model, vals, label):
    rec = env[model].create(vals)
    say(f"+ {label}: created")
    return rec


customers = env.ref("stock.stock_location_customers")
for n, (shop_id, loc) in enumerate(shops.items(), start=1):
    short = SHORT.get(shop_id, loc.name.split()[0])
    # Everything hangs off the shop location, so records Luna created under other names are adopted, not duplicated.
    ptype = xmlid_get("stock.picking.type", f"ptype_pos_{shop_id}") or env["stock.picking.type"].with_context(active_test=False).search(
        [("code", "=", "outgoing"), ("warehouse_id", "=", warehouse.id), ("default_location_src_id", "=", loc.id)], limit=1
    )
    ptype_vals = {"name": f"POS {short}", "code": "outgoing", "warehouse_id": warehouse.id, "default_location_src_id": loc.id, "default_location_dest_id": customers.id, "active": True}
    ptype = converge(ptype, ptype_vals, f"picking type {short}") if ptype else make("stock.picking.type", {**ptype_vals, "sequence_code": f"POS{n}"}, f"picking type {short}")
    xmlid_set(ptype, f"ptype_pos_{shop_id}")

    config = xmlid_get("pos.config", f"poscfg_{shop_id}") or env["pos.config"].with_context(active_test=False).search([("picking_type_id", "=", ptype.id)], limit=1)
    method = xmlid_get("pos.payment.method", f"paymethod_cash_{shop_id}") or (config.payment_method_ids.filtered(lambda m: m.type == "cash")[:1] if config else env["pos.payment.method"])
    if not method:
        journal = env["account.journal"].search([("company_id", "=", company.id), ("code", "=", f"K{n}")], limit=1) or make(
            "account.journal", {"name": f"Kas {short}", "type": "cash", "code": f"K{n}", "company_id": company.id}, f"cash journal {short}"
        )
        method = make("pos.payment.method", {"name": "Cash", "journal_id": journal.id, "company_id": company.id, "type": "cash"}, f"payment method Cash ({short})")
    else:
        converge(method, {"name": "Cash"}, f"payment method ({short})")
        converge(method.journal_id, {"name": f"Kas {short}"}, f"cash journal {short}")
    xmlid_set(method, f"paymethod_cash_{shop_id}")

    cfg_vals = {"name": f"NextX {short}", "picking_type_id": ptype.id, "pricelist_id": public.id, "receipt_header": False, "receipt_footer": False}
    config = converge(config, cfg_vals, f"POS config {short}") if config else make("pos.config", cfg_vals, f"POS config {short}")
    config.write({"payment_method_ids": [(6, 0, [method.id])]})
    xmlid_set(config, f"poscfg_{shop_id}")
say("POS: receipt header/footer are owned by the NextX receipt template, not typed into each config")

env.cr.commit()
say("configure_nextx: done")
