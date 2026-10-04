import { Component, onMounted, proxy, signal, useProps } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { scanBarcode } from "@web/core/barcode/barcode_dialog";
import { standardActionServiceProps } from "@web/webclient/actions/action_plugin";

const MODES = [
    { id: "lookup", label: "Opzoeken", hint: "Scan een product: prijs en voorraad per winkel." },
    { id: "count", label: "Tellen", hint: "Scan elk stuk dat je telt. De voorraad op de gekozen locatie wordt gezet op jouw telling." },
    { id: "transfer", label: "Verplaatsen", hint: "Scan wat naar een andere winkel gaat. Wordt een gewone interne verplaatsing." },
    { id: "receive", label: "Ontvangen", hint: "Kies een inkoop-ontvangst en scan wat er binnenkomt. Wat ontbreekt wordt een backorder." },
];

/**
 * Barcode screen for the shops (Community has no barcode app). Works with a USB/Bluetooth scanner, which types into
 * the focused field and presses Enter, and with the phone camera. All stock changes go through standard Odoo models.
 */
export class NextxScan extends Component {
    static template = "nextx_scan.Scan";
    props = useProps({ ...standardActionServiceProps });
    scanInput = signal.ref();
    modes = MODES;

    setup() {
        this.orm = useService("orm");
        this.state = proxy({
            mode: "lookup",
            message: null,
            busy: false,
            product: null,
            lines: [],
            locations: [],
            locationId: 0,
            destId: 0,
            receipts: [],
            receiptId: 0,
        });
        onMounted(async () => {
            this.state.locations = await this.orm.silent.call("nextx.scan", "locations", []);
            if (this.state.locations.length) {
                this.state.locationId = this.state.locations[0].id;
                this.state.destId = (this.state.locations[1] || this.state.locations[0]).id;
            }
            this.focus();
        });
    }

    get hint() {
        return MODES.find((m) => m.id === this.state.mode).hint;
    }

    get totalQty() {
        return this.state.lines.reduce((sum, line) => sum + line.qty, 0);
    }

    get canConfirm() {
        return !this.state.busy && this.state.lines.some((line) => line.qty > 0);
    }

    focus() {
        this.scanInput()?.focus();
    }

    say(type, text) {
        this.state.message = { type, text };
    }

    errorText(error) {
        return error?.data?.message || error?.message || "Er ging iets mis.";
    }

    async setMode(mode) {
        this.state.mode = mode;
        this.state.message = null;
        this.state.product = null;
        this.state.lines = [];
        this.state.receiptId = 0;
        if (mode === "receive") {
            await this.loadReceipts();
        }
        this.focus();
    }

    async loadReceipts() {
        this.state.receipts = await this.orm.silent.call("nextx.scan", "receipts", []);
    }

    selectReceipt(ev) {
        this.state.receiptId = parseInt(ev.target.value) || 0;
        const receipt = this.state.receipts.find((r) => r.id === this.state.receiptId);
        this.state.lines = receipt
            ? receipt.lines.map((l) => ({ product_id: l.product_id, name: l.name, barcode: l.barcode, demand: l.demand, qty: 0 }))
            : [];
    }

    setLocation(ev) {
        this.state.locationId = parseInt(ev.target.value);
    }

    setDest(ev) {
        this.state.destId = parseInt(ev.target.value);
    }

    onScanKeydown(ev) {
        if (ev.key === "Enter") {
            const code = ev.target.value;
            ev.target.value = "";
            this.handleCode(code);
        }
    }

    async openCamera() {
        try {
            const code = await scanBarcode(this.env);
            await this.handleCode(code);
        } catch (error) {
            this.say("error", this.errorText(error));
        }
    }

    async handleCode(raw) {
        const code = (raw || "").trim();
        if (!code) {
            return;
        }
        this.state.message = null;
        try {
            const product = await this.orm.silent.call("nextx.scan", "lookup", [code]);
            if (this.state.mode === "lookup") {
                this.state.product = product;
                return;
            }
            this.addProduct(product);
        } catch (error) {
            this.say("error", this.errorText(error));
        }
        this.focus();
    }

    addProduct(product) {
        const existing = this.state.lines.find((line) => line.product_id === product.id);
        if (existing) {
            existing.qty += 1;
        } else if (this.state.mode === "receive") {
            this.say("error", `${product.name} staat niet op deze ontvangst.`);
        } else {
            this.state.lines.push({ product_id: product.id, name: product.name, barcode: product.barcode, qty: 1 });
        }
    }

    changeQty(line, delta) {
        line.qty = Math.max(0, line.qty + delta);
    }

    setQty(line, ev) {
        line.qty = Math.max(0, parseFloat(ev.target.value) || 0);
    }

    removeLine(line) {
        const index = this.state.lines.indexOf(line);
        if (index >= 0) {
            this.state.lines.splice(index, 1);
        }
    }

    async confirm() {
        const lines = this.state.lines
            .filter((line) => line.qty > 0 || this.state.mode === "count")
            .map((line) => ({ product_id: line.product_id, qty: line.qty }));
        if (!lines.length) {
            return;
        }
        this.state.busy = true;
        try {
            const { mode, locationId, destId, receiptId } = this.state;
            if (mode === "count") {
                const rows = await this.orm.call("nextx.scan", "apply_count", [locationId, lines]);
                this.say("success", `Telling verwerkt: ${rows.length} product(en) bijgewerkt.`);
            } else if (mode === "transfer") {
                const res = await this.orm.call("nextx.scan", "transfer", [locationId, destId, lines]);
                this.say("success", `Verplaatst (${res.picking}).`);
            } else if (mode === "receive") {
                const res = await this.orm.call("nextx.scan", "receive", [receiptId, lines]);
                const back = res.backorders.length ? ` Backorder: ${res.backorders.join(", ")}.` : "";
                this.say("success", `Ontvangen (${res.picking}).${back}`);
                this.state.receiptId = 0;
                await this.loadReceipts();
            }
            this.state.lines = [];
        } catch (error) {
            this.say("error", this.errorText(error));
        } finally {
            this.state.busy = false;
            this.focus();
        }
    }
}

registry.category("actions").add("nextx_scan.scan", NextxScan);
