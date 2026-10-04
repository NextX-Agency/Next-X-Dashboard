from odoo import api, models
from odoo.exceptions import AccessError, UserError


def ean13_check_digit(first12):
    digits = [int(c) for c in first12]
    total = sum(d * (3 if i % 2 else 1) for i, d in enumerate(digits))
    return str((10 - total % 10) % 10)


def internal_ean13(product_id):
    """In-store EAN-13: prefix 20 is reserved for internal use, so it can never clash with a manufacturer code."""
    base = "20" + str(product_id).zfill(10)
    return base + ean13_check_digit(base)


class NextxScan(models.AbstractModel):
    _name = "nextx.scan"
    _description = "NextX barcode screen"

    # ------------------------------------------------------------------ helpers
    def _require_stock_user(self):
        if not self.env.user.has_group("stock.group_stock_user"):
            raise AccessError(self.env._("Je hebt geen rechten om voorraad te wijzigen."))

    def _product_from_code(self, code):
        code = (code or "").strip()
        if not code:
            return self.env["product.product"]
        Product = self.env["product.product"]
        return Product.search([("barcode", "=", code)], limit=1) or Product.search([("default_code", "=", code)], limit=1)

    def _shop_locations(self):
        """Leaf internal locations: the shops. The parent stock location only groups them."""
        return self.env["stock.location"].search([("usage", "=", "internal")], order="complete_name").filtered(
            lambda loc: not loc.child_ids.filtered(lambda child: child.usage == "internal")
        )

    def _stock_by_location(self, product):
        rows = {}
        for quant in self.env["stock.quant"].search([("product_id", "=", product.id), ("location_id.usage", "=", "internal")]):
            rows[quant.location_id.id] = rows.get(quant.location_id.id, 0.0) + quant.quantity
        return [
            {"location_id": loc.id, "location": loc.display_name, "quantity": rows.get(loc.id, 0.0)}
            for loc in self._shop_locations()
            if rows.get(loc.id)
        ]

    def _product_payload(self, product):
        return {
            "id": product.id,
            "name": product.display_name,
            "barcode": product.barcode or "",
            "price": product.lst_price,
            "currency": product.currency_id.name,
            "stock": self._stock_by_location(product),
        }

    # ------------------------------------------------------------------ public API (called from the screen)
    @api.model
    def locations(self):
        return [{"id": loc.id, "name": loc.display_name} for loc in self._shop_locations()]

    @api.model
    def lookup(self, code):
        product = self._product_from_code(code)
        if not product:
            raise UserError(self.env._("Onbekende barcode: %s", (code or "").strip()))
        return self._product_payload(product)

    @api.model
    def apply_count(self, location_id, lines):
        """Set the counted quantity of each product at one location. Returns what changed."""
        self._require_stock_user()
        location = self.env["stock.location"].browse(location_id)
        if not location.exists() or location.usage != "internal":
            raise UserError(self.env._("Kies een winkel of magazijnlocatie."))
        Quant = self.env["stock.quant"].with_context(inventory_mode=True)
        result = []
        for line in lines:
            product = self.env["product.product"].browse(line["product_id"])
            counted = float(line["qty"])
            quant = Quant.search([("product_id", "=", product.id), ("location_id", "=", location.id)], limit=1)
            before = quant.quantity if quant else 0.0
            if counted != before:
                quant = quant or Quant.create({"product_id": product.id, "location_id": location.id})
                quant.inventory_quantity = counted
                quant.action_apply_inventory()
            result.append({"name": product.display_name, "before": before, "after": counted})
        return result

    @api.model
    def transfer(self, source_id, dest_id, lines):
        """Move stock between two locations as a normal, validated internal transfer."""
        self._require_stock_user()
        Location = self.env["stock.location"]
        source, dest = Location.browse(source_id), Location.browse(dest_id)
        if not source.exists() or not dest.exists() or source == dest:
            raise UserError(self.env._("Kies twee verschillende locaties."))
        picking_type = self.env["stock.picking.type"].search([("code", "=", "internal")], limit=1)
        if not picking_type:
            raise UserError(self.env._("Interne verplaatsingen staan uit. Zet 'Interne transfers' aan bij Voorraad > Configuratie."))
        short = []
        for line in lines:
            product = self.env["product.product"].browse(line["product_id"]).with_context(location=source.id)
            if product.free_qty < float(line["qty"]):
                short.append(self.env._("%(name)s: nodig %(need)s, beschikbaar %(have)s", name=product.display_name, need=line["qty"], have=product.free_qty))
        if short:
            raise UserError(self.env._("Te weinig voorraad op %(loc)s:\n%(lines)s", loc=source.display_name, lines="\n".join(short)))
        picking = self.env["stock.picking"].create({
            "picking_type_id": picking_type.id,
            "location_id": source.id,
            "location_dest_id": dest.id,
            "origin": "NextX scan",
            "move_ids": [(0, 0, {
                "product_id": line["product_id"],
                "product_uom_qty": float(line["qty"]),
                "location_id": source.id,
                "location_dest_id": dest.id,
            }) for line in lines],
        })
        picking.action_confirm()
        picking.action_assign()
        for move in picking.move_ids:
            move.quantity = move.product_uom_qty
            move.picked = True
        picking.with_context(skip_backorder=True, skip_sms=True).button_validate()
        return {"picking": picking.name, "state": picking.state}

    @api.model
    def receipts(self):
        """Open receipts (purchase deliveries still to be received) with what is expected."""
        pickings = self.env["stock.picking"].search(
            [("picking_type_code", "=", "incoming"), ("state", "in", ("assigned", "confirmed", "waiting"))], order="scheduled_date, id"
        )
        return [{
            "id": picking.id,
            "name": picking.name,
            "partner": picking.partner_id.display_name or "",
            "origin": picking.origin or "",
            "lines": [{
                "product_id": move.product_id.id,
                "name": move.product_id.display_name,
                "barcode": move.product_id.barcode or "",
                "demand": move.product_uom_qty,
            } for move in picking.move_ids],
        } for picking in pickings]

    @api.model
    def receive(self, picking_id, lines):
        """Register scanned quantities on a receipt and validate it. What is not delivered becomes a backorder."""
        self._require_stock_user()
        picking = self.env["stock.picking"].browse(picking_id)
        if not picking.exists() or picking.picking_type_code != "incoming" or picking.state in ("done", "cancel"):
            raise UserError(self.env._("Deze ontvangst is niet meer open."))
        by_product = {move.product_id.id: move for move in picking.move_ids}
        for line in lines:
            move = by_product.get(line["product_id"])
            if not move:
                name = self.env["product.product"].browse(line["product_id"]).display_name
                raise UserError(self.env._("%(name)s staat niet op %(po)s.", name=name, po=picking.origin or picking.name))
            move.quantity = float(line["qty"])
            move.picked = True
        picking.with_context(skip_backorder=True, skip_sms=True).button_validate()
        backorders = self.env["stock.picking"].search([("backorder_id", "=", picking.id)])
        return {"picking": picking.name, "state": picking.state, "backorders": backorders.mapped("name")}

    # ------------------------------------------------------------------ maintenance
    @api.model
    def assign_internal_barcodes(self):
        """Idempotent: every product (variant) without a barcode gets its internal EAN-13."""
        products = self.env["product.product"].with_context(active_test=False).search([("barcode", "=", False)])
        for product in products:
            product.barcode = internal_ean13(product.id)
        return len(products)
