description: SDD - revisa la spec como QA (clarificación) y valida la implementación RF por RF, sin modificar nada
mode: subagent
permissions:
- action: edit
resource: "*"
effect: deny
- action: shell
resource: "*"
effect: ask
- action: shell
resource: "node --test*"
effect: allow
- action: shell
resource: "git diff*"
effect: allow
- action: shell
resource: "git status*"
effect: allow
- action: webfetch
resource: "*"
effect: deny
- action: subagent
resource: "*"
effect: deny
8