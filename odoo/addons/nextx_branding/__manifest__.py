{
    "name": "NextX Branding",
    "version": "20.0.1.0.0",
    "summary": "Minimal NextX branding for customer-facing Odoo documents and portal pages.",
    "author": "NextX",
    "category": "Website",
    "icon": "static/description/icon.png",
    "license": "LGPL-3",
    "depends": [
        "web",
        "mail",
        "account",
        "sale",
        "purchase",
        "stock",
        "point_of_sale",
        "website",
    ],
    "data": [
        "views/report_layout.xml",
        "views/pos_receipt.xml",
        "data/mail_templates.xml",
    ],
    "assets": {
        "web.report_assets_common": [
            "nextx_branding/static/src/css/nextx_reports.css",
        ],
        "web.assets_frontend": [
            "nextx_branding/static/src/css/nextx_portal.css",
        ],
    },
    "installable": True,
    "application": False,
    "auto_install": False,
}
