import './style.css';
import { GAUGE_MAX, Game } from './core/game';
import { dateKey, hashSeed } from './core/rng';
import type { Mode, RotateDir } from './core/types';
import { AudioEngine, vibrate } from './audio/audio';
import { attachBoardInput, attachKeyboardInput, type InputHandlers } from './input/input';
import { BoardView, drawOrb } from './render/renderer';
import { localizeDom, rules, setLang, t } from './i18n';
import {
  clearSave,
  loadBest,
  loadDaily,
  loadHints,
  loadSave,
  loadSettings,
  saveBest,
  saveDaily,
  saveHints,
  saveRun,
  saveSettings,
  type Settings,
} from './storage';
import { buildShareText, shareResult } from './share';

const RUSH_MS = 60_000;
/** Longest frame delta we trust; anything more means the tab was asleep. */
const MAX_FRAME_MS = 64;

type Screen = 'title' | 'playing' | 'paused' | 'over' | 'settings' | 'rules';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
}

class App {
  private settings: Settings = loadSettings();
  private hints = loadHints();
  private audio = new AudioEngine();
  private view: BoardView;
  private game: Game | null = null;
  private screen: Screen = 'title';
  /** Screen to return to when an overlay closes. */
  private underlay: Screen = 'title';
  private mode: Mode = 'endless';
  private rushLeft = RUSH_MS;
  private lastFrame = 0;
  private displayScore = 0;
  private toastTimer = 0;
  private hintTimer = 0;

  private canvas = el<HTMLCanvasElement>('board');
  private nextCanvas = el<HTMLCanvasElement>('next-canvas');
  private nextCtx: CanvasRenderingContext2D;

  constructor() {
    this.nextCtx = this.nextCanvas.getContext('2d') as CanvasRenderingContext2D;
    this.view = new BoardView(
      this.canvas,
      { palette: this.settings.palette, reducedMotion: this.settings.reducedMotion },
      {
        onLand: () => {
          this.audio.land();
          vibrate(8, this.settings.haptics);
        },
        onMerge: (chain, groups) => {
          for (const group of groups) this.displayScore += group.gained;
          this.audio.merge(chain, groups[0]?.newValue ?? 1);
          vibrate(chain > 1 ? 18 : 10, this.settings.haptics);
          this.renderScore();
          if (chain > 1) this.flashChain(chain);
        },
        onGauge: (value) => this.renderGauge(value),
        onRotate: () => {
          this.audio.rotate();
          vibrate(14, this.settings.haptics);
        },
        onPetrify: () => this.audio.petrify(),
        onGameOver: () => this.finishRun(),
        onIdle: () => this.onSettled(),
      },
    );

    this.applySettings();
    this.bindUi();
    this.bindInput();
    this.bindLifecycle();
    this.syncViewportUnit();
    this.view.resize();
    this.renderTitle();
    requestAnimationFrame(this.frame);
  }

  /* ---------------- setup ---------------- */

  private bindInput(): void {
    const handlers: InputHandlers = {
      preview: (col) => {
        if (!this.canPlay()) return this.view.setGhost(null, 1);
        this.view.setGhost(col, this.game?.current ?? 1);
      },
      drop: (col) => this.drop(col),
      rotate: (dir) => this.rotate(dir),
      gesture: () => {
        if (this.settings.sound) this.audio.unlock();
      },
    };
    attachBoardInput(this.canvas, this.view, handlers);
    attachKeyboardInput({
      ...handlers,
      preview: (col) => {
        if (this.canPlay()) this.view.setGhost(col, this.game?.current ?? 1);
      },
    });

    el('rotate-ccw').addEventListener('click', () => this.rotate('ccw'));
    el('rotate-cw').addEventListener('click', () => this.rotate('cw'));
  }

  private bindUi(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.audio.unlock();
        this.startGame(btn.dataset.mode as Mode);
      });
    });

    el('resume-btn').addEventListener('click', () => this.resumeSavedRun());
    el('pause-btn').addEventListener('click', () => this.pause());
    el('pause-resume').addEventListener('click', () => this.setScreen('playing'));
    el('pause-restart').addEventListener('click', () => this.startGame(this.mode));
    el('pause-quit').addEventListener('click', () => this.goHome());
    el('over-again').addEventListener('click', () => this.startGame(this.mode));
    el('over-home').addEventListener('click', () => this.goHome());
    el('over-share').addEventListener('click', () => void this.share());

    el('rules-btn').addEventListener('click', () => this.openOverlay('rules'));
    el('rules-close').addEventListener('click', () => this.closeOverlay());
    el('settings-btn').addEventListener('click', () => this.openOverlay('settings'));
    el('settings-close').addEventListener('click', () => this.closeOverlay());

    this.bindToggle('set-sound', 'sound');
    this.bindToggle('set-haptics', 'haptics');
    this.bindToggle('set-motion', 'reducedMotion');
    el('set-palette').addEventListener('click', () => {
      this.settings.palette = this.settings.palette === 'default' ? 'accessible' : 'default';
      this.commitSettings();
    });
    el('set-hand').addEventListener('click', () => {
      this.settings.handedness = this.settings.handedness === 'right' ? 'left' : 'right';
      this.commitSettings();
    });
    el('set-lang').addEventListener('click', () => {
      this.settings.lang = this.settings.lang === 'ko' ? 'en' : 'ko';
      this.commitSettings();
    });
  }

  private bindToggle(id: string, key: 'sound' | 'haptics' | 'reducedMotion'): void {
    el(id).addEventListener('click', () => {
      this.settings[key] = !this.settings[key];
      if (key === 'sound' && this.settings.sound) this.audio.unlock();
      this.commitSettings();
    });
  }

  private bindLifecycle(): void {
    const resize = () => {
      this.syncViewportUnit();
      this.view.resize();
      this.renderNext();
    };
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    window.visualViewport?.addEventListener('resize', resize);
    new ResizeObserver(() => this.view.resize()).observe(el('board-wrap'));

    // A backgrounded tab stops rAF; pause so the rush clock can't drain and
    // the next frame's delta can't jump.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.persist();
        if (this.screen === 'playing') this.pause();
      } else {
        this.lastFrame = performance.now();
      }
    });
    window.addEventListener('pagehide', () => this.persist());
  }

  /** iOS reports a viewport that excludes browser chrome only here. */
  private syncViewportUnit(): void {
    const height = window.visualViewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty('--vh', `${height}px`);
  }

  private applySettings(): void {
    setLang(this.settings.lang);
    localizeDom();
    document.body.dataset.hand = this.settings.handedness;
    this.audio.enabled = this.settings.sound;
    this.view.setOptions({
      palette: this.settings.palette,
      reducedMotion: this.settings.reducedMotion,
    });
    this.renderSettings();
    this.renderRules();
    this.renderTitle();
    this.renderNext();
  }

  private commitSettings(): void {
    saveSettings(this.settings);
    this.applySettings();
  }

  /* ---------------- game flow ---------------- */

  private startGame(mode: Mode): void {
    this.mode = mode;
    const seed =
      mode === 'daily'
        ? hashSeed(`${dateKey()}:daily`)
        : (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    this.game = new Game(mode, seed);
    this.rushLeft = RUSH_MS;
    this.displayScore = 0;
    this.view.setGrid(this.game.grid);
    this.view.setGhost(null, 1);
    if (mode !== 'endless') clearSave();
    this.setScreen('playing');
    this.syncHud();

    if (!this.hints.dropSeen) this.showHint(t('dropHint'), 6000);
    if (mode === 'daily' && loadDaily(dateKey())) this.toast(t('practice'));
  }

  private resumeSavedRun(): void {
    const snapshot = loadSave();
    if (!snapshot) return;
    this.audio.unlock();
    this.game = Game.restore(snapshot);
    this.mode = snapshot.mode;
    this.displayScore = snapshot.score;
    this.view.setGrid(this.game.grid);
    this.setScreen('playing');
    this.syncHud();
  }

  private canPlay(): boolean {
    return this.screen === 'playing' && this.game !== null && !this.game.over && !this.view.busy;
  }

  private drop(col: number): void {
    if (!this.canPlay() || !this.game) return;
    const events = this.game.drop(col);
    if (events.length === 0) return;
    if (!this.hints.dropSeen) {
      this.hints.dropSeen = true;
      saveHints(this.hints);
      this.hideHint();
    }
    this.view.setGhost(null, 1);
    this.view.enqueue(events);
    this.renderNext();
    this.updateRotateButtons();
  }

  private rotate(dir: RotateDir): void {
    if (!this.canPlay() || !this.game) return;
    if (!this.game.canRotate) {
      vibrate([6, 40, 6], this.settings.haptics);
      return;
    }
    if (!this.hints.rotateSeen) {
      this.hints.rotateSeen = true;
      saveHints(this.hints);
      this.hideHint();
    }
    if (this.settings.sound) this.audio.unlock();
    this.view.enqueue(this.game.rotate(dir));
    this.updateRotateButtons();
  }

  /** Called once the animation queue drains — the safe point to sync state. */
  private onSettled(): void {
    if (!this.game) return;
    this.displayScore = this.game.score;
    this.syncHud();
    this.persist();

    // Teach the rotate button the first time it can actually be used.
    if (!this.hints.rotateSeen && this.game.canRotate && this.game.drops >= 3) {
      this.showHint(t('rotateHint'), 5000);
    }
  }

  private finishRun(): void {
    if (!this.game) return;
    this.audio.gameOver();
    vibrate([40, 60, 40], this.settings.haptics);
    this.showResult(t('gameOver'));
  }

  private endRush(): void {
    if (!this.game || this.game.over) return;
    this.game.over = true;
    this.audio.gameOver();
    this.showResult(t('timeUp'));
  }

  private showResult(title: string): void {
    if (!this.game) return;
    const game = this.game;
    this.displayScore = game.score;
    clearSave();

    const isNewBest = saveBest(game.mode, game.score);
    const today = dateKey();
    if (game.mode === 'daily' && !loadDaily(today)) {
      saveDaily({
        date: today,
        score: game.score,
        maxChain: game.maxChain,
        maxOrb: game.maxOrb,
      });
    }

    el('over-title').textContent = title;
    el('final-score').textContent = game.score.toLocaleString();
    el('final-chain').textContent = `x${game.maxChain}`;
    el('final-orb').textContent = String(game.maxOrb);
    el('final-best').textContent = loadBest(game.mode).toLocaleString();
    el('best-flag').hidden = !isNewBest;
    this.renderTitle();
    this.setScreen('over');
  }

  private pause(): void {
    if (this.screen !== 'playing') return;
    this.persist();
    this.setScreen('paused');
  }

  private goHome(): void {
    this.persist();
    this.game = null;
    this.setScreen('title');
    this.renderTitle();
  }

  private persist(): void {
    if (!this.game || this.game.over || this.mode !== 'endless') return;
    saveRun(this.game.snapshot());
  }

  private async share(): Promise<void> {
    if (!this.game) return;
    const text = buildShareText({
      mode: this.game.mode,
      date: dateKey(),
      score: this.game.score,
      maxChain: this.game.maxChain,
      maxOrb: this.game.maxOrb,
      lang: this.settings.lang,
    });
    const outcome = await shareResult(text);
    if (outcome === 'copied') this.toast(t('copied'));
  }

  /* ---------------- screens ---------------- */

  private setScreen(screen: Screen): void {
    this.screen = screen;
    if (screen === 'playing' || screen === 'title') this.underlay = screen;
    el('screen-title').hidden = screen !== 'title';
    el('screen-pause').hidden = screen !== 'paused';
    el('screen-over').hidden = screen !== 'over';
    el('screen-settings').hidden = screen !== 'settings';
    el('screen-rules').hidden = screen !== 'rules';
    el('timer-stat').hidden = this.mode !== 'rush';
    this.updateRotateButtons();
    if (screen === 'playing') this.lastFrame = performance.now();
  }

  private openOverlay(screen: 'settings' | 'rules'): void {
    this.underlay = this.screen === 'playing' ? 'paused' : this.screen;
    this.setScreen(screen);
  }

  private closeOverlay(): void {
    this.setScreen(this.underlay === 'playing' ? 'paused' : this.underlay);
  }

  /* ---------------- rendering ---------------- */

  private frame = (now: number): void => {
    const dt = Math.min(MAX_FRAME_MS, now - this.lastFrame);
    this.lastFrame = now;

    if (this.screen === 'playing' && this.mode === 'rush' && this.game && !this.game.over) {
      this.rushLeft = Math.max(0, this.rushLeft - dt);
      this.renderTimer();
      if (this.rushLeft === 0 && !this.view.busy) this.endRush();
    }

    this.view.update(dt);
    this.view.draw();
    requestAnimationFrame(this.frame);
  };

  private syncHud(): void {
    this.renderScore();
    this.renderGauge(this.game?.gauge ?? 0);
    this.renderNext();
    this.renderTimer();
    this.updateRotateButtons();
  }

  private renderScore(): void {
    el('score').textContent = Math.round(this.displayScore).toLocaleString();
    el('best').textContent = loadBest(this.mode).toLocaleString();
  }

  private renderGauge(value: number): void {
    const dots = el('gauge-dots');
    if (dots.childElementCount !== GAUGE_MAX) {
      dots.replaceChildren(
        ...Array.from({ length: GAUGE_MAX }, () => {
          const dot = document.createElement('span');
          dot.className = 'gauge-dot';
          return dot;
        }),
      );
    }
    Array.from(dots.children).forEach((dot, i) => {
      dot.classList.toggle('filled', i < value);
    });
    this.updateRotateButtons();
  }

  private updateRotateButtons(): void {
    const usable = this.screen === 'playing' && (this.game?.canRotate ?? false);
    for (const id of ['rotate-ccw', 'rotate-cw']) {
      (el(id) as HTMLButtonElement).disabled = !usable;
    }
  }

  private renderTimer(): void {
    if (this.mode !== 'rush') return;
    const seconds = Math.ceil(this.rushLeft / 1000);
    el('timer').textContent = String(seconds);
    el('timer-stat').classList.toggle('urgent', seconds <= 10);
  }

  /** Current orb large, the one after it small — both on one HUD canvas. */
  private renderNext(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = 72;
    const h = 44;
    this.nextCanvas.width = Math.round(w * dpr);
    this.nextCanvas.height = Math.round(h * dpr);
    this.nextCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.nextCtx.clearRect(0, 0, w, h);
    if (!this.game) return;

    drawOrb(this.nextCtx, 24, h / 2, 18, this.game.next[0], this.settings.palette);
    if (this.game.next.length > 1) {
      this.nextCtx.globalAlpha = 0.55;
      drawOrb(this.nextCtx, 56, h / 2, 11, this.game.next[1], this.settings.palette);
      this.nextCtx.globalAlpha = 1;
    }
  }

  private renderTitle(): void {
    document.querySelectorAll<HTMLElement>('[data-best]').forEach((node) => {
      const mode = node.dataset.best as Mode;
      const best = loadBest(mode);
      node.textContent = best > 0 ? best.toLocaleString() : '';
    });
    const daily = loadDaily(dateKey());
    const dailyBtn = document.querySelector<HTMLElement>('[data-mode="daily"] .mode-desc');
    if (dailyBtn && daily) {
      dailyBtn.textContent = `${t('dailyDone')} ${daily.score.toLocaleString()}`;
    }
    el('resume-btn').hidden = loadSave() === null;
  }

  private renderSettings(): void {
    const toggle = (id: string, on: boolean) => el(id).setAttribute('aria-checked', String(on));
    toggle('set-sound', this.settings.sound);
    toggle('set-haptics', this.settings.haptics);
    toggle('set-motion', this.settings.reducedMotion);
    toggle('set-palette', this.settings.palette === 'accessible');
    el('set-hand').textContent = t(this.settings.handedness === 'right' ? 'right' : 'left');
    el('set-lang').textContent = this.settings.lang === 'ko' ? '한국어' : 'English';
  }

  private renderRules(): void {
    const list = el('rules-list');
    list.replaceChildren(
      ...rules().map((text) => {
        const li = document.createElement('li');
        li.textContent = text;
        return li;
      }),
    );
  }

  private flashChain(chain: number): void {
    const node = el('chain-flash');
    node.textContent = `${t('chain')} x${chain}`;
    node.classList.remove('show');
    void node.offsetWidth; // restart the animation
    node.classList.add('show');
  }

  private showHint(text: string, ms: number): void {
    const node = el('hint');
    node.textContent = text;
    node.classList.add('show');
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.hideHint(), ms);
  }

  private hideHint(): void {
    window.clearTimeout(this.hintTimer);
    el('hint').classList.remove('show');
  }

  private toast(text: string): void {
    const node = el('toast');
    node.textContent = text;
    node.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      node.hidden = true;
    }, 2200);
  }
}

new App();

// Offline support is best-effort: the game runs fine without it.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* unsupported or blocked (private mode, http) */
    });
  });
}
