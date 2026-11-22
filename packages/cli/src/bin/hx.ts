#!/usr/bin/env node
import { Command } from 'commander';
import { VERSION } from '@hx/shared';

const program = new Command();
program
  .name('hx')
  .description('hx: local-first CLI AI agent harness')
  .version(VERSION);

program.parse(process.argv);
