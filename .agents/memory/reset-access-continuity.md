---
name: Reset access continuity
description: Why clearing prototype workflow data does not revoke its test-session access capability.
---

Treat reset as clearing the current session's workflow, not as creating a new session or revoking its private resume capability.

**Why:** A tester may have kept the resume code separately. Reset should restore the same test workspace and prepared examples without making that code unexpectedly unusable. Starting a separate session is already a distinct operation.

**How to apply:** Changes to reset, resume or capability handling should preserve access continuity across a confirmed workflow reset and must leave other sessions untouched. This is a prototype test-workspace rule, not a specification for deleting institutional accounts.