from odoo import models


class IrHttp(models.AbstractModel):
    _inherit = "ir.http"

    @classmethod
    def _post_dispatch(cls, response):
        """Odoo is the back office, not a public site: tell search engines never to index any of it.
        (The customer-facing shop is the Next.js storefront. The public Odoo login and /shop pages must not compete with it in search.)"""
        super()._post_dispatch(response)
        if response is not None and "X-Robots-Tag" not in response.headers:
            response.headers["X-Robots-Tag"] = "noindex, nofollow"
