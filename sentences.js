// ===========================
// 作品一覧ページ（sentences.html 専用）
// ===========================
// script.js の後に読み込まれることを前提とする。
// sentenceList / loadSentences() / saveSentences() / escapeHtml() は script.js から参照する。

var CATEGORY_LABELS = {
  movie: '映画',
  song: '洋楽',
  book: '本',
  tv: 'ドラマ・TV',
  game: 'ゲーム',
  other: 'その他'
};

// 作品一覧での表示順（カテゴリーの並び順）
var CATEGORY_ORDER = ['movie', 'song', 'book', 'tv', 'game', 'other'];

// ===========================
// 新しい作品フォーム
// ===========================

function handleNewWorkFormToggle() {
  var formSection = document.getElementById('newWorkFormSection');
  var isVisible = formSection.style.display !== 'none';
  if (isVisible) {
    cancelNewWorkForm();
  } else {
    document.getElementById('openNewWorkBtn').textContent = '✕ 閉じる';
    formSection.style.display = 'block';
    formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function cancelNewWorkForm() {
  document.getElementById('newWorkFormSection').style.display = 'none';
  document.getElementById('openNewWorkBtn').textContent = '＋ 新しい作品を開く';
  document.getElementById('newWorkTitle').value = '';
  var errorEl = document.getElementById('newWorkTitleError');
  if (errorEl) errorEl.style.display = 'none';
}

// 指定した作品ページ（sentence-work.html）に移動する
function navigateToWork() {
  var category = document.getElementById('newWorkCategory').value;
  var workTitle = document.getElementById('newWorkTitle').value.trim();
  var errorEl = document.getElementById('newWorkTitleError');

  if (!workTitle) {
    errorEl.textContent = '作品名を入力してください。';
    errorEl.style.display = 'block';
    return;
  }
  errorEl.style.display = 'none';

  window.location.href = 'sentence-work.html'
    + '?category=' + encodeURIComponent(category)
    + '&work=' + encodeURIComponent(workTitle);
}

// ===========================
// 作品グループの生成
// ===========================

// sentenceList を category + workTitle の組ごとにグループ化して返す
function buildWorkGroups() {
  var groupMap = {};
  sentenceList.forEach(function(s) {
    var cat = s.category || 'other';
    var title = s.workTitle || '未分類';
    var key = cat + '\t' + title;
    if (!groupMap[key]) {
      groupMap[key] = { category: cat, workTitle: title, count: 0 };
    }
    groupMap[key].count++;
  });

  var groups = Object.keys(groupMap).map(function(key) { return groupMap[key]; });

  // カテゴリー順 → 作品名の辞書順に並べる
  groups.sort(function(a, b) {
    var orderA = CATEGORY_ORDER.indexOf(a.category);
    var orderB = CATEGORY_ORDER.indexOf(b.category);
    if (orderA < 0) orderA = 99;
    if (orderB < 0) orderB = 99;
    if (orderA !== orderB) return orderA - orderB;
    return a.workTitle.localeCompare(b.workTitle);
  });

  return groups;
}

// ===========================
// 作品一覧の描画
// ===========================

function renderWorkList() {
  var listContainer = document.getElementById('workGroupList');
  var countEl = document.getElementById('workCountText');

  var groups = buildWorkGroups();
  countEl.textContent = groups.length + ' 作品 / 例文 ' + sentenceList.length + ' 件';

  if (groups.length === 0) {
    listContainer.innerHTML = ''
      + '<div class="empty-state">'
      +   '<div class="empty-state-icon">📽</div>'
      +   '<p>まだ作品が登録されていません。<br>「＋ 新しい作品を開く」から始めましょう。</p>'
      + '</div>';
    return;
  }

  // カテゴリーごとにセクションを区切って表示する
  var currentCategory = null;
  var html = '';
  groups.forEach(function(group) {
    if (group.category !== currentCategory) {
      if (currentCategory !== null) {
        html += '</div></div>'; // .work-cards と .work-category-section を閉じる
      }
      currentCategory = group.category;
      var catLabel = CATEGORY_LABELS[currentCategory] || currentCategory;
      html += '<div class="work-category-section">'
        + '<div class="work-category-section-header">'
        +   '<span class="work-cat-badge work-cat-' + escapeHtml(currentCategory) + '">' + escapeHtml(catLabel) + '</span>'
        + '</div>'
        + '<div class="work-cards">';
    }
    html += buildWorkCardHtml(group);
  });
  if (currentCategory !== null) {
    html += '</div></div>';
  }

  listContainer.innerHTML = html;
}

// 作品カードのHTMLを生成する
function buildWorkCardHtml(group) {
  var url = 'sentence-work.html'
    + '?category=' + encodeURIComponent(group.category)
    + '&work=' + encodeURIComponent(group.workTitle);

  return ''
    + '<div class="work-card">'
    +   '<div class="work-card-info">'
    +     '<div class="work-card-title">' + escapeHtml(group.workTitle) + '</div>'
    +     '<div class="work-card-count">' + group.count + ' 例文</div>'
    +   '</div>'
    +   '<a href="' + url + '" class="btn-open-work">開く →</a>'
    + '</div>';
}

// ===========================
// 初期化
// ===========================

renderWorkList();
