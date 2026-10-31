/** Welcome-flow state (first-run setup wizard), backed by `app_settings.welcome_flow_completed`. */
import { isSystemReady } from '../../lib/db/system-status';
import { getAppSettingRow, updateAppSetting } from './settings';

export const SETUP_TYPES = ['pro_mode', 'get_started'] as const;
export type SetupType = (typeof SETUP_TYPES)[number];

export interface WelcomeMetadata {
  screens_completed: number[];
  completion_date: string | null;
  setup_type: string | null;
}

export interface WelcomeFlowState {
  isFirstRun: boolean;
  completed: boolean;
  dbReady: boolean;
  metadata: WelcomeMetadata;
}

export const EMPTY_WELCOME_METADATA: WelcomeMetadata = { screens_completed: [], completion_date: null, setup_type: null };

/** Throws on database errors; callers decide the fallback. */
export async function getWelcomeFlowState(): Promise<WelcomeFlowState> {
  if (!(await isSystemReady())) {
    return { isFirstRun: true, completed: false, dbReady: false, metadata: EMPTY_WELCOME_METADATA };
  }
  const row = await getAppSettingRow('welcome_flow_completed');
  const completed = row?.setting_value === 'true';
  const metadata = (row?.metadata as WelcomeMetadata | null | undefined) ?? EMPTY_WELCOME_METADATA;
  return { isFirstRun: !completed, completed, dbReady: true, metadata };
}

/** Marks the welcome flow finished. Returns false when the `welcome_flow_completed` row does not exist. */
export async function completeWelcomeFlow(setupType: SetupType): Promise<boolean> {
  const metadata: WelcomeMetadata = {
    screens_completed: setupType === 'pro_mode' ? [1] : [1, 2, 3],
    completion_date: new Date().toISOString(),
    setup_type: setupType,
  };
  return updateAppSetting('welcome_flow_completed', 'true', undefined, metadata as unknown as Record<string, unknown>);
}
