// Auditable model allowlist. Neither model paths nor inference URLs come from UI.
const AI_MODELS = {
  '4b': {
    id: '4b', name: 'Qwen3-VL-4B Q4_K_M · CPU', repository: 'Qwen/Qwen3-VL-4B-Instruct-GGUF', revision: '1cd86afb9a95c410a6038ab3b40d8b578c892266',
    minimumFreeGiB: 4.5, minimumVisionFreeGiB: 5.5,
    files: [
      { name: 'Qwen3VL-4B-Instruct-Q4_K_M.gguf', sha256: '66358cb18bb6b3b1b6675aa412c7a88ef01d228f481184d13668e5201c730a0a' },
      { name: 'mmproj-Qwen3VL-4B-Instruct-F16.gguf', sha256: '256f3a43bd4205ffef48d6b92715e1e70b5b0e9aef06522584967513a9985331' },
    ],
  },
}
// 8B blev pensioneret 2026-09-21: den kraevede 7 GB fri RAM og kunne derfor
// ikke starte paa de fleste arbejds-pc'er. Den er bevidst IKKE i listen mere,
// saa oprydningen i createLocalAI sletter de gamle 8B-filer (5,7 GB) igen.
function getAIModel(id) {
  if (typeof id !== 'string' || !Object.hasOwn(AI_MODELS, id)) throw new Error('Ukendt AI-model. Vælg 4b.')
  return AI_MODELS[id]
}

function allModelFileNames() {
  return new Set(Object.values(AI_MODELS).flatMap(model => model.files.map(file => file.name)))
}
module.exports = { getAIModel, allModelFileNames }
