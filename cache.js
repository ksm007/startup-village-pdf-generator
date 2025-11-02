class SimpleCache {
   
   static cache = new Map();
static ttl = 60000; // Default TTL of 1 minute

    /**
     * Sets a value in the cache with a given key.
     * @param {string} key - The key to store the value under.
     * @param {*} value - The value to be cached.
     */
    static set(key, value, noTTL = false) {
        const expirationTime = noTTL ? null : Date.now() + this.ttl;
        this.cache.set(key, { value, expirationTime });
    }

    /**
     * Retrieves a value from the cache.
     * Returns null if the key is not found or the value has expired.
     * @param {string} key - The key of the value to retrieve.
     * @returns {*} The cached value, or null.
     */
    static get(key) {
        const cachedItem = this.cache.get(key);

        if (!cachedItem) {
            return null;
        }
        if (cachedItem.expirationTime === null) {
            return cachedItem.value;
        }
        if (Date.now() > cachedItem.expirationTime) {
            this.delete(key); // Remove expired item
            return null;
        }

        return cachedItem.value;
    }

    /**
     * Deletes a value from the cache.
     * @param {string} key - The key of the value to delete.
     */
    static delete(key) {
        this.cache.delete(key);
    }

    /**
     * Clears the entire cache.
     */
    static clear() {
        this.cache.clear();
    }
}

module.exports = SimpleCache;