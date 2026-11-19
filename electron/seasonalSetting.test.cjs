const test = require('node:test')
const assert = require('node:assert/strict')
const { PERSONAL_KEY } = require('./securedIpc.cjs')
const { personalKey } = require('./accountReferences.cjs')
const { eraseUserData } = require('./userErasure.cjs')

const key = 'user-christmas-user_jacob@example.test'

test('the seasonal opt-out is a personal setting stored with the user, like light/dark', () => {
  assert.equal(PERSONAL_KEY.test(key), true)
})

test('the seasonal opt-out follows the user when the account moves to a new email', () => {
  assert.equal(personalKey(key, 'jacob@example.test', 'new@example.test'), 'user-christmas-user_new@example.test')
})

test('the seasonal opt-out is removed when the user is erased', async () => {
  const data = new Map([[key, false], ['user-christmas-user_other@example.test', false]])
  const store = {
    getAsync: async name => data.get(name),
    updateAsync: async () => {},
    deleteAsync: async name => { data.delete(name) },
    keysAsync: async () => [...data.keys()],
  }
  await eraseUserData(store, 'jacob@example.test')
  assert.deepEqual([...data.keys()], ['user-christmas-user_other@example.test'])
})
