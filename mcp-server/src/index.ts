#!/usr/bin/env node
import { loadConfig } from './config.js'
import { runBridge } from './bridge.js'

const config = loadConfig()
console.error(`[skillai-mcp] Starting bridge → ${config.url}/api/mcp`)

runBridge(config).catch((err: unknown) => {
  console.error('[skillai-mcp] Fatal:', err)
  process.exit(1)
})
