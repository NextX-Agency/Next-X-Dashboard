{
    "name": "NextX Reports",
    "version": "20.0.1.0.0",
    "summary": "Ready-made management reports: revenue per shop, bestsellers, stock per shop, web orders, purchases.",
    "description": """
Community Odoo has the data but no overview. This addon adds one 'Rapporten' app with ready-made pivot and graph
reports on standard report models, so the owner sees revenue and stock per shop without building filters. Margin is
left out on purpose until the product costs are confirmed.
""",
    "author": "NextX",
    "category": "Hidden",
    "license": "LGPL-3",
    "depends": ["point_of_sale", "sale", "purchase", "stock_account", "nextx_home"],
    "data": ["views/reports.xml"],
    "installable": True,
    "application": False,
    "auto_install": False,
}
