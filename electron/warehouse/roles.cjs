// CountPoint roles on top of the Hub login. Managers come from the Hub (read-only); admins and status managers are
// appointed inside CountPoint and stored per team, with a log of who changed what. A status manager may do what a
// manager may in CountPoint (main.cjs passes them on as managers, marked statusManager), except granting that role.
// Placerings admin is a role of its own (maintains locations and undoes actions in Placeringer), independent of the
// Optælling role; only a Hub manager gives it.
const fs = require('node:fs')

const ROLES_KEY = 'roller'
const LOG_MAX = 200
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}$/

function codeError(code, message) {
  const error = new Error(message || code)
  error.code = code
  return error
}

const lower = value => String(value || '').trim().toLowerCase()
const isManager = user => user.role === 'manager' || user.role === 'creator'

function createRoles({ storeFor, listTeamUsers, now = Date.now }) {
  async function read(team) {
    const store = storeFor(team)
    const stored = await store.getAsync(ROLES_KEY)
    // A missing file is "no roles yet" only while the team folder is there; with M: down it must not read as "not admin".
    if (stored === undefined && store.dataDir && !(await fs.promises.access(store.dataDir).then(() => true, () => false))) throw codeError('STORAGE_UNAVAILABLE', 'Lagerstyrings data kan ikke læses lige nu')
    const value = stored || {}
    return { admins: value.admins || {}, statusManagers: value.statusManagers || {}, locationAdmins: value.locationAdmins || {}, log: Array.isArray(value.log) ? value.log : [] }
  }

  /** Read-change-write under the roles file's lock (the lock 1.6.6's compareAndSet uses): no extra read, no retried write. */
  async function change(team, fn) {
    let next
    await storeFor(team).mutateAsync(ROLES_KEY, current => {
      next = fn({ admins: { ...(current?.admins || {}) }, statusManagers: { ...(current?.statusManagers || {}) }, locationAdmins: { ...(current?.locationAdmins || {}) }, log: [...(current?.log || [])] })
      return next
    })
    return next
  }

  /** 'manager' (from the Hub), 'status-manager' or 'admin' (appointed in CountPoint) or 'user'. */
  async function roleOf(user) {
    if (user.statusManager) return 'status-manager'
    if (isManager(user)) return 'manager'
    const { admins, statusManagers } = await read(user.team)
    const email = lower(user.email)
    return statusManagers[email] ? 'status-manager' : admins[email] ? 'admin' : 'user'
  }

  async function list(user) {
    const [{ admins, statusManagers, locationAdmins, log }, users] = await Promise.all([read(user.team), listTeamUsers(user.team)])
    return {
      team: user.team,
      canEdit: isManager(user),
      canGrantStatusManager: isManager(user) && !user.statusManager,
      users: users.map(item => ({
        email: item.email, fullName: item.fullName,
        role: item.role !== 'user' ? 'manager' : statusManagers[item.email] ? 'status-manager' : admins[item.email] ? 'admin' : 'user',
        locationRole: item.role !== 'user' ? 'manager' : locationAdmins[item.email] ? 'location-admin' : 'user',
      })),
      log: [...log].reverse().slice(0, 50),
    }
  }

  /** `role` 'user', 'admin' or 'status-manager'. Only a real (Hub) manager grants or removes 'status-manager'. */
  async function setRole(user, { email, role } = {}) {
    if (!isManager(user)) throw codeError('MANAGER_ONLY', 'Kun managers kan ændre roller')
    if (!['user', 'admin', 'status-manager'].includes(role)) throw codeError('ROLE_INVALID', 'Ugyldig rolle')
    const target = lower(email)
    if (!EMAIL.test(target)) throw codeError('ROLE_INVALID', 'Ugyldig bruger')
    const member = (await listTeamUsers(user.team)).find(item => item.email === target)
    if (!member) throw codeError('ROLE_INVALID', 'Brugeren er ikke i teamet')
    if (member.role !== 'user') throw codeError('ROLE_INVALID', 'Managers har allerede alle rettigheder')
    const by = { email: lower(user.email), name: user.fullName || user.email }
    await change(user.team, value => {
      const before = value.statusManagers[target] ? 'status-manager' : value.admins[target] ? 'admin' : 'user'
      if (user.statusManager && (role === 'status-manager' || before === 'status-manager')) throw codeError('MANAGER_ONLY', 'Kun en manager kan give eller fjerne rollen status manager')
      if (before === role) return value
      delete value.admins[target]
      delete value.statusManagers[target]
      const entry = { name: member.fullName, by, at: now() }
      if (role === 'admin') value.admins[target] = entry
      if (role === 'status-manager') value.statusManagers[target] = entry
      const log = action => ({ at: now(), by, email: target, name: member.fullName, action })
      if (before !== 'user') value.log.push(log(`${before}-removed`))
      if (role !== 'user') value.log.push(log(`${role}-added`))
      value.log = value.log.slice(-LOG_MAX)
      return value
    })
    return { email: target, role }
  }

  /** Placerings admin: a (real) Hub manager, or someone given the role – not Optælling's admin or status manager. */
  async function isLocationAdmin(user) {
    if (isManager(user) && !user.statusManager) return true
    return Boolean((await read(user.team)).locationAdmins[lower(user.email)])
  }

  /** Gives or removes Placerings admin. Only a real (Hub) manager, never a status manager. */
  async function setLocationAdmin(user, { email, admin } = {}) {
    if (!isManager(user) || user.statusManager) throw codeError('MANAGER_ONLY', 'Kun managers kan give rollen Placerings admin')
    const target = lower(email)
    if (!EMAIL.test(target)) throw codeError('ROLE_INVALID', 'Ugyldig bruger')
    const member = (await listTeamUsers(user.team)).find(item => item.email === target)
    if (!member) throw codeError('ROLE_INVALID', 'Brugeren er ikke i teamet')
    if (member.role !== 'user') throw codeError('ROLE_INVALID', 'Managers har allerede alle rettigheder')
    const by = { email: lower(user.email), name: user.fullName || user.email }
    const wanted = admin === true
    await change(user.team, value => {
      if (Boolean(value.locationAdmins[target]) === wanted) return value
      if (wanted) value.locationAdmins[target] = { name: member.fullName, by, at: now() }
      else delete value.locationAdmins[target]
      value.log.push({ at: now(), by, email: target, name: member.fullName, action: wanted ? 'location-admin-added' : 'location-admin-removed' })
      value.log = value.log.slice(-LOG_MAX)
      return value
    })
    return { email: target, locationAdmin: wanted }
  }

  function setAdmin(user, { email, admin } = {}) {
    return setRole(user, { email, role: admin === true ? 'admin' : 'user' })
  }

  return { roleOf, list, setRole, setAdmin, isLocationAdmin, setLocationAdmin }
}

module.exports = { createRoles }
