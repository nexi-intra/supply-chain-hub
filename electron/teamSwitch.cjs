const path = require('node:path')

// Login/resume kalder switchTeam hver gang. Er det samme team allerede aabent,
// skal storen (og dens cache og watcher) ikke genskabes.
function isSameTeamTarget(current, folderName, newDir) {
  if (!current?.folder || !current.dataDir || !newDir) return false
  return current.folder === folderName && path.resolve(current.dataDir) === path.resolve(newDir)
}

module.exports = { isSameTeamTarget }
