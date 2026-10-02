import hmac
import logging
import re

from odoo import fields, http
from odoo.http import request

_logger = logging.getLogger(__name__)

API = "/nextx/store/v1"
EXT_MODULE = "nextx_supabase"  # external ids of migrated records: item_<uuid>, category_<uuid>, location_<uuid>
KINDS = ("audio", "watches")  # top-level product categories that appear in the shop
MAX_LINES = 20
MAX_QTY = 50
SETTINGS_PREFIX = "nextx_storefront.setting."
REF_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]")


def _json(payload, status=200):
    return request.make_json_response(payload, status=status, headers=[("Cache-Control", "no-store")])


def _clean(value, limit):
    return CONTROL_RE.sub(" ", str(value or "")).strip()[:limit]


class NextXStore(http.Controller):
    # ------------------------------------------------------------------ plumbing
    def _authorized(self):
        secret = request.env["ir.config_parameter"].sudo().get_str("nextx_storefront.secret") or ""
        header = request.httprequest.headers.get("Authorization", "")
        token = header[7:].strip() if header.lower().startswith("bearer ") else ""
        # A short or missing secret means "not configured": refuse everything rather than trust it.
        return len(secret) >= 24 and hmac.compare_digest(secret.encode(), token.encode())

    def _company(self, env):
        return env["res.company"].sudo().search([], limit=1)

    def _ext_map(self, env, model, prefix, ids):
        """Odoo id -> public id (the original Supabase UUID for migrated records)."""
        if not ids:
            return {}
        rows = env["ir.model.data"].sudo().search_read(
            [("model", "=", model), ("module", "=", EXT_MODULE), ("res_id", "in", list(ids))], ["name", "res_id"]
        )
        return {r["res_id"]: r["name"][len(prefix):] if r["name"].startswith(prefix) else r["name"] for r in rows}

    @staticmethod
    def _public_id(mapping, odoo_id):
        return mapping.get(odoo_id) or f"odoo-{odoo_id}"

    def _resolve_templates(self, env, public_ids):
        """public id -> product.template record (or None)."""
        out = {}
        Data = env["ir.model.data"].sudo()
        for pid in set(public_ids):
            tmpl = env["product.template"].browse()
            if pid.startswith("odoo-") and pid[5:].isdigit():
                tmpl = env["product.template"].sudo().browse(int(pid[5:])).exists()
            else:
                row = Data.search(
                    [("model", "=", "product.template"), ("module", "=", EXT_MODULE), ("name", "=", f"item_{pid}")], limit=1
                )
                tmpl = env["product.template"].sudo().browse(row.res_id).exists() if row else tmpl
            out[pid] = tmpl or None
        return out

    def _resolve_location(self, env, public_id, locations):
        """public location id (Supabase UUID or odoo-<id>) -> one of the shop locations, or empty."""
        if not public_id:
            return env["stock.location"]
        if public_id.startswith("odoo-") and public_id[5:].isdigit():
            candidate = env["stock.location"].sudo().browse(int(public_id[5:])).exists()
        else:
            row = env["ir.model.data"].sudo().search(
                [("model", "=", "stock.location"), ("module", "=", EXT_MODULE), ("name", "=", f"location_{public_id}")], limit=1
            )
            candidate = env["stock.location"].sudo().browse(row.res_id).exists() if row else env["stock.location"]
        return candidate if candidate in locations else env["stock.location"]

    def _shop_locations(self, env, company):
        warehouse = env["stock.warehouse"].sudo().search([("company_id", "=", company.id)], limit=1)
        stock_root = warehouse.lot_stock_id
        children = env["stock.location"].sudo().search(
            [("location_id", "=", stock_root.id), ("usage", "=", "internal"), ("active", "=", True)]
        )
        return warehouse, (children or stock_root)

    def _free_by_location(self, env, variants, locations):
        """{product.product id: {location id: free qty}} where free = on hand - reserved."""
        result = {v.id: {} for v in variants}
        if not variants or not locations:
            return result
        groups = env["stock.quant"].sudo()._read_group(
            [("product_id", "in", variants.ids), ("location_id", "child_of", locations.ids)],
            ["product_id", "location_id"],
            ["quantity:sum", "reserved_quantity:sum"],
        )
        for product, location, qty, reserved in groups:
            # Attribute quants in deeper sub-locations to the shop location that contains them.
            owner = next((l for l in locations if location.parent_path.startswith(l.parent_path)), location)
            free = (qty or 0.0) - (reserved or 0.0)
            result[product.id][owner.id] = result[product.id].get(owner.id, 0.0) + free
        return result

    # ------------------------------------------------------------------ catalogue
    @http.route(f"{API}/catalog", type="http", auth="public", methods=["GET"], csrf=False, save_session=False)
    def catalog(self, **_kw):
        if not self._authorized():
            return _json({"error": "unauthorized"}, 401)
        env = request.env
        company = self._company(env)
        if company.currency_id.name != "SRD":
            return _json({"error": "company currency must be SRD"}, 500)

        base_url = (env["ir.config_parameter"].sudo().get_str("web.base.url") or "").rstrip("/")
        templates = env["product.template"].sudo().search(
            [("sale_ok", "=", True), ("is_published", "=", True), ("type", "!=", "service")], order="id"
        )
        roots = {}

        def kind_of(categ):
            if not categ:
                return None
            root_id = int(categ.parent_path.split("/")[0])
            if root_id not in roots:
                roots[root_id] = (env["product.category"].sudo().browse(root_id).name or "").strip().lower()
            return roots[root_id] if roots[root_id] in KINDS else None

        templates = templates.filtered(lambda t: kind_of(t.categ_id))
        variants = templates.mapped("product_variant_id")
        warehouse, locations = self._shop_locations(env, company)
        free = self._free_by_location(env, variants, locations)

        tmpl_ext = self._ext_map(env, "product.template", "item_", templates.ids)
        categs = templates.mapped("categ_id")
        categ_ext = self._ext_map(env, "product.category", "category_", categs.ids)
        loc_ext = self._ext_map(env, "stock.location", "location_", locations.ids)

        usd_list = env["product.pricelist"].sudo().browse(
            int(env["ir.config_parameter"].sudo().get_str("nextx_storefront.usd_pricelist_id") or 0)
        ).exists()

        products = []
        for tmpl in templates:
            variant = tmpl.product_variant_id
            price_usd = None
            if usd_list:
                price_usd = round(usd_list._get_product_price(variant, 1.0), 2) or None
            products.append(
                {
                    "id": self._public_id(tmpl_ext, tmpl.id),
                    "odoo_id": tmpl.id,
                    "name": tmpl.name,
                    "brand": tmpl.product_tag_ids[:1].name or None,
                    "description": _clean(tmpl.description_ecommerce and tmpl.description_ecommerce.striptags() or tmpl.description_sale, 2000) or None,
                    "category_id": self._public_id(categ_ext, tmpl.categ_id.id),
                    "catalog": kind_of(tmpl.categ_id),
                    # Original-quality image straight from Odoo; the unique= suffix busts caches on change.
                    "image_url": (
                        f"{base_url}/web/image/product.template/{tmpl.id}/image_1920?unique={int(tmpl.write_date.timestamp())}"
                        if tmpl.image_1920
                        else None
                    ),
                    "price_srd": round(tmpl.list_price, 2) or None,
                    "price_usd": price_usd,
                    "is_combo": tmpl.type == "combo",
                    "created_at": fields.Datetime.to_string(tmpl.create_date),
                    "updated_at": fields.Datetime.to_string(tmpl.write_date),
                    "stock": [
                        {"location_id": self._public_id(loc_ext, loc.id), "quantity": max(0.0, free[variant.id].get(loc.id, 0.0))}
                        for loc in locations
                    ],
                }
            )

        usd = env.ref("base.USD", raise_if_not_found=False)
        rate = None
        if usd:
            latest = env["res.currency.rate"].sudo().search(
                [("currency_id", "=", usd.id), ("company_id", "in", [company.id, False])], order="name desc", limit=1
            )
            if latest and latest.rate:
                rate = {"usd_to_srd": round(1.0 / latest.rate, 6), "set_at": str(latest.name)}

        params = env["ir.config_parameter"].sudo().search([("key", "=like", f"{SETTINGS_PREFIX}%")])
        settings = {p.key[len(SETTINGS_PREFIX):]: p.value for p in params}
        settings.setdefault("store_name", company.name or "NextX")

        return _json(
            {
                "version": 1,
                "generated_at": fields.Datetime.to_string(fields.Datetime.now()),
                "settings": settings,
                "exchange_rate": rate,
                "categories": [
                    {"id": self._public_id(categ_ext, c.id), "name": c.name, "catalog": kind_of(c)} for c in categs
                ],
                "locations": [
                    {"id": self._public_id(loc_ext, loc.id), "name": loc.name, "address": None} for loc in locations
                ],
                "products": products,
            }
        )

    # ------------------------------------------------------------------ availability
    def _check_lines(self, env, lines):
        """Live availability for [{product_id, quantity}]. Returns (ok, rows, templates)."""
        company = self._company(env)
        _wh, locations = self._shop_locations(env, company)
        loc_ext = self._ext_map(env, "stock.location", "location_", locations.ids)
        templates = self._resolve_templates(env, [l["product_id"] for l in lines])
        variants = env["product.product"].browse([t.product_variant_id.id for t in templates.values() if t])
        free = self._free_by_location(env, variants, locations)

        rows, ok = [], True
        for line in lines:
            tmpl = templates.get(line["product_id"])
            if not tmpl or not tmpl.is_published or not tmpl.sale_ok:
                rows.append({"product_id": line["product_id"], "requested": line["quantity"], "available": 0, "ok": False, "by_location": []})
                ok = False
                continue
            by_loc = free[tmpl.product_variant_id.id]
            available = int(max(0.0, sum(max(0.0, q) for q in by_loc.values())))
            line_ok = available >= line["quantity"]
            ok = ok and line_ok
            rows.append(
                {
                    "product_id": line["product_id"],
                    "requested": line["quantity"],
                    "available": available,
                    "ok": line_ok,
                    "by_location": [
                        {"location_id": self._public_id(loc_ext, loc_id), "quantity": int(max(0.0, q))} for loc_id, q in by_loc.items()
                    ],
                }
            )
        return ok, rows, templates

    @staticmethod
    def _parse_lines(raw):
        if not isinstance(raw, list) or not raw or len(raw) > MAX_LINES:
            return None
        merged = {}
        for item in raw:
            pid = item.get("product_id") if isinstance(item, dict) else None
            qty = item.get("quantity") if isinstance(item, dict) else None
            if not isinstance(pid, str) or not 1 <= len(pid) <= 64 or not isinstance(qty, int) or isinstance(qty, bool) or not 1 <= qty <= MAX_QTY:
                return None
            merged[pid] = merged.get(pid, 0) + qty
        return [{"product_id": pid, "quantity": min(qty, MAX_QTY)} for pid, qty in merged.items()]

    @http.route(f"{API}/availability", type="http", auth="public", methods=["POST"], csrf=False, save_session=False)
    def availability(self, **_kw):
        if not self._authorized():
            return _json({"error": "unauthorized"}, 401)
        try:
            body = request.get_json_data()
        except Exception:
            return _json({"error": "invalid json"}, 400)
        lines = self._parse_lines((body or {}).get("lines"))
        if lines is None:
            return _json({"error": "invalid lines"}, 400)
        ok, rows, _t = self._check_lines(request.env, lines)
        return _json({"ok": ok, "lines": rows})

    # ------------------------------------------------------------------ orders
    @http.route(f"{API}/orders", type="http", auth="public", methods=["POST"], csrf=False, save_session=False)
    def orders(self, **_kw):
        if not self._authorized():
            return _json({"error": "unauthorized"}, 401)
        try:
            body = request.get_json_data() or {}
        except Exception:
            return _json({"ok": False, "error": "invalid", "message": "invalid json"}, 400)

        ref = body.get("client_ref")
        customer = body.get("customer") or {}
        name = _clean(customer.get("name"), 80)
        phone = re.sub(r"[^\d+]", "", _clean(customer.get("phone"), 30))
        email = _clean(customer.get("email"), 120)
        lines = self._parse_lines(body.get("lines"))
        if not isinstance(ref, str) or not REF_RE.match(ref) or len(name) < 2 or not 7 <= len(re.sub(r"\D", "", phone)) <= 15 or lines is None or (email and not EMAIL_RE.match(email)):
            return _json({"ok": False, "error": "invalid", "message": "invalid order"}, 400)

        env = request.env
        Order = env["sale.order"].sudo()
        existing = Order.search([("client_order_ref", "=", ref), ("origin", "=", "shop-nextx.com")], limit=1)
        if existing:  # idempotent: the same key never creates a second order
            return _json({"ok": True, "order_name": existing.name, "order_id": existing.id, "reused": True})

        # Serialise concurrent orders for the same products so two buyers cannot both take the last unit.
        templates = self._resolve_templates(env, [l["product_id"] for l in lines])
        tmpl_ids = [t.id for t in templates.values() if t]
        if tmpl_ids:
            env.cr.execute("SELECT id FROM product_template WHERE id IN %s ORDER BY id FOR UPDATE", (tuple(tmpl_ids),))

        ok, rows, templates = self._check_lines(env, lines)
        if not ok:
            return _json({"ok": False, "error": "unavailable", "message": "not enough stock", "lines": rows}, 409)

        company = self._company(env)
        Partner = env["res.partner"].sudo()
        partner = Partner.search([("phone", "=", phone), ("company_id", "in", [company.id, False])], limit=1)
        if not partner:
            partner = Partner.create({"name": name, "phone": phone, "email": email or False, "company_id": company.id})

        note_parts = []
        pickup = _clean(body.get("pickup_location_id"), 64)
        if pickup:
            note_parts.append(f"Ophalen: {pickup}")
        if body.get("note"):
            note_parts.append(_clean(body.get("note"), 500))

        order = Order.create(
            {
                "partner_id": partner.id,
                "origin": "shop-nextx.com",
                "client_order_ref": ref,
                "note": "\n".join(note_parts) or False,
                "order_line": [
                    (0, 0, {"product_id": templates[l["product_id"]].product_variant_id.id, "product_uom_qty": l["quantity"]})
                    for l in lines
                ],
            }
        )
        order.action_confirm()  # reserves the stock; staff cancel it if the customer never collects
        # Reserve from the shop the customer will collect at, when that shop has the stock; otherwise keep Odoo's choice.
        _wh, shops = self._shop_locations(env, company)
        pickup_loc = self._resolve_location(env, pickup, shops)
        if pickup_loc:
            free_here = self._free_by_location(env, order.order_line.product_id, pickup_loc)
            if all(free_here[l.product_id.id].get(pickup_loc.id, 0.0) + l.qty_delivered >= l.product_uom_qty for l in order.order_line):
                for picking in order.picking_ids.filtered(lambda p: p.state not in ("done", "cancel")):
                    picking.do_unreserve()
                    picking.write({"location_id": pickup_loc.id})
                    picking.move_ids.write({"location_id": pickup_loc.id})
                    picking.action_assign()
        _logger.info("shop order %s created (%s lines)", order.name, len(lines))
        return _json({"ok": True, "order_name": order.name, "order_id": order.id, "reused": False})
