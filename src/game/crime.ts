// Il Mercato Nero: si paga gente losca per sabotare i cavalli altrui (prima o DURANTE la corsa)
// o per dopare i propri. Tutto può andare storto: il sicario può colpire il cavallo sbagliato,
// farsi beccare dalla sorveglianza, e il doping può costare la squalifica.
export type CrimeWhen = "prima" | "gara" | "doping";

export interface CrimeService {
  id: string;
  when: CrimeWhen;
  name: string;
  icon: string;
  desc: string;
  cost: number;
  caught: number; // probabilità di essere scoperti
  self?: boolean; // si applica ai propri cavalli
}

export const CRIMES: CrimeService[] = [
  // prima della corsa (sul cavallo bersaglio, valgono per la sua prossima corsa)
  { id: "sonnifero", when: "prima", name: "Sonnifero nella biada", icon: "💤", desc: "Il bersaglio parte addormentato e corre più lento.", cost: 2500, caught: 0.15 },
  { id: "lassativo", when: "prima", name: "Lassativo", icon: "🚽", desc: "A metà corsa avrà un bisogno impellente. Si fermerà.", cost: 2000, caught: 0.12 },
  { id: "chiodo", when: "prima", name: "Chiodo nel ferro", icon: "🔩", desc: "Corre zoppicando e rischia di infortunarsi.", cost: 3500, caught: 0.2 },
  { id: "fantino_corrotto", when: "prima", name: "Fantino corrotto", icon: "💰", desc: "Il fantino parte a tutta e lo brucia prima del finale.", cost: 5000, caught: 0.22 },
  { id: "incubi", when: "prima", name: "Notte da incubo", icon: "👻", desc: "Petardi e lampi sotto la scuderia tutta la notte: gli metti paura di botti e folla (per sempre, finché non la supera).", cost: 3000, caught: 0.15 },
  { id: "biada_avariata", when: "prima", name: "Biada avariata", icon: "🤢", desc: "Mal di pancia: tanta fatica e salute giù.", cost: 2500, caught: 0.15 },
  { id: "killer", when: "prima", name: "Il killer", icon: "☠️", desc: "Un professionista entra di notte in scuderia per far fuori il cavallo. Non è detto che ci riesca, e se lo beccano sono guai grossi. Se il cavallo è assicurato, il proprietario viene rimborsato.", cost: 30000, caught: 0.4 },
  // durante la corsa: un sicario si presenta a bordo pista
  { id: "buccia", when: "gara", name: "Buccia di banana", icon: "🍌", desc: "Il sicario lancia una buccia davanti al bersaglio. Chi ci passa sopra scivola: magari proprio lui.", cost: 3000, caught: 0.18 },
  { id: "olio", when: "gara", name: "Chiazza d'olio", icon: "🛢️", desc: "Una chiazza d'olio in pista davanti al bersaglio. Scivolano tutti quelli che ci passano.", cost: 4500, caught: 0.2 },
  { id: "corda", when: "gara", name: "Corda tesa", icon: "🪢", desc: "Per un attimo una corda attraversa la pista. Chi non salta, inciampa.", cost: 6000, caught: 0.3 },
  { id: "invasore", when: "gara", name: "Finto tifoso invasore", icon: "🏃", desc: "Un 'tifoso' invade la pista correndo davanti al bersaglio.", cost: 4000, caught: 0.35 },
  { id: "petardo", when: "gara", name: "Petardo", icon: "🧨", desc: "Un petardo a bordo pista: spaventa tutti quelli vicini, a seconda delle loro paure.", cost: 3500, caught: 0.25 },
  { id: "laser", when: "gara", name: "Puntatore laser", icon: "🔴", desc: "Un laser negli occhi del bersaglio per qualche secondo.", cost: 2500, caught: 0.15 },
  { id: "drone", when: "gara", name: "Drone molesto", icon: "🛸", desc: "Un drone ronza sopra il bersaglio e chi gli sta intorno.", cost: 5500, caught: 0.28 },
  { id: "fischietto", when: "gara", name: "Fischietto a ultrasuoni", icon: "📯", desc: "Un fischio che sentono solo i cavalli. Il bersaglio impazzisce.", cost: 2000, caught: 0.1 },
  // doping (sui propri cavalli)
  { id: "stimolante", when: "doping", name: "Stimolante", icon: "💉", desc: "Più velocità e resistenza per la prossima corsa. Rischio antidoping.", cost: 1500, caught: 0, self: true },
  { id: "epo", when: "doping", name: "EPO", icon: "🩸", desc: "Resistenza molto più alta. Se ti beccano è squalifica e multa salata.", cost: 6000, caught: 0, self: true },
  { id: "calmante", when: "doping", name: "Calmante", icon: "🌙", desc: "Il cavallo non ha paura di niente per la prossima corsa.", cost: 1200, caught: 0, self: true },
];

export function crimeById(id: string) {
  return CRIMES.find((c) => c.id === id);
}

/** Sorveglianza: costo al giorno per livello (protegge tutti i cavalli della scuderia). */
export const SECURITY = [
  { level: 0, name: "Nessuna", perDay: 0, intercept: 0 },
  { level: 1, name: "Guardiano notturno", perDay: 250, intercept: 0.3 },
  { level: 2, name: "Vigilanza privata", perDay: 650, intercept: 0.55 },
  { level: 3, name: "Servizio d'élite con cani", perDay: 1400, intercept: 0.75 },
];
