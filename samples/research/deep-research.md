---
title: Deep Research
description: In-depth research on a specific topic with structured output
category: research
tags:
  - research
  - analysis
favorite: true
created: 2026-08-23T10:00:00.000Z
updated: 2026-08-23T10:00:00.000Z
variables:
  - name: topic
    type: text
    required: true
  - name: depth
    type: select
    options:
      - Brief overview
      - Detailed analysis
      - Comprehensive deep dive
    default: Detailed analysis
---

Research the topic: {topic}

Provide a {depth} covering:

## Key Concepts
- Core definitions and principles

## Current State
- Recent developments and trends

## Analysis
- Strengths and weaknesses
- Opportunities and challenges

## Conclusion
- Key takeaways and recommendations
