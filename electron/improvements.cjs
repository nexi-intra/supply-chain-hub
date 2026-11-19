const crypto = require('node:crypto')

const KEY = 'improvement-cases'
const HISTORY_LIMIT = 512
const REASON_LIMIT = 1000
const ROLES = ['user', 'manager', 'creator']
const CATEGORIES = ['process', 'automation', 'quality', 'workplace', 'cost', 'other']
const CUSTOM_CATEGORY_LIMIT = 60
const PRIORITIES = ['critical', 'high', 'medium', 'low']
const STATUSES = ['new', 'assessment', 'planned', 'in-progress', 'testing', 'ready-for-approval', 'completed', 'on-hold', 'declined']
const REVISION_COMMANDS = ['invite', 'update', 'submit', 'approve', 'return', 'set-deadlines', 'delete', 'reject-deletion']
const FIELDS = {
  create: ['title', 'problem', 'proposal', 'category', 'affectedTeamCodes', 'ownerEmail'],
  comment: ['message'], invite: ['email', 'kind', 'responseDueDate'], respond: ['assignmentId', 'accept'],
  update: ['status', 'priority', 'nextAction', 'dueDate', 'message'],
  submit: [], approve: ['message'], return: ['message'], acknowledge: ['notificationId'],
  'set-deadlines': ['feedbackDueDate', 'assignmentId', 'responseDueDate'],
  'request-deletion': ['message'], 'reject-deletion': ['requestId', 'message'], delete: ['message'],
}
const CASE_FIELDS = ['id', 'revision', 'title', 'problem', 'proposal', 'category', 'originTeamCode', 'affectedTeamCodes', 'createdBy', 'createdByName', 'createdAt', 'updatedAt', 'priority', 'status', 'nextAction', 'dueDate', 'assignments', 'history', 'notifications']
const OPTIONAL_CASE_FIELDS = ['feedbackDueDate', 'deletionRequests', 'deletedAt', 'deletedBy', 'deletionReason']
const ASSIGNMENT_FIELDS = ['id', 'email', 'name', 'teamCode', 'kind', 'status', 'invitedBy', 'invitedAt', 'respondedAt', 'responseDueDate']
const DELETION_REQUEST_FIELDS = ['id', 'requestedBy', 'requestedByName', 'requestedAt', 'message', 'status', 'reviewedBy', 'reviewedAt', 'reviewMessage']

function fail(code, message) {
  const error = new Error(`${code}: ${message}`)
  error.code = code
  throw error
}

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
}

function text(value, label, max, allowEmpty = false, code = 'IMPROVEMENTS_INVALID') {
  if (typeof value !== 'string' || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value) || (!allowEmpty && !value.trim())) {
    fail(code, `Invalid ${label}`)
  }
  return value.trim()
}

function identifier(value, label, code = 'IMPROVEMENTS_INVALID') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) fail(code, `Invalid ${label}`)
  return value
}

function email(value, code = 'IMPROVEMENTS_INVALID') {
  const result = text(value, 'email', 254, false, code).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail(code, 'Invalid email')
  return result
}

function choice(value, values, label, code = 'IMPROVEMENTS_INVALID') {
  if (!values.includes(value)) fail(code, `Invalid ${label}`)
  return value
}

/** En fast kategori-id eller en egen kategori skrevet af brugeren. */
function category(value, code = 'IMPROVEMENTS_INVALID') {
  if (CATEGORIES.includes(value)) return value
  const custom = text(value, 'category', CUSTOM_CATEGORY_LIMIT * 4, false, code).replace(/\s+/g, ' ')
  if (custom.length > CUSTOM_CATEGORY_LIMIT) fail(code, 'Invalid category')
  return custom
}

function calendarDate(value, label = 'dueDate', code = 'IMPROVEMENTS_INVALID') {
  if (value === '') return value
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) fail(code, `Invalid ${label}`)
  const date = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) fail(code, `Invalid ${label}`)
  return value
}

function timestamp(value, label, code) {
  if (typeof value !== 'string' || !Number.isFinite(new Date(value).getTime()) || new Date(value).toISOString() !== value) fail(code, `Invalid ${label}`)
}

function projectFields(value, fields) {
  return Object.fromEntries(fields.filter(field => Object.hasOwn(value, field)).map(field => [field, value[field]]))
}

function normalizeInput(input) {
  if (!plain(input) || typeof input.type !== 'string' || !Object.hasOwn(FIELDS, input.type)) fail('IMPROVEMENTS_INVALID', 'Invalid command')
  const allowed = ['operationId', 'type', ...FIELDS[input.type], ...(input.type === 'create' ? [] : ['caseId']), ...(REVISION_COMMANDS.includes(input.type) ? ['expectedRevision'] : [])]
  if (Reflect.ownKeys(input).some(key => !allowed.includes(key))) fail('IMPROVEMENTS_INVALID', 'Unknown command field')
  const command = { operationId: identifier(input.operationId, 'operationId'), type: input.type }
  if (input.type !== 'create') command.caseId = identifier(input.caseId, 'caseId')
  if (REVISION_COMMANDS.includes(input.type)) {
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) fail('IMPROVEMENTS_INVALID', 'Invalid expectedRevision')
    command.expectedRevision = input.expectedRevision
  }
  switch (input.type) {
    case 'create':
      command.title = text(input.title, 'title', 160)
      command.problem = text(input.problem, 'problem', 8000)
      command.proposal = text(input.proposal, 'proposal', 8000, true)
      command.category = category(input.category)
      if (!Array.isArray(input.affectedTeamCodes) || input.affectedTeamCodes.length > 100 || new Set(input.affectedTeamCodes).size !== input.affectedTeamCodes.length) fail('IMPROVEMENTS_INVALID', 'Invalid affectedTeamCodes')
      command.affectedTeamCodes = input.affectedTeamCodes.map(value => identifier(value, 'teamCode'))
      command.ownerEmail = email(input.ownerEmail)
      break
    case 'comment': case 'return':
      command.message = text(input.message, 'message', 4000)
      break
    case 'approve':
      if (Object.hasOwn(input, 'message')) command.message = text(input.message, 'message', 4000, true)
      break
    case 'invite':
      command.email = email(input.email)
      command.kind = choice(input.kind, ['owner', 'contributor'], 'kind')
      if (Object.hasOwn(input, 'responseDueDate')) command.responseDueDate = calendarDate(input.responseDueDate, 'responseDueDate')
      break
    case 'set-deadlines':
      if (!['feedbackDueDate', 'responseDueDate'].some(key => Object.hasOwn(input, key))) fail('IMPROVEMENTS_INVALID', 'At least one deadline is required')
      if (Object.hasOwn(input, 'feedbackDueDate')) command.feedbackDueDate = calendarDate(input.feedbackDueDate, 'feedbackDueDate')
      if (Object.hasOwn(input, 'responseDueDate')) {
        command.assignmentId = identifier(input.assignmentId, 'assignmentId')
        command.responseDueDate = calendarDate(input.responseDueDate, 'responseDueDate')
      } else if (Object.hasOwn(input, 'assignmentId')) fail('IMPROVEMENTS_INVALID', 'assignmentId requires responseDueDate')
      break
    case 'request-deletion': case 'delete': case 'reject-deletion':
      command.message = text(input.message, 'message', REASON_LIMIT)
      if (input.type === 'reject-deletion') command.requestId = identifier(input.requestId, 'requestId')
      break
    case 'respond':
      command.assignmentId = identifier(input.assignmentId, 'assignmentId')
      if (typeof input.accept !== 'boolean') fail('IMPROVEMENTS_INVALID', 'Invalid accept')
      command.accept = input.accept
      break
    case 'update':
      if (!['status', 'priority', 'nextAction', 'dueDate'].some(key => Object.hasOwn(input, key))) fail('IMPROVEMENTS_INVALID', 'Empty update')
      if (Object.hasOwn(input, 'status')) {
        command.status = choice(input.status, STATUSES, 'status')
        if (['ready-for-approval', 'completed', 'new'].includes(command.status)) fail('IMPROVEMENTS_INVALID', 'Use the approval workflow')
      }
      if (Object.hasOwn(input, 'priority')) command.priority = choice(input.priority, PRIORITIES, 'priority')
      if (Object.hasOwn(input, 'nextAction')) command.nextAction = text(input.nextAction, 'nextAction', 2000, true)
      if (Object.hasOwn(input, 'dueDate')) command.dueDate = calendarDate(input.dueDate)
      if (Object.hasOwn(input, 'message')) command.message = text(input.message, 'message', 4000)
      if (['on-hold', 'declined'].includes(command.status) && !command.message) fail('IMPROVEMENTS_INVALID', 'A reason is required')
      break
    case 'acknowledge':
      command.notificationId = identifier(input.notificationId, 'notificationId')
      break
  }
  return command
}

function normalizeDirectory(input) {
  const code = 'IMPROVEMENTS_DIRECTORY'
  if (!plain(input) || !Array.isArray(input.people) || !Array.isArray(input.teams)) fail(code, 'Approved directory is unavailable')
  const teams = input.teams.map(team => {
    if (!plain(team)) fail(code, 'Invalid team')
    const folderName = identifier(team.folderName, 'folderName', code)
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(folderName)) fail(code, 'Invalid team folder')
    return { folderName, name: text(team.name, 'team name', 200, false, code) }
  })
  const teamCodes = new Set(teams.map(team => team.folderName))
  if (teamCodes.size !== teams.length) fail(code, 'Duplicate team')
  const people = input.people.map(person => {
    if (!plain(person) || !teamCodes.has(person.teamCode) || (Object.hasOwn(person, 'status') && person.status !== 'approved')) fail(code, 'Directory must contain approved people in known teams')
    const publicPerson = { email: email(person.email, code), fullName: text(person.fullName, 'fullName', 200, false, code), teamCode: person.teamCode }
    if (Object.hasOwn(person, 'role')) publicPerson.role = choice(person.role, ROLES, 'role', code)
    return publicPerson
  })
  if (new Set(people.map(person => person.email)).size !== people.length) fail(code, 'Duplicate person')
  return { people, teams, teamCodes }
}

function readCases(value) {
  if (value === undefined) return []
  const code = 'IMPROVEMENTS_INVALID_DATA'
  if (!Array.isArray(value)) fail(code, 'Shared cases are not an array')
  const caseIds = new Set()
  const operations = new Set()
  for (const item of value) {
    if (!plain(item) || CASE_FIELDS.some(field => !Object.hasOwn(item, field)) || !Number.isSafeInteger(item.revision) || item.revision < 1 ||
      !Array.isArray(item.assignments) || !Array.isArray(item.history) || !Array.isArray(item.notifications) || item.history.length > HISTORY_LIMIT) fail(code, 'Invalid shared case')
    identifier(item.id, 'case id', code)
    if (caseIds.has(item.id)) fail(code, 'Duplicate case id')
    caseIds.add(item.id)
    choice(item.status, STATUSES, 'status', code)
    choice(item.priority, PRIORITIES, 'priority', code)
    if (category(item.category, code) !== item.category) fail(code, 'Invalid category')
    if (Object.hasOwn(item, 'feedbackDueDate')) calendarDate(item.feedbackDueDate, 'feedbackDueDate', code)
    if (['deletedAt', 'deletedBy', 'deletionReason'].some(field => Object.hasOwn(item, field))) {
      timestamp(item.deletedAt, 'deletedAt', code)
      email(item.deletedBy, code)
      text(item.deletionReason, 'deletionReason', REASON_LIMIT, false, code)
    }
    if (Object.hasOwn(item, 'deletionRequests')) {
      if (!Array.isArray(item.deletionRequests) || item.deletionRequests.length > HISTORY_LIMIT) fail(code, 'Invalid deletion requests')
      const requestIds = new Set()
      const pendingEmails = new Set()
      for (const request of item.deletionRequests) {
        if (!plain(request)) fail(code, 'Invalid deletion request')
        identifier(request.id, 'deletion request id', code)
        if (requestIds.has(request.id)) fail(code, 'Duplicate deletion request id')
        requestIds.add(request.id)
        const requestedBy = email(request.requestedBy, code)
        text(request.requestedByName, 'requestedByName', 200, false, code)
        timestamp(request.requestedAt, 'requestedAt', code)
        text(request.message, 'deletion request message', REASON_LIMIT, false, code)
        choice(request.status, ['pending', 'rejected', 'approved'], 'deletion request status', code)
        if (request.status === 'pending') {
          if (pendingEmails.has(requestedBy)) fail(code, 'Duplicate pending deletion request')
          pendingEmails.add(requestedBy)
        }
        if (Object.hasOwn(request, 'reviewedBy')) email(request.reviewedBy, code)
        if (Object.hasOwn(request, 'reviewedAt')) timestamp(request.reviewedAt, 'reviewedAt', code)
        if (Object.hasOwn(request, 'reviewMessage')) text(request.reviewMessage, 'reviewMessage', REASON_LIMIT, false, code)
      }
    }
    const assignmentIds = new Set()
    for (const assignment of item.assignments) {
      if (!plain(assignment)) fail(code, 'Invalid assignment')
      identifier(assignment.id, 'assignment id', code)
      if (assignmentIds.has(assignment.id)) fail(code, 'Duplicate assignment id')
      assignmentIds.add(assignment.id)
      email(assignment.email, code)
      choice(assignment.kind, ['owner', 'contributor'], 'assignment kind', code)
      choice(assignment.status, ['pending', 'accepted', 'declined'], 'assignment status', code)
      if (Object.hasOwn(assignment, 'responseDueDate')) calendarDate(assignment.responseDueDate, 'responseDueDate', code)
    }
    if (item.assignments.filter(assignment => assignment.kind === 'owner' && assignment.status !== 'declined').length > 1) fail(code, 'Conflicting owners')
    for (const entry of item.history) {
      if (!plain(entry) || !/^[a-f0-9]{64}$/.test(entry.fingerprint) || !['operation-reserved', ...Object.keys(FIELDS)].includes(entry.type)) fail(code, 'Invalid operation marker')
      identifier(entry.operationId, 'operationId', code)
      identifier(entry.id, 'history id', code)
      email(entry.actorEmail, code)
      if (operations.has(entry.operationId)) fail(code, 'Duplicate operation marker')
      operations.add(entry.operationId)
    }
    const notificationIds = new Set()
    for (const notification of item.notifications) {
      if (!plain(notification)) fail(code, 'Invalid notification')
      identifier(notification.id, 'notification id', code)
      email(notification.recipientEmail, code)
      if (notificationIds.has(notification.id)) fail(code, 'Duplicate notification id')
      notificationIds.add(notification.id)
    }
  }
  return value
}

function publicCase(item, actorEmail) {
  const result = structuredClone(projectFields(item, [...CASE_FIELDS, ...OPTIONAL_CASE_FIELDS]))
  result.assignments = result.assignments.map(assignment => projectFields(assignment, ASSIGNMENT_FIELDS))
  if (Object.hasOwn(result, 'deletionRequests')) result.deletionRequests = result.deletionRequests.map(request => projectFields(request, DELETION_REQUEST_FIELDS))
  result.history = result.history.filter(entry => entry.type !== 'operation-reserved').map(({ fingerprint, ...entry }) => entry)
  result.notifications = result.notifications.filter(notification => notification.recipientEmail === actorEmail)
    .map(({ id, type, recipientEmail, createdAt, message, readAt, assignmentId }) => ({
      id, type, recipientEmail, createdAt, message, readAt, ...(assignmentId === undefined ? {} : { assignmentId }),
    }))
  return result
}

function createImprovementsService({ getStore, getDirectory, now = Date.now, makeId = crypto.randomUUID, onChanged } = {}) {
  if (typeof getStore !== 'function' || typeof getDirectory !== 'function' || typeof now !== 'function' || typeof makeId !== 'function' || (onChanged !== undefined && typeof onChanged !== 'function')) throw new TypeError('Invalid improvements service dependencies')

  async function context(actor) {
    if (!plain(actor) || !ROLES.includes(actor.role) || !plain(actor.home)) fail('AUTH_REQUIRED', 'An authenticated employee is required')
    const actorEmail = email(actor.email, 'AUTH_REQUIRED')
    const directory = normalizeDirectory(await getDirectory())
    const person = directory.people.find(person => person.email === actorEmail)
    if (!person || actor.home.folderName !== person.teamCode || (person.role !== undefined && person.role !== actor.role)) fail('AUTH_REQUIRED', 'An approved current employee is required')
    return { directory, actor: { email: actorEmail, fullName: person.fullName, teamCode: person.teamCode, role: actor.role } }
  }

  function stamp() {
    const value = now()
    if (!Number.isFinite(value) || !Number.isFinite(new Date(value).getTime())) fail('IMPROVEMENTS_INVALID', 'Invalid service clock')
    return new Date(value).toISOString()
  }

  function newId() {
    return identifier(makeId(), 'generated id')
  }

  function history(command, actor, at, fingerprint, id = newId()) {
    return { id, type: command.type, actorEmail: actor.email, actorName: actor.fullName, at, message: command.message || '', operationId: command.operationId, fingerprint }
  }

  function owner(item) {
    return item.assignments.find(assignment => assignment.kind === 'owner' && assignment.status === 'accepted')
  }

  function permitted(condition, message) {
    if (!condition) fail('IMPROVEMENTS_FORBIDDEN', message)
  }

  function mutate(item, command, ctx, at, fingerprint, marker) {
    if (Object.hasOwn(item, 'deletedAt')) fail('IMPROVEMENTS_NOT_FOUND', 'Case not found')
    if (REVISION_COMMANDS.includes(command.type) && command.expectedRevision !== item.revision) fail('IMPROVEMENTS_CONFLICT', 'The displayed case revision has changed')
    const actor = ctx.actor
    const directory = ctx.directory
    const leader = ['manager', 'creator'].includes(actor.role)
    const accepted = item.assignments.some(assignment => assignment.email === actor.email && assignment.status === 'accepted')
    const active = !['ready-for-approval', 'completed', 'on-hold', 'declined'].includes(item.status)
    const frozen = ['ready-for-approval', 'completed', 'declined'].includes(item.status)
    const early = ['new', 'assessment', 'planned'].includes(item.status)
    const next = structuredClone(item)
    const notify = (recipientEmail, message, fields = {}) => {
      if (!directory.people.some(person => person.email === recipientEmail)) return
      next.notifications.push({ id: newId(), type: command.type, recipientEmail, createdAt: at, readAt: null, message, ...fields })
    }
    switch (command.type) {
      case 'comment': break
      case 'invite': {
        const ownsCase = item.assignments.some(assignment => assignment.kind === 'owner' && assignment.status === 'accepted' && assignment.email === actor.email)
        permitted(leader || (ownsCase && active && command.kind === 'contributor'), 'Only leaders invite people; the owner may invite contributors')
        permitted(!frozen, 'Review and final cases cannot be assigned')
        const person = directory.people.find(person => person.email === command.email)
        if (!person) fail('IMPROVEMENTS_INVALID', 'Only known approved people can be invited')
        if (person.role === 'creator') fail('IMPROVEMENTS_INVALID', 'The creator account cannot be invited')
        if (item.assignments.some(assignment => assignment.status !== 'declined' &&
          ((command.kind === 'owner' && assignment.kind === 'owner') || assignment.email === person.email))) fail('IMPROVEMENTS_CONFLICT', 'Invitation conflicts with an existing assignment')
        const assignment = { id: newId(), email: person.email, name: person.fullName, teamCode: person.teamCode, kind: command.kind, status: 'pending', invitedBy: actor.email, invitedAt: at, respondedAt: null }
        if (Object.hasOwn(command, 'responseDueDate')) assignment.responseDueDate = command.responseDueDate
        next.assignments.push(assignment)
        notify(person.email, `${actor.fullName} invited you as ${command.kind}`, { assignmentId: assignment.id })
        break
      }
      case 'respond': {
        const assignment = next.assignments.find(assignment => assignment.id === command.assignmentId)
        permitted(assignment?.email === actor.email && assignment.status === 'pending' && !frozen, 'Only the pending recipient of an editable case can respond')
        if (command.accept && assignment.kind === 'owner' && owner(item)) fail('IMPROVEMENTS_CONFLICT', 'An accepted owner already exists')
        assignment.status = command.accept ? 'accepted' : 'declined'
        assignment.respondedAt = at
        notify(assignment.invitedBy, `${actor.fullName} ${assignment.status} the invitation`, { assignmentId: assignment.id })
        break
      }
      case 'set-deadlines': {
        permitted(leader, 'Only leaders set administrative deadlines')
        permitted(!['completed', 'declined'].includes(item.status), 'Final cases cannot have deadlines changed')
        if (Object.hasOwn(command, 'responseDueDate')) {
          const assignment = next.assignments.find(assignment => assignment.id === command.assignmentId)
          if (!assignment) fail('IMPROVEMENTS_INVALID', 'Unknown assignment')
          permitted(assignment.status === 'pending', 'Only pending invitations have editable response deadlines')
          assignment.responseDueDate = command.responseDueDate
        }
        if (Object.hasOwn(command, 'feedbackDueDate')) next.feedbackDueDate = command.feedbackDueDate
        break
      }
      case 'request-deletion': {
        if (item.deletionRequests?.some(request => email(request.requestedBy) === actor.email && request.status === 'pending')) fail('IMPROVEMENTS_CONFLICT', 'A deletion request is already pending for this employee')
        next.deletionRequests = [...(next.deletionRequests || []), { id: newId(), requestedBy: actor.email, requestedByName: actor.fullName, requestedAt: at, message: command.message, status: 'pending' }]
        for (const person of directory.people) if (['manager', 'creator'].includes(person.role)) notify(person.email, `${actor.fullName} requested deletion of ${item.title}: ${command.message}`)
        break
      }
      case 'reject-deletion': {
        permitted(leader, 'Only leaders review deletion requests')
        const request = next.deletionRequests?.find(request => request.id === command.requestId)
        if (!request) fail('IMPROVEMENTS_INVALID', 'Unknown deletion request')
        if (request.status !== 'pending') fail('IMPROVEMENTS_CONFLICT', 'The deletion request is no longer pending')
        Object.assign(request, { status: 'rejected', reviewedBy: actor.email, reviewedAt: at, reviewMessage: command.message })
        notify(request.requestedBy, command.message)
        break
      }
      case 'delete':
        permitted(leader, 'Only leaders delete cases')
        Object.assign(next, { deletedAt: at, deletedBy: actor.email, deletionReason: command.message })
        for (const request of next.deletionRequests || []) {
          if (request.status === 'pending') Object.assign(request, { status: 'approved', reviewedBy: actor.email, reviewedAt: at, reviewMessage: command.message })
        }
        break
      case 'update':
        permitted(!frozen, 'Review and final cases cannot be updated')
        if (Object.hasOwn(command, 'priority')) permitted(leader, 'Only leaders prioritize')
        if (Object.hasOwn(command, 'status')) {
          if (['assessment', 'planned'].includes(command.status)) {
            permitted(leader && (early || item.status === 'on-hold'), 'Only leaders assess, plan or resume unstarted cases')
          } else if (['on-hold', 'declined'].includes(command.status)) {
            permitted(leader, 'Only leaders hold or decline nonfinal cases')
          } else {
            const transition = (command.status === 'in-progress' && (early || item.status === 'testing')) ||
              (command.status === 'testing' && item.status === 'in-progress')
            permitted(accepted && transition, 'Only accepted assignees make valid progress transitions')
          }
        }
        if (Object.hasOwn(command, 'nextAction') || Object.hasOwn(command, 'dueDate')) permitted(accepted && active, 'Only accepted assignees update progress')
        for (const field of ['status', 'priority', 'nextAction', 'dueDate']) if (Object.hasOwn(command, field)) next[field] = command[field]
        break
      case 'submit':
        permitted(owner(item)?.email === actor.email && ['in-progress', 'testing'].includes(item.status), 'Only the accepted owner can submit work in progress or testing')
        next.status = 'ready-for-approval'
        for (const person of directory.people) if (['manager', 'creator'].includes(person.role)) notify(person.email, `${actor.fullName} submitted ${item.title} for approval`)
        break
      case 'approve': case 'return':
        permitted(leader && item.status === 'ready-for-approval', 'Only leaders review cases that are ready for approval')
        if (!owner(item)) fail('IMPROVEMENTS_INVALID_DATA', 'A submitted case requires an accepted owner')
        next.status = command.type === 'approve' ? 'completed' : 'in-progress'
        notify(owner(item).email, command.type === 'approve' ? `${actor.fullName} approved ${item.title}` : command.message)
        break
      case 'acknowledge': {
        const notification = next.notifications.find(notification => notification.id === command.notificationId)
        permitted(notification?.recipientEmail === actor.email, 'Only the recipient can acknowledge a notification')
        notification.readAt = notification.readAt || at
        break
      }
    }
    const entry = history(command, actor, at, fingerprint, marker?.id)
    if (marker) next.history = next.history.map(current => current.operationId === command.operationId ? entry : current)
    else {
      if (next.history.length >= HISTORY_LIMIT) fail('IMPROVEMENTS_HISTORY_FULL', 'History is full; retry markers cannot be pruned')
      next.history.push(entry)
    }
    next.revision++
    next.updatedAt = at
    return next
  }

  function create(command, ctx, at, fingerprint) {
    if (command.affectedTeamCodes.some(code => !ctx.directory.teamCodes.has(code))) fail('IMPROVEMENTS_INVALID', 'Unknown affected team')
    const person = ctx.directory.people.find(person => person.email === command.ownerEmail)
    if (!person) fail('IMPROVEMENTS_INVALID', 'Only known approved people can be owner')
    if (person.role === 'creator') fail('IMPROVEMENTS_INVALID', 'The creator account cannot be owner')
    const self = person.email === ctx.actor.email
    const assignment = { id: newId(), email: person.email, name: person.fullName, teamCode: person.teamCode, kind: 'owner', status: self ? 'accepted' : 'pending', invitedBy: ctx.actor.email, invitedAt: at, respondedAt: self ? at : null }
    const notifications = self ? [] : [{ id: newId(), type: 'invite', recipientEmail: person.email, createdAt: at, readAt: null, message: `${ctx.actor.fullName} invited you as owner`, assignmentId: assignment.id }]
    return {
      id: newId(), revision: 1, title: command.title, problem: command.problem, proposal: command.proposal, category: command.category,
      originTeamCode: ctx.actor.teamCode, affectedTeamCodes: [...command.affectedTeamCodes], createdBy: ctx.actor.email, createdByName: ctx.actor.fullName,
      createdAt: at, updatedAt: at, priority: 'medium', status: 'new', nextAction: '', dueDate: '', assignments: [assignment],
      history: [history(command, ctx.actor, at, fingerprint)], notifications,
    }
  }

  function locateOperation(cases, command, actorEmail, fingerprint) {
    for (const item of cases) {
      const entry = item.history.find(entry => entry.operationId === command.operationId)
      if (!entry) continue
      if (entry.actorEmail !== actorEmail || entry.fingerprint !== fingerprint || (command.type !== 'create' && item.id !== command.caseId)) fail('IMPROVEMENTS_OPERATION_CONFLICT', 'Operation ID is already bound to another actor or payload')
      return { item, entry }
    }
    return null
  }

  async function changed() {
    if (onChanged) {
      try { await onChanged([KEY]) } catch {}
    }
  }

  async function snapshot(actor) {
    const ctx = await context(actor)
    const store = await getStore()
    const cases = readCases(await store.getAsync(KEY, { skipCache: true }))
    return {
      cases: cases.filter(item => !Object.hasOwn(item, 'deletedAt')).map(item => publicCase(item, ctx.actor.email)),
      people: ctx.directory.people.map(({ email, fullName, teamCode, role }) => ({ email, fullName, teamCode, ...(role === 'creator' ? { invitable: false } : {}) })),
      teams: ctx.directory.teams, actor: ctx.actor,
    }
  }

  async function command(actor, input) {
    actor = actor && { email: actor.email, role: actor.role, home: actor.home && { folderName: actor.home.folderName } }
    let captured
    try { captured = structuredClone(input) } catch { fail('IMPROVEMENTS_INVALID', 'Invalid command payload') }
    const initial = await context(actor)
    const command = normalizeInput(captured)
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ actorEmail: initial.actor.email, command })).digest('hex')
    const store = await getStore()
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const actual = await store.getAsync(KEY, { skipCache: true })
        const cases = readCases(actual)
        const ctx = await context(actor)
        const operation = locateOperation(cases, command, ctx.actor.email, fingerprint)
        if (operation && operation.entry.type !== 'operation-reserved') return publicCase(operation.item, ctx.actor.email)
        if (command.type === 'create') {
          const item = create(command, ctx, stamp(), fingerprint)
          if (cases.some(current => current.id === item.id)) fail('IMPROVEMENTS_CONFLICT', 'Generated case id already exists')
          await store.updateAsync(KEY, { op: 'compareAndSet', expected: actual, value: [...cases, item] })
          await changed()
          return publicCase(item, ctx.actor.email)
        }
        let item = cases.find(item => item.id === command.caseId)
        if (!item) fail('IMPROVEMENTS_NOT_FOUND', 'Case not found')
        if (operation) {
          // A claim left by an interrupted attempt of an older app version is finished at its claimed revision.
          item = operation.item
          const next = mutate(item, command, ctx, stamp(), fingerprint, operation.entry)
          await store.updateAsync(KEY, { op: 'replaceItem', id: item.id, expected: item, item: next })
          await changed()
          return publicCase(next, ctx.actor.email)
        }
        // One write: the finished history entry carries the operation id, so a retry after a lost response finds it
        // and returns the stored result. (A claim and then the result were two writes one after another – up to 90 s
        // each on the shared drive.) Compare-and-set on the whole list keeps operation ids unique across cases.
        const next = mutate(item, command, ctx, stamp(), fingerprint)
        await store.updateAsync(KEY, { op: 'compareAndSet', expected: actual, value: cases.map(current => current.id === item.id ? next : current) })
        await changed()
        return publicCase(next, ctx.actor.email)
      } catch (error) {
        if (error.code === 'KV_CONFLICT' && attempt === 2 && REVISION_COMMANDS.includes(command.type)) fail('IMPROVEMENTS_CONFLICT', 'The case changed while saving')
        if (error.code !== 'KV_CONFLICT' || attempt === 2) throw error
      }
    }
  }

  return { snapshot, command }
}

module.exports = { createImprovementsService }