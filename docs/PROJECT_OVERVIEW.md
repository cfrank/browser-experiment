# Browser experiment

## Overview

The goal of this project is to experiment with what deep integration of agentic LLMs with both a browser and a host OS would look like.

To do this we will be creating both a orchestrator and a chrome browser extension which will journey along with a user as they browse the web.

## Ambitions

The ambitions of the project are to allow users to customize the web as they see fit. If they don't like the way a website is behaving they should have full
and persistent control over those behaviors and modify them so they are no longer annoying.

Example:
- You are spending too much time doom scrolling `x.com` - you should be able to open up the extension sidebar and tell it to block the website. The agent will have
  full access to all chromium based tooling along with access to the host pages context. It can choose how it wants to block the page, and can persist scripts / styles
  or other settings to disk assocated with the domain.

- You're filling out your banking details but the website has blocked you from pasting your routing number into the form. You should be able to defer to the agent to do this.
  Are you using this website a lot? The agent should be able to monkey patch the logic which is preventing paste and persist this to disk thus "fixing" this logic for all
  subsequent visits to the page.

- You're unable to navigate a webpage using your keyboard when you want to? Have the agent script up some logic to make this possible, persist the modifications along with the
  desired behavior to disk. Subsequent visits should retain this functionality. Did the website update? Have the agent explore the current version of the website, it's previous
  code, the desired behavior and fix it's logic. Quickly you're back up and running.

At the end of the day this is an experiment to give the agent complete control over your computer and browser so the limits are only in the agents and the human drivers
imagination and creativity.

## Tech stack

I want to know the best way to accomplish the following, you as the agent should plan the best way to implement this:

- All the code should live in the same repo.
- There should be a chrome extension which has the following properties:
  - It uses the sidebar API to show a list of threads which are applicable to the current website the user is visiting.
  - It has a chat input which allows me (the driver) to interact with the locally running agentic LLM.
  - It has the ability to communicate bidirectionally with the orchestrator running locally on disk.
  - It has the ability to take screenshots, record network and console logs, inject scripts into the page (like injecting a console log into page to read the result), write it's
    own scripts and hijack the pages loading of it's own scripts with the local version of those scripts.
  - It exposes this functionality as an API which can be invoked by the orchestrator through a psuedo `browser` CLI which the extension parses to determine which logic to invoke.
  - It should have sleak and clean interface which integrates with the theme of the browser. It should feel as native as possible with the existing browser chrome.
- There should be a locally running orchestrator which has the following properties:
  - It runs N number of LLM sessions against the Claude SDK.
  - It should support tool use
    - Host will primarily expose `bash`, `read_file`, `write_file`, `edit_file` (basically your traditional agentic tools)
    - Host will bridge between the local os and the browser through a psuedo `browser` bash tool which is implemented by the orchestrator and passes the provided arguments to
      the browser extension which implements the relevant logic.
    - The system prompt will cover the usage of all these tools and any additional functionality can be described within the skills themselves using these core tools.
    - System reminders and workspace `pwd` will provide the agent their current working directory and environment.
  - It should be able to communicate bidirectionally with the browser extension.
  - Based on the website the user is visiting it should load SKILL files. You get progressively more specialized skills based on how specific the URL is. For example given the
    the following skills:
      - google.com/my_skill/SKILL.md
      - google.com/my_other_skill/SKILL.md
      - finance.google.com/my_skill/SKILL.md
      - beta.finance.google.com/my_skilk/SKILL.md
    if the user was present on beta.finance.google.com they would get that specific skill file along with my_other_skill since that also matches.
  - Similarly each web site should have persistent storage which is accessible by the agent as a "workspace" where it can store scripts, configuration, styles etc which it
    generates. The skills can specify how it should use this storage.

## Task

Devise a plan on how best to implment this and let's get working!
