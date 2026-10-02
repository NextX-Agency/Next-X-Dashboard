{
    "name": "NextX Operations",
    "version": "20.0.1.0.0",
    "summary": "Small operational fixes so NextX sellers can work with standard Odoo.",
    "description": """
Odoo 20 computes the cost of an outgoing stock move by reading landed-cost lines
(stock.move._get_landed_cost) without elevated rights, while only Stock Managers may read those
models. A seller completing a POS sale of a product that carries landed cost therefore hits an
AccessError. This addon grants every internal user READ-ONLY access to the three landed-cost models.
Nothing can be created, edited or deleted through it.
""",
    "author": "NextX",
    "category": "Inventory",
    "license": "LGPL-3",
    "depends": ["stock_landed_costs", "point_of_sale"],
    "data": ["security/ir.access.csv"],
    "installable": True,
    "application": False,
    "auto_install": False,
}
