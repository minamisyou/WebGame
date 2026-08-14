export type Lang = 'ko' | 'en';

const STRINGS = {
  ko: {
    title: 'GRAVITON',
    tagline: '막혔을 때, 보드를 돌려버려라',
    endless: '엔들리스',
    endlessDesc: '기록에 도전',
    daily: '데일리',
    dailyDesc: '오늘의 시드 · 전원 동일',
    rush: '러시 60',
    rushDesc: '60초 최대 점수',
    resume: '이어하기',
    settings: '설정',
    howTo: '규칙 보기',
    score: '점수',
    best: '최고',
    chain: '연쇄',
    rotations: '회전',
    next: '다음',
    time: '시간',
    pause: '일시정지',
    paused: '일시정지',
    resumeGame: '계속하기',
    quit: '그만두기',
    restart: '다시하기',
    gameOver: '게임 오버',
    timeUp: '시간 종료',
    newBest: '최고 기록 경신!',
    maxChain: '최대 연쇄',
    maxOrb: '최고 오브',
    share: '결과 공유',
    copied: '클립보드에 복사했습니다',
    home: '홈으로',
    sound: '소리',
    haptics: '진동',
    reducedMotion: '모션 줄이기',
    palette: '색약 팔레트',
    handedness: '주 사용 손',
    left: '왼손',
    right: '오른손',
    language: '언어',
    close: '닫기',
    on: '켬',
    off: '끔',
    dailyDone: '오늘 기록',
    practice: '연습 모드 (기록에 반영되지 않음)',
    rotateHint: '게이지를 써서 보드를 돌려보세요',
    dropHint: '열을 탭해서 오브를 떨어뜨리세요',
    rulesTitle: '규칙',
    rules: [
      '열을 탭하면 오브가 떨어집니다.',
      '같은 숫자가 상하좌우로 3개 이상 붙으면 합쳐져 숫자가 1 오릅니다.',
      '보드를 90° 돌리면 모든 오브가 다시 떨어져 연쇄가 터집니다.',
      '회전은 게이지를 1 소모하고, 2연쇄 이상을 만들면 다시 채워집니다.',
      '12번째 드롭마다 회색 돌이 생깁니다. 옆에서 머지하면 부서집니다.',
      '오브가 맨 윗줄에 남으면 게임 오버.',
    ],
    landscapeWarn: '세로 화면으로 돌려주세요',
  },
  en: {
    title: 'GRAVITON',
    tagline: 'Stuck? Turn the whole board.',
    endless: 'Endless',
    endlessDesc: 'Chase your best',
    daily: 'Daily',
    dailyDesc: "Today's seed · same for everyone",
    rush: 'Rush 60',
    rushDesc: 'Best score in 60s',
    resume: 'Resume',
    settings: 'Settings',
    howTo: 'How to play',
    score: 'Score',
    best: 'Best',
    chain: 'Chain',
    rotations: 'Spins',
    next: 'Next',
    time: 'Time',
    pause: 'Pause',
    paused: 'Paused',
    resumeGame: 'Continue',
    quit: 'Quit',
    restart: 'Play again',
    gameOver: 'Game over',
    timeUp: "Time's up",
    newBest: 'New best!',
    maxChain: 'Best chain',
    maxOrb: 'Top orb',
    share: 'Share result',
    copied: 'Copied to clipboard',
    home: 'Home',
    sound: 'Sound',
    haptics: 'Haptics',
    reducedMotion: 'Reduce motion',
    palette: 'Color-blind palette',
    handedness: 'Dominant hand',
    left: 'Left',
    right: 'Right',
    language: 'Language',
    close: 'Close',
    on: 'On',
    off: 'Off',
    dailyDone: "Today's result",
    practice: 'Practice run (not recorded)',
    rotateHint: 'Spend a spin to turn the board',
    dropHint: 'Tap a column to drop the orb',
    rulesTitle: 'Rules',
    rules: [
      'Tap a column to drop the orb.',
      'Three or more equal orbs connected in a line merge into one, value +1.',
      'Turning the board 90° drops everything again and sets off cascades.',
      'A turn costs one spin; reaching a 2-chain earns one back.',
      'Every 12th drop adds a stone. Merge next to it to shatter it.',
      'If an orb rests on the top row, the run ends.',
    ],
    landscapeWarn: 'Please rotate to portrait',
  },
} as const;

export type StringKey = keyof (typeof STRINGS)['ko'];

let current: Lang = 'ko';

export function setLang(lang: Lang): void {
  current = lang;
  document.documentElement.lang = lang;
}

export function t(key: StringKey): string {
  const value = STRINGS[current][key];
  return Array.isArray(value) ? value.join(' ') : (value as string);
}

export function rules(): readonly string[] {
  return STRINGS[current].rules;
}

/** Applies translations to every element carrying data-i18n. */
export function localizeDom(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n as StringKey | undefined;
    if (key) el.textContent = t(key);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-label]').forEach((el) => {
    const key = el.dataset.i18nLabel as StringKey | undefined;
    if (key) el.setAttribute('aria-label', t(key));
  });
}
