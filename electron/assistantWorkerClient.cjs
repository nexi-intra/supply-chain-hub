const path = require('node:path')
const { fork } = require('node:child_process')
const METHODS = ['authorize', 'query', 'getGuide', 'getImage', 'getRecord', 'moduleCatalog', 'revalidateSources', 'prepare']
function createAssistantWorkerClient({ getState, workerPath = path.join(__dirname, 'assistantWorker.cjs'), timeoutMs = 20000 } = {}) {
  let child = null
  let generation = 0
  let sequence = 0
  const pending = new Map()
  function stop(message = 'Chatbot-opslaget blev afbrudt') {
    generation++
    const old = child; child = null
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error(message)) }
    pending.clear()
    old?.kill()
  }
  function start() {
    if (child) return child
    const helper = fork(workerPath, [], { execArgv: [], windowsHide: true, serialization: 'advanced', stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: {
      SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.PATH,
      TEMP: process.env.TEMP, TMP: process.env.TMP, USERPROFILE: process.env.USERPROFILE,
      LOCALAPPDATA: process.env.LOCALAPPDATA, ELECTRON_RUN_AS_NODE: '1',
    } })
    child = helper
    helper.on('message', message => {
      if (child !== helper) return
      const request = pending.get(message?.id)
      if (!request) return
      pending.delete(message.id); clearTimeout(request.timer)
      if (message.error) request.reject(new Error(message.error.message))
      else request.resolve(message.result)
    })
    helper.on('error', () => { if (child === helper) stop('Chatbottens baggrundsproces kunne ikke starte') })
    helper.on('exit', () => { if (child === helper) stop('Chatbottens baggrundsproces stoppede') })
    return helper
  }
  const scopeOf = state => JSON.stringify([state.platformRoot, state.activeDir, state.currentFolder])
  function session() {
    const epoch = generation
    const scope = scopeOf(getState())
    const valid = () => { if (epoch !== generation || scope !== scopeOf(getState())) throw new Error('Hubben blev ændret, eller opslaget blev afbrudt. Stil spørgsmålet igen.') }
    const result = {}
    for (const method of METHODS) result[method] = async (...args) => {
      valid()
      const config = getState()
      const helper = start()
      const id = ++sequence
      const value = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => stop('Dataopslaget tog for lang tid. Prøv igen, når netværksdrevet svarer.'), timeoutMs)
        pending.set(id, { resolve, reject, timer, method })
        helper.send({ kind: 'call', id, method, args, config }, error => {
          if (error && child === helper) stop('Forbindelsen til chatbottens baggrundsproces blev afbrudt')
        })
      })
      valid()
      return value
    }
    return result
  }
  return { session, stop, cancel: () => { if ([...pending.values()].some(request => request.method !== 'prepare')) stop() }, invalidate: keys => { if (child?.connected) child.send({ kind: 'invalidate', keys }, () => {}) } }
}
module.exports = { createAssistantWorkerClient }
