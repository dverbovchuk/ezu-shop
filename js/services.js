"use strict";
/* ===== Сервіси: кошик, формування замовлень, калькулятор ремонту ===== */

/** Позиція кошика: товар + варіант + кількість. */
class CartItem {
  constructor(product, variantIndex, quantity) {
    this.product = product; this.variantIndex = variantIndex; this.quantity = quantity;
  }
  get label() {
    const v = this.product.variants[this.variantIndex];
    return this.product.name + (v.label ? ` (${v.label})` : "");
  }
  get unitPrice() { return this.product.unitPrice(this.variantIndex, this.quantity); }
  get total() { const p = this.unitPrice; return p === null ? 0 : p * this.quantity; }
  get unitWord() { return Format.plural(this.quantity, this.product.unitForms); }
}

/** Кошик. Події: "change" (після будь-якої зміни), "limit" (перевищено максимум). */
class Cart extends EventEmitter {
  static MAX = 1000;
  #qty = new Map();
  #variant = new Map();
  constructor(catalog, storage) {
    super();
    this.catalog = catalog; this.storage = storage;
    const s = storage.load("cart", { c: {}, v: {} });
    for (const [id, vi] of Object.entries(s.v || {}))
      if (catalog.find(id)?.variants[+vi]) this.#variant.set(id, +vi);
    for (const [k, q] of Object.entries(s.c || {})) {
      const [id, vi] = k.split("|");
      if (catalog.find(id)?.variants[+vi] && q > 0) this.#qty.set(k, Math.min(Math.floor(q), Cart.MAX));
    }
  }
  #commit(data) {
    this.storage.save("cart", { c: Object.fromEntries(this.#qty), v: Object.fromEntries(this.#variant) });
    this.emit("change", data);
  }
  selected(id) { return this.#variant.get(id) || 0; }
  select(id, vi) { this.#variant.set(id, vi); this.#commit({ id }); }
  quantity(id, vi) { return this.#qty.get(`${id}|${vi}`) || 0; }
  setQuantity(id, vi, value) {
    let q = Math.max(0, Math.floor(+value || 0));
    if (q > Cart.MAX) { q = Cart.MAX; this.emit("limit", Cart.MAX); }
    q ? this.#qty.set(`${id}|${vi}`, q) : this.#qty.delete(`${id}|${vi}`);
    this.#commit({ id });
    return q;
  }
  change(id, vi, delta) { return this.setQuantity(id, vi, this.quantity(id, vi) + delta); }
  clear() { this.#qty.clear(); this.#commit({}); }
  get items() {
    return [...this.#qty].map(([k, q]) => {
      const [id, vi] = k.split("|");
      return new CartItem(this.catalog.find(id), +vi, q);
    });
  }
  get total() { return this.items.reduce((s, i) => s + i.total, 0); }
}

/** Абстрактний форматер замовлення; нащадки реалізують format() (поліморфізм). */
class OrderFormatter {
  format(items) { throw new Error("Метод format() потрібно перевизначити"); }
  static telegramLink(handle, text) { return `https://t.me/${handle}` + (text ? `?text=${encodeURIComponent(text)}` : ""); }
}
class PurchaseOrderFormatter extends OrderFormatter {
  format(items) {
    if (!items.length) return "";
    let total = 0, requests = 0;
    const lines = items.map(i => {
      const p = i.unitPrice;
      total += i.total;
      if (p === null) { requests++; return `• ${i.label} — ${i.quantity} ${i.unitWord} · ціна за запитом`; }
      return `• ${i.label} — ${i.quantity} ${i.unitWord} × ${p} 🍄 = ${i.total} 🍄`;
    });
    const extra = requests ? ` + ${requests} ${Format.plural(requests, ["позиція", "позиції", "позицій"])} за запитом` : "";
    return `Привіт! Хочу купити (сервер CIS):\n${lines.join("\n")}\n\nРазом: ${total} 🍄${extra}`;
  }
}
class ListOrderFormatter extends OrderFormatter {
  format(items) {
    return items.length
      ? "Привіт! Хочу замовити (сервер CIS). Ціну обговоримо в чаті:\n" +
        items.map(i => `• ${i.label} — ${i.quantity} ${i.unitWord}`).join("\n")
      : "";
  }
}

/** Спосіб оплати ремонту: `amount` ресурсу за `per` речей. */
class RepairPayment {
  constructor({ name, amount, per }) { this.name = name; this.amount = amount; this.per = per; }
  /** Мінімальна кількість речей, за яку оплата виходить цілою. */
  get step() {
    for (let i = 1; i <= 24; i++) if (Math.abs(this.amount * i / this.per - Math.round(this.amount * i / this.per)) < 1e-9) return i;
    return 1;
  }
  /** Скільки ресурсу потрібно за `items` речей (округлення вгору до 0,5). */
  cost(items) { return Math.ceil(this.amount * items / this.per * 2) / 2; }
}

/** Калькулятор «Швидкого ремонту». Подія "change". */
class RepairCalculator extends EventEmitter {
  static MAX = 1000;
  constructor(payments, storage) {
    super();
    this.payments = payments; this.storage = storage;
    const s = storage.load("repair", { n: 0, q: {} });
    this.count = Math.min(RepairCalculator.MAX, Math.max(0, Math.floor(+s.n) || 0));
    this.alloc = new Map(Object.entries(s.q || {}));
    this.#normalize();
  }
  get paid() { let t = 0; this.alloc.forEach(v => t += v); return t; }
  get remaining() { return this.count - this.paid; }
  quantity(name) { return this.alloc.get(name) || 0; }
  #normalize() {
    let left = this.count;
    for (const p of this.payments) {
      const q = Math.min(Math.floor(this.quantity(p.name) / p.step) * p.step, Math.floor(left / p.step) * p.step);
      q > 0 ? (this.alloc.set(p.name, q), left -= q) : this.alloc.delete(p.name);
    }
  }
  #commit() {
    this.#normalize();
    this.storage.save("repair", { n: this.count, q: Object.fromEntries(this.alloc) });
    this.emit("change");
  }
  setCount(v) { this.count = Math.min(RepairCalculator.MAX, Math.max(0, Math.floor(+v) || 0)); this.#commit(); }
  setQuantity(p, v) {
    const q = Math.max(0, Math.floor((Math.floor(+v) || 0) / p.step) * p.step);
    const cap = Math.floor(Math.max(0, this.count - (this.paid - this.quantity(p.name))) / p.step) * p.step;
    this.alloc.set(p.name, Math.min(q, cap));
    this.#commit();
  }
  fillRest(p) { this.setQuantity(p, this.quantity(p.name) + this.remaining); }
  reset() { this.count = 0; this.alloc.clear(); this.#commit(); }
  get request() {
    if (!this.paid) return "";
    const lines = this.payments.filter(p => this.quantity(p.name))
      .map(p => `• ${this.quantity(p.name)} шт — ${Format.num(p.cost(this.quantity(p.name)))} ${p.name}`);
    return `Привіт! Хочу швидкий ремонт (сервер CIS):\nПотрібно полагодити: ${this.count} шт\n${lines.join("\n")}` +
      (this.remaining > 0 ? `\n\nЩе не сплачено: ${this.remaining} шт` : "");
  }
}
