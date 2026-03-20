import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/database-init';
import { logger } from '@/lib/logger';

interface StatsSettingsRow {
  enabled: number;
  ai_provider: string;
  ai_api_key: string | null;
  ai_model: string;
  both_sides_required: number;
  auto_advance_on_match: number;
}

export async function GET() {
  try {
    const db = await getDbInstance();

    const settings = await db.get<StatsSettingsRow>(
      'SELECT enabled, ai_provider, ai_api_key, ai_model, both_sides_required, auto_advance_on_match FROM stats_settings WHERE id = 1'
    );

    const safeSettings = settings ? {
      enabled: Boolean(settings.enabled),
      ai_provider: settings.ai_provider || 'anthropic',
      ai_api_key: settings.ai_api_key ? '***configured***' : '',
      ai_model: settings.ai_model || 'claude-sonnet-4-20250514',
      both_sides_required: Boolean(settings.both_sides_required),
      auto_advance_on_match: Boolean(settings.auto_advance_on_match),
    } : {
      enabled: false,
      ai_provider: 'anthropic',
      ai_api_key: '',
      ai_model: 'claude-sonnet-4-20250514',
      both_sides_required: false,
      auto_advance_on_match: false,
    };

    return NextResponse.json(safeSettings);
  } catch (error) {
    logger.error('Error fetching stats settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats settings' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const db = await getDbInstance();
    const body = await request.json();

    await db.run('INSERT OR IGNORE INTO stats_settings (id) VALUES (1)');

    const updateFields: string[] = [];
    const updateValues: unknown[] = [];

    if (body.enabled !== undefined) {
      updateFields.push('enabled = ?');
      updateValues.push(body.enabled ? 1 : 0);
    }
    if (body.ai_provider !== undefined) {
      updateFields.push('ai_provider = ?');
      updateValues.push(body.ai_provider);
    }
    if (body.ai_api_key !== undefined && body.ai_api_key !== '***configured***') {
      updateFields.push('ai_api_key = ?');
      updateValues.push(body.ai_api_key || null);
    }
    if (body.ai_model !== undefined) {
      updateFields.push('ai_model = ?');
      updateValues.push(body.ai_model);
    }
    if (body.both_sides_required !== undefined) {
      updateFields.push('both_sides_required = ?');
      updateValues.push(body.both_sides_required ? 1 : 0);
    }
    if (body.auto_advance_on_match !== undefined) {
      updateFields.push('auto_advance_on_match = ?');
      updateValues.push(body.auto_advance_on_match ? 1 : 0);
    }

    if (updateFields.length > 0) {
      await db.run(
        `UPDATE stats_settings SET ${updateFields.join(', ')} WHERE id = 1`,
        updateValues
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error updating stats settings:', error);
    return NextResponse.json(
      { error: 'Failed to update stats settings' },
      { status: 500 }
    );
  }
}
