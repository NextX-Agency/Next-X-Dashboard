{
    "name": "NextX Scan",
    "version": "20.0.1.0.0",
    "summary": "Barcode screen for shops: look up, count, move and receive stock with a scanner or the phone camera.",
    "description": """
Community Odoo has no barcode app (that is an Enterprise feature). This addon adds a small one on standard models only:
look up a product (price and stock per shop), count stock at a shop, move stock between shops (a normal internal
transfer), and receive a purchase order. Works with a USB/Bluetooth scanner (types into the field) and with the phone camera.
It also gives every product without a barcode a valid internal EAN-13, so labels can be printed straight away.
""",
    "author": "NextX",
    "category": "Inventory",
    "license": "LGPL-3",
    "depends": ["stock", "purchase", "nextx_home"],
    "data": ["views/scan_action.xml"],
    "assets": {
        "web.assets_backend": [
            "nextx_scan/static/src/scan/scan.js",
            "nextx_scan/static/src/scan/scan.xml",
            "nextx_scan/static/src/scan/scan.scss",
        ],
    },
    "installable": True,
    "application": False,
    "auto_install": False,
}
