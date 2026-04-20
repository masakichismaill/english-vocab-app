// ===========================
// 作品ページ（sentence-work.html 専用）
// ===========================
// script.js の後に読み込まれることを前提とする。
// sentenceList / loadSentences() / saveSentences() / generateId()
// escapeHtml() / escapeForAttr() / copyToClipboard() は script.js から参照する。

// ===========================
// URLパラメータから作品情報を取得する
// ===========================

function getWorkParams() {
  var params = new URLSearchParams(window.location.search);
  return {
    category: params.get('category') || 'other',
    workTitle: params.get('work') || '未分類'
  };
}

var workParams = getWorkParams();
var currentCategory = workParams.category;
var currentWorkTitle = workParams.workTitle;

var CATEGORY_LABELS = {
  movie: '映画',
  song: '洋楽',
  book: '本',
  tv: 'ドラマ・TV',
  game: 'ゲーム',
  other: 'その他'
};

// ページヘッダーをURLパラメータの内容で初期化する
function initPageHeader() {
  var catLabel = CATEGORY_LABELS[currentCategory] || currentCategory;
  document.getElementById('pageWorkTitle').textContent = currentWorkTitle;
  document.getElementById('pageWorkCategory').textContent = catLabel;
  document.title = currentWorkTitle + ' - 例文管理';
}

// ===========================
// 編集・削除の状態管理
// ===========================

var editingSentenceId = null;
var deletingSentenceId = null;

// ===========================
// フォーム操作
// ===========================

function handleSentenceFormToggle() {
  var formSection = document.getElementById('sentenceFormSection');
  var isVisible = formSection.style.display !== 'none';
  if (isVisible) {
    cancelSentenceForm();
  } else {
    openSentenceFormForNew();
  }
}

function openSentenceFormForNew() {
  editingSentenceId = null;
  document.getElementById('sentenceFormTitle').textContent = '新しい例文を追加';
  document.getElementById('openSentenceFormBtn').textContent = '✕ 閉じる';
  resetSentenceForm();
  document.getElementById('sentenceFormSection').style.display = 'block';
  document.getElementById('sentenceFormSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelSentenceForm() {
  editingSentenceId = null;
  document.getElementById('sentenceFormSection').style.display = 'none';
  document.getElementById('openSentenceFormBtn').textContent = '＋ 例文を追加する';
  hideSentenceError('sentenceEnglishError');
  hideSentenceError('sentenceJapaneseError');
}

function resetSentenceForm() {
  document.getElementById('inputSentenceEnglish').value = '';
  document.getElementById('inputSentenceJapanese').value = '';
  document.getElementById('inputSentenceRelatedWords').value = '';
  hideSentenceError('sentenceEnglishError');
  hideSentenceError('sentenceJapaneseError');
}

// ===========================
// 例文の保存（追加 / 更新）
// ===========================

function saveSentence() {
  var english = document.getElementById('inputSentenceEnglish').value.trim();
  var japanese = document.getElementById('inputSentenceJapanese').value.trim();
  var relatedWordsRaw = document.getElementById('inputSentenceRelatedWords').value.trim();
  var relatedWords = relatedWordsRaw
    ? relatedWordsRaw.split(',').map(function(w) { return w.trim(); }).filter(function(w) { return w.length > 0; })
    : [];

  var hasError = false;
  if (!english) {
    showSentenceError('sentenceEnglishError', '英文を入力してください。');
    hasError = true;
  } else {
    hideSentenceError('sentenceEnglishError');
  }
  if (!japanese) {
    showSentenceError('sentenceJapaneseError', '日本語訳を入力してください。');
    hasError = true;
  } else {
    hideSentenceError('sentenceJapaneseError');
  }
  if (hasError) return;

  var now = Date.now();

  if (editingSentenceId) {
    // 既存の例文を更新する（作品情報もこのページの値で上書き）
    var target = sentenceList.find(function(s) { return s.id === editingSentenceId; });
    if (!target) { cancelSentenceForm(); return; }
    target.english = english;
    target.japanese = japanese;
    target.relatedWords = relatedWords;
    target.category = currentCategory;
    target.workTitle = currentWorkTitle;
    target.updatedAt = now;
  } else {
    // 新規例文を追加する（category・workTitle はページの値を自動セット）
    sentenceList.push({
      id: 'sentence_' + generateId(),
      english: english,
      japanese: japanese,
      relatedWords: relatedWords,
      category: currentCategory,
      workTitle: currentWorkTitle,
      createdAt: now,
      updatedAt: now
    });
  }

  saveSentences();
  cancelSentenceForm();
  renderSentenceList();
}

// ===========================
// 例文の編集
// ===========================

function startEditSentence(id) {
  var sentence = sentenceList.find(function(s) { return s.id === id; });
  if (!sentence) return;

  editingSentenceId = id;
  document.getElementById('sentenceFormTitle').textContent = '例文を編集';
  document.getElementById('openSentenceFormBtn').textContent = '✕ 閉じる';
  hideSentenceError('sentenceEnglishError');
  hideSentenceError('sentenceJapaneseError');

  document.getElementById('inputSentenceEnglish').value = sentence.english;
  document.getElementById('inputSentenceJapanese').value = sentence.japanese;
  document.getElementById('inputSentenceRelatedWords').value = (sentence.relatedWords || []).join(', ');

  document.getElementById('sentenceFormSection').style.display = 'block';
  document.getElementById('sentenceFormSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ===========================
// 例文の削除
// ===========================

function openSentenceDeleteModal(id) {
  var sentence = sentenceList.find(function(s) { return s.id === id; });
  if (!sentence) return;
  deletingSentenceId = id;
  var preview = sentence.english.length > 40 ? sentence.english.slice(0, 40) + '…' : sentence.english;
  document.getElementById('sentenceDeleteModalText').textContent = '「' + preview + '」を削除します。この操作は取り消せません。';
  document.getElementById('sentenceDeleteModal').classList.add('active');
}

function confirmSentenceDelete() {
  if (!deletingSentenceId) return;
  sentenceList = sentenceList.filter(function(s) { return s.id !== deletingSentenceId; });
  saveSentences();
  deletingSentenceId = null;
  closeSentenceDeleteModal();
  renderSentenceList();
}

function closeSentenceDeleteModal() {
  document.getElementById('sentenceDeleteModal').classList.remove('active');
  deletingSentenceId = null;
}

// ===========================
// コピー機能
// ===========================

// 英文だけをクリップボードにコピーする
function copyEnglishOnly(english, btnEl) {
  copyToClipboard(english, '英文をコピーしました', btnEl);
}

// 英文と日本語訳をまとめてコピーする
function copyEnglishAndJapanese(english, japanese, btnEl) {
  copyToClipboard(english + '\n' + japanese, '英文＋訳をコピーしました', btnEl);
}

// ===========================
// 一覧の描画（この作品の例文のみ・検索対応）
// ===========================

function renderSentenceList() {
  var searchQuery = document.getElementById('sentenceSearchInput').value.trim().toLowerCase();
  var listContainer = document.getElementById('sentenceCardList');
  var countEl = document.getElementById('sentenceCountText');

  // この作品に属する例文のみ抽出する
  var workSentences = sentenceList.filter(function(s) {
    return s.category === currentCategory && s.workTitle === currentWorkTitle;
  });

  // 検索フィルタリング（英文 / 日本語訳 / 関連単語 が対象）
  var filtered = workSentences.filter(function(s) {
    if (!searchQuery) return true;
    if (s.english.toLowerCase().includes(searchQuery)) return true;
    if (s.japanese.toLowerCase().includes(searchQuery)) return true;
    if ((s.relatedWords || []).some(function(w) { return w.toLowerCase().includes(searchQuery); })) return true;
    return false;
  });

  // 登録が古い順（追加した順）で表示する
  filtered = filtered.slice().sort(function(a, b) { return a.createdAt - b.createdAt; });

  countEl.textContent = filtered.length + ' 件 / この作品の例文 ' + workSentences.length + ' 件';

  if (filtered.length === 0) {
    if (searchQuery) {
      listContainer.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><p>条件に一致する例文が見つかりませんでした。</p></div>';
    } else {
      listContainer.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><p>まだ例文が登録されていません。<br>「＋ 例文を追加する」から登録しましょう。</p></div>';
    }
    return;
  }

  listContainer.innerHTML = filtered.map(function(s) {
    return buildSentenceCardHtml(s);
  }).join('');
}

// 例文カードのHTMLを生成する
function buildSentenceCardHtml(sentence) {
  var relatedHtml = (sentence.relatedWords && sentence.relatedWords.length > 0)
    ? sentence.relatedWords.map(function(w) {
        return '<span class="sentence-related-word">' + escapeHtml(w) + '</span>';
      }).join('')
    : '<span class="sentence-no-related">（なし）</span>';

  var engEscaped = escapeForAttr(sentence.english);
  var jpEscaped  = escapeForAttr(sentence.japanese);
  var idEscaped  = escapeForAttr(sentence.id);

  return ''
    + '<div class="sentence-card">'
    +   '<div class="sentence-card-english">' + escapeHtml(sentence.english) + '</div>'
    +   '<div class="sentence-card-japanese">' + escapeHtml(sentence.japanese) + '</div>'
    +   '<div class="sentence-card-related">'
    +     '<span class="sentence-related-label">関連単語:</span>'
    +     '<div class="sentence-related-words">' + relatedHtml + '</div>'
    +   '</div>'
    +   '<div class="sentence-copy-buttons">'
    +     '<button class="copy-btn" onclick="copyEnglishOnly(\'' + engEscaped + '\', this)">英文をコピー</button>'
    +     '<button class="copy-btn" onclick="copyEnglishAndJapanese(\'' + engEscaped + '\', \'' + jpEscaped + '\', this)">英文＋訳をコピー</button>'
    +   '</div>'
    +   '<div class="card-actions">'
    +     '<button class="btn-edit" onclick="startEditSentence(\'' + idEscaped + '\')">編集</button>'
    +     '<button class="btn-delete" onclick="openSentenceDeleteModal(\'' + idEscaped + '\')">削除</button>'
    +   '</div>'
    + '</div>';
}

// ===========================
// エラーメッセージ
// ===========================

function showSentenceError(id, msg) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}

function hideSentenceError(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.style.display = 'none';
}

// ===========================
// 削除モーダルの外側クリックで閉じる
// ===========================

var _sentenceDeleteModal = document.getElementById('sentenceDeleteModal');
if (_sentenceDeleteModal) {
  _sentenceDeleteModal.addEventListener('click', function(event) {
    if (event.target === this) {
      closeSentenceDeleteModal();
    }
  });
}

// ===========================
// 初期化
// ===========================

initPageHeader();
renderSentenceList();
