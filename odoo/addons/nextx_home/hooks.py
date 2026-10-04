def post_init_hook(env):
    """Land every internal user on the NextX home screen after login (new users too)."""
    action = env.ref("nextx_home.action_home_menu")
    users = env["res.users"].with_context(active_test=False).search([("share", "=", False)])
    users.write({"action_id": action.id})
    env["ir.default"].set("res.users", "action_id", action.id)
