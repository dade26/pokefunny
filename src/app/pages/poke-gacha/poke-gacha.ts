import { Component, DestroyRef, ElementRef, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { BANNED_POKEMON_ID, POKEMON_TYPES, Pokemon } from '../../models/pokemon.model';
import { LanguageService, TranslationKey } from '../../services/language.service';
import { PokemonCatalogEntry, PokemonService } from '../../services/pokemon.service';
import { PokemonPoolService } from '../../services/pokemon-pool.service';
import { GachaCollection } from '../../components/gacha-collection/gacha-collection';
import { DexStatus, GachaOption, PcPokemon, GachaSave, GACHA_STORAGE_KEY, GACHA_BOX_SIZE, GACHA_BOX_COUNT, GACHA_HOUR, bankedDraws, nextClockHour } from '../../models/poke-gacha.model';
import { pokemonArtworkUrl } from '../../models/pokemon-images';

interface GachaMessage {
  key: TranslationKey;
  values?: Record<string, string | number>;
  rewardKey?: TranslationKey;
}

const storageKey = GACHA_STORAGE_KEY;
const boxSize = GACHA_BOX_SIZE;
const boxCount = GACHA_BOX_COUNT;
const waitingMessages: TranslationKey[] = [
  'gachaWaitSorry',
  'gachaWaitToldYou',
  'gachaWaitNope',
  'gachaWaitSorryNo',
];

@Component({
  selector: 'app-poke-gacha',
  imports: [GachaCollection],
  templateUrl: './poke-gacha.html',
  styleUrls: ['./poke-gacha.css', './poke-gacha-appearance.css'],
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
  readonly drawCredits = signal(0);
  readonly availableDraws = computed(() => bankedDraws(this.drawCredits(), this.nextDrawAt(), this.now()));
  readonly waiting = computed(() => this.availableDraws() === 0);
  readonly countdown = computed(() => {
    const anchor = this.nextDrawAt();
    const next = !anchor ? nextClockHour(this.now()) : anchor > this.now() ? anchor
      : anchor + (Math.floor((this.now() - anchor) / GACHA_HOUR) + 1) * GACHA_HOUR;
    const seconds = Math.max(0, Math.ceil((next - this.now()) / 1000));
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
  readonly bubbleVisible = computed(() => !!this.machineEvent() || this.machineReady() || (this.waiting() && !!this.waitingNotice()));
  readonly bubbleText = computed(() => {
    const celebration = this.machineEvent();
    if (celebration) return this.i18n.t(celebration);
    const notice = this.waitingNotice();
    return this.machineReady() || !notice ? this.i18n.t(this.readyPhrase()) : this.i18n.t(notice.key, notice.values);
  });
  readonly messageText = computed(() => {
    const message = this.message();
    return this.i18n.t(message.key, message.rewardKey ? { ...message.values, reward: this.i18n.t(message.rewardKey) } : message.values);
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

  readonly types = POKEMON_TYPES;
  readonly soundEnabled = signal(false);
  readonly machineEvent = signal<TranslationKey | ''>('');
  readonly shinyDex = signal<Record<string, DexStatus>>({});
  readonly questsOpen = signal(false);
  readonly claimedQuests = signal<string[]>([]);
  readonly scene = signal('default');
  readonly boxTheme = signal('default');
  readonly title = signal('default');
  readonly boxNames = signal<string[]>(Array(boxCount).fill(''));
  readonly pcQuery = signal('');
  readonly pcType = signal('');
  readonly pcFavoritesOnly = signal(false);
  readonly pcSort = signal('slot');
  readonly dragUid = signal('');
  readonly released = signal<{ entry: PcPokemon; expiresAt: number } | null>(null);
  readonly canUndoRelease = computed(() => !!this.released() && this.released()!.expiresAt > this.now());
  readonly dexQuery = signal('');
  readonly dexGeneration = signal(0);
  readonly dexType = signal('');
  readonly dexFilter = signal('all');
  readonly dexCategory = signal('species');
  readonly selectedDexId = signal<number | null>(null);
  readonly dexDetail = signal<Pokemon | null>(null);
  readonly dexDetailLoading = signal(false);
  readonly dexDetailError = signal(false);
  private secretCheckedDay = '';
  private readonly revealTimers = new Set<ReturnType<typeof setTimeout>>();
  private audio?: AudioContext;
  readonly ownedCount = computed(() => Object.values(this.pokedex()).filter(status => status === 'owned').length);
  readonly shinyCount = computed(() => Object.values(this.shinyDex()).filter(status => status === 'owned').length);
  readonly readyPhrase = computed<TranslationKey>(() => this.shinyCount() ? 'gachaMachineShiny'
    : this.ownedCount() >= 25 ? 'gachaMachineCollector' : this.ownedCount() >= 5 ? 'gachaMachineGrowing' : 'gachaReady');
  readonly showFeedback = computed(() => ['gachaLoadError', 'gachaSaveError', 'gachaPcFull', 'gachaSavedToPc',
    'gachaReleased', 'gachaRestored', 'gachaQuestClaimed', 'gachaChoosePcSlot'].includes(this.message().key));
  readonly visiblePcSlots = computed(() => {
    const query = this.normalize(this.pcQuery());
    const entries = new Map(this.pc().filter(entry => entry.box === this.currentBox()).map(entry => [entry.slot, entry]));
    const slots = this.slots.map(slot => ({ slot, entry: entries.get(slot) }));
    const filtered = slots.filter(({ entry }) => !query && !this.pcType() && !this.pcFavoritesOnly() || !!entry
      && (!query || this.normalize(`${entry.nickname} ${entry.pokemon.name} ${entry.pokemon.id}`).includes(query))
      && (!this.pcType() || entry.pokemon.types.some(type => type.toLowerCase() === this.pcType()))
      && (!this.pcFavoritesOnly() || entry.favorite));
    return filtered.sort((a, b) => {
      if (this.pcSort() === 'slot') return a.slot - b.slot;
      if (!a.entry || !b.entry) return Number(!a.entry) - Number(!b.entry) || a.slot - b.slot;
      if (this.pcSort() === 'number') return a.entry.pokemon.id - b.entry.pokemon.id || a.slot - b.slot;
      if (this.pcSort() === 'recent') return (b.entry.caughtAt ?? 0) - (a.entry.caughtAt ?? 0) || a.slot - b.slot;
      if (this.pcSort() === 'favorite') return Number(!!b.entry.favorite) - Number(!!a.entry.favorite) || a.slot - b.slot;
      return (a.entry.nickname || a.entry.pokemon.name).localeCompare(b.entry.nickname || b.entry.pokemon.name, this.i18n.language()) || a.slot - b.slot;
    });
  });
  readonly dexGroups = computed(() => this.generations.map(generation => {
    const all = this.catalog().filter(entry => entry.generation === generation && entry.id !== BANNED_POKEMON_ID
      && (this.dexCategory() === 'forms' ? entry.id >= 10000 : this.dexCategory() === 'shiny' ? !!(entry.images & 10) : entry.id < 10000));
    const owned = all.filter(entry => this.collectionStatus(entry.id) === 'owned').length;
    const query = this.normalize(this.dexQuery());
    const entries = all.filter(entry => (!this.dexGeneration() || generation === this.dexGeneration())
      && (!this.dexType() || entry.types.includes(this.dexType() as typeof POKEMON_TYPES[number]))
      && (!query || this.normalize(`${entry.id} ${entry.name}`).includes(query))
      && (this.dexFilter() === 'all' || this.dexFilter() === 'missing' && this.collectionStatus(entry.id) !== 'owned'
        || this.collectionStatus(entry.id) === this.dexFilter()));
    return { generation, entries, total: all.length, remaining: all.length - owned, percent: all.length ? Math.round(owned / all.length * 1000) / 10 : 0 };
  }).filter(group => group.entries.length));
  readonly selectedDexEntry = computed(() => this.catalog().find(entry => entry.id === this.selectedDexId()));
  readonly quests = computed(() => {
    const owned = new Set(Object.keys(this.pokedex()).filter(id => this.pokedex()[id] === 'owned').map(Number));
    const species = this.catalog().filter(entry => entry.id < 10000 && owned.has(entry.id));
    const kanto = this.catalog().filter(entry => entry.generation === 1 && entry.id < 10000);
    const water = species.filter(entry => entry.types.includes('water')).length;
    return [
      { id: 'water', name: 'gachaQuestWater', goal: 5, progress: water, reward: 'gachaSceneForest', kind: 'scene', cosmetic: 'forest' },
      { id: 'starters', name: 'gachaQuestStarters', goal: 3, progress: [1, 4, 7].filter(id => owned.has(id)).length, reward: 'gachaTitleCollector', kind: 'title', cosmetic: 'collector' },
      { id: 'species', name: 'gachaQuestSpecies', goal: 25, progress: species.length, reward: 'gachaSceneStars', kind: 'scene', cosmetic: 'stars' },
      { id: 'shiny', name: 'gachaQuestShiny', goal: 1, progress: this.shinyCount(), reward: 'gachaTitleShiny', kind: 'title', cosmetic: 'shiny' },
      { id: 'kanto', name: 'gachaQuestKanto', goal: Math.max(1, Math.ceil(kanto.length / 4)), progress: kanto.filter(entry => owned.has(entry.id)).length, reward: 'gachaBoxSunset', kind: 'box', cosmetic: 'sunset' },
    ].map(quest => ({ ...quest, name: quest.name as TranslationKey, reward: quest.reward as TranslationKey,
      progress: Math.min(quest.progress, quest.goal), claimed: this.claimedQuests().includes(quest.id) }));
  });
  readonly claimableQuests = computed(() => this.quests().filter(quest => quest.progress >= quest.goal && !quest.claimed).length);
  readonly selectedTitleKey = computed<TranslationKey>(() => this.title() === 'collector' ? 'gachaTitleCollector' : this.title() === 'shiny' ? 'gachaTitleShiny' : 'gachaTitleTrainer');

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      this.revealTimers.forEach(timer => clearTimeout(timer));
      void this.audio?.close().catch(() => undefined);
    });
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
      if (!this.pcOpen() && !this.pokedexOpen() && !this.questsOpen() && !this.options().length && !this.annoyanceOfferOpen()) return;
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      onCleanup(() => {
        document.body.style.overflow = previousOverflow;
      });
    });
  }

  async ngOnInit(): Promise<void> {
    this.loadSave();
    try { this.catalog.set(await this.pokemonService.getPokemonCatalog()); }
    catch { this.setMessage('gachaLoadError'); }
  }

  async pull(): Promise<void> {
    if (this.loading() || this.options().length || this.bonusBallRolling() || this.bonusBallReady() || this.annoyanceOfferOpen()) return;
    this.now.set(Date.now());
    if (this.waiting()) {
      this.handleWaitingPull();
      return;
    }
    if (!this.nextFreeSlot()) { this.setMessage('gachaPcFull'); this.openPc(); return; }
    this.loading.set(true);
    this.bonusDraw.set(false);
    this.selectedPcUid.set(null);
    this.movingUid.set(null);
    this.options.set([]);
    this.setMessage('gachaPreparing');
    try {
      const options = await Promise.all((await this.getDrawableOptions()).map(async (pokemon) => ({
        ...pokemon,
        baseStatsTotal: await this.pokemonService.getBaseStatsTotal(pokemon.id).catch(() => 0),
      })));
      this.options.set(options.map((pokemon) => ({ pokemon, revealed: false, stage: 'sealed',
        isNew: (pokemon.shiny ? this.shinyDex() : this.pokedex())[pokemon.id] !== 'owned' })));
      this.now.set(Date.now());
      this.drawCredits.set(this.availableDraws() - 1);
      if (!this.nextDrawAt() || this.nextDrawAt() <= this.now()) this.nextDrawAt.set(nextClockHour(this.now()));
      this.setMessage('gachaRevealAll');
      this.save();
    } catch {
      this.setMessage('gachaLoadError');
    } finally {
      this.loading.set(false);
    }
  }

  reveal(index: number): void {
    const option = this.options()[index];
    if (!option || option.revealed || option.stage === 'shaking' || option.stage === 'silhouette') return;
    const finish = () => {
      this.updateCapsule(index, { revealed: true, stage: 'revealed' });
      this.markPokedex(option.pokemon.id, 'seen');
      if (option.pokemon.shiny) this.markShiny(option.pokemon.id, 'seen');
      this.playChime(!!option.pokemon.shiny);
      this.setMessage(this.canChoose() ? (this.bonusDraw() ? 'gachaChooseBonus' : 'gachaChooseOne') : 'gachaKeepRevealing');
      this.save();
    };
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
    this.updateCapsule(index, { stage: 'shaking' });
    this.setMessage('gachaOpening');
    this.later(() => this.updateCapsule(index, { stage: 'silhouette' }), 450);
    this.later(finish, 1100);
  }

  private updateCapsule(index: number, changes: Partial<GachaOption>): void {
    this.options.update(options => options.map((option, current) => current === index ? { ...option, ...changes } : option));
  }

  private later(action: () => void, ms: number): void {
    const timer = setTimeout(() => { this.revealTimers.delete(timer); action(); }, ms);
    this.revealTimers.add(timer);
  }

  toggleSound(): void { this.soundEnabled.update(value => !value); if (this.soundEnabled()) this.playChime(false); this.save(); }

  private playChime(shiny: boolean): void {
    if (!this.soundEnabled() || typeof globalThis.AudioContext === 'undefined') return;
    try {
      this.audio ??= new AudioContext();
      void this.audio.resume().catch(() => undefined);
      const start = this.audio.currentTime;
      for (const [index, frequency] of (shiny ? [523, 659, 784, 1047] : [523, 659, 784]).entries()) {
        const oscillator = this.audio.createOscillator();
        const gain = this.audio.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start + index * .09);
        gain.gain.linearRampToValueAtTime(.08, start + index * .09 + .01);
        gain.gain.exponentialRampToValueAtTime(.001, start + index * .09 + .2);
        oscillator.connect(gain); gain.connect(this.audio.destination);
        oscillator.start(start + index * .09); oscillator.stop(start + index * .09 + .22);
      }
    } catch { /* Visual reveals remain available when audio is unavailable. */ }
  }

  choose(option: GachaOption): void {
    if (!this.canChoose()) {
      this.setMessage('gachaRevealFirst');
      return;
    }
    if (!this.options().includes(option)) return;
    const previousCount = this.ownedCount();
    const firstShiny = option.pokemon.shiny && this.shinyCount() === 0;
    const slot = this.nextFreeSlot();
    if (!slot) {
      this.setMessage('gachaPcFull');
      this.openPc();
      return;
    }
    const pcPokemon: PcPokemon = {
      uid: `${option.pokemon.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      pokemon: option.pokemon,
      nickname: option.pokemon.name,
      box: slot.box,
      slot: slot.slot,
      favorite: false,
      caughtAt: Date.now(),
    };
    this.pc.update((pc) => [...pc, pcPokemon]);
    this.markPokedex(option.pokemon.id, 'owned');
    if (option.pokemon.shiny) this.markShiny(option.pokemon.id, 'owned');
    this.options.set([]);
    this.bonusDraw.set(false);
    const event: TranslationKey | '' = firstShiny ? 'gachaCelebrationFirstShiny'
      : previousCount < 25 && this.ownedCount() >= 25 ? 'gachaCelebrationTwentyFive'
      : previousCount < 5 && this.ownedCount() >= 5 ? 'gachaCelebrationFive' : '';
    if (event) {
      this.machineEvent.set(event);
      this.later(() => this.machineEvent.set(''), 5000);
    }
    this.setMessage('gachaSavedToPc', { name: pcPokemon.nickname || pcPokemon.pokemon.name });
    this.save();
  }

  declineAnnoyanceOffer(): void {
    if (!this.annoyanceOfferOpen()) return;
    this.annoyanceOfferOpen.set(false);
    this.setRandomWaitingMessage();
    this.save();
  }

  acceptAnnoyanceOffer(): void {
    if (!this.annoyanceOfferOpen()) return;
    this.annoyanceOfferOpen.set(false);
    this.bonusBallReady.set(false);
    this.bonusBallRolling.set(true);
    this.setMessage('gachaBonusRolling');
    this.later(() => this.finishBonusBallRoll(), 1600);
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
      this.options.set([{ pokemon, revealed: false, stage: 'sealed',
        isNew: (pokemon.shiny ? this.shinyDex() : this.pokedex())[pokemon.id] !== 'owned' }]);
      this.setMessage('gachaRevealAll');
      this.save();
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
    this.questsOpen.set(false);
  }

  openPokedex(): void {
    this.pokedexOpen.set(true);
    this.pcOpen.set(false);
    this.questsOpen.set(false);
  }

  openQuests(): void {
    this.questsOpen.set(true); this.pcOpen.set(false); this.pokedexOpen.set(false);
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
    this.pcQuery.set(''); this.pcType.set(''); this.pcFavoritesOnly.set(false);
    this.setMessage('gachaChoosePcSlot');
  }

  release(uid: string): void {
    const pokemon = this.pc().find((entry) => entry.uid === uid);
    if (!pokemon) return;
    this.released.set({ entry: pokemon, expiresAt: Date.now() + 30000 });
    this.now.set(Date.now());
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

  moveToSlot(uid: string, box: number, slot: number): void {
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
    const day = new Date(this.now()).toLocaleDateString('en-CA');
    if (this.secretCheckedDay !== day) {
      this.secretCheckedDay = day;
      const offer = Math.random() < .25;
      this.annoyanceOfferOpen.set(offer);
      this.save();
      if (offer) return;
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

  private normalize(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  toggleFavorite(uid: string): void {
    this.pc.update(entries => entries.map(entry => entry.uid === uid ? { ...entry, favorite: !entry.favorite } : entry));
    this.save();
  }

  boxName(box: number): string {
    return this.boxNames()[box]?.trim() || this.i18n.t('gachaBox', { count: box + 1 });
  }

  renameBox(name: string): void {
    this.boxNames.update(names => names.map((value, index) => index === this.currentBox() ? name.slice(0, 24) : value));
    this.save();
  }

  startDrag(event: DragEvent, uid: string): void {
    this.dragUid.set(uid);
    event.dataTransfer?.setData('text/plain', uid);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  dropPokemon(event: DragEvent, box: number, slot: number): void {
    event.preventDefault();
    const uid = this.dragUid();
    if (uid && this.pc().some(entry => entry.uid === uid)) this.moveToSlot(uid, box, slot);
    this.dragUid.set('');
  }

  dropOnBox(event: DragEvent, box: number): void {
    event.preventDefault();
    const slot = this.slots.find(slot => !this.pokemonAt(slot, box));
    if (slot === undefined) { this.setMessage('gachaPcFull'); return; }
    this.dropPokemon(event, box, slot);
    this.currentBox.set(box);
  }

  undoRelease(): void {
    this.now.set(Date.now());
    const released = this.released();
    if (!released || !this.canUndoRelease()) return;
    const place = this.pokemonAt(released.entry.slot, released.entry.box) ? this.nextFreeSlot() : released.entry;
    if (!place) { this.setMessage('gachaPcFull'); return; }
    this.pc.update(entries => [...entries, { ...released.entry, box: place.box, slot: place.slot }]);
    this.selectedPcUid.set(released.entry.uid); this.currentBox.set(place.box);
    this.released.set(null); this.setMessage('gachaRestored'); this.save();
  }

  collectionStatus(id: number): DexStatus | 'unknown' {
    return this.dexCategory() === 'shiny' ? this.shinyDex()[id] ?? 'unknown' : this.dexStatus(id);
  }

  dexImage(id: number): string {
    return pokemonArtworkUrl(id, this.dexCategory() === 'shiny');
  }

  setDexCategory(category: string): void {
    this.dexCategory.set(category); this.selectedDexId.set(null); this.dexDetail.set(null);
  }

  async inspectDex(id: number): Promise<void> {
    this.selectedDexId.set(id); this.dexDetail.set(null); this.dexDetailError.set(false);
    this.dexDetailLoading.set(false);
    if (this.collectionStatus(id) === 'unknown') return;
    this.dexDetailLoading.set(true);
    try {
      const pokemon = await this.pokemonService.getPokemon(id);
      if (this.selectedDexId() === id) this.dexDetail.set(pokemon);
    } catch { if (this.selectedDexId() === id) this.dexDetailError.set(true); }
    finally { if (this.selectedDexId() === id) this.dexDetailLoading.set(false); }
  }

  private markShiny(id: number, status: DexStatus): void {
    this.shinyDex.update(dex => dex[id] === 'owned' ? dex : { ...dex, [id]: status });
  }

  claimQuest(id: string): void {
    const quest = this.quests().find(quest => quest.id === id);
    if (!quest || quest.claimed || quest.progress < quest.goal) return;
    this.claimedQuests.update(ids => [...ids, id]);
    this.message.set({ key: 'gachaQuestClaimed', rewardKey: quest.reward }); this.save();
  }

  cosmeticUnlocked(kind: string, cosmetic: string): boolean {
    return cosmetic === 'default' || this.quests().some(quest => quest.claimed && quest.kind === kind && quest.cosmetic === cosmetic);
  }

  setCosmetic(kind: string, cosmetic: string): void {
    if (!this.cosmeticUnlocked(kind, cosmetic)) return;
    if (kind === 'scene') this.scene.set(cosmetic);
    if (kind === 'box') this.boxTheme.set(cosmetic);
    if (kind === 'title') this.title.set(cosmetic);
    this.save();
  }

  private loadSave(): void {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const save = JSON.parse(raw) as GachaSave;
      const validPokemon = (pokemon: Pokemon | undefined): pokemon is Pokemon => !!pokemon && Number.isInteger(pokemon.id)
        && pokemon.id > 0 && pokemon.id !== BANNED_POKEMON_ID && typeof pokemon.name === 'string' && Array.isArray(pokemon.types);
      const occupied = new Set<string>(); const uids = new Set<string>();
      this.pc.set(Array.isArray(save.pc) ? save.pc.filter(entry => {
        if (!entry || !validPokemon(entry.pokemon) || typeof entry.uid !== 'string' || uids.has(entry.uid)
          || !Number.isInteger(entry.box) || entry.box < 0 || entry.box >= boxCount
          || !Number.isInteger(entry.slot) || entry.slot < 0 || entry.slot >= boxSize) return false;
        const location = `${entry.box}:${entry.slot}`;
        if (occupied.has(location)) return false;
        occupied.add(location); uids.add(entry.uid); return true;
      }).map(entry => ({ ...entry, nickname: typeof entry.nickname === 'string' ? entry.nickname : entry.pokemon.name })) : []);
      const cleanDex = (dex: Record<string, DexStatus> | undefined) => Object.fromEntries(Object.entries(dex ?? {})
        .filter(([id, status]) => Number.isInteger(Number(id)) && Number(id) > 0 && Number(id) !== BANNED_POKEMON_ID && ['seen', 'owned'].includes(status)));
      this.pokedex.set(cleanDex(save.pokedex)); this.shinyDex.set(cleanDex(save.shinyDex));
      for (const entry of this.pc()) {
        this.pokedex.update(dex => ({ ...dex, [entry.pokemon.id]: 'owned' }));
        if (entry.pokemon.shiny) this.markShiny(entry.pokemon.id, 'owned');
      }
      this.nextDrawAt.set(typeof save.nextDrawAt === 'number' && Number.isFinite(save.nextDrawAt) && save.nextDrawAt > 0 ? save.nextDrawAt : 0);
      this.drawCredits.set(typeof save.drawCredits === 'number' && Number.isFinite(save.drawCredits) ? Math.max(0, Math.min(3, Math.floor(save.drawCredits))) : 0);
      this.bonusDraw.set(save.bonusDraw === true);
      this.options.set(Array.isArray(save.options) && save.options.length > 0 && save.options.length <= (this.bonusDraw() ? 1 : 3)
        ? save.options.filter(option => option && validPokemon(option.pokemon)).map(option => ({ ...option,
          revealed: option.revealed === true, stage: option.revealed ? 'revealed' : 'sealed',
          isNew: option.isNew ?? (option.pokemon.shiny ? this.shinyDex() : this.pokedex())[option.pokemon.id] !== 'owned' })) : []);
      this.bonusBallReady.set(save.bonusBallPending === true && !this.options().length);
      this.secretCheckedDay = typeof save.secretCheckedDay === 'string' ? save.secretCheckedDay : '';
      this.annoyanceOfferOpen.set(save.secretOfferPending === true && !this.options().length && !this.bonusBallReady());
      this.claimedQuests.set(Array.isArray(save.claimedQuests) ? save.claimedQuests.filter(id => typeof id === 'string') : []);
      this.scene.set(this.cosmeticUnlocked('scene', save.scene ?? '') ? save.scene! : 'default');
      this.boxTheme.set(this.cosmeticUnlocked('box', save.boxTheme ?? '') ? save.boxTheme! : 'default');
      this.title.set(this.cosmeticUnlocked('title', save.title ?? '') ? save.title! : 'default');
      this.boxNames.set(this.boxes.map(box => typeof save.boxNames?.[box] === 'string' ? save.boxNames[box].slice(0, 24) : ''));
      this.soundEnabled.set(save.soundEnabled === true);
      if (save.released && validPokemon(save.released.entry?.pokemon) && save.released.expiresAt > Date.now()
        && !uids.has(save.released.entry.uid) && this.boxes.includes(save.released.entry.box) && this.slots.includes(save.released.entry.slot)) this.released.set(save.released);
      if (this.options().length) this.setMessage(this.canChoose() ? (this.bonusDraw() ? 'gachaChooseBonus' : 'gachaChooseOne') : 'gachaRevealAll');
      else if (this.bonusBallReady()) this.setMessage('gachaBonusReady');
    } catch { this.setMessage('gachaSaveError'); }
  }

  private save(): void {
    try {
      const save: GachaSave = {
        pc: this.pc(), pokedex: this.pokedex(), shinyDex: this.shinyDex(), nextDrawAt: this.nextDrawAt(),
        drawCredits: this.drawCredits(), options: this.options(), bonusDraw: this.bonusDraw(),
        bonusBallPending: this.bonusBallRolling() || this.bonusBallReady(), secretCheckedDay: this.secretCheckedDay,
        secretOfferPending: this.annoyanceOfferOpen(), claimedQuests: this.claimedQuests(), scene: this.scene(),
        boxTheme: this.boxTheme(), title: this.title(), boxNames: this.boxNames(), soundEnabled: this.soundEnabled(),
        released: this.canUndoRelease() ? this.released()! : undefined,
      };
      localStorage.setItem(storageKey, JSON.stringify(save));
    } catch { this.setMessage('gachaSaveError'); }
  }
}
