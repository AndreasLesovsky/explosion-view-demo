// =====================================================================
// bestellliste.js – Merkliste der gewählten Ersatzteile: Zustand, Popup (<dialog>) und der
// Knopf in der Kopfzeile. Teile aus beiden Modellen liegen nebeneinander; dasselbe Teil noch
// einmal hinzugefügt erhöht die Menge. Lebt nur für die Sitzung: Demonstrator ohne Konto und
// ohne Warenkorb im Shop, die Übergabe an den Shop bleibt ein Platzhalter (SHOP_BASE).
// =====================================================================

import { MODELLE, SHOP_BASE } from './modelle.js';

const schluessel = (modellId, name) => `${modellId}/${name}`;

export class Bestellliste {
  /**
   * @param {object} o
   * @param {HTMLDialogElement} o.dialog   das Popup
   * @param {HTMLButtonElement} o.knopf    Öffnen-Knopf in der Kopfzeile
   * @param {HTMLElement} o.zaehler        Zähler im Knopf
   * @param {HTMLElement} o.liste          <ul> im Popup
   * @param {HTMLElement} o.leer           Hinweis bei leerer Liste
   * @param {HTMLElement} o.summe          Zeile "3 Teile"
   * @param {HTMLButtonElement} o.schliessen
   * @param {HTMLButtonElement} o.leeren
   * @param {HTMLAnchorElement} o.shop     Übergabe an den Shop
   * @param {(liste: Bestellliste) => void} [o.onChange]  nach jeder Änderung des Inhalts
   */
  constructor(o) {
    this.els = o;
    this.onChange = o.onChange || (() => {});
    /** @type {Map<string, {modellId:string, name:string, menge:number}>} in Einfügereihenfolge */
    this.eintraege = new Map();

    o.knopf.addEventListener('click', () => this.oeffnen());
    o.schliessen.addEventListener('click', () => this.schliessen());
    o.leeren.addEventListener('click', () => this.leeren());
    // Klick auf den abgedunkelten Hintergrund schließt: das Popup selbst ist ohne Polsterung,
    // ein Klick, der das <dialog> und kein Kind trifft, liegt also außerhalb der Karte.
    o.dialog.addEventListener('click', (e) => { if (e.target === o.dialog) this.schliessen(); });
    o.liste.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const key = btn.closest('li').dataset.key;
      const eintrag = this.eintraege.get(key);
      if (!eintrag) return;
      if (btn.dataset.act === 'plus') this.setzeMenge(key, eintrag.menge + 1);
      else if (btn.dataset.act === 'minus') this.setzeMenge(key, eintrag.menge - 1);
      else this.entfernen(key);
    });
    o.shop.href = SHOP_BASE;
    this.render();
  }

  get offen() { return this.els.dialog.open; }

  /** Stückzahl eines Teils in der Liste (0, wenn nicht enthalten). */
  menge(modellId, name) {
    const e = this.eintraege.get(schluessel(modellId, name));
    return e ? e.menge : 0;
  }

  /** Summe aller Stückzahlen (Zähler im Kopf). */
  anzahl() {
    let n = 0;
    for (const e of this.eintraege.values()) n += e.menge;
    return n;
  }

  /** Teil hinzufügen; ist es schon drin, erhöht sich die Menge. Gibt die neue Menge zurück. */
  hinzufuegen(modellId, name) {
    const key = schluessel(modellId, name);
    const e = this.eintraege.get(key);
    if (e) e.menge += 1;
    else this.eintraege.set(key, { modellId, name, menge: 1 });
    this.geaendert();
    return this.eintraege.get(key).menge;
  }

  setzeMenge(key, menge) {
    const e = this.eintraege.get(key);
    if (!e) return;
    if (menge < 1) { this.entfernen(key); return; }
    e.menge = Math.min(99, menge);
    this.geaendert();
  }

  entfernen(key) {
    if (this.eintraege.delete(key)) this.geaendert();
  }

  leeren() {
    if (!this.eintraege.size) return;
    this.eintraege.clear();
    this.geaendert();
  }

  oeffnen() {
    if (!this.els.dialog.open) this.els.dialog.showModal();
  }

  schliessen() {
    if (this.els.dialog.open) this.els.dialog.close();
  }

  geaendert() {
    this.render();
    this.onChange(this);
  }

  render() {
    const { knopf, zaehler, liste, leer, summe, leeren, shop } = this.els;
    const n = this.anzahl();
    const positionen = this.eintraege.size;

    zaehler.textContent = String(n);
    zaehler.hidden = n === 0;
    knopf.setAttribute('aria-label', n ? `Bestellliste, ${n} ${n === 1 ? 'Teil' : 'Teile'}` : 'Bestellliste, leer');

    leer.hidden = positionen > 0;
    liste.hidden = positionen === 0;
    summe.textContent = positionen ? `${n} ${n === 1 ? 'Teil' : 'Teile'} in ${positionen} ${positionen === 1 ? 'Position' : 'Positionen'}` : '';
    leeren.hidden = positionen === 0;
    shop.setAttribute('aria-disabled', String(positionen === 0));
    shop.tabIndex = positionen ? 0 : -1;

    liste.innerHTML = '';
    for (const [key, e] of this.eintraege) {
      const m = MODELLE[e.modellId];
      const t = (m && m.teile[e.name]) || {};
      const label = t.label || e.name;
      const li = document.createElement('li');
      li.className = 'cart__row';
      li.dataset.key = key;
      li.innerHTML =
        '<div class="cart__text"><b class="cart__label"></b><span class="cart__info"></span><span class="cart__meta"></span></div>'
        + '<div class="cart__menge" role="group"><button type="button" data-act="minus">−</button>'
        + '<output></output><button type="button" data-act="plus">+</button></div>'
        + '<button class="cart__remove" type="button" data-act="remove">'
        + '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" '
        + 'stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>';
      li.querySelector('.cart__label').textContent = label;
      li.querySelector('.cart__info').textContent = t.info || '';
      li.querySelector('.cart__meta').textContent = m ? m.scanZeile : e.modellId;
      li.querySelector('.cart__menge').setAttribute('aria-label', `Menge ${label}`);
      li.querySelector('[data-act="minus"]').setAttribute('aria-label', `${label}: Menge verringern`);
      li.querySelector('[data-act="plus"]').setAttribute('aria-label', `${label}: Menge erhöhen`);
      li.querySelector('output').textContent = String(e.menge);
      li.querySelector('.cart__remove').setAttribute('aria-label', `${label} entfernen`);
      liste.appendChild(li);
    }
  }
}
