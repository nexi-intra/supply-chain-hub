// Auditable model allowlist. Neither model paths nor inference URLs come from UI.
const AI_MODELS = {
  '8b': {
    id: '8b', name: 'Qwen3-VL-8B Q4_K_M · CPU', repository: 'Qwen/Qwen3-VL-8B-Instruct-GGUF', revision: 'f982a07559d4a2f6c8744d840bf6fccab30eea96',
    minimumFreeGiB: 7, minimumVisionFreeGiB: 8.5,
    files: [
      { name: 'Qwen3VL-8B-Instruct-Q4_K_M.gguf', sha256: '67d1659bfe71b89d50b45a4ad1a9e5b997e5bb16ce5da66a6a6167abd569e9e2' },
      { name: 'mmproj-Qwen3VL-8B-Instruct-F16.gguf', sha256: 'ca524100ebf825c9a870db1c580d03879e0da0ab2541697e2458e64891cf9d38' },
    ],
  },
}
function getAIModel(id) {
  if (typeof id !== 'string' || !Object.hasOwn(AI_MODELS, id)) throw new Error('Ukendt AI-model. Vælg 8b.')
  return AI_MODELS[id]
}
function allModelFileNames() {
  return new Set(Object.values(AI_MODELS).flatMap(model => model.files.map(file => file.name)))
}
module.exports = { getAIModel, allModelFileNames }
