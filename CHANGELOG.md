# Changelog

## [0.2.2](https://github.com/MonsieurBarti/sub-agents-pi/compare/sub-agents-pi-v0.2.1...sub-agents-pi-v0.2.2) (2026-04-11)


### Bug Fixes

* add exports field for nodenext module resolution ([c4d2a82](https://github.com/MonsieurBarti/sub-agents-pi/commit/c4d2a820fbb28f3cccc69ddb8d994d3406f8d8ec))
* add exports field for nodenext module resolution ([0d587e8](https://github.com/MonsieurBarti/sub-agents-pi/commit/0d587e896d86b3fcc720d323ac0881b94fa852e1))

## [0.2.1](https://github.com/MonsieurBarti/sub-agents-pi/compare/sub-agents-pi-v0.2.0...sub-agents-pi-v0.2.1) (2026-04-11)


### Features

* add module-level singleton and getSharedState() to index ([8beabda](https://github.com/MonsieurBarti/sub-agents-pi/commit/8beabdae5bdc504b18385f6b88d06dfa551a8ea6))
* add spawn() function for programmatic sub-agent execution ([b680380](https://github.com/MonsieurBarti/sub-agents-pi/commit/b680380bebb3707b5e76cd2386a8d04143a043d3))
* add spawn() public export for programmatic sub-agent execution ([6d513cf](https://github.com/MonsieurBarti/sub-agents-pi/commit/6d513cffb3e36637d251f02942ffa1dcd056f45f))
* export spawn, SpawnResult, and SubagentParamsT from package entry ([41fa3e9](https://github.com/MonsieurBarti/sub-agents-pi/commit/41fa3e9737a7ba33a5fcbfc3b24b092d034fc456))

## [0.2.0](https://github.com/MonsieurBarti/sub-agents-pi/compare/sub-agents-pi-v0.1.0...sub-agents-pi-v0.2.0) (2026-04-09)


### ⚠ BREAKING CHANGES

* the LLM-facing tool id changed from "subagent" to "tff-subagent". Any saved prompts or skills that hardcode the old name must be updated.

### Features

* add ANSI-aware render primitives ported from nicobailon/pi-subagents ([aab3697](https://github.com/MonsieurBarti/sub-agents-pi/commit/aab3697775fca04f240a6d9f7db816ed5b1926c8))
* add bottom widget for sub-agent counter ([172a493](https://github.com/MonsieurBarti/sub-agents-pi/commit/172a49388712d7f597edfb4644d223869568485a))
* add core type definitions ([d56d6ff](https://github.com/MonsieurBarti/sub-agents-pi/commit/d56d6ff6db5835609d27eb75dbb1ef8ccd47fc7a))
* add executor orchestration layer ([d389d88](https://github.com/MonsieurBarti/sub-agents-pi/commit/d389d8833a69727a4e26e2c08d7041fe5e5a6bb2))
* add extension registration and lifecycle hooks ([68576d5](https://github.com/MonsieurBarti/sub-agents-pi/commit/68576d521d3f5071b065fe09c71c96478d9309f6))
* add JobPool for shared sub-agent state ([db3c2e4](https://github.com/MonsieurBarti/sub-agents-pi/commit/db3c2e47d2a5115f29667cbd3f1b6f68e34d0791))
* add overlay panel for interactive sub-agent spying ([fd85382](https://github.com/MonsieurBarti/sub-agents-pi/commit/fd853826223a73b0831cf3d66c5e930f32c38372))
* add pi-args builder for child process argv ([ebe6a13](https://github.com/MonsieurBarti/sub-agents-pi/commit/ebe6a13a1907b12255c031c00611c5a09d554540))
* add pi-spawn primitive for child process streaming ([10447d7](https://github.com/MonsieurBarti/sub-agents-pi/commit/10447d75590b9c5eb7b7de40464d08623e69387b))
* add pure formatter functions ([77d09cc](https://github.com/MonsieurBarti/sub-agents-pi/commit/77d09ccb358554ec736cd0f2154e1392bc962f8e))
* add scrollback tool row rendering ([8c7158c](https://github.com/MonsieurBarti/sub-agents-pi/commit/8c7158ca34ea62c917f7e049d3b516ca0781f7ba))
* concurrency, ANSI-aware panel rewrite, kill confirmation ([3f9203e](https://github.com/MonsieurBarti/sub-agents-pi/commit/3f9203ee4fea2f030a7d34189d90490af1215e7f))
* depth guard, duplicate-id protection, widget dedupe, doc sync ([65a22b5](https://github.com/MonsieurBarti/sub-agents-pi/commit/65a22b5991a1e9afbbbfafd8a3021fd6b6883707))
* disable nested sub-agents entirely ([6494187](https://github.com/MonsieurBarti/sub-agents-pi/commit/649418766289031ae4c29bce11f8190c55eb7bac))
* sub-agents PI extension with live TUI spying ([2a862f4](https://github.com/MonsieurBarti/sub-agents-pi/commit/2a862f40af3fe2537e352d6a24c241dd415c9fcc))


### Bug Fixes

* plumb tui.requestRender through SubagentPanel for live updates ([a417722](https://github.com/MonsieurBarti/sub-agents-pi/commit/a4177226294b5ff7e4d64761cc5e1a95ef3ac51f))
* process lifecycle and resource safety ([5dad8f6](https://github.com/MonsieurBarti/sub-agents-pi/commit/5dad8f6ff84cdedf3dc872ab9308e20fdb361ea5))
* reclaim overlay focus after kill-confirmation dialog dismisses ([8cc5364](https://github.com/MonsieurBarti/sub-agents-pi/commit/8cc53647974f831814da93533d2706f61e13502a))
* resolve TypeScript type errors and update tests ([dc08c5e](https://github.com/MonsieurBarti/sub-agents-pi/commit/dc08c5ec997c7c1474f028febf1bf96cc4eb8d17))
* switch panel shortcut from alt+s to ctrl+shift+s ([fcd35f0](https://github.com/MonsieurBarti/sub-agents-pi/commit/fcd35f029d9f9a7784bf3e64cb6f1b37b8f94ef1))
* unblock CI and replace phantom tool_result_end handler ([e331c39](https://github.com/MonsieurBarti/sub-agents-pi/commit/e331c39ead148374e090b9c351d11c82efa54c8e))


### Code Refactoring

* namespace tool id as tff-subagent to avoid package collisions ([2d528e8](https://github.com/MonsieurBarti/sub-agents-pi/commit/2d528e8441ee79b9c3e9f19f573158fa3553ed4a))
