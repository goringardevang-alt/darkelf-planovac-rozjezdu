# Dark Elf — Plánovač rozjezdů

Userscript pro [darkelf.cz](https://www.darkelf.cz). Naplánuje rozjezd, tedy dobývání
neutrálek na **dnes, zítra a pozítří** z jedné i víc tvých zemí: kolik vojska poslat
do kterého útoku, co přesunout bokem, kdo přeposílá, kolik naverbovat a kolik to
bude stát. Tlačítkem **Navrhni** to rozpočítá sám, s co nejmenším verbem
a ztrátami.

> **Otevírá se přes neutrálku.** Klikni v mapě na neutrální zem a vlevo na její
> stránce, pod údaji o zemi, najdeš tlačítko **Rozjezd ⇶**. Jinde tlačítko není.
> Okno se pak kreslí nad mapu, takže mapa musí být otevřená.

- struktura rozjezdu na klik (1 › 4 › 6 › 8, 2 › 6 › 10, 2 › 5 › 7 nebo vlastní, dá se uložit),
- víc zdrojových zemí, přesuny mezi nimi, přeposílky do zítřejších útoků,
- odhad síly neutrálky na zítřek a pozítří (počítá s nejhorším růstem),
- limit verbu po kolech, domy, rozpočet zlata a many,
- **Navrhni**: nejmenší verb, nejmenší ztráty (trojky > dvojky > jedničky), volitelně co nejméně rytířů,
- u každé zdrojové země zvlášť, co v ní smí vzniknout (dvojky chtějí Cech války, trojky Cech magie),
- hlídá, kam se vojsko vůbec dostane: sousedi a přes volný průchod; kde průchod chybí, napíše,
  přes kterou zem si ho domluvit,
- útok bez vyhlášení války (−30 % síly) jako volba u útoku,
- **nejmíň kol**: dohledá nejmenší počet kol do verbu, se kterým plán ještě projde,
- útočné stavby na zkoušku: zapni je u zdroje a hned vidíš, o kolik by zesílil útok,
- **Střet!**: na zem, o kterou se pere víc útočníků, se nic nepošle přesunem,
- **max** u útoku: v té zemi naverbovat na doraz a přebytek poslat právě tou větví,
- na stránce **Vojsko** jedním klikem vyplní útok podle plánu (odeslat musíš sám),
- ukazuje, které útoky z plánu už letí (✓), a odeslané kroky zamkne (🔒),
- export plánu do textu (třeba pro Discord).

Podrobný návod: **[NAVOD.md](NAVOD.md)**.

## Instalace

1. Nainstaluj si [Tampermonkey](https://www.tampermonkey.net/) (Chrome, Firefox, Edge).
2. Klikni na **[darkelf-planovac-rozjezdu.user.js](https://raw.githubusercontent.com/goringardevang-alt/darkelf-planovac-rozjezdu/main/darkelf-planovac-rozjezdu.user.js)**. Tampermonkey nabídne instalaci.
3. Ve hře otevři mapu a klikni na **neutrální zem**. Vlevo na její stránce, pod údaji o zemi, přibude tlačítko **Rozjezd ⇶**.

Nic dalšího není potřeba, společná knihovna (Core Utils) je v souboru přibalená.
**Aktualizace si Tampermonkey stahuje sám.**

Okno se kreslí nad mapu, takže mapa musí být otevřená. Okno zůstane otevřené,
i když vlevo přecházíš mezi zeměmi. Po novém přihlášení nebo přechodu do jiné ligy
začíná zavřené.

## Odkud bere data

- **`map_export_json.asp`** a **export smluv**: síla a obrana neutrálek, tvoje země
  a vojsko v nich, sousedé.
- **`auto_domy.asp`**: domy, obyvatelé a přírůstek (kvůli limitu verbu po kolech).
- **`hero.asp`**: útok a % tvých hrdinů.
- **`attacks_list.asp`** (seznam útoků aliance): které útoky z plánu už letí.

Všechno jsou přehledy celého účtu. Skript **nikdy neotevírá stránky jednotlivých
zemí**, takže ti nepřepne „aktuální zem" ve hře a útok ani nákup neskončí jinde.
Na stránce Vojsko jen vyplní políčka, která tam vidíš, a **nic neodešle**.
Nic se neposílá mimo hru.

Plán se ukládá v prohlížeči (po lize, 7 dní).

## Když máš i jiné Dark Elf skripty

Když máš nainstalované **Dark Elf - Core Utils**, použije se to tvoje a přibalená
kopie se nespustí. Když máš Rozjezd i jinak (například vývojovou verzi), běží jen
jeden z nich.

## Chyba nebo nápad

Napiš do [Issues](https://github.com/goringardevang-alt/darkelf-planovac-rozjezdu/issues).
