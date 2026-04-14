// ===========================
// クイズ機能（quiz.html 専用）
// ===========================
// このファイルは script.js の後に読み込まれることを前提としている。
// loadWords() / wordList / saveWords() / partOfSpeechLabels / escapeHtml()
// などは script.js のグローバルスコープから参照する。

// 単語リストを「品詞ごとのフラットなアイテム」に展開する（クイズで使用）
// 各アイテムは旧 wordList の1エントリと同じ形状で、quiz 関数を変更なく再利用できる
function buildFlatPartList() {
  var result = [];
  wordList.forEach(function(word) {
    word.parts.forEach(function(part) {
      result.push({
        id: part.id,             // part レベルの ID（recordQuizResult で使用）
        word: word.word,         // 英単語の文字列
        partOfSpeech: part.partOfSpeech,
        meanings: part.meanings,
        examples: part.examples,
        isFavorite: part.isFavorite,
        isWeak: part.isWeak,
        correct: part.correct,
        wrong: part.wrong
      });
    });
  });
  return result;
}

// クイズの状態管理
var quizState = {
  isActive: false,          // クイズ中かどうか
  currentWord: null,        // 現在の問題単語
  currentExample: null,     // 英文入力クイズ用：現在の例文ペア { english, japanese }
  recentWordIds: [],        // 直近に出題したIDのリスト（連続防止用）
  recentSentenceKeys: [],   // 英文入力クイズ用：直近に出題した例文のキーリスト
  recentExQuizKeys: [],     // 例文クイズ用：直近に出題した例文のキーリスト
  recentFillBlankKeys: [],  // 例文穴埋めクイズ用：直近に出題した例文のキーリスト
  answered: false,          // 現在の問題が回答済みかどうか
  mode: 'random',           // 出題モード
  selectedPos: 'noun',      // 品詞別モードで選択中の品詞
  quizType: 'choice'        // クイズの種類：'choice'（4択）/ 'spell'（スペル入力）/ 'sentence'（英文入力）/ 'exquiz'（例文クイズ）
};

// 最近出題した問題の記憶数（この数だけ同じ問題が出にくくなる）
var QUIZ_RECENT_MEMORY = 5;

// クイズ種別の定義
var QUIZ_TYPES = [
  { value: 'choice',    label: '4択クイズ' },
  { value: 'spell',     label: 'スペル入力' },
  { value: 'sentence',  label: '英文入力' },
  { value: 'exquiz',    label: '例文クイズ' },
  { value: 'fillblank', label: '例文穴埋め' }
];

// 出題モードの定義
var QUIZ_MODES = [
  { value: 'random',   label: '完全ランダム' },
  { value: 'pos',      label: '品詞別' },
  { value: 'weak',     label: '苦手優先' },
  { value: 'favorite', label: 'お気に入り' },
  { value: 'lowRate',  label: '低正答率優先' }
];

// クイズを終了してモード選択画面に戻る
function stopQuiz() {
  quizState.isActive = false;
  quizState.currentWord = null;
  quizState.currentExample = null;
  renderQuizModeSelector();
}

// モード選択UIを描画する
function renderQuizModeSelector() {
  // クイズ本体エリアをリセット
  document.getElementById('quizMessage').textContent = '';
  document.getElementById('quizContent').innerHTML = '';
  document.getElementById('quizModeArea').style.display = 'block';

  // タイトルをリセット
  document.getElementById('quizTitle').textContent = 'クイズ';

  // ── クイズ種別ボタン（4択 / スペル入力）──
  var typeBtns = QUIZ_TYPES.map(function(t) {
    var cls = 'quiz-mode-btn' + (quizState.quizType === t.value ? ' selected' : '');
    return '<button class="' + cls + '" onclick="selectQuizType(\'' + t.value + '\')">' + t.label + '</button>';
  }).join('');

  // ── 出題モードボタン ──
  var modeBtns = QUIZ_MODES.map(function(m) {
    var cls = 'quiz-mode-btn' + (quizState.mode === m.value ? ' selected' : '');
    return '<button class="' + cls + '" onclick="selectQuizMode(\'' + m.value + '\')">' + m.label + '</button>';
  }).join('');

  // 品詞別のときだけ品詞選択を表示
  var posRowHtml = '';
  if (quizState.mode === 'pos') {
    var posOptions = Object.keys(partOfSpeechLabels).map(function(key) {
      var selected = quizState.selectedPos === key ? ' selected' : '';
      return '<option value="' + key + '"' + selected + '>' + escapeHtml(partOfSpeechLabels[key]) + '</option>';
    }).join('');
    posRowHtml = '<div class="quiz-pos-select-row">'
      + '<label>品詞:</label>'
      + '<select id="quizPosSelect" onchange="quizState.selectedPos = this.value">' + posOptions + '</select>'
      + '</div>';
  }

  document.getElementById('quizModeArea').innerHTML = ''
    + '<div class="quiz-type-group">'
    +   '<div class="quiz-mode-row-label">クイズの種類</div>'
    +   '<div class="quiz-mode-buttons">' + typeBtns + '</div>'
    + '</div>'
    + '<div class="quiz-mode-group">'
    +   '<div class="quiz-mode-row-label">出題モード</div>'
    +   '<div class="quiz-mode-buttons">' + modeBtns + '</div>'
    +   posRowHtml
    + '</div>'
    + '<div class="quiz-mode-error" id="quizModeError"></div>'
    + '<button class="quiz-start-btn" onclick="startQuizWithMode()">クイズを開始する</button>';
}

// クイズ種別ボタンを選択したときの処理
function selectQuizType(type) {
  quizState.quizType = type;
  renderQuizModeSelector();
}

// 出題モードボタンを選択したときの処理
function selectQuizMode(mode) {
  quizState.mode = mode;
  renderQuizModeSelector();
}

// モード選択後にクイズを開始する
function startQuizWithMode() {
  var quizType = quizState.quizType;

  var flatList = buildFlatPartList();

  if (quizType === 'sentence') {
    // 英文入力クイズ：日本語訳付き例文を持つ品詞が対象
    var sentenceWordPool = flatList.filter(function(w) { return hasSentence(w); });
    if (sentenceWordPool.length === 0) {
      showModeError('英文入力クイズには、日本語訳が登録された例文が必要です。\n例文登録時に日本語訳も入力してください。');
      return;
    }
    var pool = buildQuizPool(sentenceWordPool, flatList);
    if (pool === null) return;
  } else if (quizType === 'exquiz') {
    // 例文クイズ：日本語訳付き例文を持つ品詞が対象
    var exWordPool = flatList.filter(function(w) { return hasSentence(w); });
    if (exWordPool.length === 0) {
      showModeError('例文クイズには、日本語訳が登録された例文が必要です。\n例文登録時に日本語訳も入力してください。');
      return;
    }
    var exPool = buildQuizPool(exWordPool, flatList);
    if (exPool === null) return;
    var exItems = buildSentencePool(exPool);
    var distinctJa = getDistinctJapanese(exItems);
    if (distinctJa.length < 4) {
      showModeError('例文クイズには、異なる日本語訳が4つ以上必要です。（現在 ' + distinctJa.length + ' 種）');
      return;
    }
  } else if (quizType === 'fillblank') {
    // 例文穴埋めクイズ：その単語が含まれた日本語訳付き例文を持つ品詞が対象
    var fbWordPool = flatList.filter(function(w) { return hasFillBlankExample(w); });
    if (fbWordPool.length === 0) {
      showModeError('例文穴埋めクイズには、単語本体が含まれた例文（日本語訳付き）が必要です。\n例文中に登録単語が含まれていることを確認してください。');
      return;
    }
    var fbPool = buildQuizPool(fbWordPool, flatList);
    if (fbPool === null) return;
  } else {
    // 4択・スペル入力クイズ：意味が登録された品詞が対象
    var allCandidates = flatList.filter(function(w) {
      return w.meanings && w.meanings.length > 0;
    });
    var minRequired = quizType === 'spell' ? 1 : 4;
    if (allCandidates.length < minRequired) {
      var msg = quizType === 'spell'
        ? '出題できる単語がありません。まず単語を登録してください。'
        : 'クイズを開始するには、意味が登録された単語が4つ以上必要です。（現在 ' + allCandidates.length + ' 語）';
      showModeError(msg);
      return;
    }
    var pool = buildQuizPool(allCandidates, flatList);
    if (pool === null) return;
  }

  // タイトルを種別に合わせて更新する
  var titleMap = { choice: '4択クイズ', spell: 'スペル入力クイズ', sentence: '英文入力クイズ', exquiz: '例文クイズ', fillblank: '例文穴埋めクイズ' };
  document.getElementById('quizTitle').textContent = titleMap[quizType] || 'クイズ';

  // モード選択UIを隠してクイズ本体を開始する
  document.getElementById('quizModeArea').style.display = 'none';
  quizState.isActive = true;
  quizState.recentWordIds = [];
  quizState.recentSentenceKeys = [];
  quizState.recentExQuizKeys = [];
  quizState.recentFillBlankKeys = [];
  showNextQuestion();
}

// モード選択エリアにエラーを表示する
function showModeError(message) {
  var el = document.getElementById('quizModeError');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
}

// 次の問題を表示する（4択・スペル入力・英文入力で共通のエントリポイント）
function showNextQuestion() {
  // 英文入力クイズは専用の関数に委譲する
  if (quizState.quizType === 'sentence') {
    showNextSentenceQuestion();
    return;
  }

  // 例文クイズは専用の関数に委譲する
  if (quizState.quizType === 'exquiz') {
    showNextExQuizQuestion();
    return;
  }

  // 例文穴埋めクイズは専用の関数に委譲する
  if (quizState.quizType === 'fillblank') {
    showNextFillBlankQuestion();
    return;
  }

  // 全候補（意味あり・flat part list）
  var flatList = buildFlatPartList();
  var allCandidates = flatList.filter(function(w) {
    return w.meanings && w.meanings.length > 0;
  });

  // 4択は4品詞以上、スペル入力は1品詞以上必要
  var minRequired = quizState.quizType === 'spell' ? 1 : 4;
  if (allCandidates.length < minRequired) {
    renderQuizError('出題できる単語が足りなくなりました。');
    return;
  }

  // モード別フィルタリング
  var pool = buildQuizPool(allCandidates, flatList);
  if (pool === null) return;

  // 直近に出題したIDを除いた候補（連続防止）
  var freshPool = pool.filter(function(w) {
    return quizState.recentWordIds.indexOf(w.id) === -1;
  });
  if (freshPool.length === 0) {
    freshPool = pool; // 全部 recent に入っていたらリセット扱い
  }

  // 重み付きランダムで問題単語を選ぶ
  var questionWord = selectWeightedWord(freshPool);
  quizState.currentWord = questionWord;

  // 直近出題リストを更新する
  quizState.recentWordIds.push(questionWord.id);
  if (quizState.recentWordIds.length > QUIZ_RECENT_MEMORY) {
    quizState.recentWordIds.shift();
  }

  // 出題する意味をランダムに1つ選ぶ（4択・スペル共通）
  var questionMeaning = questionWord.meanings[Math.floor(Math.random() * questionWord.meanings.length)];

  quizState.answered = false;

  if (quizState.quizType === 'spell') {
    // スペル入力クイズ
    renderSpellQuestion(questionWord, questionMeaning);
  } else {
    // 4択クイズ：不正解の意味を全候補から集める
    var otherWords = allCandidates.filter(function(w) { return w.id !== questionWord.id; });
    var wrongMeanings = pickWrongMeanings(otherWords, questionMeaning, 3);
    var choices = shuffleArray([questionMeaning].concat(wrongMeanings));
    renderQuizQuestion(questionWord, questionMeaning, choices);
  }
}

// モードに応じた出題プールを返す（エラー時はnull）
// allCandidates: 対象の flat part アイテム配列
// flatList: 全品詞の flat part アイテム配列（エラー判定の基準数に使用）
function buildQuizPool(allCandidates, flatList) {
  var mode = quizState.mode;

  if (mode === 'weak') {
    var pool = allCandidates.filter(function(w) { return w.isWeak; });
    if (pool.length === 0) {
      renderQuizError('苦手フラグが付いた単語がありません。\n単語カードの「苦手」ボタンで登録してください。');
      return null;
    }
    return pool;
  }

  if (mode === 'favorite') {
    var pool = allCandidates.filter(function(w) { return w.isFavorite; });
    if (pool.length === 0) {
      renderQuizError('お気に入り登録された単語がありません。\n単語カードの「お気に入り」ボタンで登録してください。');
      return null;
    }
    return pool;
  }

  if (mode === 'pos') {
    var pool = allCandidates.filter(function(w) { return w.partOfSpeech === quizState.selectedPos; });
    if (pool.length === 0) {
      var posLabel = partOfSpeechLabels[quizState.selectedPos] || quizState.selectedPos;
      renderQuizError('「' + posLabel + '」の単語が登録されていません。');
      return null;
    }
    return pool;
  }

  // random, lowRate はフィルタなし（全候補）
  return allCandidates;
}

// 重み付きランダムで単語を1つ選ぶ
// 未出題 → 高重み、正答率が低い → 高重み
function selectWeightedWord(candidates) {
  var isLowRateMode = (quizState.mode === 'lowRate');

  // 各単語の重みを計算する
  var weights = candidates.map(function(word) {
    var c     = typeof word.correct === 'number' ? word.correct : 0;
    var w     = typeof word.wrong   === 'number' ? word.wrong   : 0;
    var total = c + w;

    if (total === 0) {
      // 未出題は最優先
      return isLowRateMode ? 10 : 5;
    }

    var rate = c / total; // 0.0〜1.0（正答率）

    if (isLowRateMode) {
      // 低正答率モード：差を大きくする
      if (rate < 0.4) return 8;
      if (rate < 0.6) return 4;
      if (rate < 0.8) return 2;
      return 1;
    } else {
      // その他のモード：緩やかな重み付け
      if (rate < 0.5) return 3;
      if (rate < 0.8) return 2;
      return 1;
    }
  });

  // 重みの合計を出してルーレット選択する
  var totalWeight = 0;
  weights.forEach(function(w) { totalWeight += w; });

  var rand = Math.random() * totalWeight;
  var cumulative = 0;
  for (var i = 0; i < candidates.length; i++) {
    cumulative += weights[i];
    if (rand <= cumulative) {
      return candidates[i];
    }
  }
  return candidates[candidates.length - 1]; // フォールバック
}

// 他の単語から不正解の選択肢を集める
function pickWrongMeanings(otherWords, correctMeaning, count) {
  // 全意味を候補として集める（正解と重複するものは除く）
  var allMeanings = [];
  otherWords.forEach(function(w) {
    w.meanings.forEach(function(m) {
      if (m !== correctMeaning && allMeanings.indexOf(m) === -1) {
        allMeanings.push(m);
      }
    });
  });

  // ランダムに count 個取り出す
  var shuffled = shuffleArray(allMeanings);
  return shuffled.slice(0, count);
}

// 配列をランダムに並び替えて返す（Fisher-Yates法）
function shuffleArray(arr) {
  var result = arr.slice(); // 元配列を壊さないようコピー
  for (var i = result.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

// クイズの問題画面を描画する
function renderQuizQuestion(questionWord, correctMeaning, choices) {
  var posLabel = partOfSpeechLabels[questionWord.partOfSpeech] || questionWord.partOfSpeech;

  // 選択肢ボタンのHTML
  var choiceButtons = choices.map(function(choice) {
    return '<button class="quiz-choice-btn"'
      + ' onclick="handleChoiceClick(this, \'' + escapeForAttr(choice) + '\', \'' + escapeForAttr(correctMeaning) + '\')">'
      + escapeHtml(choice)
      + '</button>';
  }).join('');

  var html = ''
    + '<div class="quiz-question-word">' + escapeHtml(questionWord.word) + '</div>'
    + '<div class="quiz-question-pos"><span class="pos-badge">' + escapeHtml(posLabel) + '</span></div>'
    + '<div class="quiz-choices">' + choiceButtons + '</div>'
    + '<div class="quiz-feedback" id="quizFeedback"></div>';

  document.getElementById('quizMessage').textContent = 'この単語の意味はどれ？';
  document.getElementById('quizContent').innerHTML = html;
}

// クイズ成績を記録してlocalStorageに保存する（partId で品詞を特定する）
function recordQuizResult(partId, isCorrect) {
  var found = false;
  wordList.forEach(function(word) {
    word.parts.forEach(function(part) {
      if (part.id === partId) {
        if (typeof part.correct !== 'number') part.correct = 0;
        if (typeof part.wrong   !== 'number') part.wrong   = 0;
        if (isCorrect) { part.correct += 1; } else { part.wrong += 1; }
        found = true;
      }
    });
  });
  if (!found) return;
  saveWords();
}

// 選択肢ボタンを押したときの処理（4択クイズ）
function handleChoiceClick(clickedBtn, selected, correct) {
  // 回答済みなら何もしない
  if (quizState.answered) return;
  quizState.answered = true;

  var isCorrect = (selected === correct);

  // 成績を記録する
  if (quizState.currentWord) {
    recordQuizResult(quizState.currentWord.id, isCorrect);
  }

  // 全ての選択肢ボタンを取得して状態を反映する
  var allBtns = document.querySelectorAll('.quiz-choice-btn');
  allBtns.forEach(function(btn) {
    btn.disabled = true;
    // onclick属性から正解の意味を取り出す（正解ボタンに色を付ける）
    var btnSelected = btn.getAttribute('onclick').match(/handleChoiceClick\(this, '(.+?)', '(.+?)'\)/);
    if (btnSelected && btnSelected[1] === correct) {
      btn.classList.add('correct');
    }
  });

  // 不正解の場合は選んだボタンに wrong クラスを追加
  if (!isCorrect) {
    clickedBtn.classList.add('wrong');
  }

  // フィードバックメッセージを表示
  var feedbackEl = document.getElementById('quizFeedback');
  if (isCorrect) {
    feedbackEl.textContent = '正解！';
    feedbackEl.className = 'quiz-feedback correct';
  } else {
    feedbackEl.textContent = '不正解… 正解は「' + correct + '」';
    feedbackEl.className = 'quiz-feedback wrong';
  }

  // 「次の問題へ」「クイズを終了」ボタンを追加
  var nextBtn = document.createElement('button');
  nextBtn.className = 'quiz-next-btn';
  nextBtn.textContent = '次の問題へ';
  nextBtn.onclick = showNextQuestion;

  var endBtn = document.createElement('button');
  endBtn.className = 'quiz-end-btn';
  endBtn.textContent = 'モード選択に戻る';
  endBtn.onclick = stopQuiz;

  document.getElementById('quizContent').appendChild(nextBtn);
  document.getElementById('quizContent').appendChild(endBtn);
}

// スペル入力クイズの問題画面を描画する
function renderSpellQuestion(questionWord, questionMeaning) {
  var posLabel = partOfSpeechLabels[questionWord.partOfSpeech] || questionWord.partOfSpeech;

  var html = ''
    + '<div class="quiz-question-meaning">' + escapeHtml(questionMeaning) + '</div>'
    + '<div class="quiz-question-hint"><span class="pos-badge">' + escapeHtml(posLabel) + '</span></div>'
    + '<div class="spell-input-area">'
    +   '<input type="text" class="spell-input" id="spellInput"'
    +     ' placeholder="英単語を入力..." autocomplete="off" autocapitalize="none" spellcheck="false">'
    +   '<button class="spell-submit-btn" id="spellSubmitBtn" onclick="handleSpellSubmit()">解答</button>'
    + '</div>'
    + '<div class="quiz-feedback" id="quizFeedback"></div>';

  document.getElementById('quizMessage').textContent = 'この意味の英単語は？';
  document.getElementById('quizContent').innerHTML = html;

  // Enterキーでも解答できるようにする
  document.getElementById('spellInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') handleSpellSubmit();
  });

  // 自動フォーカス
  document.getElementById('spellInput').focus();
}

// スペル入力の解答ボタンを押したときの処理
function handleSpellSubmit() {
  if (quizState.answered) return;

  var inputEl = document.getElementById('spellInput');
  if (!inputEl) return;

  var inputValue = inputEl.value.trim();
  if (!inputValue) return; // 空欄は無視する

  var questionWord = quizState.currentWord;
  if (!questionWord) return;

  // 大文字小文字を無視して完全一致で判定する
  var isCorrect = inputValue.toLowerCase() === questionWord.word.toLowerCase();
  quizState.answered = true;

  // 入力欄と解答ボタンを無効化する
  inputEl.disabled = true;
  var submitBtn = document.getElementById('spellSubmitBtn');
  if (submitBtn) submitBtn.disabled = true;

  // 成績を記録する
  recordQuizResult(questionWord.id, isCorrect);

  // フィードバックを表示する
  var feedbackEl = document.getElementById('quizFeedback');
  var contentEl  = document.getElementById('quizContent');

  if (isCorrect) {
    feedbackEl.textContent = '正解！';
    feedbackEl.className = 'quiz-feedback correct';
  } else {
    feedbackEl.textContent = '不正解…';
    feedbackEl.className = 'quiz-feedback wrong';

    // 不正解時は正解の英単語・品詞・意味一覧を表示する
    var posLabel = partOfSpeechLabels[questionWord.partOfSpeech] || questionWord.partOfSpeech;
    var meaningsHtml = questionWord.meanings.map(function(m) {
      return '<li>' + escapeHtml(m) + '</li>';
    }).join('');

    var detailDiv = document.createElement('div');
    detailDiv.className = 'spell-answer-detail';
    detailDiv.innerHTML = ''
      + '<div class="spell-answer-word">'
      +   escapeHtml(questionWord.word)
      +   ' <span class="pos-badge">' + escapeHtml(posLabel) + '</span>'
      + '</div>'
      + '<div class="spell-answer-meanings">'
      +   '<ul class="meanings-list">' + meaningsHtml + '</ul>'
      + '</div>';
    contentEl.appendChild(detailDiv);
  }

  // 「次の問題へ」「モード選択に戻る」ボタンを追加する
  var nextBtn = document.createElement('button');
  nextBtn.className = 'quiz-next-btn';
  nextBtn.textContent = '次の問題へ';
  nextBtn.onclick = showNextQuestion;

  var endBtn = document.createElement('button');
  endBtn.className = 'quiz-end-btn';
  endBtn.textContent = 'モード選択に戻る';
  endBtn.onclick = stopQuiz;

  contentEl.appendChild(nextBtn);
  contentEl.appendChild(endBtn);
}

// ===========================
// 英文入力クイズ
// ===========================

// 単語が有効な例文（英文・日本語訳の両方あり）を持つか確認する
function hasSentence(word) {
  if (!word.examples || word.examples.length === 0) return false;
  return word.examples.some(function(ex) {
    var eng = typeof ex === 'string' ? ex : (ex.english || '');
    var jpn = typeof ex === 'string' ? '' : (ex.japanese || '');
    return eng && jpn;
  });
}

// 単語から有効な例文ペア { english, japanese } の配列を返す
function getValidExamples(word) {
  if (!word.examples) return [];
  return word.examples.reduce(function(acc, ex) {
    var eng = typeof ex === 'string' ? ex : (ex.english || '');
    var jpn = typeof ex === 'string' ? '' : (ex.japanese || '');
    if (eng && jpn) {
      acc.push({ english: eng, japanese: jpn });
    }
    return acc;
  }, []);
}

// 単語プールから出題候補 { word, english, japanese } の平坦なリストを作る
function buildSentencePool(wordPool) {
  var items = [];
  wordPool.forEach(function(word) {
    getValidExamples(word).forEach(function(ex) {
      items.push({ word: word, english: ex.english, japanese: ex.japanese });
    });
  });
  return items;
}

// 例文アイテムを重み付きランダムで1つ選ぶ（単語の成績を重みに使う）
function selectWeightedSentenceItem(items) {
  var isLowRateMode = (quizState.mode === 'lowRate');
  var weights = items.map(function(item) {
    var word  = item.word;
    var c     = typeof word.correct === 'number' ? word.correct : 0;
    var w     = typeof word.wrong   === 'number' ? word.wrong   : 0;
    var total = c + w;
    if (total === 0) return isLowRateMode ? 10 : 5;
    var rate = c / total;
    if (isLowRateMode) {
      if (rate < 0.4) return 8;
      if (rate < 0.6) return 4;
      if (rate < 0.8) return 2;
      return 1;
    } else {
      if (rate < 0.5) return 3;
      if (rate < 0.8) return 2;
      return 1;
    }
  });
  var totalWeight = 0;
  weights.forEach(function(w) { totalWeight += w; });
  var rand = Math.random() * totalWeight;
  var cumulative = 0;
  for (var i = 0; i < items.length; i++) {
    cumulative += weights[i];
    if (rand <= cumulative) return items[i];
  }
  return items[items.length - 1];
}

// 英文入力クイズの次の問題を選んで表示する
function showNextSentenceQuestion() {
  var flatList = buildFlatPartList();
  // 日本語訳付き例文を持つ品詞を集める
  var sentenceWordPool = flatList.filter(function(w) { return hasSentence(w); });
  if (sentenceWordPool.length === 0) {
    renderQuizError('英文入力クイズには、日本語訳が登録された例文が必要です。');
    return;
  }

  // 出題モードに応じたフィルタリング（buildQuizPool を再利用）
  var filteredWordPool = buildQuizPool(sentenceWordPool, flatList);
  if (filteredWordPool === null) return;

  // 例文の平坦なリストを作る
  var sentenceItems = buildSentencePool(filteredWordPool);
  if (sentenceItems.length === 0) {
    renderQuizError('出題できる例文がありません。');
    return;
  }

  // 直近に出題した例文を除いた候補（連続防止）
  var freshItems = sentenceItems.filter(function(item) {
    var key = item.word.id + '|' + item.english;
    return quizState.recentSentenceKeys.indexOf(key) === -1;
  });
  if (freshItems.length === 0) {
    freshItems = sentenceItems; // 全て recent に入っていたらリセット
  }

  // 重み付きランダムで例文を選ぶ
  var selected = selectWeightedSentenceItem(freshItems);
  quizState.currentWord    = selected.word;
  quizState.currentExample = { english: selected.english, japanese: selected.japanese };

  // 直近リストを更新する
  var key = selected.word.id + '|' + selected.english;
  quizState.recentSentenceKeys.push(key);
  if (quizState.recentSentenceKeys.length > QUIZ_RECENT_MEMORY) {
    quizState.recentSentenceKeys.shift();
  }

  quizState.answered = false;
  renderSentenceQuestion(selected);
}

// 英文のアンダーバーヒントを生成する
// アルファベットを _ に置換し、スペース・句読点はそのまま残す
// 例: "I play soccer." → "_ ____ ______."
function buildSentenceHint(text) {
  var result = '';
  for (var i = 0; i < text.length; i++) {
    result += /[a-zA-Z]/.test(text[i]) ? '_' : text[i];
  }
  return result;
}

// 正解判定用に英文を正規化する（前後空白・大文字小文字・文末句読点を無視）
function normalizeSentence(str) {
  str = str.trim().toLowerCase();
  str = str.replace(/[.!?,;:]+$/, ''); // 文末の句読点を除去
  str = str.replace(/\s+/g, ' ').trim();
  return str;
}

// 英文入力クイズの問題画面を描画する
function renderSentenceQuestion(item) {
  var hint = buildSentenceHint(item.english);

  var html = ''
    + '<div class="quiz-question-meaning">' + escapeHtml(item.japanese) + '</div>'
    + '<div class="sentence-hint-box">'
    +   '<span class="sentence-hint-label">文字数ヒント:</span>'
    +   '<span class="sentence-hint">' + escapeHtml(hint) + '</span>'
    + '</div>'
    + '<div class="spell-input-area">'
    +   '<input type="text" class="spell-input" id="sentenceInput"'
    +     ' placeholder="英文を入力..." autocomplete="off" autocapitalize="none" spellcheck="false">'
    +   '<button class="spell-submit-btn" id="sentenceSubmitBtn" onclick="handleSentenceSubmit()">解答</button>'
    + '</div>'
    + '<div class="quiz-feedback" id="quizFeedback"></div>';

  document.getElementById('quizMessage').textContent = 'この日本語訳に対応する英文は？';
  document.getElementById('quizContent').innerHTML = html;

  // Enterキーでも解答できるようにする
  document.getElementById('sentenceInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') handleSentenceSubmit();
  });

  // 自動フォーカス
  document.getElementById('sentenceInput').focus();
}

// 英文入力クイズの解答を判定する
function handleSentenceSubmit() {
  if (quizState.answered) return;

  var inputEl = document.getElementById('sentenceInput');
  if (!inputEl) return;

  var inputValue = inputEl.value.trim();
  if (!inputValue) return; // 空欄は無視する

  var currentExample = quizState.currentExample;
  var questionWord   = quizState.currentWord;
  if (!currentExample || !questionWord) return;

  // 正規化して比較する（大文字小文字・文末句読点を無視）
  var isCorrect = normalizeSentence(inputValue) === normalizeSentence(currentExample.english);
  quizState.answered = true;

  // 入力欄と解答ボタンを無効化する
  inputEl.disabled = true;
  var submitBtn = document.getElementById('sentenceSubmitBtn');
  if (submitBtn) submitBtn.disabled = true;

  // 成績を記録する（単語レベルで記録）
  recordQuizResult(questionWord.id, isCorrect);

  var feedbackEl = document.getElementById('quizFeedback');
  var contentEl  = document.getElementById('quizContent');

  if (isCorrect) {
    feedbackEl.textContent = '正解！';
    feedbackEl.className = 'quiz-feedback correct';
  } else {
    feedbackEl.textContent = '不正解…';
    feedbackEl.className = 'quiz-feedback wrong';

    // 不正解時は正解の英文と日本語訳を表示する
    var detailDiv = document.createElement('div');
    detailDiv.className = 'spell-answer-detail';
    detailDiv.innerHTML = ''
      + '<div class="spell-answer-word" style="font-size:0.95rem; font-weight:600;">'
      +   escapeHtml(currentExample.english)
      + '</div>'
      + '<div class="spell-answer-meanings" style="margin-top:5px;">'
      +   '<span style="color:#999; font-size:0.85rem;">' + escapeHtml(currentExample.japanese) + '</span>'
      + '</div>';
    contentEl.appendChild(detailDiv);
  }

  // 「次の問題へ」「モード選択に戻る」ボタンを追加する
  var nextBtn = document.createElement('button');
  nextBtn.className = 'quiz-next-btn';
  nextBtn.textContent = '次の問題へ';
  nextBtn.onclick = showNextQuestion;

  var endBtn = document.createElement('button');
  endBtn.className = 'quiz-end-btn';
  endBtn.textContent = 'モード選択に戻る';
  endBtn.onclick = stopQuiz;

  contentEl.appendChild(nextBtn);
  contentEl.appendChild(endBtn);
}

// ===========================
// 例文穴埋めクイズ
// ===========================

// 正規表現用の特殊文字をエスケープする
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 単語がその例文（日本語訳付き）に単語境界付きで含まれているか確認する
function hasFillBlankExample(word) {
  if (!word.examples || word.examples.length === 0) return false;
  var regex = new RegExp('\\b' + escapeRegex(word.word) + '\\b', 'i');
  return word.examples.some(function(ex) {
    var eng = typeof ex === 'string' ? ex : (ex.english || '');
    var jpn = typeof ex === 'string' ? '' : (ex.japanese || '');
    return eng && jpn && regex.test(eng);
  });
}

// 英文中の対象単語を ___ に置換した文字列を返す（見つからなければ null）
function buildFillBlankSentence(english, targetWord) {
  var regex = new RegExp('\\b' + escapeRegex(targetWord) + '\\b', 'gi');
  if (!regex.test(english)) return null;
  regex.lastIndex = 0;
  return english.replace(regex, '___');
}

// 文字数ヒントを生成する（例: "play" → "_ _ _ _"）
function buildLetterHint(word) {
  return word.split('').map(function() { return '_'; }).join(' ');
}

// 穴埋めクイズ用の出題アイテムプールを作る
// 返値: { word, english, japanese, blanked } の配列
function buildFillBlankPool(wordPool) {
  var items = [];
  wordPool.forEach(function(word) {
    if (!word.examples) return;
    word.examples.forEach(function(ex) {
      var eng = typeof ex === 'string' ? ex : (ex.english || '');
      var jpn = typeof ex === 'string' ? '' : (ex.japanese || '');
      if (!eng || !jpn) return;
      var blanked = buildFillBlankSentence(eng, word.word);
      if (!blanked) return; // 例文中に単語が見つからない場合はスキップ
      items.push({ word: word, english: eng, japanese: jpn, blanked: blanked });
    });
  });
  return items;
}

// 例文穴埋めクイズの次の問題を選んで表示する
function showNextFillBlankQuestion() {
  var flatList = buildFlatPartList();
  var fbWordPool = flatList.filter(function(w) { return hasFillBlankExample(w); });
  if (fbWordPool.length === 0) {
    renderQuizError('例文穴埋めクイズには、単語本体が含まれた例文（日本語訳付き）が必要です。');
    return;
  }

  var filteredWordPool = buildQuizPool(fbWordPool, flatList);
  if (filteredWordPool === null) return;

  var allItems = buildFillBlankPool(filteredWordPool);
  if (allItems.length === 0) {
    renderQuizError('出題できる穴埋め例文がありません。');
    return;
  }

  // 直近に出題した例文を除外（全て除外されたらリセット）
  var freshItems = allItems.filter(function(item) {
    var key = item.word.id + '|' + item.english;
    return quizState.recentFillBlankKeys.indexOf(key) === -1;
  });
  if (freshItems.length === 0) {
    quizState.recentFillBlankKeys = [];
    freshItems = allItems;
  }

  var selected = selectWeightedSentenceItem(freshItems);
  quizState.currentWord    = selected.word;
  quizState.currentExample = { english: selected.english, japanese: selected.japanese };

  var key = selected.word.id + '|' + selected.english;
  quizState.recentFillBlankKeys.push(key);
  if (quizState.recentFillBlankKeys.length > QUIZ_RECENT_MEMORY) {
    quizState.recentFillBlankKeys.shift();
  }

  quizState.answered = false;
  renderFillBlankQuestion(selected);
}

// 例文穴埋めクイズの問題UIを描画する
function renderFillBlankQuestion(item) {
  var posLabel = partOfSpeechLabels[item.word.partOfSpeech] || item.word.partOfSpeech || '';
  var hint = buildLetterHint(item.word.word);

  var html = ''
    + '<div class="fillblank-sentence">' + escapeHtml(item.blanked) + '</div>'
    + '<div class="fillblank-japanese">' + escapeHtml(item.japanese) + '</div>'
    + '<div class="fillblank-hint">'
    +   '<span class="fillblank-hint-label">文字数ヒント:</span>'
    +   '<span class="fillblank-hint-chars">' + escapeHtml(hint) + '</span>'
    + '</div>'
    + '<div class="spell-input-area">'
    +   '<input type="text" class="spell-input" id="fillblankInput"'
    +     ' placeholder="空欄の英単語を入力..." autocomplete="off" autocapitalize="none" spellcheck="false">'
    +   '<button class="spell-submit-btn" id="fillblankSubmitBtn" onclick="handleFillBlankSubmit()">解答</button>'
    + '</div>'
    + '<div class="quiz-feedback" id="quizFeedback"></div>';

  document.getElementById('quizMessage').textContent = '空欄に入る英単語を入力してください';
  document.getElementById('quizContent').innerHTML = html;

  document.getElementById('fillblankInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') handleFillBlankSubmit();
  });
  document.getElementById('fillblankInput').focus();
}

// 例文穴埋めクイズの解答を判定する
function handleFillBlankSubmit() {
  if (quizState.answered) return;

  var inputEl = document.getElementById('fillblankInput');
  if (!inputEl) return;

  var inputValue = inputEl.value.trim();
  if (!inputValue) return;

  var questionWord   = quizState.currentWord;
  var currentExample = quizState.currentExample;
  if (!questionWord || !currentExample) return;

  // 大文字小文字を無視して完全一致で判定する
  var isCorrect = inputValue.toLowerCase() === questionWord.word.toLowerCase();
  quizState.answered = true;

  inputEl.disabled = true;
  var submitBtn = document.getElementById('fillblankSubmitBtn');
  if (submitBtn) submitBtn.disabled = true;

  recordQuizResult(questionWord.id, isCorrect);

  var feedbackEl = document.getElementById('quizFeedback');
  var contentEl  = document.getElementById('quizContent');
  var posLabel   = partOfSpeechLabels[questionWord.partOfSpeech] || questionWord.partOfSpeech || '';

  if (isCorrect) {
    feedbackEl.textContent = '正解！';
    feedbackEl.className = 'quiz-feedback correct';
  } else {
    feedbackEl.textContent = '不正解…';
    feedbackEl.className = 'quiz-feedback wrong';

    // 不正解時：正解の英単語・元の英文・日本語訳を表示する
    var detailDiv = document.createElement('div');
    detailDiv.className = 'spell-answer-detail';
    detailDiv.innerHTML = ''
      + '<div class="spell-answer-word">'
      +   escapeHtml(questionWord.word)
      +   (posLabel ? ' <span class="pos-badge">' + escapeHtml(posLabel) + '</span>' : '')
      + '</div>'
      + '<div style="margin-top:6px; font-size:0.9rem; color:#444;">'
      +   escapeHtml(currentExample.english)
      + '</div>'
      + '<div style="margin-top:4px; font-size:0.85rem; color:#888;">'
      +   escapeHtml(currentExample.japanese)
      + '</div>';
    contentEl.appendChild(detailDiv);
  }

  var nextBtn = document.createElement('button');
  nextBtn.className = 'quiz-next-btn';
  nextBtn.textContent = '次の問題へ';
  nextBtn.onclick = showNextQuestion;

  var endBtn = document.createElement('button');
  endBtn.className = 'quiz-end-btn';
  endBtn.textContent = 'モード選択に戻る';
  endBtn.onclick = stopQuiz;

  contentEl.appendChild(nextBtn);
  contentEl.appendChild(endBtn);
}

// ===========================
// 例文クイズ（4択）
// ===========================

// 例文プールから日本語訳の重複を除いたリストを返す
function getDistinctJapanese(items) {
  var seen = {};
  var result = [];
  for (var i = 0; i < items.length; i++) {
    var ja = items[i].japanese;
    if (ja && !seen[ja]) {
      seen[ja] = true;
      result.push(ja);
    }
  }
  return result;
}

// 正解以外の日本語訳をランダムにcount個選ぶ
function pickWrongJapanese(allItems, correctJapanese, count) {
  var pool = [];
  var seen = {};
  seen[correctJapanese] = true;
  for (var i = 0; i < allItems.length; i++) {
    var ja = allItems[i].japanese;
    if (ja && !seen[ja]) {
      seen[ja] = true;
      pool.push(ja);
    }
  }
  shuffleArray(pool);
  return pool.slice(0, count);
}

// 例文クイズの次の問題を表示する
function showNextExQuizQuestion() {
  var flatList = buildFlatPartList();
  var exWordPool = flatList.filter(function(w) { return hasSentence(w); });
  if (exWordPool.length === 0) {
    renderQuizError('例文クイズには、日本語訳が登録された例文が必要です。');
    return;
  }

  var filteredWordPool = buildQuizPool(exWordPool, flatList);
  if (filteredWordPool === null) return;

  var allItems = buildSentencePool(filteredWordPool);
  if (allItems.length === 0) {
    renderQuizError('出題できる例文がありません。');
    return;
  }

  var distinctJa = getDistinctJapanese(allItems);
  if (distinctJa.length < 4) {
    renderQuizError('例文クイズには、異なる日本語訳が4つ以上必要です。');
    return;
  }

  // 直近に出題した例文を除外（ただし全て除外されたらリセット）
  var recentKeys = quizState.recentExQuizKeys;
  var candidates = allItems.filter(function(item) {
    var key = item.word.id + '|' + item.english;
    return recentKeys.indexOf(key) === -1;
  });
  if (candidates.length === 0) {
    quizState.recentExQuizKeys = [];
    candidates = allItems;
  }

  var item = selectWeightedSentenceItem(candidates);
  var itemKey = item.word.id + '|' + item.english;
  quizState.recentExQuizKeys.push(itemKey);
  if (quizState.recentExQuizKeys.length > QUIZ_RECENT_MEMORY) {
    quizState.recentExQuizKeys.shift();
  }

  quizState.currentWord = item.word;
  quizState.currentExample = { english: item.english, japanese: item.japanese };
  quizState.answered = false;

  // 選択肢を作る：正解1つ＋不正解3つ
  var wrongChoices = pickWrongJapanese(allItems, item.japanese, 3);
  if (wrongChoices.length < 3) {
    renderQuizError('選択肢を4つ用意できません。例文の日本語訳をもっと登録してください。');
    return;
  }
  var choices = wrongChoices.concat([item.japanese]);
  shuffleArray(choices);

  renderExQuizQuestion(item, choices);
}

// 例文クイズの問題UIを描画する
function renderExQuizQuestion(item, choices) {
  var posLabel = partOfSpeechLabels[item.word.partOfSpeech] || item.word.partOfSpeech || '';
  var choiceButtons = choices.map(function(ja) {
    return '<button class="quiz-choice-btn" data-value="' + escapeForAttr(ja) + '" onclick="handleExQuizChoiceClick(this)">'
      + escapeHtml(ja) + '</button>';
  }).join('');

  var html = ''
    + '<div class="quiz-question-sentence">' + escapeHtml(item.english) + '</div>'
    + '<div class="quiz-question-source">出典: <strong>' + escapeHtml(item.word.word) + '</strong>'
    + (posLabel ? ' <span class="pos-badge">' + escapeHtml(posLabel) + '</span>' : '') + '</div>'
    + '<div class="quiz-choices">' + choiceButtons + '</div>'
    + '<div class="quiz-feedback" id="quizFeedback"></div>';

  document.getElementById('quizMessage').textContent = '次の英文の日本語訳はどれですか？';
  document.getElementById('quizContent').innerHTML = html;
}

// 例文クイズの選択肢ボタンがクリックされたときの処理
function handleExQuizChoiceClick(clickedBtn) {
  if (quizState.answered) return;
  quizState.answered = true;

  var selected = clickedBtn.getAttribute('data-value');
  var correct = quizState.currentExample.japanese;
  var isCorrect = (selected === correct);

  recordQuizResult(quizState.currentWord.id, isCorrect);

  // ボタンに正解・不正解の色を付ける
  var allBtns = document.querySelectorAll('.quiz-choice-btn');
  for (var i = 0; i < allBtns.length; i++) {
    var btn = allBtns[i];
    btn.disabled = true;
    if (btn.getAttribute('data-value') === correct) {
      btn.classList.add('correct');
    } else if (btn === clickedBtn && !isCorrect) {
      btn.classList.add('wrong');
    }
  }

  var feedbackEl = document.getElementById('quizFeedback');
  if (isCorrect) {
    feedbackEl.textContent = '正解！';
    feedbackEl.style.color = '#27ae60';
  } else {
    feedbackEl.textContent = '不正解。正解: ' + correct;
    feedbackEl.style.color = '#e74c3c';
  }

  // 「次の問題へ」「モード選択に戻る」ボタンを追加する
  var nextBtn = document.createElement('button');
  nextBtn.className = 'quiz-next-btn';
  nextBtn.textContent = '次の問題へ';
  nextBtn.onclick = showNextQuestion;

  var endBtn = document.createElement('button');
  endBtn.className = 'quiz-end-btn';
  endBtn.textContent = 'モード選択に戻る';
  endBtn.onclick = stopQuiz;

  var contentEl = document.getElementById('quizContent');
  contentEl.appendChild(nextBtn);
  contentEl.appendChild(endBtn);
}

// クイズエラーメッセージを表示する（出題中のエラー）
function renderQuizError(message) {
  document.getElementById('quizMessage').textContent = '';
  // モード選択エリアを再表示してエラーを見せる
  document.getElementById('quizModeArea').style.display = 'block';
  renderQuizModeSelector();
  showModeError(message);
  document.getElementById('quizContent').innerHTML = '';
}

// onclick属性に埋め込む文字列のシングルクォートをエスケープする
function escapeForAttr(str) {
  if (!str) return '';
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// ===========================
// クイズページの初期化
// ===========================

renderQuizModeSelector();
