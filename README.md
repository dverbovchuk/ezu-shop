# Frostborn Shop — об’єктно-орієнтований вебзастосунок (курсова робота)

Каталог товарів гри з кошиком, оптовими цінами, калькулятором «Швидкий ремонт» і формуванням замовлення для Telegram.

## Запуск
Відкрийте `index.html` у браузері (сервер не потрібен).

## Структура
- `index.html` — розмітка сторінки
- `css/styles.css` — стилі
- `data/catalog.js`, `data/repair.js` — дані каталогу та прайсу ремонту (без логіки)
- `js/core.js` — EventEmitter, Format, StorageService, цінові стратегії
- `js/models.js` — Product та нащадки, ProductFactory, Catalog, Category
- `js/services.js` — Cart, OrderFormatter та нащадки, RepairCalculator
- `js/views.js` — класи представлень (View та нащадки)
- `js/app.js` — App, ThemeController (точка входу)
- `assets/img/` — зображення товарів
