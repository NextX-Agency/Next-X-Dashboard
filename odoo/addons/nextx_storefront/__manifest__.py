{
    "name": "NextX Storefront API",
    "version": "20.0.1.0.0",
    "summary": "Three narrow endpoints for the shop-nextx.com storefront: catalogue, live availability, web orders.",
    "description": """
The public NextX shop (Next.js on Vercel) talks to Odoo only through this addon.
It exposes exactly three endpoints under /nextx/store/v1, guarded by a bearer secret kept in the
system parameter `nextx_storefront.secret`. There is no generic model access, so a leaked secret
can read the published catalogue and create web orders, nothing else.
""",
    "author": "NextX",
    "category": "Website",
    "license": "LGPL-3",
    "depends": ["sale", "stock", "website_sale"],
    "data": [],
    "installable": True,
    "application": False,
    "auto_install": False,
}
