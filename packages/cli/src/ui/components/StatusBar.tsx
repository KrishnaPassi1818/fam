import React from 'react';
import { Box, Text } from 'ink';

export interface StatusBarProps {
  model: string;
  usedTokens: number;
  maxCtx: number;
  tier: string;
  isLocal: boolean;
  cwd: string;
  tokensPerSec?: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  model,
  usedTokens,
  maxCtx,
  tier,
  isLocal,
  cwd,
  tokensPerSec,
}) => {
  const formattedCtx = `${(usedTokens / 1000).toFixed(1)}k/${(maxCtx / 1000).toFixed(0)}k`;
  const locationBadge = isLocal ? 'LOCAL' : 'CLOUD';
  const locationColor = isLocal ? 'green' : 'magenta';

  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      justifyContent="space-between"
      width="100%"
    >
      <Box gap={1}>
        <Text color="cyan" bold>{model}</Text>
        <Text color="gray">·</Text>
        <Text color="yellow">ctx {formattedCtx}</Text>
        <Text color="gray">·</Text>
        <Text color="blue">{tier}</Text>
        {tokensPerSec !== undefined && tokensPerSec > 0 && (
          <>
            <Text color="gray">·</Text>
            <Text color="green">{tokensPerSec.toFixed(1)} tok/s</Text>
          </>
        )}
        <Text color="gray">·</Text>
        <Text color={locationColor} bold>{locationBadge}</Text>
      </Box>
      <Box>
        <Text color="dim">{cwd}</Text>
      </Box>
    </Box>
  );
};
