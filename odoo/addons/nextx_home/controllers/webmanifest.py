from odoo.addons.web.controllers.webmanifest import WebManifest


class NextxWebManifest(WebManifest):
    """Installable NextX app on a phone: own name, colours and icon instead of Odoo's."""

    def _get_webmanifest(self):
        manifest = super()._get_webmanifest()
        manifest.update({
            "name": manifest.get("name") or "NextX",
            "short_name": "NextX",
            "background_color": "#111111",
            "theme_color": "#111111",
            "icons": [
                {"src": f"/nextx_home/static/img/nextx-icon-{size}.png", "sizes": f"{size}x{size}", "type": "image/png", "purpose": "any"}
                for size in (192, 512)
            ],
        })
        return manifest
