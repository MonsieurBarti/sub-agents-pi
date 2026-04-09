#!/usr/bin/env bash
# tests/fixtures/fake-pi-interleaved.sh
# Emits two interleaved tool calls: A starts, B starts, B ends, A ends.
# Each tool_execution_end carries its own result payload so the executor
# must match by toolCallId rather than assume strict start→end pairing.

echo '{"type":"tool_execution_start","toolCallId":"call_A","toolName":"grep","args":{"pattern":"foo"}}'
sleep 0.01
echo '{"type":"tool_execution_start","toolCallId":"call_B","toolName":"read","args":{"file_path":"x.ts"}}'
sleep 0.01
echo '{"type":"tool_execution_end","toolCallId":"call_B","toolName":"read","result":{"content":"<file B>"},"isError":false}'
sleep 0.01
echo '{"type":"tool_execution_end","toolCallId":"call_A","toolName":"grep","result":{"matches":["a","b","c"]},"isError":false}'
sleep 0.01
cat <<'JSON'
{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"Done."}],"usage":{"input":50,"output":10,"cacheRead":0,"cacheWrite":0,"cost":{"total":0.0001},"totalTokens":60,"inputTokens":50,"outputTokens":10}}}
JSON
exit 0
