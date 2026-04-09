#!/usr/bin/env bash
# tests/fixtures/fake-pi.sh
# Emits a deterministic sequence of JSON events, mimicking `pi --mode json`.

echo '{"type":"tool_execution_start","toolName":"grep","args":{"pattern":"foo"}}'
sleep 0.02
echo '{"type":"tool_execution_end"}'
sleep 0.02
cat <<'JSON'
{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"Found 2 matches."}],"usage":{"input":100,"output":20,"cacheRead":0,"cacheWrite":0,"cost":{"total":0.0005},"totalTokens":120,"inputTokens":100,"outputTokens":20}}}
JSON
exit 0
