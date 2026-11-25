// Comprobación del enlace lienzo ↔ carta: node src/app/canvas/menuLink.check.mjs
import assert from "node:assert/strict";
import { okLink, pullLinks, pushLinks } from "./menuLink.ts";

const fmt = (r) => (r ? `${r} €` : "");
const t = (text, link) => ({ id: text, type: "text", text, link });
const menu = { name: "Da Mario", sections: [{ title: "Primi", items: [{ name: "Carbonara", desc: "", price: "12" }] }] };

// pull: la carta cambió → el texto se actualiza; si no cambió, mismas páginas
const pages = [[t("Da Mario", { f: "name", v: "Da Mario" }), t("12 €", { f: "price", s: 0, i: 0, v: "12 €" }), { id: "r", type: "rect" }]];
assert.equal(pullLinks(pages, menu, fmt), pages);
const pulled = pullLinks(pages, { ...menu, name: "Trattoria" }, fmt);
assert.equal(pulled[0][0].text, "Trattoria");
assert.equal(pulled[0][0].link.v, "Trattoria");
assert.equal(pulled[0][1], pages[0][1]); // lo que no cambió no se toca

// pull: un plato que ya no existe deja el texto como está
assert.equal(pullLinks(pages, { ...menu, sections: [] }, fmt)[0][1].text, "12 €");

// push: el texto cambió → se escribe en la carta (copia) y se actualiza v
const edited = [[t("Osteria", { f: "name", v: "Da Mario" }), t("14 €", { f: "price", s: 0, i: 0, v: "12 €" })]];
const r = pushLinks(edited, menu);
assert.equal(r.menu.name, "Osteria");
assert.equal(r.menu.sections[0].items[0].price, "14 €");
assert.equal(menu.name, "Da Mario"); // la original no se toca
assert.equal(r.pages[0][0].link.v, "Osteria");
assert.equal(pushLinks(pages, menu), null); // nada cambiado
assert.equal(pushLinks(edited, null), null); // sin carta guardada

// okLink: descarta enlaces dañados
assert.deepEqual(okLink({ f: "item", s: 1, i: 2, v: "x" }), { f: "item", s: 1, i: 2, v: "x" });
assert.equal(okLink({ f: "item", s: 1, v: "x" }), undefined);
assert.equal(okLink({ f: "otro", v: "x" }), undefined);
assert.equal(okLink(null), undefined);
console.log("menuLink: ok");
