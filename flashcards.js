// ===========================
// フラッシュカード機能（flashcards.html 専用）
// ===========================
// このファイルは script.js の後に読み込まれることを前提とする。
// loadWords() / wordList / partOfSpeechLabels / partOfSpeechOrder は
// script.js のグローバルスコープから参照する。

// フラッシュカードの状態管理
var fcState = {
  allCards: [],     // 全カード（品詞ごとのフラット展開）
  cards: [],        // フィルター後のカード
  currentIndex: 0,  // 表示中のインデックス
  isFlipped: false, // 裏面表示中か
  isRandom: false,  // ランダムモード
  filter: 'all',    // メインフィルター: 'all' / 'favorite' / 'weak'
  posFilter: 'all', // 品詞フィルター: 'all' / 品詞キー
  mode: 'manual'    // 表示モード: 'manual' / 'auto'
};

// ===========================
// カードデータの構築
// ===========================

// 単語リストを「品詞ごとのフラットなカード」に展開する
// 同じ単語でも品詞が違えば別カードとして扱う
function fcBuildAllCards() {
  var result = [];
  wordList.forEach(function(word) {
    word.parts.forEach(function(part) {
      result.push({
        word:        word.word,
        partOfSpeech: part.partOfSpeech,
        meanings:    part.meanings  || [],
        examples:    part.examples  || [],
        isFavorite:  part.isFavorite || false,
        isWeak:      part.isWeak     || false
      });
    });
  });
  return result;
}

// ===========================
// フィルター処理
// ===========================

// メインフィルター＋品詞フィルターを適用してカードリストを更新する
function fcApplyFilter() {
  // フィルター変更時は自動モードを停止する
  if (fcState.mode === 'auto') fcAutoStop();

  var base = fcState.allCards;

  // メインフィルター
  if (fcState.filter === 'favorite') {
    base = base.filter(function(c) { return c.isFavorite; });
  } else if (fcState.filter === 'weak') {
    base = base.filter(function(c) { return c.isWeak; });
  }

  // 品詞フィルター
  if (fcState.posFilter !== 'all') {
    base = base.filter(function(c) { return c.partOfSpeech === fcState.posFilter; });
  }

  // コピーして状態をリセット
  fcState.cards = base.slice();
  fcState.currentIndex = 0;
  fcState.isFlipped = false;

  // ランダムモードならシャッフル
  if (fcState.isRandom) {
    fcShuffle(fcState.cards);
  }
}

// メインフィルターを変更する
function fcSetFilter(filter, btn) {
  fcState.filter = filter;
  document.querySelectorAll('.fc-filter-btn').forEach(function(b) {
    b.classList.remove('active');
  });
  btn.classList.add('active');
  // 品詞フィルターはリセット
  fcState.posFilter = 'all';
  document.querySelectorAll('.fc-pos-filter-btn').forEach(function(b) {
    b.classList.remove('active');
    if (b.dataset.pos === 'all') b.classList.add('active');
  });
  fcApplyFilter();
  fcRender();
}

// 品詞フィルターを変更する
function fcSetPosFilter(pos, btn) {
  fcState.posFilter = pos;
  document.querySelectorAll('.fc-pos-filter-btn').forEach(function(b) {
    b.classList.remove('active');
  });
  btn.classList.add('active');
  fcApplyFilter();
  fcRender();
}

// ランダムモードを切り替える
function fcToggleRandom() {
  fcState.isRandom = document.getElementById('fcRandomToggle').checked;
  if (fcState.isRandom) {
    fcShuffle(fcState.cards);
    fcState.currentIndex = 0;
    fcState.isFlipped = false;
  }
  fcRender();
}

// Fisher-Yates シャッフル
function fcShuffle(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

// ===========================
// 描画
// ===========================

function fcRender() {
  var cardWrapper   = document.getElementById('fcCardWrapper');
  var faceBtns      = document.getElementById('fcFaceBtns');
  var nav           = document.getElementById('fcNav');
  var emptyEl       = document.getElementById('fcEmpty');
  var countEl       = document.getElementById('fcCardCount');
  var autoControls  = document.getElementById('fcAutoControls');
  var stepIndicator = document.getElementById('fcAutoStepIndicator');

  var isAuto = (fcState.mode === 'auto');

  countEl.textContent = fcState.cards.length + ' 枚';

  if (fcState.cards.length === 0) {
    cardWrapper.style.display   = 'none';
    faceBtns.style.display      = 'none';
    nav.style.display           = 'none';
    if (autoControls)  autoControls.style.display  = 'none';
    if (stepIndicator) stepIndicator.style.display = 'none';
    emptyEl.style.display       = 'block';
    return;
  }

  cardWrapper.style.display   = 'flex';
  // 手動モードでのみ「表を見る/裏を見る」ボタンを表示
  faceBtns.style.display      = isAuto ? 'none' : 'flex';
  nav.style.display           = 'flex';
  emptyEl.style.display       = 'none';
  if (autoControls)  autoControls.style.display  = isAuto ? 'flex' : 'none';
  if (stepIndicator) stepIndicator.style.display = isAuto ? 'flex' : 'none';

  var card = fcState.cards[fcState.currentIndex];

  // ---- 表面：英単語 ----
  document.getElementById('fcWord').textContent = card.word;

  // ---- 裏面：品詞バッジ ----
  document.getElementById('fcBackPos').textContent =
    partOfSpeechLabels[card.partOfSpeech] || card.partOfSpeech;

  // ---- 裏面：意味リスト ----
  var meaningsList = document.getElementById('fcBackMeanings');
  meaningsList.innerHTML = '';
  card.meanings.forEach(function(m) {
    if (!m) return;
    var li = document.createElement('li');
    li.textContent = m;
    meaningsList.appendChild(li);
  });

  // ---- 裏面：例文リスト ----
  var examplesEl = document.getElementById('fcBackExamples');
  examplesEl.innerHTML = '';
  var hasExamples = Array.isArray(card.examples) && card.examples.some(function(e) {
    return e && e.english;
  });
  if (hasExamples) {
    card.examples.forEach(function(ex) {
      if (!ex || !ex.english) return;
      var item = document.createElement('div');
      item.className = 'fc-back-example-item';

      var engDiv = document.createElement('div');
      engDiv.className = 'fc-back-example-en';
      engDiv.textContent = ex.english;
      item.appendChild(engDiv);

      if (ex.japanese) {
        var jaDiv = document.createElement('div');
        jaDiv.className = 'fc-back-example-ja';
        jaDiv.textContent = ex.japanese;
        item.appendChild(jaDiv);
      }

      examplesEl.appendChild(item);
    });
  }

  // ---- フリップ状態の反映 ----
  var inner = document.getElementById('fcCardInner');
  if (fcState.isFlipped) {
    inner.classList.add('flipped');
  } else {
    inner.classList.remove('flipped');
  }

  // ---- 進捗表示 ----
  document.getElementById('fcProgress').textContent =
    (fcState.currentIndex + 1) + ' / ' + fcState.cards.length;

  // ---- 前へ/次へボタンの有効・無効 ----
  document.getElementById('fcPrevBtn').disabled = (fcState.currentIndex === 0);
  document.getElementById('fcNextBtn').disabled = (fcState.currentIndex === fcState.cards.length - 1);

  // ---- 自動モード時はUIを更新 ----
  if (isAuto) fcUpdateAutoUI();
}

// ===========================
// カード操作
// ===========================

// カードをクリックしてめくる（自動モード中は無効）
function fcFlip() {
  if (fcState.mode === 'auto') return;
  fcState.isFlipped = !fcState.isFlipped;
  var inner = document.getElementById('fcCardInner');
  if (fcState.isFlipped) {
    inner.classList.add('flipped');
  } else {
    inner.classList.remove('flipped');
  }
}

// 表面を表示する
function fcShowFront() {
  fcState.isFlipped = false;
  document.getElementById('fcCardInner').classList.remove('flipped');
}

// 裏面を表示する
function fcShowBack() {
  fcState.isFlipped = true;
  document.getElementById('fcCardInner').classList.add('flipped');
}

// 次のカードへ
function fcNext() {
  if (fcState.currentIndex >= fcState.cards.length - 1) return;
  fcState.currentIndex++;
  fcState.isFlipped = false;
  if (fcState.mode === 'auto') {
    fcAutoClearTimer();
    fcAutoState.step = 0;
    fcAutoCleanupBack();
    fcRender();
    if (fcAutoState.isPlaying) fcAutoRunStep();
  } else {
    fcRender();
  }
}

// 前のカードへ
function fcPrev() {
  if (fcState.currentIndex <= 0) return;
  fcState.currentIndex--;
  fcState.isFlipped = false;
  if (fcState.mode === 'auto') {
    fcAutoClearTimer();
    fcAutoState.step = 0;
    fcAutoCleanupBack();
    fcRender();
    if (fcAutoState.isPlaying) fcAutoRunStep();
  } else {
    fcRender();
  }
}

// ===========================
// 品詞フィルターボタンの生成
// ===========================

function fcBuildPosFilterButtons() {
  var row = document.getElementById('fcFilterPosRow');
  if (!row) return;

  // 全カードに存在する品詞を収集
  var posSet = {};
  fcState.allCards.forEach(function(c) {
    posSet[c.partOfSpeech] = true;
  });

  // 品詞定義順にソート
  var posList = Object.keys(posSet).sort(function(a, b) {
    return (partOfSpeechOrder[a] || 99) - (partOfSpeechOrder[b] || 99);
  });

  row.innerHTML = '';

  // 「すべての品詞」ボタン
  var allBtn = document.createElement('button');
  allBtn.className = 'fc-pos-filter-btn active';
  allBtn.textContent = 'すべての品詞';
  allBtn.dataset.pos = 'all';
  allBtn.onclick = function() { fcSetPosFilter('all', this); };
  row.appendChild(allBtn);

  // 各品詞ボタン
  posList.forEach(function(pos) {
    var btn = document.createElement('button');
    btn.className = 'fc-pos-filter-btn';
    btn.textContent = partOfSpeechLabels[pos] || pos;
    btn.dataset.pos = pos;
    btn.onclick = (function(p) {
      return function() { fcSetPosFilter(p, this); };
    }(pos));
    row.appendChild(btn);
  });

  // 品詞が1種類以下なら品詞フィルター行を非表示
  row.style.display = (posList.length > 1) ? '' : 'none';
}

// ===========================
// 初期化
// ===========================

function fcInit() {
  loadWords();
  fcState.allCards = fcBuildAllCards();
  fcBuildPosFilterButtons();
  fcApplyFilter();
  fcRender();
}

fcInit();

// ===========================
// 自動モード
// ===========================

// 各ステップの表示時間（ミリ秒）
var FC_AUTO_DURATIONS = {
  word:     3000,   // 英単語のみ表示する時間
  meanings: 2000,   // 意味を表示した後・次ステップまでの時間
  examples: 2000    // 例文の日本語訳を表示した後・次カードまでの時間
};

// 自動モードの状態
var fcAutoState = {
  isPlaying: false,  // 再生中か
  isPaused:  false,  // 一時停止中か
  step:      0,      // 現在のステップ: 0=英単語 / 1=意味 / 2=例文 / 3=次へ
  handle:    null    // setTimeout のハンドル（null = タイマーなし）
};

// ---- タイマー管理 ----

// 実行待ちのタイマーをキャンセルする
function fcAutoClearTimer() {
  if (fcAutoState.handle !== null) {
    clearTimeout(fcAutoState.handle);
    fcAutoState.handle = null;
  }
}

// タイマーをセットする（必ず既存タイマーをクリアしてから）
function fcAutoSchedule(fn, delay) {
  fcAutoClearTimer();
  fcAutoState.handle = setTimeout(fn, delay);
}

// ---- ステート遷移（setTimeout チェーン） ----

// 現在のステップに応じた表示とタイマーをセットする
// setInterval は使わず、setTimeout を1つだけ積み上げる方式
function fcAutoRunStep() {
  var step = fcAutoState.step;
  var card = fcState.cards[fcState.currentIndex];
  if (!card) return;

  fcRenderAutoStepIndicator(); // インジケーターを現在ステップに更新

  if (step === 0) {
    // ステップ0: 英単語（表面）を表示
    fcState.isFlipped = false;
    document.getElementById('fcCardInner').classList.remove('flipped');
    document.querySelector('.fc-card-back').classList.remove('hide-examples');
    fcAutoSchedule(function() {
      fcAutoState.step = 1;
      fcAutoRunStep();
    }, FC_AUTO_DURATIONS.word);

  } else if (step === 1) {
    // ステップ1: 裏面へフリップ・意味を表示（例文は隠す）
    fcState.isFlipped = true;
    document.getElementById('fcCardInner').classList.add('flipped');
    document.querySelector('.fc-card-back').classList.add('hide-examples');
    var hasEx = fcCardHasAutoExamples(card);
    fcAutoSchedule(function() {
      fcAutoState.step = hasEx ? 2 : 3; // 例文なしはステップ3へスキップ
      fcAutoRunStep();
    }, FC_AUTO_DURATIONS.meanings);

  } else if (step === 2) {
    // ステップ2: 例文の日本語訳をフェードイン表示
    document.querySelector('.fc-card-back').classList.remove('hide-examples');
    fcAutoSchedule(function() {
      fcAutoState.step = 3;
      fcAutoRunStep();
    }, FC_AUTO_DURATIONS.examples);

  } else if (step === 3) {
    // ステップ3: 次のカードへ進む（なければ自動停止）
    if (fcState.currentIndex < fcState.cards.length - 1) {
      fcState.currentIndex++;
      fcState.isFlipped = false;
      fcAutoState.step = 0;
      fcAutoCleanupBack();
      fcRender();       // 新しいカードのコンテンツを描画
      fcAutoRunStep();  // 次カードのステップ0を開始
    } else {
      fcAutoStop(); // デッキ終端に達したので停止
    }
  }
}

// 裏面の補助クラスをリセットする（カード遷移時に呼ぶ）
function fcAutoCleanupBack() {
  var back = document.querySelector('.fc-card-back');
  if (back) back.classList.remove('hide-examples');
}

// ---- 再生コントロール ----

// 自動モードを開始する（常に先頭カードから）
function fcAutoStart() {
  fcAutoClearTimer();
  fcAutoState.isPlaying = true;
  fcAutoState.isPaused  = false;
  fcAutoState.step      = 0;
  fcState.currentIndex  = 0;
  fcState.isFlipped     = false;
  fcAutoCleanupBack();
  fcRender();
  fcAutoRunStep();
}

// 一時停止する
function fcAutoPause() {
  if (!fcAutoState.isPlaying) return;
  fcAutoClearTimer();
  fcAutoState.isPlaying = false;
  fcAutoState.isPaused  = true;
  fcUpdateAutoUI();
}

// 再開する（現在のステップからタイマーを再スタート）
function fcAutoResume() {
  if (!fcAutoState.isPaused) return;
  fcAutoState.isPlaying = true;
  fcAutoState.isPaused  = false;
  fcUpdateAutoUI();
  fcAutoRunStep(); // 現在ステップをもう一度実行（タイマーを再設定）
}

// 停止する（タイマーをクリアし、初期状態へ）
function fcAutoStop() {
  fcAutoClearTimer();
  fcAutoState.isPlaying = false;
  fcAutoState.isPaused  = false;
  fcAutoState.step      = 0;
  fcAutoCleanupBack();
  fcUpdateAutoUI();
}

// ---- モード切替 ----

// 手動 / 自動 モードを切り替える
function fcSetMode(mode) {
  if (fcState.mode === mode) return;

  if (fcState.mode === 'auto') {
    // 自動モードから離れる際はタイマーを止めて表示を戻す
    fcAutoStop();
    fcState.isFlipped = false;
    document.getElementById('fcCardInner').classList.remove('flipped');
    fcAutoCleanupBack();
  }

  fcState.mode = mode;

  document.getElementById('fcModeBtnManual').classList.toggle('active', mode === 'manual');
  document.getElementById('fcModeBtnAuto').classList.toggle('active', mode === 'auto');

  fcRender();
}

// ---- UI 更新 ----

// 開始/一時停止/再開ボタンの表示を切り替える
function fcUpdateAutoUI() {
  var startBtn  = document.getElementById('fcAutoStartBtn');
  var pauseBtn  = document.getElementById('fcAutoPauseBtn');
  var resumeBtn = document.getElementById('fcAutoResumeBtn');
  if (!startBtn) return;

  if (fcAutoState.isPlaying) {
    startBtn.style.display  = 'none';
    pauseBtn.style.display  = 'inline-flex';
    resumeBtn.style.display = 'none';
  } else if (fcAutoState.isPaused) {
    startBtn.style.display  = 'none';
    pauseBtn.style.display  = 'none';
    resumeBtn.style.display = 'inline-flex';
  } else {
    startBtn.style.display  = 'inline-flex';
    pauseBtn.style.display  = 'none';
    resumeBtn.style.display = 'none';
  }

  fcRenderAutoStepIndicator();
}

// ステップインジケーターを現在の状態に合わせて更新する
function fcRenderAutoStepIndicator() {
  var card  = fcState.cards[fcState.currentIndex];
  var step  = fcAutoState.step;
  var hasEx = card ? fcCardHasAutoExamples(card) : false;
  var isActive = fcAutoState.isPlaying || fcAutoState.isPaused;

  for (var i = 0; i <= 2; i++) {
    var el = document.getElementById('fcStepItem' + i);
    if (!el) continue;

    el.className = 'fc-step-item';

    if (i === 2 && !hasEx) {
      el.classList.add('skip');       // 例文なし → 対象外
    } else if (!isActive) {
      el.classList.add('pending');    // 未開始
    } else if (i < step) {
      el.classList.add('done');       // 通過済み
    } else if (i === step) {
      el.classList.add('active');     // 現在のステップ
    } else {
      el.classList.add('pending');    // 未到達
    }
  }
}

// ---- ユーティリティ ----

// そのカードに自動モードで表示すべき例文日本語訳があるか確認する
function fcCardHasAutoExamples(card) {
  return Array.isArray(card.examples) &&
    card.examples.some(function(e) { return e && e.japanese; });
}
