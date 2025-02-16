export interface TimeEntry {
  id: number;
  spent_date: string;
  hours: number;
  notes: string;
  project: {
    id: number;
    name: string;
  };
  task: {
    id: number;
    name: string;
  };
  user: {
    id: number;
    name: string;
  };
}

export interface HarvestConfig {
  accessToken: string;
  accountId: string;
  baseUrl: string;
}

export interface MigrationConfig {
  source: HarvestConfig;
  destination: HarvestConfig;
}
