import { Component, ElementRef, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Pokemon } from '../../models/pokemon.model';
import { LanguageService } from '../../services/language.service';
import { PokemonCatalogEntry, PokemonService } from '../../services/pokemon.service';
import { PokemonPoolService } from '../../services/pokemon-pool.service';

type DexStatus = 'seen' | 'owned';

interface GachaOption {
  pokemon: Pokemon;
  revealed: boolean;
}

interface PcPokemon {
  uid: string;
  pokemon: Pokemon;
  nickname: string;
  box: number;
  slot: number;
}

interface GachaSave {
  pc: PcPokemon[];
  pokedex: Record<string, DexStatus>;
}

const storageKey = 'pokefunny.pokeGacha.v1';
const boxSize = 64;
const boxCount = 4;

@Component({
  selector: 'app-poke-gacha',
  imports: [FormsModule],
  templateUrl: './poke-gacha.html',
  styleUrl: './poke-gacha.css',
})
export class PokeGacha implements OnInit {
  readonly i18n = inject(LanguageService);
  private readonly pokemonPool = inject(PokemonPoolService);
  private readonly pokemonService = inject(PokemonService);

  readonly options = signal<GachaOption[]>([]);
  readonly pc = signal<PcPokemon[]>([]);
  readonly pokedex = signal<Record<string, DexStatus>>({});
  readonly catalog = signal<PokemonCatalogEntry[]>([]);
  readonly loading = signal(false);
  private readonly drawDialog = viewChild<ElementRef<HTMLDialogElement>>('drawDialog');
  readonly pcOpen = signal(false);
  readonly pokedexOpen = signal(false);
  readonly currentBox = signal(0);
  readonly selectedPcUid = signal<string | null>(null);
  readonly movingUid = signal<string | null>(null);
  readonly message = signal('Pulsa la maquina para sacar tres Poke Balls.');

  readonly boxes = Array.from({ length: boxCount }, (_, index) => index);
  readonly slots = Array.from({ length: boxSize }, (_, index) => index);
  readonly generations = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  readonly generationProgress = computed(() => {
    const pokedex = this.pokedex();
    return this.generations.map((generation) => {
      const entries = this.generationEntries(generation);
      const total = entries.length;
      const owned = entries.filter((pokemon) => pokedex[pokemon.id] === 'owned').length;
      return {
        generation,
        entries,
        remaining: total - owned,
        total,
        percent: total ? Math.round(owned / total * 1000) / 10 : 0,
      };
    });
  });
  readonly revealedCount = computed(() => this.options().filter((option) => option.revealed).length);
  readonly canChoose = computed(() => this.options().length === 3 && this.revealedCount() === 3);
  readonly selectedPcPokemon = computed(() => {
    const uid = this.selectedPcUid();
    return uid ? this.pc().find((pokemon) => pokemon.uid === uid) ?? null : null;
  });

  constructor() {
    effect(() => {
      const dialog = this.drawDialog()?.nativeElement;
      if (dialog && !dialog.open) dialog.showModal();
    });
    effect((onCleanup) => {
      if (!this.pcOpen() && !this.pokedexOpen() && !this.options().length) return;
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      onCleanup(() => {
        document.body.style.overflow = previousOverflow;
      });
    });
  }

  async ngOnInit(): Promise<void> {
    this.loadSave();
    this.catalog.set(await this.pokemonService.getPokemonCatalog());
  }

  async pull(): Promise<void> {
    if (this.loading() || this.options().length) return;
    this.loading.set(true);
    this.selectedPcUid.set(null);
    this.movingUid.set(null);
    this.options.set([]);
    this.message.set('La maquina esta preparando las capsulas...');
    try {
      const options = await Promise.all((await this.getDrawableOptions()).map(async (pokemon) => ({
        ...pokemon,
        baseStatsTotal: await this.pokemonService.getBaseStatsTotal(pokemon.id),
      })));
      this.options.set(options.map((pokemon) => ({ pokemon, revealed: false })));
      this.message.set('Pulsa cada Poke Ball para revelar sus Pokemon.');
    } catch {
      this.message.set('No se pudo cargar la tirada. Prueba otra vez.');
    } finally {
      this.loading.set(false);
    }
  }

  reveal(index: number): void {
    const options = this.options();
    const option = options[index];
    if (!option || option.revealed) return;
    this.options.set(options.map((current, currentIndex) =>
      currentIndex === index ? { ...current, revealed: true } : current,
    ));
    this.markPokedex(option.pokemon.id, 'seen');
    this.message.set(this.canChoose()
      ? 'Elige uno de los tres. Ese Pokemon ira al PC.'
      : 'Sigue revelando las Poke Balls.');
  }

  choose(option: GachaOption): void {
    if (!this.canChoose()) {
      this.message.set('Primero revela las tres Poke Balls.');
      return;
    }
    const slot = this.nextFreeSlot();
    if (!slot) {
      this.message.set('El PC esta lleno. Libera o mueve algun Pokemon.');
      return;
    }
    const pcPokemon: PcPokemon = {
      uid: `${option.pokemon.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      pokemon: option.pokemon,
      nickname: '',
      box: slot.box,
      slot: slot.slot,
    };
    this.pc.update((pc) => [...pc, pcPokemon]);
    this.markPokedex(option.pokemon.id, 'owned');
    this.options.set([]);
    this.message.set(`${pcPokemon.nickname || pcPokemon.pokemon.name} se ha guardado en el PC.`);
    this.save();
  }

  openPc(): void {
    this.pcOpen.set(true);
    this.pokedexOpen.set(false);
  }

  openPokedex(): void {
    this.pokedexOpen.set(true);
    this.pcOpen.set(false);
  }

  pokemonAt(slot: number, box = this.currentBox()): PcPokemon | undefined {
    return this.pc().find((pokemon) => pokemon.box === box && pokemon.slot === slot);
  }

  selectSlot(slot: number): void {
    const movingUid = this.movingUid();
    if (movingUid) {
      this.moveToSlot(movingUid, this.currentBox(), slot);
      return;
    }
    this.selectedPcUid.set(this.pokemonAt(slot)?.uid ?? null);
  }

  startMove(uid: string): void {
    this.movingUid.set(uid);
    this.message.set('Elige una casilla del PC para moverlo.');
  }

  release(uid: string): void {
    const pokemon = this.pc().find((entry) => entry.uid === uid);
    this.pc.update((pc) => pc.filter((entry) => entry.uid !== uid));
    this.selectedPcUid.set(null);
    this.movingUid.set(null);
    this.save();
    if (pokemon) this.message.set(`${pokemon.nickname || pokemon.pokemon.name} ha sido liberado. Sigue registrado en la Pokedex.`);
  }

  updateNickname(entry: PcPokemon, nickname: string): void {
    this.pc.update((pc) => pc.map((pokemon) =>
      pokemon.uid === entry.uid ? { ...pokemon, nickname } : pokemon,
    ));
    this.save();
  }

  generationEntries(generation: number): PokemonCatalogEntry[] {
    return this.catalog().filter((pokemon) => pokemon.generation === generation && pokemon.id < 10000);
  }

  dexStatus(id: number): DexStatus | 'unknown' {
    return this.pokedex()[id] ?? 'unknown';
  }

  spriteUrl(id: number): string {
    return `images/pokemon/v1/${id}.webp`;
  }

  private moveToSlot(uid: string, box: number, slot: number): void {
    this.pc.update((pc) => {
      const moving = pc.find((entry) => entry.uid === uid);
      const target = pc.find((entry) => entry.box === box && entry.slot === slot);
      if (!moving) return pc;
      return pc.map((entry) => {
        if (entry.uid === uid) return { ...entry, box, slot };
        if (target && entry.uid === target.uid) return { ...entry, box: moving.box, slot: moving.slot };
        return entry;
      });
    });
    this.movingUid.set(null);
    this.save();
  }

  private async getDrawableOptions(): Promise<Pokemon[]> {
    const blocked = new Set<number>();
    for (let attempt = 0; attempt < 5; attempt++) {
      const options = await this.pokemonPool.getRandomOptions(6, [...blocked]);
      const drawable = options.filter((pokemon) => pokemon.sprite || pokemon.artwork);
      if (drawable.length >= 3) return drawable.slice(0, 3);
      options.forEach((pokemon) => blocked.add(pokemon.id));
    }
    return this.pokemonPool.getRandomOptions(3, [...blocked]);
  }

  private nextFreeSlot(): { box: number; slot: number } | null {
    const used = new Set(this.pc().map((pokemon) => `${pokemon.box}:${pokemon.slot}`));
    for (const box of this.boxes) {
      for (const slot of this.slots) {
        if (!used.has(`${box}:${slot}`)) return { box, slot };
      }
    }
    return null;
  }

  private markPokedex(id: number, status: DexStatus): void {
    this.pokedex.update((pokedex) => {
      if (pokedex[id] === 'owned') return pokedex;
      return { ...pokedex, [id]: status };
    });
    this.save();
  }

  private loadSave(): void {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const save = JSON.parse(raw) as GachaSave;
      this.pc.set(Array.isArray(save.pc) ? save.pc : []);
      this.pokedex.set(save.pokedex ?? {});
    } catch {
      this.pc.set([]);
      this.pokedex.set({});
    }
  }

  private save(): void {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ pc: this.pc(), pokedex: this.pokedex() }));
    } catch {
      this.message.set('No se ha podido guardar en este navegador.');
    }
  }
}
