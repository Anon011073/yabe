document.addEventListener('DOMContentLoaded', () => {
  // --- Constants ---
  const DASHBOARD_FOLDER_NAME = "Dashboard Bookmarks";

  // --- Element Selectors ---
  const openManagerBtn = document.getElementById('open-manager-btn');

  // --- Main Functions ---
  function loadAll() {
    loadColorSettings();
  }

  // --- Bookmark/Manager Functions ---
  openManagerBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'manager.html' });
  });

  // --- Color Settings Functions ---
  const colorSettingsForm = document.getElementById('color-settings-form');
  const fontColorPicker = document.getElementById('font-color-picker');
  const sectionTitleColorPicker = document.getElementById('section-title-color-picker');
  const categoryTitleColorPicker = document.getElementById('category-title-color-picker');
  const fontSizePicker = document.getElementById('font-size-picker');
  const sectionTitleSizePicker = document.getElementById('section-title-size-picker');
  const categoryTitleSizePicker = document.getElementById('category-title-size-picker');
  const resetStylesBtn = document.getElementById('reset-styles-btn');

  const defaultStyles = {
      fontColor: '#f8f8f2',
      sectionTitleColor: '#50fa7b',
      categoryTitleColor: '#bd93f9',
      fontSize: '16',
      sectionTitleSize: '16',
      categoryTitleSize: '16'
  };

  function loadColorSettings() {
      chrome.storage.sync.get(defaultStyles, data => {
          fontColorPicker.value = data.fontColor;
          sectionTitleColorPicker.value = data.sectionTitleColor;
          categoryTitleColorPicker.value = data.categoryTitleColor;
          fontSizePicker.value = data.fontSize;
          sectionTitleSizePicker.value = data.sectionTitleSize;
          categoryTitleSizePicker.value = data.categoryTitleSize;
      });
  }

  colorSettingsForm.addEventListener('submit', e => {
      e.preventDefault();
      const styles = {
        fontColor: fontColorPicker.value,
        sectionTitleColor: sectionTitleColorPicker.value,
        categoryTitleColor: categoryTitleColorPicker.value,
        fontSize: fontSizePicker.value,
        sectionTitleSize: sectionTitleSizePicker.value,
        categoryTitleSize: categoryTitleSizePicker.value
      };
      chrome.storage.sync.set(styles, () => {
          alert('Style settings saved!');
      });
  });

  resetStylesBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to reset all style settings to their defaults?")) {
        chrome.storage.sync.set(defaultStyles, () => {
            loadColorSettings();
            alert("Styles have been reset to default.");
        });
    }
  });

  // --- Import Functions ---
  const importBookmarksBtn = document.getElementById('import-bookmarks-btn');

  // Helper function to get the dashboard folder
  function getDashboardFolder() {
    return new Promise((resolve, reject) => {
      chrome.bookmarks.getSubTree('1', (results) => {
        if (chrome.runtime.lastError || !results || results.length === 0) {
          return reject("Could not access the Bookmarks Bar: " + (chrome.runtime.lastError?.message || 'Unknown error'));
        }
        const bookmarksBarNode = results[0];
        const appFolder = bookmarksBarNode.children.find(node => node.title === DASHBOARD_FOLDER_NAME);

        if (appFolder) {
          resolve(appFolder);
        } else {
          chrome.bookmarks.create({ parentId: '1', title: DASHBOARD_FOLDER_NAME }, newFolder => {
            resolve(newFolder);
          });
        }
      });
    });
  }

  async function importBookmarksRecursive(sourceNode, destinationParentId) {
    if (sourceNode.children) {
      if (sourceNode.title === DASHBOARD_FOLDER_NAME) return;

      const newFolder = await new Promise(resolve => {
        chrome.bookmarks.create({ parentId: destinationParentId, title: sourceNode.title || "Untitled Folder" }, resolve);
      });

      for (const child of sourceNode.children) {
        await importBookmarksRecursive(child, newFolder.id);
      }
    }
    else if (sourceNode.url) {
      await new Promise(resolve => {
        chrome.bookmarks.create({ parentId: destinationParentId, title: sourceNode.title, url: sourceNode.url }, resolve);
      });
    }
  }

  importBookmarksBtn.addEventListener('click', async () => {
    if (confirm("This will import all bookmarks from your Bookmarks Bar into the dashboard. This may create duplicates if you've already added some. Continue?")) {
      try {
        importBookmarksBtn.textContent = "Importing...";
        importBookmarksBtn.disabled = true;

        const appFolder = await getDashboardFolder();
        const bookmarksBarTree = await new Promise(resolve => chrome.bookmarks.getSubTree('1', resolve));

        for (const node of bookmarksBarTree[0].children) {
            await importBookmarksRecursive(node, appFolder.id);
        }

        alert("Import complete! You can now view and manage your imported bookmarks in the Bookmark Manager.");
      } catch (error) {
        console.error("Bookmark import failed:", error);
        alert("Bookmark import failed. See the console for details.");
      } finally {
        importBookmarksBtn.textContent = "Import Now";
        importBookmarksBtn.disabled = false;
      }
    }
  });

  // --- Reset Functions ---
  const clearBookmarksBtn = document.getElementById('clear-bookmarks-btn');
  const clearCacheBtn = document.getElementById('clear-cache-btn');
  const resetAllBtn = document.getElementById('reset-all-btn');

  async function clearDashboardBookmarks() {
    if (confirm("Are you sure you want to delete all bookmarks and categories from the dashboard? This cannot be undone.")) {
      try {
        const appFolder = await getDashboardFolder();
        if (appFolder && appFolder.children) {
          for (const child of appFolder.children) {
            await new Promise(resolve => chrome.bookmarks.removeTree(child.id, resolve));
          }
        }
        alert("Dashboard bookmarks cleared.");
      } catch (error) {
        console.error("Failed to clear bookmarks:", error);
        alert("Failed to clear bookmarks. See console for details.");
      }
    }
  }

  async function resetAllSettings() {
    if (confirm("DANGER: This will delete all dashboard bookmarks, categories, and reset all settings (colors, pinned items). Are you absolutely sure?")) {
      await clearDashboardBookmarks();
      chrome.storage.sync.clear(() => console.log("Sync storage cleared."));
      chrome.storage.local.clear(() => console.log("Local storage cleared."));
      alert("Extension has been reset to default state.");
      loadColorSettings();
    }
  }

  clearBookmarksBtn.addEventListener('click', clearDashboardBookmarks);
  resetAllBtn.addEventListener('click', resetAllSettings);

  clearCacheBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to clear all cached settings and pinned items? This will not affect your bookmarks.")) {
      chrome.storage.sync.clear(() => {
        chrome.storage.local.clear(() => {
          console.log("Sync and local storage cleared.");
          alert("Extension cache and pinned items have been cleared.");
          loadColorSettings(); // Reload default styles
        });
      });
    }
  });

  // --- Initial Load ---
  loadAll();
});