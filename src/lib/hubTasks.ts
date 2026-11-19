import type { ShiftRole } from './types'

export interface HubTask {
  taskName: string
  taskColor: string
  people: Array<{ name: string; email?: string; comment?: string }>
  roleId: string
}

export function buildHubTasks(roles: ShiftRole[], assignments: Array<{ roleId: string; name: string; email?: string; comment?: string }>): HubTask[] {
  const peopleByRole = new Map<string, HubTask['people']>()
  for (const assignment of assignments) {
    const people = peopleByRole.get(assignment.roleId) || []
    if (!people.some((person) => assignment.email ? person.email === assignment.email : person.name === assignment.name)) {
      people.push({ name: assignment.name, email: assignment.email, comment: assignment.comment })
    }
    peopleByRole.set(assignment.roleId, people)
  }
  return roles.flatMap((role) => {
    const people = peopleByRole.get(role.id) || []
    return role.onlyWhenAssigned && people.length === 0
      ? []
      : [{ roleId: role.id, taskName: role.name, taskColor: role.color, people }]
  })
}

/** Filtrerer kun widgetens visning; opgaver og tildelinger i vagtplanen ændres ikke. */
export function filterHubTasks<T extends Pick<HubTask, 'people'>>(tasks: T[], onlyAssigned: boolean): T[] {
  return onlyAssigned ? tasks.filter(task => task.people.length > 0) : tasks
}
