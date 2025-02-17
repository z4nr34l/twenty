import { Injectable } from '@nestjs/common';

import { EntityManager } from 'typeorm';

import {
  WorkspaceHealthColumnIssue,
  WorkspaceHealthIssueType,
} from 'src/workspace/workspace-health/interfaces/workspace-health-issue.interface';
import { WorkspaceMigrationBuilderAction } from 'src/workspace/workspace-migration-builder/interfaces/workspace-migration-builder-action.interface';
import { FieldMetadataDefaultValue } from 'src/metadata/field-metadata/interfaces/field-metadata-default-value.interface';

import { ObjectMetadataEntity } from 'src/metadata/object-metadata/object-metadata.entity';
import { WorkspaceMigrationEntity } from 'src/metadata/workspace-migration/workspace-migration.entity';
import { WorkspaceMigrationFieldFactory } from 'src/workspace/workspace-migration-builder/factories/workspace-migration-field.factory';

type WorkspaceHealthDefaultValueIssue =
  WorkspaceHealthColumnIssue<WorkspaceHealthIssueType.COLUMN_DEFAULT_VALUE_CONFLICT>;

@Injectable()
export class WorkspaceFixDefaultValueService {
  constructor(
    private readonly workspaceMigrationFieldFactory: WorkspaceMigrationFieldFactory,
  ) {}

  async fix(
    manager: EntityManager,
    objectMetadataCollection: ObjectMetadataEntity[],
    issues: WorkspaceHealthDefaultValueIssue[],
  ): Promise<Partial<WorkspaceMigrationEntity>[]> {
    const workspaceMigrations: Partial<WorkspaceMigrationEntity>[] = [];

    for (const issue of issues) {
      switch (issue.type) {
        case WorkspaceHealthIssueType.COLUMN_DEFAULT_VALUE_CONFLICT: {
          const columnNullabilityWorkspaceMigrations =
            await this.fixColumnDefaultValueIssues(
              objectMetadataCollection,
              issues.filter(
                (issue) =>
                  issue.type ===
                  WorkspaceHealthIssueType.COLUMN_DEFAULT_VALUE_CONFLICT,
              ) as WorkspaceHealthColumnIssue<WorkspaceHealthIssueType.COLUMN_DEFAULT_VALUE_CONFLICT>[],
            );

          workspaceMigrations.push(...columnNullabilityWorkspaceMigrations);
          break;
        }
      }
    }

    return workspaceMigrations;
  }

  private async fixColumnDefaultValueIssues(
    objectMetadataCollection: ObjectMetadataEntity[],
    issues: WorkspaceHealthColumnIssue<WorkspaceHealthIssueType.COLUMN_DEFAULT_VALUE_CONFLICT>[],
  ): Promise<Partial<WorkspaceMigrationEntity>[]> {
    const fieldMetadataUpdateCollection = issues.map((issue) => {
      const oldDefaultValue =
        this.computeFieldMetadataDefaultValueFromColumnDefault(
          issue.columnStructure?.columnDefault,
        );

      return {
        current: {
          ...issue.fieldMetadata,
          defaultValue: oldDefaultValue,
        },
        altered: issue.fieldMetadata,
      };
    });

    return this.workspaceMigrationFieldFactory.create(
      objectMetadataCollection,
      fieldMetadataUpdateCollection,
      WorkspaceMigrationBuilderAction.UPDATE,
    );
  }

  private computeFieldMetadataDefaultValueFromColumnDefault(
    columnDefault: string | undefined,
  ): FieldMetadataDefaultValue<'default'> {
    if (
      columnDefault === undefined ||
      columnDefault === null ||
      columnDefault === 'NULL'
    ) {
      return null;
    }

    if (!isNaN(Number(columnDefault))) {
      return { value: +columnDefault };
    }

    if (columnDefault === 'true') {
      return { value: true };
    }

    if (columnDefault === 'false') {
      return { value: false };
    }

    if (columnDefault === '') {
      return { value: '' };
    }

    if (columnDefault === 'now()') {
      return { type: 'now' };
    }

    if (columnDefault.startsWith('public.uuid_generate_v4')) {
      return { type: 'uuid' };
    }

    return { value: columnDefault };
  }
}
