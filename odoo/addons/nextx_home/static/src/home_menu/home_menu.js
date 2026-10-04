import { Component, onMounted, signal, useProps } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { standardActionServiceProps } from "@web/webclient/actions/action_plugin";

/**
 * Full-screen home menu: one tile per installed app, type to filter, Enter opens the first match.
 * Built only on the standard menu service, so it follows whatever apps and access rights the user has.
 */
export class NextxHomeMenu extends Component {
    static template = "nextx_home.HomeMenu";
    props = useProps({ ...standardActionServiceProps });
    searchInput = signal.ref();

    setup() {
        this.menuService = useService("menu");
        this.query = signal("");
        onMounted(() => this.searchInput()?.focus());
    }

    get apps() {
        const query = this.query().trim().toLowerCase();
        return this.menuService
            .getApps()
            .filter((app) => !query || (app.name || "").toLowerCase().includes(query));
    }

    iconName(app) {
        return app.webIcon ? app.webIcon.split(",")[0] : "";
    }

    iconColor(app) {
        return app.webIcon ? app.webIcon.split(",")[1] : "";
    }

    openApp(app) {
        this.menuService.selectMenu(app);
    }

    onKeydown(ev) {
        if (ev.key === "Enter") {
            const first = this.apps[0];
            if (first) {
                this.openApp(first);
            }
        }
    }
}

registry.category("actions").add("nextx_home.home_menu", NextxHomeMenu);
