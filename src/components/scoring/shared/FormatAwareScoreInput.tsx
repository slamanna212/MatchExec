'use client'

import { NumberInput, Group, Text, Stack, Alert } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { ScoringConfig } from '@/shared/types';

interface FormatAwareScoreInputProps {
  team1Score: number;
  team2Score: number;
  onTeam1ScoreChange: (value: number) => void;
  onTeam2ScoreChange: (value: number) => void;
  team1Name?: string;
  team2Name?: string;
  scoringConfig: ScoringConfig;
  disabled?: boolean;
  label?: string;
  description?: string;
}

export function FormatAwareScoreInput({
  team1Score,
  team2Score,
  onTeam1ScoreChange,
  onTeam2ScoreChange,
  team1Name = 'Team 1',
  team2Name = 'Team 2',
  scoringConfig,
  disabled = false,
  label,
  description
}: FormatAwareScoreInputProps) {

  // Get validation rules from scoring config
  const getValidationRules = () => {
    const { validation, scoringType } = scoringConfig;
    
    let min = 0;
    let max = 1000;
    let step = 1;
    let suffix = '';

    switch (scoringType) {
      case 'rounds':
        min = 0;
        max = validation.maxRounds || 25;
        suffix = ' rounds';
        break;
      case 'points':
        min = 0;
        max = validation.targetPoints || 100;
        suffix = ' points';
        break;
      case 'deathmatch':
        min = 0;
        max = validation.targetEliminations || 100;
        suffix = ' eliminations';
        break;
      case 'objective':
        min = 0;
        max = 500; // meters
        step = 0.1;
        suffix = 'm';
        break;
      case 'vehicle':
        min = 0;
        max = 100; // percentage
        suffix = '%';
        break;
      default:
        // Custom or other types
        break;
    }

    return { min, max, step, suffix };
  };

  const { min, max, step, suffix } = getValidationRules();

  // Validate scores
  const getValidationErrors = () => {
    const errors: string[] = [];

    if (team1Score < min || team1Score > max) {
      errors.push(`${team1Name} score must be between ${min} and ${max}`);
    }
    if (team2Score < min || team2Score > max) {
      errors.push(`${team2Name} score must be between ${min} and ${max}`);
    }

    // Format-specific validations
    if (scoringConfig.format === 'competitive') {
      // Competitive might have stricter rules
      if (scoringConfig.scoringType === 'rounds' && Math.abs(team1Score - team2Score) < 2) {
        // Competitive rounds often need 2-round lead
        if (team1Score >= (max / 2) || team2Score >= (max / 2)) {
          errors.push('Competitive format requires 2-round lead to win');
        }
      }
    }

    return errors;
  };

  const validationErrors = getValidationErrors();

  return (
    <Stack gap="sm">
      {label && <Text fw={600} size="sm">{label}</Text>}
      {description && <Text size="xs" c="dimmed">{description}</Text>}
      
      <Group grow>
        <NumberInput
          label={team1Name}
          value={team1Score}
          onChange={(value) => onTeam1ScoreChange(Number(value) || 0)}
          min={min}
          max={max}
          step={step}
          suffix={suffix}
          disabled={disabled}
          error={validationErrors.some(e => e.includes(team1Name))}
        />

        <NumberInput
          label={team2Name}
          value={team2Score}
          onChange={(value) => onTeam2ScoreChange(Number(value) || 0)}
          min={min}
          max={max}
          step={step}
          suffix={suffix}
          disabled={disabled}
          error={validationErrors.some(e => e.includes(team2Name))}
        />
      </Group>

      {/* Show validation errors */}
      {validationErrors.length > 0 && (
        <Alert icon={<IconAlertCircle size={16} />} color="yellow" size="sm">
          <Stack gap={4}>
            {validationErrors.map((error, index) => (
              <Text key={index} size="xs">{error}</Text>
            ))}
          </Stack>
        </Alert>
      )}

      {/* Show format-specific hints */}
      <Text size="xs" c="dimmed">
        {scoringConfig.format === 'competitive' && scoringConfig.scoringType === 'rounds' && (
          'Competitive format: First to win majority of rounds'
        )}
        {scoringConfig.format === 'casual' && (
          'Casual format: More relaxed scoring rules'
        )}
      </Text>
    </Stack>
  );
}