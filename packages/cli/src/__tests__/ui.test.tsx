import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { StatusBar } from '../ui/components/StatusBar.js';
import { MessageView } from '../ui/components/MessageView.js';
import { ToolCallView } from '../ui/components/ToolCallView.js';

describe('CLI UI Components', () => {
  describe('StatusBar', () => {
    it('renders model, context, tier, and local badge', () => {
      const { lastFrame } = render(
        <StatusBar
          model="llama3.1:8b"
          usedTokens={2400}
          maxCtx={8192}
          tier="medium"
          isLocal={true}
          cwd="/home/user/project"
          tokensPerSec={35.5}
        />,
      );

      const frame = lastFrame();
      expect(frame).toContain('llama3.1:8b');
      expect(frame).toContain('ctx 2.4k/8k');
      expect(frame).toContain('medium');
      expect(frame).toContain('35.5 tok/s');
      expect(frame).toContain('LOCAL');
      expect(frame).toContain('/home/user/project');
    });

    it('renders cloud badge when isLocal is false', () => {
      const { lastFrame } = render(
        <StatusBar
          model="gemini-2.5-flash"
          usedTokens={1200}
          maxCtx={1000000}
          tier="full"
          isLocal={false}
          cwd="/tmp"
        />,
      );

      const frame = lastFrame();
      expect(frame).toContain('gemini-2.5-flash');
      expect(frame).toContain('CLOUD');
    });
  });

  describe('MessageView', () => {
    it('renders user message', () => {
      const { lastFrame } = render(
        <MessageView role="user" content="How do I build hx?" />,
      );

      const frame = lastFrame();
      expect(frame).toContain('User >');
      expect(frame).toContain('How do I build hx?');
    });

    it('renders assistant message with streaming cursor', () => {
      const { lastFrame } = render(
        <MessageView
          role="assistant"
          content="Here is the plan"
          model="llama3.1:8b"
          isStreaming={true}
        />,
      );

      const frame = lastFrame();
      expect(frame).toContain('hx (llama3.1:8b) >');
      expect(frame).toContain('Here is the plan');
      expect(frame).toContain('▌');
    });

    it('renders system notification message', () => {
      const { lastFrame } = render(
        <MessageView role="system" content="Switched model to qwen2.5-coder:7b" />,
      );

      const frame = lastFrame();
      expect(frame).toContain('ℹ System: Switched model to qwen2.5-coder:7b');
    });
  });

  describe('ToolCallView', () => {
    it('renders running tool call', () => {
      const { lastFrame } = render(
        <ToolCallView
          name="echo"
          args={{ message: 'test' }}
          status="running"
        />,
      );

      const frame = lastFrame();
      expect(frame).toContain('echo');
      expect(frame).toContain('message="test"');
    });

    it('renders completed tool call with result and duration', () => {
      const { lastFrame } = render(
        <ToolCallView
          name="current_time"
          args={{}}
          status="completed"
          result="2026-11-22T14:00:00Z"
          durationMs={45}
        />,
      );

      const frame = lastFrame();
      expect(frame).toContain('⚙');
      expect(frame).toContain('current_time');
      expect(frame).toContain('2026-11-22T14:00:00Z');
      expect(frame).toContain('45ms');
    });

    it('renders error tool call', () => {
      const { lastFrame } = render(
        <ToolCallView
          name="bad_tool"
          args={{ foo: 'bar' }}
          status="error"
          result="Tool not found"
        />,
      );

      const frame = lastFrame();
      expect(frame).toContain('✖');
      expect(frame).toContain('bad_tool');
      expect(frame).toContain('Tool not found');
    });
  });
});
