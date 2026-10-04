{
    "name": "NextX Home Screen",
    "version": "20.0.1.0.0",
    "summary": "Full-screen home menu with app tiles for Odoo Community.",
    "description": """
Odoo Community opens apps from a small text dropdown. This addon adds the familiar full-screen grid of app icons:
the apps button in the top bar opens it, you can type to filter and press Enter to open the first match, and
internal users land on it after login. It is built on the standard menu service and changes no core code or data model.
""",
    "author": "NextX",
    "category": "Hidden",
    "license": "LGPL-3",
    "depends": ["web"],
    "data": ["views/home_menu.xml"],
    "post_init_hook": "post_init_hook",
    "assets": {
        "web.assets_backend": [
            "nextx_home/static/src/home_menu/home_menu.js",
            "nextx_home/static/src/home_menu/home_menu.xml",
            "nextx_home/static/src/home_menu/home_menu.scss",
            "nextx_home/static/src/home_menu/navbar_patch.js",
            "nextx_home/static/src/home_menu/navbar_patch.xml",
        ],
    },
    "installable": True,
    "application": False,
    "auto_install": False,
}
