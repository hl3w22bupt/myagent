---
name: web-scraper
description: Extract and summarize content from web pages
tags:
  - web
  - scraper
  - http
  - tools
type: hybrid
metadata:
  openclaw:
    requires:
      bins: [curl]
      env: []
      config: []
    install: []
---

# Web Scraper Skill

Fetches and summarizes content from web pages using curl.

## Features

- Fetch web page content
- Extract text and links
- Summarize page content
- Handle HTTP errors gracefully

## Usage

Provide a URL and optionally specify what to extract:
- "Fetch https://example.com and summarize it"
- "Get the main content from https://www.example.com"
- "Extract all links from https://example.com"

## Notes

- Requires internet connectivity
- Follows redirects automatically
- Respects robots.txt
