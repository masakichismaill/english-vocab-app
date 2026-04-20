// ===========================
// データ管理
// ===========================

// localStorageに保存するキー
var STORAGE_KEY = 'englishVocabApp_v1';

// 独立例文データのlocalStorageキー（単語データとは別管理）
var SENTENCES_KEY = 'englishVocabApp_sentences_v1';

// メモリ上の単語リスト
var wordList = [];

// メモリ上の独立例文リスト
var sentenceList = [];

// 独立例文データをlocalStorageから読み込む（旧データには category/workTitle を補完する）
function loadSentences() {
  var stored = localStorage.getItem(SENTENCES_KEY);
  if (stored) {
    try {
      var parsed = JSON.parse(stored);
      sentenceList = Array.isArray(parsed) ? parsed : [];
      // category / workTitle が未設定の既存データにデフォルト値を補完する
      var needsSave = false;
      sentenceList.forEach(function(s) {
        if (!s.category) { s.category = 'other'; needsSave = true; }
        if (!s.workTitle) { s.workTitle = '未分類'; needsSave = true; }
      });
      if (needsSave) saveSentences();
    } catch (e) {
      sentenceList = [];
    }
  } else {
    sentenceList = [];
  }
}

// 独立例文データをlocalStorageに保存する
function saveSentences() {
  localStorage.setItem(SENTENCES_KEY, JSON.stringify(sentenceList));
}

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

// onclick属性に埋め込む文字列のシングルクォートをエスケープする
function escapeForAttr(str) {
  if (!str) return '';
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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

var _deleteModal = document.getElementById('deleteModal');
if (_deleteModal) {
  _deleteModal.addEventListener('click', function(event) {
    if (event.target === this) {
      closeDeleteModal();
    }
  });
}

// ===========================
// JSONエクスポート
// ===========================

function exportToJson() {
  var data = wordList.map(function(word) {
    return {
      id: word.id,
      word: word.word,
      createdAt: word.createdAt,
      parts: word.parts.map(function(part) {
        var p = {
          id: part.id,
          partOfSpeech: part.partOfSpeech,
          meanings: part.meanings,
          examples: part.examples,
          isFavorite: part.isFavorite,
          isWeak: part.isWeak,
          correct: part.correct,
          wrong: part.wrong,
          createdAt: part.createdAt
        };
        if (part.imageId) p.imageId = part.imageId;
        return p;
      })
    };
  });

  var json = JSON.stringify(data, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  var url = URL.createObjectURL(blob);

  var today = new Date();
  var dateStr = today.getFullYear() + '-'
    + String(today.getMonth() + 1).padStart(2, '0') + '-'
    + String(today.getDate()).padStart(2, '0');
  var filename = 'english-vocab-backup-' + dateStr + '.json';

  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ===========================
// JSONインポート
// ===========================

// 読み込み待ちのインポートデータ（モーダル表示中に保持）
var pendingImportData = null;

// ファイルが選択されたときに呼ばれる
function handleImportFileSelect(event) {
  var file = event.target.files[0];
  if (!file) return;
  // 同じファイルを再選択できるようリセット
  event.target.value = '';

  var reader = new FileReader();
  reader.onload = function(e) {
    var text = e.target.result;
    var data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      showImportResult('JSONの解析に失敗しました。ファイルが正しいJSON形式か確認してください。', 'error');
      return;
    }

    var validationError = validateImportData(data);
    if (validationError) {
      showImportResult(validationError, 'error');
      return;
    }

    pendingImportData = data;
    openImportModal(data);
  };
  reader.readAsText(file);
}

// インポートデータの基本的な構造チェック
function validateImportData(data) {
  if (!Array.isArray(data)) {
    return 'JSONのトップレベルが配列ではありません。正しいエクスポートファイルを選択してください。';
  }
  for (var i = 0; i < data.length; i++) {
    var item = data[i];
    if (typeof item !== 'object' || item === null) {
      return (i + 1) + '番目のデータが正しいオブジェクト形式ではありません。';
    }
    if (typeof item.word !== 'string' || !item.word.trim()) {
      return (i + 1) + '番目のデータに "word" フィールドがないか空です。';
    }
    if (!Array.isArray(item.parts)) {
      return '「' + item.word + '」に "parts" 配列がありません。';
    }
  }
  return null; // エラーなし
}

// インポート確認モーダルを開く
function openImportModal(data) {
  var wordCount = data.length;
  var partCount = data.reduce(function(sum, w) {
    return sum + (Array.isArray(w.parts) ? w.parts.length : 0);
  }, 0);

  document.getElementById('importFileInfo').textContent =
    '読み込み対象: ' + wordCount + ' 単語 / ' + partCount + ' 品詞データ';

  updateImportWarning();
  document.getElementById('importModal').classList.add('active');
}

// モード選択に応じて警告文を更新する
function updateImportWarning() {
  var selected = document.querySelector('input[name="importMode"]:checked');
  var warningEl = document.getElementById('importWarning');
  if (!selected || !warningEl) return;

  if (selected.value === 'replace') {
    warningEl.textContent = '警告: 現在登録されている ' + wordList.length + ' 単語のデータがすべて削除されます。';
    warningEl.style.display = 'block';
  } else {
    warningEl.style.display = 'none';
  }
}

// インポートモーダルを閉じる
function closeImportModal() {
  document.getElementById('importModal').classList.remove('active');
  pendingImportData = null;
}

// モーダルの「読み込む」ボタンを押したときの処理
function confirmImport() {
  if (!pendingImportData) return;

  var selected = document.querySelector('input[name="importMode"]:checked');
  var mode = selected ? selected.value : 'merge';

  var result = runImport(pendingImportData, mode);
  closeImportModal();
  renderWordList();

  var msg;
  if (mode === 'replace') {
    msg = '置き換え完了: ' + result.added + ' 件を読み込みました。';
  } else {
    var total = result.added + result.skipped;
    msg = '追加: ' + result.added + ' 件\n重複スキップ: ' + result.skipped + ' 件\n合計: ' + total + ' 件';
  }
  showImportResult(msg, 'success');
}

// インポートの本処理（追加 or 置き換え）
function runImport(data, mode) {
  var added = 0;
  var skipped = 0;

  if (mode === 'replace') {
    wordList = data.map(function(item) { return normalizeImportedWord(item); });
    added = wordList.reduce(function(sum, w) { return sum + w.parts.length; }, 0);
  } else {
    // 追加モード：単語・品詞の組が重複する場合はスキップ
    data.forEach(function(item) {
      var imported = normalizeImportedWord(item);
      var existing = wordList.find(function(w) {
        return w.word.toLowerCase() === imported.word.toLowerCase();
      });

      if (!existing) {
        wordList.push(imported);
        added += imported.parts.length;
      } else {
        imported.parts.forEach(function(importedPart) {
          var isDuplicate = existing.parts.some(function(p) {
            return p.partOfSpeech === importedPart.partOfSpeech;
          });
          if (isDuplicate) {
            skipped++;
          } else {
            existing.parts.push(importedPart);
            added++;
          }
        });
      }
    });
  }

  saveWords();
  return { added: added, skipped: skipped };
}

// インポートデータの1単語を正規化する（欠損フィールドを補完）
function normalizeImportedWord(item) {
  return {
    id: item.id || generateId(),
    word: item.word,
    createdAt: item.createdAt || Date.now(),
    parts: Array.isArray(item.parts) ? item.parts.map(function(p) {
      var part = {
        id: p.id || generateId(),
        partOfSpeech: p.partOfSpeech || 'other',
        meanings: Array.isArray(p.meanings) ? p.meanings : [],
        examples: Array.isArray(p.examples) ? p.examples : [],
        isFavorite: !!p.isFavorite,
        isWeak: !!p.isWeak,
        correct: typeof p.correct === 'number' ? p.correct : 0,
        wrong: typeof p.wrong === 'number' ? p.wrong : 0,
        createdAt: p.createdAt || Date.now()
      };
      if (p.imageId) part.imageId = p.imageId;
      return part;
    }) : []
  };
}

// データ管理セクションに結果メッセージを表示する
function showImportResult(message, type) {
  var el = document.getElementById('dataManageResult');
  if (!el) return;
  el.textContent = message;
  el.className = 'data-manage-result ' + (type || '');
  el.style.display = 'block';
  clearTimeout(showImportResult._timer);
  showImportResult._timer = setTimeout(function() {
    el.style.display = 'none';
  }, 6000);
}

// ===========================
// アプリの初期化
// ===========================

loadWords();
loadSentences();
if (document.getElementById('wordCardList')) {
  renderWordList();
}

// インポートモーダルの外側クリックで閉じる
var _importModal = document.getElementById('importModal');
if (_importModal) {
  _importModal.addEventListener('click', function(event) {
    if (event.target === this) {
      closeImportModal();
    }
  });
}

