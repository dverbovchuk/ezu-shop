"use strict";
/* ===== Представлення (View): кожен клас відповідає за свою частину інтерфейсу ===== */

/** Абстрактне представлення. Містить кореневий елемент і власний EventEmitter (композиція). */
class View {
  constructor(root) {
    if (new.target === View) throw new Error("View — абстрактний клас");
    this.root = root; this.events = new EventEmitter();
  }
  static el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  render() { throw new Error("Метод render() потрібно перевизначити"); }
}

/** Картка товару: підписується на кошик і оновлюється при змінах. */
class ProductCardView extends View {
  constructor(product, cart) {
    super(View.el("article", "card"));
    this.product = product; this.cart = cart; this.imgKey = "";
    this.root.dataset.name = product.name.toLowerCase();
    this.render();
    cart.on("change", () => this.update());
  }
  get variantIndex() { return this.cart.selected(this.product.id); }
  render() {
    const p = this.product;
    const chips = p.hasVariants
      ? `<div class="ch">${p.variants.map((v, i) => `<button type="button" data-i="${i}">${v.label}</button>`).join("")}</div>` : "";
    this.root.innerHTML = `<div class="ph"></div><h3>${p.name}</h3>${chips}<p class="ds">${p.description}</p>` +
      `<div class="pr"></div><div class="ws"></div><div class="st">` +
      `<button type="button" class="sb" data-a="-1" aria-label="Менше">−</button>` +
      `<input type="number" min="0" max="${Cart.MAX}" placeholder="0" aria-label="Кількість">` +
      `<button type="button" class="sb" data-a="1" aria-label="Більше">+</button></div><div class="sub"></div>`;
    this.input = this.root.querySelector("input");
    this.root.addEventListener("click", e => {
      const b = e.target.closest("button");
      if (!b) return;
      b.dataset.i !== undefined ? this.cart.select(p.id, +b.dataset.i) : this.cart.change(p.id, this.variantIndex, +b.dataset.a);
    });
    this.input.addEventListener("input", () => this.cart.setQuantity(p.id, this.variantIndex, this.input.value));
    this.input.addEventListener("blur", () => this.update());
    this.update();
  }
  update() {
    const p = this.product, vi = this.variantIndex, v = p.variants[vi], f = p.unitForms;
    const q = this.cart.quantity(p.id, vi), $ = s => this.root.querySelector(s);
    const key = v.images.join();
    if (key !== this.imgKey) {
      this.imgKey = key;
      $(".ph").className = "ph" + (v.images.length > 1 ? " q4" : "");
      $(".ph").innerHTML = v.images.map(src => `<img src="${src}" alt="${p.name}" loading="lazy" width="104" height="104">`).join("");
    }
    this.root.querySelectorAll(".ch button").forEach(b => b.classList.toggle("on", +b.dataset.i === vi));
    const base = p.basePriceOf(vi), w = v.pricing.wholesaleInfo, unit = p.showUnit ? ` за ${f[3]}` : "";
    $(".pr").innerHTML = base === null ? "<b>Ціна за запитом</b>" : `<b>${Format.money(base)}</b>${unit}`;
    $(".ws").hidden = !w;
    if (w) {
      $(".ws").textContent = `Опт від ${w.minQty} ${f[2]}: ${Format.money(w.price)}${unit}`;
      $(".ws").classList.toggle("on", q >= w.minQty);
    }
    const price = p.unitPrice(vi, q);
    $(".sub").textContent = !q ? "" : price === null ? `${q} ${Format.plural(q, f)} · ціна в чаті`
      : `${q} ${Format.plural(q, f)} × ${Format.money(price)} = ${Format.money(price * q)}`;
    this.root.classList.toggle("in", q > 0);
    if (document.activeElement !== this.input) this.input.value = q || "";
  }
}

/** Бічне меню категорій. Подія "select" {c, b}: -1 — усе, -2 — ремонт. */
class NavView extends View {
  constructor(root, catalog) {
    super(root); this.catalog = catalog; this.render();
    root.addEventListener("click", e => {
      const b = e.target.closest("[data-c]");
      if (!b) return;
      const li = b.closest(".ct");
      if (b.classList.contains("cb") && li.querySelector(".fly") && li.classList.contains("open")) return li.classList.remove("open");
      this.events.emit("select", { c: +b.dataset.c, b: +b.dataset.b });
    });
  }
  render() {
    const cats = this.catalog.categories;
    const item = (c, b, icon, name, n, extra = "") =>
      `<button data-c="${c}" data-b="${b}"${c >= 0 && b < 0 ? ' class="cb"' : ""}>` +
      (icon ? `<span class="ic">${icon}</span>` : "") + `<span class="cn">${name}</span><i>${n}</i>${extra}</button>`;
    let h = `<ul><li>${item(-1, -1, "❄️", "Усі товари", this.catalog.all.length)}</li>`;
    cats.forEach((c, ci) => {
      const multi = c.subcategories.length > 1;
      h += `<li class="ct">${item(ci, -1, c.icon, c.title, c.products.length, multi ? '<span class="chv">›</span>' : "")}`;
      if (multi) h += `<ul class="fly">${c.subcategories.map((s, bi) => `<li>${item(ci, bi, "", s.name, s.products.length)}</li>`).join("")}</ul>`;
      h += "</li>";
    });
    this.root.innerHTML = h + `<li>${item(-2, -1, "⚡", "Швидкий ремонт", "")}</li></ul><p class="sn">Оплата та видача через Telegram</p>`;
  }
  highlight(c, b) {
    this.root.querySelectorAll("button").forEach(x => x.classList.toggle("on", +x.dataset.c === c && +x.dataset.b === b));
    this.root.querySelectorAll(".ct").forEach((li, i) => {
      li.classList.toggle("act", i === c);
      if (i === c && li.querySelector(".fly")) li.classList.add("open"); else if (i !== c) li.classList.remove("open");
    });
  }
}

/** Каталог: секції → підгрупи → картки. Вміє фільтрувати, сортувати й показувати розділ. */
class CatalogView extends View {
  constructor(root, catalog, cart) {
    super(root); this.catalog = catalog; this.cart = cart; this.sort = "default"; this.render();
  }
  render() {
    this.root.innerHTML = "";
    this.catalog.categories.forEach(cat => {
      const multi = cat.subcategories.length > 1;
      const sec = View.el("section", "sec", `<h2>${cat.icon} ${cat.title}</h2>`);
      cat.subcategories.forEach((sub, bi) => {
        const wrap = View.el("div", "sg" + (multi ? "" : " one"), multi ? `<h3 class="sh">${sub.name}</h3>` : "");
        const grid = View.el("div", "grid");
        wrap.dataset.b = bi;
        sub.sorted(this.sort).forEach(p => grid.appendChild(new ProductCardView(p, this.cart).root));
        wrap.appendChild(grid); sec.appendChild(wrap);
      });
      this.root.appendChild(sec);
    });
  }
  setSort(mode) { this.sort = mode; this.render(); }
  show(c, b) {
    this.root.querySelectorAll(".sec").forEach((sec, i) => {
      sec.hidden = !(c < 0 || c === i);
      sec.querySelectorAll(".sg").forEach(w => w.hidden = !(c < 0 || b < 0 || +w.dataset.b === b));
    });
  }
  /** Повертає true, якщо знайдено хоча б одну картку. */
  filter(text) {
    const s = text.trim().toLowerCase();
    this.root.querySelectorAll(".card").forEach(c => c.hidden = !!s && !c.dataset.name.includes(s));
    let any = !s;
    this.root.querySelectorAll(".sg").forEach(w => w.hidden = !!s && !w.querySelector(".card:not([hidden])"));
    this.root.querySelectorAll(".sec").forEach(sec => {
      sec.hidden = !!s && !sec.querySelector(".sg:not([hidden])");
      if (!sec.hidden) any = true;
    });
    return any;
  }
}

/** Панель кошика у шапці. Формат замовлення залежить від режиму (стратегія форматера). */
class CartView extends View {
  constructor(root, cart, storage, telegram) {
    super(root); this.cart = cart; this.storage = storage; this.telegram = telegram;
    this.showPrices = storage.load("prices", true);
    this.render();
    cart.on("change", () => this.update());
    cart.on("limit", max => this.note(`Максимум ${max} за раз на один товар`));
    this.update();
  }
  get formatter() { return this.showPrices ? new PurchaseOrderFormatter() : new ListOrderFormatter(); }
  setShowPrices(on) { this.showPrices = on; this.storage.save("prices", on); document.body.classList.toggle("lm", !on); this.update(); }
  note(text) { this.$("#note").textContent = text; clearTimeout(this.t); this.t = setTimeout(() => this.$("#note").textContent = "", 3500); }
  $(s) { return this.root.querySelector(s); }
  render() {
    this.root.innerHTML = `<div id="ttl">Разом: <b id="tot"></b></div><p id="empty">Кошик порожній. Вкажіть кількість у картці товару або натисніть «+».</p>` +
      `<ul id="items"></ul><button type="button" id="clr" hidden>Очистити кошик</button>` +
      `<textarea id="ord" readonly rows="5" hidden></textarea><div class="acts">` +
      `<button type="button" class="btn" id="cp" style="background:transparent;color:var(--ac);border:1px solid var(--ac)">📋 Копіювати замовлення</button>` +
      `<a class="btn" id="buy" target="_blank" rel="noopener">Оформити в Telegram</a></div><div id="note" role="status"></div>`;
    this.$("#items").addEventListener("click", e => {
      const b = e.target.closest("button"), li = e.target.closest("li");
      if (!b) return;
      const { id, vi } = li.dataset, a = b.dataset.a;
      a === "x" ? this.cart.setQuantity(id, vi, 0) : this.cart.change(id, vi, a === "p" ? 1 : -1);
    });
    this.$("#clr").onclick = () => {
      if (confirm("Очистити кошик?")) { this.cart.clear(); this.note("Кошик очищено"); }
    };
    this.$("#cp").onclick = async () => {
      const t = this.formatter.format(this.cart.items);
      if (!t) return this.note("Кошик порожній. Додайте товари.");
      await Format.copy(t); this.note("Замовлення скопійовано в буфер обміну");
    };
    this.$("#buy").onclick = e => {
      const t = this.formatter.format(this.cart.items);
      if (!t) { e.preventDefault(); return this.note("Кошик порожній. Додайте товари."); }
      Format.copy(t); this.note(`Замовлення скопійовано. Якщо в чаті з @${this.telegram} поле порожнє — вставте текст.`);
    };
  }
  update() {
    const items = this.cart.items, text = this.formatter.format(items), total = this.cart.total;
    const requests = items.filter(i => i.unitPrice === null).length;
    this.$("#items").innerHTML = items.map(i => {
      const p = i.unitPrice;
      return `<li data-id="${i.product.id}" data-vi="${i.variantIndex}"><div class="nm">${i.label}<small>${i.quantity} ${i.unitWord}` +
        (p === null ? " · ціна в чаті" : ` × ${Format.money(p)}`) + `</small></div><div class="cs"><button type="button" data-a="m">−</button>` +
        `<span>${i.quantity}</span><button type="button" data-a="p">+</button></div><b class="ls">${p === null ? "в чаті" : Format.money(i.total)}</b>` +
        `<button type="button" class="rm" data-a="x" aria-label="Прибрати">✕</button></li>`;
    }).join("");
    this.$("#empty").hidden = items.length > 0; this.$("#clr").hidden = !items.length;
    this.$("#ord").hidden = !items.length; this.$("#ord").value = text;
    this.$("#tot").textContent = Format.money(total) + (requests ? " + за запитом" : "");
    this.$("#buy").textContent = this.showPrices ? "Оформити в Telegram" : "Список у Telegram";
    this.$("#buy").href = OrderFormatter.telegramLink(this.telegram, text);
    document.getElementById("cnt").textContent = items.length || "";
    document.getElementById("hs").textContent = total ? Format.money(total) + (requests ? "+" : "") : "";
  }
}

/** Розділ «Швидкий ремонт». */
class RepairView extends View {
  constructor(root, calc, telegram) {
    super(root); this.calc = calc; this.telegram = telegram;
    this.render(); calc.on("change", () => this.update()); this.update();
  }
  $(s) { return this.root.querySelector(s); }
  render() {
    this.root.innerHTML = `<section class="sec"><h2>⚡ Швидкий ремонт</h2>` +
      `<p class="ds rinfo">Віддаєте зламану річ + доплата — отримуєте цілу. Ціна за 1 річ. Можна платити кількома ресурсами: біля кожного вкажіть, за скільки речей ним платите.</p>` +
      `<div id="rtop"><label for="rn"><b>1. Скільки речей потрібно полагодити?</b></label><div class="st">` +
      `<button type="button" class="sb" data-a="m" aria-label="Менше">−</button><input id="rn" type="number" min="0" max="${RepairCalculator.MAX}" placeholder="0">` +
      `<button type="button" class="sb" data-a="p" aria-label="Більше">+</button><button type="button" id="rclr" class="rcl">🗑 Обнулити все</button></div>` +
      `<div id="rst" role="status"></div><div id="rbar"><i></i></div></div><p class="rh">2. Оберіть, чим і за скільки речей платите:</p>` +
      `<div class="rtw"><table id="rt"><tbody></tbody></table></div><div class="rbox"><div id="rtot"></div>` +
      `<textarea id="rord" readonly rows="5" hidden></textarea><div id="rnote" role="status"></div><div class="acts">` +
      `<button type="button" class="btn" id="rcp" style="background:transparent;color:var(--ac);border:1px solid var(--ac)">📋 Копіювати заявку</button>` +
      `<a class="btn" id="rbuy" target="_blank" rel="noopener">Заявка в Telegram</a></div></div></section>`;
    const things = n => Format.plural(n, ["річ", "речі", "речей"]);
    this.rows = this.calc.payments.map(p => {
      const tr = View.el("tr", "", `<td class="rn"><b>${p.name}</b><small>${Format.num(p.amount)} за ${p.per} ${things(p.per)}` +
        (p.step > 1 ? ` · лише по ${p.step} ${things(p.step)}` : "") + `</small><span class="rs"></span></td>` +
        `<td><div class="st"><button type="button" class="sb" data-a="m">−</button><input type="number" min="0" placeholder="0">` +
        `<button type="button" class="sb" data-a="p">+</button><button type="button" class="sb sa" data-a="a">Усі</button></div></td>`);
      const inp = tr.querySelector("input");
      tr.addEventListener("click", e => {
        const a = e.target.closest("button")?.dataset.a;
        if (a) a === "a" ? this.calc.fillRest(p) : this.calc.setQuantity(p, this.calc.quantity(p.name) + (a === "p" ? p.step : -p.step));
      });
      inp.addEventListener("input", () => this.calc.setQuantity(p, inp.value));
      inp.addEventListener("blur", () => this.update());
      this.$("#rt tbody").appendChild(tr);
      return { p, tr, inp };
    });
    const rn = this.$("#rn");
    rn.addEventListener("input", () => this.calc.setCount(rn.value));
    rn.addEventListener("blur", () => this.update());
    this.$("#rtop").addEventListener("click", e => {
      const a = e.target.closest("button")?.dataset.a;
      if (a === "m" || a === "p") this.calc.setCount(this.calc.count + (a === "p" ? 1 : -1));
    });
    this.$("#rclr").onclick = () => confirm("Обнулити все?") && this.calc.reset();
    this.$("#rcp").onclick = async () => {
      if (!this.calc.request) return this.$("#rnote").textContent = "Заявка порожня. Вкажіть кількість речей і виберіть оплату.";
      await Format.copy(this.calc.request); this.$("#rnote").textContent = "Заявку скопійовано в буфер обміну";
    };
    this.$("#rbuy").onclick = e => {
      if (!this.calc.request) { e.preventDefault(); this.$("#rnote").textContent = "Заявка порожня."; } else Format.copy(this.calc.request);
    };
  }
  update() {
    const c = this.calc, rem = c.remaining, paid = c.paid, $ = s => this.$(s);
    this.rows.forEach(({ p, tr, inp }) => {
      const q = c.quantity(p.name);
      tr.classList.toggle("in", q > 0);
      tr.querySelector('[data-a="p"]').disabled = rem < p.step;
      tr.querySelector('[data-a="a"]').disabled = rem < p.step;
      inp.disabled = !c.count && !q;
      tr.querySelector(".rs").textContent = q ? `→ ${Format.num(p.cost(q))} ${p.name}` : "";
      if (document.activeElement !== inp) inp.value = q || "";
    });
    $("#rst").className = c.count && rem === 0 ? "ok" : "";
    $("#rst").innerHTML = !c.count ? "Впишіть, скільки речей лагодите — потім обирайте оплату."
      : rem === 0 ? `✓ Усе сплачено: <b>${paid}</b> з ${c.count}` : `Сплачено: <b>${paid}</b> з ${c.count} · залишилось добрати: <b>${rem}</b>`;
    $("#rbar i").style.width = c.count ? Math.min(100, paid / c.count * 100) + "%" : "0";
    const parts = c.payments.filter(p => c.quantity(p.name)).map(p => `${Format.num(p.cost(c.quantity(p.name)))} ${p.name}`);
    $("#rtot").innerHTML = parts.length ? `До сплати: <b>${parts.join(" + ")}</b>` : "Поки що нічого не вибрано.";
    $("#rord").hidden = !c.request; $("#rord").value = c.request;
    $("#rclr").hidden = !paid && !c.count;
    if (document.activeElement !== $("#rn")) $("#rn").value = c.count || "";
    $("#rbuy").href = OrderFormatter.telegramLink(this.telegram, c.request);
  }
}
