# Idempotent catalogue + opening-stock migration from the Supabase snapshot, run through `odoo shell`:
#   NEXTX_DATA_DIR=/data NEXTX_OUT_DIR=/out docker exec -i -e NEXTX_DATA_DIR -e NEXTX_OUT_DIR odoo20-web \
#       odoo shell -d nextx_staging --no-http < migrate_supabase.py
# Run configure_nextx.py first. Re-running never duplicates: records are keyed by external id
# (nextx_supabase.item_<uuid>) and stock is SET to the verified count, never added on top.
#
# Optional environment:
#   NEXTX_FX_USD_SRD   confirmed USD->SRD rate. Without it, costs are NOT written (a USD cost cannot become an
#                      SRD cost without a verified rate) and opening stock carries zero value.
#   NEXTX_PUBLISH      "1" (default) publishes public, non-combo products on the Odoo website.
#   NEXTX_DRY_RUN      "1" rolls everything back at the end and only prints what would change.
import base64
import csv
import hashlib
import html
import json
import os

DATA = os.environ["NEXTX_DATA_DIR"]
OUT = os.environ.get("NEXTX_OUT_DIR", DATA)
FX = float(os.environ.get("NEXTX_FX_USD_SRD") or 0)
PUBLISH = os.environ.get("NEXTX_PUBLISH", "1") == "1"
DRY = os.environ.get("NEXTX_DRY_RUN") == "1"
MODULE = "nextx_supabase"
COST_OK = {"MIGRATABLE", "NEEDS_OWNER_CONFIRMATION"}  # NEEDS_OWNER_CONFIRMATION is loaded but stays flagged in the report
stats = {"created": 0, "updated": 0, "unchanged": 0}
problems = []


def load(name):
    with open(os.path.join(DATA, name), encoding="utf8") as fh:
        return json.load(fh)


def xmlid_get(model, name):
    row = env["ir.model.data"].search([("module", "=", MODULE), ("name", "=", name), ("model", "=", model)], limit=1)
    return env[model].with_context(active_test=False).browse(row.res_id).exists() if row else env[model]


def xmlid_set(rec, name):
    if not env["ir.model.data"].search_count([("module", "=", MODULE), ("name", "=", name)]):
        env["ir.model.data"].create({"module": MODULE, "name": name, "model": rec._name, "res_id": rec.id, "noupdate": True})


def differs(rec, field, value):
    f = rec._fields[field]
    if f.type == "many2many":
        cmd = value[0] if value else None
        if cmd and cmd[0] == 6:
            return set(cmd[2]) != set(rec[field].ids)
        if cmd and cmd[0] == 5:
            return bool(rec[field])
        return True
    if f.type == "one2many":
        return True
    return f.convert_to_write(rec[field], rec) != value


def upsert(model, key, vals):
    rec = xmlid_get(model, key)
    if rec:
        diff = {k: v for k, v in vals.items() if differs(rec, k, v)}
        if diff:
            rec.write(diff)
            stats["updated"] += 1
        else:
            stats["unchanged"] += 1
        return rec
    rec = env[model].create(vals)
    xmlid_set(rec, key)
    stats["created"] += 1
    return rec


def image_b64(item_id):
    img = images.get(item_id)
    if not img or img["status"] != "OK":
        return None
    with open(os.path.join(DATA, "images", img["file"]), "rb") as fh:
        return base64.b64encode(fh.read()).decode()


def stored_sha(tmpl):
    # Odoo 20 returns binary fields as raw bytes (BinaryValue), not base64.
    return hashlib.sha256(bytes(tmpl.image_1920)).hexdigest() if tmpl.image_1920 else None


def to_html(text):
    if not text:
        return False
    paras = [p.strip() for p in str(text).replace("\r", "").split("\n\n") if p.strip()]
    return "".join("<p>" + html.escape(p).replace("\n", "<br/>") + "</p>" for p in paras)


items = load("items.json")
stock = load("stock.json")
combo_rows = load("combo_items.json")
manifest = {}
with open(os.path.join(DATA, "odoo-product-manifest.csv"), encoding="utf8", newline="") as fh:
    for row in csv.DictReader(fh):
        manifest[row["external_id"].split("item_")[-1]] = row
images = {m["id"]: m for m in load("images-manifest.json")} if os.path.exists(os.path.join(DATA, "images-manifest.json")) else {}

company = env["res.company"].search([], limit=1)
usd_list = env["product.pricelist"].search([("name", "=", "NextX USD")], limit=1)
tags = {}


def tag(name):
    if name not in tags:
        tags[name] = env["product.tag"].search([("name", "=", name)], limit=1) or env["product.tag"].create({"name": name})
    return tags[name]


root = {k: env["product.category"].search([("name", "=", v), ("parent_id", "=", False)], limit=1) for k, v in (("audio", "Audio"), ("watches", "Watches"))}

# ------------------------------------------------------------------ simple products
for it in items:
    if it["is_combo"]:
        continue
    row = manifest[it["id"]]
    categ = xmlid_get("product.category", f"category_{it['category_id']}") if it["category_id"] else root[it["catalog_type"]]
    vals = {
        "name": it["name"].strip(),
        "type": "consu",
        "is_storable": True,
        "sale_ok": True,
        "purchase_ok": True,
        "categ_id": categ.id,
        "list_price": it["selling_price_srd"] or 0.0,
        "description_ecommerce": to_html(it["description"]),
        "is_published": bool(PUBLISH and it["is_public"]),
        "product_tag_ids": [(6, 0, [tag(row["brand"]).id])] if row["brand"] else [(5, 0, 0)],
    }
    if FX and row["cost_class"] in COST_OK:
        vals["standard_price"] = round((it["purchase_price_usd"] or 0) * FX, 4)
    if image_b64(it["id"]):
        vals["image_1920"] = image_b64(it["id"])
    else:
        problems.append(f"NO IMAGE: {it['name'].strip()}")
    # images are only rewritten when the stored bytes differ from the source file
    tmpl = xmlid_get("product.template", f"item_{it['id']}")
    if tmpl and "image_1920" in vals and stored_sha(tmpl) == images[it["id"]]["sha256"]:
        vals.pop("image_1920")
    tmpl = upsert("product.template", f"item_{it['id']}", vals)

    if usd_list and it["selling_price_usd"]:
        item = env["product.pricelist.item"].search([("pricelist_id", "=", usd_list.id), ("product_tmpl_id", "=", tmpl.id), ("applied_on", "=", "1_product")], limit=1)
        pvals = {"pricelist_id": usd_list.id, "applied_on": "1_product", "product_tmpl_id": tmpl.id, "compute_price": "fixed", "fixed_price": it["selling_price_usd"], "min_quantity": 0}
        if item:
            item.write({"fixed_price": it["selling_price_usd"]})
        else:
            env["product.pricelist.item"].create(pvals)

# ------------------------------------------------------------------ combos (sold as a fixed bundle; cost is derived from components)
for it in items:
    if not it["is_combo"]:
        continue
    parts = [c for c in combo_rows if c["combo_id"] == it["id"]]
    categ = root[it["catalog_type"]]
    vals = {"name": it["name"].strip(), "type": "combo", "sale_ok": True, "purchase_ok": False, "categ_id": categ.id, "list_price": it["selling_price_srd"] or 0.0, "is_published": False}
    if not xmlid_get("product.template", f"item_{it['id']}"):
        combo_ids = []
        for part in parts:
            comp = xmlid_get("product.template", f"item_{part['item_id']}")
            if not comp:
                problems.append(f"COMBO {it['name'].strip()}: component {part['item_id']} missing")
                continue
            for _ in range(part["quantity"]):
                combo_ids.append((0, 0, {"name": f"{it['name'].strip()} / {comp.name}", "combo_item_ids": [(0, 0, {"product_id": comp.product_variant_id.id})]}))
        vals["combo_ids"] = combo_ids  # a combo cannot exist without at least one choice
    existing = xmlid_get("product.template", f"item_{it['id']}")
    if image_b64(it["id"]) and not (existing and stored_sha(existing) == images[it["id"]]["sha256"]):
        vals["image_1920"] = image_b64(it["id"])
    upsert("product.template", f"item_{it['id']}", vals)

# ------------------------------------------------------------------ opening stock: SET to the verified count, never add
shop = {l["id"]: xmlid_get("stock.location", f"location_{l['id']}") for l in load("locations.json")}
Quant = env["stock.quant"].with_context(inventory_mode=True)
applied = 0
for s in stock:
    prod = xmlid_get("product.template", f"item_{s['item_id']}").product_variant_id
    loc = shop[s["location_id"]]
    if not prod or not loc:
        problems.append(f"STOCK ROW unresolved: item {s['item_id']} location {s['location_id']}")
        continue
    have = sum(env["stock.quant"].search([("product_id", "=", prod.id), ("location_id", "child_of", loc.id)]).mapped("quantity"))
    if abs(have - s["quantity"]) > 1e-9 and (s["quantity"] > 0 or have):
        q = Quant.search([("product_id", "=", prod.id), ("location_id", "=", loc.id)], limit=1) or Quant.create({"product_id": prod.id, "location_id": loc.id})
        q.inventory_quantity = s["quantity"]
        q.action_apply_inventory()
        applied += 1

# ------------------------------------------------------------------ reconciliation (expected vs actual, line by line)
env["stock.quant"].invalidate_model()
names = {i["id"]: i["name"].strip() for i in items}
lines, diffs = [], 0
for s in stock:
    prod = xmlid_get("product.template", f"item_{s['item_id']}").product_variant_id
    actual = sum(env["stock.quant"].search([("product_id", "=", prod.id), ("location_id", "child_of", shop[s["location_id"]].id)]).mapped("quantity"))
    ok = abs(actual - s["quantity"]) < 1e-9
    diffs += 0 if ok else 1
    lines.append([s["item_id"], names[s["item_id"]], shop[s["location_id"]].name, s["quantity"], actual, "OK" if ok else "DIFF"])

mismatch_img, img_total = 0, 0
for it in items:
    img = images.get(it["id"])
    tmpl = xmlid_get("product.template", f"item_{it['id']}")
    if not img or img["status"] != "OK":
        continue
    img_total += 1
    if stored_sha(tmpl) != img["sha256"]:
        mismatch_img += 1
        problems.append(f"IMAGE BYTES DIFFER FROM SOURCE: {names[it['id']]}")

os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, "stock-reconciliation-result.csv"), "w", encoding="utf8", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["item_external_id", "item", "location", "supabase_expected", "odoo_actual", "result"])
    w.writerows(lines)

simple = [i for i in items if not i["is_combo"]]
in_odoo = env["product.template"].search_count([("id", "in", [xmlid_get("product.template", f"item_{i['id']}").id for i in items if xmlid_get("product.template", f"item_{i['id']}")])])
print("RESULT products in source/odoo:", len(items), "/", in_odoo, "| simple:", len(simple), "| combos:", len(items) - len(simple))
print("RESULT upsert:", stats, "| stock adjustments applied this run:", applied)
print("RESULT stock lines:", len(lines), "| diffs:", diffs, "| expected units:", sum(s["quantity"] for s in stock), "| odoo units:", sum(l[4] for l in lines))
print("RESULT images: verified byte-identical to source:", img_total - mismatch_img, "of", img_total, "| mismatches:", mismatch_img)
print("RESULT costs written:", "yes at fx=%s (flagged: NEEDS_OWNER_CONFIRMATION where applicable)" % FX if FX else "NO (no confirmed FX rate)")
for p in problems:
    print("PROBLEM", p)

if DRY:
    env.cr.rollback()
    print("DRY RUN: rolled back")
else:
    env.cr.commit()
    print("committed")
