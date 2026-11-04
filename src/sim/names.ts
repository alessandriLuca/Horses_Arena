import type { Rng } from "./rng";

const FIRST = [
  "Fulmine", "Tempesta", "Zefiro", "Saetta", "Brezza", "Uragano", "Lampo", "Tuono", "Cometa", "Stella",
  "Principe", "Baronessa", "Duca", "Contessa", "Marchese", "Regina", "Capitano", "Generale", "Monsignore", "Dottore",
  "Ombra", "Luna", "Sole", "Aurora", "Notte", "Alba", "Nebbia", "Bufera", "Scintilla", "Vortice",
  "Ribelle", "Furia", "Sogno", "Destino", "Mistero", "Fantasma", "Miraggio", "Leggenda", "Eco", "Orgoglio",
  "Zio", "Nonno", "Compare", "Cugino", "Signor", "Madama", "Don", "Donna", "Fra", "Mastro",
  "Polpetta", "Cannolo", "Babà", "Tiramisù", "Pandoro", "Arancino", "Grissino", "Gnocco", "Tortellino", "Sfogliatella",
  "Ferro", "Bronzo", "Rame", "Oro", "Argento", "Cobalto", "Rubino", "Smeraldo", "Zaffiro", "Ossidiana",
  "Vento", "Fuoco", "Mare", "Fiume", "Torrente", "Vulcano", "Ghiacciaio", "Deserto", "Bosco", "Rupe",
];
const SECOND = [
  "di Sorrento", "del Nord", "di Fuoco", "Nero", "Bianco", "d'Argento", "d'Oro", "di Mezzanotte", "del Deserto", "di Maremma",
  "Selvaggio", "Gentile", "Furioso", "Impavido", "Elegante", "Testardo", "Galante", "Ruggente", "Sfrenato", "Silenzioso",
  "del Vesuvio", "della Laguna", "delle Langhe", "di Capri", "dell'Etna", "del Gargano", "di Brera", "dei Navigli", "di Trastevere", "del Chianti",
  "Primo", "Secondo", "Terzo", "il Grande", "il Breve", "il Magnifico", "lo Sfacciato", "il Saggio", "il Pazzo", "il Fortunato",
  "Express", "Turbo", "Supremo", "Royale", "Deluxe", "Jr.", "Imperiale", "Celeste", "Infernale", "Cosmico",
  "della Brughiera", "della Valle", "del Faro", "delle Saline", "del Mulino", "della Torre", "del Borgo", "del Porto", "dei Colli", "del Lago",
];
const SOLO = [
  "Bislacco", "Pastrocchio", "Zuzzurellone", "Scaramacai", "Ciuffettino", "Tarallo", "Mortadella", "Baccalà", "Bergamotto", "Scamorza",
  "Cicerone", "Garibaldi", "Caravaggio", "Petrarca", "Masaniello", "Pulcinella", "Arlecchino", "Brighella", "Pantalone", "Balanzone",
  "Bufalo Bill", "Ronzinante", "Furia Cieca", "Mille Lire", "Ultimo Treno", "Ritorno di Fiamma", "Colpo di Testa", "Gran Rifiuto", "Tutto o Niente", "Fino in Fondo",
  "Mai Domo", "Sempre Avanti", "Senza Freni", "Chi Va Piano", "Mezzo Matto", "Quasi Primo", "Fiato Lungo", "Piede Svelto", "Coda Lunga", "Muso Duro",
  "Pasta e Fagioli", "Lasagna Volante", "Zio Peppino Express", "Nonno Turbo", "Ma Che Ne So", "Boh Forse Domani", "Cavallo Pazzo Ma Simpatico", "Pecora Travestita",
  "Il Signor Zoccoletti", "Frittata di Cipolle", "Ragù della Domenica", "Mozzarella Furiosa", "Ciabatta Rapida", "Gnocco Fritto Turbo", "Cotoletta al Galoppo",
  "Biscotto Inzuppato", "Dottor Criniera", "Avvocato del Diavolo", "Ultimo Ma Contento", "Non Ci Credo Nemmeno Io", "Speriamo Bene", "Tanto Vince Lui",
  "Mutanda Volante", "Ciccio Bello", "Peto di Velluto", "Zampa di Velluto Usata", "Ascensore Rotto", "Wi-Fi Libero", "Lunedì Mattina", "Cugino di Nessuno",
];

export function horseName(rng: Rng): string {
  const r = rng.next();
  if (r < 0.4) return rng.pick(SOLO);
  return `${rng.pick(FIRST)} ${rng.pick(SECOND)}`;
}

const BOT_STABLES = [
  "Scuderia Montefeltro", "Allevamento Borgia", "Tenuta dei Gonzaga", "Scuderia La Fenice", "Razza del Sannio",
  "Scuderia Tre Ferri", "Allevamento Val d'Orcia", "Scuderia Bucintoro", "Tenuta San Giorgio", "Scuderia Lupa Nera",
  "Razza dell'Aspromonte", "Scuderia Gattopardo", "Allevamento Le Cascine", "Scuderia Volpe Rossa", "Tenuta Ca' Foscari",
];
export function botStableNames(): string[] {
  return BOT_STABLES.slice();
}

const JOCKEY_FIRST = ["Gigi", "Tonino", "Mimmo", "Sandro", "Rocco", "Nando", "Pino", "Ugo", "Rita", "Lella", "Sara", "Giada", "Franco", "Elio", "Marta", "Bruno", "Carla", "Dario", "Ivo", "Nina"];
const JOCKEY_LAST = ["Ferretti", "Scuderi", "Galoppi", "Bracco", "Mancini", "Russo", "Colombo", "Esposito", "Fontana", "Greco", "Lombardi", "Moretti", "Barbieri", "Rinaldi", "Caruso", "Ferrara", "Testa", "Gallo", "Conti", "De Luca"];
export function jockeyName(rng: Rng): string {
  return `${rng.pick(JOCKEY_FIRST)} ${rng.pick(JOCKEY_LAST)}`;
}
