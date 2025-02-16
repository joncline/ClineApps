export interface EntityMapping {
  sourceId: number;
  destinationId: number;
  name: string;
}

export interface ProjectMapping extends EntityMapping {
  tasks: Map<number, number>;  // source task ID -> destination task ID
}

export interface UserMapping extends EntityMapping {}

export interface MigrationMapping {
  user: UserMapping;
  projects: Map<number, ProjectMapping>;  // source project ID -> ProjectMapping
}
