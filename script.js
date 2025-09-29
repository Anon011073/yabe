document.addEventListener('DOMContentLoaded', () => {
  // --- Constants ---
  const DASHBOARD_FOLDER_NAME = "Dashboard Bookmarks";
  const BOOKMARK_LIMIT = 10;

  // --- Element Selectors ---
  const pinnedBookmarksList = document.getElementById('pinned-bookmarks-list');
  const bookmarksContainer = document.getElementById('bookmarks-container');
  const tooltip = document.getElementById('tooltip');
  const searchForm = document.getElementById('search-form');
  const searchEngineSelect = document.getElementById('search-engine');
  const searchInput = document.getElementById('search-input');

  // --- State ---
  let pinnedBookmarkIds = new Set();
  const metadataCache = {};

  // --- Chrome API Wrappers (Promisified) ---
  const getStorage = (keys) => new Promise(resolve => chrome.storage.local.get(keys, resolve));
  const getSubTree = (id) => new Promise(resolve => chrome.bookmarks.getSubTree(id, resolve));
  const getBookmarks = (ids) => new Promise(resolve => chrome.bookmarks.get(ids, resolve));

  // --- Main Functions ---

  async function togglePin(bookmarkId, isPinned) {
    if (isPinned) {
      pinnedBookmarkIds.delete(bookmarkId);
    } else {
      pinnedBookmarkIds.add(bookmarkId);
    }
    await new Promise(resolve => chrome.storage.local.set({ 'pinnedBookmarks': Array.from(pinnedBookmarkIds) }, resolve));
    await loadAndRenderDashboard(); // Refresh the view
  }

  function createBookmarkItem(node, isPinned) {
    const bookmarkItem = document.createElement('div');
    bookmarkItem.className = 'bookmark-item';
    bookmarkItem.dataset.id = node.id;

    const bookmarkLink = document.createElement('a');
    bookmarkLink.href = node.url;
    bookmarkLink.target = "_blank";
    bookmarkLink.textContent = node.title;

    bookmarkItem.addEventListener('mouseover', (e) => showTooltip(e, node.url));
    bookmarkItem.addEventListener('mouseout', hideTooltip);

    const pinButton = document.createElement('button');
    pinButton.textContent = isPinned ? 'Unpin' : 'Pin';
    pinButton.className = 'pin-btn';
    pinButton.addEventListener('click', () => togglePin(node.id, isPinned));

    bookmarkItem.appendChild(bookmarkLink);
    bookmarkItem.appendChild(pinButton);
    return bookmarkItem;
  }

  async function loadAndRenderDashboard() {
    bookmarksContainer.innerHTML = '';
    pinnedBookmarksList.innerHTML = '';

    // 1. Get pinned IDs from storage
    const storageData = await getStorage('pinnedBookmarks');
    pinnedBookmarkIds = storageData.pinnedBookmarks ? new Set(storageData.pinnedBookmarks) : new Set();

    // 2. Render pinned bookmarks
    const pinnedIds = Array.from(pinnedBookmarkIds);
    if (pinnedIds.length > 0) {
        const pinnedBookmarks = await getBookmarks(pinnedIds);
        pinnedBookmarks.forEach(bookmark => {
            if (bookmark) pinnedBookmarksList.appendChild(createBookmarkItem(bookmark, true));
        });
    }

    // 3. Find the main dashboard folder robustly
    const searchResults = await new Promise(resolve => chrome.bookmarks.search({ title: DASHBOARD_FOLDER_NAME }, resolve));
    const appFolderInfo = searchResults.find(node => !node.url);

    if (!appFolderInfo) {
        console.log("Dashboard Bookmarks folder not found.");
        return;
    }

    // 4. Get the full tree for that folder and render its contents
    const appFolderTree = await getSubTree(appFolderInfo.id);
    if (!appFolderTree || !appFolderTree[0] || !appFolderTree[0].children) return;

    const appFolder = appFolderTree[0];

    const renderCategoryColumn = (bookmarks, title) => {
        const column = document.createElement('div');
        column.className = 'category-column';
        const titleEl = document.createElement('div');
        titleEl.className = 'category-title';
        titleEl.textContent = title;
        column.appendChild(titleEl);

        const renderItems = (limit) => {
            column.querySelectorAll('.bookmark-item, .show-more-btn, .show-less-btn').forEach(el => el.remove());
            bookmarks.slice(0, limit).forEach(bookmark => column.appendChild(createBookmarkItem(bookmark, false)));

            if (bookmarks.length > limit) {
                const showMoreBtn = document.createElement('button');
                showMoreBtn.className = 'show-more-btn';
                showMoreBtn.textContent = `+ ${bookmarks.length - limit} more`;
                showMoreBtn.addEventListener('click', () => renderItems(bookmarks.length), { once: true });
                column.appendChild(showMoreBtn);
            }
            if (limit > BOOKMARK_LIMIT) {
                const showLessBtn = document.createElement('button');
                showLessBtn.className = 'show-less-btn';
                showLessBtn.textContent = `- Show less`;
                showLessBtn.addEventListener('click', () => renderItems(BOOKMARK_LIMIT));
                column.appendChild(showLessBtn);
            }
        };

        renderItems(BOOKMARK_LIMIT);
        return column;
    };

    appFolder.children.filter(child => !child.url).forEach(categoryNode => {
        const bookmarks = (categoryNode.children || []).filter(child => child.url && !pinnedBookmarkIds.has(child.id));
        if (bookmarks.length > 0) {
            bookmarksContainer.appendChild(renderCategoryColumn(bookmarks, categoryNode.title));
        }
    });
  }

  async function showTooltip(event, url) {
    if (metadataCache[url]) {
      tooltip.innerHTML = metadataCache[url];
    } else {
      try {
        const response = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`);
        const data = await response.json();
        const content = data.data.description || 'No description available.';
        metadataCache[url] = content;
        tooltip.innerHTML = content;
      } catch (error) {
        console.error('Error fetching metadata:', error);
        tooltip.innerHTML = 'Could not fetch info.';
      }
    }
    tooltip.style.display = 'block';
    tooltip.style.left = event.pageX + 10 + 'px';
    tooltip.style.top = event.pageY + 10 + 'px';
  }

  function hideTooltip() {
    tooltip.style.display = 'none';
  }

  function applyColorSettings() {
    const styleKeys = ['fontColor', 'sectionTitleColor', 'categoryTitleColor', 'fontSize', 'sectionTitleSize', 'categoryTitleSize'];
    chrome.storage.sync.get(styleKeys, data => {
      if (data.fontColor) document.documentElement.style.setProperty('--main-font-color', data.fontColor);
      if (data.sectionTitleColor) document.documentElement.style.setProperty('--section-title-color', data.sectionTitleColor);
      if (data.categoryTitleColor) document.documentElement.style.setProperty('--category-title-color', data.categoryTitleColor);
      if (data.fontSize) document.documentElement.style.setProperty('--main-font-size', data.fontSize + 'px');
      if (data.sectionTitleSize) document.documentElement.style.setProperty('--section-title-size', data.sectionTitleSize + 'px');
      if (data.categoryTitleSize) document.documentElement.style.setProperty('--category-title-size', data.categoryTitleSize + 'px');
    });
  }

  // --- Event Listeners and Initial Load ---
  searchForm.addEventListener('submit', function(event) {
    event.preventDefault();
    const query = searchInput.value;
    if (query) {
      const searchUrl = searchEngineSelect.value + encodeURIComponent(query);
      chrome.tabs.update({ url: searchUrl });
    }
  });

  applyColorSettings();
  loadAndRenderDashboard();
});