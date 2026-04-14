// ===========================
// データ管理
// ===========================

// localStorageに保存するキー
var STORAGE_KEY = 'englishVocabApp_v1';

// メモリ上の単語リスト
var wordList = [];

// 編集中の単語のID（新規追加の場合はnull）
var editingWordId = null;

// 編集中の品詞のID（新規追加の場合はnull）
var editingPartId = null;

// 削除対象の単語のID
var deletingWordId = null;

// 削除対象の品詞のID
var deletingPartId = null;

// 現在のフィルター（'all' / 'favorite' / 'weak'）
var currentFilter = 'all';

// 各単語カードで表示中の品詞インデックス（word.id → partIndex）
var activePartIndex = {};

// 品詞を並び替えるための順序定義
var partOfSpeechOrder = {
  noun: 1,
  verb: 2,
  adjective: 3,
  adverb: 4,
  preposition: 5,
  conjunction: 6,
  pronoun: 7,
  phrase: 8,
  other: 9
};

// 品詞の表示ラベル
var partOfSpeechLabels = {
  noun: 'noun（名詞）',
  verb: 'verb（動詞）',
  adjective: 'adjective（形容詞）',
  adverb: 'adverb（副詞）',
  preposition: 'preposition（前置詞）',
  conjunction: 'conjunction（接続詞）',
  pronoun: 'pronoun（代名詞）',
  phrase: 'phrase（熟語）',
  other: 'other（その他）'
};

// localStorageから単語データを読み込む（旧形式からの自動マイグレーション付き）
function loadWords() {
  var stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      var parsed = JSON.parse(stored);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        wordList = [];
        return;
      }
      // 旧形式の検出: 先頭要素がトップレベルに partOfSpeech を持ち parts を持たない
      if (parsed[0].partOfSpeech !== undefined && !parsed[0].parts) {
        wordList = migrateOldFormat(parsed);
        saveWords(); // マイグレーション済みデータを即保存
      } else {
        wordList = parsed;
        // parts 内の欠損フィールドを補完する
        wordList.forEach(function(word) {
          if (!word.parts) word.parts = [];
          word.parts.forEach(function(part) {
            if (!part.id) part.id = generateId();
            if (typeof part.correct !== 'number') part.correct = 0;
            if (typeof part.wrong !== 'number') part.wrong = 0;
          });
        });
      }
    } catch (e) {
      wordList = [];
    }
  } else {
    wordList = [];
  }
}

// 旧形式（単語＋品詞がフラットなレコード）を新形式（単語に parts[] を持つ）に変換する
function migrateOldFormat(oldItems) {
  var wordMap = {};
  var wordOrder = [];

  oldItems.forEach(function(item) {
    var key = item.word.toLowerCase();
    if (!wordMap[key]) {
      wordMap[key] = {
        id: item.id,
        word: item.word,
        createdAt: item.createdAt || Date.now(),
        parts: []
      };
      wordOrder.push(key);
    }
    // 旧形式の例文（文字列配列）を {english, japanese} に変換する
    var examples = item.examples || [];
    if (examples.length > 0 && typeof examples[0] === 'string') {
      examples = examples.map(function(ex) { return { english: ex, japanese: '' }; });
    }
    wordMap[key].parts.push({
      id: generateId(),
      partOfSpeech: item.partOfSpeech || 'other',
      meanings: item.meanings || [],
      examples: examples,
      isFavorite: item.isFavorite || false,
      isWeak: item.isWeak || false,
      correct: typeof item.correct === 'number' ? item.correct : 0,
      wrong: typeof item.wrong === 'number' ? item.wrong : 0,
      createdAt: item.createdAt || Date.now()
    });
  });

  return wordOrder.map(function(key) { return wordMap[key]; });
}

// 単語データをlocalStorageに保存する
function saveWords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(wordList));
}

// 一意なIDを生成する
function generateId() {
  return Date.now().toString() + Math.random().toString(36).slice(2, 8);
}

// ===========================
// フォーム表示・非表示
// ===========================

// 「単語を追加する」ボタンを押したときの処理
function handleFormToggle() {
  var formSection = document.getElementById('formSection');
  var isVisible = formSection.style.display !== 'none';
  if (isVisible) {
    cancelForm();
  } else {
    openFormForNew();
  }
}

// フォームを「新規追加」モードで開く
function openFormForNew() {
  editingWordId = null;
  document.getElementById('formTitle').textContent = '新しい単語を追加';
  document.getElementById('openFormBtn').textContent = '✕ 閉じる';
  resetFormFields();
  document.getElementById('formSection').style.display = 'block';
  document.getElementById('formSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// フォームをキャンセルして閉じる
function cancelForm() {
  editingWordId = null;
  editingPartId = null;
  document.getElementById('formSection').style.display = 'none';
  document.getElementById('openFormBtn').textContent = '＋ 単語を追加する';
  hideError('wordError');
  hideError('meaningError');
  resetFormImageState();
}

// フォームの各入力欄を初期状態にリセットする
function resetFormFields() {
  document.getElementById('inputWord').value = '';
  document.getElementById('inputPartOfSpeech').value = 'noun';
  hideError('wordError');
  hideError('meaningError');

  // 意味の入力欄を1つにリセット
  var meaningsContainer = document.getElementById('meaningsContainer');
  meaningsContainer.innerHTML = '';
  meaningsContainer.appendChild(createDynamicInputItem('', '例: 語彙、単語'));

  // 例文の入力欄を1セットにリセット
  var examplesContainer = document.getElementById('examplesContainer');
  examplesContainer.innerHTML = '';
  examplesContainer.appendChild(createExamplePairItem('', ''));

  resetFormImageState();
}

// 動的入力欄（入力テキスト + 削除ボタン）のDOM要素を作成して返す
function createDynamicInputItem(value, placeholder) {
  var div = document.createElement('div');
  div.className = 'dynamic-input-item';

  var input = document.createElement('input');
  input.type = 'text';
  input.value = value || '';
  input.placeholder = placeholder || '';

  var removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'remove-item-btn';
  removeBtn.textContent = '×';
  removeBtn.title = '削除';
  removeBtn.onclick = function() {
    removeDynamicInputItem(removeBtn);
  };

  div.appendChild(input);
  div.appendChild(removeBtn);
  return div;
}

// 意味の入力欄を1行追加する
function addMeaningInput() {
  var container = document.getElementById('meaningsContainer');
  container.appendChild(createDynamicInputItem('', '例: 語彙、単語'));
}

// 例文のペア入力欄を1セット追加する
function addExampleInput() {
  var container = document.getElementById('examplesContainer');
  container.appendChild(createExamplePairItem('', ''));
}

// 動的入力欄（意味）の削除ボタンを押したときの処理
// 最後の1行は削除せず、内容だけクリアする
function removeDynamicInputItem(button) {
  var container = button.closest('.dynamic-input-list');
  var items = container.querySelectorAll('.dynamic-input-item');
  if (items.length <= 1) {
    // 最後の1行なので中身だけクリア
    container.querySelector('input').value = '';
    return;
  }
  button.closest('.dynamic-input-item').remove();
}

// 例文ペア入力欄（英文＋日本語訳）のDOM要素を作成して返す
function createExamplePairItem(english, japanese) {
  var div = document.createElement('div');
  div.className = 'example-pair-item';

  // 英文・日本語訳の入力欄をまとめるdiv
  var inputsDiv = document.createElement('div');
  inputsDiv.className = 'example-pair-inputs';

  var engInput = document.createElement('input');
  engInput.type = 'text';
  engInput.className = 'example-english-input';
  engInput.value = english || '';
  engInput.placeholder = '英文（例: She has a wide vocabulary.）';

  var jpInput = document.createElement('input');
  jpInput.type = 'text';
  jpInput.className = 'example-japanese-input input-japanese';
  jpInput.value = japanese || '';
  jpInput.placeholder = '日本語訳（省略可）';

  inputsDiv.appendChild(engInput);
  inputsDiv.appendChild(jpInput);

  // 削除ボタン
  var removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'remove-item-btn';
  removeBtn.textContent = '×';
  removeBtn.title = 'この例文を削除';
  removeBtn.onclick = function() {
    removeExamplePairItem(removeBtn);
  };

  div.appendChild(inputsDiv);
  div.appendChild(removeBtn);
  return div;
}

// 例文ペア削除ボタンを押したときの処理
// 最後の1セットは削除せず、両欄をクリアする
function removeExamplePairItem(button) {
  var container = document.getElementById('examplesContainer');
  var items = container.querySelectorAll('.example-pair-item');
  if (items.length <= 1) {
    // 最後の1セットなので中身だけクリア
    var inputs = button.closest('.example-pair-item').querySelectorAll('input');
    inputs.forEach(function(inp) { inp.value = ''; });
    return;
  }
  button.closest('.example-pair-item').remove();
}

// コンテナ内の全input要素から値を取得する（空のものは除く）
// 意味欄で使用する
function getInputValuesFromContainer(containerId) {
  var container = document.getElementById(containerId);
  var inputs = container.querySelectorAll('input[type="text"]');
  var values = [];
  inputs.forEach(function(input) {
    var val = input.value.trim();
    if (val) {
      values.push(val);
    }
  });
  return values;
}

// 例文コンテナから {english, japanese} の配列を取得する
// 英文が空のものは除く
function getExamplesFromContainer() {
  var container = document.getElementById('examplesContainer');
  var items = container.querySelectorAll('.example-pair-item');
  var examples = [];
  items.forEach(function(item) {
    var engInput = item.querySelector('.example-english-input');
    var jpInput = item.querySelector('.example-japanese-input');
    var english = engInput ? engInput.value.trim() : '';
    var japanese = jpInput ? jpInput.value.trim() : '';
    // 英文が入力されているものだけ保存する
    if (english) {
      examples.push({ english: english, japanese: japanese });
    }
  });
  return examples;
}

// ===========================
// 単語の保存（追加 / 更新）
// ===========================

function saveWord() {
  var wordInput = document.getElementById('inputWord').value.trim();
  var partOfSpeech = document.getElementById('inputPartOfSpeech').value;
  var meanings = getInputValuesFromContainer('meaningsContainer');
  var examples = getExamplesFromContainer();

  // 英単語が入力されているか確認
  if (!wordInput) {
    showError('wordError', '英単語を入力してください。');
    return;
  }
  hideError('wordError');

  // 意味が1つ以上入力されているか確認
  if (meanings.length === 0) {
    showError('meaningError', '日本語の意味を1つ以上入力してください。');
    return;
  }
  hideError('meaningError');

  if (editingPartId) {
    // ===== 編集モード: 特定の品詞データを更新する =====
    var targetWord = wordList.find(function(w) { return w.id === editingWordId; });
    if (!targetWord) { cancelForm(); return; }
    var targetPart = targetWord.parts.find(function(p) { return p.id === editingPartId; });
    if (!targetPart) { cancelForm(); return; }

    // 重複チェック: 同じ単語名で同じ品詞が（編集中以外に）存在しないか
    var wordKey = wordInput.toLowerCase();
    var isDuplicate = wordList.some(function(w) {
      return w.word.toLowerCase() === wordKey && w.parts.some(function(p) {
        return p.id !== editingPartId && p.partOfSpeech === partOfSpeech;
      });
    });
    if (isDuplicate) {
      var posLabel = partOfSpeechLabels[partOfSpeech] || partOfSpeech;
      showError('wordError', '「' + wordInput + ' / ' + posLabel + '」はすでに登録されています。');
      return;
    }

    // 単語名の変更（全品詞に影響）
    targetWord.word = wordInput;
    // 品詞データの更新
    targetPart.partOfSpeech = partOfSpeech;
    targetPart.meanings = meanings;
    targetPart.examples = examples;
    // 画像の処理は後続の finalize 内で行うため、ここではスキップ

  } else {
    // ===== 新規モード: 単語またはその中の品詞を追加する =====
    var wordKey = wordInput.toLowerCase();
    var existingWord = wordList.find(function(w) { return w.word.toLowerCase() === wordKey; });

    if (existingWord) {
      // 同じ単語が既に存在する場合: 品詞の重複チェック
      var isDuplicate = existingWord.parts.some(function(p) {
        return p.partOfSpeech === partOfSpeech;
      });
      if (isDuplicate) {
        var posLabel = partOfSpeechLabels[partOfSpeech] || partOfSpeech;
        showError('wordError', '「' + wordInput + ' / ' + posLabel + '」はすでに登録されています。同じ単語でも品詞が違えば追加できます。');
        return;
      }
      // 既存の単語に新しい品詞として追加する
      var newPart = {
        id: generateId(),
        partOfSpeech: partOfSpeech,
        meanings: meanings,
        examples: examples,
        isFavorite: false,
        isWeak: false,
        correct: 0,
        wrong: 0,
        createdAt: Date.now()
      };
      existingWord.parts.push(newPart);
      // 追加した品詞を表示するようにタブを切り替える
      activePartIndex[existingWord.id] = existingWord.parts.length - 1;
    } else {
      // 新しい単語として追加する
      var newWord = {
        id: generateId(),
        word: wordInput,
        createdAt: Date.now(),
        parts: [{
          id: generateId(),
          partOfSpeech: partOfSpeech,
          meanings: meanings,
          examples: examples,
          isFavorite: false,
          isWeak: false,
          correct: 0,
          wrong: 0,
          createdAt: Date.now()
        }]
      };
      wordList.push(newWord);
    }
  }

  // 画像処理を行ってから保存・再描画を確定する
  finalizeImageAndSave();
}

// 画像の保存/削除を非同期で行い、完了後にデータを保存して画面を更新する
function finalizeImageAndSave() {
  var mode = formImageState.mode;

  if (mode === 'new') {
    // 新しい画像をリサイズして保存する
    var newImageId = 'img_' + generateId();
    var file = formImageState.file;
    // 対象の品詞データに imageId をセットする
    var targetPart = getTargetPartForSave();
    if (targetPart) targetPart.imageId = newImageId;
    resizeAndSaveImage(file, newImageId, function() {
      saveWords();
      cancelForm();
      renderWordList();
    });

  } else if (mode === 'delete') {
    // 既存画像を削除する
    var oldImageId = formImageState.existingId;
    var targetPart = getTargetPartForSave();
    if (targetPart) delete targetPart.imageId;
    deleteImageFromDB(oldImageId, function() {
      delete imageCache[oldImageId];
      saveWords();
      cancelForm();
      renderWordList();
    });

  } else {
    // 'keep' または 'none': 画像に変更なし
    saveWords();
    cancelForm();
    renderWordList();
  }
}

// saveWord が確定した品詞オブジェクトへの参照を返す
function getTargetPartForSave() {
  if (editingPartId) {
    var w = wordList.find(function(w) { return w.id === editingWordId; });
    if (!w) return null;
    return w.parts.find(function(p) { return p.id === editingPartId; }) || null;
  }
  // 新規追加: 最後に push/追加された品詞
  var wordInput = document.getElementById('inputWord').value.trim().toLowerCase();
  var existingWord = wordList.find(function(w) { return w.word.toLowerCase() === wordInput; });
  if (existingWord) return existingWord.parts[existingWord.parts.length - 1] || null;
  var newWord = wordList[wordList.length - 1];
  if (newWord) return newWord.parts[newWord.parts.length - 1] || null;
  return null;
}

// ===========================
// 単語の編集
// ===========================

function startEditWord(wordId, partId) {
  var word = wordList.find(function(w) { return w.id === wordId; });
  if (!word) return;
  var part = word.parts.find(function(p) { return p.id === partId; });
  if (!part) return;

  editingWordId = wordId;
  editingPartId = partId;

  // フォームタイトルとボタン表示を変更
  var posLabel = partOfSpeechLabels[part.partOfSpeech] || part.partOfSpeech;
  document.getElementById('formTitle').textContent = '「' + word.word + ' / ' + posLabel + '」を編集';
  document.getElementById('openFormBtn').textContent = '✕ 閉じる';
  hideError('wordError');
  hideError('meaningError');

  // 英単語と品詞をセット
  document.getElementById('inputWord').value = word.word;
  document.getElementById('inputPartOfSpeech').value = part.partOfSpeech;

  // 意味の入力欄をセット
  var meaningsContainer = document.getElementById('meaningsContainer');
  meaningsContainer.innerHTML = '';
  var meaningsData = part.meanings.length > 0 ? part.meanings : [''];
  meaningsData.forEach(function(meaning) {
    meaningsContainer.appendChild(createDynamicInputItem(meaning, '例: 語彙、単語'));
  });

  // 例文の入力欄をセット（{english, japanese} 形式）
  var examplesContainer = document.getElementById('examplesContainer');
  examplesContainer.innerHTML = '';
  if (part.examples && part.examples.length > 0) {
    part.examples.forEach(function(example) {
      var eng = typeof example === 'string' ? example : (example.english || '');
      var jpn = typeof example === 'string' ? '' : (example.japanese || '');
      examplesContainer.appendChild(createExamplePairItem(eng, jpn));
    });
  } else {
    examplesContainer.appendChild(createExamplePairItem('', ''));
  }

  // 画像状態をセットアップする
  resetFormImageState();
  if (part.imageId) {
    formImageState.mode = 'keep';
    formImageState.existingId = part.imageId;
    loadImageForForm(part.imageId);
  }

  // フォームを表示してスクロール
  document.getElementById('formSection').style.display = 'block';
  document.getElementById('formSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ===========================
// 単語の削除
// ===========================

function openDeleteModal(wordId, partId) {
  var word = wordList.find(function(w) { return w.id === wordId; });
  if (!word) return;
  var part = word.parts.find(function(p) { return p.id === partId; });
  if (!part) return;

  deletingWordId = wordId;
  deletingPartId = partId;

  var posLabel = partOfSpeechLabels[part.partOfSpeech] || part.partOfSpeech;
  var msg = word.parts.length === 1
    ? '「' + word.word + '」を削除します。この操作は取り消せません。'
    : '「' + word.word + ' / ' + posLabel + '」を削除します。他の品詞には影響しません。この操作は取り消せません。';
  document.getElementById('deleteModalText').textContent = msg;
  document.getElementById('deleteModal').classList.add('active');
}

function confirmDelete() {
  if (!deletingWordId || !deletingPartId) return;
  var word = wordList.find(function(w) { return w.id === deletingWordId; });
  var imageIdToDelete = null;
  if (word) {
    var deletingPart = word.parts.find(function(p) { return p.id === deletingPartId; });
    if (deletingPart && deletingPart.imageId) {
      imageIdToDelete = deletingPart.imageId;
    }
    word.parts = word.parts.filter(function(p) { return p.id !== deletingPartId; });
    if (word.parts.length === 0) {
      // 品詞がなくなった場合は単語ごと削除する
      wordList = wordList.filter(function(w) { return w.id !== deletingWordId; });
      delete activePartIndex[deletingWordId];
    } else {
      // タブインデックスが範囲外にならないよう調整する
      var idx = activePartIndex[deletingWordId] || 0;
      if (idx >= word.parts.length) {
        activePartIndex[deletingWordId] = word.parts.length - 1;
      }
    }
  }
  saveWords();
  deletingWordId = null;
  deletingPartId = null;
  closeDeleteModal();
  renderWordList();
  // 画像をバックグラウンドで削除する（UIには影響しない）
  if (imageIdToDelete) {
    deleteImageFromDB(imageIdToDelete);
    delete imageCache[imageIdToDelete];
  }
}

function closeDeleteModal() {
  document.getElementById('deleteModal').classList.remove('active');
  deletingWordId = null;
  deletingPartId = null;
}

// ===========================
// お気に入り・苦手のトグル
// ===========================

function toggleFavorite(wordId, partId) {
  var word = wordList.find(function(w) { return w.id === wordId; });
  if (!word) return;
  var part = word.parts.find(function(p) { return p.id === partId; });
  if (!part) return;
  part.isFavorite = !part.isFavorite;
  saveWords();
  renderWordList();
}

function toggleWeak(wordId, partId) {
  var word = wordList.find(function(w) { return w.id === wordId; });
  if (!word) return;
  var part = word.parts.find(function(p) { return p.id === partId; });
  if (!part) return;
  part.isWeak = !part.isWeak;
  saveWords();
  renderWordList();
}

// ===========================
// フィルター
// ===========================

function setFilter(filter, clickedButton) {
  currentFilter = filter;
  // すべてのフィルターボタンのactiveクラスを外す
  document.querySelectorAll('.filter-btn').forEach(function(btn) {
    btn.classList.remove('active');
  });
  clickedButton.classList.add('active');
  renderWordList();
}

// ===========================
// 一覧の描画（検索・並び替え・フィルター含む）
// ===========================

function renderWordList() {
  var searchQuery = document.getElementById('searchInput').value.trim().toLowerCase();
  var sortBy = document.getElementById('sortSelect').value;
  var showMeaning = document.getElementById('meaningToggle').checked;
  var listContainer = document.getElementById('wordCardList');
  var wordCountEl = document.getElementById('wordCountText');

  // フィルタリング（いずれかの品詞が条件を満たす単語を通す）
  var filtered = wordList.filter(function(word) {
    if (currentFilter === 'favorite') {
      return word.parts.some(function(p) { return p.isFavorite; });
    }
    if (currentFilter === 'weak') {
      return word.parts.some(function(p) { return p.isWeak; });
    }
    return true;
  });

  // 検索（英単語 or いずれかの品詞の意味）
  if (searchQuery) {
    filtered = filtered.filter(function(word) {
      if (word.word.toLowerCase().includes(searchQuery)) return true;
      return word.parts.some(function(part) {
        return part.meanings.some(function(m) {
          return m.toLowerCase().includes(searchQuery);
        });
      });
    });
  }

  // 並び替え
  filtered.sort(function(a, b) {
    if (sortBy === 'newest') {
      return b.createdAt - a.createdAt;
    }
    if (sortBy === 'oldest') {
      return a.createdAt - b.createdAt;
    }
    if (sortBy === 'az') {
      return a.word.toLowerCase().localeCompare(b.word.toLowerCase());
    }
    if (sortBy === 'pos') {
      // 各単語の「最も品詞順序が早い品詞」で並び替える
      var minOrderA = Math.min.apply(null, a.parts.map(function(p) { return partOfSpeechOrder[p.partOfSpeech] || 99; }));
      var minOrderB = Math.min.apply(null, b.parts.map(function(p) { return partOfSpeechOrder[p.partOfSpeech] || 99; }));
      if (minOrderA !== minOrderB) return minOrderA - minOrderB;
      return a.word.toLowerCase().localeCompare(b.word.toLowerCase());
    }
    return 0;
  });

  // 件数表示を更新（単語数 / 品詞数）
  var totalParts = wordList.reduce(function(sum, w) { return sum + w.parts.length; }, 0);
  wordCountEl.textContent = filtered.length + ' 語 / 全 ' + wordList.length + ' 語（' + totalParts + ' 品詞）';

  // カードを描画
  if (filtered.length === 0) {
    listContainer.innerHTML = buildEmptyStateHtml(searchQuery);
    return;
  }

  listContainer.innerHTML = filtered.map(function(word) {
    return buildWordCardHtml(word, showMeaning);
  }).join('');
  loadCardImages();
}

// 単語カードのHTMLを構築して返す（品詞タブ付き）
function buildWordCardHtml(word, showMeaning) {
  if (!word.parts || word.parts.length === 0) return '';

  // 現在選択中の品詞インデックス（デフォルトは0）
  var partIdx = activePartIndex[word.id] || 0;
  if (partIdx >= word.parts.length) partIdx = 0;
  var part = word.parts[partIdx];

  // カードのクラス名（現在の品詞のお気に入り・苦手状態を反映）
  var cardClasses = 'word-card';
  if (part.isFavorite) cardClasses += ' is-favorite';
  if (part.isWeak) cardClasses += ' is-weak';

  // 品詞タブ（複数品詞がある場合のみ表示）
  var tabsHtml = '';
  if (word.parts.length > 1) {
    var tabs = word.parts.map(function(p, i) {
      var label = partOfSpeechLabels[p.partOfSpeech] || p.partOfSpeech;
      var cls = 'pos-tab-btn' + (i === partIdx ? ' active' : '');
      return '<button class="' + cls + '" onclick="selectWordPart(\'' + word.id + '\', ' + i + ')">'
        + escapeHtml(label) + '</button>';
    }).join('');
    tabsHtml = '<div class="pos-tabs">' + tabs + '</div>';
  } else {
    // 品詞が1つの場合はバッジで表示
    var posLabel = partOfSpeechLabels[part.partOfSpeech] || part.partOfSpeech;
    tabsHtml = '<span class="pos-badge">' + escapeHtml(posLabel) + '</span>';
  }

  // お気に入り・苦手ボタン（現在の品詞用）
  var favoriteClass = part.isFavorite ? 'flag-btn favorite-on' : 'flag-btn';
  var favoriteLabel = part.isFavorite ? '★ お気に入り' : '☆ お気に入り';
  var weakClass = part.isWeak ? 'flag-btn weak-on' : 'flag-btn';
  var weakLabel = part.isWeak ? '！ 苦手' : '・ 苦手';

  // 意味セクション
  var meaningsHtml;
  if (showMeaning) {
    var meaningItems = part.meanings.map(function(m) {
      return '<li>' + escapeHtml(m) + '</li>';
    }).join('');
    meaningsHtml = '<ul class="meanings-list">' + meaningItems + '</ul>';
  } else {
    meaningsHtml = '<p class="meaning-hidden-text">（意味を非表示中 — 暗記モード）</p>';
  }

  // 例文セクション（例文がある場合のみ表示）
  var examplesHtml = '';
  if (part.examples && part.examples.length > 0) {
    var exampleItems = part.examples.map(function(ex) {
      var engText = typeof ex === 'string' ? ex : (ex.english || '');
      var jpText  = typeof ex === 'string' ? '' : (ex.japanese || '');
      var html = '<li>';
      if (engText) {
        var engEscaped = escapeForAttr(engText);
        html += '<div class="example-row">'
          + '<div class="example-english">' + escapeHtml(engText) + '</div>'
          + '<button class="copy-btn" onclick="copyExample(\'' + engEscaped + '\', this)" title="例文をコピー">コピー</button>'
          + '</div>';
      } else {
        html += '<div class="example-english">' + escapeHtml(engText) + '</div>';
      }
      if (jpText) {
        html += '<div class="example-japanese">' + escapeHtml(jpText) + '</div>';
      }
      html += '</li>';
      return html;
    }).join('');
    examplesHtml = ''
      + '<div class="card-section">'
      + '<div class="card-section-label">例文</div>'
      + '<ul class="examples-list">' + exampleItems + '</ul>'
      + '</div>';
  }

  // クイズ成績（現在の品詞のもの）
  var correct = typeof part.correct === 'number' ? part.correct : 0;
  var wrong   = typeof part.wrong   === 'number' ? part.wrong   : 0;
  var total   = correct + wrong;
  var statsHtml;
  if (total === 0) {
    statsHtml = ''
      + '<div class="card-stats">'
      + '<span class="stat-item">正解: <span>0</span></span>'
      + '<span class="stat-item">不正解: <span>0</span></span>'
      + '<span class="stat-accuracy not-tried">未出題</span>'
      + '</div>';
  } else {
    var rate = Math.round((correct / total) * 100);
    var rateClass = rate >= 80 ? 'high' : rate >= 50 ? 'mid' : 'low';
    statsHtml = ''
      + '<div class="card-stats">'
      + '<span class="stat-item">正解: <span>' + correct + '</span></span>'
      + '<span class="stat-item">不正解: <span>' + wrong + '</span></span>'
      + '<span class="stat-accuracy ' + rateClass + '">正答率 ' + rate + '%</span>'
      + '</div>';
  }

  // 画像セクション（画像が登録されている場合のみ表示）
  var imageHtml = '';
  if (part.imageId) {
    imageHtml = '<div class="card-image-area">'
      + '<img class="card-image-img" data-image-id="' + escapeHtml(part.imageId) + '" alt="' + escapeHtml(word.word) + '">'
      + '</div>';
  }

  var wordEscaped = escapeForAttr(word.word);
  return ''
    + '<div class="' + cardClasses + '" data-word-id="' + word.id + '">'
    +   '<div class="card-header">'
    +     '<div class="word-title-area">'
    +       '<div class="word-title-row">'
    +         '<div class="word-title">' + escapeHtml(word.word) + '</div>'
    +         '<button class="copy-btn" onclick="copyWord(\'' + wordEscaped + '\', this)" title="単語をコピー">コピー</button>'
    +       '</div>'
    +       tabsHtml
    +     '</div>'
    +     '<div class="card-flag-buttons">'
    +       '<button class="' + favoriteClass + '" onclick="toggleFavorite(\'' + word.id + '\', \'' + part.id + '\')">' + favoriteLabel + '</button>'
    +       '<button class="' + weakClass + '" onclick="toggleWeak(\'' + word.id + '\', \'' + part.id + '\')">' + weakLabel + '</button>'
    +     '</div>'
    +   '</div>'
    +   imageHtml
    +   '<div class="card-section">'
    +     '<div class="card-section-label">意味</div>'
    +     meaningsHtml
    +   '</div>'
    +   examplesHtml
    +   statsHtml
    +   '<div class="card-actions">'
    +     '<button class="btn-edit" onclick="startEditWord(\'' + word.id + '\', \'' + part.id + '\')">編集</button>'
    +     '<button class="btn-delete" onclick="openDeleteModal(\'' + word.id + '\', \'' + part.id + '\')">削除</button>'
    +   '</div>'
    + '</div>';
}

// 品詞タブがクリックされたときに表示する品詞を切り替える
function selectWordPart(wordId, partIndex) {
  activePartIndex[wordId] = partIndex;
  renderWordList();
}

// 空の状態のHTMLを返す
function buildEmptyStateHtml(searchQuery) {
  if (searchQuery || currentFilter !== 'all') {
    return ''
      + '<div class="empty-state">'
      + '<div class="empty-state-icon">🔍</div>'
      + '<p>条件に一致する単語が見つかりませんでした。</p>'
      + '</div>';
  }
  return ''
    + '<div class="empty-state">'
    + '<div class="empty-state-icon">📚</div>'
    + '<p>まだ単語が登録されていません。<br>「＋ 単語を追加する」から登録しましょう。</p>'
    + '</div>';
}

// ===========================
// IndexedDB（画像ストレージ）
// ===========================

var IMAGE_DB_NAME = 'englishVocabImages';
var IMAGE_DB_VERSION = 1;
var IMAGE_STORE_NAME = 'images';
var imageDB = null; // 一度開いた DB 接続を再利用する

// DB を初期化して接続し、callback(db) を呼ぶ
function initImageDB(callback) {
  if (imageDB) { callback(imageDB); return; }
  var req = indexedDB.open(IMAGE_DB_NAME, IMAGE_DB_VERSION);
  req.onupgradeneeded = function(e) {
    var db = e.target.result;
    if (!db.objectStoreNames.contains(IMAGE_STORE_NAME)) {
      db.createObjectStore(IMAGE_STORE_NAME, { keyPath: 'id' });
    }
  };
  req.onsuccess = function(e) {
    imageDB = e.target.result;
    callback(imageDB);
  };
  req.onerror = function() {
    console.error('IndexedDB の初期化に失敗しました');
    callback(null);
  };
}

// 画像を IndexedDB に保存する（上書き）
function saveImageToDB(imageId, dataUrl, callback) {
  initImageDB(function(db) {
    if (!db) { if (callback) callback(false); return; }
    var tx = db.transaction(IMAGE_STORE_NAME, 'readwrite');
    var store = tx.objectStore(IMAGE_STORE_NAME);
    var req = store.put({ id: imageId, dataUrl: dataUrl });
    req.onsuccess = function() { if (callback) callback(true); };
    req.onerror   = function() { if (callback) callback(false); };
  });
}

// 画像を IndexedDB から取得し、callback(dataUrl | null) を呼ぶ
function getImageFromDB(imageId, callback) {
  initImageDB(function(db) {
    if (!db) { callback(null); return; }
    var tx = db.transaction(IMAGE_STORE_NAME, 'readonly');
    var store = tx.objectStore(IMAGE_STORE_NAME);
    var req = store.get(imageId);
    req.onsuccess = function() {
      callback(req.result ? req.result.dataUrl : null);
    };
    req.onerror = function() { callback(null); };
  });
}

// 画像を IndexedDB から削除する
function deleteImageFromDB(imageId, callback) {
  if (!imageId) { if (callback) callback(); return; }
  initImageDB(function(db) {
    if (!db) { if (callback) callback(); return; }
    var tx = db.transaction(IMAGE_STORE_NAME, 'readwrite');
    var store = tx.objectStore(IMAGE_STORE_NAME);
    store.delete(imageId);
    tx.oncomplete = function() { if (callback) callback(); };
    tx.onerror    = function() { if (callback) callback(); };
  });
}

// ===========================
// 画像処理（縮小・保存）
// ===========================

// 読み込み済み画像のメモリキャッシュ（imageId → dataUrl）
var imageCache = {};

// File を最大 300×300 に縮小して dataUrl（WebP or JPEG）として返す
function resizeImage(file, callback) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var maxW = 300, maxH = 300;
      var w = img.width, h = img.height;
      if (w > maxW || h > maxH) {
        var scale = Math.min(maxW / w, maxH / h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      // WebP を試み、失敗なら JPEG にフォールバック
      var dataUrl = canvas.toDataURL('image/webp', 0.75);
      if (!dataUrl || dataUrl === 'data:,') {
        dataUrl = canvas.toDataURL('image/jpeg', 0.75);
      }
      callback(dataUrl);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// File を縮小して IndexedDB に保存し、完了後に callback() を呼ぶ
function resizeAndSaveImage(file, imageId, callback) {
  resizeImage(file, function(dataUrl) {
    imageCache[imageId] = dataUrl; // メモリキャッシュにも保持する
    saveImageToDB(imageId, dataUrl, function() {
      callback();
    });
  });
}

// ===========================
// フォームの画像状態管理
// ===========================

// mode の意味:
//   'none'   → 画像なし（新規 or 既存に画像がなかった）
//   'keep'   → 既存画像をそのまま保持する
//   'new'    → ユーザーが新しいファイルを選択した
//   'delete' → 既存画像を削除予定
var formImageState = {
  mode: 'none',
  file: null,        // 選択された File オブジェクト（mode='new' のとき）
  previewUrl: null,  // プレビュー用 URL（ObjectURL or dataUrl）
  existingId: null   // 編集時の既存 imageId
};

// フォームの画像状態をリセットする
function resetFormImageState() {
  // ObjectURL は明示的に解放する
  if (formImageState.mode === 'new' && formImageState.previewUrl) {
    URL.revokeObjectURL(formImageState.previewUrl);
  }
  formImageState = { mode: 'none', file: null, previewUrl: null, existingId: null };
  updateImageFormUI();
}

// ファイル選択時の処理
function handleImageSelect(event) {
  var file = event.target.files[0];
  if (!file) return;
  // 同じファイルを再選択できるようにリセット
  event.target.value = '';
  // 以前の ObjectURL があれば解放する
  if (formImageState.mode === 'new' && formImageState.previewUrl) {
    URL.revokeObjectURL(formImageState.previewUrl);
  }
  formImageState.mode = 'new';
  formImageState.file = file;
  formImageState.previewUrl = URL.createObjectURL(file);
  updateImageFormUI();
}

// フォーム内の画像アクションボタンを押したときの処理
// ボタンのラベルと動作はモードによって変わる
function handleImageAction() {
  var mode = formImageState.mode;
  if (mode === 'new') {
    // 新しい選択を取り消す
    URL.revokeObjectURL(formImageState.previewUrl);
    formImageState.file = null;
    formImageState.previewUrl = null;
    if (formImageState.existingId) {
      // 既存画像があった場合は 'keep' に戻す
      formImageState.mode = 'keep';
      loadImageForForm(formImageState.existingId);
    } else {
      formImageState.mode = 'none';
      updateImageFormUI();
    }
  } else if (mode === 'keep') {
    // 既存画像を削除予定にする
    formImageState.mode = 'delete';
    formImageState.previewUrl = null;
    updateImageFormUI();
  } else if (mode === 'delete') {
    // 削除を取り消して既存画像に戻す
    formImageState.mode = 'keep';
    loadImageForForm(formImageState.existingId);
  }
}

// フォームの画像UIをモードに合わせて更新する
function updateImageFormUI() {
  var previewEl = document.getElementById('imagePreview');
  var noImageEl = document.getElementById('noImageText');
  var actionBtn = document.getElementById('imageActionBtn');
  if (!previewEl) return;

  var mode = formImageState.mode;
  if ((mode === 'new' || mode === 'keep') && formImageState.previewUrl) {
    previewEl.src = formImageState.previewUrl;
    previewEl.style.display = 'block';
    noImageEl.style.display = 'none';
    actionBtn.style.display = 'inline-block';
    actionBtn.textContent = mode === 'new' ? '選択を取り消す' : '画像を削除';
  } else if (mode === 'delete') {
    previewEl.style.display = 'none';
    noImageEl.textContent = '（削除予定）';
    noImageEl.style.display = 'block';
    actionBtn.textContent = '元に戻す';
    actionBtn.style.display = 'inline-block';
  } else {
    // 'none'
    previewEl.style.display = 'none';
    noImageEl.textContent = '画像なし';
    noImageEl.style.display = 'block';
    actionBtn.style.display = 'none';
  }
}

// 編集時に既存の画像を DB から読んでフォームに表示する
function loadImageForForm(imageId) {
  if (!imageId) return;
  if (imageCache[imageId]) {
    formImageState.previewUrl = imageCache[imageId];
    updateImageFormUI();
    return;
  }
  getImageFromDB(imageId, function(dataUrl) {
    if (dataUrl) {
      imageCache[imageId] = dataUrl;
      // まだ同じ画像が表示対象かどうか確認してから更新する
      if (formImageState.existingId === imageId) {
        formImageState.previewUrl = dataUrl;
        updateImageFormUI();
      }
    }
  });
}

// ===========================
// カード内の画像ロード
// ===========================

// カード一覧に含まれる data-image-id 属性を持つ img 要素に画像を読み込む
function loadCardImages() {
  var imgs = document.querySelectorAll('.card-image-img[data-image-id]');
  imgs.forEach(function(img) {
    var imageId = img.getAttribute('data-image-id');
    if (!imageId) return;
    if (imageCache[imageId]) {
      img.src = imageCache[imageId];
      return;
    }
    // IndexedDB から非同期で取得してキャッシュする
    getImageFromDB(imageId, function(dataUrl) {
      if (!dataUrl) return;
      imageCache[imageId] = dataUrl;
      // 再描画されていないか確認してから反映する
      var el = document.querySelector('.card-image-img[data-image-id="' + imageId + '"]');
      if (el) el.src = dataUrl;
    });
  });
}

// ===========================
// クリップボードコピー
// ===========================

var toastTimer = null;

// トースト通知を表示する（指定メッセージを一定時間後に消す）
function showCopyToast(message) {
  var toast = document.getElementById('copyToast');
  toast.textContent = message;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function() {
    toast.classList.remove('show');
  }, 1800);
}

// テキストをクリップボードにコピーし、成功/失敗をトーストで通知する
function copyToClipboard(text, successMsg, btnEl) {
  var trimmed = text.trim();

  // コピー成功時の共通処理
  function onSuccess() {
    showCopyToast(successMsg);
    if (btnEl) {
      btnEl.classList.add('copied');
      setTimeout(function() { btnEl.classList.remove('copied'); }, 1500);
    }
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(trimmed).then(onSuccess, function() {
      showCopyToast('コピーに失敗しました');
    });
  } else {
    // フォールバック: execCommand（古いブラウザ向け）
    try {
      var ta = document.createElement('textarea');
      ta.value = trimmed;
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) { onSuccess(); } else { showCopyToast('コピーに失敗しました'); }
    } catch (e) {
      showCopyToast('コピーに対応していません');
    }
  }
}

// 単語をコピーする
function copyWord(text, btnEl) {
  copyToClipboard(text, '単語をコピーしました', btnEl);
}

// 例文をコピーする
function copyExample(text, btnEl) {
  copyToClipboard(text, '例文をコピーしました', btnEl);
}

// ===========================
// ユーティリティ関数
// ===========================

// XSS対策：HTMLエスケープ
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// エラーメッセージを表示する
function showError(elementId, message) {
  var el = document.getElementById(elementId);
  el.textContent = message;
  el.style.display = 'block';
}

// エラーメッセージを非表示にする
function hideError(elementId) {
  var el = document.getElementById(elementId);
  el.style.display = 'none';
}

// ===========================
// モーダルの外側クリックで閉じる
// ===========================

document.getElementById('deleteModal').addEventListener('click', function(event) {
  if (event.target === this) {
    closeDeleteModal();
  }
});

// ===========================
// クイズ機能
// ===========================

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

// クイズセクションの表示・非表示を切り替える
function handleQuizToggle() {
  var quizSection = document.getElementById('quizSection');
  var isVisible = quizSection.style.display !== 'none';
  if (isVisible) {
    stopQuiz();
  } else {
    openQuizSection();
  }
}

// クイズセクションを開いてモード選択画面を表示する
function openQuizSection() {
  cancelForm();
  var quizSection = document.getElementById('quizSection');
  quizSection.style.display = 'block';
  document.getElementById('openQuizBtn').textContent = '✕ クイズを終了';
  quizSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  renderQuizModeSelector();
}

// クイズを終了してセクションを閉じる
function stopQuiz() {
  quizState.isActive = false;
  quizState.currentWord = null;
  quizState.currentExample = null;
  document.getElementById('quizSection').style.display = 'none';
  document.getElementById('openQuizBtn').textContent = 'クイズを始める';
}

// モード選択UIを描画する
function renderQuizModeSelector() {
  // クイズ本体エリアをリセット
  document.getElementById('quizMessage').textContent = '';
  document.getElementById('quizContent').innerHTML = '';

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
  // 一覧の成績表示をリアルタイムで更新する
  renderWordList();
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
  endBtn.textContent = 'クイズを終了する';
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

  // 「次の問題へ」「クイズを終了する」ボタンを追加する
  var nextBtn = document.createElement('button');
  nextBtn.className = 'quiz-next-btn';
  nextBtn.textContent = '次の問題へ';
  nextBtn.onclick = showNextQuestion;

  var endBtn = document.createElement('button');
  endBtn.className = 'quiz-end-btn';
  endBtn.textContent = 'クイズを終了する';
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

  // 「次の問題へ」「クイズを終了する」ボタンを追加する
  var nextBtn = document.createElement('button');
  nextBtn.className = 'quiz-next-btn';
  nextBtn.textContent = '次の問題へ';
  nextBtn.onclick = showNextQuestion;

  var endBtn = document.createElement('button');
  endBtn.className = 'quiz-end-btn';
  endBtn.textContent = 'クイズを終了する';
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
  endBtn.textContent = 'クイズを終了する';
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

  // 「次の問題へ」「クイズを終了する」ボタンを追加する
  var nextBtn = document.createElement('button');
  nextBtn.className = 'quiz-next-btn';
  nextBtn.textContent = '次の問題へ';
  nextBtn.onclick = showNextQuestion;

  var endBtn = document.createElement('button');
  endBtn.className = 'quiz-end-btn';
  endBtn.textContent = 'クイズを終了する';
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
// アプリの初期化
// ===========================

// ページ読み込み時にlocalStorageからデータを読み込み、一覧を表示する
loadWords();
renderWordList();
