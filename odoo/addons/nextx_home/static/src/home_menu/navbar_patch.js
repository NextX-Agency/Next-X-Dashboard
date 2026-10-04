import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { NavBar } from "@web/webclient/navbar/navbar";

// The apps button in the top bar opens the NextX home screen instead of the small text dropdown.
patch(NavBar.prototype, {
    setup() {
        super.setup(...arguments);
        this.nxActionService = useService("action");
    },

    openNextxHome() {
        this.nxActionService.doAction("nextx_home.action_home_menu", { clearBreadcrumbs: true });
    },
});
