// Single source for the access-controlled document libraries (Guide Library, Knowledge Base).
const LIBRARIES = Object.freeze({
  guides: Object.freeze({ items: 'guides', shared: 'shared-guides', requests: 'guide-access-requests' }),
  knowledge: Object.freeze({ items: 'knowledge-articles', shared: 'shared-knowledge-articles', requests: 'knowledge-access-requests' }),
})
const KINDS = Object.keys(LIBRARIES)
const PLATFORM_SHARED_KV_KEYS = new Set(['meal-plan-weeks', 'active-sessions', ...KINDS.map(kind => LIBRARIES[kind].shared)])
const libraryForItemsKey = key => KINDS.find(kind => LIBRARIES[kind].items === key) || null
const libraryForRequestsKey = key => KINDS.find(kind => LIBRARIES[kind].requests === key) || null
module.exports = { LIBRARIES, KINDS, PLATFORM_SHARED_KV_KEYS, libraryForItemsKey, libraryForRequestsKey }
