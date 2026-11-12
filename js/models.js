"use strict";
/* ===== Предметна область: товари, категорії, каталог ===== */

/** Варіант товару (наприклад, «Легкий / Середній / Важкий»). */
class ProductVariant {
  constructor(raw, parent) {
    this.label = raw.label ?? null;
    this.images = raw.images || parent.images;
    this.pricing = PricingFactory.create(raw.price ?? parent.basePrice, raw.wholesale ?? parent.wholesale);
  }
}

/** Абстрактний товар. Нащадки задають одиницю виміру (поліморфізм). */
class Product {
  #variants;
  constructor(raw) {
    if (new.target === Product) throw new Error("Product — абстрактний клас");
    this.id = raw.id;
    this.name = raw.name;
    this.description = raw.description;
    this.basePrice = raw.price;
    this.wholesale = raw.wholesale;
    this.images = raw.images || [];
    this.#variants = (raw.variants || [{}]).map(v => new ProductVariant(v, this));
  }
  get variants() { return this.#variants; }
  get hasVariants() { return this.#variants[0].label !== null; }
  /** Форми одиниці: [1, 2–4, 5+, знахідний]. */
  get unitForms() { throw new Error("Метод unitForms потрібно перевизначити"); }
  get showUnit() { return true; }
  basePriceOf(vi) { return this.#variants[vi].pricing.base; }
  /** Ціна за одиницю з урахуванням оптової стратегії; null — «ціна за запитом». */
  unitPrice(vi, qty) { return this.#variants[vi].pricing.unitPrice(qty); }
}
class StackProduct extends Product {
  get unitForms() { return ["стак", "стаки", "стаків", "стак"]; }
  get showUnit() { return false; }
}
class SetProduct extends Product {
  get unitForms() { return ["комплект", "комплекти", "комплектів", "комплект"]; }
}
class PieceProduct extends Product {
  get unitForms() { return ["штука", "штуки", "штук", "штуку"]; }
}
class CoffinProduct extends Product {
  get unitForms() { return ["труна", "труни", "трун", "труну"]; }
}

/** Патерн «Фабрична функція»: створює потрібний підклас за кодом одиниці. */
class ProductFactory {
  static #types = { set: SetProduct, piece: PieceProduct, coffin: CoffinProduct };
  static create(raw) { return new (ProductFactory.#types[raw.unit] || StackProduct)(raw); }
}

class Subcategory {
  constructor(name, products) { this.name = name; this.products = products; }
  /** Копія списку, впорядкована за ціною: "default" | "asc" | "desc". */
  sorted(mode) {
    if (mode === "default") return this.products;
    const k = mode === "asc" ? 1 : -1;
    return [...this.products].sort((a, b) => {
      const x = a.basePriceOf(0), y = b.basePriceOf(0);
      return x === null ? (y === null ? 0 : 1) : y === null ? -1 : k * (x - y);
    });
  }
}
class Category {
  constructor(title, icon, subcategories) { this.title = title; this.icon = icon; this.subcategories = subcategories; }
  get products() { return this.subcategories.flatMap(s => s.products); }
}

/** Каталог: агрегує категорії, дає пошук за id (Map) і побудову з даних. */
class Catalog {
  #index;
  constructor(categories) {
    this.categories = categories;
    this.#index = new Map(this.all.map(p => [p.id, p]));
  }
  get all() { return this.categories.flatMap(c => c.products); }
  find(id) { return this.#index.get(id); }
  static fromData(data) {
    return new Catalog(data.map(c => new Category(c.title, c.icon,
      c.subcategories.map(s => new Subcategory(s.name, s.items.map(raw => ProductFactory.create(raw)))))));
  }
}
