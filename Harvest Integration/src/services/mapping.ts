import inquirer from 'inquirer';
import { HarvestService } from './harvest.js';
import { MigrationMapping, ProjectMapping, UserMapping } from '../types/mapping.js';

export class MappingService {
  constructor(
    private sourceHarvest: HarvestService,
    private destHarvest: HarvestService
  ) {}

  async createMapping(sourceUserId: number): Promise<MigrationMapping> {
    const userMapping = await this.mapUser(sourceUserId);
    const projectMappings = await this.mapProjects();
    
    return {
      user: userMapping,
      projects: projectMappings
    };
  }

  private async mapUser(sourceUserId: number): Promise<UserMapping> {
    // Get source user details
    const sourceUsers = await this.sourceHarvest.getUsers();
    const sourceUser = sourceUsers.find(u => u.id === sourceUserId);
    if (!sourceUser) {
      throw new Error(`Source user ${sourceUserId} not found`);
    }

    // Get destination users for selection
    const destUsers = await this.destHarvest.getUsers();
    const activeDestUsers = destUsers.filter(u => u.is_active);

    if (activeDestUsers.length === 0) {
      throw new Error('No active users found in destination account');
    }

    const { selectedUser } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedUser',
        message: `Select destination user to map to ${sourceUser.first_name} ${sourceUser.last_name}:`,
        choices: activeDestUsers.map(user => ({
          name: `${user.first_name} ${user.last_name} (${user.email})`,
          value: user
        }))
      }
    ]);

    return {
      sourceId: sourceUser.id,
      destinationId: selectedUser.id,
      name: `${sourceUser.first_name} ${sourceUser.last_name}`
    };
  }

  private async mapProjects(): Promise<Map<number, ProjectMapping>> {
    const sourceProjects = await this.sourceHarvest.getProjects();
    const destProjects = await this.destHarvest.getProjects();
    const projectMappings = new Map<number, ProjectMapping>();

    for (const sourceProject of sourceProjects) {
      const { selectedProject } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedProject',
          message: `Select destination project to map to "${sourceProject.name}":`,
          choices: [
            ...destProjects.map(project => ({
              name: project.name,
              value: project
            })),
            { name: 'Skip this project', value: null }
          ]
        }
      ]);

      if (selectedProject) {
        const taskMapping = await this.mapProjectTasks(sourceProject.id, selectedProject.id);
        
        projectMappings.set(sourceProject.id, {
          sourceId: sourceProject.id,
          destinationId: selectedProject.id,
          name: sourceProject.name,
          tasks: taskMapping
        });
      }
    }

    return projectMappings;
  }

  private async mapProjectTasks(sourceProjectId: number, destProjectId: number): Promise<Map<number, number>> {
    const sourceTasks = await this.sourceHarvest.getProjectTasks(sourceProjectId);
    const destTasks = await this.destHarvest.getProjectTasks(destProjectId);
    const taskMapping = new Map<number, number>();

    for (const sourceTask of sourceTasks) {
      const { selectedTask } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedTask',
          message: `Select destination task to map to "${sourceTask.task.name}":`,
          choices: [
            ...destTasks.map(task => ({
              name: task.task.name,
              value: task
            })),
            { name: 'Skip this task', value: null }
          ]
        }
      ]);

      if (selectedTask) {
        taskMapping.set(sourceTask.task.id, selectedTask.task.id);
      }
    }

    return taskMapping;
  }

  async remapFailedEntry(
    currentMapping: MigrationMapping,
    failedEntry: any
  ): Promise<MigrationMapping> {
    console.log('\nRemapping failed entry...');
    
    // Create a new mapping starting with the current one
    const newMapping: MigrationMapping = {
      user: currentMapping.user,
      projects: new Map(currentMapping.projects)
    };

    // Remap the project and its tasks
    const projectMapping = await this.mapProjects();
    
    // Update only the failed project mapping
    for (const [sourceId, mapping] of projectMapping.entries()) {
      if (sourceId === failedEntry.project.id) {
        newMapping.projects.set(sourceId, mapping);
        break;
      }
    }

    return newMapping;
  }
}
