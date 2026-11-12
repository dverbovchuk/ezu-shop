"use strict";
/* ===== Точка входу: композиційний корінь застосунку ===== */

/** Керування темою оформлення: авто → світла → темна. */
class ThemeController {
  static MODES = ["auto", "light", "dark"];
  static ICONS = { auto: "🌗", light: "☀️", dark: "🌙" };
  constructor(button, storage) {
    this.button = button; this.storage = storage;
    this.index = Math.max(0, ThemeController.MODES.indexOf(storage.load("theme", "auto")));
    button.addEventListener("click", () => {
      this.index = (this.index + 1) % ThemeController.MODES.length;
      this.storage.save("theme", this.mode); this.apply();
    });
    this.apply();
  }
  get mode() { return ThemeController.MODES[this.index]; }
  apply() {
    const root = document.documentElement;
    this.mode === "auto" ? root.removeAttribute("data-theme") : root.setAttribute("data-theme", this.mode);
    this.button.textContent = ThemeController.ICONS[this.mode];
  }
}

class App {
  static TELEGRAM = "Kot2810";
  static PREFIX = "fb_";
  constructor() {
    const $ = id => document.getElementById(id);
    this.storage = new StorageService(App.PREFIX);
    this.catalog = Catalog.fromData(CATALOG_DATA);
    this.cart = new Cart(this.catalog, this.storage);
    this.repair = new RepairCalculator(REPAIR_DATA.map(d => new RepairPayment(d)), this.storage);
    this.nav = new NavView($("cat"), this.catalog);
    this.catalogView = new CatalogView($("main"), this.catalog, this.cart);
    this.cartView = new CartView($("cd"), this.cart, this.storage, App.TELEGRAM);
    this.repairView = new RepairView($("rep"), this.repair, App.TELEGRAM);
    this.theme = new ThemeController($("th"), this.storage);
    this.cur = { c: -1, b: -1 };
    this.$ = $;
  }
  select(c, b) {
    const $ = this.$; this.cur = { c, b };
    $("q").value = ""; this.catalogView.filter("");
    $("main").hidden = c === -2; $("rep").hidden = c !== -2; $("sortbar").hidden = c < 0;
    $("none").hidden = true;
    if (c !== -2) this.catalogView.show(c, b);
    this.nav.highlight(c, b);
    document.body.classList.remove("co");
    window.scrollTo({ top: 0 });
  }
  start() {
    const $ = this.$;
    this.nav.events.on("select", ({ c, b }) => this.select(c, b));
    $("q").addEventListener("input", e => {
      this.catalogView.show(-1, -1); $("main").hidden = false; $("rep").hidden = true; $("sortbar").hidden = true;
      $("none").hidden = this.catalogView.filter(e.target.value);
    });
    $("sortbar").addEventListener("click", e => {
      const b = e.target.closest("button");
      if (!b) return;
      this.storage.save("sort", b.dataset.s); this.catalogView.setSort(b.dataset.s); this.markSort();
      this.catalogView.show(this.cur.c, this.cur.b);
    });
    $("ct").addEventListener("click", () => $("cart").classList.toggle("open"));
    $("mb").addEventListener("click", () => document.body.classList.add("co"));
    $("ov").addEventListener("click", () => document.body.classList.remove("co"));
    $("pc").addEventListener("change", e => this.cartView.setShowPrices(e.target.checked));
    $("pc").checked = this.cartView.showPrices; this.cartView.setShowPrices(this.cartView.showPrices);
    const setH = () => document.documentElement.style.setProperty("--hh", document.querySelector("header").offsetHeight + "px");
    new ResizeObserver(setH).observe(document.querySelector("header")); setH();
    this.catalogView.setSort(this.storage.load("sort", "default")); this.markSort();
    this.select(location.hash === "#repair" ? -2 : -1, -1);
  }
  markSort() {
    const s = this.storage.load("sort", "default");
    this.$("sortbar").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.s === s));
  }
}
new App().start();
