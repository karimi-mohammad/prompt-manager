---
title: Code Reviewer
description: Review source code for bugs, security issues, and performance problems
category: coding
tags:
  - coding
  - review
  - security
favorite: true
created: 2026-08-23T10:00:00.000Z
updated: 2026-08-23T10:00:00.000Z
variables:
  - name: language
    type: text
    default: JavaScript
    required: true
  - name: focus
    type: text
    default: bugs and security vulnerabilities
  - name: code
    type: textarea
    required: true
---

Review the following {language} code.

Focus specifically on {focus}.

## Code

{code}

Provide actionable suggestions for improvement.
