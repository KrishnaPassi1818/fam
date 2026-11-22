import React from 'react';
import { Box, Text } from 'ink';

export interface MessageViewProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  isStreaming?: boolean;
}

export const MessageView: React.FC<MessageViewProps> = ({
  role,
  content,
  model,
  isStreaming,
}) => {
  if (role === 'user') {
    return (
      <Box flexDirection="column" marginY={1}>
        <Box>
          <Text color="blue" bold>User &gt; </Text>
          <Text color="white">{content}</Text>
        </Box>
      </Box>
    );
  }

  if (role === 'system') {
    return (
      <Box marginY={1} paddingLeft={1}>
        <Text color="yellow">ℹ System: {content}</Text>
      </Box>
    );
  }

  // Assistant
  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text color="green" bold>hx {model ? `(${model}) ` : ''}&gt; </Text>
        <Text color="white">
          {content}
          {isStreaming && <Text color="green">▌</Text>}
        </Text>
      </Box>
    </Box>
  );
};
