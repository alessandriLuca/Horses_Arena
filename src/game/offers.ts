// La Bacheca degli Ingaggi: ogni 6 ore arrivano nuove proposte per fare soldi coi propri cavalli.
// Ognuna ha un prezzo: giorni di impegno, fatica, rischi, e a volte lascia il segno sulla mente del cavallo.
import type { Rng } from "../sim/rng";
import type { Stim } from "../sim/learning";
import type { StatKey } from "../sim/horse";

export type OfferKind = "job" | "stud" | "surrogate" | "contract" | "buyout" | "loan";

export interface OfferTpl {
  id: string;
  kind: OfferKind;
  title: string;
  desc: string;
  pay: [number, number];
  hours?: number; // ore di impegno
  fatigue?: number;
  risk?: number; // probabilità d'infortunio
  morale?: number;
  stims?: Partial<Record<Stim, number>>; // λ (positivo = spaventa, negativo = abitua)
  gains?: Partial<Record<StatKey, number>>;
  sex?: "M" | "F";
  minAge?: number;
  maxAge?: number;
  minOverall?: number;
  // contratti: condizione sulla prossima corsa
  cond?: { top?: number; worse?: number; win?: boolean; finish?: boolean };
  penalty?: number;
  scandal?: number; // probabilità di scandalo (contratti truccati)
  rep?: number; // effetto sulla reputazione
  shady?: boolean;
  repay?: number; // prestiti: moltiplicatore da restituire
}

const J = (id: string, title: string, desc: string, pay: [number, number], hours: number, fatigue: number, extra: Partial<OfferTpl> = {}): OfferTpl =>
  ({ id, kind: "job", title, desc, pay, hours, fatigue, ...extra });
const C = (id: string, title: string, desc: string, pay: [number, number], cond: OfferTpl["cond"], extra: Partial<OfferTpl> = {}): OfferTpl =>
  ({ id, kind: "contract", title, desc, pay, cond, ...extra });

export const OFFERS: OfferTpl[] = [
  // ---- spettacolo e turismo ----
  J("matrimonio", "Carrozza nuziale", "Trainare la carrozza degli sposi a un matrimonio in Costiera.", [900, 1600], 8, 12, { stims: { folla: -0.15 }, morale: 3 }),
  J("film_western", "Comparsa in un western", "Un regista cerca cavalli per un film western girato in Maremma. Spari a salve inclusi.", [2500, 4500], 20, 22, { stims: { botti: 0.3, folla: -0.1 }, risk: 0.02 }),
  J("film_storico", "Film in costume", "Battaglia medievale per una serie TV: armature, urla e polvere.", [2800, 5000], 24, 25, { stims: { urla: 0.25, gruppo: -0.15 }, risk: 0.03 }),
  J("palio_rievocazione", "Rievocazione storica", "Sfilata in costume per la festa del borgo.", [700, 1300], 6, 8, { stims: { folla: -0.25 }, morale: 4 }),
  J("spot_pasta", "Spot del pastificio", "Galoppare al tramonto in un campo di grano per la pubblicità di una pasta.", [1800, 3200], 6, 6, { morale: 5 }),
  J("spot_auto", "Spot di un'auto sportiva", "Corsa contro un'auto sportiva su una spiaggia, per uno spot.", [3000, 5200], 8, 20, { stims: { botti: 0.15 }, risk: 0.01 }),
  J("servizio_moda", "Servizio di moda", "Posare per una rivista di moda milanese. Flash a raffica.", [1500, 2800], 5, 4, { stims: { luci: 0.2 }, morale: 2 }),
  J("calendario", "Calendario dei cavalli più belli", "Una sessione fotografica per il calendario dell'anno prossimo.", [1200, 2200], 4, 3, { stims: { luci: 0.15 } }),
  J("passeggiate", "Passeggiate per turisti", "Un agriturismo cerca cavalli tranquilli per i turisti.", [600, 1100], 10, 10, { gains: { calm: 0.4 }, morale: -2 }),
  J("ippoterapia", "Ippoterapia con i bambini", "Una mattina in un centro di ippoterapia. Tanta pazienza.", [500, 900], 6, 4, { gains: { calm: 0.8, focus: 0.3 }, morale: 6 }),
  J("circo", "Numero da circo", "Un circo itinerante vuole il tuo cavallo per un numero sotto il tendone.", [2000, 3600], 18, 18, { stims: { folla: -0.2, luci: 0.25, urla: 0.15 }, gains: { agility: 0.6 } }),
  J("concerto", "Ingresso a cavallo al concerto", "Una rockstar vuole entrare in scena a cavallo. Volume altissimo.", [3500, 6000], 6, 6, { stims: { botti: 0.35, folla: 0.15, luci: 0.3 }, risk: 0.01 }),
  J("capodanno", "Sfilata di Capodanno", "Sfilata in piazza con fuochi d'artificio a mezzanotte.", [2200, 4000], 8, 8, { stims: { botti: 0.45, folla: 0.1 }, risk: 0.015 }),
  J("presepe", "Presepe vivente", "Una notte immobili nel presepe vivente del paese.", [400, 800], 10, 2, { gains: { calm: 0.6 }, morale: -3 }),
  J("sfilata_carnevale", "Carro di Carnevale", "Trainare un carro allegorico al carnevale di Viareggio.", [1800, 3000], 12, 16, { stims: { folla: -0.3, urla: -0.15 }, gains: { strength: 0.5 } }),
  J("videoclip", "Videoclip trap", "Un trapper vuole il cavallo nel suo videoclip. Fumogeni colorati inclusi.", [2500, 4200], 6, 5, { stims: { luci: 0.2, botti: 0.1 } }),
  J("influencer", "Contenuti per un'influencer", "Un'influencer a cavallo per i suoi follower. Selfie infiniti.", [1400, 2600], 5, 3, { stims: { luci: 0.1 }, morale: 1 }),
  J("documentario", "Documentario naturalistico", "Due giorni allo stato brado per un documentario.", [1600, 2800], 36, 6, { morale: 10, gains: { courage: 0.4, agility: 0.3 } }),
  J("museo", "Modello per uno scultore", "Uno scultore cerca un modello per una statua equestre.", [900, 1700], 12, 2, { gains: { calm: 0.5 }, morale: -2 }),
  J("benedizione", "Benedizione degli animali", "Sant'Antonio Abate: sfilata e benedizione in piazza.", [300, 700], 4, 2, { stims: { folla: -0.2 }, morale: 4 }),
  // ---- lavoro ----
  J("vendemmia", "Vendemmia", "Trasportare le ceste d'uva in una tenuta del Chianti.", [700, 1300], 16, 20, { gains: { strength: 0.8 } }),
  J("legname", "Esbosco nel bosco", "Trainare tronchi fuori da un bosco dell'Appennino.", [1100, 1900], 18, 28, { gains: { strength: 1.2, stamina: 0.4 }, risk: 0.02 }),
  J("mandria", "Radunare la mandria", "I butteri maremmani cercano rinforzi per spostare la mandria.", [1000, 1800], 20, 24, { gains: { agility: 0.8, courage: 0.4 }, stims: { gruppo: -0.15 }, risk: 0.015 }),
  J("aratura", "Aratura tradizionale", "Una fattoria biologica vuole arare come una volta.", [600, 1100], 14, 24, { gains: { strength: 1.0 }, morale: -3 }),
  J("polizia", "Rinforzo alla polizia a cavallo", "Servizio d'ordine allo stadio. Cori e fumogeni.", [1500, 2700], 10, 12, { stims: { folla: -0.3, urla: -0.2, botti: 0.15 }, gains: { courage: 0.6 } }),
  J("guardia_parco", "Guardia forestale", "Pattugliare un parco nazionale per tre giorni.", [1300, 2300], 48, 20, { gains: { stamina: 0.8 }, morale: 5 }),
  J("postino", "Postino d'alta quota", "Consegnare la posta ai rifugi di montagna.", [900, 1500], 20, 24, { gains: { stamina: 0.9, strength: 0.5 }, risk: 0.01 }),
  J("traino_battello", "Alaggio sul canale", "Trainare un battello lungo un canale come nell'Ottocento.", [800, 1400], 14, 22, { gains: { strength: 0.9 } }),
  J("spiaggia", "Pulizia delle spiagge", "Trainare il rastrello per pulire una spiaggia del Salento.", [700, 1200], 10, 14, { gains: { strength: 0.5 }, morale: 3 }),
  J("soccorso", "Soccorso alpino", "Portare provviste in una zona isolata dalla neve.", [1600, 2600], 30, 30, { gains: { courage: 0.8, stamina: 0.6 }, rep: 5, risk: 0.02 }),
  // ---- sport e gare minori ----
  J("esibizione", "Esibizione in una fiera", "Una corsa dimostrativa alla fiera agricola di Verona.", [1200, 2200], 8, 15, { stims: { folla: -0.2 } }),
  J("lepre_allenamento", "Lepre per un campione", "Fare l'andatura negli allenamenti di un cavallo famoso.", [1500, 2500], 8, 18, { gains: { speed: 0.4 }, stims: { testa: -0.2 } }),
  J("sparring", "Sparring partner", "Correre accanto a un cavallo nervoso per abituarlo al gruppo.", [900, 1600], 8, 16, { stims: { contatto: -0.2, gruppo: -0.2 }, risk: 0.01 }),
  J("polo", "Partita di polo", "Un club di polo è rimasto senza cavalli. Mazze che volano.", [2200, 3800], 6, 24, { gains: { agility: 0.9, accel: 0.4 }, stims: { contatto: 0.15 }, risk: 0.03 }),
  J("cross", "Gara di cross country", "Una gara amatoriale di cross: tronchi, fossi e ruscelli.", [1800, 3000], 8, 26, { gains: { jumping: 1.0, courage: 0.4 }, stims: { ostacoli: -0.25 }, risk: 0.03 }),
  J("endurance", "Gara di endurance", "Ottanta chilometri nel deserto di Sardegna. Durissima.", [2600, 4400], 24, 45, { gains: { stamina: 1.4, recovery: 0.6 }, risk: 0.03 }),
  J("dressage", "Lezione di dressage", "Prestare il cavallo a un'accademia di dressage.", [1000, 1800], 8, 10, { gains: { focus: 0.7, agility: 0.5, consistency: 0.4 } }),
  J("corsa_spiaggia", "Corsa sulla spiaggia", "Una corsa tradizionale sulla sabbia al tramonto.", [1400, 2400], 6, 20, { gains: { stamina: 0.5, strength: 0.4 }, stims: { fango: -0.15 } }),
  J("neve", "Gara sulla neve di St. Moritz", "Una corsa sul lago ghiacciato in Svizzera.", [3000, 5200], 30, 28, { stims: { folla: -0.15 }, risk: 0.025, minOverall: 50 }),
  J("rodeo", "Rodeo americano", "Una tournée di rodeo. Il pubblico urla come matto.", [2600, 4500], 30, 30, { stims: { urla: 0.2, folla: 0.15, contatto: 0.2 }, gains: { courage: 0.6 }, risk: 0.05 }),
  // ---- scienza e salute ----
  J("ricerca", "Studio universitario", "Un'università studia la biomeccanica del galoppo. Sensori ovunque.", [1100, 1900], 12, 10, { gains: { consistency: 0.3 } }),
  J("veterinaria", "Esame per veterinari", "Fare da paziente agli studenti di veterinaria.", [500, 1000], 6, 2, { stims: { luci: 0.05 }, morale: -4 }),
  J("integratori", "Test di integratori", "Un'azienda testa un nuovo integratore. Gli effetti? Si vedrà.", [1500, 2600], 12, 5, { gains: { recovery: 0.6 }, risk: 0.02 }),
  J("ferri_nuovi", "Prova dei ferri al titanio", "Un maniscalco sperimenta ferri al titanio.", [900, 1600], 6, 6, { gains: { speed: 0.2 }, risk: 0.015 }),
  J("termale", "Testimonial per le terme", "Una giornata alle terme per una pubblicità. Fanghi inclusi.", [1000, 1800], 8, -20, { morale: 8 }),
  J("dieta", "Dieta sperimentale", "Un nutrizionista equino prova una dieta vegana-proteica.", [700, 1400], 24, 0, { gains: { strength: -0.5, stamina: 0.5 }, morale: -3 }),
  J("genetica", "Mappa genetica", "Un laboratorio vuole sequenziare il DNA del tuo cavallo.", [800, 1500], 3, 1, {}),
  J("psicologia", "Esperimento di psicologia animale", "Studiano la paura nei cavalli. Lo spaventano un po' per scienza.", [1600, 2800], 8, 6, { stims: { botti: 0.3, luci: 0.3, urla: 0.25 } }),
  J("musicoterapia", "Musicoterapia", "Una settimana di musica classica in scuderia.", [400, 900], 6, -8, { gains: { calm: 0.9 }, stims: { urla: -0.2 }, morale: 5 }),
  J("agopuntura", "Agopuntura cinese", "Un esperto di agopuntura vuole un paziente famoso.", [600, 1200], 4, -10, { morale: 2 }),
  // ---- prestigio ----
  J("ambasciata", "Cerimonia in ambasciata", "Scortare un ambasciatore in una cerimonia ufficiale a Roma.", [2400, 4000], 8, 6, { stims: { folla: -0.15, botti: 0.1 }, rep: 5, minOverall: 55 }),
  J("quirinale", "Corazzieri per un giorno", "Sostituire un cavallo dei corazzieri alla parata.", [3200, 5500], 10, 8, { stims: { folla: -0.25, botti: 0.15 }, rep: 8, minOverall: 60 }),
  J("asta_benefica", "Asta di beneficenza", "Sfilare a un'asta di beneficenza. Fa bene alla reputazione.", [300, 600], 4, 2, { rep: 6, morale: 3 }),
  J("scuola", "Visita alle scuole", "Una mattinata con i bambini delle elementari.", [200, 500], 5, 3, { rep: 4, gains: { calm: 0.5 }, stims: { urla: -0.2 } }),
  J("museo_vivente", "Statua vivente al museo", "Stare fermi in un museo di storia dell'equitazione.", [600, 1100], 10, 1, { gains: { calm: 0.6, focus: 0.3 }, morale: -4 }),
  J("palio_ospite", "Ospite d'onore al Palio", "Sfilare prima di un famoso palio in piazza.", [2600, 4400], 6, 8, { stims: { folla: -0.35, urla: -0.15 }, rep: 4, minOverall: 50 }),
  J("royal", "Matrimonio reale all'estero", "Un matrimonio di una casa reale europea vuole cavalli italiani.", [5000, 8500], 40, 15, { stims: { folla: -0.25, botti: 0.15 }, rep: 10, minOverall: 62 }),
  J("sceicco_sfilata", "Sfilata per uno sceicco", "Uno sceicco vuole vedere i migliori cavalli d'Italia a Dubai.", [6000, 10000], 48, 20, { rep: 5, minOverall: 65, risk: 0.01 }),
  J("olimpiadi", "Cerimonia olimpica", "La cerimonia di apertura dei giochi olimpici vuole un cavallo simbolo.", [7000, 12000], 30, 10, { stims: { folla: -0.3, botti: 0.3, luci: 0.3 }, rep: 12, minOverall: 70 }),
  J("francobollo", "Volto di un francobollo", "Le Poste vogliono il tuo cavallo su un francobollo.", [1500, 2500], 3, 1, { rep: 6, minOverall: 55 }),
  // ---- riproduzione ----
  { id: "stud_sceicco", kind: "stud", title: "Monta per lo sceicco", desc: "Uno sceicco vuole il tuo stallone per la sua giumenta purosangue.", pay: [5000, 9000], hours: 24, fatigue: 25, sex: "M", minAge: 3, minOverall: 55 },
  { id: "stud_tenuta", kind: "stud", title: "Monta in una tenuta toscana", desc: "Una tenuta toscana cerca uno stallone per tre fattrici.", pay: [3000, 5500], hours: 36, fatigue: 35, sex: "M", minAge: 3 },
  { id: "stud_lipizzano", kind: "stud", title: "Incrocio sperimentale", desc: "Un allevatore vuole incrociare il tuo stallone con una lipizzana.", pay: [2500, 4000], hours: 24, fatigue: 22, sex: "M", minAge: 3 },
  { id: "stud_americano", kind: "stud", title: "Monta per un ranch americano", desc: "Un ranch del Kentucky paga bene per il seme del tuo campione.", pay: [6000, 11000], hours: 30, fatigue: 25, sex: "M", minAge: 4, minOverall: 62 },
  { id: "stud_maneggio", kind: "stud", title: "Monta per il maneggio", desc: "Il maneggio del paese vuole qualche puledro dal tuo stallone.", pay: [1500, 2500], hours: 20, fatigue: 20, sex: "M", minAge: 3 },
  { id: "sur_tenuta", kind: "surrogate", title: "Fattrice in affitto", desc: "Un allevamento ti chiede la cavalla come madre surrogata. Il puledro sarà loro.", pay: [4500, 7500], hours: 36, fatigue: 15, sex: "F", minAge: 3 },
  { id: "sur_principessa", kind: "surrogate", title: "Il puledro della principessa", desc: "Una principessa vuole un puledro dalla tua cavalla e il suo stallone.", pay: [7000, 11000], hours: 40, fatigue: 18, sex: "F", minAge: 4, minOverall: 58 },
  { id: "sur_clinica", kind: "surrogate", title: "Clinica riproduttiva", desc: "Una clinica veterinaria cerca fattrici sane per un programma di allevamento.", pay: [3500, 5500], hours: 36, fatigue: 15, sex: "F", minAge: 3 },
  { id: "sur_cooperativa", kind: "surrogate", title: "Cooperativa di allevatori", desc: "La cooperativa del paese vuole rinnovare la razza.", pay: [2500, 4000], hours: 36, fatigue: 14, sex: "F", minAge: 3 },
  { id: "sur_record", kind: "surrogate", title: "Linea di sangue da record", desc: "Un allevatore ossessionato dai record vuole il sangue della tua cavalla.", pay: [8000, 13000], hours: 44, fatigue: 20, sex: "F", minAge: 4, minOverall: 64 },
  // ---- contratti sulla prossima corsa ----
  C("sponsor_podio", "Sponsor: podio", "Un pastificio sponsorizza il tuo cavallo se arriva nei primi 3 alla prossima corsa.", [3000, 5500], { top: 3 }),
  C("sponsor_vittoria", "Sponsor: vittoria", "Una banca paga una fortuna se vinci la prossima corsa.", [6000, 11000], { win: true }),
  C("sponsor_arrivo", "Sponsor: arrivare al traguardo", "Un'assicurazione paga se il cavallo finisce la prossima corsa sano.", [900, 1600], { finish: true }),
  C("sponsor_top5", "Sponsor: primi cinque", "Una marca di biada paga se arrivi nei primi 5.", [1800, 3200], { top: 5 }),
  C("sponsor_maglia", "Maglia del caseificio", "Il fantino corre con lo stemma di un caseificio. Paga se arrivi nei primi 4.", [2200, 3800], { top: 4 }),
  C("scommessa_vip", "Scommessa di un VIP", "Un calciatore ha scommesso sul tuo cavallo: se vinci, ti regala una parte.", [5000, 9000], { win: true }),
  C("bonus_rimonta", "Promessa al pubblico", "Il sindaco ti premia se arrivi nei primi 2 davanti ai tuoi compaesani.", [3500, 6000], { top: 2 }),
  C("perdere_apposta", "Perdere apposta", "Un losco individuo paga se arrivi dopo il 6° posto. Se ti scoprono, guai seri.", [5000, 9000], { worse: 6 }, { scandal: 0.18, penalty: 12000, rep: -12, shady: true }),
  C("frenare", "Tirare le redini", "Ti pagano se il cavallo NON arriva nei primi 3. È truccare una corsa.", [3000, 6000], { worse: 3 }, { scandal: 0.15, penalty: 9000, rep: -10, shady: true }),
  C("combine_grossa", "La combine", "Un'organizzazione chiede di arrivare ultimo. Pagano moltissimo, ma è pericoloso.", [9000, 15000], { worse: 8 }, { scandal: 0.25, penalty: 20000, rep: -20, shady: true }),
  // ---- compravendita ----
  { id: "buy_collezionista", kind: "buyout", title: "Un collezionista vuole comprarlo", desc: "Un collezionista eccentrico ti offre molto più del valore di mercato.", pay: [130, 170] },
  { id: "buy_sceicco", kind: "buyout", title: "Offerta dallo sceicco", desc: "Lo sceicco vuole il tuo cavallo per la sua scuderia a Dubai.", pay: [150, 210], minOverall: 60 },
  { id: "buy_maneggio", kind: "buyout", title: "Il maneggio cerca un cavallo", desc: "Il maneggio del paese offre un buon prezzo per un cavallo tranquillo.", pay: [105, 130] },
  { id: "buy_rivale", kind: "buyout", title: "Il rivale vuole il tuo cavallo", desc: "Una scuderia rivale vuole toglierti il tuo cavallo di torno.", pay: [125, 160], minOverall: 50 },
  { id: "buy_film", kind: "buyout", title: "Una casa di produzione", desc: "Vogliono comprarlo per una saga cinematografica.", pay: [120, 150] },
  // ---- finanza ----
  { id: "prestito_banca", kind: "loan", title: "Prestito della banca", desc: "La banca ti presta soldi subito; fra 3 giorni restituisci il 20% in più.", pay: [8000, 15000], repay: 1.2, hours: 72 },
  { id: "prestito_usuraio", kind: "loan", title: "Lo strozzino", desc: "Soldi subito, niente domande. Fra 2 giorni restituisci il 50% in più.", pay: [10000, 20000], repay: 1.5, hours: 48, shady: true },
  { id: "prestito_nonna", kind: "loan", title: "La nonna", desc: "La nonna ti presta qualcosa. Fra 4 giorni le ridai solo il 5% in più (e un pranzo).", pay: [3000, 6000], repay: 1.05, hours: 96 },
  // ---- avventure strane ----
  J("fantasma", "Il castello infestato", "Un castello vuole un cavallo per la notte di Halloween. Urla e catene comprese.", [1800, 3000], 12, 6, { stims: { urla: 0.35, luci: 0.2 } }),
  J("tv_quiz", "Quiz televisivo", "Un quiz TV vuole un cavallo che 'conta' con lo zoccolo.", [2000, 3500], 6, 3, { stims: { luci: 0.15, folla: -0.15 }, gains: { smarts: 0.3 } }),
  J("talent", "Talent show", "Un talent show cerca un cavallo che balla. Giuria severissima.", [2500, 4200], 8, 8, { stims: { folla: -0.2, luci: 0.15 }, gains: { agility: 0.4 } }),
  J("caccia_tesoro", "Caccia al tesoro", "Un'agenzia organizza una caccia al tesoro a cavallo per manager.", [1600, 2700], 10, 14, { gains: { focus: 0.3 } }),
  J("matrimonio_gangster", "Il matrimonio del boss", "Un tizio con molti anelli vuole un cavallo bianco per il matrimonio della figlia. Non si dice di no.", [4000, 7000], 8, 6, { stims: { botti: 0.3 }, shady: true, rep: -3 }),
  J("trasporto_misterioso", "Il carico misterioso", "Trasportare di notte delle casse attraverso i boschi. Non fare domande.", [4500, 8000], 10, 18, { shady: true, rep: -6, risk: 0.02 }),
  J("gara_clandestina", "Corsa clandestina", "Una corsa clandestina all'alba sulla statale. Illegale e pericolosa.", [5000, 9000], 6, 30, { shady: true, rep: -8, risk: 0.06, stims: { contatto: 0.2, botti: 0.15 }, gains: { grit: 0.6 } }),
  J("spia", "Spionaggio industriale", "Infiltrarsi come cavallo d'allenamento nella scuderia di un rivale.", [3000, 5200], 24, 14, { shady: true, rep: -4 }),
  J("ritiro_spirituale", "Ritiro spirituale", "Un monastero di montagna ospita il cavallo per una settimana di silenzio.", [300, 700], 48, -40, { gains: { calm: 1.2, focus: 0.8 }, morale: 6 }),
  J("transumanza", "Transumanza", "Accompagnare le pecore in montagna per tre giorni con i pastori abruzzesi.", [1200, 2100], 60, 26, { gains: { stamina: 0.8, calm: 0.4 }, morale: 4 }),
  J("guida_cieco", "Cavallo guida", "Un'associazione sperimenta i cavalli guida per non vedenti.", [600, 1100], 12, 4, { gains: { focus: 0.8, calm: 0.5 }, rep: 5 }),
  J("sagra", "Sagra della porchetta", "Trainare il carretto della sagra. Fisarmoniche e mortaretti.", [700, 1200], 8, 10, { stims: { botti: 0.2, folla: -0.2 }, morale: 3 }),
  C("sponsor_record", "Sponsor: miglior tempo", "Un'azienda di orologi paga se vinci e lo fai in grande stile.", [7000, 12000], { win: true }, { rep: 3 }),
  J("gemellaggio", "Gemellaggio con l'Irlanda", "Viaggio in Irlanda per un gemellaggio tra ippodromi. Pioggia garantita.", [2400, 4000], 48, 16, { stims: { pioggia: -0.35, fango: -0.25 }, gains: { stamina: 0.5 } }),
];

export const OFFER_COUNT = OFFERS.length;

export function offerById(id: string) {
  return OFFERS.find((o) => o.id === id);
}

export interface OfferInstance {
  id: string;
  tpl: string;
  pay: number;
  expires: number;
  horseId?: string; // per le offerte di acquisto (buyout): cavallo specifico
}

/** Genera la bacheca di un giocatore per una finestra di 6 ore. */
export function rollBoard(rng: Rng, reputation: number, n = 9): { tpl: OfferTpl; pay: number }[] {
  const out: { tpl: OfferTpl; pay: number }[] = [];
  const used = new Set<string>();
  for (let tries = 0; out.length < n && tries < 200; tries++) {
    const t = rng.weighted(OFFERS, (o) => {
      let w = o.kind === "job" ? 1 : o.kind === "contract" ? 1.1 : o.kind === "stud" || o.kind === "surrogate" ? 1.0 : o.kind === "buyout" ? 0.8 : 0.5;
      if (o.shady) w *= reputation < 30 ? 1.8 : reputation > 70 ? 0.4 : 1;
      if (o.rep && o.rep > 4) w *= reputation > 60 ? 1.5 : 0.7;
      return w;
    });
    if (used.has(t.id)) continue;
    used.add(t.id);
    const pay = Math.round(rng.range(t.pay[0], t.pay[1]) / 50) * 50;
    out.push({ tpl: t, pay });
  }
  return out;
}
