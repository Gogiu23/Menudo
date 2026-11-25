// Comprobación de «Convertir en carta»: node src/app/canvas/menuConvert.check.mjs
import assert from "node:assert/strict";
import { convertToMenu } from "./menuConvert.ts";

let n = 0;
const t = (text, x, y, fontSize, italic = false) => ({ id: `t${n++}`, text, x, y, width: 100, fontSize, italic });
const texts = [
  t("Da Mario", 20, 20, 14),
  t("Cucina romana", 20, 40, 6, true),
  t("Primi", 20, 70, 8),
  t("Carbonara", 20, 85, 5),
  t("12,50 €", 160, 85.3, 5),
  t("Guanciale e pecorino", 20, 92, 4, true),
  t("Amatriciana", 20, 102, 5),
  t("11", 165, 102, 5),
  t("Secondi", 20, 125, 8),
  t("Saltimbocca", 20, 140, 5),
  t("18 €", 160, 140, 5),
  t("info@damario.it", 20, 280, 4),
  t("www.damario.it", 120, 280, 4),
  t("+39 06 1234 5678", 20, 288, 4),
];
const { menu, links } = convertToMenu(texts, 297);
assert.equal(menu.name, "Da Mario");
assert.equal(menu.subtitle, "Cucina romana");
assert.equal(menu.email, "info@damario.it");
assert.equal(menu.web, "www.damario.it");
assert.equal(menu.phone, "+39 06 1234 5678");
assert.deepEqual(menu.sections.map((s) => s.title), ["Primi", "Secondi"]);
assert.deepEqual(menu.sections[0].items, [
  { name: "Carbonara", desc: "Guanciale e pecorino", price: "12,50 €" },
  { name: "Amatriciana", desc: "", price: "11" },
]);
assert.deepEqual(menu.sections[1].items, [{ name: "Saltimbocca", desc: "", price: "18 €" }]);
assert.deepEqual(links.get("t4"), { f: "price", s: 0, i: 0 }); // 12,50 € → plato 0 de la sección 0
assert.equal(links.size, texts.length); // todos los textos quedan enlazados

// Platos sin ningún título de sección: una sección sin nombre
const plain = convertToMenu([t("Bar Luna", 20, 20, 12), t("Caffè", 20, 60, 5), t("1,20", 150, 60, 5)], 297).menu;
assert.deepEqual(plain.sections, [{ title: "", items: [{ name: "Caffè", desc: "", price: "1,20" }] }]);

// Página vacía
assert.deepEqual(convertToMenu([], 297).menu.sections, []);
console.log("menuConvert: ok");
