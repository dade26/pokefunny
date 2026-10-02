import { Component, DestroyRef, ElementRef, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Pokemon } from '../../models/pokemon.model';
import { LanguageService, TranslationKey } from '../../services/language.service';
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
  nextDrawAt?: number;
  options?: GachaOption[];
  bonusDraw?: boolean;
  bonusBallPending?: boolean;
}

interface GachaMessage {
  key: TranslationKey;
  values?: Record<string, string | number>;
}

const storageKey = 'pokefunny.pokeGacha.v1';
const boxSize = 64;
const boxCount = 4;
const waitingMessages: TranslationKey[] = [
  'gachaWaitSorry',
  'gachaWaitToldYou',
  'gachaWaitNope',
  'gachaWaitSorryNo',
];

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
  readonly bonusDraw = signal(false);
  readonly bonusBallReady = signal(false);
  readonly bonusBallRolling = signal(false);
  readonly annoyanceOfferOpen = signal(false);
  readonly nextDrawAt = signal(0);
  private readonly now = signal(Date.now());
  readonly waiting = computed(() => this.nextDrawAt() > this.now());
  readonly countdown = computed(() => {
    const seconds = Math.max(0, Math.ceil((this.nextDrawAt() - this.now()) / 1000));
    return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  });
  private readonly drawDialog = viewChild<ElementRef<HTMLDialogElement>>('drawDialog');
  private readonly offerDialog = viewChild<ElementRef<HTMLDialogElement>>('offerDialog');
  readonly pcOpen = signal(false);
  readonly pokedexOpen = signal(false);
  readonly currentBox = signal(0);
  readonly selectedPcUid = signal<string | null>(null);
  readonly movingUid = signal<string | null>(null);
  readonly message = signal<GachaMessage>({ key: 'gachaReady' });
  readonly waitingNotice = signal<GachaMessage | null>(null);
  readonly noticeFading = signal(false);
  readonly machineReady = computed(() => !this.waiting() && !this.loading() && !this.options().length
    && !this.bonusBallRolling() && !this.bonusBallReady() && !this.annoyanceOfferOpen());
  readonly bubbleVisible = computed(() => this.machineReady() || (this.waiting() && !!this.waitingNotice()));
  readonly bubbleText = computed(() => {
    const notice = this.waitingNotice();
    return this.machineReady() || !notice ? this.i18n.t('gachaReady') : this.i18n.t(notice.key, notice.values);
  });
  readonly messageText = computed(() => {
    const message = this.message();
    return this.i18n.t(message.key, message.values);
  });

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
  readonly canChoose = computed(() => this.options().length > 0 && this.revealedCount() === this.options().length);
  readonly selectedPcPokemon = computed(() => {
    const uid = this.selectedPcUid();
    return uid ? this.pc().find((pokemon) => pokemon.uid === uid) ?? null : null;
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    effect((onCleanup) => {
      const notice = this.waitingNotice();
      this.noticeFading.set(false);
      if (!notice) return;
      const fadeTimer = setTimeout(() => this.noticeFading.set(true), 3000);
      const hideTimer = setTimeout(() => this.waitingNotice.set(null), 3350);
      onCleanup(() => {
        clearTimeout(fadeTimer);
        clearTimeout(hideTimer);
      });
    });
    effect(() => {
      const dialog = this.drawDialog()?.nativeElement;
      if (dialog && !dialog.open) dialog.showModal();
    });
    effect(() => {
      const dialog = this.offerDialog()?.nativeElement;
      if (dialog && !dialog.open) dialog.showModal();
    });
    effect((onCleanup) => {
      if (!this.pcOpen() && !this.pokedexOpen() && !this.options().length && !this.annoyanceOfferOpen()) return;
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
    if (this.loading() || this.options().length || this.bonusBallRolling() || this.bonusBallReady() || this.annoyanceOfferOpen()) return;
    this.now.set(Date.now());
    if (this.waiting()) {
      this.handleWaitingPull();
      return;
    }
    const nextHour = new Date(this.now());
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    this.loading.set(true);
    this.bonusDraw.set(false);
    this.selectedPcUid.set(null);
    this.movingUid.set(null);
    this.options.set([]);
    this.setMessage('gachaPreparing');
    try {
      const options = await Promise.all((await this.getDrawableOptions()).map(async (pokemon) => ({
        ...pokemon,
        baseStatsTotal: await this.pokemonService.getBaseStatsTotal(pokemon.id),
      })));
      this.options.set(options.map((pokemon) => ({ pokemon, revealed: false })));
      this.nextDrawAt.set(nextHour.getTime());
      this.setMessage('gachaRevealAll');
      this.save();
    } catch {
      this.setMessage('gachaLoadError');
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
    this.setMessage(this.canChoose() ? (this.bonusDraw() ? 'gachaChooseBonus' : 'gachaChooseOne') : 'gachaKeepRevealing');
  }

  choose(option: GachaOption): void {
    if (!this.canChoose()) {
      this.setMessage('gachaRevealFirst');
      return;
    }
    const slot = this.nextFreeSlot();
    if (!slot) {
      this.setMessage('gachaPcFull');
      return;
    }
    const pcPokemon: PcPokemon = {
      uid: `${option.pokemon.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      pokemon: option.pokemon,
      nickname: option.pokemon.name,
      box: slot.box,
      slot: slot.slot,
    };
    this.pc.update((pc) => [...pc, pcPokemon]);
    this.markPokedex(option.pokemon.id, 'owned');
    this.options.set([]);
    this.bonusDraw.set(false);
    this.setMessage('gachaSavedToPc', { name: pcPokemon.nickname || pcPokemon.pokemon.name });
    this.save();
  }

  declineAnnoyanceOffer(): void {
    if (!this.annoyanceOfferOpen()) return;
    this.annoyanceOfferOpen.set(false);
    this.setRandomWaitingMessage();
  }

  acceptAnnoyanceOffer(): void {
    if (!this.annoyanceOfferOpen()) return;
    this.annoyanceOfferOpen.set(false);
    this.bonusBallReady.set(false);
    this.bonusBallRolling.set(true);
    this.setMessage('gachaBonusRolling');
    this.save();
  }

  finishBonusBallRoll(): void {
    if (!this.bonusBallRolling()) return;
    this.bonusBallRolling.set(false);
    this.bonusBallReady.set(true);
    this.setMessage('gachaBonusReady');
  }

  async openBonusBall(): Promise<void> {
    if (!this.bonusBallReady() || this.loading() || this.options().length) return;
    this.loading.set(true);
    this.bonusBallReady.set(false);
    this.bonusDraw.set(true);
    this.setMessage('gachaBonusPreparing');
    try {
      const [pokemon] = await Promise.all((await this.getDrawableOptions(1)).map(async (option) => ({
        ...option,
        baseStatsTotal: await this.pokemonService.getBaseStatsTotal(option.id),
      })));
      if (!pokemon) throw new Error('No drawable Pokemon');
      this.options.set([{ pokemon, revealed: true }]);
      this.markPokedex(pokemon.id, 'seen');
      this.setMessage('gachaChooseBonus');
    } catch {
      this.bonusDraw.set(false);
      this.bonusBallReady.set(true);
      this.setMessage('gachaLoadError');
      this.save();
    } finally {
      this.loading.set(false);
    }
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
    this.setMessage('gachaChoosePcSlot');
  }

  release(uid: string): void {
    const pokemon = this.pc().find((entry) => entry.uid === uid);
    this.pc.update((pc) => pc.filter((entry) => entry.uid !== uid));
    this.selectedPcUid.set(null);
    this.movingUid.set(null);
    this.save();
    if (pokemon) this.setMessage('gachaReleased', { name: pokemon.nickname || pokemon.pokemon.name });
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

  private handleWaitingPull(): void {
    if (Math.random() < 0.01) {
      this.annoyanceOfferOpen.set(true);
      return;
    }
    this.setRandomWaitingMessage();
  }

  private setRandomWaitingMessage(): void {
    this.setMessage(waitingMessages[Math.floor(Math.random() * waitingMessages.length)]);
    this.noticeFading.set(false);
    this.waitingNotice.set(this.message());
  }

  private async getDrawableOptions(count = 3): Promise<Pokemon[]> {
    const blocked = new Set<number>();
    for (let attempt = 0; attempt < 5; attempt++) {
      const options = await this.pokemonPool.getRandomOptions(Math.max(6, count * 2), [...blocked]);
      const drawable = options.filter((pokemon) => pokemon.sprite || pokemon.artwork);
      if (drawable.length >= count) return drawable.slice(0, count);
      options.forEach((pokemon) => blocked.add(pokemon.id));
    }
    return this.pokemonPool.getRandomOptions(count, [...blocked]);
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

  private setMessage(key: TranslationKey, values?: Record<string, string | number>): void {
    this.message.set({ key, values });
  }

  private loadSave(): void {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const save = JSON.parse(raw) as GachaSave;
      this.pc.set(Array.isArray(save.pc) ? save.pc : []);
      this.pokedex.set(save.pokedex ?? {});
      this.nextDrawAt.set(typeof save.nextDrawAt === 'number' && Number.isFinite(save.nextDrawAt) ? save.nextDrawAt : 0);
      this.bonusDraw.set(save.bonusDraw === true);
      this.options.set(Array.isArray(save.options) && save.options.length === (this.bonusDraw() ? 1 : 3) ? save.options : []);
      this.bonusBallReady.set(save.bonusBallPending === true && !this.options().length);
      if (this.options().length) this.setMessage(this.canChoose() ? (this.bonusDraw() ? 'gachaChooseBonus' : 'gachaChooseOne') : 'gachaRevealAll');
      else if (this.bonusBallReady()) this.setMessage('gachaBonusReady');
    } catch {
      this.pc.set([]);
      this.pokedex.set({});
    }
  }

  private save(): void {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        pc: this.pc(), pokedex: this.pokedex(), nextDrawAt: this.nextDrawAt(), options: this.options(),
        bonusDraw: this.bonusDraw(), bonusBallPending: this.bonusBallRolling() || this.bonusBallReady(),
      }));
    } catch {
      this.setMessage('gachaSaveError');
    }
  }
}
