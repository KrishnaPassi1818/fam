import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

export interface ToolCallViewProps {
  name: string;
  args: Record<string, unknown>;
  status: 'running' | 'completed' | 'error';
  result?: string;
  durationMs?: number;
}

export const ToolCallView: React.FC<ToolCallViewProps> = ({
  name,
  args,
  status,
  result,
  durationMs,
}) => {
  const argsSummary = Object.entries(args)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(', ');

  const shortResult = result
    ? result.length > 80
      ? result.substring(0, 77) + '...'
      : result
    : '';

  return (
    <Box paddingLeft={2} gap={1}>
      {status === 'running' ? (
        <Text color="yellow">
          <Spinner type="dots" />
        </Text>
      ) : status === 'error' ? (
        <Text color="red">✖</Text>
      ) : (
        <Text color="green">⚙</Text>
      )}

      <Text color="cyan">{name}</Text>
      <Text color="gray">({argsSummary})</Text>

      {status === 'completed' && shortResult && (
        <Text color="dim">→ {shortResult}</Text>
      )}
      {status === 'error' && shortResult && (
        <Text color="red">→ {shortResult}</Text>
      )}

      {durationMs !== undefined && (
        <Text color="dim">({durationMs}ms)</Text>
      )}
    </Box>
  );
};
