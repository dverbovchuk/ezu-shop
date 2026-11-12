"use strict";
/* ===== Ядро: допоміжні класи (Observer, форматування, сховище, цінові стратегії) ===== */

/** Патерн «Спостерігач»: базовий клас для об’єктів, що повідомляють про зміни. */
class EventEmitter {
  #handlers = new Map();
  on(event, fn) {
    if (!this.#handlers.has(event)) this.#handlers.set(event, []);
    this.#handlers.get(event).push(fn);
    return this;
  }
  emit(event, data) { (this.#handlers.get(event) || []).forEach(fn => fn(data)); }
}

/** Статичні утиліти форматування. */
class Format {
  static money(n) { return n.toLocaleString("uk-UA") + " 🍄"; }
  static num(n) { return String(n).replace(".", ","); }
  /** Відмінювання за числом: forms = [1, 2–4, 5+]. */
  static plural(n, forms) {
    const a = n % 100, b = n % 10;
    return a > 10 && a < 20 ? forms[2] : b === 1 ? forms[0] : b > 1 && b < 5 ? forms[1] : forms[2];
  }
  static async copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = Object.assign(document.createElement("textarea"), { value: text });
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
  }
}

/** Інкапсуляція роботи з localStorage (з обробкою помилок). */
class StorageService {
  constructor(prefix) { this.prefix = prefix; }
  load(key, fallback) {
    try { const v = localStorage.getItem(this.prefix + key); return v === null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  }
  save(key, value) {
    try { localStorage.setItem(this.prefix + key, JSON.stringify(value)); } catch { /* сховище недоступне */ }
  }
}

/** Патерн «Стратегія»: абстрактний спосіб обчислення ціни за одиницю. */
class PricingStrategy {
  constructor(base) {
    if (new.target === PricingStrategy) throw new Error("PricingStrategy — абстрактний клас");
    this.base = base;
  }
  unitPrice(qty) { throw new Error("Метод unitPrice() потрібно перевизначити"); }
  get wholesaleInfo() { return null; }
}
class RetailPricing extends PricingStrategy {
  unitPrice() { return this.base; }
}
class WholesalePricing extends PricingStrategy {
  constructor(base, minQty, price) { super(base); this.minQty = minQty; this.price = price; }
  unitPrice(qty) { return qty >= this.minQty ? this.price : this.base; }
  get wholesaleInfo() { return { minQty: this.minQty, price: this.price }; }
}
/** Патерн «Фабрика»: підбирає стратегію ціноутворення. */
class PricingFactory {
  static create(base, wholesale) {
    return wholesale ? new WholesalePricing(base, wholesale[0], wholesale[1]) : new RetailPricing(base);
  }
}
