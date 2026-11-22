import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ToolTier } from '@hx/shared';

export type ApprovalDecision = 'allow_once' | 'allow_session' | 'deny' | 'edit_args';

export interface ApprovalModalProps {
  toolName: string;
  args: Record<string, unknown>;
  tier: ToolTier;
  reason?: string;
  onDecision: (decision: ApprovalDecision, editedArgs?: Record<string, unknown>) => void;
}

export const ApprovalModal: React.FC<ApprovalModalProps> = ({
  toolName,
  args,
  tier,
  reason,
  onDecision,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [typedConfirm, setTypedConfirm] = useState('');
  const isTier4 = tier === 4;

  useInput((input, key) => {
    if (isTier4) {
      const hasReturn = key.return || input.includes('\r') || input.includes('\n');
      if (hasReturn) {
        const cleanInput = input.replace(/[\r\n]/g, '');
        const fullConfirm = (typedConfirm + cleanInput).trim();
        if (fullConfirm === 'CONFIRM') {
          onDecision('allow_once');
        } else {
          onDecision('deny');
        }
        return;
      }
      if (key.escape) {
        onDecision('deny');
        return;
      }
      if (key.backspace || key.delete) {
        setTypedConfirm((prev) => prev.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setTypedConfirm((prev) => prev + input);
      }
      return;
    }

    // Normal tiers (1, 2, 3)
    const lower = input.toLowerCase();
    if (lower === 'y') {
      onDecision('allow_once');
    } else if (lower === 'a') {
      onDecision('allow_session');
    } else if (lower === 'n' || key.escape) {
      onDecision('deny');
    } else if (lower === 'e') {
      onDecision('edit_args');
    } else if (input === '?') {
      setShowDetails((prev) => !prev);
    }
  });

  const tierColors: Record<ToolTier, string> = {
    0: 'cyan',
    1: 'green',
    2: 'yellow',
    3: 'magenta',
    4: 'red',
  };

  const tierLabels: Record<ToolTier, string> = {
    0: 'Tier 0 (Read-Only)',
    1: 'Tier 1 (Workspace Write)',
    2: 'Tier 2 (External Write / Overwrite)',
    3: 'Tier 3 (Shell / Process / Network)',
    4: 'Tier 4 (Destructive / Irreversible)',
  };

  // Preview extraction
  const previewPath = args['path'] || args['file'] || args['target'];
  const previewCmd = args['command'] || args['cmd'];
  const previewDiff = args['diff'] || args['content'] || args['replacement'];

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={tierColors[tier] || 'yellow'}
      paddingX={1}
      paddingY={1}
      marginY={1}
    >
      <Box gap={1}>
        <Text bold color="white">
          PERMISSION REQUIRED:
        </Text>
        <Text bold color={tierColors[tier] || 'yellow'}>
          {tierLabels[tier] || `Tier ${tier}`}
        </Text>
      </Box>

      <Box marginTop={1} gap={1}>
        <Text color="gray">Tool:</Text>
        <Text bold color="cyan">
          {toolName}
        </Text>
      </Box>

      {reason && (
        <Box gap={1}>
          <Text color="gray">Reason:</Text>
          <Text color="yellow">{reason}</Text>
        </Box>
      )}

      {/* Target previews */}
      {Boolean(previewPath) && (
        <Box gap={1}>
          <Text color="gray">Target Path:</Text>
          <Text color="white">{String(previewPath)}</Text>
        </Box>
      )}

      {Boolean(previewCmd) && (
        <Box gap={1}>
          <Text color="gray">Command:</Text>
          <Text color="yellow" bold>
            {String(previewCmd)}
          </Text>
        </Box>
      )}

      {Boolean(previewDiff) && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">Content / Diff Preview:</Text>
          <Box paddingLeft={2}>
            <Text color="dim">
              {String(previewDiff).length > 200
                ? String(previewDiff).substring(0, 197) + '...'
                : String(previewDiff)}
            </Text>
          </Box>
        </Box>
      )}

      {showDetails && (
        <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
          <Text bold color="gray">
            Full Arguments JSON:
          </Text>
          <Text color="dim">{JSON.stringify(args, null, 2)}</Text>
        </Box>
      )}

      {/* Actions and keys */}
      <Box marginTop={1} flexDirection="column">
        {isTier4 ? (
          <Box flexDirection="column">
            <Text color="red" bold>
              DANGER: This action is destructive and irreversible.
            </Text>
            <Text color="white">
              Type <Text bold color="yellow">CONFIRM</Text> and press Enter to proceed, or Esc to cancel:
            </Text>
            <Box marginTop={1}>
              <Text color="cyan">&gt; {typedConfirm}</Text>
              <Text color="gray">_</Text>
            </Box>
          </Box>
        ) : (
          <Box gap={1}>
            <Text color="gray">Keys:</Text>
            <Text bold color="green">
              [y]
            </Text>
            <Text>allow once</Text>
            <Text color="gray">·</Text>
            <Text bold color="blue">
              [a]
            </Text>
            <Text>always for session</Text>
            <Text color="gray">·</Text>
            <Text bold color="red">
              [n]
            </Text>
            <Text>deny</Text>
            <Text color="gray">·</Text>
            <Text bold color="yellow">
              [e]
            </Text>
            <Text>edit</Text>
            <Text color="gray">·</Text>
            <Text bold color="magenta">
              [?]
            </Text>
            <Text>details</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
