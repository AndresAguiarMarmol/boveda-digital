---
description: SDD - implementa UNA tarea de un plan aprobado, con tests primero
mode: subagent
permissions:
- action: shell
resource: "*"
effect: allow
- action: webfetch
resource: "*"
7
None
effect: deny
- action: subagent
resource: "*"
effect: deny