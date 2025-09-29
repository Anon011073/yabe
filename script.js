document.addEventListener('DOMContentLoaded', function() {
  // --- Constants ---
  const DASHBOARD_FOLDER_NAME = "Dashboard Bookmarks";

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

  // --- Functions ---

  function togglePin(bookmarkId, isPinned) {
    if (isPinned) {
      pinnedBookmarkIds.delete(bookmarkId);
    } else {
      pinnedBookmarkIds.add(bookmarkId);
    }
    chrome.storage.local.set({ 'pinnedBookmarks': Array.from(pinnedBookmarkIds) }, function() {
      displayBookmarks(); // Refresh the view
    });
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

  function displayBookmarks() {
    bookmarksContainer.innerHTML = '';
    pinnedBookmarksList.innerHTML = '';

    // Render pinned bookmarks
    const pinnedIds = Array.from(pinnedBookmarkIds);
    if (pinnedIds.length > 0) {
        chrome.bookmarks.get(pinnedIds, pinnedBookmarks => {
            pinnedBookmarks.forEach(bookmark => {
                if (bookmark) {
                    pinnedBookmarksList.appendChild(createBookmarkItem(bookmark, true));
                }
            });
        });
    }

    // Render categorized bookmarks
    chrome.bookmarks.getSubTree('1', (results) => {
        if (chrome.runtime.lastError || !results || results.length === 0) {
          console.error("Could not access the Bookmarks Bar: " + (chrome.runtime.lastError?.message || 'Unknown error'));
          return;
        }

        const bookmarksBarNode = results[0];
        const appFolder = bookmarksBarNode.children.find(node => node.title === DASHBOARD_FOLDER_NAME);
        if (!appFolder || !appFolder.children) return;

        // Handle bookmarks without a category (in the root of the app folder)
        const generalBookmarks = appFolder.children.filter(child => child.url && !pinnedBookmarkIds.has(child.id));
        if (generalBookmarks.length > 0) {
            const generalColumn = document.createElement('div');
            generalColumn.className = 'category-column';
            const generalTitle = document.createElement('div');
            generalTitle.className = 'category-title';
            generalTitle.textContent = 'General';
            generalColumn.appendChild(generalTitle);
            generalBookmarks.forEach(bookmark => {
                generalColumn.appendChild(createBookmarkItem(bookmark, false));
            });
            bookmarksContainer.appendChild(generalColumn);
        }

        // Handle categorized bookmarks
        appFolder.children.filter(child => !child.url).forEach(categoryNode => {
            const categoryColumn = document.createElement('div');
            categoryColumn.className = 'category-column';

            const categoryTitle = document.createElement('div');
            categoryTitle.className = 'category-title';
            categoryTitle.textContent = categoryNode.title;
            categoryColumn.appendChild(categoryTitle);

            if (categoryNode.children) {
                categoryNode.children.filter(child => child.url && !pinnedBookmarkIds.has(child.id)).forEach(bookmark => {
                    categoryColumn.appendChild(createBookmarkItem(bookmark, false));
                });
            }

            if (categoryColumn.children.length > 1) {
                bookmarksContainer.appendChild(categoryColumn);
            }
        });
    });
  }

  function loadPinnedBookmarksAndDisplay() {
    chrome.storage.local.get('pinnedBookmarks', function(data) {
      if (data.pinnedBookmarks) {
        pinnedBookmarkIds = new Set(data.pinnedBookmarks);
      }
      displayBookmarks();
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
      const colorKeys = ['fontColor', 'sectionTitleColor', 'categoryTitleColor'];
      chrome.storage.sync.get(colorKeys, data => {
          if (data.fontColor) {
              document.documentElement.style.setProperty('--main-font-color', data.fontColor);
          }
          if (data.sectionTitleColor) {
              document.documentElement.style.setProperty('--section-title-color', data.sectionTitleColor);
          }
          if (data.categoryTitleColor) {
              document.documentElement.style.setProperty('--category-title-color', data.categoryTitleColor);
          }
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

  loadPinnedBookmarksAndDisplay();
  applyColorSettings();
});