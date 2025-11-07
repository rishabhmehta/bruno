const Store = require('electron-store');

class GitConfigStore {
  constructor() {
    this.store = new Store({
      name: 'git-config',
      clearInvalidConfig: true
    });
  }

  /**
   * Get git config for a collection
   */
  getGitConfig(collectionPath) {
    const configs = this.store.get('gitConfigs', {});
    return configs[collectionPath] || null;
  }

  /**
   * Set git config for a collection
   */
  setGitConfig(collectionPath, config) {
    const configs = this.store.get('gitConfigs', {});
    configs[collectionPath] = {
      ...configs[collectionPath],
      ...config,
      updatedAt: new Date().toISOString()
    };
    this.store.set('gitConfigs', configs);
  }

  /**
   * Remove git config for a collection
   */
  removeGitConfig(collectionPath) {
    const configs = this.store.get('gitConfigs', {});
    delete configs[collectionPath];
    this.store.set('gitConfigs', configs);
  }

  /**
   * Get all git configs
   */
  getAllGitConfigs() {
    return this.store.get('gitConfigs', {});
  }
}

module.exports = {
  gitConfigStore: new GitConfigStore()
};
