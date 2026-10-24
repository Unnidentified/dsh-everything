import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { MigrationPlan, MigrationReport, MigrationTaskInfo, AutomaticMigrationStatus } from '../wire.ts';
export interface MigrationActions {
    automaticStatus?: () => Promise<AutomaticMigrationStatus>;
    list: () => Promise<MigrationTaskInfo[]>;
    scan: (task: string) => Promise<MigrationPlan>;
    migrate: (token: string) => Promise<MigrationReport>;
}
/** Shared settings entry for present and future versioned migrations. */
export declare function MigrationPanel({ list, scan, migrate, automaticStatus, t }: MigrationActions & PropsLocale<'filesnap'>): import("react").JSX.Element;
