// ==UserScript==
// @name         Dark Elf - Plánovač rozjezdů
// @namespace    https://github.com/goringardevang-alt/darkelf-planovac-rozjezdu
// @version      1.58
// @description  Plán dobývání neutrálek na dnes, zítra a pozítří z jedné i víc tvých zemí: struktura rozjezdu na klik, přeposílky, limit verbu, rozpočet, tlačítko Navrhni (nejmenší verb a ztráty), vyplnění útoku na stránce Vojsko a kontrola odeslaných útoků. Obsahuje Core Utils v2.42.
// @author       Gorin & Claude
// @match        https://www.darkelf.cz/*
// @match        https://www.darkelf.sk/*
// @grant        none
// @homepageURL  https://github.com/goringardevang-alt/darkelf-planovac-rozjezdu
// @supportURL   https://github.com/goringardevang-alt/darkelf-planovac-rozjezdu/issues
// @updateURL    https://raw.githubusercontent.com/goringardevang-alt/darkelf-planovac-rozjezdu/main/darkelf-planovac-rozjezdu.user.js
// @downloadURL  https://raw.githubusercontent.com/goringardevang-alt/darkelf-planovac-rozjezdu/main/darkelf-planovac-rozjezdu.user.js
// ==/UserScript==

// ─────────────────────────────────────────────────────────────
// Dark Elf - Plánovač rozjezdů v1.58 (s Core Utils v2.42)
//
// Sestavený soubor — needituj ho, po aktualizaci by se změny ztratily.
// Chyba nebo nápad: https://github.com/goringardevang-alt/darkelf-planovac-rozjezdu/issues
// ─────────────────────────────────────────────────────────────

if (!window.DarkElfUtils) {
(function() {
    'use strict';

    window.DarkElfUtils = {
        VERSION: '2.42',

        getLeague: function() {
            const isValid = (val) => val && val !== '0' && val.toLowerCase() !== 'default' && val !== '';

            let apiLeague = localStorage.getItem("de_league_api");
            if (isValid(apiLeague)) return apiLeague.toUpperCase();

            let m = window.location.href.match(/[?&](?:l|liga)=([^&]+)/i);
            if (m && isValid(m[1])) return m[1].toUpperCase();

            let hMatch = window.location.host.match(/^([a-z0-9]+)\.darkelf\.cz/i);
            if (hMatch && isValid(hMatch[1]) && hMatch[1].toLowerCase() !== 'www') return hMatch[1].toUpperCase();

            try {
                let b = document.body;
                if (b) {
                    let onload = b.getAttribute('onload') || '';
                    let mOnload = onload.match(/mapStart\(['"](.+?)['"]\)/);
                    if (mOnload && isValid(mOnload[1])) return mOnload[1].toUpperCase();

                    let mText = b.innerHTML.match(/Liga\s+([A-Z0-9]{1,4})(?:[,\s<]|$)/i);
                    if (mText && isValid(mText[1])) return mText[1].toUpperCase();
                }
            } catch(e) {}

            let fallback = localStorage.getItem("de_last_known_league");
            if (isValid(fallback)) return fallback.toUpperCase();

            return 'DEFAULT';
        },

        fetchPage: async function(url, ttlSekund) {
            const klicCache = 'de_fetch:' + url;
            if (ttlSekund) {
                try {
                    const raw = sessionStorage.getItem(klicCache);
                    const ulozene = raw ? JSON.parse(raw) : null;
                    const P = window.DarkElfUtils.Prihlaseni;
                    const p = (P && P.precti()) || {};
                    const prihlasen = Math.max(p.ts || 0, p.tsId || 0, p.tsCizi || 0);
                    if (ulozene && ulozene.t >= prihlasen && (Date.now() - ulozene.t) < ttlSekund * 1000) {
                        const konecCache = window.DarkElfUtils.Mereni.usek('z cache ' + url);
                        const doc = new DOMParser().parseFromString(ulozene.html, 'text/html');
                        konecCache();
                        return doc;
                    }
                } catch (e) {  }
            }
            window.DarkElfUtils.Net.start(url);
            const konecMereni = window.DarkElfUtils.Mereni.usek('fetch ' + url);
            try {
                const res = await fetch(url, { credentials: 'include' });
                const buffer = await res.arrayBuffer();
                const text = new TextDecoder('windows-1250').decode(buffer);

                if (ttlSekund && text.length < 2000000) {
                    try { sessionStorage.setItem(klicCache, JSON.stringify({ t: Date.now(), html: text })); }
                    catch (e) {  }
                }
                return new DOMParser().parseFromString(text, 'text/html');
            } catch (e) {
                console.error("DarkElfUtils.fetchPage error:", e);
                return null;
            } finally {
                konecMereni();
                window.DarkElfUtils.Net.end();
            }
        },

        injectCSS: function(cssString, id = 'de-custom-styles') {
            if (!document.getElementById(id)) {
                let style = document.createElement('style');
                style.id = id;
                style.innerHTML = cssString;
                document.head.appendChild(style);
            }
        },

        Cache: {
            _getMidnight: function() {
                let d = new Date();
                d.setHours(24, 0, 0, 0);
                return d.getTime();
            },
            _buildKey: function(namespace, identifier) {
                const league = window.DarkElfUtils.getLeague() || 'ALL';
                return `DE_CACHE_${league}_${namespace}_${identifier}`;
            },

            set: function(namespace, identifier, value, expiresAt) {
                const key = this._buildKey(namespace, identifier);
                this._zapomen(namespace, identifier);
                try {
                    if (value === null || value === undefined) {
                        localStorage.removeItem(key);
                        return true;
                    }
                    this._uklidJednouDenne();
                    const text = JSON.stringify({
                        data: value,
                        expires: expiresAt || this._getMidnight()
                    });
                    if (this._zapis(key, text)) return true;
                    this._uklidProsle();
                    if (this._zapis(key, text)) return true;
                    this._uklidCiziLigy();
                    if (this._zapis(key, text)) return true;
                    console.warn('DarkElfUtils.Cache: úložiště je plné, ' + key + ' se neuložil');
                    return false;
                } catch (e) {
                    console.warn('DarkElfUtils.Cache.set:', e && e.message);
                    return false;
                }
            },

            _zapis: function(key, text) {
                try { localStorage.setItem(key, text); return true; }
                catch (e) { return false; }
            },

            _klice: function() {
                const out = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.indexOf('DE_CACHE_') === 0) out.push(k);
                }
                return out;
            },

            _uklidProsle: function() {
                this._zapomen();
                const ted = Date.now();
                let smazano = 0;
                this._klice().forEach(k => {
                    const m = String(localStorage.getItem(k) || '').match(/"expires":(\d+)\D*$/);
                    if (m && parseInt(m[1], 10) < ted) { localStorage.removeItem(k); smazano++; }
                });
                return smazano;
            },

            _uklidCiziLigy: function() {
                this._zapomen();
                const liga = window.DarkElfUtils.getLeague() || 'ALL';
                const vlastni = 'DE_CACHE_' + liga + '_';
                let smazano = 0;
                this._klice().forEach(k => {
                    if (k.indexOf(vlastni) === 0) return;
                    if (!/^DE_CACHE_[^_]+_api_/.test(k)) return;
                    localStorage.removeItem(k);
                    smazano++;
                });
                return smazano;
            },

            _uklidJednouDenne: function() {
                const d = new Date();
                const dnes = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
                try {
                    if (localStorage.getItem('de_cache_uklid') === dnes) return;
                    this._uklidProsle();
                    localStorage.setItem('de_cache_uklid', dnes);
                } catch (e) {  }
            },

            _PAMATOVAT: { api_map_json: true, api_treaties_json: true },
            _pamet: {},

            _zapomen: function(namespace, identifier) {
                if (namespace === undefined) this._pamet = {};
                else delete this._pamet[namespace + '_' + identifier];
            },

            get: function(namespace, identifier) {
                const key = this._buildKey(namespace, identifier);
                const pametKlic = namespace + '_' + identifier;
                const pamatovat = this._PAMATOVAT[pametKlic] === true;
                let p = pamatovat ? this._pamet[pametKlic] : null;
                if (p && (p.key !== key || Date.now() > p.expires)) {
                    delete this._pamet[pametKlic];
                    p = null;
                }
                if (p && p.overeno) return p.data;

                const raw = localStorage.getItem(key);
                if (p) {
                    if (raw === p.raw) {
                        this._overeno(p);
                        return p.data;
                    }
                    delete this._pamet[pametKlic];
                }
                if (!raw) return null;
                try {
                    const payload = JSON.parse(raw);
                    if (payload && payload.expires) {
                        if (Date.now() > payload.expires) {
                            localStorage.removeItem(key);
                            return null;
                        }
                        if (pamatovat) {
                            const novy = { key: key, raw: raw, data: payload.data, expires: payload.expires, overeno: false };
                            this._pamet[pametKlic] = novy;
                            this._overeno(novy);
                        }
                        return payload.data;
                    }
                    return payload.data !== undefined ? payload.data : payload;
                } catch (e) {
                    return null;
                }
            },

            _overeno: function(p) {
                p.overeno = true;
                Promise.resolve().then(function() { p.overeno = false; });
            }
        },

        Races: {
            0:  { key: 'men',          cz: 'Lidé',         baseTurns: 8  },
            1:  { key: 'barbarians',   cz: 'Barbaři',      baseTurns: 7  },
            2:  { key: 'orcs',         cz: 'Skřeti',       baseTurns: 10 },
            3:  { key: 'uruks',        cz: 'Skuruti',      baseTurns: 9  },
            4:  { key: 'necromancers', cz: 'Nekromanti',   baseTurns: 8  },
            5:  { key: 'magi',         cz: 'Mágové',       baseTurns: 7  },
            6:  { key: 'elves',        cz: 'Elfové',       baseTurns: 7  },
            7:  { key: 'dark elves',   cz: 'Temní elfové', baseTurns: 6  },
            8:  { key: 'dwarves',      cz: 'Trpaslíci',    baseTurns: 6  },
            9:  { key: 'hobbits',      cz: 'Hobiti',       baseTurns: 11 },
            10: { key: 'ents',         cz: 'Enti',         baseTurns: 5  },

            byId:  function(id) { return this[id] || null; },
            byKey: function(key) {
                for (let id in this) {
                    if (typeof this[id] === 'object' && this[id].key === key) return { id: parseInt(id), ...this[id] };
                }
                return null;
            },
            byCz:  function(name) {
                if (!name) return null;
                name = name.toLowerCase();
                for (let id in this) {
                    if (typeof this[id] === 'object' && this[id].cz.toLowerCase() === name) return { id: parseInt(id), ...this[id] };
                }
                return null;
            }
        },

        UnitStats: {
            "men":          { 1: { attack: 1, defence: 5 }, 2: { attack: 7, defence: 3 }, 3: { attack: 4, defence: 4 } },
            "barbarians":   { 1: { attack: 4, defence: 3 }, 2: { attack: 9, defence: 3 }, 3: { attack: 5, defence: 4 } },
            "orcs":         { 1: { attack: 2, defence: 4 }, 2: { attack: 5, defence: 3 }, 3: { attack: 3, defence: 3 } },
            "uruks":        { 1: { attack: 3, defence: 3 }, 2: { attack: 7, defence: 1 }, 3: { attack: 5, defence: 3 } },
            "necromancers": { 1: { attack: 1, defence: 4 }, 2: { attack: 7, defence: 2 }, 3: { attack: 5, defence: 3 } },
            "magi":         { 1: { attack: 2, defence: 5 }, 2: { attack: 7, defence: 2 }, 3: { attack: 3, defence: 5 } },
            "elves":        { 1: { attack: 2, defence: 6 }, 2: { attack: 6, defence: 4 }, 3: { attack: 5, defence: 5 } },
            "dark elves":   { 1: { attack: 3, defence: 5 }, 2: { attack: 8, defence: 3 }, 3: { attack: 4, defence: 5 } },
            "dwarves":      { 1: { attack: 2, defence: 7 }, 2: { attack: 5, defence: 6 }, 3: { attack: 3, defence: 7 } },
            "hobbits":      { 1: { attack: 2, defence: 2 }, 2: { attack: 4, defence: 2 }, 3: { attack: 1, defence: 2 } },
            "ents":         { 1: { attack: 4, defence: 6 }, 2: { attack: 8, defence: 8 }, 3: { attack: 3, defence: 6 } }
        },

        FortressMap: {
            'p2': { key: 'wooden_walls',     cz: 'Dřevěné hradby',  bonus: [1, 1.1]  },
            'p3': { key: 'small_fortress',   cz: 'Malá pevnost',    bonus: [1.1, 1.2] },
            'p4': { key: 'medium_fortress',  cz: 'Střední pevnost', bonus: [1.25, 1.5] },
            'p5': { key: 'large_fortress',   cz: 'Velká pevnost',   bonus: [1.5, 2]   }
        },

        TowerMap: {
            'm2': { key: 'shrine',        cz: 'Obřadní svatyně',       magAdd: 5,  magMul: 1   },
            'm3': { key: 'small_tower',   cz: 'Malá magická věž',      magAdd: 20, magMul: 1   },
            'm4': { key: 'medium_tower',  cz: 'Střední magická věž',   magAdd: 0,  magMul: 1.5 },
            'm5': { key: 'large_tower',   cz: 'Velká magická věž',     magAdd: 0,  magMul: 2.0 },
            'm6': { key: 'defense_tower', cz: 'Obranná magická věž',   magAdd: 50, magMul: 1   },
            'm7': { key: 'temple',        cz: 'Chrám',                 magAdd: 0,  magMul: 4.0 }
        },

        parseHerniCas: function(raw) {
            const m = String(raw == null ? '' : raw).match(
                /^\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*$/);
            if (!m) return NaN;
            const d = new Date(+m[3], +m[2] - 1, +m[1],
                               +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));

            return (d.getFullYear() === +m[3] && d.getMonth() === (+m[2] - 1)
                    && d.getDate() === +m[1]) ? d.getTime() : NaN;
        },

        _extractImgSuffix: function(imgStr) {
            if (!imgStr) return null;
            const match = imgStr.match(/([vpm]\d+)\.gif/i);
            return match ? match[1] : null;
        },

        parseFortress: function(imgPevnost) {
            const suffix = this._extractImgSuffix(imgPevnost);
            return suffix ? (this.FortressMap[suffix] || null) : null;
        },

        parseTower: function(imgVez) {
            const suffix = this._extractImgSuffix(imgVez);
            return suffix ? (this.TowerMap[suffix] || null) : null;
        },

        MapAPI: {
            _lastFetchTime: 0,
            _MIN_INTERVAL_MS: 120000,
            _RATE_LIMIT_MS: 6000,

            _nahrazovani: null,

            fetch: async function(area, force) {
                const now = Date.now();
                const cached = window.DarkElfUtils.Cache.get('api', 'map_json');

                if (!this._patriPrihlasenemu(cached)) {
                    return this._nahradCizi(area);
                }

                if (!force && cached && cached._fetchedAt && !this._jeNovySnimek(cached, now)) {
                    return cached;
                }

                if ((now - this._lastFetchTime) < this._RATE_LIMIT_MS) {
                    console.warn('DarkElfUtils.MapAPI: Rate limit, vracím cache');
                    return cached || null;
                }

                const vysledek = await this._stahni(area);
                return vysledek.data || cached || null;
            },

            getCountry: function(countryId) {
                const cached = window.DarkElfUtils.Cache.get('api', 'map_json');
                if (!cached || !Array.isArray(cached.zeme)) return null;
                return this._podleId(cached.zeme).get(parseInt(countryId, 10)) || null;
            },

            _indexy: new WeakMap(),
            _podleId: function(pole) {
                let idx = this._indexy.get(pole);
                if (!idx) {
                    idx = new Map();
                    pole.forEach(function(x) { if (x && !idx.has(x.id)) idx.set(x.id, x); });
                    this._indexy.set(pole, idx);
                }
                return idx;
            },

            getHeader: function() {
                const cached = window.DarkElfUtils.Cache.get('api', 'map_json');
                return cached ? cached.hlavicka : null;
            },

            getPrivate: function(countryId) {
                const country = this.getCountry(countryId);
                return country ? country.private : null;
            },

            getRace: function(countryId) {
                const country = this.getCountry(countryId);
                if (!country) return null;
                return window.DarkElfUtils.Races.byId(country.id_rasa);
            },

            getMyRace: function() {
                const cached = window.DarkElfUtils.Cache.get('api', 'map_json');
                const hlavicka = cached && cached.hlavicka;
                if (!hlavicka || !Array.isArray(cached.zeme)) return null;

                if (!this._patriPrihlasenemu(cached)) return null;

                const mojeId = String(hlavicka.id_hrace == null ? '' : hlavicka.id_hrace);
                const mojeJmeno = hlavicka.hrac || null;

                for (const z of cached.zeme) {
                    const sedi = (mojeId && String(z.id_hrac) === mojeId)
                        || (!mojeId && mojeJmeno && z.hrac === mojeJmeno);
                    if (sedi && z.id_rasa != null) {
                        return window.DarkElfUtils.Races.byId(z.id_rasa);
                    }
                }
                return null;
            },

            getMe: function() {
                const cached = window.DarkElfUtils.Cache.get('api', 'map_json');
                const stav = this._stavSnimku(cached);
                if (stav !== 'ok' && stav !== 'neznamo') return null;
                const h = cached.hlavicka;
                if (h.id_hrace == null && !h.hrac) return null;
                return {
                    id: h.id_hrace == null ? null : String(h.id_hrace),
                    jmeno: h.hrac || null,
                    id_aliance: h.id_aliance == null ? null : parseInt(h.id_aliance, 10),
                    overeno: stav === 'ok'
                };
            },

            getFortress: function(countryId) {
                const country = this.getCountry(countryId);
                if (!country) return null;
                return window.DarkElfUtils.parseFortress(country.img_pevnost);
            },

            getTower: function(countryId) {
                const country = this.getCountry(countryId);
                if (!country) return null;
                return window.DarkElfUtils.parseTower(country.img_vez);
            },

            _jeNovySnimek: function(cached, now) {
                if ((now - cached._fetchedAt) >= this._MIN_INTERVAL_MS) return true;
                const raw = cached.hlavicka && cached.hlavicka.cache_next_refresh;
                const t = window.DarkElfUtils.parseHerniCas(raw);
                return Number.isFinite(t) ? (now >= t) : false;
            },

            isStale: function() {
                const cached = window.DarkElfUtils.Cache.get('api', 'map_json');
                if (!cached || !cached._fetchedAt) return true;
                if (!this._patriPrihlasenemu(cached)) return true;
                return this._jeNovySnimek(cached, Date.now());
            },

            _patriPrihlasenemu: function(snimek) {
                const stav = this._stavSnimku(snimek);
                return stav !== 'cizi' && stav !== 'predVstupem';
            },

            _stavSnimku: function(snimek) {
                const h = snimek && snimek.hlavicka;
                if (!h) return 'zadny';
                const P = window.DarkElfUtils.Prihlaseni;
                const p = P ? P.precti() : null;
                if (!p) return 'neznamo';
                const kdy = snimek._fetchedAt || 0;
                const idSnimku = String(h.id_hrace == null ? '' : h.id_hrace);
                if (p.id) {
                    if (idSnimku === p.id) return 'ok';
                    return kdy < (p.ts || p.tsId || 0) ? 'cizi' : 'ok';
                }
                if (p.ciziId && idSnimku === p.ciziId && kdy < (p.ts || p.tsCizi || 0)) return 'cizi';
                if (p.ts) return kdy < p.ts ? 'predVstupem' : 'ok';
                return 'neznamo';
            },

            _stahni: async function(area) {
                const now = Date.now();
                const url = area != null ? `/map_export_json.asp?area=${area}` : '/map_export_json.asp';
                window.DarkElfUtils.Net.start(url);
                const konecMereni = window.DarkElfUtils.Mereni.usek('fetch ' + url);
                try {
                    const resp = await fetch(url, { credentials: 'include' });
                    const data = await resp.json();

                    if (data.error) {
                        console.warn('DarkElfUtils.MapAPI:', data.error, 'retry_after:', data.retry_after);
                        return { chyba: data.error, retryAfter: data.retry_after };
                    }

                    data._fetchedAt = now;
                    this._lastFetchTime = now;

                    if (data.hlavicka && data.hlavicka.liga != null && data.hlavicka.liga !== '') {
                        localStorage.setItem('de_league_api', String(data.hlavicka.liga));
                    }

                    window.DarkElfUtils.Cache.set('api', 'map_json', data);
                    return { data: data };
                } catch(e) {
                    console.error('DarkElfUtils.MapAPI.fetch:', e);
                    return { vyjimka: e };
                } finally {
                    konecMereni();
                    window.DarkElfUtils.Net.end();
                }
            },

            _nahradCizi: function(area) {
                return window.DarkElfUtils.Prihlaseni._nahradSnimek(this, 'map_json', () => this._stahni(area));
            }
        },

        TreatiesAPI: {
            _lastFetchTime: 0,
            _MIN_INTERVAL_MS: 120000,
            _RATE_LIMIT_MS: 6000,

            TreatyTypes: {
                1: { cz: 'Vojenská',      key: 'military' },
                2: { cz: 'Magická',       key: 'magic' },
                3: { cz: 'Obchodní',      key: 'trade' },
                4: { cz: 'Volný průchod', key: 'passage' },
                5: { cz: 'Zrušena',       key: 'cancelled' },
                6: { cz: 'Válka',         key: 'war' },
                7: { cz: 'Mír',           key: 'peace' }
            },
            TREATY_MILITARY: 1,
            TREATY_PASSAGE: 4,
            TREATY_WAR: 6,

            _nahrazovani: null,

            fetch: async function(force) {
                const now = Date.now();
                const cached = window.DarkElfUtils.Cache.get('api', 'treaties_json');

                if (!this._patriPrihlasenemu(cached)) {
                    return window.DarkElfUtils.Prihlaseni._nahradSnimek(this, 'treaties_json', () => this._stahni());
                }

                if (!force && cached && cached._fetchedAt && (now - cached._fetchedAt) < this._MIN_INTERVAL_MS) {
                    return cached;
                }

                if ((now - this._lastFetchTime) < this._RATE_LIMIT_MS) {
                    console.warn('DarkElfUtils.TreatiesAPI: Rate limit, vracím cache');
                    return cached || null;
                }

                const vysledek = await this._stahni();
                return vysledek.data || cached || null;
            },

            _stahni: async function() {
                const now = Date.now();
                window.DarkElfUtils.Net.start('/smlouvy_export_json.asp');
                const konecMereni = window.DarkElfUtils.Mereni.usek('fetch /smlouvy_export_json.asp');
                try {
                    const resp = await fetch('/smlouvy_export_json.asp', { credentials: 'include' });
                    const data = await resp.json();

                    if (data.error) {
                        console.warn('DarkElfUtils.TreatiesAPI:', data.error, 'retry_after:', data.retry_after);
                        return { chyba: data.error, retryAfter: data.retry_after };
                    }

                    data._fetchedAt = now;
                    this._lastFetchTime = now;
                    window.DarkElfUtils.Cache.set('api', 'treaties_json', data);
                    return { data: data };
                } catch(e) {
                    console.error('DarkElfUtils.TreatiesAPI.fetch:', e);
                    return { vyjimka: e };
                } finally {
                    konecMereni();
                    window.DarkElfUtils.Net.end();
                }
            },

            _patriPrihlasenemu: function(snimek) {
                return window.DarkElfUtils.MapAPI._patriPrihlasenemu(snimek);
            },

            getCountry: function(countryId) {
                const cached = window.DarkElfUtils.Cache.get('api', 'treaties_json');
                if (!cached || !Array.isArray(cached.smlouvy)) return null;
                return window.DarkElfUtils.MapAPI._podleId(cached.smlouvy).get(parseInt(countryId, 10)) || null;
            },

            getHeader: function() {
                const cached = window.DarkElfUtils.Cache.get('api', 'treaties_json');
                return cached ? cached.hlavicka : null;
            },

            getNeighbors: function(countryId) {
                const entry = this.getCountry(countryId);
                if (!entry) return [];
                const neighbors = [];
                for (let i = 1; i <= 10; i++) {
                    const val = entry['s' + i];
                    if (val != null) neighbors.push(val);
                }
                return neighbors;
            },

            getExpiring: function(countryId) {
                const out = new Map();

                if (!this._patriPrihlasenemu(window.DarkElfUtils.Cache.get('api', 'treaties_json'))) return out;
                const entry = this.getCountry(countryId);
                if (!entry || !entry.private) return out;

                for (let i = 1; i <= 10; i++) {
                    const neighborId = entry['s' + i];
                    if (neighborId == null) continue;
                    const expiring = entry.private['d' + i];
                    if (expiring == null || expiring === 0) continue;
                    if (expiring === entry.private['sm' + i]) continue;
                    out.set(neighborId, expiring);
                }
                return out;
            },

            getMilitaryAllianceDefence: function(countryId) {
                if (!this._patriPrihlasenemu(window.DarkElfUtils.Cache.get('api', 'treaties_json'))) return 0;
                const entry = this.getCountry(countryId);
                if (!entry || !entry.private) return 0;

                let totalPower = 0;
                for (let i = 1; i <= 10; i++) {
                    const treatyType = entry.private['sm' + i];
                    const neighborId = entry['s' + i];

                    if (treatyType === window.DarkElfUtils.TreatiesAPI.TREATY_MILITARY && neighborId != null) {

                        const ally = window.DarkElfUtils.MapAPI.getCountry(neighborId);
                        if (ally) {
                            totalPower += ally.land_power || 0;
                        }
                    }
                }
                return totalPower;
            },

            isStale: function() {
                const cached = window.DarkElfUtils.Cache.get('api', 'treaties_json');
                if (!cached || !cached._fetchedAt) return true;
                if (!this._patriPrihlasenemu(cached)) return true;
                return (Date.now() - cached._fetchedAt) >= this._MIN_INTERVAL_MS;
            }
        }
    };

    window.DarkElfUtils.AllianceAPI = {

        DONOR_IDS: [6, 7, 8, 10],

        DISCOUNT_CATS: {
            spells:   { native: 6,  base: 20, capNative: 40, capOther: 30 },
            towers:   { native: 7,  base: 10, capNative: 30, capOther: 20 },
            fortify:  { native: 8,  base: 20, capNative: 40, capOther: 30 },
            timewarp: { native: 10, base: 20, capNative: 40, capOther: 30 }
        },

        _registryKey: function() {
            return 'de_alliance_races_' + (window.DarkElfUtils.getLeague() || 'ALL');
        },
        _getRegistry: function() {
            try { return JSON.parse(localStorage.getItem(this._registryKey())) || {}; }
            catch(e) { return {}; }
        },
        _registryDayKey: function() {
            return this._registryKey() + '_den';
        },

        _updateRegistry: function(zeme, den) {
            if (!Array.isArray(zeme)) return;
            let reg = this._getRegistry();

            den = parseInt(den, 10);
            if (Number.isInteger(den)) {
                const prev = parseInt(localStorage.getItem(this._registryDayKey()), 10);
                if (Number.isInteger(prev) && den < prev) {
                    reg = {};
                    try { localStorage.removeItem(this._registryKey()); } catch(e) {}
                }
                try { localStorage.setItem(this._registryDayKey(), String(den)); } catch(e) {}
            }

            let changed = false;
            zeme.forEach(z => {
                const name = z.hrac;
                const idRasa = parseInt(z.id_rasa, 10);
                if (name && Number.isInteger(idRasa) && reg[name] !== idRasa) {
                    reg[name] = idRasa; changed = true;
                }
            });
            if (changed) {
                try { localStorage.setItem(this._registryKey(), JSON.stringify(reg)); } catch(e) {}
            }
        },

        _fetchRoster: async function(force) {
            if (!force) {
                const c = window.DarkElfUtils.Cache.get('api', 'alliance_roster');
                if (c) return c;
            }
            try {
                const doc = await window.DarkElfUtils.fetchPage('/aliance.asp');
                if (!doc) return window.DarkElfUtils.Cache.get('api', 'alliance_roster') || null;
                const names = [];
                doc.querySelectorAll('#tab_players_list tr').forEach(row => {
                    const a = row.querySelector('th a[target="mail"]');
                    if (!a) return;
                    const n = (a.textContent || '').replace(/\s+/g, ' ').trim();
                    if (n) names.push(n);
                });
                if (names.length === 0) return window.DarkElfUtils.Cache.get('api', 'alliance_roster') || null;
                window.DarkElfUtils.Cache.set('api', 'alliance_roster', names);
                return names;
            } catch(e) {
                console.warn('DarkElfUtils.AllianceAPI._fetchRoster:', e.message);
                return window.DarkElfUtils.Cache.get('api', 'alliance_roster') || null;
            }
        },
        _getRoster: function() {
            return window.DarkElfUtils.Cache.get('api', 'alliance_roster');
        },

        fetch: async function(force) {
            const map = await window.DarkElfUtils.MapAPI.fetch(null, force);
            if (map && map.zeme) this._updateRegistry(map.zeme, map.hlavicka && map.hlavicka.den);
            await this._fetchRoster(force);
            return this.getMembers();
        },

        getMembers: function() {
            const header = window.DarkElfUtils.MapAPI.getHeader();
            const cached = window.DarkElfUtils.Cache.get('api', 'map_json');
            if (!header || !cached || !cached.zeme) return [];

            if (!window.DarkElfUtils.MapAPI._patriPrihlasenemu(cached)) return [];
            const myAli = parseInt(header.id_aliance, 10);
            if (!myAli) return [];

            const byName = {};

            cached.zeme.forEach(z => {
                if (parseInt(z.id_aliance, 10) !== myAli) return;
                const name = z.hrac;
                const idRasa = parseInt(z.id_rasa, 10);
                if (!name || !Number.isInteger(idRasa)) return;
                byName[name] = {
                    hrac: name,
                    id_rasa: idRasa,
                    race: window.DarkElfUtils.Races.byId(idRasa),
                    landless: false
                };
            });

            const roster = this._getRoster();
            if (Array.isArray(roster)) {
                const registry = this._getRegistry();
                roster.forEach(name => {
                    if (byName[name]) return;
                    const idRasa = registry[name];
                    if (!Number.isInteger(idRasa)) return;
                    byName[name] = {
                        hrac: name,
                        id_rasa: idRasa,
                        race: window.DarkElfUtils.Races.byId(idRasa),
                        landless: true
                    };
                });
            }
            return Object.values(byName);
        },

        getRaceCounts: function() {
            const members = this.getMembers();
            const byId = {};
            let donorTotal = 0, malokoloveCount = 0;
            members.forEach(m => {
                byId[m.id_rasa] = (byId[m.id_rasa] || 0) + 1;
                if (this.DONOR_IDS.includes(m.id_rasa)) donorTotal++;
                if (m.race && m.race.baseTurns <= 7) malokoloveCount++;
            });
            return { byId, donorTotal, malokoloveCount, total: members.length };
        },

        getDiscount: function(raceId, catKey) {
            const cat = this.DISCOUNT_CATS[catKey];
            if (!cat) { console.warn('DarkElfUtils.AllianceAPI.getDiscount: neznámá kategorie', catKey); return 0; }

            raceId = parseInt(raceId, 10);
            const race = window.DarkElfUtils.Races.byId(raceId);
            if (!race || race.baseTurns > 7) return 0;

            const counts = this.getRaceCounts();
            if ((counts.byId[cat.native] || 0) === 0) return 0;

            const isDonor  = this.DONOR_IDS.includes(raceId);
            const isNative = raceId === cat.native;
            const bonus = (counts.donorTotal - (isDonor ? 1 : 0)) * 5;
            const base  = isNative ? cat.base : 0;
            const cap   = isNative ? cat.capNative : cat.capOther;
            return Math.min(base + bonus, cap);
        },

        isStale: function() {
            return window.DarkElfUtils.MapAPI.isStale();
        }
    };

    window.DarkElfUtils.RoundsAPI = {
        _LS_KEY: 'de_rounds_remaining',

        save: function() {
            const el = document.getElementById('i3');
            if (!el) return null;
            const text = (el.innerHTML || el.textContent || '').replace(/&nbsp;/ig, '').replace(/\s+/g, '');
            const match = text.match(/(\d+)\/(\d+)/);
            if (!match) return null;
            const remaining = parseInt(match[2], 10) - parseInt(match[1], 10);
            localStorage.setItem(this._LS_KEY, remaining);
            return remaining;
        },

        get: function() {
            try {
                if (window.parent && window.parent.frames) {
                    for (let i = 0; i < window.parent.frames.length; i++) {
                        try {
                            const doc = window.parent.frames[i].document;
                            const el = doc && doc.getElementById('i3');
                            if (!el) continue;
                            const text = (el.innerHTML || el.textContent || '').replace(/&nbsp;/ig, '').replace(/\s+/g, '');
                            const match = text.match(/(\d+)\/(\d+)/);
                            if (match) return parseInt(match[2], 10) - parseInt(match[1], 10);
                        } catch(e) {}
                    }
                }
            } catch(e) {}
            const saved = localStorage.getItem(this._LS_KEY);
            return saved !== null ? parseInt(saved, 10) : null;
        }
    };

    window.DarkElfUtils.Prihlaseni = {
        _KLIC: 'de_prihlaseni',

        precti: function() {
            try { return JSON.parse(localStorage.getItem(this._KLIC)) || null; }
            catch (e) { return null; }
        },

        _zapis: function(stav) {
            try { localStorage.setItem(this._KLIC, JSON.stringify(stav)); }
            catch (e) { return; }
            this._ohlas(stav);
        },

        _ohlas: function(stav) {

            window.DarkElfUtils.Cache._zapomen();
            try { window.dispatchEvent(new CustomEvent('de-prihlaseni', { detail: stav || this.precti() })); }
            catch (e) {  }
        },

        vstupDoHry: function() {
            this._zapis({ ts: Date.now() });
        },

        ohlasHrace: function(id, zdroj) {
            if (id == null || id === '') return;
            id = String(id);
            const p = this.precti() || {};
            if (p.id !== id) {
                this._zapis({ ts: p.ts, id: id, tsId: Date.now(), zdroj: zdroj });
            }
            this._nahradJeCizi();
        },

        ohlasCiziSnimek: function(ciziId, zdroj) {
            const p = this.precti() || {};
            if (p.id) return;
            ciziId = String(ciziId);
            if (p.ciziId !== ciziId) {
                this._zapis(Object.assign({}, p, { ciziId: ciziId, tsCizi: Date.now(), zdroj: zdroj }));
            }
            this._nahradJeCizi();
        },

        _nahradJeCizi: function() {
            const M = window.DarkElfUtils.MapAPI;
            if (M._stavSnimku(window.DarkElfUtils.Cache.get('api', 'map_json')) === 'cizi') {
                M.fetch().catch(function() {  });
            }

        },

        _nahradSnimek: function(api, klic, stahni) {
            if (api._nahrazovani) return api._nahrazovani;
            const cekej = (ms) => new Promise(r => setTimeout(r, ms));
            const POKUSU = 3;
            api._nahrazovani = (async () => {
                try {
                    for (let pokus = 1; pokus <= POKUSU; pokus++) {
                        const zbyva = api._RATE_LIMIT_MS - (Date.now() - api._lastFetchTime);
                        if (zbyva > 0) await cekej(zbyva);

                        const cached = window.DarkElfUtils.Cache.get('api', klic);
                        if (cached && api._patriPrihlasenemu(cached)) return cached;

                        const v = await stahni();
                        if (v.data) return v.data;
                        if (!v.chyba) break;
                        if (pokus < POKUSU) {
                            const s = Number(v.retryAfter);
                            await cekej((Number.isFinite(s) && s > 0 ? s : 1) * 1000 + Math.random() * 500);
                        }
                    }
                    console.warn('DarkElfUtils: snímek ' + klic + ' předchozího hráče se nepodařilo nahradit, vracím null');
                    return null;
                } finally {
                    api._nahrazovani = null;
                }
            })();
            return api._nahrazovani;
        },

        mojeZemNaMape: function(doc) {
            const lands = (doc || document).querySelectorAll('.land[data-id_player]');
            for (const land of lands) {
                const img = land.querySelector('img[src*="images/v/"]');
                if (img && /\/v\/\d+a\.gif$/i.test(img.getAttribute('src') || '')) {
                    const hrac = land.getAttribute('data-id_player');
                    if (hrac) return { id: parseInt(land.getAttribute('data-id'), 10), hrac: hrac };
                }
            }
            return null;
        },

        zemeZCentraly: function(doc) {
            const ids = [];
            (doc || document).querySelectorAll('td.pen').forEach(function(td) {
                const tr = td.closest('tr');
                const a = tr && tr.querySelector('a[href*="e.asp?id="]');
                const m = a && (a.getAttribute('href') || '').match(/e\.asp\?id=(\d+)/);
                if (m) ids.push(parseInt(m[1], 10));
            });
            return ids;
        },

        _overCentralu: function(doc) {
            const ids = this.zemeZCentraly(doc);
            const snimek = window.DarkElfUtils.Cache.get('api', 'map_json');
            if (!ids.length || !snimek || !snimek.hlavicka || !Array.isArray(snimek.zeme)) return;
            const idSnimku = String(snimek.hlavicka.id_hrace == null ? '' : snimek.hlavicka.id_hrace);
            if (!idSnimku) return;
            let vSnimku = 0, sedi = 0;
            ids.forEach(function(id) {
                const z = snimek.zeme.find(function(x) { return x.id === id; });
                if (!z) return;
                vSnimku++;
                if (String(z.id_hrac) === idSnimku) sedi++;
            });
            if (!vSnimku) return;
            if (sedi * 2 > vSnimku) this.ohlasHrace(idSnimku, 'centrala');
            else if (sedi === 0) this.ohlasCiziSnimek(idSnimku, 'centrala');

        },

        _priNacteni: function() {
            const cesta = (window.location.pathname || '').toLowerCase();
            if (cesta === '/world.htm') { this.vstupDoHry(); return; }

            const self = this;
            window.addEventListener('storage', function(e) {
                if (e.key === self._KLIC) self._ohlas();
            });

            const moje = this.mojeZemNaMape(document);
            if (moje) this.ohlasHrace(moje.hrac, 'mapa');
            else if (cesta === '/centrala.asp') this._overCentralu(document);
        }
    };

    window.DarkElfUtils.Mereni = {
        KLIC: 'de_mereni',
        KLIC_LOG: 'de_mereni_log',
        MAX_RADKU: 300,
        _on: null,
        _zaznamy: [],
        _timer: null,

        zapnuto: function() {
            if (this._on === null) {
                try { this._on = (localStorage.getItem(this.KLIC) === '1'); }
                catch (e) { this._on = false; }
            }
            return this._on;
        },

        usek: function(nazev) {
            if (!this.zapnuto()) return function() {};
            const t0 = performance.now();
            const self = this;
            return function() { self._pridej(nazev, performance.now() - t0); };
        },

        _pridej: function(nazev, ms) {
            this._zaznamy.push({ nazev: nazev, ms: Math.round(ms) });

            if (this._timer) clearTimeout(this._timer);
            this._timer = setTimeout(this.vypis.bind(this), 2000);
        },

        _kde: function() {
            try { return (location.pathname.split('/').pop() || 'index') + location.search; }
            catch (e) { return '?'; }
        },

        vypis: function() {
            this._timer = null;
            if (!this._zaznamy.length) return;
            let celkem = 0;
            this._zaznamy.forEach(z => { celkem += z.ms; });
            const hlavicka = '[DE měření] ' + this._kde() + ' — součet úseků ' + celkem + ' ms';
            const radky = this._zaznamy.map(z => '    ' + String(z.ms).padStart(6) + ' ms  ' + z.nazev);
            console.log([hlavicka].concat(radky).join('\n'));
            try {
                const cas = new Date().toLocaleTimeString('cs-CZ');
                const stary = (localStorage.getItem(this.KLIC_LOG) || '').split('\n').filter(Boolean);
                const nove = stary.concat([cas + ' ' + hlavicka]).concat(radky);
                localStorage.setItem(this.KLIC_LOG, nove.slice(-this.MAX_RADKU).join('\n'));
            } catch (e) {  }
            this._zaznamy = [];
        }
    };

    window.DarkElfUtils.Net = {
        _count: 0,
        _hideTimer: null,

        _el: function() {
            if (!document.body) return null;
            let el = document.getElementById('de-net-indicator');
            if (!el) {
                el = document.createElement('div');
                el.id = 'de-net-indicator';
                el.style.cssText = 'position:fixed;right:6px;bottom:6px;z-index:2147483647;'
                    + 'background:rgba(20,10,0,0.92);border:1px solid #b8860b;border-radius:4px;'
                    + 'color:#ffcc44;font:bold 11px sans-serif;padding:4px 8px;pointer-events:none;'
                    + 'box-shadow:0 2px 8px rgba(0,0,0,0.6);white-space:nowrap;display:none;';
                document.body.appendChild(el);
            }
            return el;
        },

        start: function(label) {
            this._count++;
            if (this._hideTimer) { clearTimeout(this._hideTimer); this._hideTimer = null; }
            const el = this._el();
            if (!el) return;
            el.textContent = '⏳ Načítám data…' + (this._count > 1 ? ' (' + this._count + ')' : '');
            el.title = 'Skript stahuje herní data. Počkej s klikáním na akce v zemích.'
                + (label ? '\n' + label : '');
            el.style.display = 'block';
        },

        end: function() {
            this._count = Math.max(0, this._count - 1);
            const el = this._el();
            if (!el) return;
            if (this._count > 0) {
                el.textContent = '⏳ Načítám data…' + (this._count > 1 ? ' (' + this._count + ')' : '');
                return;
            }

            this._hideTimer = setTimeout(() => {
                if (this._count === 0) el.style.display = 'none';
            }, 250);
        }
    };

    window.DarkElfUtils.RoundGuard = {
        _LS_KEY: 'de_round_guard',
        _TTL_MS: 6 * 60 * 60 * 1000,

        _league: function() {
            try { return window.DarkElfUtils.getLeague() || 'ALL'; } catch(e) { return 'ALL'; }
        },

        _currentDay: function() {
            try {
                const h = window.DarkElfUtils.MapAPI.getHeader();
                return h && h.den != null ? parseInt(h.den, 10) : null;
            } catch(e) { return null; }
        },

        _readAll: function() {
            try { return JSON.parse(localStorage.getItem(this._LS_KEY)) || {}; }
            catch(e) { return {}; }
        },

        _writeAll: function(obj) {
            try { localStorage.setItem(this._LS_KEY, JSON.stringify(obj)); } catch(e) {}
        },

        set: function(key, opts) {
            if (!key) return;
            opts = opts || {};
            const all = this._readAll();
            const lg = this._league();
            if (!all[lg]) all[lg] = {};
            all[lg][key] = {
                label: opts.label || key,
                level: opts.level || 'warn',
                message: opts.message || '',
                verify: opts.verify || null,
                day: this._currentDay(),
                ts: Date.now()
            };
            this._writeAll(all);
        },

        clear: function(key) {
            const all = this._readAll();
            const lg = this._league();
            if (all[lg] && all[lg][key]) {
                delete all[lg][key];
                if (Object.keys(all[lg]).length === 0) delete all[lg];
                this._writeAll(all);
            }
        },

        list: function() {
            const all = this._readAll();
            const lg = this._league();
            const bucket = all[lg];
            if (!bucket) return [];
            const day = this._currentDay();
            const now = Date.now();
            const out = [];
            let changed = false;
            for (const key in bucket) {
                const rec = bucket[key];
                const staleDay = (day != null && rec.day != null && rec.day !== day);
                const staleTtl = (rec.ts != null && (now - rec.ts) > this._TTL_MS);
                if (staleDay || staleTtl) { delete bucket[key]; changed = true; continue; }
                out.push(Object.assign({ key: key }, rec));
            }
            if (changed) {
                if (Object.keys(bucket).length === 0) delete all[lg];
                this._writeAll(all);
            }
            return out;
        },

        check: function() {
            const recs = this.list();
            if (recs.length === 0) return null;
            const hasBlock = recs.some(r => r.level === 'block');
            const labels = recs.map(r => r.label);
            const messages = recs.map(r => r.message).filter(Boolean);
            return {
                level: hasBlock ? 'block' : 'warn',
                labels: labels,
                text: labels.map(l => l + '!').join(' '),
                message: messages.join(' ')
            };
        },

        checkFresh: async function() {
            const recs = this.list().filter(r => r.verify && r.verify.kind === 'volneDomy');
            if (recs.length) {
                let stav = null;
                try {
                    stav = this._volneDomy(await window.DarkElfUtils.fetchPage('/auto_domy.asp'));
                } catch (e) {
                    console.debug('[RoundGuard] ověření domů selhalo', e && e.message);
                }
                if (stav && stav.size) {
                    recs.forEach(r => {
                        const zbyva = {};
                        const jmena = [];
                        for (const id in (r.verify.lands || {})) {
                            const l = r.verify.lands[id];
                            const z = stav.get(parseInt(id, 10));
                            const potreba = z && z.pribude != null ? z.pribude : l.need;
                            if (z && z.volne >= potreba) continue;
                            zbyva[id] = z ? { name: l.name, need: potreba } : l;
                            jmena.push(l.name || ('#' + id));
                        }
                        if (!jmena.length) {
                            this.clear(r.key);
                        } else {
                            this.set(r.key, {
                                label: r.label, level: r.level,
                                message: jmena.length + ' z.: přírůstek > volné domy (dokup domů: ' + jmena.join(', ') + ')',
                                verify: { kind: 'volneDomy', lands: zbyva }
                            });
                        }
                    });
                }
            }
            return this.check();
        },

        _volneDomy: function(doc) {
            const out = new Map();
            if (!doc) return out;
            doc.querySelectorAll('form[name="form_domy"] table tr').forEach(tr => {
                const a = tr.querySelector('a[href^="e.asp?id="]');
                const m = a && (a.getAttribute('href') || '').match(/id=(\d+)/);
                if (!m) return;
                const id = parseInt(m[1], 10);
                const hSpan = doc.getElementById('es' + id + 'h');
                const bunka = hSpan && hSpan.closest('td');
                const vm = bunka && (bunka.textContent || '').match(/\((\d+)\)/);
                if (!vm) return;
                const plus = tr.querySelector('span[style*="color:#33AA33"]');
                const pm = plus && (plus.textContent || '').match(/\+\s*(\d+)/);
                out.set(id, { volne: parseInt(vm[1], 10), pribude: pm ? parseInt(pm[1], 10) : null });
            });
            return out;
        }
    };

    window.DarkElfUtils.Growth = {
        RESERVE_ENTI: 0.1,
        RESERVE_DEFAULT: 0.2,

        oneTurn: function(P, rate, granary, grove) {
            let g = Math.floor(P / 10) + 2;
            if (granary) g += 4;
            if (grove) g += 2;
            return Math.floor(g * rate / 2);
        },

        project: function(inhab, rate, granaryFromTurn, grove, turns, free) {
            let sim = inhab;
            const capped = (free != null);
            for (let i = 1; i <= turns; i++) {
                if (capped && free <= 0) break;
                let g = this.oneTurn(sim, rate, i >= granaryFromTurn, grove);
                if (capped) { if (g > free) g = free; free -= g; }
                sim += g;
            }
            return sim;
        },

        reserveForRace: function(race) {
            const enti = (typeof race === 'string')
                ? (race === 'Enti')
                : !!(race && (race.key === 'ents' || race.cz === 'Enti'));
            return enti ? this.RESERVE_ENTI : this.RESERVE_DEFAULT;
        },

        maxVerb: function(projInhab, houses, buy, race) {
            return Math.max(0, Math.floor(projInhab - this.reserveForRace(race) * (houses + buy)));
        },

        housePrice: function(currentHouses, buy, weather) {
            let total = 0;
            for (let c = 0; c < buy; c++) {
                total += Math.floor((60 + Math.pow((currentHouses + 1 + c) / 9, 2)) * weather * 100 / 10000);
            }
            return total;
        }
    };

    function spocitejUtok(t1, t2, t3, o) {
        const a = o.utoky;
        let utok = (t1 * a[0]) + (t2 * a[1]) + (t3 * a[2]);
        utok = Math.floor(utok * ((100 + o.heroPct) / 100));
        utok += o.heroAbs;
        if (o.modlitebna && utok >= 100) utok += 30;
        if (o.katapult && utok >= 200) utok += 60;
        const koef = 1 + (o.cesty ? 0.05 : 0) + (o.arena ? 0.10 : 0);
        utok = Math.floor(utok * koef);
        if (o.postih) utok = Math.round(utok * 0.7);
        if (o.knight) utok = utok * 1.1;
        return Math.floor(utok);
    }

    window.DarkElfUtils.Utok = {
        sila: function(pocty, o) { return spocitejUtok(pocty[0], pocty[1], pocty[2], o); }
    };

    window.DarkElfUtils.NeutralAPI = {
        SESTKA_SILA: 6,
        SESTKA_OBRANA: 5,
        MAG_SILA: 8,
        MAG_OBRANA: 4,

        DOMU_MIN: 48,

        OBYV_ZAKLAD: 10,

        STROP_SESTEK: 6,
        STROP_MAGU: 2,

        jeNeutralka: function(z) {
            return !!z && !z.hrac && z.min_utok != null && z.land_power > 0;
        },

        kandidati: function(z) {
            const out = [];
            const sila = z.land_power;
            const bonus = z.bonus_obrana || 0;
            for (let sestek = 0; sestek * this.SESTKA_SILA <= sila; sestek++) {
                const zbytek = sila - sestek * this.SESTKA_SILA;
                if (zbytek % this.MAG_SILA) continue;
                const magu = zbytek / this.MAG_SILA;
                const obrana = Math.floor(
                    (sestek * this.SESTKA_OBRANA + magu * this.MAG_OBRANA) * (1 + bonus / 100));
                out.push({ sestek: sestek, magu: magu, obyvatel: z.min_utok - obrana - 1 });
            }
            return out;
        },

        slozeni: function(z, den) {
            if (!this.jeNeutralka(z)) return null;
            const vsichni = this.kandidati(z);

            if (z.spehnora != null) {
                const sedi = vsichni.filter(k => k.obyvatel === z.spehnora);

                if (sedi.length !== 1) return null;
                return { sestek: sedi[0].sestek, magu: sedi[0].magu,
                         obyvatel: sedi[0].obyvatel, zdroj: 'spehnora' };
            }

            if (den == null || isNaN(den)) return null;

            const strop = this.OBYV_ZAKLAD + den;
            for (let i = 0; i < vsichni.length; i++) {
                const k = vsichni[i];
                if (k.obyvatel > strop) continue;

                if (k.sestek > den * 2 + this.STROP_SESTEK) return null;
                if (k.magu > den * 2 + this.STROP_MAGU) return null;
                return { sestek: k.sestek, magu: k.magu, obyvatel: k.obyvatel, zdroj: 'den' };
            }
            return null;
        },

        duvod: function(z, den) {
            if (!this.jeNeutralka(z)) return 'neni-neutralka';
            if (this.slozeni(z, den)) return 'ok';
            if (z.spehnora != null) return 'spehnora-nesedi';
            if (den == null || isNaN(den)) return 'bez-dne';
            return 'odlogla';
        },

        moznosti: function(z, den) {
            if (!this.jeNeutralka(z)) return [];
            return this.kandidati(z)
                .filter(k => k.obyvatel >= 0)
                .map(k => {
                    const domku = Math.max(this.DOMU_MIN, k.sestek + k.magu + k.obyvatel);
                    return { sestek: k.sestek, magu: k.magu, obyvatel: k.obyvatel,
                             domku: domku, mo: Math.floor(3 * k.magu * k.magu / domku) };
                })
                .sort((a, b) => a.mo - b.mo);
        },

        mo: function(z, den) {
            const s = this.slozeni(z, den);
            if (!s) return null;
            const domku = Math.max(this.DOMU_MIN, s.sestek + s.magu + s.obyvatel);
            const vez = window.DarkElfUtils.parseTower(z.img_vez);
            const zaklad = s.magu > 0 ? (3 * s.magu * s.magu / domku) : 0;
            const mo = Math.floor(zaklad * (vez ? (vez.magMul || 1) : 1) + (vez ? (vez.magAdd || 0) : 0));
            return { mo: mo, magu: s.magu, sestek: s.sestek, obyvatel: s.obyvatel,
                     domku: domku, vez: vez, zdroj: s.zdroj };
        }
    };

    window.DarkElfUtils.Spells = {

        LIST: {

            'Magický štít':        { cena: 30,     typ: 'zlute' },
            'Mana na zlato':       { cena: 60,     typ: 'zlute' },
            'Spokojenost':         { cena: 80,     typ: 'zlute' },
            'Magický štít velký':  { cena: 90,     typ: 'zlute' },
            'Příznivé počasí':     { cena: 100,    typ: 'zlute' },
            'Pás zmatení':         { cena: 100,    typ: 'zlute' },
            'Magické klima':       { cena: 150,    typ: 'zlute' },
            'Požehnání':           { cena: 200,    typ: 'zlute' },
            'Vojenský štít':       { cena: 200,    typ: 'zlute' },
            'Vojenský štít velký': { cena: 400,    typ: 'zlute' },

            'Ukrást peníze':       { cena: 30,     typ: 'cervene' },
            'Ukrást manu':         { cena: 30,     typ: 'cervene' },
            'Nespokojenost':       { cena: 40,     typ: 'cervene' },
            'Krupobití':           { cena: 50,     typ: 'cervene' },
            'Magický vír':         { cena: 50,     typ: 'cervene' },
            'Kletba':              { cena: 100,    typ: 'cervene' },
            'Dvojitá kletba':      { cena: 190,    typ: 'cervene' },
            'Blesk':               { cena: 200,    typ: 'cervene' },
            'Bouře':               { cena: 250,    typ: 'cervene' },
            'Černá smrt':          { cena: 350,    typ: 'cervene' },
            'Smrtící démon':       { cena: 600,    typ: 'cervene' },
            'Zemětřesení':         { cena: 800,    typ: 'cervene' },
            'Uragán':              { cena: 1500,   typ: 'cervene' },
            'Démon kamene':        { cena: 4000,   typ: 'cervene' },
            'Démon magie':         { cena: 5000,   typ: 'cervene' },
            'Soudný den':          { cena: 100000, typ: 'cervene' },

            'Magický šíp':         { cena: 20,   typ: 'cervene', rasa: 'Lidé' },
            'Strach':              { cena: 50,   typ: 'cervene', rasa: 'Barbaři' },
            'Magické oko':         { cena: 50,   typ: 'zlute',   rasa: 'Hobiti' },
            'Nápoj lásky':         { cena: 60,   typ: 'zlute',   rasa: 'Enti' },
            'Děs obyvatelstva':    { cena: 100,  typ: 'cervene', rasa: 'Skuruti' },
            'Odražeč štítů':       { cena: 100,  typ: 'cervene', rasa: 'Temní elfové' },
            'Neovlivnitelnost':    { cena: 120,  typ: 'zlute',   rasa: 'Trpaslíci' },
            'Uzdravení':           { cena: 125,  typ: 'zlute',   rasa: 'Elfové' },
            'Povodeň':             { cena: 300,  typ: 'cervene', rasa: 'Skřeti' },
            'Zasypání':            { cena: 800,  typ: 'cervene', rasa: 'Mágové' },
            'Zmrtvýchvstání':      { cena: 1200, typ: 'zlute',   rasa: 'Nekromanti' }
        },

        ALIAS: {
            'spoko':   'Spokojenost',
            'nespo':   'Nespokojenost',
            'des':     'Děs obyvatelstva',
            'neovl':   'Neovlivnitelnost',
            'pozehn':  'Požehnání',
            'klima':   'Magické klima',
            'pocasi':  'Příznivé počasí',
            'oko':     'Magické oko',

            'smd':     'Smrtící démon',
            'cs':      'Černá smrt',
            'pz':      'Pás zmatení',
            'msv':     'Magický štít velký',
            'pozeh':   'Požehnání',

            'vsv':        'Vojenský štít velký',
            'vvs':        'Vojenský štít velký',
            'priznivko':  'Příznivé počasí',
            'krupky':     'Krupobití',
            'k':          'Kletba',
            'dk':         'Dvojitá kletba',
            'neovlivko':  'Neovlivnitelnost',
            'uzdravko':   'Uzdravení',
            'zmrtko':     'Zmrtvýchvstání',

            'vir':        'Magický vír'
        },

        ZKRATKA: {
            'Spokojenost':         'spoko',
            'Nespokojenost':       'nespo',
            'Děs obyvatelstva':    'des',
            'Neovlivnitelnost':    'neovlivko',
            'Požehnání':           'Požeh',
            'Příznivé počasí':     'příznivko',
            'Magické oko':         'oko',
            'Krupobití':           'krupky',
            'Kletba':              'K',
            'Dvojitá kletba':      'DK',
            'Uzdravení':           'uzdrávko',
            'Zmrtvýchvstání':      'zmrtko',

            'Smrtící démon':       'SmD',
            'Černá smrt':          'ČS',
            'Magický štít velký':  'MŠV',
            'Vojenský štít velký': 'VŠV',
            'Pás zmatení':         'PZ',
            'Magický vír':         'vír'
        },

        OSY: {
            'Spokojenost':      { porodnost:  1 },
            'Příznivé počasí':  { zlato:      1 },
            'Magické klima':    { mana:       1 },
            'Požehnání':        { porodnost:  1, zlato:  1, mana:  1 },
            'Nespokojenost':    { porodnost: -1 },
            'Krupobití':        { zlato:     -1 },
            'Magický vír':      { mana:      -1 },
            'Kletba':           { porodnost: -1, zlato: -1, mana: -1 },
            'Dvojitá kletba':   { porodnost: -2, zlato: -2, mana: -2 }
        },

        DRZI_OSU:  { 'Neovlivnitelnost': ['porodnost'] },
        LECI_OSU:  { 'Uzdravení': ['zlato', 'mana'] },

        kroky: function(nazev) {
            return this.OSY[nazev] || null;
        },

        KATEGORIE: [

            { nazev: 'Nejčastější',   kouzla: ['Spokojenost'] },
            { nazev: 'Nejčastější',   kouzla: ['Nespokojenost'] },
            { nazev: 'Hospodářské',   kouzla: ['Mana na zlato', 'Příznivé počasí', 'Magické klima',
                                               'Požehnání', 'Krupobití', 'Magický vír',
                                               'Kletba', 'Dvojitá kletba'] },
            { nazev: 'Obranné',       kouzla: ['Magický štít', 'Magický štít velký', 'Pás zmatení',
                                               'Vojenský štít', 'Vojenský štít velký'] },
            { nazev: 'Zlodějské',     kouzla: ['Ukrást peníze', 'Ukrást manu'] },
            { nazev: 'Destruktivní',  kouzla: ['Blesk', 'Bouře', 'Černá smrt', 'Smrtící démon',
                                               'Zemětřesení', 'Uragán', 'Démon kamene',
                                               'Démon magie', 'Soudný den'] }
        ],

        kategorie: function(nazev) {
            for (let i = 0; i < this.KATEGORIE.length; i++) {
                const j = this.KATEGORIE[i].kouzla.indexOf(nazev);
                if (j > -1) return { skupina: i, poradi: j, nazev: this.KATEGORIE[i].nazev };
            }

            const rasova = Object.keys(this.LIST).indexOf(nazev);
            return { skupina: this.KATEGORIE.length,
                     poradi: rasova > -1 ? rasova : 999,
                     nazev: 'Speciální' };
        },

        zkratka: function(nazev) {
            return this.ZKRATKA[nazev] || nazev;
        },

        norm: function(text) {
            return String(text == null ? '' : text)
                .toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/_/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        },

        _index: null,
        _build: function() {
            if (this._index) return this._index;
            const idx = {};
            for (const nazev in this.LIST) idx[this.norm(nazev)] = nazev;
            for (const zkratka in this.ALIAS) idx[this.norm(zkratka)] = this.ALIAS[zkratka];
            this._index = idx;
            return idx;
        },

        byName: function(text) {
            const t = this.norm(text);
            if (!t) return null;
            const idx = this._build();

            let klic = null;
            if (idx[t]) {
                klic = t;
            } else {
                for (const k in idx) {
                    if (t.indexOf(k) !== 0) continue;

                    const dalsi = t.charAt(k.length);
                    if (dalsi && /[^\W\d_]/u.test(dalsi)) continue;
                    if (!klic || k.length > klic.length) klic = k;
                }
            }
            if (!klic) return null;

            const nazev = idx[klic];
            const info = this.LIST[nazev];

            const raw = String(text == null ? '' : text);
            let zbytekRaw = '';
            for (let i = 1; i <= raw.length; i++) {
                if (this.norm(raw.slice(0, i)) === klic) { zbytekRaw = raw.slice(i).trim(); break; }
            }

            return {
                nazev: nazev,
                cena: info.cena,
                typ: info.typ,
                rasa: info.rasa || null,
                zbytek: t.slice(klic.length).trim(),
                zbytekRaw: zbytekRaw
            };
        },

        maSlevu: function(nazev) {
            const info = this.LIST[nazev];
            return !!info && info.typ === 'zlute';
        },

        slevaRozsah: function(mojeRasaId) {
            const out = { nejlepsi: 0, moje: 0, dostupne: false };
            try {
                const counts = window.DarkElfUtils.AllianceAPI.getRaceCounts();
                if (!counts || !counts.total) return out;
                out.dostupne = true;
                for (const id in counts.byId) {
                    const d = window.DarkElfUtils.AllianceAPI.getDiscount(parseInt(id, 10), 'spells');
                    if (d > out.nejlepsi) out.nejlepsi = d;
                }
                if (mojeRasaId != null) {
                    out.moje = window.DarkElfUtils.AllianceAPI.getDiscount(parseInt(mojeRasaId, 10), 'spells');
                }
            } catch (e) {  }
            return out;
        }
    };

    window.DarkElfUtils.SpellsCastAPI = {
        URL: '/spells_list.asp?sort=1',
        _CACHE: 'spells_cast',

        _idZOdkazu: function(a, klic) {
            const m = String((a && a.getAttribute('href')) || '').match(new RegExp(klic + '=(\\d+)'));
            return m ? parseInt(m[1], 10) : null;
        },

        parse: function(doc) {
            const out = { clenove: [], kouzla: [] };
            if (!doc || !doc.querySelectorAll) return out;
            const cist = (el) => String((el && el.textContent) || '').replace(/\s+/g, ' ').trim();

            doc.querySelectorAll('p').forEach(p => {
                const a = p.querySelector('a[href*="id_player="]');
                if (!a) return;
                const m = cist(p).match(/:\s*(\d+)\s*\/\s*(\d+),\s*s[íi]la:\s*(\d+)\s*-\s*(\d+)/i);
                if (!m) return;
                out.clenove.push({
                    jmeno: cist(a), id: this._idZOdkazu(a, 'id_player'),
                    seslano: parseInt(m[1], 10), celkem: parseInt(m[2], 10),
                    silaMin: parseInt(m[3], 10), silaMax: parseInt(m[4], 10)
                });
            });

            let kouzlic = null, kouzlicId = null, cil = null, cilId = null, samSobe = false;
            doc.querySelectorAll('th, p, span').forEach(el => {
                if (el.tagName === 'TH') {
                    if (!/Kouzla\s+vl[áa]dce/i.test(cist(el))) return;
                    const a = el.querySelector('a[href*="id_player="]');
                    kouzlic = a ? cist(a) : null;
                    kouzlicId = a ? this._idZOdkazu(a, 'id_player') : null;
                    cil = null; cilId = null; samSobe = false;
                    return;
                }
                if (el.tagName === 'P') {
                    const a = el.querySelector('a[href*="id_player_dest="]');
                    if (!a) return;
                    cil = cist(a);
                    cilId = this._idZOdkazu(a, 'id_player_dest');
                    samSobe = /s[áa]m\s+sob[ěe]/i.test(cist(el));
                    return;
                }

                const aZem = el.querySelector && el.querySelector(':scope > a[href*="spells_list.asp?l="]');
                if (!aZem) return;

                let zbytek = '';
                for (let n = aZem.nextSibling; n; n = n.nextSibling) zbytek += (n.textContent || '');
                const m = zbytek.replace(/\s+/g, ' ').match(/^\s*-\s*(.+?):\s*(-?\d+)/);
                if (!m) return;

                const info = window.DarkElfUtils.Spells.byName(m[1]);
                out.kouzla.push({
                    kouzlic: kouzlic, kouzlicId: kouzlicId,
                    cil: cil, cilId: cilId, samSobe: samSobe,
                    zeme: cist(aZem), zemeId: this._idZOdkazu(aZem, 'l'),
                    kouzlo: info ? info.nazev : m[1].trim(),
                    typ: info ? info.typ : null,
                    sila: parseInt(m[2], 10)
                });
            });
            return out;
        },

        fetch: async function(force) {
            const C = window.DarkElfUtils.Cache;
            if (!force) {
                const c = C.get('api', this._CACHE);
                if (c) return c;
            }
            try {
                const doc = await window.DarkElfUtils.fetchPage(this.URL);
                if (!doc) return C.get('api', this._CACHE) || null;
                const data = this.parse(doc);

                if (!data.kouzla.length && !data.clenove.length) return C.get('api', this._CACHE) || null;

                C.set('api', this._CACHE, data);
                return data;
            } catch (e) {
                console.warn('DarkElfUtils.SpellsCastAPI.fetch:', e.message);
                return C.get('api', this._CACHE) || null;
            }
        },

        get: function() { return window.DarkElfUtils.Cache.get('api', this._CACHE); }
    };

    window.DarkElfUtils.AttacksAPI = {
        URL: '/attacks_list.asp?id_player=all',
        _CACHE: 'attacks',

        DOBYVACNY: 4,
        PRESUN: 1,

        _cislo: function(v) {
            const t = String(v == null ? '' : v).trim();
            return /^\d+$/.test(t) ? parseInt(t, 10) : null;
        },

        _bezDiakritiky: function(t) {
            return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        },

        _smer: function(td) {
            let t = '';
            for (let n = td.firstChild; n; n = n.nextSibling) {
                if (n.nodeName === 'BR') break;
                t += (n.textContent || '');
            }
            const cist = (x) => String(x).replace(/\s+/g, ' ').trim();
            const i = t.indexOf('=>');
            if (i < 0) return { odkud: '', kam: cist(t) };
            return { odkud: cist(t.slice(0, i)), kam: cist(t.slice(i + 2)) };
        },

        parse: function(doc) {
            const out = { utoky: [] };
            if (!doc || !doc.querySelectorAll) return out;
            doc.querySelectorAll('td[id_attack]').forEach(td => {
                const zemeId = this._cislo(td.getAttribute('id_to'));
                if (zemeId == null) return;
                const obranceId = this._cislo(td.getAttribute('id_defender'));
                const smer = this._smer(td);
                out.utoky.push({
                    id: this._cislo(td.getAttribute('id_attack')),
                    typ: this._cislo(td.getAttribute('id_type')),
                    typNazev: String(td.getAttribute('localized_name') || '').trim(),
                    utocnik: String(td.getAttribute('name_attacker') || '').trim(),
                    utocnikId: this._cislo(td.getAttribute('id_attacker')),
                    obrance: String(td.getAttribute('name_defender') || '').trim(),
                    obranceId: obranceId,
                    neutral: obranceId == null,
                    zemeId: zemeId,
                    zeme: smer.kam,
                    odkudId: this._cislo(td.getAttribute('id_from')),
                    odkud: smer.odkud,
                    sila: this._cislo(td.getAttribute('power')) || 0
                });
            });
            return out;
        },

        dobyvaneZeme: function(data) {
            const out = {};
            ((data && data.utoky) || []).forEach(u => {
                if (u.typ !== this.DOBYVACNY) return;
                (out[u.zemeId] = out[u.zemeId] || []).push(u);
            });
            return out;
        },

        _jeToOnaStranka: function(doc) {
            return this._bezDiakritiky((doc && doc.title) || '').indexOf('seznam vsech utok') > -1;
        },

        fetch: async function(force) {
            const C = window.DarkElfUtils.Cache;
            if (!force) {
                const c = C.get('api', this._CACHE);
                if (c) return c;
            }
            try {
                const doc = await window.DarkElfUtils.fetchPage(this.URL);
                if (!doc) return C.get('api', this._CACHE) || null;
                const data = this.parse(doc);

                if (!data.utoky.length && !this._jeToOnaStranka(doc)) {
                    return C.get('api', this._CACHE) || null;
                }
                C.set('api', this._CACHE, data);
                return data;
            } catch (e) {
                console.warn('DarkElfUtils.AttacksAPI.fetch:', e.message);
                return C.get('api', this._CACHE) || null;
            }
        },

        get: function() { return window.DarkElfUtils.Cache.get('api', this._CACHE); }
    };

    function _parseHeroIds(doc, countryId) {
        if (!doc) return [];
        const cid = String(countryId);
        const ids = [];
        const sber = (root) => {
            root.querySelectorAll('a[href*="hero.asp?h="]').forEach(link => {
                const m = (link.getAttribute('href') || '').match(/hero\.asp\?h=(\d+)/i);
                if (m) {
                    const id = parseInt(m[1], 10);
                    if (!ids.includes(id)) ids.push(id);
                }
            });
        };

        if (/^[\w-]+$/.test(cid)) {
            doc.querySelectorAll('[id="h' + cid + '"]').forEach(sber);
        } else {
            const el = doc.getElementById('h' + cid);
            if (el) sber(el);
        }
        return ids;
    }

    let _mapDocPromise = null;
    function _fetchMapDoc() {
        if (!_mapDocPromise) _mapDocPromise = window.DarkElfUtils.fetchPage('/map_new.asp');
        return _mapDocPromise;
    }

    if (window.location.pathname.toLowerCase().includes('map_new.asp') ||
        window.name === 'mapa') {

        window.parent.addEventListener('message', function(event) {
            const msg = event.data;
            if (!msg || msg.type !== 'DE_HERO_REQUEST' || !msg.id) return;
            const heroIds = _parseHeroIds(document, msg.id);
            try {
                window.parent.postMessage(
                    { type: 'DE_HERO_RESPONSE', id: msg.id, heroIds },
                    '*'
                );
            } catch(e) {}
        });
    }

    async function nactiHrdinu(id) {

        const zCache = window.DarkElfUtils.Cache.get('heroStat', id);
        if (zCache) return zCache;

        const doc = await window.DarkElfUtils.fetchPage('/hero.asp?h=' + id);
        if (!doc) return null;

        const h = { id: id, jmeno: null, majitel: null, majitelId: null, stav: null,
                    utok: 0, obrana: 0, pctUtok: 0, pctObrana: 0, precteno: false };

        const portret = doc.querySelector('a[href*="artefacts_list.asp?h="]');
        const jmenoTd = portret && portret.closest('td') && portret.closest('td').nextElementSibling;
        if (jmenoTd) {
            h.jmeno = jmenoTd.textContent.replace(/ /g, ' ').trim().split(/\s{2,}|\n/)[0].trim();
        }

        for (const td of doc.querySelectorAll('td')) {
            const popisek = td.textContent.replace(/ /g, ' ').trim().toLowerCase();
            const hodnota = td.nextElementSibling;
            if (!hodnota) continue;
            const radek = td.closest('tr');
            const cisla = radek ? (radek.textContent.match(/-?\d+/g) || []) : [];

            if (popisek.indexOf('ve služb') === 0 || popisek.indexOf('ve sluzb') === 0) {
                h.majitel = hodnota.textContent.replace(/ /g, ' ').trim();
                const odkaz = hodnota.querySelector('a[href*="mapa.asp?hrac="]');
                const m = odkaz && odkaz.getAttribute('href').match(/hrac=(\d+)/);
                if (m) h.majitelId = m[1];
            } else if (popisek === 'stav') {
                h.stav = hodnota.textContent.trim();
            } else if (popisek.indexOf('tok a obrana') >= 0) {
                h.precteno = true;
                if (cisla.length >= 2) { h.utok = parseInt(cisla[0], 10) || 0; h.obrana = parseInt(cisla[1], 10) || 0; }
                else if (cisla.length === 1) { h.utok = parseInt(cisla[0], 10) || 0; }
            } else if (popisek.indexOf('level útok') === 0 || popisek.indexOf('level tok') === 0) {
                if (cisla.length) h.pctUtok = parseInt(cisla[0], 10) || 0;
            } else if (popisek.indexOf('level obrana') === 0) {
                if (cisla.length) h.pctObrana = parseInt(cisla[0], 10) || 0;
            }
        }

        if (!h.precteno) return null;

        window.DarkElfUtils.Cache.set('heroStat', id, h);
        return h;
    }

    function jeMuj(h, mojeId, mojeJmeno) {
        if (h.majitel === null) return true;
        if (h.majitelId && mojeId && String(h.majitelId) === String(mojeId)) return true;
        return !!(mojeJmeno && h.majitel === mojeJmeno);
    }

    window.DarkElfUtils.HeroAPI = {

        getStat: nactiHrdinu,

        jeMuj: jeMuj,

        getIds: function(countryId, forceRefresh) {
            if (!forceRefresh) {
                const cached = window.DarkElfUtils.Cache.get('heroIds', countryId);
                if (cached !== null) return Promise.resolve(cached);
            }

            function _fallback(duvod, resolve) {
                return _fetchMapDoc().then(doc => {
                    if (!doc) {
                        console.warn('DarkElfUtils.HeroAPI.getIds: ' + duvod + ' a záložní' +
                                     ' stažení map_new.asp selhalo (země ' + countryId + ')' +
                                     ' – počítá se BEZ hrdinů.');
                        resolve([]);
                        return;
                    }
                    const ids = _parseHeroIds(doc, countryId);
                    window.DarkElfUtils.Cache.set('heroIds', countryId, ids);
                    console.warn('DarkElfUtils.HeroAPI.getIds: ' + duvod +
                                 ' – hrdiny (' + ids.length + ') jsem vzal ze staženého' +
                                 ' map_new.asp (země ' + countryId + ').');
                    resolve(ids);
                });
            }

            if (window.parent === window) {
                return new Promise((resolve) => _fallback('stránka běží mimo herní rámy', resolve));
            }

            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    window.parent.removeEventListener('message', handler);

                    _fallback('mapový rám neodpověděl do 3 s', resolve);
                }, 3000);

                function handler(event) {
                    const msg = event.data;
                    if (!msg || msg.type !== 'DE_HERO_RESPONSE') return;
                    if (String(msg.id) !== String(countryId)) return;
                    clearTimeout(timeout);
                    window.parent.removeEventListener('message', handler);
                    const ids = msg.heroIds || [];
                    window.DarkElfUtils.Cache.set('heroIds', countryId, ids);
                    resolve(ids);
                }

                window.parent.addEventListener('message', handler);
                try {
                    window.parent.postMessage(
                        { type: 'DE_HERO_REQUEST', id: countryId },
                        '*'
                    );
                } catch(e) {
                    clearTimeout(timeout);
                    window.parent.removeEventListener('message', handler);
                    _fallback('postMessage selhal (' + e.message + ')', resolve);
                }
            });
        }
    };

    let currentLeague = window.DarkElfUtils.getLeague();
    if (currentLeague !== 'DEFAULT' && !window.location.pathname.includes('login') && !window.location.pathname.includes('ligy.asp')) {
        localStorage.setItem("de_last_known_league", currentLeague);
    }

    document.addEventListener('click', function(e) {
        if (localStorage.getItem('de_picker_mode') === 'hero') {
            const link = e.target.closest('a');
            if (link && link.href && link.href.toLowerCase().includes('hero.asp?h=')) {
                e.preventDefault();
                e.stopPropagation();
                let m = link.href.match(/hero\.asp\?h=(\d+)/i);
                if (m) {
                    localStorage.removeItem('de_picker_mode');
                    let overlay = document.getElementById('de-picker-overlay');
                    if (overlay) overlay.remove();

                    const msg = { type: 'DE_HERO_PICKED', id: m[1] };
                    const broadcast = (win) => {
                        try { win.postMessage(msg, '*'); } catch(err){}
                        try {
                            for(let i=0; i<win.frames.length; i++) {
                                broadcast(win.frames[i]);
                            }
                        } catch(err){}
                    };
                    broadcast(window.top);
                }
            }
        }
    }, true);

    try { window.DarkElfUtils.Prihlaseni._priNacteni(); }
    catch (e) { console.warn('DarkElfUtils.Prihlaseni:', e); }

    console.log(`[DarkElfUtils v${window.DarkElfUtils.VERSION}] Inicializováno pro ligu: ${currentLeague}`);

})();

}

(async function () {
    'use strict';

    if (window.__deRozjezdBezi) return;
    window.__deRozjezdBezi = true;

    const jeMapa = /\/(mapa|map_new)\.asp/i.test(location.pathname);

    if (window.top === window && /\/world\.htm/i.test(location.pathname)) {
        try { sessionStorage.removeItem('de_rozjezd_otevreny'); } catch (e) { }
        return;
    }
    if (!jeMapa && document.body.id !== 'centrala') return;
    if (!window.DarkElfUtils) {
        console.error("Dark Elf - Rozjezd: Nenalezeno jádro 'Dark Elf - Core Utils'!");
        return;
    }

    function rjHostitel() {
        try {
            const ramy = window.parent && window.parent !== window ? window.parent.frames : [];
            for (let i = 0; i < ramy.length; i++) {
                try { if (ramy[i] !== window && ramy[i].__deRozjezd) return ramy[i].__deRozjezd; } catch (e) { }
            }
        } catch (e) { }
        return null;
    }

    const jeVojsko = !jeMapa && /\/utok\.asp/i.test(location.pathname) && !!document.querySelector('input[name="T1"]');

    let targetTd = null, parentTr = null;
    if (!jeMapa) {

        const host = rjHostitel();
        if (host) { try { host.obnov(); } catch (e) { } }
        const searchText = 'Pro získání země potřebuješ poslat dobyvačný útok o síle:';
        targetTd = Array.from(document.querySelectorAll('td')).find(td => td.textContent.includes(searchText));
        if (!targetTd && !jeVojsko) return;
        parentTr = targetTd ? targetTd.closest('tr') : null;
        if (targetTd && !parentTr) return;
    }

    if (!window.DarkElfUtils.Utok || !window.DarkElfUtils.HeroAPI.getStat) {
        console.error('Dark Elf - Rozjezd: jádro je starší než v2.38 (chybí Utok / HeroAPI.getStat).');
        if (jeMapa || jeVojsko) return;
        const tr = document.createElement('tr');
        tr.id = 'rj-radek';
        tr.innerHTML = `<td colspan="${targetTd.colSpan || 2}" style="text-align:center; padding:4px 0; color:#ff6666; font-size:11px;">`
            + 'Rozjezd potřebuje Core Utils v2.38 — přeinstaluj jádro</td>';
        parentTr.parentElement.appendChild(tr);
        return;
    }

    function cilZeStranky(doc) {
        const odkaz = doc.querySelector('th[colspan] a[href*="mapa.asp?zeme="]');
        const m = odkaz && odkaz.getAttribute('href').match(/zeme=(\d+)/);
        return m ? m[1] : null;
    }
    function rjZemeTady() {
        for (const w of (jeMapa ? rjRamy() : [window])) {
            try {
                const d = w.document;
                if (!d || !d.body || d.body.id !== 'centrala') continue;
                const p = new URLSearchParams(w.location.search);
                return cilZeStranky(d) || p.get('id') || p.get('zem') || p.get('z') || 'default';
            } catch (e) { }
        }
        return 'default';
    }

    const UnitStats = window.DarkElfUtils.UnitStats;
    try { await window.DarkElfUtils.MapAPI.fetch(); } catch (e) {  }
    const mojeRasa = window.DarkElfUtils.MapAPI.getMyRace();
    const raceName = (mojeRasa && UnitStats[mojeRasa.key]) ? mojeRasa.key : 'men';
    const czechRaceName = window.DarkElfUtils.Races.byKey(raceName)?.cz || raceName;
    const raceData = UnitStats[raceName];
    const UNITS = {
        T1: { attack: raceData[1].attack, defence: raceData[1].defence },
        T2: { attack: raceData[2].attack, defence: raceData[2].defence },
        T3: { attack: raceData[3].attack, defence: raceData[3].defence }
    };

    function cislo(v) {
        return Math.max(0, parseInt(v, 10) || 0);
    }

    let rjVlastni = false;
    const rjRasa = () => (rjVlastni && rjPlan && UnitStats[rjPlan.rasa]) ? rjPlan.rasa : raceName;
    const rjRasaCz = () => window.DarkElfUtils.Races.byKey(rjRasa())?.cz || rjRasa();
    const rjUtoky = () => { const r = UnitStats[rjRasa()]; return [r[1].attack, r[2].attack, r[3].attack]; };

    function spocitejUtok(t1, t2, t3, o) {
        return window.DarkElfUtils.Utok.sila([t1, t2, t3], Object.assign({}, o, { utoky: rjUtoky() }));
    }
    const nactiHrdinu = (id) => window.DarkElfUtils.HeroAPI.getStat(id);
    const jeMuj = (h, mojeId, mojeJmeno) => window.DarkElfUtils.HeroAPI.jeMuj(h, mojeId, mojeJmeno);

    let posadkyZemi = {}, posadkySnimek = null;

    function posadkaZeme(zemId) {
        if (!zemId) return null;

        const snimek = window.DarkElfUtils.Cache.get('api', 'map_json');
        if (snimek !== posadkySnimek) { posadkyZemi = {}; posadkySnimek = snimek; }
        if (!(zemId in posadkyZemi)) {
            const p = window.DarkElfUtils.MapAPI.getPrivate(zemId);

            if (p) posadkyZemi[zemId] = [cislo(p.doma_war1), cislo(p.doma_war2), cislo(p.doma_war3)];
            if (!p) {
                console.warn('Kalkulačka dobytí: k zemi ' + zemId + ' nemám private data,'
                    + ' posádku neznám (počítám s nulou).');
            }
        }
        return posadkyZemi[zemId];
    }

    const RJ_DNY = ['DNES', 'ZÍTRA', 'POZÍTŘÍ'];
    const RJ_MAX_VETVI = 8;
    const RJ_PREDVOLBY = [

        { nazev: '1 › 4 › 6 › 8', dny: 3, zdroju: 1, vetve: [{ zdroj: 0, dal: ['utok', 'utok'] },
            { zdroj: 0, dal: ['utok', 'utok'] }, { zdroj: 0, dal: ['presun'] }] },

        { nazev: '2 › 6 › 10', dny: 2, zdroju: 2, vetve: [{ zdroj: 0, dal: ['utok'] }, { zdroj: 0, dal: ['utok'] },
            { zdroj: 1, dal: ['utok'] }, { zdroj: 1, dal: ['utok'] }] },

        { nazev: '2 › 5 › 7', dny: 2, zdroju: 2, vetve: [{ zdroj: 0, dal: ['utok'] }, { zdroj: 0, dal: ['utok'] },
            { zdroj: 1, dal: ['presun'] }] }
    ];
    const RJ_STRUKTURY = 'de_rozjezd_struktury';

    function rjSt(P) {
        P = P || rjPlan;
        const dny = Math.min(3, Math.max(1, parseInt(P.dny, 10) || 1));
        const den = [[], [], []], pred = {}, dalsi = {}, vetev = {}, denKroku = {};
        (P.vetve || []).forEach((v, i) => v.kroky.forEach((x, d) => {
            if (d >= dny) return;
            den[d].push(x); vetev[x] = i; denKroku[x] = d;
            if (d > 0) pred[x] = v.kroky[d - 1];
            if (d + 1 < dny) dalsi[x] = v.kroky[d + 1];
        }));
        return { dny: dny, den: den, pred: pred, dalsi: dalsi, vetev: vetev, denKroku: denKroku,
                 zdroj: (x) => ((P.vetve[vetev[x]] || {}).zdroj) || 0 };
    }

    function rjJinam(P, st, x) {
        const vl = st.zdroj(x);
        return (P.zdroje || []).map((z, i) => i).filter(i => i !== vl && P.zdroje[i].jinam);
    }

    function rjCileStruktury(P, st) {
        const S = P.sloty, cile = {};
        for (let d = 1; d < st.dny; d++) {
            cile[d] = st.den[d].filter(y => {
                if (!S[y] || !S[y].zem) return false;
                for (let x = st.pred[y]; x; x = st.pred[x]) if (!S[x].zem || S[x].dal === 'presun') return false;
                return true;
            });
        }
        return cile;
    }

    const rjStitek = (i) => i < 26 ? String.fromCharCode(65 + i)
        : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + i % 26);

    function rjVolnyStitek(P) {
        const pouzite = {};
        (P.vetve || []).forEach(v => v.kroky.forEach(x => { pouzite[x] = true; }));
        for (let i = 0; i < 26 * 27; i++) { const x = rjStitek(i); if (!pouzite[x]) return x; }
        return null;
    }

    function rjNovySlot() {

        return { zem: '', pu: '', u: [0, 0, 0], p: [0, 0, 0], pj: [], h: false, r: false, w: false, dal: 'utok' };
    }

    function rjNovyZdroj(P, uz) {
        const pouzite = (uz || P.zdroje || []).map(z => String(z.zem));
        const volna = (rjData ? rjData.moje : []).find(z => pouzite.indexOf(z.id) === -1);
        return { zem: (!rjVlastni && volna) ? volna.id : '', dom: ['', '', ''], limit: '', jinam: false,
                 verbZ: rjVerbZNovy(P) };
    }

    function rjNazevStruktury(P) {
        P = P || rjPlan;
        const st = rjSt(P), S = P.sloty;
        const pocty = [P.zdroje.length];
        for (let d = 0; d < st.dny; d++) {
            const utoku = st.den[d].filter(x => {
                if (!(S[x] || {}).zem && (P.zdroje[st.zdroj(x)] || {}).jinam) return false;
                for (let y = st.pred[x]; y; y = st.pred[y]) if ((S[y] || {}).dal === 'presun') return false;
                return true;
            }).length;
            pocty.push(pocty[pocty.length - 1] + utoku);
        }
        return pocty.join(' › ');
    }

    function rjTvarPlanu(P) {
        const st = rjSt(P);
        return { nazev: rjNazevStruktury(P), dny: st.dny, zdroju: P.zdroje.length,
                 vetve: P.vetve.map(v => ({ zdroj: v.zdroj,
                     dal: v.kroky.slice(0, 2).map(x => (P.sloty[x] || {}).dal === 'presun' ? 'presun' : 'utok') })) };
    }

    function rjPouzijStrukturu(P, tvar) {
        const zdroje = [];
        for (let i = 0; i < tvar.zdroju; i++) zdroje.push(P.zdroje && P.zdroje[i] ? P.zdroje[i] : rjNovyZdroj(P, zdroje));
        P.zdroje = zdroje;
        P.dny = tvar.dny;
        P.sloty = {};
        P.rozdel = {};
        P.vetve = tvar.vetve.map(v => ({ zdroj: Math.min(v.zdroj, zdroje.length - 1), kroky: [] }));
        P.den0 = rjHerniDen();

        for (let d = 0; d < 3; d++) {
            P.vetve.forEach((v, i) => {
                const x = rjVolnyStitek(P);
                v.kroky.push(x);
                P.sloty[x] = rjNovySlot();
                const dal = (tvar.vetve[i].dal || [])[d];
                if (dal === 'presun') P.sloty[x].dal = 'presun';
            });
        }
        P.navrhInfo = '';
    }

    function rjUlozeneStruktury() {
        try { const a = JSON.parse(localStorage.getItem(RJ_STRUKTURY)); return Array.isArray(a) ? a : []; }
        catch (e) { return []; }
    }

    function rjUlozStrukturu(P) {
        const t = rjTvarPlanu(P);
        const a = rjUlozeneStruktury().filter(s => s.nazev !== t.nazev);
        a.push(t);
        try { localStorage.setItem(RJ_STRUKTURY, JSON.stringify(a)); return true; } catch (e) { return false; }
    }

    function rjSmazStrukturu(nazev) {
        try { localStorage.setItem(RJ_STRUKTURY, JSON.stringify(rjUlozeneStruktury().filter(s => s.nazev !== nazev))); }
        catch (e) { }
    }

    const RJ_CENY = {
        men:          [[30, 0], [90, 7], [150, 20]],
        necromancers: [[10, 0], [0, 15], [150, 15]],
        barbarians:   [[40, 0], [100, 5], [160, 20]],
        elves:        [[25, 0], [60, 8], [100, 15]],
        ents:         [[20, 0], [90, 0], [200, 0]],
        hobbits:      [[22, 0], [100, 10], [100, 25]],
        magi:         [[0, 4], [0, 20], [0, 15]],
        orcs:         [[30, 0], [200, 9], [100, 30]],
        uruks:        [[50, 0], [130, 4], [120, 30]],
        'dark elves': [[30, 0], [50, 9], [60, 10]],
        dwarves:      [[10, 0], [40, 2], [200, 2]]
    };

    function rjPotrebnyUtok(z, den, dny, narust, obyvDen) {
        if (!z || z.min_utok == null) return null;
        const N = window.DarkElfUtils.NeutralAPI;
        const k = 1 + (z.bonus_obrana || 0) / 100;
        const s = (N && N.slozeni && !z.vlastni) ? N.slozeni(z, den) : null;
        let obrana, obyv;
        if (s) {
            obrana = s.sestek * N.SESTKA_OBRANA + s.magu * N.MAG_OBRANA;
            obyv = s.obyvatel;
        } else {
            obyv = 10 + (parseInt(den, 10) || 0);
            obrana = Math.max(0, (z.min_utok - obyv - 1) / k);
        }
        if (!dny) return { pu: z.min_utok, presne: !!s };
        return { pu: Math.floor((obrana + dny * narust) * k) + obyv + dny * obyvDen + 1, presne: !!s };
    }

    function rjZtraty(pocty, sila, pu) {
        if (!(sila > 0)) return pocty.slice();
        if (pu >= 3 * sila) return pocty.slice();
        const r = pu / sila;
        return pocty.map(n => Math.floor(n * r / 3));
    }

    function rjKolikJesteTreba(druh, pocty, pu, sila) {
        const s = (n) => { const c = pocty.slice(); c[druh] += n; return sila(c); };
        if (s(0) >= pu) return 0;
        let horni = 1;
        while (s(horni) < pu) { horni *= 2; if (horni > 1000000) return null; }
        let dolni = Math.floor(horni / 2) + 1;
        while (dolni < horni) {
            const m = Math.floor((dolni + horni) / 2);
            if (s(m) >= pu) horni = m; else dolni = m + 1;
        }
        return dolni;
    }

    function rjObrancu(z, den, dny, nejmene) {
        if (!z || z.min_utok == null) return 0;
        const jednotek = nejmene ? 1 : 4, obyvatel = nejmene ? 0 : 1;
        const N = window.DarkElfUtils.NeutralAPI;
        const s = (N && N.slozeni && !z.vlastni) ? N.slozeni(z, den) : null;
        if (s) return s.sestek + s.magu + jednotek * dny + s.obyvatel + obyvatel * dny;
        const obyv = 10 + (parseInt(den, 10) || 0);
        const k = 1 + (z.bonus_obrana || 0) / 100;
        return Math.max(0, Math.round((z.min_utok - obyv - 1) / k / 4.5)) + jednotek * dny + obyv + obyvatel * dny;
    }

    function rjRozdelUmerne(celkem, vahy) {
        const sum = vahy.reduce((a, b) => a + b, 0);
        if (!(sum > 0) || !(celkem > 0)) return vahy.map(() => 0);
        const out = vahy.map(w => Math.floor(celkem * w / sum));
        let zbytek = celkem - out.reduce((a, b) => a + b, 0);
        const poradi = vahy.map((w, i) => i).sort((a, b) => vahy[b] - vahy[a]);
        for (let k = 0; zbytek > 0; k = (k + 1) % poradi.length, zbytek--) out[poradi[k]]++;
        return out;
    }

    function rjLimitZdroje(z, rezerva) {
        if (z.limitVerbu != null) return z.limitVerbu;
        if (!z.priv || z.priv.obyvatel == null || z.priv.domu == null) return null;
        return Math.max(0, Math.floor(z.priv.obyvatel - rezerva * (z.priv.domu + (z.priv.dokupRust || 0))));
    }

    const rjSmiVerb = (z, t) => (((z || {}).verbZ) || [])[t] !== false;

    const rjVerbZNovy = (P) => (((P || {}).zdroje || [])[0] || {}).verbZ
        ? [0, 1, 2].map(t => rjSmiVerb(P.zdroje[0], t)) : [false, true, false];

    const rjVerbZUlozeny = (z, ul) => Array.isArray((z || {}).verbZ) ? [0, 1, 2].map(t => z.verbZ[t] !== false)
        : (Array.isArray((ul || {}).verbZ) ? [0, 1, 2].map(t => !!ul.verbZ[t]) : [false, true, false]);

    const rjSmiVerbZdroju = (zdroje) => (zdroje || []).map(z => [0, 1, 2].map(t => rjSmiVerb(z, t)));

    const RJ_CECH = ['', 'Cech války', 'Cech magie'];

    function rjRozdelVerb(v, limity, smi) {
        const out = limity.map(() => [0, 0, 0]), volno = limity.map(l => l || 0);
        const sirka = limity.map((l, i) => smi ? [0, 1, 2].filter(t => smi[i][t]).length : 3);
        [2, 1, 0].forEach(t => {
            let n = v[t];
            const poradi = limity.map((l, i) => i).filter(i => !smi || smi[i][t])
                .sort((a, b) => sirka[a] - sirka[b]);
            for (let k = 0; k < poradi.length && n > 0; k++) {
                const i = poradi[k], kolik = Math.min(n, volno[i]);
                out[i][t] += kolik; volno[i] -= kolik; n -= kolik;
            }
        });
        return out;
    }

    function rjKolikVerbovat(d, vz) {
        const limity = d.zdroje.map(z => rjLimitZdroje(z, d.rezerva));
        const smi = rjSmiVerbZdroju(d.zdroje);
        const prazdne = { v: [0, 0, 0], limit: null, limity: limity, smi: smi, rozdeleni: limity.map(() => [0, 0, 0]) };
        if (limity.every(l => l == null)) return prazdne;
        const limit = limity.reduce((a, l) => a + (l || 0), 0);

        const limitT = [0, 1, 2].map(t => limity.reduce((a, l, i) => a + (smi[i][t] ? (l || 0) : 0), 0));
        const ut = rjUtoky();
        if (!limit) return Object.assign(prazdne, { limit: limit });
        const ceny = d.ceny;
        const zl = d.rozpocet && d.rozpocet.zl > 0 ? d.rozpocet.zl : Infinity;
        const mana = d.rozpocet && d.rozpocet.mana > 0 ? d.rozpocet.mana : Infinity;

        const domyZl = (n) => {
            if (zl === Infinity || !d.cenaDomu) return 0;
            let zbyva = n, cena = 0;
            d.zdroje.forEach((z, i) => {
                const k = Math.min(zbyva, limity[i] || 0);
                zbyva -= k;
                if (!z.priv) return;
                const doma = z.doma.reduce((a, b) => a + b, 0) + (z.leti || [0, 0, 0]).reduce((a, b) => a + b, 0);
                const dokup = Math.max(0, Math.ceil((doma + k) / (1 - d.rezerva) - 1e-9) - z.priv.domu);
                if (dokup) cena += d.cenaDomu(z.priv.domu, dokup);
            });
            return cena;
        };
        const vejde = (v) => {
            const n = v[0] + v[1] + v[2];
            if (n > limit) return false;
            for (let t = 0; t < 3; t++) if (v[t] > limitT[t]) return false;
            const z = v[0] * ceny[0][0] + v[1] * ceny[1][0] + v[2] * ceny[2][0];
            const m = v[0] * ceny[0][1] + v[1] * ceny[1][1] + v[2] * ceny[2][1];
            return m <= mana && z + domyZl(n) <= zl;
        };

        const nejvic = (strop, f) => {
            let lo = 0, hi = strop;
            if (!vejde(f(0))) return -1;
            while (lo < hi) { const m = Math.ceil((lo + hi) / 2); if (vejde(f(m))) lo = m; else hi = m - 1; }
            return lo;
        };
        let nej = [0, 0, 0];
        if (vz[1] || vz[2]) {
            let nejUt = -1;
            for (let n3 = 0; n3 <= (vz[2] ? limit : 0); n3++) {
                const n2 = vz[1] ? nejvic(limit - n3, n => [0, n, n3]) : (vejde([0, 0, n3]) ? 0 : -1);
                if (n2 < 0) break;
                const u = n2 * ut[1] + n3 * ut[2];
                if (u > nejUt) { nejUt = u; nej = [0, n2, n3]; }
            }
        }
        if (vz[0]) {
            const n1 = nejvic(limit - nej[1] - nej[2], n => [n, nej[1], nej[2]]);
            nej[0] = Math.max(0, n1);
        }
        return { v: nej, limit: limit, limity: limity, smi: smi, rozdeleni: rjRozdelVerb(nej, limity, smi) };
    }

    function rjNahoda(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function rjHledej(P, d, kv, pevneR, rychle, budget) {
        const S = P.sloty, st = rjSt(P), nZ = P.zdroje.length;
        const den0 = st.den[0].filter(x => S[x].zem);

        const dalsi = [].concat(st.den[1], st.den[2]).filter(y => S[y].zem);
        if (!pevneR && !budget) dalsi.forEach(y => { S[y].r = true; });

        const H = d.hotove || {};
        const hotovyUtok = (x) => !!(H[x] && H[x].u);
        const rSloty = (pevneR ? [] : budget ? den0.concat(dalsi) : den0).filter(x => !hotovyUtok(x));
        const denSlotu = (x) => st.denKroku[x] || 0;

        const rec = (kv.rozdeleni || []).map(a => a.slice());
        while (rec.length < nZ) rec.push([0, 0, 0]);
        const limity = (kv.limity || []).map(l => l || 0);

        const smiVerb = kv.smi || rjSmiVerbZdroju(P.zdroje);

        const kosDef = [];
        den0.forEach(x => {
            if (!hotovyUtok(x)) kosDef.push([x, 'u', st.zdroj(x)]);
            if (!(H[x] && H[x].p)) kosDef.push([x, 'p', st.zdroj(x)]);

            rjJinam(P, st, x).forEach(i => { if (!(H[x] && H[x].pj[i]) && rjDojde(rjJinamJak(P, st, x, i, d.jde))) kosDef.push([x, 'pj', i]); });
        });
        const kosCti = ([x, t, i]) => t === 'pj' ? (S[x].pj || [])[i] : S[x][t];
        const puvodni = kosDef.map(k => (Array.isArray(kosCti(k)) ? kosCti(k) : [0, 0, 0]).map(cislo));
        const puvRozdel = JSON.parse(JSON.stringify(P.rozdel || {}));
        const puvR = {};
        den0.concat(dalsi).forEach(x => { puvR[x] = !!S[x].r; });
        den0.forEach(x => { S[x].pj = P.zdroje.map((z, i) => H[x] && H[x].pj[i] ? ((S[x].pj || [])[i] || [0, 0, 0]).map(cislo) : [0, 0, 0]); });
        const kose = kosDef.map(([x, t, i]) => { const a = [0, 0, 0]; if (t === 'pj') S[x].pj[i] = a; else S[x][t] = a; return a; });
        const kosZdroj = kosDef.map(k => k[2]);
        const koseZdroje = P.zdroje.map((z, i) => kose.map((k, j) => j).filter(j => kosZdroj[j] === i));
        const suma = (a) => a[0] + a[1] + a[2];
        P.zdroje.forEach((z, i) => {
            if (koseZdroje[i].length) return;
            for (let t = 0; t < 3; t++) {
                for (let j = 0; j < nZ && rec[i][t] > 0; j++) {
                    if (!koseZdroje[j].length || !smiVerb[j][t]) continue;
                    const k = Math.min(rec[i][t], limity[j] - suma(rec[j]));
                    if (k > 0) { rec[i][t] -= k; rec[j][t] += k; }
                }
            }
        });

        const domaZdroju = P.zdroje.map((z, i) => ((d.zdroje[i] || {}).doma || [0, 0, 0]).map(cislo));
        let teply = den0.length > 0;
        if (teply) {
            const pouzite = P.zdroje.map(() => [0, 0, 0]);
            puvodni.forEach((a, j) => { pouzite[kosZdroj[j]] = rjSecti(pouzite[kosZdroj[j]], a); });
            const recP = pouzite.map((a, i) => rjOdecti(a, domaZdroju[i]));
            const soucet = (pole) => pole.reduce(rjSecti, [0, 0, 0]);
            teply = recP.every((a, i) => a.every((n, t) => n >= 0 && (n === 0 || smiVerb[i][t]))
                    && suma(a) <= Math.max(limity[i], suma(rec[i])))
                && soucet(recP).every((n, t) => n === soucet(rec)[t]);
            if (teply) recP.forEach((a, i) => { rec[i] = a; });
        }
        const zasoby = P.zdroje.map((z, i) => rjSecti(domaZdroju[i], rec[i]));
        const celkem = zasoby.reduce(rjSecti, [0, 0, 0]);

        const maxT1 = celkem[0] + 30;
        const vaha = [1, maxT1 + 1, (maxT1 + 1) * (celkem[1] + 1)];
        const maxZtrat = maxT1 * vaha[0] + celkem[1] * vaha[1] + celkem[2] * vaha[2];

        const CENA_R = maxZtrat + 1, CENA_CHYBI = budget ? CENA_R * 10 : 2 * maxZtrat + 2;
        const cenaR = (x) => budget ? CENA_R * (1 + [0.003, 0.002, 0.001][denSlotu(x)]) : 0.001;

        const pamet = {};
        const dh = Object.assign({}, d, {
            rozpocet: null,
            puNa: (x, dny) => (x + dny) in pamet ? pamet[x + dny] : (pamet[x + dny] = d.puNa(x, dny)),

            zombie: null, zombieMax: null
        });
        den0.forEach(x => { if (!hotovyUtok(x)) S[x].r = false; });
        if (pevneR) den0.concat(dalsi).forEach(x => { if (!hotovyUtok(x)) S[x].r = !!pevneR[x]; });
        P.rozdel = {};
        const cile = rjCileStruktury(P, st);

        const pres = [];
        for (let dd = 0; dd + 1 < st.dny; dd++) {
            st.den[dd].forEach(x => {
                if (S[x].zem && S[x].dal === 'presun' && (cile[dd + 1] || []).length && (dd === 0 || (cile[dd] || []).includes(x))) {

                    const kam = cile[dd + 1].filter(y => rjDojde(rjJdeZKroku(P, x, y, d.jde)));
                    if (kam.length) pres.push([x, kam]);
                }
            });
        }
        const casti = [];
        pres.forEach(([x, cl]) => {
            P.rozdel[x] = {};
            cl.forEach((y, k) => {
                P.rozdel[x][y] = k === cl.length - 1 ? '*' : [0, 0, 0];
                if (k < cl.length - 1) casti.push([x, y]);
            });
        });

        const slotHrdiny = (() => {
            const h = den0.filter(x => S[x].h)[0];
            if (!h) return null;
            const vet = (P.vetve || []).filter(b => (b.kroky || []).indexOf(h) > -1)[0];
            const kroky = (vet ? vet.kroky : [h]).filter(x => S[x] && S[x].zem);
            return kroky.length ? kroky[kroky.length - 1] : null;
        })();
        const lexMax = (celkem[2] + 1) * (celkem[1] + 1) * (celkem[0] + 1);
        const lexArmady = (a) => ((a[2] * (celkem[1] + 1)) + a[1]) * (celkem[0] + 1) + a[0];

        const CENA_HRDINA = maxZtrat;

        let prosloVse = false;
        const hodnota = () => {
            const v = rjSpocti(P, dh);
            let chybi = 0, jine = 0, nestaci = 0;
            v.chyby.forEach(c => { const m = /nestačí o (\d+)/.exec(c.text); if (m) { chybi += +m[1]; nestaci++; } else if (c.slot !== 'verb') jine++; });
            prosloVse = chybi === 0;
            let ztraty = 0;
            Object.keys(v.sloty).forEach(k => { const p = v.sloty[k].padli; ztraty += p[0] * vaha[0] + p[1] * vaha[1] + p[2] * vaha[2]; });

            let vyr = 0;
            if (nZ > 1) for (let i = 0; i < nZ; i++) { const n = suma(domaZdroju[i]) + suma(rec[i]); vyr += n * n; }

            let hrd = 0;
            if (slotHrdiny) {
                const z = v.sloty[slotHrdiny];
                const a = (z && (z.zbyde || z.zitra)) || [0, 0, 0];
                hrd = CENA_HRDINA * (1 - lexArmady(a) / lexMax);
            }
            return jine * CENA_CHYBI * 1e6 + nestaci * CENA_CHYBI * 1000 + chybi * CENA_CHYBI + ztraty
                + rSloty.reduce((c, x) => c + (S[x].r ? cenaR(x) : 0), 0) + hrd + vyr * 1e-7;
        };
        const stav = () => ({ k: kose.map(a => a.slice()), c: casti.map(([x, y]) => P.rozdel[x][y].slice()),
                              r: rSloty.map(x => S[x].r), rec: rec.map(a => a.slice()) });
        const nastav = (s) => {
            kose.forEach((a, i) => { for (let t = 0; t < 3; t++) a[t] = s.k[i][t]; });
            casti.forEach(([x, y], i) => { P.rozdel[x][y] = s.c[i].slice(); });
            rSloty.forEach((x, i) => { S[x].r = s.r[i]; });
            rec.forEach((a, i) => { for (let t = 0; t < 3; t++) a[t] = s.rec[i][t]; });
        };
        const nahodny = (rnd, a) => a[Math.floor(rnd() * a.length)];

        const prelij = (t, a, b) => {
            const i = kosZdroj[a], j = kosZdroj[b];
            if (i === j || !kose[a][t] || !(rec[i][t] > 0) || suma(rec[j]) >= limity[j] || !smiVerb[j][t]) return null;
            kose[a][t]--; kose[b][t]++; rec[i][t]--; rec[j][t]++;
            return () => { kose[a][t]++; kose[b][t]--; rec[i][t]++; rec[j][t]--; };
        };

        const tah = (rnd) => {
            const r = rnd();
            if (nZ > 1 && r < 0.1) {
                return prelij(Math.floor(rnd() * 3), Math.floor(rnd() * kose.length), Math.floor(rnd() * kose.length));
            }
            if (r < 0.8 || (!casti.length && r < 0.95)) {
                const t = Math.floor(rnd() * 3), a = Math.floor(rnd() * kose.length);
                if (!kose[a][t]) return null;
                const b = nahodny(rnd, koseZdroje[kosZdroj[a]]);
                if (a === b) return null;
                const n = rnd() < 0.7 ? 1 : 1 + Math.floor(rnd() * Math.min(3, kose[a][t]));
                kose[a][t] -= n; kose[b][t] += n;
                return () => { kose[a][t] += n; kose[b][t] -= n; };
            }
            if (r < 0.95 && casti.length) {
                const [x, y] = nahodny(rnd, casti);
                const t = Math.floor(rnd() * 3), z = rnd() < 0.5 ? -1 : 1, c = P.rozdel[x][y];
                if (c[t] + z < 0) return null;
                c[t] += z;
                return () => { c[t] -= z; };
            }
            if (!rSloty.length) return null;
            const x = nahodny(rnd, rSloty);
            S[x].r = !S[x].r;
            return () => { S[x].r = !S[x].r; };
        };

        const BEHU = 12, KROKU = 6000;
        let nej = null, nejH = Infinity, hotovo = false;
        for (let beh = 0; beh < BEHU && !hotovo; beh++) {
            const rnd = rjNahoda(20261018 + beh);
            kose.forEach(a => { a[0] = a[1] = a[2] = 0; });
            casti.forEach(([x, y]) => { P.rozdel[x][y] = [0, 0, 0]; });
            rSloty.forEach(x => { S[x].r = beh % 2 === 1; });

            const start = teply ? ['teply', 'umerne'][beh] || 'nahodne' : (beh === 0 ? 'umerne' : 'nahodne');
            if (start === 'teply') {
                puvodni.forEach((a, j) => { for (let t = 0; t < 3; t++) kose[j][t] = a[t]; });
                casti.forEach(([x, y]) => { const c = (puvRozdel[x] || {})[y]; if (Array.isArray(c)) P.rozdel[x][y] = c.map(cislo); });
                rSloty.forEach(x => { S[x].r = puvR[x]; });
            }
            if (start !== 'teply') P.zdroje.forEach((z, i) => {
                const moje = koseZdroje[i];
                if (!moje.length) return;
                const utoky = moje.filter(j => kosDef[j][1] === 'u');
                const vahy = utoky.map(j => { const pu = dh.puNa(kosDef[j][0], 0); return pu ? pu.pu : 1; });
                for (let t = 0; t < 3; t++) {
                    if (start === 'umerne' && utoky.length) rjRozdelUmerne(zasoby[i][t], vahy).forEach((n, k) => { kose[utoky[k]][t] += n; });
                    else for (let n = 0; n < zasoby[i][t]; n++) kose[nahodny(rnd, moje)][t]++;
                }
            });
            let h = hodnota();
            if (h < nejH) { nejH = h; nej = stav(); }
            if (rychle && prosloVse) { hotovo = true; break; }
            for (let krok = 0; krok < KROKU; krok++) {
                const T = 20 * (1 - krok / KROKU) + 0.05;
                const zpet = tah(rnd);
                if (!zpet) continue;
                const h2 = hodnota();
                if (h2 <= h || rnd() < Math.exp((h - h2) / T)) {
                    h = h2;
                    if (h < nejH) { nejH = h; nej = stav(); }

                    if (rychle && prosloVse) { hotovo = true; break; }
                } else zpet();
            }

            for (let i = 0; i < nZ; i++) for (let t = 0; t < 3; t++) rec[i][t] = (nej ? nej.rec[i][t] : rec[i][t]);
            nastav(nej);

            P.zdroje.forEach((z, i) => { zasoby[i] = rjSecti(domaZdroju[i], rec[i]); });
        }

        nastav(nej);
        for (let kolo = 0; kolo < (rychle ? 0 : 200); kolo++) {
            let lepsi = false;
            const zkus = (proved, zpet) => {
                proved();
                const h2 = hodnota();
                if (h2 < nejH - 1e-9) { nejH = h2; lepsi = true; return true; }
                zpet(); return false;
            };
            for (let t = 0; t < 3 && !lepsi; t++) {
                for (let a = 0; a < kose.length && !lepsi; a++) {
                    for (let b = 0; b < kose.length && !lepsi; b++) {
                        if (a === b || !kose[a][t]) continue;
                        if (kosZdroj[a] === kosZdroj[b]) {
                            zkus(() => { kose[a][t]--; kose[b][t]++; }, () => { kose[a][t]++; kose[b][t]--; });
                        } else {
                            const zpet = prelij(t, a, b);
                            if (!zpet) continue;
                            const h2 = hodnota();
                            if (h2 < nejH - 1e-9) { nejH = h2; lepsi = true; } else zpet();
                        }
                    }
                }
            }
            for (let i = 0; i < casti.length && !lepsi; i++) {
                const c = P.rozdel[casti[i][0]][casti[i][1]];
                for (let t = 0; t < 3 && !lepsi; t++) {
                    for (const z of [1, -1]) {
                        if (lepsi || c[t] + z < 0) continue;
                        zkus(() => { c[t] += z; }, () => { c[t] -= z; });
                    }
                }
            }
            for (let i = 0; i < rSloty.length && !lepsi; i++) {
                const x = rSloty[i];
                zkus(() => { S[x].r = !S[x].r; }, () => { S[x].r = !S[x].r; });
            }
            if (!lepsi) break;
        }

        for (let i = 0; i < nZ; i++) for (let j = i + 1; j < nZ; j++) for (let t = 0; t < 3; t++) {
            const volny = (x, z) => !(H[x] && (H[x].p || H[x].pj[z]));
            const ij = den0.filter(x => st.zdroj(x) === j && S[x].pj[i] && S[x].pj[i][t] > 0 && volny(x, i));
            const ji = den0.filter(x => st.zdroj(x) === i && S[x].pj[j] && S[x].pj[j][t] > 0 && volny(x, j));
            while (ij.length && ji.length) {
                const x = ij[0], y = ji[0];
                const k = Math.min(S[x].pj[i][t], S[y].pj[j][t]);
                S[x].pj[i][t] -= k; S[x].p[t] += k;
                S[y].pj[j][t] -= k; S[y].p[t] += k;
                if (!S[x].pj[i][t]) ij.shift();
                if (!S[y].pj[j][t]) ji.shift();
            }
        }

        const v = rjSpocti(P, dh);
        pres.forEach(([x, cl]) => {
            let poslano = [0, 0, 0];
            cl.forEach(y => { if (P.rozdel[x][y] !== '*') poslano = rjSecti(poslano, P.rozdel[x][y]); });
            cl.forEach(y => {
                if (P.rozdel[x][y] === '*') P.rozdel[x][y] = v.sloty[x] ? rjNezaporne(rjOdecti(v.sloty[x].zitra, poslano)) : [0, 0, 0];
            });
        });
        return rjSpocti(P, d);
    }

    function rjBudget(P, d, kv) {

        const st = rjSt(P);
        const nestaci = (v) => v.chyby.some(c => /nestačí/.test(c.text));
        const kopie = () => JSON.parse(JSON.stringify({ sloty: P.sloty, rozdel: P.rozdel }));
        const vrat = (k) => { P.sloty = JSON.parse(JSON.stringify(k.sloty)); P.rozdel = JSON.parse(JSON.stringify(k.rozdel)); };
        const ZEME = [].concat(st.den[0], st.den[1], st.den[2]);
        const R = {};
        ZEME.forEach(x => { if (P.sloty[x].zem) R[x] = true; });
        let v = rjHledej(P, d, kv, R);
        if (nestaci(v)) return v;
        const utoky = ZEME.filter(x => v.sloty[x] && v.sloty[x].pu);

        const klic = (sl) => {
            const r = utoky.filter(x => sl[x].r);
            return [r.length].concat([0, 1, 2].map(dd => r.filter(x => st.denKroku[x] === dd).length));
        };
        const lepsi = (a, b) => { for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };

        const rusit = (R) => {
            let dobry = kopie();
            utoky.forEach(x => {
                if (!R[x]) return;
                R[x] = false;
                if (!nestaci(rjHledej(P, d, kv, R, true))) dobry = kopie();
                else R[x] = true;
            });
            const vv = rjHledej(P, d, kv, R);
            return nestaci(vv) ? dobry : kopie();
        };

        let kandidat = rusit(R);

        const v1 = rjHledej(P, d, kv, null, false, true);
        if (!nestaci(v1)) {
            const R1 = {};
            utoky.forEach(x => { R1[x] = !!P.sloty[x].r; });
            const k1 = rusit(R1);
            if (lepsi(klic(k1.sloty), klic(kandidat.sloty))) kandidat = k1;
        }

        vrat(kandidat);
        return rjSpocti(P, d);
    }

    function rjNejmensiVerb(P, d, kv, pevneR) {
        const ut = rjUtoky();
        const typy = [2, 1].filter(t => kv.v[t] > 0).sort((a, b) => ut[b] - ut[a]).concat(kv.v[0] > 0 ? [0] : []);
        const seznam = [];
        typy.forEach(t => { for (let i = 0; i < kv.v[t]; i++) seznam.push(t); });
        const kvN = (n) => {
            const v = [0, 0, 0];
            for (let i = 0; i < n; i++) v[seznam[i]]++;
            return Object.assign({}, kv, { v: v, rozdeleni: rjRozdelVerb(v, kv.limity, kv.smi) });
        };

        let vyslo = null;
        const kopie = () => JSON.parse(JSON.stringify({ sloty: P.sloty, rozdel: P.rozdel }));
        const projde = (n) => {
            const ok = !rjHledej(P, d, kvN(n), pevneR || null, true).chyby.some(c => /nestačí/.test(c.text));
            if (ok) vyslo = kopie();
            return ok;
        };
        if (!seznam.length || !projde(seznam.length)) return kv;
        let lo = 0, hi = seznam.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (projde(m)) hi = m; else lo = m + 1; }

        if (vyslo) { P.sloty = vyslo.sloty; P.rozdel = vyslo.rozdel; }
        return Object.assign(kvN(lo), { max: lo < seznam.length ? kv.v : null });
    }

    function rjNavrhni() {
        if (rjPosunNaDnes(rjPlan) | rjSrovnejDen0(rjPlan)) rjUloz();
        const P = rjPlan, d = rjVstupy(), st = rjSt(P);

        const vz = [0, 1, 2].map(t => (P.zdroje || []).some(z => rjSmiVerb(z, t)));
        if (!st.den[0].some(x => P.sloty[x].zem)) { P.navrhInfo = 'Navrhni: nevyšlo — vyber aspoň jeden cíl na dnes'; return; }
        let kv = rjKolikVerbovat(d, vz), v;
        if (P.omezRytire) {

            v = rjBudget(P, d, kv);
            const R = {};
            Object.keys(v.sloty).forEach(x => { R[x] = !!P.sloty[x].r; });
            if (kv.limit != null && !P.maxVerb) kv = rjNejmensiVerb(P, d, kv, R);
            v = rjHledej(P, d, kv, R);
        } else {
            if (kv.limit != null && !P.maxVerb) kv = rjNejmensiVerb(P, d, kv);
            v = rjHledej(P, d, kv);
        }
        const padli = Object.keys(v.sloty).reduce((s, k) => rjSecti(s, v.sloty[k].padli), [0, 0, 0]);

        const poZemich = v.verb.zdroje.length > 1 && v.verb.celkem
            ? ' (' + v.verb.zdroje.map((z, i) => rjJmenoZdroje(i) + ' ' + rjTri(z.verb)).join(', ') + ')' : '';
        const verbTxt = kv.limit == null ? 'limit verbu neznámý, jen vojsko doma'
            : 'verb ' + rjTri(kv.v) + poZemich + (kv.max ? ' — šetřím, max by bylo ' + rjTri(kv.max) : '');
        const nestaci = v.chyby.filter(c => /nestačí/.test(c.text));

        const utoky = Object.keys(v.sloty).filter(x => v.sloty[x].pu);
        const sRytirem = P.omezRytire ? utoky.filter(x => P.sloty[x].r).sort() : [];
        const rytirTxt = !P.omezRytire ? ''
            : !sRytirem.length ? ' · bez rytíře'
            : sRytirem.length === utoky.length ? ' · ⚠ rytíř potřeba u všech útoků'
            : ` · rytíř ${sRytirem.length} z ${utoky.length} (${sRytirem.join(', ')})`;

        const sHrdinou = st.den[0].some(x => P.sloty[x].zem && P.sloty[x].h);
        const maHrdinu = cislo(P.heroAbs) > 0 || cislo(P.heroPct) > 0;
        P.navrhInfo = !v.chyby.length
            ? `Navrhni: vychází · ${verbTxt} · padne ${rjTri(padli)}${rytirTxt}`
            : nestaci.length && !sHrdinou
                ? 'Navrhni: nevyšlo — použij hrdinu: ' + (maHrdinu ? 'zaškrtni H u některého dnešního útoku'
                    : rjVlastni ? 'zadej nahoře jeho útok a % a zaškrtni H u útoku' : 'vyber ho nahoře a zaškrtni H u útoku')
            : nestaci.length
                ? `Navrhni: nevyšlo ani s plným verbem (${verbTxt}) — ` + nestaci.map(c => c.slot + ' o ' + (/o (\d+)/.exec(c.text) || [])[1]).join(', ')
                  + ' · na tenhle tvar vojsko nestačí: uber útok, přidej zdroj nebo verb, silnějšího hrdinu'
                : `Navrhni: nevyšlo — ${v.chyby.length} ${v.chyby.length === 1 ? 'chyba' : 'chyb'} (viz níž)`;
    }

    const rjSecti = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const rjOdecti = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const rjNic = (a) => !a[0] && !a[1] && !a[2];
    const rjNezaporne = (a) => a.map(n => Math.max(0, n));

    function rjSpocti(plan, d) {
        const S = plan.sloty, st = rjSt(plan), out = { sloty: {}, chyby: [], cile: {} };
        const pocty = (a) => (a || [0, 0, 0]).map(n => Math.max(0, parseInt(n, 10) || 0));
        const chyba = (slot, text) => out.chyby.push({ slot: slot, text: text });
        const nZ = (plan.zdroje || []).length;
        const zombieCislo = (fn, x, dny) => fn ? fn(x, dny) : 0;

        let hrdinaZ = null;
        const hrdinaDen0 = st.den[0].filter(x => S[x] && S[x].zem && S[x].h);
        if (hrdinaDen0.length > 1) chyba(hrdinaDen0[1], 'hrdina může jít jen s jedním útokem');
        if (hrdinaDen0.length) hrdinaZ = hrdinaDen0[0];

        const H = d.hotove || {};
        const zDomova = plan.zdroje.map(() => [0, 0, 0]);
        st.den[0].forEach(x => {
            const s = S[x];
            if (!s || !s.zem) return;
            const u = pocty(s.u), pVl = pocty(s.p), zi = st.zdroj(x);

            const pZ = {};
            let p = pVl;
            rjJinam(plan, st, x).forEach(i => {
                const q = pocty((s.pj || [])[i]);
                if (rjNic(q)) return;
                pZ[i] = q; p = rjSecti(p, q);

                if (!rjDojde(rjJinamJak(plan, st, x, i, d.jde))) {
                    chyba(x, 'přesun z ' + (rjJmeno((plan.zdroje[i] || {}).zem) || ('zdroje ' + (i + 1)))
                        + ' sem nejde — není to soused ani soused země, se kterou máš volný průchod');
                }
            });
            const pu = d.puNa(x, 0);
            const sila = d.sila(u, x === hrdinaZ, !!s.r, !!s.w);
            const padli = pu ? rjZtraty(u, sila, pu.pu) : [0, 0, 0];
            const prezili = rjNezaporne(rjOdecti(u, padli));
            const ok = !!pu && sila >= pu.pu;
            if (pu && !ok) chyba(x, 'útok nestačí o ' + (pu.pu - sila));
            const hx = H[x] || { pj: {} };
            if (!hx.u) zDomova[zi] = rjSecti(zDomova[zi], u);
            if (!hx.p) zDomova[zi] = rjSecti(zDomova[zi], pVl);
            Object.keys(pZ).forEach(i => { if (!hx.pj[i]) zDomova[i] = rjSecti(zDomova[i], pZ[i]); });

            const zombie = ok ? zombieCislo(d.zombie, x, 0) : 0;
            const zPlan = d.zombieDoPlanu === false ? 0 : zombie;
            out.sloty[x] = { den: 0, zdroj: zi, presunVl: pVl, presunZ: pZ, u: u, hrdina: x === hrdinaZ, pu: pu, sila: sila, padli: padli,
                             prezili: prezili, presun: p, ok: ok, zombie: zombie, zombieMimo: zombie > 0 && !zPlan,
                             prisun: [0, 0, 0], zitra: ok ? rjSecti(rjSecti(prezili, p), [zPlan, 0, 0]) : [0, 0, 0] };
        });

        for (let dd = 1; dd < st.dny; dd++) {
            const cile = st.den[dd].filter(y => {
                const x = st.pred[y];
                return out.sloty[x] && S[x].dal !== 'presun' && S[y] && S[y].zem;
            });
            out.cile[dd] = cile;
            let hrdinaNovy = null;
            cile.forEach(y => {
                const x = st.pred[y], s = S[y], zdroj = out.sloty[x];
                const u = zdroj.zitra.slice();
                const pu = d.puNa(y, dd);

                const sHrdinou = hrdinaZ === x;
                if (sHrdinou) hrdinaNovy = y;
                const sila = d.sila(u, sHrdinou, !!s.r, !!s.w);
                const padli = pu ? rjZtraty(u, sila, pu.pu) : [0, 0, 0];
                const prezili = rjNezaporne(rjOdecti(u, padli));
                const ok = !!pu && sila >= pu.pu;
                if (pu && !ok) chyba(y, 'útok nestačí o ' + (pu.pu - sila));
                zdroj.zbyde = [0, 0, 0];
                const zombie = ok ? zombieCislo(d.zombie, y, dd) : 0;
                const zombieMax = ok && d.zombieMax ? d.zombieMax(y, dd) : zombie;
                const zPlan = d.zombieDoPlanu === false ? 0 : zombie;
                out.sloty[y] = { den: dd, z: x, zdroj: st.zdroj(y), u: u, hrdina: sHrdinou, pu: pu, sila: sila, padli: padli,
                                 prezili: prezili, presun: [0, 0, 0], ok: ok, zombie: zombie, zombieMax: zombieMax,
                                 zombieMimo: zombie > 0 && !zPlan, prisun: [0, 0, 0],
                                 zitra: ok ? rjSecti(prezili, [zPlan, 0, 0]) : [0, 0, 0] };
            });

            st.den[dd - 1].forEach(x => {
                const zdroj = out.sloty[x];
                if (!zdroj || S[x].dal !== 'presun') return;
                let poslano = [0, 0, 0];
                const roz = (plan.rozdel && plan.rozdel[x]) || {};
                const posli = (y, v) => {
                    if (rjNic(v)) return;
                    poslano = rjSecti(poslano, v);
                    if (out.sloty[y].ok) out.sloty[y].zitra = rjSecti(out.sloty[y].zitra, v);
                    out.sloty[y].prisun = rjSecti(out.sloty[y].prisun, v);
                };
                cile.forEach(y => {
                    if (roz[y] === '*') return;
                    const v = pocty(roz[y]);
                    posli(y, v);

                    if (!rjNic(v) && !rjDojde(rjJdeZKroku(plan, x, y, d.jde))) {
                        chyba(x, 'přeposílka do ' + y + ' ' + (rjJmenoSlotu(y) || '')
                            + ' nejde — z ' + (rjJmenoSlotu(x) || x) + ' to není soused ani soused souseda');
                    }
                });

                cile.forEach(y => { if (roz[y] === '*') posli(y, rjNezaporne(rjOdecti(zdroj.zitra, poslano))); });
                const zbyde = rjOdecti(zdroj.zitra, poslano);
                if (zbyde.some(n => n < 0)) chyba(x, 'přeposílá se víc, než v ' + x + ' bude');
                zdroj.zbyde = rjNezaporne(zbyde);
                zdroj.chybi = rjNezaporne(rjOdecti([0, 0, 0], zbyde));
                zdroj.poslano = poslano;
            });

            st.den[dd - 1].forEach(x => {
                const z = out.sloty[x], y = st.dalsi[x];
                if (!z || S[x].dal === 'presun' || !y || (S[y] && S[y].zem)) return;
                z.silaDalsi = d.sila(z.zitra, hrdinaZ === x, !!(S[y] && S[y].r), !!(S[y] && S[y].w));
            });
            hrdinaZ = hrdinaNovy;
        }

        Object.keys(out.sloty).forEach(x => { const z = out.sloty[x]; if (!z.zbyde) z.zbyde = z.zitra.slice(); });

        const ceny = d.ceny || [[0, 0], [0, 0], [0, 0]];
        const zd = plan.zdroje.map((zz, i) => {
            const di = (d.zdroje || [])[i] || {};
            const doma = pocty(di.doma);
            const verb = rjNezaporne(rjOdecti(zDomova[i], doma));
            const zlato = verb[0] * ceny[0][0] + verb[1] * ceny[1][0] + verb[2] * ceny[2][0];
            const mana = verb[0] * ceny[0][1] + verb[1] * ceny[1][1] + verb[2] * ceny[2][1];
            const celkem = verb[0] + verb[1] + verb[2];

            const kde = () => nZ > 1 ? ' (' + (rjJmeno(zz.zem) || ('zdroj ' + (i + 1))) + ')' : '';

            for (let t = 0; t < 3; t++) {
                if (verb[t] > 0 && !rjSmiVerb(zz, t)) {
                    chyba('verb', 'verb ' + verb[t] + ' × ' + (t + 1) + '. stupeň' + kde()
                        + ' — ta zem ho má odškrtnutý' + (RJ_CECH[t] ? ' (' + RJ_CECH[t] + ')' : ''));
                }
            }

            let maxVerb = null, domy = null;
            if (di.limitVerbu != null) {

                maxVerb = di.limitVerbu;
                if (celkem > maxVerb) chyba('verb', 'verb ' + celkem + ' je přes zadaný limit ' + maxVerb + kde());
            } else if (di.priv && di.priv.obyvatel != null && di.priv.domu != null) {

                maxVerb = Math.max(0, Math.floor(di.priv.obyvatel - d.rezerva * (di.priv.domu + (di.priv.dokupRust || 0))));
                if (celkem > maxVerb) chyba('verb', 'verb ' + celkem + ' je přes limit ' + maxVerb + ' (obyvatelé − ' + Math.round(d.rezerva * 100) + ' % domů)' + kde());

                const letiN = pocty(di.leti).reduce((a, b) => a + b, 0);
                const vojaku = doma[0] + doma[1] + doma[2] + celkem + letiN;
                const potreba = Math.ceil(vojaku / (1 - d.rezerva) - 1e-9);
                const dokup = Math.max(0, potreba - di.priv.domu);
                domy = { vojaku: vojaku, potreba: potreba, mas: di.priv.domu, dokup: dokup,
                         zlato: dokup && d.cenaDomu ? d.cenaDomu(di.priv.domu, dokup) : 0 };
            }
            return { zDomova: zDomova[i], doma: doma, verb: verb, celkem: celkem,
                     zlato: zlato, mana: mana, maxVerb: maxVerb, domy: domy, priv: di.priv || null };
        });
        const soucet = (k) => zd.reduce((a, z) => rjSecti(a, z[k]), [0, 0, 0]);
        const zlato = zd.reduce((a, z) => a + z.zlato, 0), mana = zd.reduce((a, z) => a + z.mana, 0);
        const domyZlato = zd.reduce((a, z) => a + (z.domy ? z.domy.zlato : 0), 0);
        const maxima = zd.filter(z => z.maxVerb != null);

        let rozpocet = null;
        if (d.rozpocet && (d.rozpocet.zl > 0 || d.rozpocet.mana > 0)) {
            const zlatoCelkem = zlato + domyZlato;
            rozpocet = { zl: d.rozpocet.zl, mana: d.rozpocet.mana,

                         zbyvaZl: d.rozpocet.zl > 0 ? d.rozpocet.zl - zlatoCelkem : null,
                         zbyvaMana: d.rozpocet.mana > 0 ? d.rozpocet.mana - mana : null };
            if (rozpocet.zbyvaZl < 0 || rozpocet.zbyvaMana < 0) {
                chyba('verb', 'na verb a domy chybí ' + [rozpocet.zbyvaZl < 0 ? (-rozpocet.zbyvaZl) + ' zl' : '',
                    rozpocet.zbyvaMana < 0 ? (-rozpocet.zbyvaMana) + ' many' : ''].filter(Boolean).join(' a '));
            }
        }
        out.verb = { zDomova: soucet('zDomova'), doma: soucet('doma'), verb: soucet('verb'),
                     celkem: zd.reduce((a, z) => a + z.celkem, 0), rozpocet: rozpocet, zlato: zlato, mana: mana,
                     maxVerb: maxima.length ? maxima.reduce((a, z) => a + z.maxVerb, 0) : null,
                     domy: nZ === 1 ? zd[0].domy : null, domyZlato: domyZlato, zdroje: zd };
        out.den1Cile = out.cile[1] || [];
        return out;
    }

    const RJ_NS = 'rozjezd', RJ_KLIC = 'plan', RJ_KLIC_VLASTNI = 'plan-vlastni', RJ_KLIC_REZIM = 'vlastni';
    const rjKlic = () => rjVlastni ? RJ_KLIC_VLASTNI : RJ_KLIC;

    const RJ_NARUST = 18, RJ_OBYV_DEN = 1;
    let rjPlan = null, rjData = null, rjOkno = null, rjKoren = null;
    let rjPocita = false;

    let rjHrdinove = null, rjHrdinoveZ = null;

    const RJ_REZIM = 'de_rozjezd_rezim', RJ_POZICE = 'de_rozjezd_pozice', RJ_SIRKA = 'de_rozjezd_sirka';

    const RJ_MIN_SIRKA = 520, RJ_VYCHOZI_SIRKA = 1440, RJ_VIDET = 80, RJ_OKRAJ = 6;
    const rjRezim = () => { try { return sessionStorage.getItem(RJ_REZIM) || 'plne'; } catch (e) { return 'plne'; } };
    const rjNastavRezim = (r) => { try { sessionStorage.setItem(RJ_REZIM, r); } catch (e) { } };
    const rjSbaleno = () => /^sbalene/.test(rjRezim());
    const rjZaklad = () => rjRezim().replace(/^sbalene:?/, '') || 'plne';

    function rjVychozi() {

        const P = { v: 2, hrdina: '', heroAbs: 0, heroPct: 0, rozpocetZl: 0, rozpocetMana: 0,
                    navrhInfo: '', kol: '', zombie: true, omezRytire: false, maxVerb: false,
                    rasa: raceName, zdroje: [{ zem: '', dom: ['', '', ''], limit: '', verbZ: [false, true, false] }], vetve: [], dny: 1,
                    sloty: {}, rozdel: {} };
        rjPouzijStrukturu(P, { dny: 1, zdroju: 1, vetve: [{ zdroj: 0, dal: [] }] });
        return P;
    }

    const RJ_POLE_PLANU = ['heroAbs', 'heroPct', 'hrdina', 'rozpocetZl', 'rozpocetMana', 'navrhInfo', 'kol',
                           'zombie', 'omezRytire', 'maxVerb', 'rasa', 'odemknuto', 'den0'];

    function rjZPlanuV1(ul) {
        const v = rjVychozi();
        RJ_POLE_PLANU.forEach(k => { if (ul[k] != null) v[k] = ul[k]; });
        v.den0 = null;
        v.zdroje = [{ zem: ul.domov || '', dom: ul.dom || [0, 0, 0], limit: ul.limit != null ? ul.limit : '',
                      verbZ: rjVerbZUlozeny(null, ul) }];
        v.dny = 3;
        v.vetve = [{ zdroj: 0, kroky: ['A', 'D', 'G'] }, { zdroj: 0, kroky: ['B', 'E', 'H'] }, { zdroj: 0, kroky: ['C', 'F', 'I'] }];
        v.sloty = {};
        'ABCDEFGHI'.split('').forEach(x => {
            const s = Object.assign(rjNovySlot(), (ul.sloty || {})[x] || {});
            if (s.dal !== 'presun') s.dal = 'utok';
            v.sloty[x] = s;
        });

        if (!(ul.sloty && ul.sloty.C && ul.sloty.C.dal)) v.sloty.C.dal = 'presun';
        v.rozdel = ul.rozdel || {};
        return v;
    }

    function rjNactiPlan() {
        const ul = window.DarkElfUtils.Cache.get(RJ_NS, rjKlic());
        if (!ul) return rjVychozi();
        if (ul.v === 1) return rjZPlanuV1(ul);
        if (ul.v !== 2 || !Array.isArray(ul.vetve) || !Array.isArray(ul.zdroje) || !ul.zdroje.length) return rjVychozi();
        const v = rjVychozi();
        RJ_POLE_PLANU.forEach(k => { if (ul[k] != null) v[k] = ul[k]; });

        v.den0 = ul.den0 != null ? ul.den0 : null;

        v.zdroje = ul.zdroje.map(z => ({ zem: z.zem || '',
            dom: [0, 1, 2].map(i => { const x = (z.dom || [])[i]; return (x === '' || x == null || cislo(x) === 0) ? '' : cislo(x); }),
            limit: z.limit != null ? z.limit : '', jinam: !!z.jinam, verbZ: rjVerbZUlozeny(z, ul) }));
        v.vetve = ul.vetve.filter(b => Array.isArray(b.kroky) && b.kroky.length)
            .map(b => ({ zdroj: Math.min(cislo(b.zdroj), v.zdroje.length - 1), kroky: b.kroky.slice(0, 3) }));
        v.dny = Math.min(3, Math.max(1, cislo(ul.dny) || 1));
        v.sloty = {};
        v.vetve.forEach(b => {
            while (b.kroky.length < 3) b.kroky.push(rjVolnyStitek(v));
            b.kroky.forEach(x => { v.sloty[x] = Object.assign(rjNovySlot(), (ul.sloty || {})[x] || {}); });
        });

        const st = rjSt(v);
        Object.keys(v.sloty).forEach(x => {
            const s = v.sloty[x];
            if (s.pz != null && s.pz !== '' && +s.pz !== st.zdroj(x) && +s.pz < v.zdroje.length) {
                s.pj = v.zdroje.map(() => [0, 0, 0]);
                s.pj[+s.pz] = (s.p || [0, 0, 0]).slice();
                s.p = [0, 0, 0];
                v.zdroje[+s.pz].jinam = true;
            }
            delete s.pz;
        });
        v.rozdel = ul.rozdel || {};
        return v;
    }

    function rjUloz() {
        window.DarkElfUtils.Cache.set(RJ_NS, rjKlic(), rjPlan, Date.now() + 7 * 24 * 3600 * 1000);
    }

    async function rjNactiData() {
        const M = window.DarkElfUtils.MapAPI;
        let mapa = null;
        try { mapa = await M.fetch(); } catch (e) {  }
        try { await window.DarkElfUtils.TreatiesAPI.fetch(); } catch (e) {  }
        const ja = M.getMe();
        const h = (M.getHeader && M.getHeader()) || (mapa && mapa.hlavicka) || {};
        const zeme = (mapa && mapa.zeme) || [];
        const moje = !ja ? [] : zeme.filter(z => (ja.id && String(z.id_hrac) === ja.id)
            || (!ja.id && ja.jmeno && z.hrac === ja.jmeno));
        return { ja: ja, den: parseInt(h.den, 10), pocasi: parseInt(h.pocasi_domy, 10) || 100,
                 moje: moje.map(z => ({ id: String(z.id), jmeno: z.zeme || ('zem ' + z.id) })) };
    }

    function rjSousedniNeutralky(id) {
        if (!id) return [];
        const M = window.DarkElfUtils.MapAPI, N = window.DarkElfUtils.NeutralAPI;
        return window.DarkElfUtils.TreatiesAPI.getNeighbors(id).map(String)
            .map(s => M.getCountry(s)).filter(z => N.jeNeutralka(z))
            .sort((a, b) => a.min_utok - b.min_utok)
            .map(z => ({ id: String(z.id), jmeno: z.zeme || ('zem ' + z.id), pu: z.min_utok, bonus: z.bonus_obrana || 0 }));
    }

    function rjDosah(id, zitra) {
        if (!id) return null;
        const T = window.DarkElfUtils.TreatiesAPI;
        const zem = T.getCountry(id);
        if (!zem) return null;
        const out = new Map();
        T.getNeighbors(id).map(String).forEach(n => out.set(n, { jak: 'soused' }));
        const pr = zem.private;

        [['vp'], ['lze']].forEach(([jak]) => {
            for (let i = 1; i <= 10; i++) {
                const soused = zem['s' + i];
                if (soused == null) continue;
                if (!zitra) {
                    if (!pr) continue;

                    const dosluh = pr['d' + i];
                    const plati = dosluh && dosluh !== pr['sm' + i] ? dosluh : pr['sm' + i];
                    const prochod = plati === window.DarkElfUtils.TreatiesAPI.TREATY_PASSAGE;
                    if (jak === 'vp' ? !prochod : !!plati) continue;
                } else if (jak === 'vp') {
                    continue;
                }
                T.getNeighbors(soused).map(String).forEach(n => {
                    if (String(n) === String(id) || out.has(n)) return;
                    out.set(n, { jak: jak, pres: String(soused) });
                });
            }
        });
        return out;
    }

    let rjDosahy = {}, rjDosahSnimek = null;

    function rjJdeZZeme(odkud, kam, zitra) {
        if (!odkud || !kam) return undefined;
        if (String(odkud) === String(kam)) return { jak: 'soused' };
        const snimek = window.DarkElfUtils.Cache.get('api', 'treaties_json');
        if (snimek !== rjDosahSnimek) { rjDosahy = {}; rjDosahSnimek = snimek; }
        const klic = (zitra ? 'z' : 'd') + odkud;
        if (!(klic in rjDosahy)) rjDosahy[klic] = rjDosah(odkud, zitra);
        const d = rjDosahy[klic];
        if (!d) return undefined;
        return d.get(String(kam)) || null;
    }

    function rjDosahPamet() {
        const m = {};
        return (odkud, kam, zitra) => {
            const k = (zitra ? 'z' : 'd') + odkud + '>' + kam;
            if (!(k in m)) m[k] = rjJdeZZeme(odkud, kam, zitra);
            return m[k];
        };
    }

    const rjDojde = (v) => v !== null;

    function rjPopisCesty(v, odkud, kam) {
        if (v === undefined || !v) {
            return { znacka: v === undefined ? '' : ' ✖',
                     popis: v === undefined ? '' : odkud + ' na ' + kam + ' nedosáhne — není to soused'
                            + ' ani soused země, přes kterou by se dalo projít' };
        }
        if (v.jak === 'soused' || v.jak === 'vp') {
            return { znacka: '', popis: v.jak === 'vp' ? 'Projde přes ' + rjJmeno(v.pres) + ' (máš tam volný průchod)' : '' };
        }
        return { znacka: ' <span class="rj-sedy">VP</span>',
                 popis: 'Vede to přes ' + rjJmeno(v.pres) + ' — domluv si tam volný průchod.'
                        + ' Když mezi nimi žádná smlouva není, platí hned.' };
    }

    function rjJinamJak(P, st, x, zi, jde) {
        const z = P.zdroje[zi], cil = (P.sloty[x] || {}).zem;
        if (!z || !z.zem || !cil) return undefined;
        return (jde || rjJdeZZeme)(z.zem, cil, false);
    }

    function rjJdeZKroku(P, x, y, jde) {
        const a = (P.sloty[x] || {}).zem, b = (P.sloty[y] || {}).zem;
        if (!a || !b) return undefined;
        return (jde || rjJdeZZeme)(a, b, true);
    }

    function rjZdrojSlotu(x) {
        const st = rjSt();
        if (st.pred[x]) return rjPlan.sloty[st.pred[x]].zem;
        const z = rjPlan.zdroje[st.zdroj(x)];
        return z ? z.zem : '';
    }

    async function rjNactiHrdiny(zeme) {
        const klic = zeme.join(',');
        rjHrdinoveZ = klic;
        rjHrdinove = null;
        const out = [];
        try {
            const ja = window.DarkElfUtils.MapAPI.getMe();
            for (const zem of zeme) {
                let ids = await window.DarkElfUtils.HeroAPI.getIds(zem);
                if (!ids || !ids.length) ids = await window.DarkElfUtils.HeroAPI.getIds(zem, true);
                for (const id of (ids || [])) {
                    const h = await nactiHrdinu(id);
                    if (h && jeMuj(h, (ja && ja.id) || '', (ja && ja.jmeno) || null) && !out.some(o => String(o.id) === String(h.id))) {
                        out.push(Object.assign({}, h, { zem: zem }));
                    }
                }
            }
        } catch (e) {
            console.warn('Rozjezd: hrdiny ve zdrojích ' + klic + ' zjistit nešlo:', e.message);
        }
        if (rjHrdinoveZ !== klic) return;
        rjHrdinove = out;
        if (rjKoren && !rjSbaleno()) rjPostav();
    }

    let rjRust = null;
    let rjRustNacita = false, rjRustChyba = 0;

    async function rjNactiRust() {

        if (rjRust || rjRustNacita || Date.now() - rjRustChyba < 60000) return;
        rjRustNacita = true;
        const rust = { zeme: {} };
        try {
            const doc = await window.DarkElfUtils.fetchPage('/auto_domy.asp');
            if (!doc) throw new Error('prázdná odpověď');
            Array.from(doc.querySelectorAll('[id^="es"]')).forEach(h => {
                const m0 = /^es(\d+)h$/.exec(h.id);
                if (!m0) return;
                const td = h.closest('td');
                const tr = td && td.closest('tr');
                const obyvTd = td && td.nextElementSibling;
                const m = obyvTd && (obyvTd.textContent || '').match(/\d+/);
                const pr = tr && tr.querySelector('span[style*="color:#33AA33"]');
                const pm = pr && (pr.textContent || '').match(/\+\s*(\d+)/);
                rust.zeme[m0[1]] = { domu: parseInt((h.textContent || '').replace(/\D/g, ''), 10),
                                     obyv: m ? parseInt(m[0], 10) : null, pribude: pm ? parseInt(pm[1], 10) : null };
            });
            rjRust = rust;
        } catch (e) {
            rjRustChyba = Date.now();
            console.warn('Rozjezd: auto_domy.asp se nenačetl, růst zatím bez sýpky a háje:', e.message);
        } finally {
            rjRustNacita = false;
        }
        if (rjKoren && rjRust) rjObnov();
    }

    function rjKola() {
        const k = rjPlan.kol;
        if (k !== '' && k != null && !isNaN(parseInt(k, 10))) return Math.max(0, parseInt(k, 10));
        const zbyva = window.DarkElfUtils.RoundsAPI ? window.DarkElfUtils.RoundsAPI.get() : null;
        return zbyva != null && !isNaN(zbyva) ? Math.max(0, zbyva) : 0;
    }

    function rjRustDomova(priv, zem) {
        const G = window.DarkElfUtils.Growth;
        const rate = (parseInt(priv.b_porodnost, 10) || 100) / 100;
        const r = (rjRust && rjRust.zeme[String(zem)]) || null;
        const obyvTed = (r && r.obyv != null) ? r.obyv : cislo(priv.obyvatel);
        const domu = (r && r.domu > 0) ? r.domu : cislo(priv.domu);

        let sypka = false, haj = false;
        if (r && r.pribude != null && rate > 0) {
            const prir = bn => G.oneTurn(obyvTed, rate, bn >= 4, bn % 4 === 2);
            const shody = [0, 2, 4, 6].filter(bn => prir(bn) === r.pribude);
            const bonus = shody.length ? shody[0]
                : [0, 2, 4, 6].reduce((a, b) => Math.abs(prir(b) - r.pribude) < Math.abs(prir(a) - r.pribude) ? b : a);
            sypka = bonus >= 4;
            haj = bonus % 4 === 2;
        }
        const kol = rjKola();
        const obyvPo = G.project(obyvTed, rate, sypka ? 1 : Infinity, haj, kol);
        const vojsko = cislo(priv.doma_war1) + cislo(priv.doma_war2) + cislo(priv.doma_war3)
            + cislo(priv.venku_war1) + cislo(priv.venku_war2) + cislo(priv.venku_war3);
        const dokupRust = Math.max(0, obyvPo + vojsko - domu);
        return { obyvatel: obyvPo, domu: domu, dokupRust: dokupRust, obyvTed: obyvTed, kol: kol,
                 sypka: sypka, haj: haj, zAutoDomu: !!(r && r.pribude != null) };
    }

    function rjVstupy() {
        const M = window.DarkElfUtils.MapAPI;

        const hotove = rjHotove(rjPlan), odeslano = rjOdeslanoZdroju(rjPlan, hotove), leti = rjOdeslanoZdroju(rjPlan, hotove, true);
        const zdroje = (rjPlan.zdroje || []).map((z, zi) => {
            if (rjVlastni) {
                const lim = z.limit !== '' && z.limit != null && !isNaN(parseInt(z.limit, 10)) ? cislo(z.limit) : null;
                return { zem: z.zem, doma: (z.dom || [0, 0, 0]).map(cislo), priv: null, limitVerbu: lim,
                         verbZ: z.verbZ };
            }

            const priv = z.zem ? M.getPrivate(z.zem) : null;
            const lim = z.limit !== '' && z.limit != null && !isNaN(parseInt(z.limit, 10)) ? cislo(z.limit) : null;

            const venku = priv ? [cislo(priv.venku_war1), cislo(priv.venku_war2), cislo(priv.venku_war3)] : [0, 0, 0];
            const nezna = rjNezaporne(rjOdecti(leti[zi] || [0, 0, 0], venku));
            const doma = rjDomaZdroje(z).map((n, t) => {
                const rucne = (z.dom || [])[t] !== '' && (z.dom || [])[t] != null;
                return rucne ? n : Math.max(0, n - nezna[t]);
            });
            return { zem: z.zem, doma: doma, odeslano: odeslano[zi], leti: leti[zi] || [0, 0, 0],
                     priv: priv ? rjRustDomova(priv, z.zem) : null, limitVerbu: lim, verbZ: z.verbZ };
        });
        return {
            zdroje: zdroje,
            hotove: hotove,
            jde: rjDosahPamet(),
            rezerva: window.DarkElfUtils.Growth.reserveForRace(rjRasaCz()),
            ceny: RJ_CENY[rjRasa()] || RJ_CENY.men,
            rozpocet: { zl: cislo(rjPlan.rozpocetZl), mana: cislo(rjPlan.rozpocetMana) },
            cenaDomu: (od, kolik) => window.DarkElfUtils.Growth.housePrice(od, kolik, rjData ? rjData.pocasi : 100),

            sila: (u, hrdina, rytir, postih) => spocitejUtok(u[0], u[1], u[2], {
                heroAbs: hrdina ? cislo(rjPlan.heroAbs) : 0, heroPct: hrdina ? cislo(rjPlan.heroPct) : 0,
                knight: !!rytir, postih: !!postih, modlitebna: false, katapult: false, cesty: false, arena: false }),

            zombieDoPlanu: false,

            zombie: rjRasa() === 'necromancers'
                ? (x, dny) => {
                    const s = rjPlan.sloty[x];
                    if (!s || !s.zem) return 0;
                    return Math.floor(0.1 * rjObrancu(rjZemSlotu(x), rjData ? rjData.den : null, dny, true));
                }
                : null,
            zombieMax: rjRasa() === 'necromancers'
                ? (x, dny) => {
                    const s = rjPlan.sloty[x];
                    if (!s || !s.zem) return 0;
                    return Math.floor(0.1 * rjObrancu(rjZemSlotu(x), rjData ? rjData.den : null, dny, false));
                }
                : null,
            puNa: (x, dny) => {
                const s = rjPlan.sloty[x];
                if (!s || !s.zem) return null;
                if (s.pu !== '' && s.pu != null && !isNaN(parseInt(s.pu, 10))) {
                    return { pu: parseInt(s.pu, 10), presne: true, rucne: true };
                }
                return rjPotrebnyUtok(rjZemSlotu(x), rjData ? rjData.den : null, dny,
                    RJ_NARUST, RJ_OBYV_DEN);
            }
        };
    }

    const rjEsc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const rjTri = (a) => a ? a.join('·') : '—';

    const RJ_EXPORT_SIRKA = 26;

    function rjKrabicka(nazev, vpravo, radky) {
        const W = RJ_EXPORT_SIRKA;
        const orez = (t, n) => t.length <= n ? t : t.slice(0, Math.max(0, n - 1)) + '…';
        const pravo = vpravo ? ' ' + vpravo + ' ' : '';
        const levo = ' ' + orez(nazev, W - pravo.length - 1) + ' ';
        const out = ['┌' + levo + '─'.repeat(Math.max(0, W + 2 - levo.length - pravo.length)) + pravo + '┐'];
        radky.forEach(r => { out.push('│ ' + orez(r, W).padEnd(W) + ' │'); });
        out.push('└' + '─'.repeat(W + 2) + '┘');
        return out;
    }

    function rjExport() {
        const P = rjPlan, vst = rjVstupy(), v = rjSpocti(P, vst), S = P.sloty, st = rjSt(P);
        const seZombie = rjSilaSeZombie(v, vst);
        const W = RJ_EXPORT_SIRKA, SIRKA_SLOUPCE = W + 4, nZ = P.zdroje.length;
        const tri = (a) => (a || [0, 0, 0]).join('·');

        const lp = (l, p) => l + ' '.repeat(Math.max(1, W - l.length - p.length)) + p;
        const potreba = (z) => z.pu ? z.pu.pu + (z.den && !z.pu.rucne ? '~' : '') : '?';
        const znacky = (z, s) => { const t = (z.hrdina ? 'H' : '') + (s && s.r ? 'R' : '') + (s && s.w ? 'P' : ''); return t ? ' ' + t : ''; };
        const sila = (z) => z.sila + (z.pu ? (z.ok ? ' ✓' : ' ✗') : '');
        const zombie = (z) => (z.zombie || z.zombieMax) ? '  +' + rjZombieRozsah(z) + ' zombie' : '';
        const jmenaZdroju = P.zdroje.map((z, i) => rjJmeno(z.zem) || ('zdroj ' + (i + 1)));

        const krabicka = (k) => {
            const z = v.sloty[k], s = S[k];
            const r = [lp('útok ' + tri(z.u) + znacky(z, s), sila(z)), 'padne ' + tri(z.padli) + zombie(z)];
            if (seZombie[k]) { const [a, b] = seZombie[k]; r.push('se zombie ' + (a === b ? a : a + '–' + b) + (b >= z.pu.pu ? (a >= z.pu.pu ? ' ✓' : ' (může)') : ' ✗')); }
            if (z.den === 0 && !rjNic(z.presun)) {

                const odjinud = Object.keys(z.presunZ || {});
                if (!odjinud.length || !rjNic(z.presunVl)) r.push('bokem ' + tri(z.presunVl || z.presun));
                odjinud.forEach(i => r.push('bokem ' + tri(z.presunZ[i]) + ' z ' + jmenaZdroju[i].slice(0, 10)));
            }
            if (z.den >= 1 && z.ok && st.dalsi[k]) r.push('přežije ' + tri(z.prezili));
            if (z.den >= 1 && z.ok && !rjNic(z.prisun)) r.push('+ přesun ' + tri(z.prisun));
            return rjKrabicka(k + ' ' + rjJmenoSlotu(k), 'PÚ ' + potreba(z), r);
        };

        const radky = [];
        const hrdina = (rjHrdinove || []).find(h => String(h.id) === String(P.hrdina));
        const odkud = nZ === 1 ? (rjVlastni ? ' · ze země ' : ' · domov ') + jmenaZdroju[0]
            : (rjVlastni ? ' · ze zemí ' : ' · zdroje ') + jmenaZdroju.join(', ');
        radky.push('Rozjezd ' + rjNazevStruktury(P) + (rjData && rjData.den ? ' · den ' + rjData.den : '')
            + (rjVlastni ? ' · ✎ vlastní zadání · ' + rjRasaCz() : '') + odkud
            + (P.omezRytire ? ' · Budget rozjezd' : '') + (P.maxVerb ? ' · Max verb' : ''));
        if (cislo(P.heroAbs) || cislo(P.heroPct)) {
            radky.push('hrdina ' + (hrdina ? (hrdina.jmeno || 'hrdina') + ' ' : '') + '(' + cislo(P.heroAbs) + ', +' + cislo(P.heroPct) + ' %)');
        }
        radky.push('');
        radky.push(' ' + RJ_DNY.slice(0, st.dny).map((n, i) => i < st.dny - 1 ? n.padEnd(SIRKA_SLOUPCE + (i ? 3 : 2)) : n).join(''));

        P.zdroje.forEach((zz, zi) => {
            const vetve = P.vetve.filter(b => b.zdroj === zi && v.sloty[b.kroky[0]]);
            if (!vetve.length) return;
            if (nZ > 1) radky.push(' ── ' + jmenaZdroju[zi] + ' ──');
            vetve.forEach(b => {
                const sloupce = [krabicka(b.kroky[0])];
                let konec = false;
                for (let dd = 1; dd < st.dny; dd++) {
                    const x = b.kroky[dd - 1], y = b.kroky[dd];
                    if (konec || !v.sloty[x]) { sloupce.push([]); konec = true; continue; }
                    if (S[x].dal === 'presun') {
                        const roz = (P.rozdel && P.rozdel[x]) || {};
                        const kam = (v.cile[dd] || []).filter(c => Array.isArray(roz[c]) && !rjNic(roz[c]))
                            .map(c => '  ' + c + ' ' + rjJmenoSlotu(c).slice(0, 14) + ' ' + tri(roz[c]));
                        sloupce.push(['', 'přeposílá ⇢'].concat(kam.length ? kam : ['  (nic)']));
                        konec = true;
                    } else if (v.sloty[y]) {
                        sloupce.push(krabicka(y));
                    } else { sloupce.push([]); konec = true; }
                }
                const vyska = Math.max(...sloupce.map(c => c.length));
                for (let i = 0; i < vyska; i++) {
                    const bunka = (c) => (c[i] || '').padEnd(SIRKA_SLOUPCE);

                    const sip = (c) => (i === 1 && c.length ? '─▶ ' : '   ');
                    radky.push(sloupce.map((c, ci) => (ci ? sip(c) : '') + bunka(c)).join('').replace(/\s+$/, ''));
                }
            });
        });

        const padli = Object.keys(v.sloty).reduce((a, k) => rjSecti(a, v.sloty[k].padli), [0, 0, 0]);
        const V = v.verb;
        radky.push('');
        const smiTxt = (i) => {
            const umi = [0, 1, 2].filter(t => rjSmiVerb(rjPlan.zdroje[i] || {}, t));
            return umi.length < 3 ? ', verbuje ' + (umi.length ? umi.map(t => t + 1).join('+') : 'nic') : '';
        };
        radky.push(' VERB DNES  ' + tri(V.verb) + ' = ' + V.zlato + ' zl + ' + V.mana + ' many'
            + (nZ === 1 && V.maxVerb != null ? '   (limit ' + V.maxVerb + ', z domova ' + tri(V.zDomova) + ')' : '')
            + (nZ === 1 ? smiTxt(0) : ''));
        if (nZ > 1) {
            V.zdroje.forEach((z, i) => {

                radky.push('   ' + jmenaZdroju[i] + ': ' + tri(z.verb)
                    + (z.maxVerb != null ? ' (limit ' + z.maxVerb + ')' : '') + ', ze země ' + tri(z.zDomova)
                    + smiTxt(i));
            });
        }
        V.zdroje.forEach((z, i) => {
            if (!z.domy) return;
            radky.push(' DOMY       ' + (nZ > 1 ? jmenaZdroju[i] + ': ' : '') + 'na ' + z.domy.vojaku + ' vojáků potřeba ' + z.domy.potreba
                + ', máš ' + z.domy.mas + (z.domy.dokup ? ' → +' + z.domy.dokup + ' = ' + z.domy.zlato + ' zl' : ' ✓'));
        });
        radky.push(' CELKEM     padne ' + tri(padli) + (v.chyby.length ? ' · ⚠ ' + v.chyby.length + ' chyb' : ' · vychází ✓'));
        if (radky.some(r => /PÚ \d+~/.test(r))) {
            radky.push(' ~ odhad potřeby: nejhorší růst neutrálky (+' + RJ_NARUST + ' obrany a +' + RJ_OBYV_DEN + ' obyvatel za den)');
        }
        if (radky.some(r => / zombie/.test(r))) radky.push(' zombie = navíc, plán s nimi nepočítá');

        return '```\n' + radky.join('\n') + '\n```';
    }

    function rjSilaSeZombie(v, vst) {
        const out = {};
        if (!vst.zombie) return out;
        const nestaci = Object.keys(v.sloty).filter(x => v.sloty[x].den >= 1 && v.sloty[x].pu && !v.sloty[x].ok);
        if (!nestaci.length) return out;
        const vMin = rjSpocti(rjPlan, Object.assign({}, vst, { zombieDoPlanu: true }));
        const vMax = rjSpocti(rjPlan, Object.assign({}, vst, { zombieDoPlanu: true,
            zombie: (x, dny) => dny && vst.zombieMax ? vst.zombieMax(x, dny) : vst.zombie(x, dny) }));
        nestaci.forEach(x => {
            const a = vMin.sloty[x], b = vMax.sloty[x];
            if (a && b) out[x] = [a.sila, Math.max(a.sila, b.sila)];
        });
        return out;
    }

    function rjZombieRozsah(z) {
        const a = z.zombie || 0, b = Math.max(a, z.zombieMax || 0);
        return a === b ? String(a) : a + '–' + b;
    }

    function rjJmeno(id) {
        if (id === RJ_VLASTNI_ZEM) return 'vlastní PÚ';
        const z = id ? window.DarkElfUtils.MapAPI.getCountry(id) : null;
        return z ? (z.zeme || ('zem ' + id)) : '';
    }

    const RJ_VLASTNI_ZEM = 'vlastni';

    function rjZemSlotu(x) {
        const s = rjPlan.sloty[x];
        if (!s || !s.zem) return null;
        if (s.zem !== RJ_VLASTNI_ZEM) return window.DarkElfUtils.MapAPI.getCountry(s.zem);
        const pu = cislo(s.vPu);
        return pu ? { vlastni: true, id: RJ_VLASTNI_ZEM, zeme: 'vlastní PÚ ' + pu, min_utok: pu, bonus_obrana: cislo(s.vBonus) } : null;
    }

    function rjJmenoSlotu(x) {
        const z = rjZemSlotu(x);
        return z ? (z.zeme || ('zem ' + z.id)) : rjJmeno(rjPlan.sloty[x] && rjPlan.sloty[x].zem);
    }

    function rjVlastniPu(x) {
        const s = rjPlan.sloty[x];
        if (!s || s.zem !== RJ_VLASTNI_ZEM) return '';
        return `<div class="rj-r rj-vlevo"><span class="rj-l" title="Potřebný útok neutrálky DNES a její bonus obrany — další dny se z toho odhadnou">neutrálka</span>
            PÚ dnes <input class="rj-n rj-pu" data-k="sloty.${x}.vPu" value="${s.vPu ? cislo(s.vPu) : ''}" placeholder="?">
            bonus <input class="rj-n" data-k="sloty.${x}.vBonus" value="${cislo(s.vBonus) || ''}" placeholder="0"> %</div>`;
    }

    const RJ_CSS = `
        :host { all: initial; }
        .rj-telo { color: #ddd; font: 11px Arial, sans-serif; text-align: left; line-height: normal; container-type: inline-size; }
        @container (min-width: 1340px) {
            .rj-rozlozeni { display: grid; grid-template-columns: minmax(0, 1fr) 400px; grid-template-rows: auto 1fr;
                            grid-template-areas: "plan nast" "plan konec"; column-gap: 14px; align-items: start; }
            .rj-plan { grid-area: plan; }
            .rj-nastaveni { grid-area: nast; }
            .rj-konec { grid-area: konec; }
            .rj-konec .rj-chyby { margin-top: 0; }
            .rj-nastaveni .rj-nast { margin-bottom: 6px; }
        }
        div, span, b, label { box-sizing: border-box; float: none; }
        b { font-weight: bold; }
        .rj-hlavicka { display: flex; justify-content: space-between; align-items: center; color: #ffcc00; font-weight: bold;
            font-size: 13px; border-bottom: 1px solid #553311; padding-bottom: 4px; margin-bottom: 6px; }
        .rj-hlavicka { cursor: move; user-select: none; }
        .rj-okno-tl { display: flex; gap: 2px; align-items: center; margin-left: 8px; }
        .rj-btn { cursor: pointer; color: #bbb; min-width: 20px; text-align: center; border: 1px solid transparent;
                  border-radius: 2px; font-size: 13px; line-height: 16px; font-weight: normal; }
        .rj-btn.rj-btn-on { color: #ffcc00; border-color: #aa8800; }
        .rj-vlastni-t { color: #88ccff; font-size: 11px; font-weight: normal; margin-left: 6px; }
        .rj-rucne-t { color: #88ccff; font-size: 11px; font-weight: normal; margin-left: 4px; }
        input.rj-zem-in { width: 170px; font-size: 10px; background: rgba(0,0,0,0.5); color: #fff; border: 1px solid #555; padding: 0 2px; }
        .rj-btn:hover { border-color: #776633; color: #fff; background: rgba(255,255,255,0.06); }
        .rj-zavrit { color: #ff6666; font-size: 14px; }
        .rj-smaz { cursor: pointer; color: #995555; margin-left: auto; padding: 0 3px; font-weight: normal; }
        .rj-smaz:hover { color: #ff6666; }
        .rj-m-cesta { border-bottom: 1px solid #332211; padding: 3px 0; }
        .rj-m-zdroj { color: #ffcc00; font-weight: bold; margin-top: 6px; }
        .rj-zdroj { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; color: #aaa;
                    border-top: 1px solid #553311; padding-top: 5px; margin-top: 2px; }
        .rj-m-info { color: #ccc; font-size: 10px; line-height: 1.5; margin-left: 14px; }
        .rj-nast { display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: center; margin-bottom: 8px; color: #aaa; }
        .rj-mrizka { display: grid; grid-template-columns: minmax(0,1fr) 16px minmax(0,1fr) 16px minmax(0,0.75fr); gap: 6px 0; align-items: stretch; }
        .rj-sloupec { color: #ffcc00; font-weight: bold; text-align: center; padding-bottom: 2px; }
        .rj-sipka { color: #887755; display: flex; align-items: center; justify-content: center; font-size: 14px; }
        .rj-karta { border: 1px solid #554422; border-radius: 3px; background: rgba(0,0,0,0.3); padding: 4px 6px; line-height: 1.6; }
        .rj-siroke .rj-karta:not([data-karta$="p"]) { display: grid; grid-template-columns: max-content minmax(0, 1fr);
            column-gap: 12px; grid-auto-flow: row dense; align-content: start; }
        .rj-siroke .rj-karta > * { grid-column: 2; min-width: 0; }
        .rj-siroke .rj-karta > .rj-vlevo { grid-column: 1; flex-wrap: nowrap; white-space: nowrap; }
        .rj-siroke .rj-karta > :first-child, .rj-siroke .rj-karta > .rj-dopocet,
        .rj-siroke .rj-karta > .rj-cely { grid-column: 1 / -1; }
        .rj-siroke .rj-l { min-width: 50px; }
        .rj-dopocet:not(:has(.rj-req:not(:empty))) { display: none; }
        .rj-volitelne:not(:has([data-o]:not(:empty))) { display: none; }
        .rj-karta.rj-zle { border-color: #aa3333; }
        .rj-karta.rj-ok { border-color: #337733; }
        .rj-prazdna { border: 1px dashed #333; border-radius: 3px; color: #555; padding: 4px 6px; }
        .rj-r { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
        .rj-l { color: #999; min-width: 64px; }
        .rj-odeslano { font-size: 10px; white-space: nowrap; }
        .rj-podrobnosti > summary { cursor: pointer; color: #ffcc00; font-weight: bold; }
        .rj-podrobnosti[open] > summary { margin-bottom: 2px; }
        .rj-zamek { cursor: pointer; }
        input.rj-n:disabled { color: #aaa; background: rgba(60,60,60,0.5); border-color: #444; }
        .rj-l-zdroj { max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        input.rj-n { width: 30px; font-size: 10px; background: rgba(0,0,0,0.5); color: #fff; border: 1px solid #555; text-align: center; padding: 0; }
        input.rj-pu { width: 38px; }
        select { font-size: 10px; background: #333; color: #ddd; border: 1px solid #555; max-width: 150px; }
        .rj-plus { cursor: pointer; color: #88ccff; border: 1px solid #446; border-radius: 3px; padding: 0 3px; }
        .rj-plus.rj-off { color: #555; border-color: #333; cursor: default; }
        .rj-tg { cursor: pointer; border: 1px solid #555; padding: 0 4px; color: #999; background: #333; }
        .rj-tg.rj-on { color: #ffcc00; border-color: #aa8800; font-weight: bold; }
        .rj-ok-t { color: #7fdf7f; font-weight: bold; }
        .rj-pocita { display: inline-block; background: rgba(20,10,0,0.92); border: 1px solid #b8860b; border-radius: 4px;
                     color: #ffcc44; font: bold 11px sans-serif; padding: 1px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.6); }
        .rj-pocita i { display: inline-block; font-style: normal; animation: rj-spin 1.2s linear infinite; }
        @keyframes rj-spin { to { transform: rotate(360deg); } }
        .rj-zle-t { color: #ff6666; font-weight: bold; }
        .rj-pad { color: #ff9999; }
        .rj-sedy { color: #888; }
        .rj-souhrn { margin-top: 8px; border-top: 1px solid #553311; padding-top: 6px; line-height: 1.7; }
        .rj-chyby { color: #ff6666; margin-top: 6px; }
        .rj-dopocet { min-height: 12px; }
        .rj-req { display: inline-block; width: 30px; text-align: center; font-size: 9px; color: #ffaaaa; }
        .rj-req[data-pridej] { cursor: pointer; }
        .rj-req-ne { color: #886666; cursor: default; }
        .rj-req[data-pridej]:hover { color: #fff; }
        .rj-sbal { cursor: pointer; color: #ffcc00; margin-right: 4px; }
        .rj-stav { font-weight: normal; font-size: 11px; margin-left: 10px; }
    `;

    function rjTriVstupy(cesta, hodnoty, drzitele, zamceno) {
        return [0, 1, 2].map(i => {
            const v = (hodnoty || [])[i];
            const psano = (v === '' || v == null) ? '' : cislo(v);
            const ph = drzitele ? ` placeholder="${cislo(drzitele[i])}"` : '';
            return zamceno
                ? `<input class="rj-n" data-k="${cesta}.${i}" value="${psano}" disabled title="Odesláno — zamčeno (odemknout klikem na 🔒 v záhlaví karty)">`
                : `<input class="rj-n" data-k="${cesta}.${i}" value="${psano}"${ph} title="${i + 1}. stupeň">`;
        }).join('');
    }

    function rjVyberZeme(x) {
        const s = rjPlan.sloty[x];
        const zdroj = rjZdrojSlotu(x);
        const sousedi = rjSousedniNeutralky(zdroj);
        const opts = ['<option value="">— vyber —</option>'];
        let jeVSeznamu = false;
        sousedi.forEach(n => {
            const sel = n.id === String(s.zem);
            if (sel) jeVSeznamu = true;
            opts.push(`<option value="${n.id}"${sel ? ' selected' : ''}>${rjEsc(n.jmeno)} · ${n.pu}${n.bonus ? ' (+' + n.bonus + ' %)' : ''}</option>`);
        });
        if (rjVlastni) {
            opts.push(`<option value="${RJ_VLASTNI_ZEM}"${s.zem === RJ_VLASTNI_ZEM ? ' selected' : ''}>✎ vlastní PÚ</option>`);
            if (s.zem === RJ_VLASTNI_ZEM) jeVSeznamu = true;
        }
        if (s.zem && !jeVSeznamu) {
            opts.push(`<option value="${rjEsc(s.zem)}" selected>${rjEsc(rjJmeno(s.zem))} (nesousedí)</option>`);
        }
        const tady = window.DarkElfUtils.MapAPI.getCountry(rjZemeTady());
        const muze = window.DarkElfUtils.NeutralAPI.jeNeutralka(tady);
        const plus = `<span class="rj-plus${muze ? '' : ' rj-off'}" data-plus="${x}" title="${muze
            ? 'Vložit sem zem, na které stojíš: ' + rjEsc(tady.zeme) : 'Stojíš na zemi, která není neutrálka'}">⊕</span>`;
        return `<select data-zem="${x}" title="Sousední neutrálky ${zdroj ? 'země ' + rjEsc(rjJmeno(zdroj)) : '(nejdřív vyber, odkud se útočí)'}, od nejslabší">${opts.join('')}</select> ${plus}`;
    }

    function rjHlavicka() {
        const sb = rjSbaleno(), male = rjZaklad() === 'male';
        return `<div class="rj-hlavicka" title="Okno jde přesunout tažením za tuhle lištu"><span>Rozjezd ${rjEsc(rjNazevStruktury())}${rjVlastni ? ' <span class="rj-vlastni-t">✎ vlastní zadání</span>' : ''}<span class="rj-stav" data-o="stav"></span></span>
            <span class="rj-okno-tl">
                <span class="rj-btn${rjVlastni ? ' rj-btn-on' : ''}" data-vlastni title="${rjVlastni ? 'Zpátky na tvůj rozjezd' : 'Vlastní zadání — rozjezd pro někoho jiného: země, rasa, vojsko, limit verbu a hrdina ručně (má vlastní uložený plán)'}">✎</span>
                <span class="rj-btn" data-sbal title="${sb ? 'Obnovit okno' : 'Sbalit do lišty'}">${sb ? '▢' : '—'}</span>
                ${sb ? '' : `<span class="rj-btn" data-male title="${male ? 'Velké okno' : 'Malé okno na výšku — jen země a jednotky'}">${male ? '□' : '❐'}</span>`}
                <span class="rj-btn rj-zavrit" title="Zavřít (Esc)">✕</span>
            </span></div>`;
    }

    function rjSmazTl(x) {
        const st = rjSt(), d = st.denKroku[x];
        if (d !== 0 && !rjPlan.sloty[x].zem) return '';
        const titul = d === 0 ? 'Smazat útok ' + x + ' (celý řádek)' : 'Smazat ' + x + (st.dalsi[x] ? ' (i navazující)' : '');
        return `<span class="rj-smaz" data-smaz="${x}" title="${titul}">✕</span>`;
    }

    function rjSmazSlot(x) {
        const P = rjPlan, st = rjSt(P), d = st.denKroku[x], b = P.vetve[st.vetev[x]];
        if (!b) return;
        const retez = d === 0 ? b.kroky.slice() : b.kroky.slice(d);
        if (d === 0) {
            P.vetve.splice(st.vetev[x], 1);
            retez.forEach(k => { delete P.sloty[k]; });
        } else {
            retez.forEach(k => { P.sloty[k] = rjNovySlot(); });
        }
        retez.forEach(k => { delete P.rozdel[k]; });
        Object.keys(P.rozdel).forEach(k => retez.forEach(y => { if (P.rozdel[k]) delete P.rozdel[k][y]; }));
        P.navrhInfo = '';
    }

    function rjPridejVetev(zi) {
        const P = rjPlan;
        if (P.vetve.length >= RJ_MAX_VETVI) return;
        const b = { zdroj: zi, kroky: [] };
        const kam = P.vetve.reduce((k, v, i) => v.zdroj <= zi ? i : k, -1);
        P.vetve.splice(kam + 1, 0, b);
        for (let d = 0; d < 3; d++) { const x = rjVolnyStitek(P); b.kroky.push(x); P.sloty[x] = rjNovySlot(); }
        P.navrhInfo = '';
    }

    function rjSmazZdroj(zi) {
        const P = rjPlan;
        if (P.zdroje.length < 2) return;
        P.vetve.filter(b => b.zdroj === zi).forEach(b => rjSmazSlot(b.kroky[0]));
        P.zdroje.splice(zi, 1);
        P.vetve.forEach(b => { if (b.zdroj > zi) b.zdroj--; });
        Object.keys(P.sloty).forEach(x => { if (Array.isArray(P.sloty[x].pj)) P.sloty[x].pj.splice(zi, 1); });
        P.navrhInfo = '';
    }

    const rjJmenoZdroje = (zi) => rjJmeno((rjPlan.zdroje[zi] || {}).zem) || ('zdroj ' + (zi + 1));

    function rjRucniZdroj(z) {
        const limit = z.limit !== '' && z.limit != null;
        return limit || (z.dom || []).some(v => v !== '' && v != null);
    }

    function rjDomaZdroje(z) {
        const mapa = posadkaZeme(z.zem) || [0, 0, 0];
        return [0, 1, 2].map(i => {
            const v = (z.dom || [])[i];
            return (v === '' || v == null) ? cislo(mapa[i]) : cislo(v);
        });
    }

    function rjZdrojRadek(zi) {
        const P = rjPlan, z = P.zdroje[zi], M = window.DarkElfUtils.MapAPI;
        const smaz = P.zdroje.length > 1 ? `<span class="rj-smaz" data-smaz-zdroj="${zi}" title="Odebrat zdroj i s jeho útoky">✕</span>` : '';
        const pridat = P.vetve.length < RJ_MAX_VETVI
            ? `<span class="rj-tg" data-pridat-vetev="${zi}" title="Další útok dnes z této země (nový řádek)">+ útok</span>` : '';

        const smiVerb = `<span title="Které stupně se v té zemi verbují. Dvojky chtějí v zemi Cech války, trojky Cech magie — jinde je naverbovat nejde; odškrtnout jde i stupeň, který zem umí, ale verbovat ho tam nechceš. Hlavní útočná jednotka = zaškrtnutá dvojka/trojka s vyšším útokem, jedničky dorovnají zbytek limitu a rozpočtu (snižují ztráty).">verbovat ${[0, 1, 2].map(t => `<label><input type="checkbox" data-zvz="${zi}.${t}"${rjSmiVerb(z, t) ? ' checked' : ''}>${t + 1}</label>`).join('')}</span>`;
        const jinam = P.zdroje.length > 1 ? `<label title="Smí tahle země posílat přesun bokem i do útoků ostatních zdrojů? (Jen když k nim vede cesta — soused nebo volný průchod.) Navrhni pak vyrovnává vojsko mezi zeměmi — na domy se počítá všechno, co v zemi je, doma i naverbované."><input type="checkbox" data-c="zdroje.${zi}.jinam"${z.jinam ? ' checked' : ''}> přesun i jinam</label>` : '';
        if (rjVlastni) {
            const tady = z.zem ? M.getCountry(z.zem) : null;
            return `<div class="rj-zdroj"><b style="color:#ffcc00;">Zdroj ${zi + 1}</b>
                <input class="rj-zem-in" list="rj-seznam-zemi" data-vlastni-zem="${zi}" value="${tady ? rjEsc((tady.zeme || ('zem ' + tady.id)) + ' #' + tady.id) : ''}" placeholder="jméno země…"
                    title="Zem, ze které se útočí — začni psát jméno, nabídnou se všechny země na mapě">
                <span title="Vojsko doma v té zemi (1. / 2. / 3. stupeň)">vojsko doma ${rjTriVstupy('zdroje.' + zi + '.dom', z.dom)}</span>
                <span title="Kolik smí dnes v té zemi nejvíc naverbovat (limit verbu)">verb max <input class="rj-n" data-k="zdroje.${zi}.limit" value="${z.limit === '' || z.limit == null ? '' : cislo(z.limit)}" placeholder="?"></span>
                ${smiVerb}${jinam}${pridat}${smaz}</div>`;
        }
        const zeme = (rjData ? rjData.moje : []).map(m =>
            `<option value="${m.id}"${m.id === String(z.zem) ? ' selected' : ''}>${rjEsc(m.jmeno)}</option>`).join('');

        const mapaDoma = posadkaZeme(z.zem) || [0, 0, 0];
        const znacka = ` <span class="rj-rucne-t" data-o="z${zi}.rucne" title="Vojsko doma nebo verb max máš přepsané ručně — vymaž políčko a vrátí se hodnota z mapy"></span>`;
        return `<div class="rj-zdroj"><b style="color:#ffcc00;">Zdroj ${zi + 1}</b>${znacka}
            <select data-zdroj="${zi}" title="Tvoje zem, ze které se dnes útočí">${zeme || '<option value="">(žádná zem)</option>'}</select>
            <span title="Vojsko doma (1. / 2. / 3. stupeň). Prázdné = z mapy, vyplněné přebíjí — třeba když už máš vojsko venku v útoku.">vojsko doma ${rjTriVstupy('zdroje.' + zi + '.dom', z.dom, mapaDoma)}</span>
            <span title="Kolik smí dnes v té zemi nejvíc naverbovat. Prázdné = spočítá se z obyvatel a domů, vyplněné přebíjí.">verb max <input class="rj-n" data-k="zdroje.${zi}.limit" value="${z.limit === '' || z.limit == null ? '' : cislo(z.limit)}" placeholder="?"> <b data-o="z${zi}.max"></b></span>
            ${smiVerb}${jinam}${pridat}${smaz}</div>`;
    }

    function rjPostavMale(hlavicka) {
        const P = rjPlan, st = rjSt(P);
        const radek = (x, odsazeni) => `<div style="padding-left:${odsazeni * 14}px;">
                <div class="rj-r">${odsazeni ? '<span class="rj-sedy">↳</span>' : ''}<b style="color:#ffcc00;">${x}</b> ${rjVyberZeme(x)} <span class="rj-odeslano" data-o="${x}.odeslano"></span>${rjSmazTl(x)}</div>
                ${rjVlastniPu(x)}
                ${P.sloty[x].zem ? `<div class="rj-m-info" data-o="m.${x}"></div>` : ''}</div>`;
        let h = '';
        P.zdroje.forEach((z, zi) => {
            if (P.zdroje.length > 1) h += `<div class="rj-m-zdroj">${rjEsc(rjJmenoZdroje(zi))}</div>`;

            if (P.zdroje.length > 1 && z.jinam) h += `<div class="rj-m-info" data-o="m.z${zi}.jinam"></div>`;
            P.vetve.forEach(b => {
                if (b.zdroj !== zi) return;
                h += '<div class="rj-m-cesta">' + radek(b.kroky[0], 0);
                for (let d = 1; d < st.dny; d++) {
                    const x = b.kroky[d - 1], y = b.kroky[d];
                    if (!P.sloty[x].zem || P.sloty[x].dal === 'presun') break;
                    h += radek(y, d);
                    if (!P.sloty[y].zem) break;
                }
                h += '</div>';
            });
        });
        rjKoren.querySelector('.rj-telo').innerHTML = hlavicka + `<div class="rj-male">${h}</div>
            <div class="rj-nast" style="margin:6px 0 0;"><span class="rj-tg rj-on" data-navrhni title="Spočítá útoky dnes, přesuny bokem a přeposílky tak, aby všechny útoky prošly.">Navrhni</span>
                <span data-o="navrh"></span></div>
            <div class="rj-chyby" data-o="chyby"></div>`;
        rjObnov();
    }

    function rjDalTl(x) {
        const s = rjPlan.sloty[x];
        return `<div class="rj-r rj-vlevo"><span class="rj-l">dál</span>
            <span class="rj-tg${s.dal !== 'presun' ? ' rj-on' : ''}" data-dal="${x}:utok" title="${x} další den útočí dál celým vojskem">útočí dál</span>
            <span class="rj-tg${s.dal === 'presun' ? ' rj-on' : ''}" data-dal="${x}:presun" title="${x} jen přepošle vojsko do zemí, na které další den útočí ostatní (kteréhokoli zdroje)">přeposílá</span></div>`;
    }

    function rjPresunZdroje(zi, st) {
        const P = rjPlan;
        const cile = st.den[0].filter(y => P.sloty[y] && P.sloty[y].zem && st.zdroj(y) !== zi);
        const radky = cile.length ? cile.map(y => {
            const pj = P.sloty[y].pj || [], zam = !!(rjHotoveTed[y] && rjHotoveTed[y].pj[zi]);
            const v = rjJinamJak(P, st, y, zi);
            const c = rjPopisCesty(v, rjJmenoZdroje(zi), rjJmenoSlotu(y) || y);
            const popis = c.popis || `Přesun bokem z ${rjEsc(rjJmenoZdroje(zi))} do útoku ${y} — totéž jako řádek „+ z ${rjEsc(rjJmenoZdroje(zi))}“ v kartě ${y}`;
            return `<div class="rj-r rj-cely"><span class="rj-l rj-l-zdroj${rjDojde(v) ? '' : ' rj-sedy'}" title="${rjEsc(popis)}">→ ${y} ${rjEsc(rjJmenoSlotu(y))}${c.znacka}</span>${rjTriVstupy('sloty.' + y + '.pj.' + zi, Array.isArray(pj[zi]) ? pj[zi] : [0, 0, 0], null, zam || !rjDojde(v))}</div>`;
        }).join('') : '<div class="rj-sedy rj-cely">Ostatní zdroje dnes zatím neútočí — není kam poslat.</div>';
        return `<div class="rj-r rj-cely"><span class="rj-sedy">bez útoku — přesun do útoků ostatních zdrojů:</span></div>${radky}
            <div class="rj-r rj-cely"><span class="rj-l">doma</span><span data-o="z${zi}.posila"></span></div>`;
    }

    function rjKartaDen0(x) {
        const P = rjPlan, s = P.sloty[x], st = rjSt(P), nZ = P.zdroje.length;
        const zi = st.zdroj(x);
        const prvniPrazdny = st.den[0].find(y => st.zdroj(y) === zi && !P.sloty[y].zem);
        const jenPosila = !s.zem && nZ > 1 && P.zdroje[zi] && P.zdroje[zi].jinam && prvniPrazdny === x;

        const pj = s.pj || [];
        const H = rjHotoveTed[x] || { pj: {} };

        const odjinud = rjJinam(P, st, x).map(i => {
            const v = rjJinamJak(P, st, x, i);
            const c = rjPopisCesty(v, rjJmenoZdroje(i), rjJmenoSlotu(x) || x);
            const popis = c.popis || `Přesun bokem ze zdroje ${rjEsc(rjJmenoZdroje(i))} (má zaškrtnuté „přesun i jinam“)`;
            return `<div class="rj-r rj-vlevo"><span class="rj-l rj-l-zdroj${rjDojde(v) ? '' : ' rj-sedy'}" title="${rjEsc(popis)}">+ z ${rjEsc(rjJmenoZdroje(i))}${c.znacka}</span>${rjTriVstupy('sloty.' + x + '.pj.' + i, Array.isArray(pj[i]) ? pj[i] : [0, 0, 0], null, !!H.pj[i] || !rjDojde(v))}</div>`;
        }).join('');
        return `<div class="rj-karta" data-karta="${x}">
            <div class="rj-r"><b style="color:#ffcc00;">${x}</b> ${rjVyberZeme(x)} <span class="rj-odeslano" data-o="${x}.odeslano"></span>${rjSmazTl(x)}</div>
            ${rjVlastniPu(x)}
            ${!s.zem ? (jenPosila ? rjPresunZdroje(zi, st) : '') : `
            <div class="rj-r"><span class="rj-l">potřeba</span><b data-o="${x}.pu"></b>
                <input class="rj-n rj-pu" data-k="sloty.${x}.pu" value="${rjEsc(s.pu)}" placeholder="ručně" title="Skutečný potřebný útok, když ho znáš — přebije odhad"></div>
            <div class="rj-r rj-vlevo"><span class="rj-l">útok</span>${rjTriVstupy('sloty.' + x + '.u', s.u, null, H.u)}
                <label title="Hrdina jde s tímhle útokem — a pokračuje s ním i další dny"><input type="checkbox" data-c="sloty.${x}.h"${s.h ? ' checked' : ''}${H.u ? ' disabled' : ''}>H</label>
                <label title="Rytíř ×1,1"><input type="checkbox" data-c="sloty.${x}.r"${s.r ? ' checked' : ''}${H.u ? ' disabled' : ''}>R</label>
                <label title="Útok BEZ vyhlášení války: síla útoku −30 %. Hodí se, když na dobyté zemi chceš hned volný průchod — s válkou by se smlouva dala uzavřít až po přepočtu."><input type="checkbox" data-c="sloty.${x}.w"${s.w ? ' checked' : ''}${H.u ? ' disabled' : ''}>P</label>
                ${H.u ? '' : `<span class="rj-tg" data-max="${x}" title="Do útoku všechno, co ve zdroji zbývá po OSTATNÍCH útocích — včetně toho, co tenhle krok posílá přesunem bokem (ten se vynuluje). Na zem, kde hrozí střet s jiným útočníkem: přesun dorazí až po vyhodnocení boje, takže by byl v případě prohry dárek nepříteli.">max</span>`}</div>
            <div class="rj-r rj-dopocet"><span class="rj-l"></span><span class="rj-req" data-o="${x}.req0"></span><span class="rj-req" data-o="${x}.req1"></span><span class="rj-req" data-o="${x}.req2"></span></div>
            <div class="rj-r"><span class="rj-l">síla</span><span data-o="${x}.sila"></span> <span class="rj-pad" data-o="${x}.padli"></span></div>
            <div class="rj-r rj-vlevo"><span class="rj-l" title="Přesun bokem — boje se neúčastní, zítra je v ${x} celý">+ přesun</span>${rjTriVstupy('sloty.' + x + '.p', s.p, null, H.p)}</div>${odjinud}
            ${st.dny > 1 ? `<div class="rj-r"><span class="rj-l">zítra v ${x}</span><b data-o="${x}.zitra"></b></div>${rjDalTl(x)}` : ''}`}
        </div>`;
    }

    function rjKartaPresun(x, cile, d) {
        const roz = rjPlan.rozdel[x] || {};
        const radky = cile.length
            ? cile.map(y => {
                const v = rjJdeZKroku(rjPlan, x, y);
                const c = rjPopisCesty(v, rjJmenoSlotu(x) || x, rjJmenoSlotu(y) || y);
                return `<div class="rj-r"><span class="rj-l${rjDojde(v) ? '' : ' rj-sedy'}"${c.popis ? ` title="${rjEsc(c.popis)}"` : ''}>→ ${y} ${rjEsc(rjJmenoSlotu(y))}${c.znacka}</span>${rjTriVstupy('rozdel.' + x + '.' + y, roz[y], null, !rjDojde(v))}</div>`;
              }).join('')
            : `<div class="rj-sedy">${RJ_DNY[d].charAt(0) + RJ_DNY[d].slice(1).toLowerCase()} zatím nikdo neútočí — není kam přeposlat.</div>`;
        return `<div class="rj-karta" data-karta="${x}p">
            <div><b style="color:#ffcc00;">${x}</b> přeposílá <span class="rj-sedy">(v ${x} bude <span data-o="${x}.zitra"></span>)</span></div>
            ${radky}
            <div class="rj-r"><span class="rj-l">zbyde v ${x}</span><b data-o="${x}.zbyde"></b></div>
        </div>`;
    }

    function rjKartaDalsi(y, d) {
        const st = rjSt(), x = st.pred[y], s = rjPlan.sloty[y];
        const rytir = `<label title="Rytíř ×1,1"><input type="checkbox" data-c="sloty.${y}.r"${s.r ? ' checked' : ''}>R</label>`
            + `<label title="Útok BEZ vyhlášení války: síla útoku −30 %."><input type="checkbox" data-c="sloty.${y}.w"${s.w ? ' checked' : ''}>P</label>`;
        return `<div class="rj-karta" data-karta="${y}">
            <div class="rj-r"><b style="color:#ffcc00;">${y}</b> ${rjVyberZeme(y)} <span class="rj-sedy">z ${x}</span> <span class="rj-odeslano" data-o="${y}.odeslano"></span>${rjSmazTl(y)}</div>
            ${rjVlastniPu(y)}
            ${d >= 2 ? `<div class="rj-r rj-cely"><span class="rj-l">v ${x} bude</span><b data-o="${x}.zitra"></b> <span class="rj-sedy" data-o="${x}.prisunTxt"></span></div>` : ''}
            ${!s.zem ? (d >= 2 ? '' : `<div class="rj-sedy">v ${x} bude <span data-o="${x}.zitra"></span></div>`)
                + `<div class="rj-r"><span class="rj-l">síla útoku</span><b data-o="${x}.silaDalsi"></b> ${rytir}</div>` : `
            <div class="rj-r"><span class="rj-l">potřeba</span><b data-o="${y}.pu"></b>
                <input class="rj-n rj-pu" data-k="sloty.${y}.pu" value="${rjEsc(s.pu)}" placeholder="ručně" title="Skutečný potřebný útok — přebije odhad"></div>
            <div class="rj-r rj-vlevo"><span class="rj-l" title="Útočí celé vojsko, které v ${x} bude">útok (vše z ${x})</span>${d === 1 ? `<b data-o="${y}.u"></b>` : ''}
                <span class="rj-sedy" data-o="${y}.hrdinaTxt" title="Hrdina jde dál s útokem, se kterým šel dnes"></span> ${rytir}</div>
            <div class="rj-r rj-dopocet"><span class="rj-l"></span><span class="rj-req" data-o="${y}.req0"></span><span class="rj-req" data-o="${y}.req1"></span><span class="rj-req" data-o="${y}.req2"></span></div>
            <div class="rj-r"><span class="rj-l">síla</span><span data-o="${y}.sila"></span> <span class="rj-pad" data-o="${y}.padli"></span></div>
            <div class="rj-r rj-volitelne"><span class="rj-l"></span><span data-o="${y}.seZombie"></span></div>
            ${st.dalsi[y] ? `<div class="rj-r"><span class="rj-l" title="Kdo útok přežije (a zombie z pobitých). Přeposlané vojsko dorazí navíc — viz další den.">přežije</span><b data-o="${y}.prezili"></b></div>${rjDalTl(y)}`
                : `<div class="rj-r"><span class="rj-l" title="Vojsko přeposlané z jiné země — dorazí po dobytí">+ přesun</span><b data-o="${y}.prisun"></b></div>`}`}
        </div>`;
    }

    function rjRadekVetve(b, st, cile) {
        const S = rjPlan.sloty;
        let h = rjKartaDen0(b.kroky[0]);
        let konec = !S[b.kroky[0]].zem;
        for (let d = 1; d < st.dny; d++) {
            const x = b.kroky[d - 1], y = b.kroky[d];
            let bunka;
            if (konec) bunka = d === 1 ? '<div class="rj-prazdna">—</div>' : '<div class="rj-prazdna"></div>';
            else if (S[x].dal === 'presun') { bunka = rjKartaPresun(x, cile[d] || [], d); konec = true; }
            else { bunka = rjKartaDalsi(y, d); if (!S[y].zem) konec = true; }
            h += '<div class="rj-sipka">▶</div>' + bunka;
        }
        return h;
    }

    function rjRadekVlastni(ovladani) {
        const P = rjPlan;
        const mapa = window.DarkElfUtils.Cache.get('api', 'map_json');
        const zeme = (mapa && mapa.zeme) || [];
        const rasy = [];
        for (let i = 0; i <= 10; i++) { const r = window.DarkElfUtils.Races[i]; if (r && UnitStats[r.key]) rasy.push(r); }
        return `<div class="rj-nast">
                <datalist id="rj-seznam-zemi">${zeme.map(z => `<option value="${rjEsc((z.zeme || ('zem ' + z.id)) + ' #' + z.id)}">${rjEsc(z.hrac || 'neutrálka')}</option>`).join('')}</datalist>
                <span>rasa <select data-rasa>${rasy.map(r => `<option value="${r.key}"${r.key === rjRasa() ? ' selected' : ''}>${rjEsc(r.cz)}</option>`).join('')}</select></span>
                <span title="Hrdina, který jde s útokem označeným H — útok a % ručně">hrdina útok <input class="rj-n" data-k="heroAbs" value="${cislo(P.heroAbs)}"> + <input class="rj-n" data-k="heroPct" value="${cislo(P.heroPct)}"> %</span>
                ${ovladani || ''}
            </div>`;
    }

    function rjRadekStruktury() {
        const P = rjPlan, nazev = rjNazevStruktury(P), st = rjSt(P);
        const ulozene = rjUlozeneStruktury();
        let vybrana = false;
        const moznost = (hodnota, t, popis) => {
            const sel = !vybrana && t.nazev === nazev;
            if (sel) vybrana = true;
            return `<option value="${hodnota}"${sel ? ' selected' : ''}>${rjEsc(popis)}</option>`;
        };
        const volby = ['<option value="">— tvar —</option>']
            .concat(RJ_PREDVOLBY.map((t, i) => moznost('p' + i, t, t.nazev)))
            .concat(ulozene.map((t, i) => moznost('u' + i, t, '★ ' + t.nazev)));
        const jeUlozena = ulozene.some(t => t.nazev === nazev);
        return `<div class="rj-nast">
                <span title="Tvar rozjezdu — kolik útoků z kterého zdroje, kdo přeposílá, kolik dní. Vybráním se použije (země zdrojů zůstanou, cíle se vyprázdní). ★ = tvoje uložené.">struktura
                    <select data-predvolba>${volby.join('')}</select></span>
                <span class="rj-tg" data-ulozit-strukturu title="Uložit tenhle tvar jako „${rjEsc(nazev)}“ (bez zemí a čísel)">uložit</span>
                ${jeUlozena ? `<span class="rj-tg" data-smaz-strukturu title="Smazat uložený tvar „${rjEsc(nazev)}“">✕</span>` : ''}
                <span title="Kolik dní se plánuje (dnes / zítra / pozítří)">dny
                    <span class="rj-tg" data-dny="-1"${st.dny <= 1 ? ' style="opacity:.4;"' : ''}>−</span>
                    <span class="rj-tg" data-dny="1"${st.dny >= 3 ? ' style="opacity:.4;"' : ''}>+</span></span>
                ${P.zdroje.length < 4 ? '<span class="rj-tg" data-pridat-zdroj title="Další země, ze které se dnes útočí">+ zdroj</span>' : ''}
                <span class="rj-sedy" title="Neutrálce denně přibude 1–2 šestky (obrana 5), 0–2 mágů (4) a 0–1 obyvatel. Počítá se nejhorší případ.">odhad: obrana +${RJ_NARUST} a +${RJ_OBYV_DEN} obyvatel za den</span>
            </div>`;
    }

    function rjPostav() {
        if (!rjKoren) return;
        const P = rjPlan;
        if (rjPosunNaDnes(P) | rjSrovnejDen0(P)) rjUloz();
        rjHotoveTed = rjHotove(P);

        if (!rjVlastni && rjData && rjData.moje.length) {
            P.zdroje.forEach((z, i) => { if (!z.zem) z.zem = rjNovyZdroj(P, P.zdroje.slice(0, i)).zem || rjData.moje[0].id; });
        }
        const st = rjSt(P), cile = rjCileStruktury(P, st);

        const sloupce = ['minmax(0,1fr)', 'minmax(0,1fr) 16px minmax(0,1fr)', 'minmax(0,1fr) 16px minmax(0,1fr) 16px minmax(0,0.75fr)'][st.dny - 1];
        let mrizka = RJ_DNY.slice(0, st.dny).map((n, i) => (i ? '<div></div>' : '') + `<div class="rj-sloupec">${n}</div>`).join('');
        P.zdroje.forEach((z, zi) => {
            mrizka += `<div style="grid-column: 1 / -1;">${rjZdrojRadek(zi)}</div>`;
            P.vetve.forEach(b => { if (b.zdroj === zi) mrizka += rjRadekVetve(b, st, cile); });
        });

        const sbaleno = rjSbaleno(), male = rjZaklad() === 'male';
        if (rjOkno && rjOkno.dataset.sirka) {
            const plna = cislo(rjOkno.dataset.sirka);
            rjOkno.style.setProperty('width', (sbaleno ? Math.min(330, plna) : male ? Math.min(310, plna) : plna) + 'px', 'important');
            rjUmisti(parseInt(rjOkno.style.left, 10) || 0, parseInt(rjOkno.style.top, 10) || 0);
        }
        const hlavicka = rjHlavicka();
        if (sbaleno) {
            rjKoren.querySelector('.rj-telo').innerHTML = hlavicka.replace('class="rj-hlavicka"', 'class="rj-hlavicka" style="border:0;margin:0;padding:0;"');
            rjObnov();
            return;
        }
        if (male) { rjPostavMale(hlavicka); return; }

        const zemeZdroju = P.zdroje.map(z => String(z.zem || '')).filter(Boolean);
        if (!rjVlastni && zemeZdroju.length && rjHrdinoveZ !== zemeZdroju.join(',')) rjNactiHrdiny(zemeZdroju);
        if (!rjVlastni && !rjRust) rjNactiRust();

        if (!rjVlastni && !P.hrdina && rjHrdinove && rjHrdinove.length) {
            const h = rjHrdinove[0];
            P.hrdina = String(h.id); P.heroAbs = h.utok; P.heroPct = h.pctUtok;
            rjUloz();
        }

        const hrdinaMimo = rjHrdinove && P.hrdina && !rjHrdinove.some(h => String(h.id) === String(P.hrdina))
            ? `<option value="${rjEsc(P.hrdina)}" selected>hrdina z plánu (${cislo(P.heroAbs)}, +${cislo(P.heroPct)} %)</option>` : '';
        const hrdinove = rjHrdinove === null ? '<option value="">(načítám…)</option>'
            : [hrdinaMimo].concat(rjHrdinove.map(h =>
                `<option value="${rjEsc(h.id)}"${String(P.hrdina) === String(h.id) ? ' selected' : ''}>${rjEsc(h.jmeno || ('hrdina ' + h.id))} (${h.utok}, +${h.pctUtok} %)${P.zdroje.length > 1 ? ' · ' + rjEsc(rjJmeno(h.zem)) : ''}</option>`)).join('')
              + (rjHrdinove.length ? '' : '<option value="" disabled>ve zdrojích není tvůj hrdina</option>');

        rjKoren.querySelector('.rj-telo').innerHTML = hlavicka + '<div class="rj-rozlozeni"><div class="rj-nastaveni">' + rjRadekStruktury() + `
${(() => {

            const ovladani = `<label title="Navrhni použije službu rytíř (×1,1) co nejméně — jen u útoků, které bez něj nestačí (i za cenu větších ztrát). Upozorní, jen když je rytíř potřeba u všech útoků. Ruční zaškrtnutí R tím zakázané není."><input type="checkbox" data-c="omezRytire"${P.omezRytire ? ' checked' : ''}> Budget rozjezd</label>
                <label title="Navrhni naverbuje, co limit a rozpočet dovolí, místo obvyklého „jen co je potřeba". Na rozjezd to není třeba — hodí se, když jdeš na kontakt s nepřítelem a chceš dopředu poslat co největší armádu."><input type="checkbox" data-c="maxVerb"${P.maxVerb ? ' checked' : ''}> Max verb</label>
                <span class="rj-tg rj-on" data-navrhni title="Spočítá dnešní útoky, přesuny bokem a přeposílky tak, aby všechny útoky prošly. Cíle, hrdinu a ‚přeposílá' nechá.">Navrhni</span>
                <span data-o="navrh"></span>`;
            return rjVlastni ? rjRadekVlastni(ovladani) : `<div class="rj-nast">
                <span title="Hrdina, který jde s útokem označeným H. Roletka = tvoji hrdinové ve zdrojích (staty z hero.asp); útok a % jdou přepsat ručně.">hrdina <select data-hrdina>${hrdinove}</select> útok <input class="rj-n" data-k="heroAbs" value="${cislo(P.heroAbs)}"> + <input class="rj-n" data-k="heroPct" value="${cislo(P.heroPct)}"> %</span>
                ${ovladani}
            </div>`;
        })()}</div>
            <div class="rj-plan"><div class="rj-mrizka${rjSt(P).dny <= 2 ? ' rj-siroke' : ''}" style="grid-template-columns: ${sloupce};">${mrizka}</div></div>
            <div class="rj-konec"><div class="rj-chyby" data-o="chyby"></div>
            <div class="rj-souhrn"><div data-o="souhrn"></div>
                <div class="rj-r" style="margin-top:2px;${rjVlastni ? ' display:none;' : ''}"><b style="color:#ffcc00;">Kol do verbu</b>
                    <input class="rj-n" data-k="kol" value="${P.kol === '' || P.kol == null ? '' : cislo(P.kol)}" placeholder="${rjKola()}" title="Kolik kol odehraješ před verbem — obyvatelé mezitím přibudou. Prázdné = zbývající kola dnes.">
                    <span class="rj-sedy">(prázdné = zbývající kola dnes)</span></div>
                <div class="rj-r" style="margin-top:2px;"><b style="color:#ffcc00;">Rozpočet</b>
                    <input class="rj-n" style="width:60px;" data-k="rozpocetZl" value="${cislo(P.rozpocetZl) || ''}" placeholder="zlato" title="Kolik zlata můžeš dnes dát na verb a domy (ve všech zdrojích dohromady)"> zl
                    <input class="rj-n" style="width:50px;" data-k="rozpocetMana" value="${cislo(P.rozpocetMana) || ''}" placeholder="mana" title="Kolik many můžeš dnes dát na verb"> many
                    <span data-o="rozpocet"></span></div>
                <div class="rj-r" style="margin-top:6px; justify-content:flex-end; gap:6px;">
                    <span class="rj-tg" data-export title="Zkopíruje celý plán do schránky jako text: dnes (přesun) > zítra > pozítří, H = hrdina, R = rytíř, P = bez vyhlášení války (−30 %)">export</span>
                    <span class="rj-tg" data-reset title="Smazat celý plán rozjezdu">vymazat</span></div></div></div></div>`;
        rjObnov();
    }

    function rjObnov() {
        if (!rjKoren) return;
        const vst = rjVstupy();
        const v = rjSpocti(rjPlan, vst), st = rjSt();
        const o = {};
        const nastav = (k, html) => { o[k] = html; };
        Object.keys(v.sloty).forEach(x => {
            const z = v.sloty[x];
            const kdy = ['dnešní', 'zítřejší', 'pozítřejší'][z.den] || '';
            if (z.pu) {
                nastav(x + '.pu', z.pu.pu + (z.pu.rucne ? '' : (z.den ? ` <span class="rj-sedy" title="odhad: ${kdy} obrana s nárůstem ${RJ_NARUST} + ${RJ_OBYV_DEN} obyvatel za den${z.pu.presne ? ', složení neutrálky známé' : ', složení odhadnuté (10 + den obyvatel)'}">odhad${z.pu.presne ? '' : '?'}</span>` : '')));
            } else nastav(x + '.pu', '<span class="rj-zle-t">?</span>');
            nastav(x + '.sila', z.pu ? `<span class="${z.ok ? 'rj-ok-t' : 'rj-zle-t'}">${z.sila}${z.ok ? ' ✓' : ' ✗ (−' + (z.pu.pu - z.sila) + ')'}</span>` : z.sila);
            nastav(x + '.padli', rjNic(z.padli) ? '' : 'padne −' + z.padli.join('·−'));

            const zombieTxt = !(z.zombie || z.zombieMax) ? ''
                : ` <span class="rj-sedy" title="Bonus rasy Nekromantů: 10 % ze zabitých nepřátelských vojáků a obyvatel se ihned po dobytí země přemění na zombie (jednotky prvního stupně), v zemi musí být volné domy. Plán s nimi nepočítá — vstanou navíc.">(+${rjZombieRozsah(z)} zombie navíc)</span>`;
            if (z.zitra) nastav(x + '.zitra', rjTri(z.zitra) + zombieTxt);
            if (z.den >= 1 && z.ok) nastav(x + '.prezili', rjTri(z.prezili) + zombieTxt);

            if (z.zbyde) nastav(x + '.zbyde', (z.chybi && !rjNic(z.chybi))
                ? `<span class="rj-zle-t" title="Útok a přesun dohromady chtějí víc, než v ${x} bude">chybí ${rjTri(z.chybi)}</span>`
                : rjTri(z.zbyde));
            if (z.prisun) nastav(x + '.prisun', rjNic(z.prisun) ? '<span class="rj-sedy">—</span>' : rjTri(z.prisun));
            if (z.prisun && !rjNic(z.prisun)) nastav(x + '.prisunTxt', '(z toho přesun ' + rjTri(z.prisun) + ')');
            if (z.den >= 1 && z.u) nastav(x + '.u', rjTri(z.u));
            if (z.den >= 1) nastav(x + '.hrdinaTxt', z.hrdina ? 's hrdinou' : '');
            if (z.silaDalsi != null) nastav(x + '.silaDalsi', z.silaDalsi);
        });

        Object.keys(v.sloty).forEach(x => {
            const z = v.sloty[x], s = rjPlan.sloty[x];
            const zn = (z.hrdina ? 'H' : '') + (s && s.r ? 'R' : '') + (s && s.w ? 'P' : '');
            let t = rjTri(z.u) + (zn ? ' <b>' + zn + '</b>' : '');
            if (z.den === 0 && z.presun && !rjNic(z.presun)) t += ` <span class="rj-sedy" title="přesun bokem">+ ${rjTri(z.presun)}</span>`;
            if (z.pu) t += ` <span class="${z.ok ? 'rj-ok-t' : 'rj-zle-t'}">${z.sila}/${z.pu.pu} ${z.ok ? '✓' : '✗'}</span>`;
            if (s && s.dal === 'presun' && st.dalsi[x]) {
                const roz = rjPlan.rozdel[x] || {};
                const kam = (v.cile[z.den + 1] || []).filter(y => Array.isArray(roz[y]) && !rjNic(roz[y])).map(y => y + ' ' + rjTri(roz[y]));
                t += '<br><span class="rj-sedy">přeposílá' + (kam.length ? ' → ' + kam.join(', ') : '') + '</span>';
            }
            nastav('m.' + x, t);
        });

        const SO = rjStavOdeslani(rjPlan, rjDnesniDen(rjPlan, st));
        if (SO) Object.keys(SO.kroky).forEach(x => {
            const o = SO.kroky[x], dnes = o.den === SO.dnes, z = v.sloty[x], casti = [];
            const pu = z && z.pu ? z.pu.pu : null;
            if (o.utok) {
                const malo = pu != null && o.utok.sila < pu;
                casti.push(`<span class="${malo ? 'rj-zle-t' : 'rj-ok-t'}" title="Útok už letí (seznam útoků): síla ${o.utok.sila}${pu != null ? ', potřeba ' + pu : ''}">✓ ${o.utok.sila}${malo ? ' &lt; ' + pu : ''}</span>`);

                if (z && z.sila && Math.abs(z.sila - o.utok.sila) > 1) {
                    casti.push(`<span style="color:#ffaa33;" title="Odeslaný útok má sílu ${o.utok.sila}, čísla v kartě dávají ${z.sila} — asi odešlo jiné složení. Odemkni (🔒) a čísla srovnej, ať plán počítá se skutečností.">(plán ${z.sila})</span>`);
                }
            } else if (o.utok === null && dnes) {
                casti.push('<span class="rj-sedy" title="V seznamu odeslaných útoků zatím není">○ útok</span>');
            }
            const ok = o.presuny.filter(Boolean).length, n = o.presuny.length;
            if (n && (ok || dnes)) {
                casti.push(`<span class="${ok === n ? 'rj-ok-t' : 'rj-sedy'}" title="Přesuny do ${x}: v seznamu odeslaných ${ok} z ${n}">${ok === n ? '✓' : '○'} přesun${n > 1 ? ' ' + ok + '/' + n : ''}</span>`);
            }
            nastav(x + '.odeslano', casti.join(' '));
        });

        Object.keys(rjPlan.sloty).forEach(x => {
            const zam = !!rjHotoveTed[x], odem = rjPlan.odemknuto && rjPlan.odemknuto[x] === rjHerniDen();
            if (!zam && !odem) return;
            const tl = zam
                ? `<span class="rj-zamek" data-odemkni="${x}" title="Hotovo (odesláno nebo už po něm) — čísla jsou pevná, Navrhni na ně nesáhne a jejich vojsko se počítá jako odeslané. Klik = odemknout.">🔒</span>`
                : `<span class="rj-zamek" data-odemkni="${x}" title="Odemčeno — Navrhni může čísla měnit. Klik = zase zamknout.">🔓</span>`;
            const k = x + '.odeslano';
            nastav(k, (o[k] ? o[k] + ' ' : (zam && !(SO && SO.kroky[x] && SO.kroky[x].utok) ? '<span class="rj-sedy">hotovo</span> ' : '')) + tl);
        });
        const seZombie = rjSilaSeZombie(v, vst);
        Object.keys(seZombie).forEach(x => {
            const [a, b] = seZombie[x], pu = v.sloty[x].pu.pu;
            nastav(x + '.seZombie', `<span class="rj-sedy" title="Kdyby se počítalo i s oživlými zombie (bonus rasy) — nejméně: dnešní a zítřejší při nejmenším růstu neutrálky, nejvíc: při plném růstu. Plán s nimi nepočítá; zombie z přeposílající země se do cíle dostanou, jen když je přepošleš.">se zombie <b>${a === b ? a : a + '–' + b}</b></span> `
                + (b >= pu ? (a >= pu ? '<span class="rj-ok-t">vyjde</span>' : '<span style="color:#ffaa33;">může vyjít</span>') : '<span class="rj-zle-t">ani tak</span>'));
        });

        Object.keys(v.sloty).forEach(x => {
            const z = v.sloty[x], s = rjPlan.sloty[x];
            if (!z.pu || z.ok || !s || !z.u) return;
            const kam = z.den === 0 ? 'do útoku' : (z.den === 1 ? 'do přesunu bokem dnes do ' + st.pred[x] : '');

            const cil = z.den === 0 ? x : st.pred[x], hc = rjHotoveTed[cil];
            const zamceno = !!hc && (z.den === 0 ? hc.u : hc.p);
            const Z = cil != null ? v.verb.zdroje[st.zdroj(cil)] : null;
            const volno = Z ? rjNezaporne(rjOdecti(Z.doma, Z.zDomova)) : [0, 0, 0];
            const verbZbyva = !Z || Z.maxVerb == null ? Infinity : Math.max(0, Z.maxVerb - Z.celkem);
            for (let i = 0; i < 3; i++) {
                const n = rjKolikJesteTreba(i, z.u, z.pu.pu, c => vst.sila(c, z.hrdina, !!s.r, !!s.w));
                if (!n) continue;

                const vzb = cil != null && !rjSmiVerb(rjPlan.zdroje[st.zdroj(cil)], i) ? 0 : verbZbyva;
                const nejde = z.den >= 2 ? '' : zamceno ? 'odesláno — zamčeno 🔒'
                    : volno[i] + vzb < n ? `ze zdroje ${rjEsc(rjJmenoZdroje(st.zdroj(cil)))} už nejde: doma volných ${volno[i]}, verb zbývá ${vzb}` : '';
                nastav(x + '.req' + i, z.den >= 2 || nejde
                    ? `<span class="rj-req rj-req-ne" title="Chybí ${n} jednotek ${i + 1}. stupně${nejde ? ' — ' + nejde : ''}">(+${n})</span>`
                    : `<span class="rj-req" data-pridej="${x}.${i}.${n}" title="Přidat ${n} jednotek ${i + 1}. stupně ${kam} — pak útok stačí">(+${n})</span>`);
            }
        });
        const pocetChyb = v.chyby.length;
        nastav('stav', pocetChyb ? `<span class="rj-zle-t">⚠ ${pocetChyb}</span>`
            : (Object.keys(v.sloty).length ? `<span class="rj-ok-t">✓ vychází</span>` : '')
              + (v.verb.celkem ? ` <span class="rj-sedy">· verb ${rjTri(v.verb.verb)}</span>` : ''));
        nastav('doma', rjTri(v.verb.doma));
        nastav('navrh', rjPlan.navrhInfo ? `<span class="${/nevyšlo/.test(rjPlan.navrhInfo) ? 'rj-zle-t' : 'rj-ok-t'}"${/⚠/.test(rjPlan.navrhInfo) && !/nevyšlo/.test(rjPlan.navrhInfo) ? ' style="color:#ffaa33;"' : ''}>${rjEsc(rjPlan.navrhInfo)}</span>` : '');
        nastav('chyby', v.chyby.map(c => '⚠ ' + (c.slot === 'verb' ? '' : c.slot + ': ') + rjEsc(c.text)).join('<br>'));

        const V = v.verb, nZ = V.zdroje.length;
        const limitTxt = (Z, i) => {
            if (Z.maxVerb == null) return '';
            const pv = (vst.zdroje[i] || {}).priv;
            const detail = !pv ? '' : ` <span class="rj-sedy" title="Limit verbu = obyvatelé po ${pv.kol} kolech − ${Math.round(vst.rezerva * 100)} % domů (i dokoupených, aby se obyvatelé s vojskem vešli). Odeslané vojsko limit nemění — vojáci venku bydlí v domech až do přepočtu.${pv.zAutoDomu ? (pv.sypka || pv.haj ? ' Přírůstek se sýpkou/hájem podle auto_domy.' : ' Přírůstek podle auto_domy.') : ' Bez auto_domy — počítá se bez sýpky a háje.'}">`
                + `(po ${pv.kol} kolech: obyvatel ${pv.obyvTed} → ${pv.obyvatel}` + (pv.dokupRust ? `, dokoupit ${pv.dokupRust} domů` : '') + `)</span>`;
            return `${Z.maxVerb}` + detail + ` · plán ${Z.celkem} · ` + (Z.celkem > Z.maxVerb
                ? `<span class="rj-zle-t">přes o ${Z.celkem - Z.maxVerb}</span>`
                : `<span class="rj-ok-t">zbývá ${Z.maxVerb - Z.celkem}</span>`);
        };
        const domyTxt = (D) => D ? `na ${D.vojaku} vojáků je potřeba ${D.potreba}, máš ${D.mas}`
            + (D.dokup ? ` → dokoupit <b>${D.dokup}</b> za <b style="color:#ffcc00;">${D.zlato}</b> zl` : ' <span class="rj-ok-t">✓</span>') : '';

        V.zdroje.forEach((Z, i) => {
            const kam = Object.keys(v.sloty).filter(y => v.sloty[y].den === 0 && v.sloty[y].presunZ && v.sloty[y].presunZ[i]);
            nastav('m.z' + i + '.jinam', kam.length ? '⇢ přesun ' + kam.map(y => `<b>${y}</b> ${rjTri(v.sloty[y].presunZ[i])}`).join(' · ') : '<span class="rj-sedy">⇢ přesun jinam: nic</span>');
            const zustane = rjNezaporne(rjOdecti(Z.doma, Z.zDomova));
            nastav('z' + i + '.posila', `odešle <b>${rjTri(Z.zDomova)}</b> · zůstane ${rjTri(zustane)}`
                + (Z.celkem ? ` · <span style="color:#ffcc00;">naverbovat ${rjTri(Z.verb)}</span>` : ''));
        });
        V.zdroje.forEach((Z, i) => {
            nastav('z' + i + '.doma', rjTri(Z.doma));

            const zd = rjPlan.zdroje[i] || {};
            const vlastniLimit = zd.limit;
            const psany = vlastniLimit !== '' && vlastniLimit != null;
            nastav('z' + i + '.rucne', !rjVlastni && rjRucniZdroj(zd) ? '✎' : '');
            nastav('z' + i + '.max', (Z.maxVerb == null ? '<span class="rj-sedy">?</span>'
                : (psany || rjVlastni ? '' : `${Z.maxVerb} `) + `<span class="rj-sedy">(plán ${Z.celkem})</span>`)
                + (Z.maxVerb != null && Z.celkem > Z.maxVerb ? ' <span class="rj-zle-t">✗</span>' : ''));
            if (!rjVlastni && rjKoren) {
                const pole = rjKoren.querySelector(`[data-k="zdroje.${i}.limit"]`);
                if (pole) pole.placeholder = Z.maxVerb == null ? '?' : String(Z.maxVerb);
            }
        });
        const naverbovat = `<b style="color:#ffcc00;">Naverbovat</b> ${V.celkem ? rjTri(V.verb) + ` = <b class="dec-gold" style="color:#ffcc00;">${V.zlato}</b> zl + <b style="color:#88aaff;">${V.mana}</b> many` : '<span class="rj-ok-t">nic, stačí co máš</span>'}`;

        const podrobnosti = (html) => `<details class="rj-podrobnosti"${rjPodrobnosti ? ' open' : ''}><summary>Podrobnosti</summary>${html}</details>`;
        if (nZ === 1) {
            const Z = V.zdroje[0];
            nastav('souhrn', podrobnosti(`<b style="color:#ffcc00;">Dnes z domova</b> ${rjTri(Z.zDomova)} <span class="rj-sedy">(útoky + přesuny)</span>`
                + ` · doma ${rjTri(Z.doma)}`
                + (Z.maxVerb != null ? `<br><b style="color:#ffcc00;">Verb max</b> ` + limitTxt(Z, 0) : '')
                + (Z.domy ? `<br><b style="color:#ffcc00;">Domy</b> ` + domyTxt(Z.domy) : '')) + naverbovat);
        } else {
            nastav('souhrn', podrobnosti(V.zdroje.map((Z, i) => `<b style="color:#ffcc00;">${rjEsc(rjJmenoZdroje(i))}</b> ze země ${rjTri(Z.zDomova)}`
                    + ` · doma ${rjTri(Z.doma)} · verb ${rjTri(Z.verb)}`
                    + ` · <span title="Všechno vojsko v zemi dnes — doma + naverbované. Na domy se počítá všechno; Navrhni ho mezi zeměmi vyrovnává, kde smí přesun jinam.">vojsko <b data-vojsko="${i}">${Z.doma[0] + Z.doma[1] + Z.doma[2] + Z.celkem}</b></span>`
                    + (Z.maxVerb != null ? ` · <span class="rj-sedy">max</span> ` + limitTxt(Z, i) : '')
                    + (Z.domy ? `<br><span style="padding-left:12px;">domy ${domyTxt(Z.domy)}</span>` : '')).join('<br>'))
                + naverbovat + ' <span class="rj-sedy">(všechny zdroje)</span>');
        }

        const jenPosila = {};
        rjPlan.zdroje.forEach((z, zi) => {
            if (!z.jinam || rjPlan.zdroje.length < 2 || rjVlastni) return;
            const x = st.den[0].find(y => st.zdroj(y) === zi && !rjPlan.sloty[y].zem);
            if (!x) return;
            const pj = (y) => { const a = (rjPlan.sloty[y].pj || [])[zi]; return (Array.isArray(a) ? a : [0, 0, 0]).map(cislo); };
            const cile = st.den[0].filter(y => rjPlan.sloty[y].zem && st.zdroj(y) !== zi && !rjNic(pj(y)));
            if (!cile.length) return;
            const hotovo = cile.filter(y => rjHotoveTed[y] && rjHotoveTed[y].pj[zi]).length;
            jenPosila[x] = hotovo === cile.length;
            if (!hotovo && !(SO && SO.dnes === 0)) return;
            nastav(x + '.odeslano', `<span class="${hotovo === cile.length ? 'rj-ok-t' : 'rj-sedy'}" title="Přesuny z ${rjEsc(rjJmenoZdroje(zi))} do útoků ostatních zdrojů: odesláno ${hotovo} z ${cile.length}">`
                + `${hotovo === cile.length ? '✓' : '○'} přesun ${hotovo}/${cile.length}</span>`
                + (hotovo === cile.length ? ' <span title="Odesláno — čísla jsou pevná (odemknout jde u útoku, kam přesun jde)">🔒</span>' : ''));
        });

        const RZ = V.rozpocet;
        nastav('rozpocet', !RZ ? '<span class="rj-sedy">(nevyplněno = nekontroluje se)</span>'
            : !(RZ.zbyvaZl < 0 || RZ.zbyvaMana < 0)
                ? `<span class="rj-ok-t">✓</span> po verbu a domech zbyde ${[RZ.zbyvaZl != null ? RZ.zbyvaZl + ' zl' : '', RZ.zbyvaMana != null ? RZ.zbyvaMana + ' many' : ''].filter(Boolean).join(' + ')}`
                : `<span class="rj-zle-t">chybí ${[RZ.zbyvaZl < 0 ? (-RZ.zbyvaZl) + ' zl' : '', RZ.zbyvaMana < 0 ? (-RZ.zbyvaMana) + ' many' : ''].filter(Boolean).join(' + ')}</span>`);

        rjKoren.querySelectorAll('[data-o]').forEach(el => {
            const k = el.getAttribute('data-o');
            el.innerHTML = (k in o) ? o[k] : '';
        });

        rjKoren.querySelectorAll('[data-karta]').forEach(el => {
            const x = el.getAttribute('data-karta'), z = v.sloty[x];
            if (x in jenPosila) { el.classList.toggle('rj-ok', jenPosila[x]); el.classList.remove('rj-zle'); return; }
            el.classList.toggle('rj-ok', !!(z && z.pu && z.ok));
            el.classList.toggle('rj-zle', !!(z && z.pu && !z.ok));
        });
    }

    function rjNastavCestu(cesta, hodnota) {
        const casti = cesta.split('.');
        let obj = rjPlan;
        for (let i = 0; i < casti.length - 1; i++) {
            const k = casti[i];
            if (obj[k] == null || typeof obj[k] !== 'object') obj[k] = /^\d+$/.test(casti[i + 1]) ? [0, 0, 0] : {};
            obj = obj[k];
        }
        obj[casti[casti.length - 1]] = hodnota;
    }

    function rjObsluha(e) {
        const t = e.target;
        if (e.type === 'click') {
            if (t.closest('.rj-zavrit')) { rjZavri(true); return; }
            const zamek = t.closest('[data-odemkni]');
            if (zamek) {
                const x = zamek.getAttribute('data-odemkni'), P = rjPlan;
                P.odemknuto = P.odemknuto || {};
                if (P.odemknuto[x] === rjHerniDen()) delete P.odemknuto[x]; else P.odemknuto[x] = rjHerniDen();
                P.navrhInfo = '';
                rjUloz(); rjPostav(); return;
            }
            if (t.dataset.plus) {
                if (t.classList.contains('rj-off')) return;
                rjPlan.sloty[t.dataset.plus].zem = String(rjZemeTady());
                rjPlan.sloty[t.dataset.plus].pu = '';
                rjNovyCilDnes(t.dataset.plus);
                rjUloz(); rjPostav(); return;
            }
            if (t.dataset.navrhni !== undefined) {

                if (rjPocita) return;
                rjPocita = true;
                const misto = rjKoren.querySelector('[data-o="navrh"]');
                if (misto) misto.innerHTML = '<span class="rj-pocita"><i>⏳</i> Navrhni počítá…</span>';
                setTimeout(() => {

                    try { rjNavrhni(); }
                    catch (err) {
                        console.error('Rozjezd: Navrhni spadl', err);
                        rjPlan.navrhInfo = 'Navrhni: nevyšlo — chyba výpočtu (' + (err && err.message || err) + ')';
                    }
                    finally { rjPocita = false; }
                    rjUloz();
                    if (rjKoren) rjPostav();
                }, 50);
                return;
            }
            if (t.dataset.vlastni !== undefined) {

                rjUloz();
                rjVlastni = !rjVlastni;
                window.DarkElfUtils.Cache.set(RJ_NS, RJ_KLIC_REZIM, rjVlastni, Date.now() + 7 * 24 * 3600 * 1000);
                rjPlan = rjNactiPlan();
                rjPostav(); return;
            }
            if (t.dataset.sbal !== undefined) {
                const r = rjRezim();
                rjNastavRezim(/^sbalene/.test(r) ? (r.split(':')[1] || 'plne') : 'sbalene:' + r);
                rjPostav(); return;
            }
            if (t.dataset.male !== undefined) {
                rjNastavRezim(rjZaklad() === 'male' ? 'plne' : 'male');
                rjPostav(); return;
            }

            if (t.dataset.ulozitStrukturu !== undefined) {
                const ok = rjUlozStrukturu(rjPlan);
                rjPostav();
                const tl = rjKoren && rjKoren.querySelector('[data-ulozit-strukturu]');
                if (tl) { tl.textContent = ok ? 'uloženo ✓' : 'uložit nešlo'; setTimeout(() => { if (tl.isConnected) tl.textContent = 'uložit'; }, 2000); }
                return;
            }
            if (t.dataset.smazStrukturu !== undefined) {
                rjSmazStrukturu(rjNazevStruktury(rjPlan));
                rjPostav(); return;
            }
            if (t.dataset.dny) {
                rjPlan.dny = Math.min(3, Math.max(1, rjSt().dny + parseInt(t.dataset.dny, 10)));
                rjPlan.navrhInfo = '';
                rjUloz(); rjPostav(); return;
            }
            if (t.dataset.pridatZdroj !== undefined) {
                if (rjPlan.zdroje.length >= 4) return;
                rjPlan.zdroje.push(rjNovyZdroj(rjPlan));
                rjPridejVetev(rjPlan.zdroje.length - 1);
                rjUloz(); rjPostav(); return;
            }
            if (t.dataset.smazZdroj !== undefined) {
                rjSmazZdroj(cislo(t.dataset.smazZdroj));
                rjUloz(); rjPostav(); return;
            }
            if (t.dataset.pridatVetev !== undefined) {
                rjPridejVetev(cislo(t.dataset.pridatVetev));
                rjUloz(); rjPostav(); return;
            }
            if (t.dataset.smaz) {
                rjSmazSlot(t.dataset.smaz);
                rjUloz(); rjPostav(); return;
            }
            if (t.dataset.pridej) {
                const [x, i, n] = t.dataset.pridej.split('.');

                const st = rjSt(), zitra = st.denKroku[x] === 1;
                const kam = zitra ? st.pred[x] : x;
                const pole = zitra ? 'p' : 'u';
                const a = (rjPlan.sloty[kam][pole] || [0, 0, 0]).map(k => cislo(k));
                a[cislo(i)] += cislo(n);
                rjPlan.sloty[kam][pole] = a;
                rjUloz(); rjPostav(); return;
            }
            if (t.dataset.dal) {
                const [x, dal] = t.dataset.dal.split(':');
                rjPlan.sloty[x].dal = dal;
                rjPlan.navrhInfo = '';
                rjUloz(); rjPostav(); return;
            }
            if (t.dataset.max) {

                const y = t.dataset.max, s = rjPlan.sloty[y];
                const v = rjSpocti(rjPlan, rjVstupy()), Z = v.verb.zdroje[rjSt().zdroj(y)];
                const u = (s.u || [0, 0, 0]).map(k => cislo(k));
                const p = (s.p || [0, 0, 0]).map(k => cislo(k));
                rjPlan.sloty[y].u = rjNezaporne(rjSecti(rjSecti(rjOdecti(Z.doma, Z.zDomova), u), p));
                if (!(rjHotoveTed[y] && rjHotoveTed[y].p)) rjPlan.sloty[y].p = [0, 0, 0];
                rjUloz(); rjPostav(); return;
            }
            if (t.dataset.export !== undefined) {

                const hotovo = (ok) => {
                    t.textContent = ok ? 'zkopírováno ✓' : 'kopírování nešlo';
                    setTimeout(() => { t.textContent = 'export'; }, 2000);
                };
                let text;
                try { text = rjExport(); }
                catch (err) { console.error('Rozjezd: export spadl', err); hotovo(false); return; }

                const w = (rjOkno && rjOkno.ownerDocument && rjOkno.ownerDocument.defaultView) || window;
                const doc = w.document;
                const stare = () => {
                    const ta = doc.createElement('textarea');
                    ta.value = text;
                    ta.setAttribute('readonly', '');
                    ta.style.cssText = 'position:fixed; left:-9999px; top:0; opacity:0;';
                    doc.body.appendChild(ta);
                    ta.focus(); ta.select();
                    let ok = false;
                    try { ok = doc.execCommand('copy'); } catch (e) { }
                    ta.remove();
                    hotovo(ok);
                };
                if (w.navigator.clipboard && w.isSecureContext) w.navigator.clipboard.writeText(text).then(() => hotovo(true), stare);
                else stare();
                return;
            }
            if (t.dataset.reset !== undefined) {
                if (!confirm('Smazat celý plán rozjezdu?')) return;
                rjPlan = rjVychozi();
                rjUloz(); rjPostav(); return;
            }
            return;
        }

        if (t.dataset.k) {
            const cesta = t.dataset.k;

            const hodnota = (/\.pu$/.test(cesta) || cesta === 'kol' || /\.limit$/.test(cesta)
                             || /^zdroje\.\d+\.dom\.\d$/.test(cesta))
                ? t.value.trim() : Math.max(0, parseInt(t.value, 10) || 0);
            rjNastavCestu(cesta, hodnota);

            rjKoren.querySelectorAll('[data-k="' + cesta + '"]').forEach(el => { if (el !== t) el.value = t.value; });
            rjPlan.navrhInfo = '';
            rjUloz(); rjObnov(); return;
        }
        if (e.type !== 'change') return;
        if (t.dataset.c) {
            rjNastavCestu(t.dataset.c, t.checked);

            if (/^zdroje\.\d+\.jinam$/.test(t.dataset.c)) { rjPlan.navrhInfo = ''; rjUloz(); rjPostav(); return; }
            rjUloz(); rjObnov(); return;
        }
        if (t.dataset.zvz !== undefined) {

            const [zi, t2] = t.dataset.zvz.split('.').map(cislo);
            const z = rjPlan.zdroje[zi];
            if (z) {
                z.verbZ = [0, 1, 2].map(i => rjSmiVerb(z, i));
                z.verbZ[t2] = t.checked;
                rjPlan.navrhInfo = '';
            }
            rjUloz(); rjObnov(); return;
        }
        if (t.dataset.zem) {
            rjPlan.sloty[t.dataset.zem].zem = t.value;
            rjPlan.sloty[t.dataset.zem].pu = '';
            rjNovyCilDnes(t.dataset.zem);
            rjUloz(); rjPostav(); return;
        }
        if (t.dataset.predvolba !== undefined) {
            const m = /^([pu])(\d+)$/.exec(t.value);
            const tvar = m ? (m[1] === 'p' ? RJ_PREDVOLBY : rjUlozeneStruktury())[+m[2]] : null;
            if (tvar) { rjPouzijStrukturu(rjPlan, tvar); rjUloz(); }
            rjPostav(); return;
        }
        if (t.dataset.zdroj !== undefined) {
            const z = rjPlan.zdroje[cislo(t.dataset.zdroj)];
            if (z) { z.zem = t.value; rjPlan.hrdina = ''; rjPlan.navrhInfo = ''; }
            rjUloz(); rjPostav(); return;
        }
        if (t.dataset.vlastniZem !== undefined) {

            const m = t.value.match(/#(\d+)\s*$/);
            let id = m ? m[1] : null;
            if (!id) {
                const mapa = window.DarkElfUtils.Cache.get('api', 'map_json');
                const shoda = ((mapa && mapa.zeme) || []).filter(z => (z.zeme || '').toLowerCase() === t.value.trim().toLowerCase());
                if (shoda.length === 1) id = String(shoda[0].id);
            }
            const z = rjPlan.zdroje[cislo(t.dataset.vlastniZem)];
            if (z && id && id !== String(z.zem)) { z.zem = id; rjPlan.navrhInfo = ''; rjUloz(); rjPostav(); }
            return;
        }
        if (t.dataset.rasa !== undefined) { rjPlan.rasa = t.value; rjPlan.navrhInfo = ''; rjUloz(); rjPostav(); return; }
        if (t.dataset.hrdina !== undefined) {
            const h = (rjHrdinove || []).find(x => String(x.id) === t.value);
            rjPlan.hrdina = t.value;
            if (h) { rjPlan.heroAbs = h.utok; rjPlan.heroPct = h.pctUtok; }
            rjUloz(); rjPostav(); return;
        }
    }

    const RJ_ID = 'rj-okno', RJ_ZNOVU = 'de_rozjezd_otevreny';

    const rjLigaTed = () => window.DarkElfUtils.getLeague() || 'ALL';
    function rjZnovuOtevrit() {
        try {
            const v = sessionStorage.getItem(RJ_ZNOVU);
            if (v && v === rjLigaTed()) return true;
            if (v) sessionStorage.removeItem(RJ_ZNOVU);
        } catch (e) { }
        return false;
    }

    function rjRamy() {
        const out = [window];
        try {
            const ramy = (window.parent && window.parent.frames) ? window.parent.frames : [];
            for (let i = 0; i < ramy.length; i++) {
                try { if (ramy[i] && ramy[i].document && out.indexOf(ramy[i]) === -1) out.push(ramy[i]); } catch (e) { }
            }
        } catch (e) { }
        return out;
    }

    function rjRamProOkno() {
        if (jeMapa) return window;
        let nej = window, plochaNej = 0;
        rjRamy().forEach(w => {
            try {
                if (!w.document || !w.document.body) return;

                if (w.document.body.tagName === 'FRAMESET') return;
                const plocha = (w.innerWidth || 0) * (w.innerHeight || 0);
                if (plocha > plochaNej) { nej = w; plochaNej = plocha; }
            } catch (e) { }
        });
        return nej;
    }

    function rjEscKlavesa(e) { if (e.key === 'Escape') rjZavri(true); }

    function rjUmisti(left, top) {
        const okno = rjOkno;
        if (!okno) return;
        const w = okno.ownerDocument.defaultView || window;
        const W = w.innerWidth || 800, H = w.innerHeight || 600, sirka = okno.offsetWidth || 300;

        left = Math.max(RJ_VIDET - sirka, Math.min(left, W - RJ_VIDET));
        top = Math.max(0, Math.min(top, H - 30));
        okno.style.setProperty('left', Math.round(left) + 'px', 'important');
        okno.style.setProperty('top', Math.round(top) + 'px', 'important');
        okno.style.setProperty('max-height', Math.max(120, H - top - 8) + 'px', 'important');
    }

    function rjUlozPozici() {
        if (!rjOkno) return;
        try {
            localStorage.setItem(RJ_POZICE, JSON.stringify({ left: parseInt(rjOkno.style.left, 10) || 0,
                                                            top: parseInt(rjOkno.style.top, 10) || 0 }));
        } catch (e) { }
    }

    function rjNactiPozici() {
        try { const p = JSON.parse(localStorage.getItem(RJ_POZICE)); return p && isFinite(p.left) && isFinite(p.top) ? p : null; }
        catch (e) { return null; }
    }

    function rjTahni(e) {
        const t = e.target;
        if (e.button !== 0 || !t || !t.closest || !t.closest('.rj-hlavicka')) return;
        if (t.closest('.rj-btn, select, input, label')) return;
        const okno = rjOkno, doc = okno.ownerDocument;
        const r = okno.getBoundingClientRect();
        const dx = e.clientX - r.left, dy = e.clientY - r.top;
        e.preventDefault();
        const pohyb = (ev) => rjUmisti(ev.clientX - dx, ev.clientY - dy);
        const konec = () => {
            doc.removeEventListener('mousemove', pohyb, true);
            doc.removeEventListener('mouseup', konec, true);
            rjUlozPozici();
        };
        doc.addEventListener('mousemove', pohyb, true);
        doc.addEventListener('mouseup', konec, true);
    }

    function rjOkrajOkna(e) {
        const okno = rjOkno;
        if (!okno || rjSbaleno() || rjZaklad() === 'male') return null;
        const r = okno.getBoundingClientRect(), x = e.clientX;
        if (x >= r.left && x <= r.left + RJ_OKRAJ) return 'l';
        const prava = r.left + okno.clientLeft + okno.clientWidth;
        if (x >= prava - RJ_OKRAJ && x <= prava + 1) return 'p';
        return null;
    }

    function rjSirkaKurzor(e) {
        if (rjOkno) rjOkno.style.setProperty('cursor', rjOkrajOkna(e) ? 'ew-resize' : 'auto', 'important');
    }

    function rjSirkaTahni(e) {
        const kraj = e.button === 0 ? rjOkrajOkna(e) : null;
        if (!kraj) return;
        e.preventDefault();
        e.stopPropagation();
        const okno = rjOkno, doc = okno.ownerDocument, w = doc.defaultView || window;
        const r = okno.getBoundingClientRect(), x0 = e.clientX, sirka0 = r.width, left0 = r.left;
        const pohyb = (ev) => {
            const dx = ev.clientX - x0;
            const sirka = Math.round(Math.max(RJ_MIN_SIRKA, Math.min(sirka0 + (kraj === 'p' ? dx : -dx), w.innerWidth || 1600)));
            okno.dataset.sirka = String(sirka);
            okno.style.setProperty('width', sirka + 'px', 'important');
            if (kraj === 'l') okno.style.setProperty('left', Math.round(left0 + sirka0 - sirka) + 'px', 'important');
        };
        const konec = () => {
            doc.removeEventListener('mousemove', pohyb, true);
            doc.removeEventListener('mouseup', konec, true);
            try { localStorage.setItem(RJ_SIRKA, okno.dataset.sirka); } catch (er) { }
            rjUmisti(parseInt(okno.style.left, 10) || 0, parseInt(okno.style.top, 10) || 0);
            rjUlozPozici();
        };
        doc.addEventListener('mousemove', pohyb, true);
        doc.addEventListener('mouseup', konec, true);
    }

    function rjZavri(rucne) {
        rjRamy().forEach(w => {
            try {
                if (w !== window && w.__deRozjezd) return;
                const el = w.document.getElementById(RJ_ID);
                if (el && el.parentNode) el.parentNode.removeChild(el);
                w.document.removeEventListener('keydown', rjEscKlavesa);
            } catch (e) { }
        });
        rjOkno = null; rjKoren = null;
        if (rjOdeslaneOdlozeno) { clearTimeout(rjOdeslaneOdlozeno); rjOdeslaneOdlozeno = null; }
        if (rucne) { try { sessionStorage.removeItem(RJ_ZNOVU); } catch (e) { } }
    }

    function rjHlaskaBezMapy() {
        if (!parentTr) return;
        let tr = document.getElementById('rj-bez-mapy');
        if (!tr) {
            tr = document.createElement('tr');
            tr.id = 'rj-bez-mapy';
            tr.innerHTML = `<td colspan="${(targetTd && targetTd.colSpan) || 2}" style="text-align:center;`
                + ' padding:4px 0; color:#ff6666; font-size:11px;">Rozjezd se kreslí do mapy —'
                + ' otevři si rám s mapou a klikni znovu.</td>';
            parentTr.parentElement.appendChild(tr);
        }
        tr.style.display = '';
    }

    async function rjOtevri() {
        if (rjOkno) return;

        if (!jeMapa && window.parent && window.parent !== window && !rjHostitel()) {
            rjHlaskaBezMapy();
            return;
        }
        rjZavri(false);
        const ram = rjRamProOkno(), doc = ram.document;
        const sirkaRamu = ram.innerWidth || 900;
        let ulozena = 0;
        try { ulozena = parseInt(localStorage.getItem(RJ_SIRKA), 10) || 0; } catch (e) { }
        const sirka = Math.max(300, Math.min(ulozena >= RJ_MIN_SIRKA ? ulozena : RJ_VYCHOZI_SIRKA, sirkaRamu - 16));
        const okno = doc.createElement('div');
        okno.id = RJ_ID;
        okno.dataset.sirka = String(sirka);
        const host = {
            'position': 'fixed', 'left': Math.max(8, Math.round((sirkaRamu - sirka) / 2)) + 'px', 'top': '8px',

            'width': sirka + 'px', 'height': 'auto', 'min-height': '0',
            'max-height': Math.max(200, (ram.innerHeight || 600) - 16) + 'px',
            'right': 'auto', 'bottom': 'auto', 'float': 'none', 'transform': 'none', 'line-height': 'normal',
            'overflow': 'auto', 'box-sizing': 'border-box', 'display': 'block', 'margin': '0',
            'padding': '8px 10px', 'z-index': '2147483000', 'background': '#1a1208',
            'border': '1px solid #553311', 'border-radius': '3px', 'box-shadow': '0 4px 14px rgba(0,0,0,0.6)'
        };
        Object.keys(host).forEach(k => okno.style.setProperty(k, host[k], 'important'));
        let koren = okno;
        try { koren = okno.attachShadow({ mode: 'open' }); } catch (e) { koren = okno; }
        const st = doc.createElement('style');
        st.textContent = RJ_CSS;
        koren.appendChild(st);
        const telo = doc.createElement('div');
        telo.className = 'rj-telo';
        telo.textContent = 'Načítám mapu a sousedy…';
        koren.appendChild(telo);
        doc.body.appendChild(okno);
        rjOkno = okno; rjKoren = koren;
        const poz = rjNactiPozici();
        if (poz) rjUmisti(poz.left, poz.top);
        koren.addEventListener('click', rjObsluha);
        koren.addEventListener('mousedown', rjTahni);
        okno.addEventListener('mousedown', rjSirkaTahni);
        okno.addEventListener('mousemove', rjSirkaKurzor);
        koren.addEventListener('input', rjObsluha);
        koren.addEventListener('change', rjObsluha);

        koren.addEventListener('toggle', (e) => {
            const d = e.target;
            if (!d || !d.classList || !d.classList.contains('rj-podrobnosti')) return;
            rjPodrobnosti = d.open;
            try { localStorage.setItem('de_rozjezd_podrobnosti', d.open ? '1' : '0'); } catch (er) { }
        }, true);
        doc.addEventListener('keydown', rjEscKlavesa);
        if (doc !== document) document.addEventListener('keydown', rjEscKlavesa);
        try { sessionStorage.setItem(RJ_ZNOVU, rjLigaTed()); } catch (e) { }
        rjData = await rjNactiData();
        rjVlastni = window.DarkElfUtils.Cache.get(RJ_NS, RJ_KLIC_REZIM) === true;
        rjPlan = rjNactiPlan();
        rjPostav();
        rjNactiOdeslane();
    }

    function rjKrokyZeZeme(P, zem) {
        const S = P.sloty, st = rjSt(P), kroky = [], z = String(zem);
        const pocty = (a) => (Array.isArray(a) ? a : [0, 0, 0]).map(cislo);
        const zi = P.zdroje.findIndex(q => String(q.zem) === z);

        if (zi >= 0) st.den[0].forEach(x => {
            const s = S[x];
            if (!s || !s.zem) return;
            if (st.zdroj(x) === zi) {
                kroky.push({ x: x, cil: s.zem, typ: 4, t: pocty(s.u), h: !!s.h, r: !!s.r, co: 'útok', den: 0 });
                if (!rjNic(pocty(s.p))) kroky.push({ x: x, cil: s.zem, typ: 1, t: pocty(s.p), co: 'přesun bokem', den: 0 });
            } else if (P.zdroje[zi].jinam) {
                const q = pocty((s.pj || [])[zi]);
                if (!rjNic(q)) kroky.push({ x: x, cil: s.zem, typ: 1, t: q, co: 'přesun', den: 0 });
            }
        });

        Object.keys(S).forEach(x => {
            const s = S[x];
            if (!s || String(s.zem) !== z || !(x in st.denKroku)) return;
            const d = st.denKroku[x];
            if (d + 1 >= st.dny) return;
            if (s.dal === 'presun') {
                const roz = (P.rozdel || {})[x] || {};
                Object.keys(roz).forEach(y => {
                    if (S[y] && S[y].zem && Array.isArray(roz[y]) && !rjNic(pocty(roz[y]))) {
                        kroky.push({ x: y, cil: S[y].zem, typ: 1, t: pocty(roz[y]), co: 'přeposílka', den: d + 1 });
                    }
                });
            } else {
                const y = st.dalsi[x];
                const koren = (P.vetve[st.vetev[x]] || { kroky: [] }).kroky[0];
                if (y && S[y] && S[y].zem) {
                    kroky.push({ x: y, cil: S[y].zem, typ: 4, t: null, h: !!(S[koren] && S[koren].h), r: !!S[y].r, co: 'útok vším', den: d + 1 });
                }
            }
        });
        return kroky;
    }

    function rjOdeslaneUtoky() {
        const TYPY = { 'dobyvačný': 4, 'plenivý': 3, 'přesun': 1 };
        return Array.from(document.querySelectorAll('input[name="zrus"]')).map(ch => {
            let el = ch.nextElementSibling, text = '', sila = null;
            for (let i = 0; i < 4 && el; i++, el = el.nextElementSibling) {
                if (el.tagName === 'FONT' && !text) text = el.textContent;
                else if (el.tagName === 'SPAN' && sila == null) sila = cislo(el.textContent);
            }
            const m = /^\s*(.*?)\s+-\s+(dobyvačný|plenivý|přesun)\s*:?\s*$/i.exec(text);
            return m ? { jmeno: m[1].trim().toLowerCase(), typ: TYPY[m[2].toLowerCase()], sila: sila } : null;
        }).filter(Boolean);
    }

    let rjOdeslane = null, rjOdeslaneCas = 0, rjOdeslaneOdlozeno = null;

    async function rjNactiOdeslane() {
        const A = window.DarkElfUtils.AttacksAPI;
        if (!A || rjVlastni) return;
        const zbyva = 15000 - (Date.now() - rjOdeslaneCas);
        if (zbyva > 0) {
            if (!rjOdeslaneOdlozeno) rjOdeslaneOdlozeno = setTimeout(() => { rjOdeslaneOdlozeno = null; if (rjKoren) rjNactiOdeslane(); }, zbyva + 50);
            return;
        }
        rjOdeslaneCas = Date.now();
        try {
            const data = await A.fetch(true);
            rjOdeslane = data && Array.isArray(data.utoky) ? data.utoky : rjOdeslane;
        } catch (e) { return; }
        if (!rjKoren || !rjPlan || rjSbaleno()) return;

        if (rjPodpisHotovych(rjHotove(rjPlan)) !== rjPodpisHotovych(rjHotoveTed)) rjPostav(); else rjObnov();
    }

    function rjHotove(P) {
        const out = {};
        if (rjVlastni || !P || !P.sloty) return out;
        const st = rjSt(P), S = P.sloty, ut = rjOdeslane || [];
        const dnes = rjDnesniDen(P, st), den = rjHerniDen();
        const pocty = (a) => (Array.isArray(a) ? a : [0, 0, 0]).map(cislo);
        const leti = (zi, x, typ) => {
            const L = +((P.zdroje[zi] || {}).zem);
            return ut.some(u => u.odkudId === L && u.zemeId === +S[x].zem && u.typ === typ);
        };
        st.den[0].forEach(x => {
            const s = S[x];
            if (!s || !s.zem || s.zem === RJ_VLASTNI_ZEM) return;
            if (P.odemknuto && P.odemknuto[x] != null && P.odemknuto[x] === den) return;
            const zi = st.zdroj(x), po = dnes >= 1;

            const h = { zdroj: zi, u: false, p: false, pj: {}, lu: false, lp: false, lpj: {} };
            if (!rjNic(pocty(s.u))) { const l = leti(zi, x, 4); if (po || l) { h.u = true; h.lu = l; } }
            if (!rjNic(pocty(s.p))) { const l = leti(zi, x, 1); if (po || l) { h.p = true; h.lp = l; } }
            rjJinam(P, st, x).forEach(i => {
                if (rjNic(pocty((s.pj || [])[i]))) return;
                const l = leti(i, x, 1);
                if (po || l) { h.pj[i] = true; if (l) h.lpj[i] = true; }
            });
            if (h.u || h.p || Object.keys(h.pj).length) out[x] = h;
        });
        return out;
    }

    function rjOdeslanoZdroju(P, H, jenLeti) {
        const pocty = (a) => (Array.isArray(a) ? a : [0, 0, 0]).map(cislo);
        const z = P.zdroje.map(() => [0, 0, 0]);
        Object.keys(H || {}).forEach(x => {
            const s = P.sloty[x], h = H[x];
            if (jenLeti ? h.lu : h.u) z[h.zdroj] = rjSecti(z[h.zdroj], pocty(s.u));
            if (jenLeti ? h.lp : h.p) z[h.zdroj] = rjSecti(z[h.zdroj], pocty(s.p));
            Object.keys(jenLeti ? h.lpj : h.pj).forEach(i => { if (z[i]) z[i] = rjSecti(z[i], pocty((s.pj || [])[i])); });
        });
        return z;
    }

    const rjHerniDen = () => {
        const mapa = window.DarkElfUtils.Cache.get('api', 'map_json');
        return mapa && mapa.hlavicka && mapa.hlavicka.den != null ? +mapa.hlavicka.den : 0;
    };
    let rjHotoveTed = {};

    let rjPodrobnosti = false;
    try { rjPodrobnosti = localStorage.getItem('de_rozjezd_podrobnosti') === '1'; } catch (e) { }
    const rjPodpisHotovych = (H) => Object.keys(H).sort().map(x => x + ':' + (H[x].u ? 'u' : '') + (H[x].p ? 'p' : '') + Object.keys(H[x].pj).join('')).join(',');

    function rjDen0Zacal(P) {
        const st = rjSt(P), S = P.sloty, M = window.DarkElfUtils.MapAPI;
        const me = M.getMe && M.getMe();
        const ja = me && me.id ? String(me.id) : null;
        const zeme = new Set(P.zdroje.map(z => +z.zem));
        return st.den[0].some(x => {
            const s = S[x];
            if (!s || !s.zem || s.zem === RJ_VLASTNI_ZEM) return false;
            const z = M.getCountry(s.zem);
            if (z && ja && String(z.id_hrac) === ja) return true;
            return (rjOdeslane || []).some(u => u.zemeId === +s.zem && zeme.has(u.odkudId));
        });
    }

    function rjPosunNaDnes(P) {
        if (!P || rjVlastni || !P.sloty || !Array.isArray(P.vetve)) return false;
        const dnes = rjHerniDen();
        if (!(dnes > 0)) return false;
        const st = rjSt(P);
        if (st.dny < 2 || !rjDen0Zacal(P)) return false;

        const novyDen = cislo(P.den0) > 0 ? dnes > cislo(P.den0) : rjDnesniDen(P, st) >= 1;
        if (!novyDen) return false;
        const S = P.sloty;
        const zdroje = P.zdroje.map(z => Object.assign({}, z));
        const zdrojZeme = (zem, jinam) => {
            let i = zdroje.findIndex(z => String(z.zem) === String(zem));
            if (i < 0) { zdroje.push({ zem: String(zem), dom: ['', '', ''], limit: '', jinam: !!jinam,
                                      verbZ: rjVerbZNovy(P) }); i = zdroje.length - 1; }
            else if (jinam) zdroje[i].jinam = true;
            return i;
        };

        const M = window.DarkElfUtils.MapAPI, me = M.getMe && M.getMe();
        const moje = (zem) => { const z = M.getCountry(zem); return !!(z && me && me.id && String(z.id_hrac) === String(me.id)); };
        const vetve = [], presuny = [], neprosly = [];
        P.vetve.forEach(b => {
            const x0 = b.kroky[0], x1 = b.kroky[1], x2 = b.kroky[2], s0 = S[x0];
            if (!s0 || !s0.zem || s0.zem === RJ_VLASTNI_ZEM) {

                if (x1 && S[x1] && S[x1].zem) vetve.push({ zdroj: b.zdroj, kroky: [x1, x2].filter(x => x && S[x]) });
                else [x1, x2].forEach(x => { if (x) delete S[x]; });
                return;
            }
            if (!moje(s0.zem)) {
                neprosly.push(x0);
                [x1, x2].forEach(x => { if (x) delete S[x]; });
                return;
            }
            const zi = zdrojZeme(s0.zem, s0.dal === 'presun');
            if (s0.dal === 'presun') {
                presuny.push([x0, zi]);
                vetve.push({ zdroj: zi, kroky: [] });
                return;
            }
            const s1 = S[x1];
            if (s1) {

                const pr = M.getPrivate(s0.zem) || {};
                s1.u = rjSecti((posadkaZeme(s0.zem) || [0, 0, 0]).slice(),
                               [cislo(pr.venku_war1), cislo(pr.venku_war2), cislo(pr.venku_war3)]);
                s1.p = [0, 0, 0];
                s1.pj = [];
                s1.h = !!s0.h;
            }
            vetve.push({ zdroj: zi, kroky: [x1, x2].filter(x => x && S[x]) });
        });

        presuny.forEach(([x0, zi]) => {
            const roz = (P.rozdel || {})[x0] || {};
            Object.keys(roz).forEach(y => {
                if (!S[y] || !Array.isArray(roz[y])) return;
                if (!Array.isArray(S[y].pj)) S[y].pj = [];
                S[y].pj[zi] = roz[y].map(cislo);
            });
        });
        const rozdel = {};
        Object.keys(P.rozdel || {}).forEach(x => { if ((st.denKroku[x] || 0) >= 1) rozdel[x] = P.rozdel[x]; });
        st.den[0].forEach(x => { delete S[x]; });

        const nove = [], preklad = {};
        zdroje.forEach((z, i) => { if (vetve.some(b => b.zdroj === i)) { preklad[i] = nove.length; nove.push(z); } });
        vetve.forEach(b => { b.zdroj = preklad[b.zdroj]; });
        Object.keys(S).forEach(x => {
            const pj = S[x] && S[x].pj;
            if (!Array.isArray(pj)) return;
            const n = [];
            pj.forEach((v, i) => { if (v && (i in preklad)) n[preklad[i]] = v; });
            S[x].pj = n;
        });
        zdroje.length = 0;
        nove.forEach(z => zdroje.push(z));
        P.zdroje = zdroje;
        P.vetve = vetve;
        P.rozdel = rozdel;
        P.dny = st.dny - 1;
        P.vetve.forEach(b => {
            while (b.kroky.length < 3) { const x = rjVolnyStitek(P); b.kroky.push(x); S[x] = rjNovySlot(); }
        });
        P.den0 = dnes;
        P.odemknuto = {};
        P.navrhInfo = 'Plán posunut na dnešek (herní den ' + dnes + '): zítřejší útoky jsou dnešní — Navrhni je doladí'
            + (neprosly.length ? ' · neprošlo ' + neprosly.join(', ') + ', jeho cesta vynechána' : '');
        return true;
    }

    function rjSrovnejDen0(P) {
        if (!P || rjVlastni) return false;
        const dnes = rjHerniDen();
        if (!(cislo(P.den0) > 0) || !(dnes > cislo(P.den0)) || rjDen0Zacal(P)) return false;
        P.den0 = dnes;
        return true;
    }

    function rjNovyCilDnes(x) {
        if (rjSt().denKroku[x] === 0 && rjHerniDen() > 0) rjPlan.den0 = rjHerniDen();
    }

    function rjDnesniDen(P, st) {
        const dnesHra = rjHerniDen();
        if (cislo(P.den0) > 0 && dnesHra > 0) return Math.min(st.dny, Math.max(0, dnesHra - cislo(P.den0)));
        const M = window.DarkElfUtils.MapAPI;

        const me = M.getMe && M.getMe();
        const ja = me && me.id ? String(me.id) : null;
        for (let d = 0; d < st.dny; d++) {
            const cile = st.den[d].filter(x => P.sloty[x] && P.sloty[x].zem && P.sloty[x].zem !== RJ_VLASTNI_ZEM);
            if (!cile.length || !ja) return d;
            if (!cile.every(x => { const z = M.getCountry(P.sloty[x].zem); return z && String(z.id_hrac) === ja; })) return d;
        }
        return st.dny;
    }

    function rjStavOdeslani(P, dnes) {
        if (!rjOdeslane || rjVlastni) return null;
        const zeme = new Set();
        P.zdroje.forEach(z => { if (z.zem) zeme.add(String(z.zem)); });
        Object.keys(P.sloty).forEach(x => { const z = P.sloty[x].zem; if (z && z !== RJ_VLASTNI_ZEM) zeme.add(String(z)); });
        const out = {};
        zeme.forEach(L => rjKrokyZeZeme(P, L).forEach(k => {
            const a = rjOdeslane.find(u => u.odkudId === +L && u.zemeId === +k.cil && u.typ === k.typ) || null;
            const o = out[k.x] = out[k.x] || { den: k.den, utok: undefined, presuny: [] };
            if (k.typ === 4) o.utok = a; else o.presuny.push(a);
        }));
        return { kroky: out, dnes: dnes != null ? dnes : rjDnesniDen(P, rjSt(P)) };
    }

    function rjVyplnovac() {
        const T = [1, 2, 3].map(i => document.querySelector('input[name="T' + i + '"]'));
        const zdrojEl = document.querySelector('input[name="id_zeme_zdroj"]');
        if (T.some(t => !t) || !zdrojEl || document.getElementById('rj-vyplnit')) return;
        rjPlan = rjNactiPlan();
        if (rjPosunNaDnes(rjPlan) | rjSrovnejDen0(rjPlan)) rjUloz();
        const kroky = rjKrokyZeZeme(rjPlan, zdrojEl.value);
        if (!kroky.length) return;
        const vyber = (n) => document.querySelector('select[name="' + n + '"]');
        const cil = vyber('cil'), typ = vyber('typ'), hero = vyber('hero');
        const rytir = document.querySelector('input[name="buy_knight"]');

        const doma = T.map(t => {
            const tr = t.closest('tr'), nad = tr && tr.previousElementSibling, b = nad && nad.querySelector('big.rd');
            return b ? cislo(b.textContent) : null;
        });
        const vse = doma.map(n => n || 0);
        const odeslane = rjOdeslaneUtoky();
        const hrdinaId = () => {
            if (!hero) return null;
            const o = Array.from(hero.options).filter(op => op.value);
            const muj = o.find(op => op.value === String(rjPlan.hrdina));
            return (muj || o[0] || {}).value || null;
        };
        const nastav = (el, val) => {
            if (!el) return;
            el.value = val;
            ['input', 'keyup', 'change'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true })));
        };

        const shody = Array.from(document.querySelectorAll('td')).filter(td => /dorazí do cíle/.test(td.textContent || ''));
        const dorazi = shody.find(td => !shody.some(o => o !== td && td.contains(o))) || null;
        const odkaz = document.querySelector('a[href^="attacks_list.asp"]');
        const kotva = (dorazi && dorazi.closest('tr')) || (odkaz && odkaz.closest('tr')) || null;
        const vTabulce = !!(kotva && kotva.parentNode);

        const BUNKA = 'text-align:left; font-size:11px; line-height:1.35; padding:3px 6px; white-space:normal;'
            + ' font-weight:bold !important; color:#ffcc00 !important;';

        const novyKrok = () => {
            if (!vTabulce) {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'butt_sml rj-krok';
                b.style.cssText = 'display:block; width:100%; box-sizing:border-box; margin:2px 0;' + BUNKA;
                return { radek: b, prvek: b };
            }
            const tr = document.createElement('tr'), td = document.createElement('td');
            td.colSpan = 2;
            td.className = 'br2 rj-krok';
            td.setAttribute('role', 'button');
            td.style.cssText = BUNKA;
            tr.appendChild(td);
            return { radek: tr, prvek: td };
        };

        const radky = [];
        const hlavicka = '<b style="color:#ffcc00;">Rozjezd ⇶</b> <span style="color:#999;">klik vyplní formulář — odeslat pak sám</span>';
        const tlacitka = [];
        kroky.forEach(k => {
            const opt = cil && Array.from(cil.options).find(o => o.value === String(k.cil));
            const t = k.t || vse;
            const jmeno = opt ? opt.textContent.trim() : rjJmeno(k.cil) || ('zem ' + k.cil);

            const poslano = odeslane.find(o => o.typ === k.typ && o.jmeno === jmeno.toLowerCase());
            const malo = !poslano && k.t && k.t.some((n, i) => doma[i] != null && n > doma[i]);
            const bezHrdiny = !poslano && k.h && !hrdinaId();
            const { radek, prvek: b } = novyKrok();
            if (!opt) { b.setAttribute('aria-disabled', 'true'); if (b.tagName === 'BUTTON') b.disabled = true; }
            b.style.cursor = opt ? 'pointer' : 'not-allowed';
            b.style.opacity = !opt ? '.45' : '';
            b.innerHTML = (poslano ? '<span style="color:#55dd55;">✓</span> ' : '')
                + `${k.x} ${rjEsc(jmeno)} · ${k.co} ${rjTri(t)}`
                + (k.h ? ' H' : '') + (k.r ? ' R' : '')
                + (k.den ? ` (${RJ_DNY[k.den].toLowerCase()})` : '')
                + (poslano ? ` · odesláno${poslano.sila != null ? ' ' + poslano.sila : ''}` : '')
                + (!opt ? ' <span style="color:#ff6666;">— cíl není v nabídce</span>' : '')
                + (malo ? ' <span style="color:#ffaa33;">— v zemi je jen ' + rjTri(doma) + '</span>' : '')
                + (bezHrdiny ? ' <span style="color:#ffaa33;">— hrdina tu není</span>' : '');
            b.title = !opt ? 'Cíl není mezi zeměmi, kam jde z téhle země poslat vojsko (soused nebo volný průchod)'
                : poslano ? 'Tenhle útok už odešel (je v seznamu útoků). Klik ho vyplní znovu.'
                : k.t ? 'Vyplní jednotky, rytíře, hrdinu, cíl a typ akce podle plánu Rozjezdu — odeslat pak sám'
                : 'Útok celým vojskem, které v zemi je (' + rjTri(vse) + ')';
            if (opt) b.addEventListener('click', () => {
                T.forEach((el, i) => nastav(el, String(t[i])));
                if (rytir) { rytir.checked = k.typ === 4 && !!k.r; rytir.dispatchEvent(new Event('change', { bubbles: true })); }
                if (hero) nastav(hero, k.typ === 4 && k.h ? (hrdinaId() || '') : '');
                nastav(cil, String(k.cil));
                nastav(typ, String(k.typ));
                tlacitka.forEach(x => { x.style.outline = ''; });
                b.style.outline = '1px solid #ffcc00';
            });
            if (!radky.length) radek.id = 'rj-vyplnit';
            tlacitka.push(b);
            radky.push(radek);
        });
        if (vTabulce) {
            radky.forEach(r => kotva.parentNode.insertBefore(r, kotva));
            return;
        }
        const panel = document.createElement('div');
        if (radky[0]) radky[0].removeAttribute('id');
        panel.id = 'rj-vyplnit';
        panel.style.cssText = 'margin:6px 0 4px 0; text-align:center; font:11px Arial,sans-serif;';
        panel.innerHTML = '<div style="margin-bottom:2px;">' + hlavicka + '</div>';
        radky.forEach(r => panel.appendChild(r));
        const odeslat = document.querySelector('input[name="odeslat"]');
        const tab = odeslat && odeslat.closest('table');
        if (tab && tab.parentNode) tab.parentNode.insertBefore(panel, tab.nextSibling);
        else {
            const t1 = T[0].closest('table');
            if (t1 && t1.parentNode) t1.parentNode.insertBefore(panel, t1);
            else document.body.appendChild(panel);
        }
    }

    window.addEventListener('pagehide', () => rjZavri(false));

    if (jeMapa) {
        window.__deRozjezd = {
            otevri: () => rjOtevri(),

            obnov: () => { if (rjKoren && rjPlan && !rjSbaleno()) { rjPostav(); rjNactiOdeslane(); } }
        };
        if (rjZnovuOtevrit()) rjOtevri();
        return;
    }

    if (jeVojsko) { rjVyplnovac(); return; }

    (function rjTlacitko() {
        const telo = parentTr.parentElement;
        if (!telo) return;
        const b = document.createElement('span');
        b.textContent = 'Rozjezd ⇶';
        b.title = 'Plán rozjezdu — dobývání neutrálek na dnes, zítra a pozítří z jedné i víc tvých zemí, s přeposílkami';
        b.style.cssText = 'cursor:pointer; color:#88ccff; border:1px solid #446; padding:2px 10px; border-radius:3px;'
            + ' background:rgba(0,0,0,0.5); font-weight:bold; white-space:nowrap;';
        b.addEventListener('click', () => { const h = rjHostitel(); if (h) h.otevri(); else rjOtevri(); });
        const tr = document.createElement('tr');
        tr.id = 'rj-radek';
        const td = document.createElement('td');
        td.colSpan = targetTd.colSpan || 2;
        td.style.cssText = 'text-align:center; padding:4px 0;';
        td.appendChild(b);
        tr.appendChild(td);
        telo.appendChild(tr);
        const naKonec = () => { if (telo.lastElementChild !== tr) telo.appendChild(tr); };
        const pozor = new MutationObserver(naKonec);
        pozor.observe(telo, { childList: true });
        setTimeout(() => pozor.disconnect(), 15000);

        if (!rjHostitel() && rjZnovuOtevrit()) rjOtevri();
    })();
})();
