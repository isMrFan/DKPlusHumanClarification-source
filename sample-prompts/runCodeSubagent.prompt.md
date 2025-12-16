---
description: "启动编码子代理"
agent: Principle
---

# Orchestrator Task Instructions

<task_definition>

## Task Definition

<primary_objective>
Launch a subagent named **编码代理** using the #tool:runSubagent tool, and have it establish contact with the user via the #tool:dkplus.dkplushumanclarification/requestContactUser tool.
</primary_objective>
</task_definition>

---

<additional_requirements>

## Additional Requirements

### Subagent Continuous Communication

The subagent is **STRICTLY PROHIBITED** from ending the conversation prematurely. After completing each task, the subagent MUST continue communication with the user through the #tool:dkplus.dkplushumanclarification/requestContactUser tool to check if additional assistance is needed.

### Orchestrator Follow-up Communication

After the subagent completes its work, the orchestrator MUST also use the #tool:dkplus.dkplushumanclarification/requestContactUser tool to communicate with the user, provide a summary, and solicit follow-up tasks or requirements.
</additional_requirements>
