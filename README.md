# 🏇 Horses Arena

**L'ippodromo online mondiale.** Un solo mondo condiviso da tutti: compri cavalli, li alleni, li fai correre in **3D** (stile anime, cel-shading) e guardi le corse in diretta con la telecronaca di **Nonna Pina**. Non controlli niente in gara: conta solo come gestisci la scuderia.

Gira tutto su **Cloudflare Workers + Durable Objects (SQLite)**. Il client è HTML/JS senza build, con Three.js. Funziona da telefono, tablet e computer, in 6 lingue: 🇮🇹 🇬🇧 🇩🇪 🇷🇺 🇯🇵 🇨🇳. Il francese c'è, ma provate a sceglierlo.

## Cosa c'è dentro

### 🧪 La simulazione (il cuore del gioco)
- **Fisica deterministica a 20 Hz**: ogni cavallo ha una *velocità critica* (aerobica) e una *riserva anaerobica* in metri, il modello usato in fisiologia dello sport. Chi spende troppo presto si pianta.
- In curva chi corre largo fa più strada. In scia si consuma meno e il vento colpisce chi è in testa. Ci sono cavalli chiusi in mezzo al gruppo, cambi di corsia, contatti laterali e tallonamenti, inciampi, **cadute** (il cavallo a terra diventa un ostacolo e chi arriva deve saltarlo), corse a **siepi** con rifiuti e cadute, terreno e meteo, attitudini (distanza, terreno, superficie) ed età.
- **13 statistiche** più un potenziale genetico, e **14 mantelli** con macchie, balzane, lista e stella.
- **120 quirk nascosti**: si allunga sul palo, urla e spaventa i vicini, morde, scalcia, fa retromarcia, si ferma a brucare, si innamora, disarciona il fantino… Li scopri solo vedendoli in gara.

### 🧠 I cavalli imparano (machine learning classico, niente IA generativa)
- **Rescorla-Wagner**: ogni stimolo (folla, gabbie, contatti, frusta, urla, botti, pioggia, curve, ostacoli…) viene associato a quello che è successo dopo. Il cavallo ne prende **paura o fiducia** e, se lo stimolo torna senza conseguenze, la paura si estingue.
- **Bandito contestuale (Q-learning)** per scegliere la tattica in base al tipo di corsa.
- **Regolazione del ritmo**: impara quando lanciare lo sprint in base a come gli sono finite le energie.
- **Rancori e rivalità** verso singoli cavalli.
- Un cavallo intelligente impara più in fretta, nel bene e nel male.

### 🏟️ Il mondo
- **Corse libere** ogni 30 minuti (8:00–23:30), divise in classi: Maiden, C, B, A, Aperta.
- **Coppa del Giorno** alle 13:00 (batterie e finale) e **Gran Premio** alle 21:30 (a ostacoli il mercoledì e il sabato).
- **Campionato** a stagioni settimanali, con una giornata al giorno alle 19:00 e 4 divisioni con promozioni e retrocessioni. Chi entra tardi gioca lo stesso, ha solo meno punti.
- **Amichevoli** subito (anche aperte agli altri giocatori), **sfide** con posta in palio e **tornei privati** con codice, bot, calendario a scelta e montepremi.
- **Ordini al fantino**: tattica, frusta, posizione, momento dello sprint, paraocchi, tappi e ferri da pioggia. Il cavallo può disobbedire.
- **Scommesse** a quota fissa.
- Mercato: allevamento del sistema e vendite tra giocatori. Poi riproduzione (monta e puledri con genetica e quirk ereditati), allenamento (14 sedute, piano settimanale), più di **100 ingaggi** in bacheca (lavori, sponsor, monte, madri surrogate, prestiti, corse truccate…).
- **Salute**: 15 malattie con contagio, diagnosi e cure (base, clinica, intensiva, sperimentale), **laboratorio** con sperimentazioni a pagamento, **assicurazioni** (rimborso anche se il cavallo viene ucciso).
- **Mercato nero**: sabotaggi prima della corsa, **sicari in pista** (buccia di banana, olio, corda tesa, invasore, petardo, laser, drone: gli oggetti colpiscono chiunque ci passi sopra), il **killer**, il doping con l'antidoping. Dall'altra parte ci sono **sorveglianza**, **detective privati** e **polizia**.
- **Posta** tra giocatori (soldi, cavalli, richieste di pagamento), **chat** globale, classifiche, notifiche in tempo reale.
- **Tutorial** guidato da Nonna Pina.
- **Assistente AI** opzionale (Cloudflare Workers AI): scrivi o **parli** a Nonna Pina e lei agisce al posto tuo (compra, iscrive, allena, accetta ingaggi, scommette…) tramite function calling.

## Mettilo online su Cloudflare

Serve un account Cloudflare con il piano **Workers Paid** (5 $/mese). Le corse vengono simulate sul server e una simulazione usa più dei 10 ms di CPU concessi dal piano gratuito.

### Deploy automatico da GitHub
Il workflow `.github/workflows/deploy.yml` lancia typecheck e test a ogni push e su `main` pubblica su Cloudflare. Servono due segreti nel repository (*Settings → Secrets and variables → Actions*):

- `CLOUDFLARE_API_TOKEN`: crealo da *dash.cloudflare.com → My Profile → API Tokens → Create Token*. Puoi usare il modello **"Edit Cloudflare Workers"**, oppure fare un token personalizzato con questi permessi:
  - Account → **Workers Scripts → Edit** (indispensabile: pubblica il Worker e il Durable Object)
  - Account → **Workers AI → Read** (solo per l'assistente)
  - Account → **Account Settings → Read**
  - User → **User Details → Read**
  - Zone → **Workers Routes → Edit** (solo se userai un tuo dominio)
- `CLOUDFLARE_ACCOUNT_ID`: lo trovi nella colonna destra della home della dashboard.

Al primo deploy il Worker risponde su `https://horses-arena.<tuo-sottodominio>.workers.dev`. Se non hai ancora un sottodominio `workers.dev`, la dashboard te lo fa scegliere aprendo *Workers & Pages*.

### Deploy a mano
```bash
npm install
```
```bash
npx wrangler login
```
```bash
npm run deploy
```

### L'assistente AI
È attivo da solo se l'account ha **Workers AI** (binding `AI` in `wrangler.jsonc`). Per spegnerlo, imposta la variabile `AI_DISABLED=1` nel Worker. Usa il modello `@cf/meta/llama-3.3-70b-instruct-fp8-fast`.

## Sviluppo in locale

```bash
npm run dev
```
Apri `http://localhost:8787`. Questa modalità parte senza l'AI, perché Workers AI richiede il login. Con l'AI usa `npm run dev:ai`.

```bash
npm test
```
```bash
npm run typecheck
```

Test end-to-end con browser veri (Playwright + Chromium), con gli screenshot in `e2e/shots/`:
```bash
node e2e/smoke.mjs http://127.0.0.1:8787
```
```bash
node e2e/race_flow.mjs http://127.0.0.1:8787 phone
```

## Come è fatto

```
src/
  worker.ts              Worker + Durable Object "World" (API, websocket, allarmi)
  sim/                   simulazione pura e deterministica
    race.ts              motore fisico della corsa (→ replay compatto + eventi)
    horse.ts             genetica, statistiche, età, valore, riproduzione
    learning.ts          Rescorla-Wagner, bandito contestuale, ritmo, rancori
    quirks.ts            i 120 quirk
    rng.ts, names.ts, types.ts
  game/                  il mondo di gioco
    world.ts             calendario, ciclo di vita delle corse, campionato, premi, salute, indagini
    actions.ts           tutto quello che può fare un giocatore
    offers.ts            oltre 100 ingaggi della bacheca
    training.ts, crime.ts, health.ts, tournaments.ts, assistant.ts, time.ts, db.ts
public/
  js/shared/track.js     geometria delle piste (condivisa server/client)
  js/race3d/             visore 3D: scena, cavallo procedurale, stile anime, regia TV, telecronaca
  js/screens/            schermate dell'app
  js/nonna.js            Nonna Pina (SVG + voce sintetizzata)
  js/i18n*.js            6 lingue
test/                    test della simulazione e del mondo con orologio finto
e2e/                     test con browser veri
```

- Il server è **autoritativo**: alla chiusura delle iscrizioni simula la corsa e salva un *replay* compatto (5 fotogrammi al secondo più gli eventi). I client lo riproducono in 3D e lo interpolano, sincronizzati con l'orologio del server per la diretta. I risultati (premi, apprendimento, scoperta dei quirk) vengono applicati a fine corsa, così niente spoiler.
- Tutti i lavori a tempo (corse, campionato, allenamenti delle 7:00, nascite, guarigioni, indagini, prestiti) stanno in una tabella `jobs` eseguita dall'allarme del Durable Object. Un cron ogni 5 minuti lo tiene sveglio.

Licenza MIT.
