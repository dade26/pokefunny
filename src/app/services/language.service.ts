import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

const en = {
  darkMode: 'Enable night mode', lightMode: 'Enable day mode',
  playMonotype: 'Play Ten Pick Monotype', monotypeTagline: 'One type. Six Pokemon.',
  random: 'Random', playerType: 'Type for {name}',
  insufficientPool: 'Not enough eligible Pokemon families for these filters. Create a draft with more generations or a different type.',
  mega: 'Mega', selectGeneration: 'Select at least one generation.',
  shiny: 'Shiny',
  home: 'Home', language: 'Language', chooseGame: 'Choose a Pokefunny game',
  tenPickSection: 'Ten Pick games', tenPickHubTagline: 'Draft modes for quick team building.',
  pokeGachaTagline: 'Open capsules and discover Pokemon.', playPokeGacha: 'Play PokeGacha',
  pokeGachaPending: 'Work in. Progress.',
  alreadyRegistered: 'Already registered in your Pokedex',
  gachaReady: 'Press the machine to draw three Poke Balls.',
  gachaSpinning: 'Spinning...',
  gachaPull: 'Press machine',
  gachaChoosePokemon: 'Choose a Pokemon',
  gachaRevealPokemon: 'Reveal Pokemon {count}',
  gachaOpenPc: 'Open PC',
  gachaOpenPokedex: 'Open Pokedex',
  gachaPcPokemon: 'PC Pokemon',
  gachaPokedex: 'Pokedex',
  gachaClose: 'Close',
  gachaBoxes: 'Boxes',
  gachaBox: 'Box {count}',
  gachaSlot: 'Slot {count}',
  gachaNickname: 'Nickname',
  gachaMove: 'Move',
  gachaRelease: 'Release',
  gachaSelectPcPokemon: 'Select a Pokemon from the PC.',
  gachaGeneration: 'Generation {count}',
  gachaRemaining: '{remaining} left out of {total}',
  gachaUnknownPokemon: 'Unknown Pokemon',
  gachaPreparing: 'The machine is preparing the capsules...',
  gachaRevealAll: 'Press each Poke Ball to reveal its Pokemon.',
  gachaLoadError: 'Could not load this draw. Try again.',
  gachaChooseOne: 'Choose one of the three. That Pokemon will go to the PC.',
  gachaKeepRevealing: 'Keep revealing the Poke Balls.',
  gachaRevealFirst: 'Reveal all three Poke Balls first.',
  gachaPcFull: 'The PC is full. Release or move a Pokemon.',
  gachaSavedToPc: '{name} was saved to the PC.',
  gachaChoosePcSlot: 'Choose a PC slot to move it.',
  gachaReleased: '{name} was released. It stays registered in the Pokedex.',
  gachaSaveError: 'Could not save in this browser.',
  tagline: 'Ten encounters. One choice.', play: 'Play Ten Pick', playFesta: 'Play Ten Pick Festa', myDrafts: 'My drafts',
  newDraft: 'New draft', noDrafts: 'No saved drafts', completed: 'Completed', inProgress: 'In progress',
  pokemonPicked: 'Pokemon picked', deleteQuestion: 'Delete this draft?', delete: 'Delete', cancel: 'Cancel',
  viewTeams: 'View teams', continue: 'Continue', deleteDraft: 'Delete draft', deleteDraftFor: 'Delete draft for {name}',
  trainerName: 'Trainer name', add: 'Add', remove: 'Remove', removePlayer: 'Remove {name}',
  teamSize: 'Pokemon per team', start: 'Start draft', draftComplete: 'Draft complete', finalTeams: 'Final teams',
  player: 'Player', loading: 'Finding Pokemon...', turnError: 'Could not prepare this turn. Please try again.',
  retry: 'Retry', turnOf: "{name}'s turn", lastEncounter: 'Final encounter', lastChoice: 'This is your last choice',
  pick: 'Pick', skip: 'Skip', remaining: '{count} encounters remaining', teams: 'Teams',
  draftOrder: 'Draft order', round: 'Round {count}', pickedBy: '{name} picked', encounter: 'Encounter',
  picked: 'Picked', skipped: 'Skipped', undiscovered: 'Undiscovered', finalTeamsButton: 'View final teams',
  nextTurn: 'Next turn', preparePaste: 'Prepare Pokepaste', preparePasteFor: 'Prepare Pokepaste for {name}',
  abilitiesLoading: 'Looking up abilities...', viewPaste: 'View Pokepaste', teamOf: "{name}'s team",
  closePaste: 'Close Pokepaste', closePasteFor: 'Close Pokepaste for {name}', copyTeam: 'Copy team',
  copied: 'Copied', copy: 'Copy', teamAbilitiesLoading: 'Looking up abilities for {name}',
  pasteError: 'Could not prepare the team. Please try again.',
  copyError: 'Could not copy. You can select the team text instead.',
  unknownForm: 'The form of {name} is not recognized by Showdown.',
  unknownAbility: 'Could not find the ability for {name}.',
} as const;

export type TranslationKey = keyof typeof en;
export type Language = 'en' | 'es';

const es: Record<TranslationKey, string> = {
  darkMode: 'Activar modo nocturno', lightMode: 'Activar modo diurno',
  playMonotype: 'Jugar Ten Pick Monotype', monotypeTagline: 'Un tipo. Seis Pokemon.',
  random: 'Aleatorio', playerType: 'Tipo de {name}',
  insufficientPool: 'No hay suficientes familias de Pokemon para estos filtros. Crea un draft con m\u00e1s generaciones u otro tipo.',
  mega: 'Mega', selectGeneration: 'Selecciona al menos una generaci\u00f3n.',
  shiny: 'Variocolor',
  home: 'Inicio', language: 'Idioma', chooseGame: 'Elige un juego de Pokefunny',
  tenPickSection: 'Juegos Ten Pick', tenPickHubTagline: 'Modos de draft para montar equipos r\u00e1pido.',
  pokeGachaTagline: 'Abre capsulas y descubre Pokemon.', playPokeGacha: 'Jugar PokeGacha',
  pokeGachaPending: 'Work in. Progress.',
  alreadyRegistered: 'Ya lo tienes registrado',
  gachaReady: 'Pulsa la maquina para sacar tres Poke Balls.',
  gachaSpinning: 'Girando...',
  gachaPull: 'Pulsar maquina',
  gachaChoosePokemon: 'Elige un Pokemon',
  gachaRevealPokemon: 'Revelar Pokemon {count}',
  gachaOpenPc: 'Abrir PC',
  gachaOpenPokedex: 'Abrir Pokedex',
  gachaPcPokemon: 'PC Pokemon',
  gachaPokedex: 'Pokedex',
  gachaClose: 'Cerrar',
  gachaBoxes: 'Cajas',
  gachaBox: 'Caja {count}',
  gachaSlot: 'Casilla {count}',
  gachaNickname: 'Mote',
  gachaMove: 'Mover',
  gachaRelease: 'Liberar',
  gachaSelectPcPokemon: 'Selecciona un Pokemon del PC.',
  gachaGeneration: 'Generacion {count}',
  gachaRemaining: 'Faltan {remaining} de {total}',
  gachaUnknownPokemon: 'Pokemon desconocido',
  gachaPreparing: 'La maquina esta preparando las capsulas...',
  gachaRevealAll: 'Pulsa cada Poke Ball para revelar sus Pokemon.',
  gachaLoadError: 'No se pudo cargar la tirada. Prueba otra vez.',
  gachaChooseOne: 'Elige uno de los tres. Ese Pokemon ira al PC.',
  gachaKeepRevealing: 'Sigue revelando las Poke Balls.',
  gachaRevealFirst: 'Primero revela las tres Poke Balls.',
  gachaPcFull: 'El PC esta lleno. Libera o mueve algun Pokemon.',
  gachaSavedToPc: '{name} se ha guardado en el PC.',
  gachaChoosePcSlot: 'Elige una casilla del PC para moverlo.',
  gachaReleased: '{name} ha sido liberado. Sigue registrado en la Pokedex.',
  gachaSaveError: 'No se ha podido guardar en este navegador.',
  tagline: 'Diez encuentros. Una elecci\u00f3n.', play: 'Jugar Ten Pick', playFesta: 'Jugar Ten Pick Festa', myDrafts: 'Mis drafts',
  newDraft: 'Nuevo draft', noDrafts: 'No hay drafts guardados', completed: 'Terminado', inProgress: 'En curso',
  pokemonPicked: 'Pokemon elegidos', deleteQuestion: '\u00bfBorrar este draft?', delete: 'Borrar', cancel: 'Cancelar',
  viewTeams: 'Ver equipos', continue: 'Continuar', deleteDraft: 'Borrar draft', deleteDraftFor: 'Borrar draft de {name}',
  trainerName: 'Nombre del entrenador', add: 'A\u00f1adir', remove: 'Quitar', removePlayer: 'Quitar a {name}',
  teamSize: 'Pokemon por equipo', start: 'Empezar draft', draftComplete: 'Draft terminado', finalTeams: 'Los equipos finales',
  player: 'Jugador', loading: 'Buscando Pokemon...', turnError: 'No se pudo preparar el turno. Intenta de nuevo.',
  retry: 'Reintentar', turnOf: 'Turno de {name}', lastEncounter: '\u00daltimo encuentro', lastChoice: 'Es tu \u00faltima opci\u00f3n',
  pick: 'Elegir', skip: 'Pasar', remaining: '{count} encuentros restantes', teams: 'Equipos',
  draftOrder: 'Orden de turno', round: 'Ronda {count}', pickedBy: '{name} ha elegido', encounter: 'Encuentro',
  picked: 'Elegido', skipped: 'Descartado', undiscovered: 'Sin descubrir', finalTeamsButton: 'Ver equipos finales',
  nextTurn: 'Siguiente turno', preparePaste: 'Preparar Pokepaste', preparePasteFor: 'Preparar Pokepaste de {name}',
  abilitiesLoading: 'Consultando habilidades...', viewPaste: 'Ver Pokepaste', teamOf: 'Equipo de {name}',
  closePaste: 'Cerrar Pokepaste', closePasteFor: 'Cerrar Pokepaste de {name}', copyTeam: 'Copiar equipo',
  copied: 'Copiado', copy: 'Copiar', teamAbilitiesLoading: 'Consultando habilidades del equipo de {name}',
  pasteError: 'No se pudo preparar el equipo. Intenta de nuevo.',
  copyError: 'No se pudo copiar. Puedes seleccionar el texto del equipo.',
  unknownForm: 'No se reconoce la forma de {name} en Showdown.',
  unknownAbility: 'No se pudo obtener la habilidad de {name}.',
};

const spanishTypes: Record<string, string> = {
  normal: 'Normal', fire: 'Fuego', water: 'Agua', grass: 'Planta', electric: 'El\u00e9ctrico',
  ice: 'Hielo', fighting: 'Lucha', poison: 'Veneno', ground: 'Tierra', flying: 'Volador',
  psychic: 'Ps\u00edquico', bug: 'Bicho', rock: 'Roca', ghost: 'Fantasma', dragon: 'Drag\u00f3n',
  dark: 'Siniestro', steel: 'Acero', fairy: 'Hada',
};

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly document = inject(DOCUMENT);
  readonly language = signal<Language>(this.readLanguage());

  constructor() {
    this.document.documentElement.lang = this.language();
  }

  setLanguage(language: Language): void {
    this.language.set(language);
    this.document.documentElement.lang = language;
    try { localStorage.setItem('pokefunny.language', language); } catch { /* Keep the session choice when storage is unavailable. */ }
  }

  t(key: TranslationKey, values: Record<string, string | number> = {}): string {
    const message = this.language() === 'es' ? es[key] : en[key];
    return message.replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match));
  }

  typeName(type: string): string {
    return this.language() === 'es' ? spanishTypes[type.toLowerCase()] ?? type : type;
  }

  date(value: string): string {
    return new Intl.DateTimeFormat(this.language() === 'en' ? 'en-GB' : 'es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(value));
  }

  private readLanguage(): Language {
    try { return localStorage.getItem('pokefunny.language') === 'es' ? 'es' : 'en'; }
    catch { return 'en'; }
  }
}
