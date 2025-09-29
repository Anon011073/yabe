document.addEventListener('DOMContentLoaded', () => {
  // --- Constants ---
  const DASHBOARD_FOLDER_NAME = "Dashboard Bookmarks";

  // --- Element Selectors ---
  const addBookmarkForm = document.getElementById('add-bookmark-form');
  const bookmarkTitleInput = document.getElementById('bookmark-title');
  const bookmarkUrlInput = document.getElementById('bookmark-url');
  const bookmarkCategorySelect = document.getElementById('bookmark-category-select');
  const bookmarksManagementList = document.getElementById('bookmarks-management-list');

  const addCategoryForm = document.getElementById('add-category-form');
  const categoryNameInput = document.getElementById('category-name');
  const categoriesManagementList = document.getElementById('categories-management-list');

  const fontColorForm = document.getElementById('font-color-form');
  const fontColorPicker = document.getElementById('font-color-picker');

  // --- State ---
  let dashboardFolderId = null;

  // --- Helper Functions ---

  /**
   * Finds or creates the main folder for the extension's bookmarks.
   * @returns {Promise<BookmarkTreeNode>} A promise that resolves with the folder node.
   */
  function getDashboardFolder() {
    return new Promise((resolve, reject) => {
      // The Bookmarks Bar is always folder '1'. We get its sub-tree to find our dashboard folder.
      chrome.bookmarks.getSubTree('1', (results) => {
        if (chrome.runtime.lastError || !results || results.length === 0) {
          return reject("Could not access the Bookmarks Bar: " + (chrome.runtime.lastError?.message || 'Unknown error'));
        }

        const bookmarksBarNode = results[0];
        const appFolder = bookmarksBarNode.children.find(node => node.title === DASHBOARD_FOLDER_NAME);

        if (appFolder) {
          dashboardFolderId = appFolder.id;
          resolve(appFolder);
        } else {
          // If it doesn't exist, create it inside the Bookmarks Bar.
          chrome.bookmarks.create({ parentId: '1', title: DASHBOARD_FOLDER_NAME }, newFolder => {
            dashboardFolderId = newFolder.id;
            resolve(newFolder);
          });
        }
      });
    });
  }

  // --- Main Functions ---

  async function loadAll() {
    await loadCategories();
    loadBookmarks();
    loadFontColor();
  }

  // --- Category Functions ---

  async function loadCategories() {
    categoriesManagementList.innerHTML = '';
    bookmarkCategorySelect.innerHTML = '';

    try {
      const appFolder = await getDashboardFolder();

      // Add "No Category" option, which points to the root dashboard folder
      const defaultOption = document.createElement('option');
      defaultOption.value = appFolder.id;
      defaultOption.textContent = "No Category";
      bookmarkCategorySelect.appendChild(defaultOption);

      // Add each sub-folder as a category option
      (appFolder.children || []).filter(child => !child.url).forEach(addCategoryOption);

    } catch (error) {
      console.error("Error loading categories:", error);
    }
  }

  function addCategoryOption(categoryNode) {
      // Add to select dropdown
      const option = document.createElement('option');
      option.value = categoryNode.id;
      option.textContent = categoryNode.title;
      bookmarkCategorySelect.appendChild(option);

      // Add to management list
      const categoryItem = document.createElement('div');
      categoryItem.className = 'category-item';
      categoryItem.innerHTML = `
        <span>${categoryNode.title}</span>
        <div class="item-actions">
          <button class="delete-btn" data-id="${categoryNode.id}">Delete</button>
        </div>
      `;
      categoriesManagementList.appendChild(categoryItem);
  }

  addCategoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const categoryName = categoryNameInput.value.trim();
    if (!categoryName) return;

    try {
      const appFolder = await getDashboardFolder();
      chrome.bookmarks.create({ parentId: appFolder.id, title: categoryName }, () => {
          categoryNameInput.value = '';
          loadCategories(); // Reload to show the new category
      });
    } catch (error) {
      console.error("Could not create category:", error);
    }
  });

  categoriesManagementList.addEventListener('click', e => {
    if (e.target.classList.contains('delete-btn')) {
      const categoryId = e.target.dataset.id;
      if (confirm('Are you sure you want to delete this category and all its bookmarks?')) {
        chrome.bookmarks.removeTree(categoryId, () => {
          loadAll();
        });
      }
    }
  });

  // --- Bookmark Functions ---

  let editingBookmarkId = null; // To track which bookmark is being edited

  async function loadBookmarks() {
    bookmarksManagementList.innerHTML = '';
    try {
        const appFolder = await getDashboardFolder();
        processNodeForManagement(appFolder);
    } catch(error) {
        console.error("Could not load bookmarks:", error);
    }
  }

  function processNodeForManagement(node) {
    // If it's a bookmark, add it to the list
    if (node.url) {
      const bookmarkItem = document.createElement('div');
      bookmarkItem.className = 'bookmark-item';
      bookmarkItem.innerHTML = `
        <span>${node.title} - <em>${node.url}</em></span>
        <div class="item-actions">
          <button class="edit-btn" data-id="${node.id}">Edit</button>
          <button class="delete-btn" data-id="${node.id}">Delete</button>
        </div>
      `;
      bookmarksManagementList.appendChild(bookmarkItem);
    }
    // If it's a folder, recurse through its children
    if (node.children) {
      node.children.forEach(processNodeForManagement);
    }
  }

  addBookmarkForm.addEventListener('submit', e => {
    e.preventDefault();
    const title = bookmarkTitleInput.value.trim();
    const url = bookmarkUrlInput.value.trim();
    const categoryId = bookmarkCategorySelect.value;
    if (!title || !url) return;

    if (editingBookmarkId) {
      // Update existing bookmark
      chrome.bookmarks.update(editingBookmarkId, {
        title: title,
        url: url
      }, (updatedBookmark) => {
        // Move bookmark if category was changed
        if (updatedBookmark.parentId !== categoryId) {
          chrome.bookmarks.move(updatedBookmark.id, { parentId: categoryId }, () => {
             loadBookmarks(); // Reload after moving
          });
        } else {
            loadBookmarks(); // Reload if no move was needed
        }
        // Reset form state
        addBookmarkForm.reset();
        addBookmarkForm.querySelector('button').textContent = "Add Bookmark";
        editingBookmarkId = null;
      });
    } else {
      // Create new bookmark
      chrome.bookmarks.create({
        parentId: categoryId,
        title: title,
        url: url
      }, () => {
        addBookmarkForm.reset();
        loadBookmarks();
      });
    }
  });

  bookmarksManagementList.addEventListener('click', e => {
    const target = e.target;
    const bookmarkId = target.dataset.id;

    if (target.classList.contains('delete-btn')) {
      chrome.bookmarks.remove(bookmarkId, () => {
        loadBookmarks();
      });
    } else if (target.classList.contains('edit-btn')) {
      chrome.bookmarks.get(bookmarkId, (bookmarks) => {
        if (bookmarks && bookmarks.length > 0) {
          const bookmark = bookmarks[0];
          editingBookmarkId = bookmark.id;
          bookmarkTitleInput.value = bookmark.title;
          bookmarkUrlInput.value = bookmark.url;
          bookmarkCategorySelect.value = bookmark.parentId;

          addBookmarkForm.querySelector('button').textContent = "Save Changes";
          bookmarkTitleInput.focus();
          addBookmarkForm.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }
  });

  // --- Font Color Functions ---
  function loadFontColor() {
      chrome.storage.sync.get('fontColor', data => {
          if (data.fontColor) {
              fontColorPicker.value = data.fontColor;
          }
      });
  }

  fontColorForm.addEventListener('submit', e => {
      e.preventDefault();
      const color = fontColorPicker.value;
      chrome.storage.sync.set({ fontColor: color }, () => {
          alert('Font color saved!');
      });
  });

  // --- Initial Load ---
  loadAll();
});