# Návod — Plánovač rozjezdů

## 1. Otevření a okno

**Okno se otevírá přes neutrálku:** klikni v mapě na neutrální zem a vlevo na její
stránce, pod údaji o zemi, klikni na **Rozjezd ⇶**. Jinde tlačítko není. Okno se otevře
nad mapou (mapa musí být otevřená) a zůstane tam, i když vlevo klikáš na další země.

- **Posunout:** chyť lištu s názvem. Okno jde vystrčit i za okraj, vidět zůstane kousek lišty.
- **Šířka:** táhni za levý nebo pravý okraj. Od zhruba 1340 px se nastavení a souhrn
  přesunou do panelu vpravo a okno je nižší.
- **—** = malé okno na výšku (jen země a jednotky), **❐** = sbalit do jednoho řádku,
  **✕** = zavřít.
- **✎** = vlastní zadání (kapitola 8).

Nahoře je název podle tvaru rozjezdu (počet zemí po každém dni) a stav: **✓ vychází**
nebo **⚠ počet chyb**.

## 2. Struktura rozjezdu

- **struktura**: předvolby 1 › 4 › 6 › 8, 2 › 6 › 10, 2 › 5 › 7 a tvoje uložené (★).
  Země zdrojů zůstanou, cíle se vyprázdní.
- **dny − / +**: kolik sloupců (dnes / zítra / pozítří).
- **+ zdroj**: další tvoje země, ze které se dnes útočí. **+ útok** u zdroje: další útok dnes.
- **uložit**: uloží tvar (bez zemí a čísel) pod jeho názvem.

Každý řádek je jedna cesta: **dnes ▶ zítra ▶ pozítří**. Na kartě dnešního útoku je
**dál: útočí dál** (zítra útočí celé vojsko z dobyté země) nebo **přeposílá** (vojsko
z dobyté země se rozdělí do zítřejších útoků ostatních cest).

## 3. Výběr cílů

- **roletka** u karty nabízí sousední neutrálky země, ze které se útočí, od nejslabší;
- **⊕** vloží neutrálku, na které vlevo zrovna stojíš.

**potřeba** je potřebný útok: dnes přesně z mapy, zítra a pozítří odhad (neutrálka
denně přiroste nejvýš o +18 obrany a 1 obyvatele, počítá se nejhorší případ). Když
skutečné číslo znáš, napiš ho do políčka **ručně**.

## 4. Karta útoku

- **útok**: jednotky 1., 2. a 3. stupně; **H** = jde s ním hrdina (pokračuje s ním
  i další dny), **R** = rytíř (×1,1); **max** = všechno, co ve zdroji zbývá.
- **+ přesun**: přesun bokem do té země. Boje se neúčastní a zítra je tam celý.
- **síla**: ✓ stačí / ✗ chybí, **padne**: ztráty.
- **(+N)** pod útokem: kolik jednotek toho stupně chybí. Klik je přidá (zítra do
  přesunu bokem). Šedé = odtud už to poslat nejde.
- U Nekromantů je navíc vidět, kolik zombie vstane. Plán s nimi nepočítá, jsou to
  rezervy navíc.

## 5. Víc zdrojů

- **přesun i jinam** u zdroje: jeho vojsko smí jít přesunem bokem i do útoků ostatních
  zdrojů (v jejich kartách přibude řádek **+ z …**). Navrhni pak vyrovnává vojsko
  mezi zeměmi.
- **Zdroj, který jen posílá**: když u něj nevybereš cíl, karta ukáže, kolik pošle
  do kterého útoku, a co zůstane doma. Když odejde všechno, má zelený rámeček a 🔒.

## 6. Navrhni

- **verbovat 1 2 3**: ze kterých jednotek smí verbovat. Hlavní je zaškrtnutá dvojka nebo
  trojka s vyšším útokem, jedničky dorovnají.
- Navrhni naverbuje **jen tolik, kolik je potřeba**, aby všechno prošlo. Pak hledá
  rozdělení s co nejmenšími ztrátami (trojka je dražší než všechny dvojky, dvojka než
  všechny jedničky).
- **Budget rozjezd**: co nejméně rytířů.
- **Max verb**: naverbuje, co limit a rozpočet dovolí (třeba před střetem s nepřítelem).
- Přebytečné vojsko jde za hrdinou.
- Když útok nevyjde ani tak a s žádným útokem nejde hrdina, Navrhni napíše jen
  „použij hrdinu".

Cíle, hrdinu a „přeposílá" Navrhni nemění. Na stejné zadání dá vždy stejný plán.

## 7. Verb, domy, rozpočet

- **Naverbovat**: kolik a za kolik zlata a many.
- **Podrobnosti** (rozbalit): po zemích vojsko doma, verb, limit verbu po kolech,
  domy a kolik dokoupit.
- **Kol do verbu**: kolik kol odehraješ před verbem (obyvatelé přibudou). Prázdné =
  zbývající kola dnes.
- **Rozpočet**: kolik zlata (verb i domy) a many můžeš dnes dát. Prázdné = nehlídá se.

## 8. Vlastní zadání ✎

Pro výpočet za někoho jiného: rasa, hrdina, zdroje (vojsko doma a limit verbu číslem)
a místo neutrálky jde zadat jen **PÚ dnes** a bonus obrany. Plán vlastního zadání se
ukládá zvlášť. Druhým klikem na ✎ se vrátíš ke svému.

## 9. Export

**export** zkopíruje celý plán do schránky jako text v rámečcích (pro Discord v bloku
```). U každého útoku síla, potřeba, ztráty, H a R.

## 10. Vyplnění útoku na stránce Vojsko

Otevři **Vojsko** země, ze které útočíš. Nad řádkem „vojsko dorazí do cíle o půlnoci"
jsou kroky plánu z téhle země (dnešní útoky, přesuny bokem, zítřejší útok vším
z dobyté země). **Klik** vyplní jednotky, rytíře, hrdinu, cíl i typ akce.
**Odeslat vojsko** klikáš sám.

- šedý krok = cíl není mezi zeměmi, kam z téhle země jde poslat vojsko,
- ✓ … odesláno = ten útok už letí.

## 11. Odeslané útoky a další den

- V záhlaví karty: **✓ 66** síla letícího útoku (červeně, když nestačí), **✓ přesun**,
  **○ útok** = dnešní útok ještě neodešel.
- **🔒** odeslaný krok: čísla jsou pevná, Navrhni na ně nesáhne a vojsko se nepočítá
  doma. Klik na 🔒 odemkne (na dnešní den).
- Druhý den jsou kroky dne 0 „hotovo 🔒" a plánuje se dál od zítřka. Plán připravený
  večer dopředu se po přepočtu nezamkne, dokud z něj nic neodejde.
